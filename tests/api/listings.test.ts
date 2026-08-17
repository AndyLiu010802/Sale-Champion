import { describe, it, expect, beforeEach } from 'vitest';
import { freshDb, seedBasics, type Basics } from '../helpers/db';
import { jsonRequest, authedRequest } from '../helpers/request';
import { getHub } from '@/lib/ws/hub';
import type { ServerEvent } from '@/lib/ws/protocol';
import { GET, POST } from '@/app/api/listings/route';
import { PATCH, DELETE } from '@/app/api/listings/[id]/route';

let basics: Basics;
let events: ServerEvent[];

beforeEach(async () => {
  const db = await freshDb();
  basics = await seedBasics(db);
  events = [];
  getHub().register(
    'screen-test',
    { send: (data: string) => events.push(JSON.parse(data) as ServerEvent), close: () => {} },
    true,
  );
});

const listingBody = () => ({
  agentId: basics.agentId,
  address: '7 Harbour St',
  listPriceCents: 120000000,
  listedDate: '2026-08-10',
});

describe('POST /api/listings', () => {
  it('requires admin session', async () => {
    const res = await POST(jsonRequest('/api/listings', { method: 'POST', body: listingBody() }));
    expect(res.status).toBe(401);
  });

  it('creates a listing (default status active) and broadcasts data.updated listings', async () => {
    const res = await POST(await authedRequest('/api/listings', { method: 'POST', body: listingBody() }));
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.address).toBe('7 Harbour St');
    expect(data.status).toBe('active');
    expect(events).toEqual([{ type: 'data.updated', domain: 'listings' }]);
  });

  it('rejects an unknown agentId with 400 Unknown agent', async () => {
    const res = await POST(
      await authedRequest('/api/listings', {
        method: 'POST',
        body: { ...listingBody(), agentId: 'ghost' },
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Unknown agent' });
    expect(events).toEqual([]);
  });
});

describe('GET /api/listings', () => {
  it('lists listings with agentName', async () => {
    await POST(await authedRequest('/api/listings', { method: 'POST', body: listingBody() }));
    const res = await GET(await authedRequest('/api/listings'));
    const { data } = await res.json();
    expect(data).toHaveLength(1);
    expect(data[0].agentName).toBe('Alice Ng');
  });
});

describe('PATCH /api/listings/[id]', () => {
  it('updates status to sold and broadcasts', async () => {
    const created = await (
      await POST(await authedRequest('/api/listings', { method: 'POST', body: listingBody() }))
    ).json();
    events.length = 0;

    const res = await PATCH(
      await authedRequest(`/api/listings/${created.data.id}`, {
        method: 'PATCH',
        body: { status: 'sold' },
      }),
      { params: Promise.resolve({ id: created.data.id }) },
    );
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.status).toBe('sold');
    expect(events).toEqual([{ type: 'data.updated', domain: 'listings' }]);
  });

  it('rejects an invalid status enum value with 400', async () => {
    const created = await (
      await POST(await authedRequest('/api/listings', { method: 'POST', body: listingBody() }))
    ).json();
    events.length = 0;

    const res = await PATCH(
      await authedRequest(`/api/listings/${created.data.id}`, {
        method: 'PATCH',
        body: { status: 'archived' },
      }),
      { params: Promise.resolve({ id: created.data.id }) },
    );
    expect(res.status).toBe(400);
    expect(events).toEqual([]);
  });

  it('returns 404 for an unknown id', async () => {
    const res = await PATCH(
      await authedRequest('/api/listings/ghost', { method: 'PATCH', body: { status: 'sold' } }),
      { params: Promise.resolve({ id: 'ghost' }) },
    );
    expect(res.status).toBe(404);
    expect(events).toEqual([]);
  });
});

describe('DELETE /api/listings/[id]', () => {
  it('hard-deletes and broadcasts', async () => {
    const created = await (
      await POST(await authedRequest('/api/listings', { method: 'POST', body: listingBody() }))
    ).json();
    events.length = 0;

    const res = await DELETE(
      await authedRequest(`/api/listings/${created.data.id}`, { method: 'DELETE' }),
      { params: Promise.resolve({ id: created.data.id }) },
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { id: created.data.id } });

    const list = await (await GET(await authedRequest('/api/listings'))).json();
    expect(list.data).toHaveLength(0);
    expect(events).toEqual([{ type: 'data.updated', domain: 'listings' }]);
  });
});
