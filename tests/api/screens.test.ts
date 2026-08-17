import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { freshDb, seedBasics, type Basics } from '../helpers/db';
import { authedRequest, jsonRequest } from '../helpers/request';
import type { Db } from '@/lib/db';
import { screens } from '@/lib/db/schema';
import { getHub, type HubSocket } from '@/lib/ws/hub';
import { PAIR_CODE_ALPHABET, hashToken } from '@/lib/domain/pairing';
import { POST as registerPost } from '@/app/api/tv/register/route';
import { GET as screensGet } from '@/app/api/screens/route';
import { POST as pairPost } from '@/app/api/screens/pair/route';
import { DELETE as screenDelete, PATCH as screenPatch } from '@/app/api/screens/[id]/route';

type FakeSocket = HubSocket & { sent: string[]; closed: boolean };

function fakeSocket(): FakeSocket {
  const s: FakeSocket = {
    sent: [],
    closed: false,
    send(data: string) { s.sent.push(data); },
    close() { s.closed = true; },
  };
  return s;
}

function eventsOf(s: FakeSocket): any[] {
  return s.sent.map((m) => JSON.parse(m));
}

describe('screens & tv register API', () => {
  let db: Db;
  let basics: Basics;

  beforeEach(async () => {
    db = await freshDb();
    basics = await seedBasics(db);
  });

  it('POST /api/tv/register creates a pending screen with a 6-char uppercase code', async () => {
    const res = await registerPost();
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.pairCode).toHaveLength(6);
    for (const ch of data.pairCode as string) {
      expect(PAIR_CODE_ALPHABET).toContain(ch);
    }
    expect(new Date(data.expiresAt).getTime()).toBeGreaterThan(Date.now());
    const rows = await db.select().from(screens).where(eq(screens.id, data.screenId));
    expect(rows[0]?.status).toBe('pending');
    expect(rows[0]?.pairCode).toBe(data.pairCode);
    expect(rows[0]?.pairCode).toBe(String(data.pairCode).toUpperCase());
  });

  it('POST /api/tv/register purges expired pending rows', async () => {
    const staleId = crypto.randomUUID();
    await db.insert(screens).values({
      id: staleId,
      orgId: basics.orgId,
      pairCode: 'AAAAAA',
      pairCodeExpiresAt: new Date(Date.now() - 60_000),
      status: 'pending',
    });
    const res = await registerPost();
    expect(res.status).toBe(200);
    const stale = await db.select().from(screens).where(eq(screens.id, staleId));
    expect(stale).toHaveLength(0);
  });

  it('POST /api/screens/pair accepts a lowercase code and pushes paired event with the raw token', async () => {
    const reg = await (await registerPost()).json();
    const screenId = reg.data.screenId as string;
    const code = reg.data.pairCode as string;

    const sock = fakeSocket();
    getHub().register(screenId, sock, false); // TV is connected, still pending

    const res = await pairPost(await authedRequest('/api/screens/pair', {
      method: 'POST',
      body: { pairCode: code.toLowerCase(), name: 'Lobby TV' },
    }));
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data).toEqual({ id: screenId, name: 'Lobby TV' });

    const paired = eventsOf(sock).find((e) => e.type === 'paired');
    expect(paired).toBeDefined();
    expect(paired.screen).toEqual({ id: screenId, name: 'Lobby TV' });
    expect(typeof paired.deviceToken).toBe('string');

    const row = (await db.select().from(screens).where(eq(screens.id, screenId)))[0]!;
    expect(row.status).toBe('paired');
    expect(row.pairCode).toBeNull();
    expect(row.pairCodeExpiresAt).toBeNull();
    expect(row.deviceTokenHash).toBe(hashToken(paired.deviceToken));
  });

  it('pairing an expired code returns 400 Invalid or expired code', async () => {
    const id = crypto.randomUUID();
    await db.insert(screens).values({
      id,
      orgId: basics.orgId,
      pairCode: 'BBBBBB',
      pairCodeExpiresAt: new Date(Date.now() - 1000),
      status: 'pending',
    });
    const res = await pairPost(await authedRequest('/api/screens/pair', {
      method: 'POST',
      body: { pairCode: 'BBBBBB', name: 'X' },
    }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid or expired code');
  });

  it('pairing an unknown code returns 400 Invalid or expired code', async () => {
    const res = await pairPost(await authedRequest('/api/screens/pair', {
      method: 'POST',
      body: { pairCode: 'ZZZZZZ', name: 'X' },
    }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid or expired code');
  });

  it('GET /api/screens reports hub online status', async () => {
    const reg = await (await registerPost()).json();
    const screenId = reg.data.screenId as string;
    getHub().register(screenId, fakeSocket(), false);

    const res = await screensGet(await authedRequest('/api/screens'));
    expect(res.status).toBe(200);
    const { data } = await res.json();
    const row = data.find((s: any) => s.id === screenId);
    expect(row).toMatchObject({ id: screenId, status: 'pending', online: true });
    expect(row).toHaveProperty('name');
    expect(row).toHaveProperty('lastSeenAt');
  });

  it('GET /api/screens without session returns 401', async () => {
    const res = await screensGet(jsonRequest('/api/screens'));
    expect(res.status).toBe(401);
  });

  it('PATCH /api/screens/[id] renames and pushes screen.updated', async () => {
    const id = crypto.randomUUID();
    await db.insert(screens).values({
      id, orgId: basics.orgId, name: 'Old Name',
      deviceTokenHash: hashToken('tok-1'), status: 'paired',
    });
    const sock = fakeSocket();
    getHub().register(id, sock, true);

    const res = await screenPatch(
      await authedRequest(`/api/screens/${id}`, { method: 'PATCH', body: { name: 'Front Desk' } }),
      { params: Promise.resolve({ id }) },
    );
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ id, name: 'Front Desk' });

    const evt = eventsOf(sock).find((e) => e.type === 'screen.updated');
    expect(evt).toBeDefined();
    expect(evt.screen).toEqual({ id, name: 'Front Desk' });
  });

  it('DELETE /api/screens/[id] deletes the row and pushes screen.unpaired', async () => {
    const id = crypto.randomUUID();
    await db.insert(screens).values({
      id, orgId: basics.orgId, name: 'Doomed TV',
      deviceTokenHash: hashToken('tok-2'), status: 'paired',
    });
    const sock = fakeSocket();
    getHub().register(id, sock, true);

    const res = await screenDelete(
      await authedRequest(`/api/screens/${id}`, { method: 'DELETE' }),
      { params: Promise.resolve({ id }) },
    );
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ id });
    expect(eventsOf(sock).some((e) => e.type === 'screen.unpaired')).toBe(true);
    expect(await db.select().from(screens).where(eq(screens.id, id))).toHaveLength(0);
  });

  it('PATCH /api/screens/[id] with unknown id returns 404', async () => {
    const res = await screenPatch(
      await authedRequest('/api/screens/nope', { method: 'PATCH', body: { name: 'X' } }),
      { params: Promise.resolve({ id: 'nope' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('Not found');
  });

  it('second claim of the same code gets 400', async () => {
    const reg = await (await registerPost()).json();
    const code = reg.data.pairCode as string;

    const first = await pairPost(await authedRequest('/api/screens/pair', {
      method: 'POST',
      body: { pairCode: code, name: 'First Claim' },
    }));
    expect(first.status).toBe(200);

    const second = await pairPost(await authedRequest('/api/screens/pair', {
      method: 'POST',
      body: { pairCode: code, name: 'Second Claim' },
    }));
    expect(second.status).toBe(400);
    expect((await second.json()).error).toBe('Invalid or expired code');
  });

  it('pair, rename and unpair endpoints require auth', async () => {
    const pairRes = await pairPost(jsonRequest('/api/screens/pair', {
      method: 'POST',
      body: { pairCode: 'AAAAAA', name: 'X' },
    }));
    expect(pairRes.status).toBe(401);

    const patchRes = await screenPatch(
      jsonRequest('/api/screens/some-id', { method: 'PATCH', body: { name: 'X' } }),
      { params: Promise.resolve({ id: 'some-id' }) },
    );
    expect(patchRes.status).toBe(401);

    const deleteRes = await screenDelete(
      jsonRequest('/api/screens/some-id', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'some-id' }) },
    );
    expect(deleteRes.status).toBe(401);
  });

  it('expired pending screens are hidden from the list', async () => {
    const expiredId = crypto.randomUUID();
    await db.insert(screens).values({
      id: expiredId,
      orgId: basics.orgId,
      pairCode: 'CCCCCC',
      pairCodeExpiresAt: new Date(Date.now() - 1000),
      status: 'pending',
    });
    const liveId = crypto.randomUUID();
    await db.insert(screens).values({
      id: liveId,
      orgId: basics.orgId,
      pairCode: 'DDDDDD',
      pairCodeExpiresAt: new Date(Date.now() + 60_000),
      status: 'pending',
    });

    const res = await screensGet(await authedRequest('/api/screens'));
    expect(res.status).toBe(200);
    const { data } = await res.json();
    const ids = (data as any[]).map((s) => s.id);
    expect(ids).not.toContain(expiredId);
    expect(ids).toContain(liveId);
  });
});
