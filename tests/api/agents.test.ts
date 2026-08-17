import { describe, it, expect, beforeEach } from 'vitest';
import { freshDb, seedBasics, type Basics } from '../helpers/db';
import { jsonRequest, authedRequest } from '../helpers/request';
import { getHub } from '@/lib/ws/hub';
import type { ServerEvent } from '@/lib/ws/protocol';
import { GET, POST } from '@/app/api/agents/route';
import { PATCH, DELETE } from '@/app/api/agents/[id]/route';
import { POST as BIRTHDAY_BROADCAST } from '@/app/api/agents/[id]/birthday-broadcast/route';

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

  it('partial PATCH leaves other nullable fields untouched', async () => {
    const created = await POST(
      await authedRequest('/api/agents', {
        method: 'POST',
        body: { name: 'Dana Lee', photoUrl: 'https://example.com/dana.jpg', anthemUrl: 'builtin:hero' },
      }),
    );
    const { data: agent } = await created.json();

    const res = await PATCH(
      await authedRequest(`/api/agents/${agent.id}`, { method: 'PATCH', body: { name: 'Dana L.' } }),
      { params: Promise.resolve({ id: agent.id }) },
    );
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.name).toBe('Dana L.');
    expect(data.photoUrl).toBe('https://example.com/dana.jpg');
    expect(data.anthemUrl).toBe('builtin:hero');
  });

  it('explicit null clears a previously-set nullable field', async () => {
    const created = await POST(
      await authedRequest('/api/agents', {
        method: 'POST',
        body: { name: 'Eli Park', photoUrl: 'https://example.com/eli.jpg', anthemUrl: 'builtin:hero' },
      }),
    );
    const { data: agent } = await created.json();

    const res = await PATCH(
      await authedRequest(`/api/agents/${agent.id}`, { method: 'PATCH', body: { photoUrl: null } }),
      { params: Promise.resolve({ id: agent.id }) },
    );
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.photoUrl).toBeNull();
    expect(data.anthemUrl).toBe('builtin:hero');
  });

  it('empty-body PATCH returns 200 without broadcasting', async () => {
    const res = await PATCH(
      await authedRequest(`/api/agents/${basics.agentId}`, { method: 'PATCH', body: {} }),
      { params: Promise.resolve({ id: basics.agentId }) },
    );
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.id).toBe(basics.agentId);
    expect(data.name).toBe('Alice Ng');
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

describe('role & birthday', () => {
  it('creates a staff member with a birthday and returns both fields', async () => {
    const res = await POST(
      await authedRequest('/api/agents', {
        method: 'POST',
        body: { name: 'Fay Ops', role: 'staff', birthday: '08-18' },
      }),
    );
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.role).toBe('staff');
    expect(data.birthday).toBe('08-18');
  });

  it('defaults role to agent and birthday to null', async () => {
    const res = await POST(
      await authedRequest('/api/agents', { method: 'POST', body: { name: 'Gil Doe' } }),
    );
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.role).toBe('agent');
    expect(data.birthday).toBeNull();
  });

  it('rejects invalid birthday formats with 400', async () => {
    for (const birthday of ['8-18', '13-01', '00-10', '01-32', '0818']) {
      const res = await POST(
        await authedRequest('/api/agents', {
          method: 'POST',
          body: { name: 'Bad Birthday', birthday },
        }),
      );
      expect(res.status).toBe(400);
    }
    expect(events).toEqual([]);
  });

  it('rejects an invalid role with 400', async () => {
    const res = await POST(
      await authedRequest('/api/agents', {
        method: 'POST',
        body: { name: 'Bad Role', role: 'manager' },
      }),
    );
    expect(res.status).toBe(400);
    expect(events).toEqual([]);
  });

  it('accepts 02-31 (regex-level validation only, by design)', async () => {
    const res = await POST(
      await authedRequest('/api/agents', {
        method: 'POST',
        body: { name: 'Loose Day', birthday: '02-31' },
      }),
    );
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.birthday).toBe('02-31');
  });

  it('PATCH updates role and birthday, and null clears birthday', async () => {
    const patched = await PATCH(
      await authedRequest(`/api/agents/${basics.agentId}`, {
        method: 'PATCH',
        body: { role: 'staff', birthday: '12-31' },
      }),
      { params: Promise.resolve({ id: basics.agentId }) },
    );
    expect(patched.status).toBe(200);
    const { data } = await patched.json();
    expect(data.role).toBe('staff');
    expect(data.birthday).toBe('12-31');

    const cleared = await PATCH(
      await authedRequest(`/api/agents/${basics.agentId}`, {
        method: 'PATCH',
        body: { birthday: null },
      }),
      { params: Promise.resolve({ id: basics.agentId }) },
    );
    expect(cleared.status).toBe(200);
    const { data: after } = await cleared.json();
    expect(after.birthday).toBeNull();
    expect(after.role).toBe('staff');
  });

  it('PATCH rejects an invalid birthday with 400', async () => {
    const res = await PATCH(
      await authedRequest(`/api/agents/${basics.agentId}`, {
        method: 'PATCH',
        body: { birthday: '2-3' },
      }),
      { params: Promise.resolve({ id: basics.agentId }) },
    );
    expect(res.status).toBe(400);
    expect(events).toEqual([]);
  });
});

describe('POST /api/agents/[id]/birthday-broadcast', () => {
  it('requires admin session', async () => {
    const res = await BIRTHDAY_BROADCAST(
      jsonRequest(`/api/agents/${basics.agentId}/birthday-broadcast`, { method: 'POST' }),
      { params: Promise.resolve({ id: basics.agentId }) },
    );
    expect(res.status).toBe(401);
    expect(events).toEqual([]);
  });

  it('broadcasts a birthday celebration payload for an agent', async () => {
    const res = await BIRTHDAY_BROADCAST(
      await authedRequest(`/api/agents/${basics.agentId}/birthday-broadcast`, { method: 'POST' }),
      { params: Promise.resolve({ id: basics.agentId }) },
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { ok: true } });
    expect(events).toEqual([
      {
        type: 'celebration.play',
        celebration: {
          kind: 'birthday',
          agentId: basics.agentId,
          name: 'Alice Ng',
          photoUrl: null,
          durationSec: 18,
        },
      },
    ]);
  });

  it('broadcasts for staff members too, regardless of birthday value', async () => {
    const created = await POST(
      await authedRequest('/api/agents', {
        method: 'POST',
        body: { name: 'Sam Staff', role: 'staff', photoUrl: 'https://example.com/sam.jpg' },
      }),
    );
    const { data: staff } = await created.json();
    events.length = 0;

    const res = await BIRTHDAY_BROADCAST(
      await authedRequest(`/api/agents/${staff.id}/birthday-broadcast`, { method: 'POST' }),
      { params: Promise.resolve({ id: staff.id }) },
    );
    expect(res.status).toBe(200);
    expect(events).toHaveLength(1);
    const first = events[0];
    if (first.type !== 'celebration.play') throw new Error('expected celebration.play');
    if (first.celebration.kind !== 'birthday') throw new Error('expected birthday celebration');
    expect(first.celebration.agentId).toBe(staff.id);
    expect(first.celebration.name).toBe('Sam Staff');
    expect(first.celebration.photoUrl).toBe('https://example.com/sam.jpg');
    expect(first.celebration.durationSec).toBe(18);
  });

  it('returns 404 for an unknown id', async () => {
    const res = await BIRTHDAY_BROADCAST(
      await authedRequest('/api/agents/ghost/birthday-broadcast', { method: 'POST' }),
      { params: Promise.resolve({ id: 'ghost' }) },
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Not found' });
    expect(events).toEqual([]);
  });

  it('returns 404 for an inactive member', async () => {
    const del = await DELETE(
      await authedRequest(`/api/agents/${basics.agentId}`, { method: 'DELETE' }),
      { params: Promise.resolve({ id: basics.agentId }) },
    );
    expect(del.status).toBe(200);
    events.length = 0;

    const res = await BIRTHDAY_BROADCAST(
      await authedRequest(`/api/agents/${basics.agentId}/birthday-broadcast`, { method: 'POST' }),
      { params: Promise.resolve({ id: basics.agentId }) },
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Not found' });
    expect(events).toEqual([]);
  });
});
