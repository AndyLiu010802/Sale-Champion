import { describe, it, expect, beforeEach } from 'vitest';
import { freshDb, seedBasics } from '../helpers/db';
import { jsonRequest, authedRequest } from '../helpers/request';
import { getHub } from '@/lib/ws/hub';
import type { ServerEvent } from '@/lib/ws/protocol';
import { GET as listAnnouncements, POST as createAnnouncement } from '@/app/api/announcements/route';
import {
  PATCH as patchAnnouncement,
  DELETE as deleteAnnouncement,
} from '@/app/api/announcements/[id]/route';
import { GET as listGoals, POST as createGoal } from '@/app/api/goals/route';
import { PATCH as patchGoal, DELETE as deleteGoal } from '@/app/api/goals/[id]/route';

let events: ServerEvent[];

beforeEach(async () => {
  const db = await freshDb();
  await seedBasics(db);
  events = [];
  getHub().register(
    'screen-test',
    { send: (data: string) => events.push(JSON.parse(data) as ServerEvent), close: () => {} },
    true,
  );
});

describe('auth', () => {
  it('all announcements and goals endpoints require auth', async () => {
    expect((await listAnnouncements(jsonRequest('/api/announcements'))).status).toBe(401);
    expect(
      (
        await createAnnouncement(
          jsonRequest('/api/announcements', { method: 'POST', body: { title: 'x' } }),
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await patchAnnouncement(
          jsonRequest('/api/announcements/x', { method: 'PATCH', body: { enabled: false } }),
          { params: Promise.resolve({ id: 'x' }) },
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await deleteAnnouncement(jsonRequest('/api/announcements/x', { method: 'DELETE' }), {
          params: Promise.resolve({ id: 'x' }),
        })
      ).status,
    ).toBe(401);

    expect((await listGoals(jsonRequest('/api/goals'))).status).toBe(401);
    expect(
      (
        await createGoal(
          jsonRequest('/api/goals', {
            method: 'POST',
            body: { metric: 'gci', targetValue: 1, period: 'month' },
          }),
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await patchGoal(jsonRequest('/api/goals/x', { method: 'PATCH', body: { active: false } }), {
          params: Promise.resolve({ id: 'x' }),
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await deleteGoal(jsonRequest('/api/goals/x', { method: 'DELETE' }), {
          params: Promise.resolve({ id: 'x' }),
        })
      ).status,
    ).toBe(401);
  });
});

describe('announcements', () => {
  it('requires admin session', async () => {
    const res = await listAnnouncements(jsonRequest('/api/announcements'));
    expect(res.status).toBe(401);
  });

  it('creates, broadcasts, and lists sorted by sortOrder asc', async () => {
    const a = await createAnnouncement(
      await authedRequest('/api/announcements', {
        method: 'POST',
        body: { title: 'Later news', sortOrder: 5 },
      }),
    );
    expect(a.status).toBe(200);
    expect(events).toEqual([{ type: 'data.updated', domain: 'announcements' }]);

    await createAnnouncement(
      await authedRequest('/api/announcements', {
        method: 'POST',
        body: { title: 'First news', body: 'Hello team', sortOrder: 1 },
      }),
    );

    const res = await listAnnouncements(await authedRequest('/api/announcements'));
    const { data } = await res.json();
    expect(data.map((x: { title: string }) => x.title)).toEqual(['First news', 'Later news']);
    expect(data[0].body).toBe('Hello team');
    expect(data[0].enabled).toBe(true);
  });

  it('rejects a missing title with 400', async () => {
    const res = await createAnnouncement(
      await authedRequest('/api/announcements', { method: 'POST', body: { sortOrder: 1 } }),
    );
    expect(res.status).toBe(400);
    expect(events).toEqual([]);
  });

  it('PATCH toggles enabled and broadcasts; DELETE removes and broadcasts', async () => {
    const created = await (
      await createAnnouncement(
        await authedRequest('/api/announcements', { method: 'POST', body: { title: 'Toggle me' } }),
      )
    ).json();
    events.length = 0;

    const patched = await patchAnnouncement(
      await authedRequest(`/api/announcements/${created.data.id}`, {
        method: 'PATCH',
        body: { enabled: false },
      }),
      { params: Promise.resolve({ id: created.data.id }) },
    );
    expect(patched.status).toBe(200);
    expect((await patched.json()).data.enabled).toBe(false);
    expect(events).toEqual([{ type: 'data.updated', domain: 'announcements' }]);
    events.length = 0;

    const deleted = await deleteAnnouncement(
      await authedRequest(`/api/announcements/${created.data.id}`, { method: 'DELETE' }),
      { params: Promise.resolve({ id: created.data.id }) },
    );
    expect(deleted.status).toBe(200);
    expect(await deleted.json()).toEqual({ data: { id: created.data.id } });
    const list = await (await listAnnouncements(await authedRequest('/api/announcements'))).json();
    expect(list.data).toHaveLength(0);
    expect(events).toEqual([{ type: 'data.updated', domain: 'announcements' }]);
  });

  it('returns 404 for an unknown announcement id', async () => {
    const res = await patchAnnouncement(
      await authedRequest('/api/announcements/ghost', { method: 'PATCH', body: { enabled: false } }),
      { params: Promise.resolve({ id: 'ghost' }) },
    );
    expect(res.status).toBe(404);
  });
});

describe('goals', () => {
  it('creates a goal and broadcasts data.updated goals', async () => {
    const res = await createGoal(
      await authedRequest('/api/goals', {
        method: 'POST',
        body: { metric: 'gci', targetValue: 500000000, period: 'month' },
      }),
    );
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.metric).toBe('gci');
    expect(data.targetValue).toBe(500000000);
    expect(data.period).toBe('month');
    expect(data.active).toBe(true);
    expect(events).toEqual([{ type: 'data.updated', domain: 'goals' }]);
  });

  it("rejects period 'week' with 400 (goals only allow month|quarter)", async () => {
    const res = await createGoal(
      await authedRequest('/api/goals', {
        method: 'POST',
        body: { metric: 'sales_count', targetValue: 10, period: 'week' },
      }),
    );
    expect(res.status).toBe(400);
    expect(events).toEqual([]);
  });

  it('rejects an invalid metric with 400', async () => {
    const res = await createGoal(
      await authedRequest('/api/goals', {
        method: 'POST',
        body: { metric: 'revenue', targetValue: 10, period: 'month' },
      }),
    );
    expect(res.status).toBe(400);
  });

  it('PATCH toggles active and broadcasts; DELETE removes and broadcasts', async () => {
    const created = await (
      await createGoal(
        await authedRequest('/api/goals', {
          method: 'POST',
          body: { metric: 'sales_count', targetValue: 25, period: 'quarter' },
        }),
      )
    ).json();
    events.length = 0;

    const patched = await patchGoal(
      await authedRequest(`/api/goals/${created.data.id}`, {
        method: 'PATCH',
        body: { active: false },
      }),
      { params: Promise.resolve({ id: created.data.id }) },
    );
    expect(patched.status).toBe(200);
    expect((await patched.json()).data.active).toBe(false);
    expect(events).toEqual([{ type: 'data.updated', domain: 'goals' }]);
    events.length = 0;

    const deleted = await deleteGoal(
      await authedRequest(`/api/goals/${created.data.id}`, { method: 'DELETE' }),
      { params: Promise.resolve({ id: created.data.id }) },
    );
    expect(deleted.status).toBe(200);
    const list = await (await listGoals(await authedRequest('/api/goals'))).json();
    expect(list.data).toHaveLength(0);
    expect(events).toEqual([{ type: 'data.updated', domain: 'goals' }]);
  });

  it('returns 404 for an unknown goal id', async () => {
    const res = await deleteGoal(
      await authedRequest('/api/goals/ghost', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'ghost' }) },
    );
    expect(res.status).toBe(404);
  });
});
