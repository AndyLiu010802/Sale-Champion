import { describe, it, expect, beforeEach } from 'vitest';
import { freshDb, seedBasics, type Basics } from '../helpers/db';
import { jsonRequest, authedRequest } from '../helpers/request';
import { getHub } from '@/lib/ws/hub';
import type { ServerEvent } from '@/lib/ws/protocol';
import { GET, POST } from '@/app/api/appraisals/route';
import { DELETE } from '@/app/api/appraisals/[id]/route';
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

const appraisalBody = () => ({ agentId: basics.agentId, date: '2026-08-15', count: 3 });

describe('POST /api/appraisals', () => {
  it('requires admin session', async () => {
    const res = await POST(jsonRequest('/api/appraisals', { method: 'POST', body: appraisalBody() }));
    expect(res.status).toBe(401);
    expect(events).toEqual([]);
  });

  it('creates an appraisal entry and broadcasts data.updated appraisals', async () => {
    const res = await POST(
      await authedRequest('/api/appraisals', { method: 'POST', body: appraisalBody() }),
    );
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.agentId).toBe(basics.agentId);
    expect(data.date).toBe('2026-08-15');
    expect(data.count).toBe(3);
    expect(events).toEqual([{ type: 'data.updated', domain: 'appraisals' }]);
  });

  it('rejects a malformed date with 400', async () => {
    const res = await POST(
      await authedRequest('/api/appraisals', {
        method: 'POST',
        body: { ...appraisalBody(), date: '15/08/2026' },
      }),
    );
    expect(res.status).toBe(400);
    expect(events).toEqual([]);
  });

  it('rejects out-of-range counts with 400', async () => {
    for (const count of [0, -1, 2.5, 1000]) {
      const res = await POST(
        await authedRequest('/api/appraisals', { method: 'POST', body: { ...appraisalBody(), count } }),
      );
      expect(res.status).toBe(400);
    }
    expect(events).toEqual([]);
  });

  it('rejects an unknown agentId with 400 Unknown agent', async () => {
    const res = await POST(
      await authedRequest('/api/appraisals', {
        method: 'POST',
        body: { ...appraisalBody(), agentId: 'ghost' },
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Unknown agent' });
    expect(events).toEqual([]);
  });

  it('rejects staff members with 400 Unknown agent', async () => {
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
      await authedRequest('/api/appraisals', {
        method: 'POST',
        body: { ...appraisalBody(), agentId: staff.id },
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Unknown agent' });
    expect(events).toEqual([]);
  });

  it('rejects inactive agents with 400 Unknown agent', async () => {
    const delRes = await AGENTS_DELETE(
      await authedRequest(`/api/agents/${basics.agentId}`, { method: 'DELETE' }),
      { params: Promise.resolve({ id: basics.agentId }) },
    );
    expect(delRes.status).toBe(200);
    events.length = 0;

    const res = await POST(
      await authedRequest('/api/appraisals', { method: 'POST', body: appraisalBody() }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Unknown agent' });
    expect(events).toEqual([]);
  });
});

describe('GET /api/appraisals', () => {
  it('lists appraisals with agentName, newest date first', async () => {
    await POST(await authedRequest('/api/appraisals', {
      method: 'POST', body: { agentId: basics.agentId, date: '2026-08-10', count: 1 },
    }));
    await POST(await authedRequest('/api/appraisals', {
      method: 'POST', body: { agentId: basics.agentId, date: '2026-08-14', count: 2 },
    }));
    const res = await GET(await authedRequest('/api/appraisals'));
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.map((r: { date: string }) => r.date)).toEqual(['2026-08-14', '2026-08-10']);
    expect(data[0].agentName).toBe('Alice Ng');
    expect(data[0].count).toBe(2);
  });
});

describe('DELETE /api/appraisals/[id]', () => {
  it('deletes and broadcasts data.updated appraisals', async () => {
    const created = await (
      await POST(await authedRequest('/api/appraisals', { method: 'POST', body: appraisalBody() }))
    ).json();
    events.length = 0;

    const res = await DELETE(
      await authedRequest(`/api/appraisals/${created.data.id}`, { method: 'DELETE' }),
      { params: Promise.resolve({ id: created.data.id }) },
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { id: created.data.id } });

    const list = await (await GET(await authedRequest('/api/appraisals'))).json();
    expect(list.data).toHaveLength(0);
    expect(events).toEqual([{ type: 'data.updated', domain: 'appraisals' }]);
  });

  it('returns 404 for an unknown id', async () => {
    const res = await DELETE(
      await authedRequest('/api/appraisals/ghost', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'ghost' }) },
    );
    expect(res.status).toBe(404);
    expect(events).toEqual([]);
  });
});
