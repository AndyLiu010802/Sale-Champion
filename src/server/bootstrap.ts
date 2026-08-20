import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import http from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type WebSocket } from 'ws';
import { and, asc, eq } from 'drizzle-orm';
import { assertSchemaAtHead, getDb, type Db } from '@/lib/db';
import { getOrgId } from '@/lib/db/org';
import { agents, orgs, screens } from '@/lib/db/schema';
import { getHub, type Hub } from '@/lib/ws/hub';
import { clientEventSchema, type ClientEvent } from '@/lib/ws/protocol';
import { hashToken, isPairCodeExpired } from '@/lib/domain/pairing';
import { isElevenAm, localMmdd, localYmd } from '@/lib/domain/birthday';
import { getSettings } from '@/lib/settings';
import { buildBirthdayPayload } from '@/lib/domain/celebration';

// Env-dependent code below reads process.env lazily (inside functions), so the
// hoisted imports above finishing before loadEnvConfig runs is safe.

const HELLO_TIMEOUT_MS = 5000;

/**
 * One scheduler tick, exported for direct testing. At 11:00 local time
 * (deployment TZ), broadcasts a birthday celebration for every active member
 * (agent or staff) whose birthday (MM-DD) is today — at most once per day.
 * The dedupe mark is written to orgs BEFORE broadcasting: if the process
 * dies in between we lose one broadcast rather than ever replaying it,
 * and a restart within the same minute stays idempotent.
 */
export async function runBirthdayTick(db: Db, hub: Hub, now: Date): Promise<void> {
  if (!isElevenAm(now)) return;
  const today = localYmd(now);
  const orgId = await getOrgId(db);
  const [org] = await db.select().from(orgs).where(eq(orgs.id, orgId));
  if (!org || org.lastBirthdayBroadcastDate === today) return;

  const celebrants = await db
    .select()
    .from(agents)
    .where(and(
      eq(agents.orgId, orgId),
      eq(agents.active, true),
      eq(agents.birthday, localMmdd(now)),
    ))
    .orderBy(asc(agents.name));
  if (celebrants.length === 0) return; // no celebrants → leave the mark unset

  await db.update(orgs)
    .set({ lastBirthdayBroadcastDate: today })
    .where(eq(orgs.id, orgId));

  const settings = await getSettings(db, orgId);
  for (const member of celebrants) {
    hub.broadcast({
      type: 'celebration.play',
      celebration: buildBirthdayPayload(
        { id: member.id, name: member.name, photoUrl: member.photoUrl },
        settings,
      ),
    });
  }
}

export async function startServer(
  port: number,
  opts: { withNext?: boolean } = {},
): Promise<http.Server> {
  const withNext = opts.withNext ?? true;
  const db = await getDb();     // 只连库:迁移已移出启动路径(见 src/lib/db/index.ts)
  await assertSchemaAtHead(db); // schema 落后于代码就拒绝监听,不做"绿的但坏的"服务
  const hub = getHub();

  let nextHandle:
    | ((req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>)
    | null = null;
  let nextUpgrade:
    | ((req: http.IncomingMessage, socket: Duplex, head: Buffer) => Promise<void>)
    | null = null;

  if (withNext) {
    const { default: next } = await import('next');
    const app = next({ dev: process.env.NODE_ENV !== 'production' });
    await app.prepare();
    nextHandle = app.getRequestHandler();
    nextUpgrade = app.getUpgradeHandler();
  }

  const server = http.createServer((req, res) => {
    if (nextHandle) {
      void nextHandle(req, res);
    } else {
      res.statusCode = 404;
      res.end('Not found');
    }
  });

  const wss = new WebSocketServer({ noServer: true });

  wss.on('connection', (ws: WebSocket) => {
    let screenId: string | null = null;
    let registered = false;
    let lastSeenWrite = 0;
    const helloTimer = setTimeout(() => ws.close(), HELLO_TIMEOUT_MS);

    const handleHello = async (event: Extract<ClientEvent, { type: 'hello' }>) => {
      // One-shot: once a hello has successfully registered this connection,
      // any further hello closes it instead of racing a second registration.
      if (registered) {
        ws.close();
        return;
      }

      if (event.deviceToken) {
        const rows = await db.select().from(screens)
          .where(and(
            eq(screens.deviceTokenHash, hashToken(event.deviceToken)),
            eq(screens.status, 'paired'),
          ))
          .limit(1);
        const row = rows[0];
        if (!row) {
          try { ws.send(JSON.stringify({ type: 'screen.unpaired' })); } catch { /* ignore */ }
          ws.close();
          return;
        }
        screenId = row.id;
        hub.register(row.id, ws, true);
        registered = true;
        clearTimeout(helloTimer);
        await db.update(screens).set({ lastSeenAt: new Date() })
          .where(eq(screens.id, row.id));
        return;
      }

      if (event.screenId && event.pairCode) {
        const rows = await db.select().from(screens)
          .where(eq(screens.id, event.screenId)).limit(1);
        const row = rows[0];
        if (
          !row ||
          row.status !== 'pending' ||
          !row.pairCode ||
          !row.pairCodeExpiresAt ||
          row.pairCode !== event.pairCode.toUpperCase() ||
          isPairCodeExpired(row.pairCodeExpiresAt, new Date())
        ) {
          ws.close();
          return;
        }
        screenId = row.id;
        hub.register(row.id, ws, false);
        registered = true;
        clearTimeout(helloTimer);
        return;
      }

      ws.close();
    };

    ws.on('message', (raw) => {
      let json: unknown;
      try {
        json = JSON.parse(raw.toString());
      } catch {
        return; // ignore malformed frames
      }
      const parsed = clientEventSchema.safeParse(json);
      if (!parsed.success) return;
      const event = parsed.data;

      if (event.type === 'hello') {
        void handleHello(event);
      } else if (event.type === 'ping') {
        try { ws.send(JSON.stringify({ type: 'pong' })); } catch { /* ignore */ }
        if (screenId) {
          const now = Date.now();
          if (now - lastSeenWrite > 10_000) {
            lastSeenWrite = now;
            const id = screenId;
            // fire-and-forget, throttled heartbeat persistence
            db.update(screens).set({ lastSeenAt: new Date() })
              .where(eq(screens.id, id))
              .then(() => undefined, () => undefined);
          }
        }
      }
    });

    ws.on('close', () => {
      clearTimeout(helloTimer);
      hub.unregister(ws);
    });
  });

  server.on('upgrade', (req, socket, head) => {
    const { pathname } = new URL(req.url ?? '/', 'http://localhost');
    if (pathname === '/ws') {
      wss.handleUpgrade(req, socket, head, (client) => {
        wss.emit('connection', client, req);
      });
    } else if (nextUpgrade) {
      void nextUpgrade(req, socket, head); // dev HMR websocket
    } else {
      socket.destroy();
    }
  });

  const birthdayTimer = setInterval(() => {
    runBirthdayTick(db, getHub(), new Date()).catch((err) => console.error('[birthday] tick failed:', err));
  }, 60_000);
  server.on('close', () => clearInterval(birthdayTimer));

  // listen 失败必须 reject,否则 server.ts 的 catch 接不到,Node 会把它当未捕获异常,
  // 一个"端口被占"打出三段栈,真正有用的那一行淹没在里面(实遇 2026-08-20)。
  await new Promise<void>((resolve, reject) => {
    server.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        reject(new Error(
          `[boot] port ${port} is already in use — another dev server is probably still running.\n`
          + `      Windows:  netstat -ano | findstr :${port}   then  taskkill /PID <pid> /T /F\n`
          + `      or start this one elsewhere:  PORT=${port + 1} npm run dev`,
          { cause: err },
        ));
        return;
      }
      reject(err);
    });
    server.listen(port, resolve);
  });
  return server;
}
