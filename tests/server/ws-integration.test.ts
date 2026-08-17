import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import WebSocket from 'ws';
import { eq } from 'drizzle-orm';
import { freshDb, seedBasics, type Basics } from '../helpers/db';
import { authedRequest } from '../helpers/request';
import type { Db } from '@/lib/db';
import { screens } from '@/lib/db/schema';
import { getHub } from '@/lib/ws/hub';
import { generateDeviceToken, hashToken, pairCodeExpiry } from '@/lib/domain/pairing';
import { startServer } from '@/server/bootstrap';
import { POST as pairPost } from '@/app/api/screens/pair/route';

let db: Db;
let basics: Basics;
let server: Server;
let port: number;

function connect(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

/** Start collecting parsed JSON messages from a socket. */
function collectMessages(ws: WebSocket): any[] {
  const messages: any[] = [];
  ws.on('message', (raw) => messages.push(JSON.parse(raw.toString())));
  return messages;
}

async function waitFor(cond: () => boolean, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!cond()) {
    if (Date.now() > deadline) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, 25));
  }
}

beforeAll(async () => {
  db = await freshDb();
  basics = await seedBasics(db);
  server = await startServer(0, { withNext: false }); // port 0 → random free port
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
});

describe('ws integration (real server, real sockets)', () => {
  it('scenario 1: pending hello then admin pair pushes paired event to the socket', async () => {
    const screenId = crypto.randomUUID();
    await db.insert(screens).values({
      id: screenId,
      orgId: basics.orgId,
      pairCode: 'ABC234',
      pairCodeExpiresAt: pairCodeExpiry(new Date()),
      status: 'pending',
    });

    const ws = await connect();
    const messages = collectMessages(ws);
    ws.send(JSON.stringify({ type: 'hello', screenId, pairCode: 'ABC234' }));
    await waitFor(() => getHub().isOnline(screenId));

    const res = await pairPost(await authedRequest('/api/screens/pair', {
      method: 'POST',
      body: { pairCode: 'abc234', name: 'Reception TV' },
    }));
    expect(res.status).toBe(200);

    await waitFor(() => messages.some((m) => m.type === 'paired'));
    const paired = messages.find((m) => m.type === 'paired');
    expect(paired.screen).toEqual({ id: screenId, name: 'Reception TV' });
    const row = (await db.select().from(screens).where(eq(screens.id, screenId)))[0]!;
    expect(hashToken(paired.deviceToken)).toBe(row.deviceTokenHash);
    ws.close();
  });

  it('scenario 2: paired reconnect via deviceToken receives broadcasts', async () => {
    const token = generateDeviceToken();
    const screenId = crypto.randomUUID();
    await db.insert(screens).values({
      id: screenId,
      orgId: basics.orgId,
      name: 'Kitchen TV',
      deviceTokenHash: hashToken(token),
      status: 'paired',
    });

    const ws = await connect();
    const messages = collectMessages(ws);
    ws.send(JSON.stringify({ type: 'hello', deviceToken: token }));
    await waitFor(() => getHub().isOnline(screenId));

    getHub().broadcast({ type: 'config.updated' });
    await waitFor(() => messages.some((m) => m.type === 'config.updated'));
    ws.close();
  });

  it('scenario 3: invalid token gets screen.unpaired then the connection closes', async () => {
    const ws = await connect();
    const messages = collectMessages(ws);
    const closed = new Promise<void>((resolve) => ws.on('close', () => resolve()));
    ws.send(JSON.stringify({ type: 'hello', deviceToken: 'not-a-real-token' }));
    await closed;
    expect(messages.some((m) => m.type === 'screen.unpaired')).toBe(true);
  });

  it('malformed frames are ignored and ping gets pong', async () => {
    const token = generateDeviceToken();
    const screenId = crypto.randomUUID();
    await db.insert(screens).values({
      id: screenId,
      orgId: basics.orgId,
      name: 'Bar TV',
      deviceTokenHash: hashToken(token),
      status: 'paired',
    });

    const ws = await connect();
    const messages = collectMessages(ws);
    ws.send('this is not json'); // must be silently ignored
    ws.send(JSON.stringify({ type: 'hello', deviceToken: token }));
    await waitFor(() => getHub().isOnline(screenId));

    ws.send(JSON.stringify({ type: 'ping' }));
    await waitFor(() => messages.some((m) => m.type === 'pong'));
    ws.close();
  });
});
