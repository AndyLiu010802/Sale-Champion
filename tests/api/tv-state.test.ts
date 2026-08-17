import { beforeEach, describe, expect, it } from 'vitest';
import { freshDb, seedBasics, type Basics } from '../helpers/db';
import { jsonRequest } from '../helpers/request';
import type { Db } from '@/lib/db';
import { agents, announcements, goals, listings, sales, screens } from '@/lib/db/schema';
import { generateDeviceToken, hashToken } from '@/lib/domain/pairing';
import { periodLabel } from '@/lib/domain/periods';
import { GET as tvStateGet } from '@/app/api/tv/state/route';

function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

describe('GET /api/tv/state', () => {
  let db: Db;
  let basics: Basics;
  let token: string;
  let screenId: string;

  beforeEach(async () => {
    db = await freshDb();
    basics = await seedBasics(db);
    token = generateDeviceToken();
    screenId = crypto.randomUUID();
    await db.insert(screens).values({
      id: screenId,
      orgId: basics.orgId,
      name: 'Lobby TV',
      deviceTokenHash: hashToken(token),
      status: 'paired',
    });
  });

  function stateRequest(t?: string): Request {
    return jsonRequest('/api/tv/state', { headers: t ? { 'x-device-token': t } : {} });
  }

  it('rejects missing or invalid token with 401', async () => {
    expect((await tvStateGet(stateRequest())).status).toBe(401);
    expect((await tvStateGet(stateRequest('wrong-token'))).status).toBe(401);
  });

  it('returns computed leaderboards, goals, listings, announcements and period label', async () => {
    const today = localDateStr(new Date());
    const bobId = crypto.randomUUID();
    await db.insert(agents).values({ id: bobId, orgId: basics.orgId, name: 'Bob Ray' });

    // Alice: two sales; Bob: one sale with a bigger GCI.
    await db.insert(sales).values([
      { id: crypto.randomUUID(), orgId: basics.orgId, agentId: basics.agentId, address: '1 Main St', salePriceCents: 50000000, gciCents: 100000, saleDate: today },
      { id: crypto.randomUUID(), orgId: basics.orgId, agentId: basics.agentId, address: '2 Main St', salePriceCents: 60000000, gciCents: 100000, saleDate: today },
      { id: crypto.randomUUID(), orgId: basics.orgId, agentId: bobId, address: '3 High St', salePriceCents: 90000000, gciCents: 500000, saleDate: today },
    ]);
    await db.insert(listings).values([
      { id: crypto.randomUUID(), orgId: basics.orgId, agentId: basics.agentId, address: '10 Beach Rd', listPriceCents: 80000000, listedDate: today, status: 'active' },
      { id: crypto.randomUUID(), orgId: basics.orgId, agentId: bobId, address: '11 Beach Rd', listPriceCents: 90000000, listedDate: today, status: 'sold' },
    ]);
    await db.insert(goals).values({
      id: crypto.randomUUID(), orgId: basics.orgId, metric: 'sales_count', targetValue: 10, period: 'month', active: true,
    });
    await db.insert(announcements).values([
      { id: crypto.randomUUID(), orgId: basics.orgId, title: 'Enabled news', sortOrder: 2, enabled: true },
      { id: crypto.randomUUID(), orgId: basics.orgId, title: 'First news', sortOrder: 1, enabled: true },
      { id: crypto.randomUUID(), orgId: basics.orgId, title: 'Hidden news', sortOrder: 0, enabled: false },
    ]);

    const res = await tvStateGet(stateRequest(token));
    expect(res.status).toBe(200);
    const { data } = await res.json();

    expect(data.screen).toEqual({ id: screenId, name: 'Lobby TV' });
    expect(data.settings.leaderboardPeriod).toBe('month');
    expect(data.periodLabel).toBe(periodLabel('month', new Date()));

    // sales_count board: Alice (2 sales) first, Bob (1 sale) second.
    const sc = data.leaderboards.sales_count;
    expect(sc[0]).toMatchObject({ agentId: basics.agentId, value: 2, rank: 1 });
    expect(sc[1]).toMatchObject({ agentId: bobId, value: 1, rank: 2 });

    // gci board: Bob's 500000 cents beats Alice's 200000.
    const gci = data.leaderboards.gci;
    expect(gci[0]).toMatchObject({ agentId: bobId, value: 500000, rank: 1 });
    expect(gci[1]).toMatchObject({ agentId: basics.agentId, value: 200000, rank: 2 });

    // listings board: 1 each; tie broken by higher in-period GCI → Bob first.
    const lb = data.leaderboards.listings;
    expect(lb).toHaveLength(2);
    expect(lb[0]).toMatchObject({ agentId: bobId, value: 1, rank: 1 });

    // goal progress: 3 of 10 sales → 30%.
    expect(data.goals).toHaveLength(1);
    expect(data.goals[0]).toMatchObject({
      metric: 'sales_count', period: 'month', targetValue: 10, currentValue: 3, percent: 30,
    });

    // tv listings: active only, joined agent name.
    expect(data.listings).toHaveLength(1);
    expect(data.listings[0]).toMatchObject({
      address: '10 Beach Rd', listPriceCents: 80000000, agentName: 'Alice Ng',
    });

    // announcements: enabled only, sortOrder asc.
    expect(data.announcements.map((a: any) => a.title)).toEqual(['First news', 'Enabled news']);
  });

  it('caps goal percent at 100', async () => {
    const today = localDateStr(new Date());
    await db.insert(sales).values([
      { id: crypto.randomUUID(), orgId: basics.orgId, agentId: basics.agentId, address: '4 Low St', salePriceCents: 10000000, gciCents: 50000, saleDate: today },
      { id: crypto.randomUUID(), orgId: basics.orgId, agentId: basics.agentId, address: '5 Low St', salePriceCents: 10000000, gciCents: 50000, saleDate: today },
      { id: crypto.randomUUID(), orgId: basics.orgId, agentId: basics.agentId, address: '6 Low St', salePriceCents: 10000000, gciCents: 50000, saleDate: today },
    ]);
    await db.insert(goals).values({
      id: crypto.randomUUID(), orgId: basics.orgId, metric: 'sales_count', targetValue: 2, period: 'month', active: true,
    });

    const res = await tvStateGet(stateRequest(token));
    const { data } = await res.json();
    expect(data.goals[0].currentValue).toBe(3);
    expect(data.goals[0].percent).toBe(100); // 150% capped
  });
});
