import { describe, it, expect, beforeEach } from 'vitest';
import { freshDb, seedBasics, type Basics } from '../helpers/db';
import { jsonRequest, authedRequest } from '../helpers/request';
import { getHub } from '@/lib/ws/hub';
import type { ServerEvent } from '@/lib/ws/protocol';
import { DEFAULT_SETTINGS } from '@/lib/settings';
import { GET, POST } from '@/app/api/sales/route';
import { PATCH, DELETE } from '@/app/api/sales/[id]/route';
import { POST as REPLAY } from '@/app/api/sales/[id]/replay/route';
import { POST as AGENTS_POST } from '@/app/api/agents/route';
import { DELETE as AGENTS_DELETE } from '@/app/api/agents/[id]/route';
import { buildCelebrationPayload } from '@/lib/domain/celebration';

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

const saleBody = () => ({
  agentId: basics.agentId,
  address: '12 Ocean View Dr',
  salePriceCents: 85000000,
  gciCents: 2100000,
  saleDate: '2026-08-15',
});

describe('POST /api/sales', () => {
  it('requires admin session', async () => {
    const res = await POST(jsonRequest('/api/sales', { method: 'POST', body: saleBody() }));
    expect(res.status).toBe(401);
  });

  it('creates a sale then broadcasts celebration.play followed by data.updated sales', async () => {
    const res = await POST(await authedRequest('/api/sales', { method: 'POST', body: saleBody() }));
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.address).toBe('12 Ocean View Dr');
    expect(data.salePriceCents).toBe(85000000);

    expect(events).toHaveLength(2);
    const first = events[0];
    if (first.type !== 'celebration.play') throw new Error('expected celebration.play first');
    const c = first.celebration;
    expect(c.saleId).toBe(data.id);
    expect(c.agentName).toBe('Alice Ng');
    expect(c.agentPhotoUrl).toBeNull();
    expect(c.address).toBe('12 Ocean View Dr');
    expect(c.salePriceCents).toBe(85000000);
    // Alice has no anthem of her own — server must fall back to settings.defaultAnthemUrl
    expect(c.anthemUrl).toBe(DEFAULT_SETTINGS.defaultAnthemUrl);
    expect(c.anthemUrl).toBe('builtin:victory');
    expect(c.durationSec).toBe(18);
    expect(events[1]).toEqual({ type: 'data.updated', domain: 'sales' });
  });

  it('rejects negative amounts with 400', async () => {
    const res = await POST(
      await authedRequest('/api/sales', {
        method: 'POST',
        body: { ...saleBody(), salePriceCents: -5 },
      }),
    );
    expect(res.status).toBe(400);
    expect(events).toEqual([]);
  });

  it('rejects an unknown agentId with 400 Unknown agent', async () => {
    const res = await POST(
      await authedRequest('/api/sales', {
        method: 'POST',
        body: { ...saleBody(), agentId: 'ghost' },
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Unknown agent' });
    expect(events).toEqual([]);
  });

  it('rejects sales for inactive agents', async () => {
    const delRes = await AGENTS_DELETE(
      await authedRequest(`/api/agents/${basics.agentId}`, { method: 'DELETE' }),
      { params: Promise.resolve({ id: basics.agentId }) },
    );
    expect(delRes.status).toBe(200);
    events.length = 0;

    const res = await POST(await authedRequest('/api/sales', { method: 'POST', body: saleBody() }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Unknown agent' });
    expect(events).toEqual([]);
  });
});

describe('GET /api/sales', () => {
  it('lists sales with agentName', async () => {
    await POST(await authedRequest('/api/sales', { method: 'POST', body: saleBody() }));
    const res = await GET(await authedRequest('/api/sales'));
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data).toHaveLength(1);
    expect(data[0].agentName).toBe('Alice Ng');
  });
});

describe('PATCH /api/sales/[id]', () => {
  it('updates, refreshes updatedAt, and does NOT broadcast a celebration', async () => {
    const created = await (
      await POST(await authedRequest('/api/sales', { method: 'POST', body: saleBody() }))
    ).json();
    events.length = 0;
    await new Promise((r) => setTimeout(r, 10)); // ensure updatedAt strictly increases

    const res = await PATCH(
      await authedRequest(`/api/sales/${created.data.id}`, {
        method: 'PATCH',
        body: { address: '99 Sunset Blvd' },
      }),
      { params: Promise.resolve({ id: created.data.id }) },
    );
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.address).toBe('99 Sunset Blvd');
    expect(new Date(data.updatedAt).getTime()).toBeGreaterThan(
      new Date(created.data.updatedAt).getTime(),
    );
    expect(events).toEqual([{ type: 'data.updated', domain: 'sales' }]);
  });

  it('returns 404 for an unknown id', async () => {
    const res = await PATCH(
      await authedRequest('/api/sales/ghost', { method: 'PATCH', body: { address: 'X' } }),
      { params: Promise.resolve({ id: 'ghost' }) },
    );
    expect(res.status).toBe(404);
    expect(events).toEqual([]);
  });
});

describe('POST /api/sales/[id]/replay', () => {
  it('re-broadcasts celebration.play for an existing sale', async () => {
    const created = await (
      await POST(await authedRequest('/api/sales', { method: 'POST', body: saleBody() }))
    ).json();
    events.length = 0;

    const res = await REPLAY(
      await authedRequest(`/api/sales/${created.data.id}/replay`, { method: 'POST' }),
      { params: Promise.resolve({ id: created.data.id }) },
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { ok: true } });

    expect(events).toHaveLength(1);
    const first = events[0];
    if (first.type !== 'celebration.play') throw new Error('expected celebration.play');
    expect(first.celebration.saleId).toBe(created.data.id);
    expect(first.celebration.agentName).toBe('Alice Ng');
    expect(first.celebration.durationSec).toBe(18);
  });

  it('returns 404 when the sale does not exist', async () => {
    const res = await REPLAY(
      await authedRequest('/api/sales/ghost/replay', { method: 'POST' }),
      { params: Promise.resolve({ id: 'ghost' }) },
    );
    expect(res.status).toBe(404);
    expect(events).toEqual([]);
  });

  it('replay uses the current agent after a PATCH reassignment', async () => {
    const created = await (
      await POST(await authedRequest('/api/sales', { method: 'POST', body: saleBody() }))
    ).json();

    const agentBRes = await AGENTS_POST(
      await authedRequest('/api/agents', {
        method: 'POST',
        body: { name: 'Bob Tran', anthemUrl: 'builtin:hero' },
      }),
    );
    expect(agentBRes.status).toBe(200);
    const { data: agentB } = await agentBRes.json();

    const patchRes = await PATCH(
      await authedRequest(`/api/sales/${created.data.id}`, {
        method: 'PATCH',
        body: { agentId: agentB.id },
      }),
      { params: Promise.resolve({ id: created.data.id }) },
    );
    expect(patchRes.status).toBe(200);

    events.length = 0;
    const res = await REPLAY(
      await authedRequest(`/api/sales/${created.data.id}/replay`, { method: 'POST' }),
      { params: Promise.resolve({ id: created.data.id }) },
    );
    expect(res.status).toBe(200);

    expect(events).toHaveLength(1);
    const first = events[0];
    if (first.type !== 'celebration.play') throw new Error('expected celebration.play');
    expect(first.celebration.agentName).toBe('Bob Tran');
    expect(first.celebration.anthemUrl).toBe('builtin:hero');
  });
});

describe('DELETE /api/sales/[id]', () => {
  it('hard-deletes and broadcasts data.updated sales', async () => {
    const created = await (
      await POST(await authedRequest('/api/sales', { method: 'POST', body: saleBody() }))
    ).json();
    events.length = 0;

    const res = await DELETE(
      await authedRequest(`/api/sales/${created.data.id}`, { method: 'DELETE' }),
      { params: Promise.resolve({ id: created.data.id }) },
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { id: created.data.id } });

    const list = await (await GET(await authedRequest('/api/sales'))).json();
    expect(list.data).toHaveLength(0);
    expect(events).toEqual([{ type: 'data.updated', domain: 'sales' }]);
  });
});

describe('buildCelebrationPayload', () => {
  it('empty-string anthem falls back to the default', () => {
    const celebration = buildCelebrationPayload(
      { id: 'sale-1', address: '1 Main St', salePriceCents: 100 },
      { name: 'Alice Ng', photoUrl: null, anthemUrl: '' },
      DEFAULT_SETTINGS,
    );
    expect(celebration.anthemUrl).toBe(DEFAULT_SETTINGS.defaultAnthemUrl);
  });
});
