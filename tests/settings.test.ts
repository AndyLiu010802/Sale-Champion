import { describe, it, expect, beforeEach } from 'vitest';
import { freshDb, seedBasics } from './helpers/db';
import { jsonRequest, authedRequest } from './helpers/request';
import { getSettings, saveSettings, DEFAULT_SETTINGS, type SettingsData } from '@/lib/settings';
import { getHub } from '@/lib/ws/hub';
import { GET as settingsGet, PUT as settingsPut } from '@/app/api/settings/route';
import type { Db } from '@/lib/db';
import { settings } from '@/lib/db/schema';

let db: Db;
let orgId: string;

beforeEach(async () => {
  db = await freshDb();
  const basics = await seedBasics(db);
  orgId = basics.orgId;
});

describe('getSettings / saveSettings', () => {
  it('returns DEFAULT_SETTINGS when no row exists', async () => {
    expect(await getSettings(db, orgId)).toEqual(DEFAULT_SETTINGS);
  });

  it('reads back saved settings, including a second upsert', async () => {
    const custom: SettingsData = { ...DEFAULT_SETTINGS, leaderboardPeriod: 'quarter', celebrationDurationSec: 25 };
    await saveSettings(db, orgId, custom);
    expect(await getSettings(db, orgId)).toEqual(custom);

    const again: SettingsData = { ...custom, volume: 0.5 };
    await saveSettings(db, orgId, again); // 走 onConflictDoUpdate 的 update 分支
    expect(await getSettings(db, orgId)).toEqual(again);
  });

  it('falls back to defaults when stored data is malformed', async () => {
    await db.insert(settings).values({ orgId, data: { garbage: true }, updatedAt: new Date() });
    expect(await getSettings(db, orgId)).toEqual(DEFAULT_SETTINGS);
  });
});

describe('/api/settings', () => {
  it('GET returns 401 without an admin session', async () => {
    const res = await settingsGet(jsonRequest('/api/settings'));
    expect(res.status).toBe(401);
  });

  it('GET returns defaults when nothing is saved', async () => {
    const res = await settingsGet(await authedRequest('/api/settings'));
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual(DEFAULT_SETTINGS);
  });

  it('PUT requires admin session', async () => {
    const res = await settingsPut(jsonRequest('/api/settings', { method: 'PUT', body: DEFAULT_SETTINGS }));
    expect(res.status).toBe(401);
  });

  it('PUT rejects out-of-range celebrationDurationSec', async () => {
    const bad = { ...DEFAULT_SETTINGS, celebrationDurationSec: 40 };
    const res = await settingsPut(await authedRequest('/api/settings', { method: 'PUT', body: bad }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBeTypeOf('string');
  });

  it('rejects slides with missing or duplicate keys', async () => {
    // Missing one key (only 5 of the 6 required slide keys present).
    const missingKey = { ...DEFAULT_SETTINGS, slides: DEFAULT_SETTINGS.slides.slice(0, 5) };
    const res1 = await settingsPut(await authedRequest('/api/settings', { method: 'PUT', body: missingKey }));
    expect(res1.status).toBe(400);

    // Duplicate key (7 entries: all six keys present plus the first key repeated).
    const duplicateKey = { ...DEFAULT_SETTINGS, slides: [DEFAULT_SETTINGS.slides[0], ...DEFAULT_SETTINGS.slides] };
    const res2 = await settingsPut(await authedRequest('/api/settings', { method: 'PUT', body: duplicateKey }));
    expect(res2.status).toBe(400);
  });

  it('PUT saves settings and broadcasts config.updated to paired sockets', async () => {
    const sent: string[] = [];
    getHub().register('screen-1', { send: (d: string) => { sent.push(d); }, close() {} }, true);

    const next: SettingsData = { ...DEFAULT_SETTINGS, leaderboardPeriod: 'week' };
    const res = await settingsPut(await authedRequest('/api/settings', { method: 'PUT', body: next }));
    expect(res.status).toBe(200);
    expect((await res.json()).data.leaderboardPeriod).toBe('week');
    expect(await getSettings(db, orgId)).toEqual(next);
    expect(sent.map((s) => JSON.parse(s))).toContainEqual({ type: 'config.updated' });
  });
});
