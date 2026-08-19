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
import { PATCH as AGENTS_PATCH } from '@/app/api/agents/[id]/route';
import { buildCelebrationPayload, buildBirthdayPayload } from '@/lib/domain/celebration';

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
    if (c.kind !== 'sale') throw new Error('expected a sale celebration');
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
    const deactivateRes = await AGENTS_PATCH(
      await authedRequest(`/api/agents/${basics.agentId}`, { method: 'PATCH', body: { active: false } }),
      { params: Promise.resolve({ id: basics.agentId }) },
    );
    expect(deactivateRes.status).toBe(200);
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
    expect(data[0].split).toBe(1);
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
    const c = first.celebration;
    if (c.kind !== 'sale') throw new Error('expected a sale celebration');
    expect(c.saleId).toBe(created.data.id);
    expect(c.agentName).toBe('Alice Ng');
    expect(c.durationSec).toBe(18);
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
    const c = first.celebration;
    if (c.kind !== 'sale') throw new Error('expected a sale celebration');
    expect(c.agentName).toBe('Bob Tran');
    expect(c.anthemUrl).toBe('builtin:hero');
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

describe('sales split (设计 §2)', () => {
  it('creates a sale with an explicit fractional split', async () => {
    const res = await POST(
      await authedRequest('/api/sales', { method: 'POST', body: { ...saleBody(), split: 0.8 } }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).data.split).toBe(0.8);
  });

  it('defaults split to 1 when omitted', async () => {
    const res = await POST(await authedRequest('/api/sales', { method: 'POST', body: saleBody() }));
    expect(res.status).toBe(200);
    expect((await res.json()).data.split).toBe(1);
  });

  it('rejects out-of-range splits with 400', async () => {
    for (const split of [0, -0.5, 1.5]) {
      const res = await POST(
        await authedRequest('/api/sales', { method: 'POST', body: { ...saleBody(), split } }),
      );
      expect(res.status).toBe(400);
    }
    expect(events).toEqual([]);
  });

  it('PATCH updates split and broadcasts data.updated sales', async () => {
    const created = await (
      await POST(await authedRequest('/api/sales', { method: 'POST', body: saleBody() }))
    ).json();
    events.length = 0;

    const res = await PATCH(
      await authedRequest(`/api/sales/${created.data.id}`, { method: 'PATCH', body: { split: 0.5 } }),
      { params: Promise.resolve({ id: created.data.id }) },
    );
    expect(res.status).toBe(200);
    expect((await res.json()).data.split).toBe(0.5);
    expect(events).toEqual([{ type: 'data.updated', domain: 'sales' }]);
  });

  it('GET list projection includes the custom split value', async () => {
    await POST(
      await authedRequest('/api/sales', { method: 'POST', body: { ...saleBody(), split: 0.5 } }),
    );
    const res = await GET(await authedRequest('/api/sales'));
    const { data } = await res.json();
    expect(data).toHaveLength(1);
    expect(data[0].split).toBe(0.5);
  });
});

describe('buildCelebrationPayload', () => {
  it('empty-string anthem falls back to the default and carries kind sale', () => {
    const celebration = buildCelebrationPayload(
      { id: 'sale-1', address: '1 Main St', salePriceCents: 100 },
      { name: 'Alice Ng', photoUrl: null, anthemUrl: '' },
      DEFAULT_SETTINGS,
    );
    expect(celebration.kind).toBe('sale');
    expect(celebration.anthemUrl).toBe(DEFAULT_SETTINGS.defaultAnthemUrl);
  });
});

describe('buildBirthdayPayload', () => {
  it('builds a birthday payload with the org celebration duration', () => {
    const payload = buildBirthdayPayload(
      { id: 'agent-1', name: 'Alice Ng', photoUrl: '/files/alice.jpg' },
      DEFAULT_SETTINGS,
    );
    expect(payload).toEqual({
      kind: 'birthday',
      agentId: 'agent-1',
      name: 'Alice Ng',
      photoUrl: '/files/alice.jpg',
      durationSec: 18,
    });
  });

  it('keeps photoUrl null when the member has no photo', () => {
    const payload = buildBirthdayPayload(
      { id: 'agent-2', name: 'Bob Tran', photoUrl: null },
      DEFAULT_SETTINGS,
    );
    expect(payload.kind).toBe('birthday');
    expect(payload.photoUrl).toBeNull();
  });

  it('floors durationSec below the melody length', () => {
    const payload = buildBirthdayPayload(
      { id: 'agent-3', name: 'Carol Diaz', photoUrl: null },
      { ...DEFAULT_SETTINGS, celebrationDurationSec: 10 },
    );
    expect(payload.durationSec).toBe(13);
  });
});

describe('role guard: staff cannot transact', () => {
  it('rejects creating a sale for a staff member with 400 Unknown agent', async () => {
    const staffRes = await AGENTS_POST(
      await authedRequest('/api/agents', {
        method: 'POST',
        body: { name: 'Sam Staff', role: 'staff' },
      }),
    );
    expect(staffRes.status).toBe(200);
    const { data: staff } = await staffRes.json();
    expect(staff.role).toBe('staff');
    events.length = 0;

    const res = await POST(
      await authedRequest('/api/sales', {
        method: 'POST',
        body: { ...saleBody(), agentId: staff.id },
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Unknown agent' });
    expect(events).toEqual([]);
  });

  it('rejects reassigning a sale to a staff member with 400 Unknown agent', async () => {
    const created = await (
      await POST(await authedRequest('/api/sales', { method: 'POST', body: saleBody() }))
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
      await authedRequest(`/api/sales/${created.data.id}`, {
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

// 团队录入资格门(团队设计 §3):active 且(role='team' 或(role='agent' 且未归队))。
describe('team recording eligibility', () => {
  async function makeTeamWithMember(): Promise<{ teamId: string; memberId: string }> {
    const memberRes = await AGENTS_POST(
      await authedRequest('/api/agents', { method: 'POST', body: { name: 'Marnie Hill' } }),
    );
    const { data: member } = await memberRes.json();
    const teamRes = await AGENTS_POST(
      await authedRequest('/api/agents', {
        method: 'POST',
        body: { name: 'Hill & Co', role: 'team', memberIds: [member.id] },
      }),
    );
    const { data: team } = await teamRes.json();
    events.length = 0;
    return { teamId: team.id as string, memberId: member.id as string };
  }

  it('records a sale against a team row', async () => {
    const { teamId } = await makeTeamWithMember();
    const res = await POST(
      await authedRequest('/api/sales', { method: 'POST', body: { ...saleBody(), agentId: teamId } }),
    );
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.agentId).toBe(teamId);
  });

  it('rejects a sale for a member who belongs to a team with 400 Unknown agent', async () => {
    const { memberId } = await makeTeamWithMember();
    const res = await POST(
      await authedRequest('/api/sales', { method: 'POST', body: { ...saleBody(), agentId: memberId } }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Unknown agent' });
    expect(events).toEqual([]);
  });

  it('rejects PATCHing a sale onto a teamed member with 400 Unknown agent', async () => {
    const { memberId } = await makeTeamWithMember();
    const created = await POST(await authedRequest('/api/sales', { method: 'POST', body: saleBody() }));
    const { data: sale } = await created.json();
    events.length = 0;

    const res = await PATCH(
      await authedRequest('/api/sales/' + sale.id, { method: 'PATCH', body: { agentId: memberId } }),
      { params: Promise.resolve({ id: sale.id }) },
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Unknown agent' });
    expect(events).toEqual([]);
  });
});
