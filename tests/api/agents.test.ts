import { describe, it, expect, beforeEach } from 'vitest';
import { freshDb, seedBasics, type Basics } from '../helpers/db';
import { jsonRequest, authedRequest } from '../helpers/request';
import { getHub } from '@/lib/ws/hub';
import type { ServerEvent } from '@/lib/ws/protocol';
import { GET, POST } from '@/app/api/agents/route';
import { PATCH, DELETE } from '@/app/api/agents/[id]/route';

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

describe('auth', () => {
  it('rejects unauthenticated requests with 401', async () => {
    const res = await GET(jsonRequest('/api/agents'));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
  });
});

describe('POST /api/agents', () => {
  it('creates an agent and broadcasts data.updated agents', async () => {
    const res = await POST(
      await authedRequest('/api/agents', {
        method: 'POST',
        body: { name: 'Carol Wu', anthemUrl: 'builtin:champion' },
      }),
    );
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.name).toBe('Carol Wu');
    expect(data.anthemUrl).toBe('builtin:champion');
    expect(data.photoUrl).toBeNull();
    expect(data.active).toBe(true);
    expect(events).toEqual([{ type: 'data.updated', domain: 'agents' }]);
  });

  it('rejects a body without name with 400', async () => {
    const res = await POST(await authedRequest('/api/agents', { method: 'POST', body: {} }));
    expect(res.status).toBe(400);
    expect(events).toEqual([]);
  });
});

describe('GET /api/agents', () => {
  it('lists all agents sorted by name asc', async () => {
    for (const name of ['Zoe Park', 'Bob Tran']) {
      const res = await POST(await authedRequest('/api/agents', { method: 'POST', body: { name } }));
      expect(res.status).toBe(200);
    }
    const res = await GET(await authedRequest('/api/agents'));
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.map((a: { name: string }) => a.name)).toEqual(['Alice Ng', 'Bob Tran', 'Zoe Park']);
  });
});

describe('PATCH /api/agents/[id]', () => {
  it('renames an agent and broadcasts', async () => {
    const res = await PATCH(
      await authedRequest(`/api/agents/${basics.agentId}`, {
        method: 'PATCH',
        body: { name: 'Alice Nguyen' },
      }),
      { params: Promise.resolve({ id: basics.agentId }) },
    );
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.name).toBe('Alice Nguyen');
    expect(events).toEqual([{ type: 'data.updated', domain: 'agents' }]);
  });

  it('can toggle active via PATCH', async () => {
    const res = await PATCH(
      await authedRequest(`/api/agents/${basics.agentId}`, { method: 'PATCH', body: { active: false } }),
      { params: Promise.resolve({ id: basics.agentId }) },
    );
    const { data } = await res.json();
    expect(data.active).toBe(false);
  });

  it('returns 404 for an unknown id and does not broadcast', async () => {
    const res = await PATCH(
      await authedRequest('/api/agents/ghost', { method: 'PATCH', body: { name: 'X' } }),
      { params: Promise.resolve({ id: 'ghost' }) },
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Not found' });
    expect(events).toEqual([]);
  });
});

describe('DELETE /api/agents/[id]', () => {
  it('soft-deletes: row remains with active=false, and broadcasts', async () => {
    const res = await DELETE(
      await authedRequest(`/api/agents/${basics.agentId}`, { method: 'DELETE' }),
      { params: Promise.resolve({ id: basics.agentId }) },
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { id: basics.agentId } });

    const list = await GET(await authedRequest('/api/agents'));
    const { data } = await list.json();
    const alice = data.find((a: { id: string }) => a.id === basics.agentId);
    expect(alice).toBeDefined();
    expect(alice.active).toBe(false);
    expect(events).toEqual([{ type: 'data.updated', domain: 'agents' }]);
  });

  it('returns 404 for an unknown id', async () => {
    const res = await DELETE(
      await authedRequest('/api/agents/ghost', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'ghost' }) },
    );
    expect(res.status).toBe(404);
    expect(events).toEqual([]);
  });
});
