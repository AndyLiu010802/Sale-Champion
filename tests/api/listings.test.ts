import { describe, it, expect, beforeEach } from 'vitest';
import { freshDb, seedBasics, type Basics } from '../helpers/db';
import { jsonRequest, authedRequest } from '../helpers/request';
import { getHub } from '@/lib/ws/hub';
import type { ServerEvent } from '@/lib/ws/protocol';
import { GET, POST } from '@/app/api/listings/route';
import { PATCH, DELETE } from '@/app/api/listings/[id]/route';
import { POST as AGENTS_POST } from '@/app/api/agents/route';
import { DELETE as AGENTS_DELETE } from '@/app/api/agents/[id]/route';

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

describe('auth', () => {
  it('all listings endpoints require auth', async () => {
    expect((await GET(jsonRequest('/api/listings'))).status).toBe(401);
    expect(
      (await POST(jsonRequest('/api/listings', { method: 'POST', body: listingBody() }))).status,
    ).toBe(401);
    expect(
      (
        await PATCH(jsonRequest('/api/listings/x', { method: 'PATCH', body: { status: 'sold' } }), {
          params: Promise.resolve({ id: 'x' }),
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await DELETE(jsonRequest('/api/listings/x', { method: 'DELETE' }), {
          params: Promise.resolve({ id: 'x' }),
        })
      ).status,
    ).toBe(401);
  });
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

  it('rejects listings for inactive agents', async () => {
    const delRes = await AGENTS_DELETE(
      await authedRequest(`/api/agents/${basics.agentId}`, { method: 'DELETE' }),
      { params: Promise.resolve({ id: basics.agentId }) },
    );
    expect(delRes.status).toBe(200);
    events.length = 0;

    const res = await POST(await authedRequest('/api/listings', { method: 'POST', body: listingBody() }));
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
    expect(data[0].split).toBe(1);
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

describe('listing split (设计 §7b)', () => {
  it('creates a listing with an explicit fractional split', async () => {
    const res = await POST(
      await authedRequest('/api/listings', { method: 'POST', body: { ...listingBody(), split: 0.66 } }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).data.split).toBe(0.66);
  });

  it('defaults split to 1 when omitted', async () => {
    const res = await POST(await authedRequest('/api/listings', { method: 'POST', body: listingBody() }));
    expect(res.status).toBe(200);
    expect((await res.json()).data.split).toBe(1);
  });

  it('rejects out-of-range splits with 400', async () => {
    for (const split of [0, -0.5, 1.5]) {
      const res = await POST(
        await authedRequest('/api/listings', { method: 'POST', body: { ...listingBody(), split } }),
      );
      expect(res.status).toBe(400);
    }
    expect(events).toEqual([]);
  });

  it('PATCH updates split and broadcasts data.updated listings', async () => {
    const created = await (
      await POST(await authedRequest('/api/listings', { method: 'POST', body: listingBody() }))
    ).json();
    events.length = 0;

    const res = await PATCH(
      await authedRequest(`/api/listings/${created.data.id}`, { method: 'PATCH', body: { split: 0.33 } }),
      { params: Promise.resolve({ id: created.data.id }) },
    );
    expect(res.status).toBe(200);
    expect((await res.json()).data.split).toBe(0.33);
    expect(events).toEqual([{ type: 'data.updated', domain: 'listings' }]);
  });

  it('GET list projection includes the custom split value', async () => {
    await POST(
      await authedRequest('/api/listings', { method: 'POST', body: { ...listingBody(), split: 0.5 } }),
    );
    const res = await GET(await authedRequest('/api/listings'));
    const { data } = await res.json();
    expect(data).toHaveLength(1);
    expect(data[0].split).toBe(0.5);
  });
});

describe('role guard: staff cannot hold listings', () => {
  it('rejects creating a listing for a staff member with 400 Unknown agent', async () => {
    const staffRes = await AGENTS_POST(
      await authedRequest('/api/agents', {
        method: 'POST',
        body: { name: 'Sam Staff', role: 'staff' },
      }),
    );
    expect(staffRes.status).toBe(200);
    const { data: staff } = await staffRes.json();
    events.length = 0;

    const res = await POST(
      await authedRequest('/api/listings', {
        method: 'POST',
        body: { ...listingBody(), agentId: staff.id },
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Unknown agent' });
    expect(events).toEqual([]);
  });

  it('rejects reassigning a listing to a staff member with 400 Unknown agent', async () => {
    const created = await (
      await POST(await authedRequest('/api/listings', { method: 'POST', body: listingBody() }))
    ).json();
    const staffRes = await AGENTS_POST(
      await authedRequest('/api/agents', {
        method: 'POST',
        body: { name: 'Sam Staff', role: 'staff' },
      }),
    );
    const { data: staff } = await staffRes.json();
    events.length = 0;

    const res = await PATCH(
      await authedRequest(`/api/listings/${created.data.id}`, {
        method: 'PATCH',
        body: { agentId: staff.id },
      }),
      { params: Promise.resolve({ id: created.data.id }) },
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Unknown agent' });
    expect(events).toEqual([]);
  });
});
