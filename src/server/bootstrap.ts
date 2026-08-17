import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import http from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type WebSocket } from 'ws';
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { screens } from '@/lib/db/schema';
import { getHub } from '@/lib/ws/hub';
import { clientEventSchema, type ClientEvent } from '@/lib/ws/protocol';
import { hashToken, isPairCodeExpired } from '@/lib/domain/pairing';

// Env-dependent code below reads process.env lazily (inside functions), so the
// hoisted imports above finishing before loadEnvConfig runs is safe.

const HELLO_TIMEOUT_MS = 5000;

export async function startServer(
  port: number,
  opts: { withNext?: boolean } = {},
): Promise<http.Server> {
  const withNext = opts.withNext ?? true;
  const db = await getDb(); // runs migrations on first boot
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
    const helloTimer = setTimeout(() => ws.close(), HELLO_TIMEOUT_MS);

    const handleHello = async (event: Extract<ClientEvent, { type: 'hello' }>) => {
      clearTimeout(helloTimer);

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
          const id = screenId;
          // fire-and-forget heartbeat persistence
          db.update(screens).set({ lastSeenAt: new Date() })
            .where(eq(screens.id, id))
            .then(() => undefined, () => undefined);
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

  await new Promise<void>((resolve) => server.listen(port, resolve));
  return server;
}
