import { beforeEach, describe, expect, it } from 'vitest';
import { freshDb, seedBasics, type Basics } from '../helpers/db';
import { jsonRequest, authedRequest } from '../helpers/request';
import type { Db } from '@/lib/db';
import { agents, announcements, appraisals, goals, listings, sales, screens } from '@/lib/db/schema';
import { generateDeviceToken, hashToken } from '@/lib/domain/pairing';
import { fyLabel, fyToDateRange, periodLabel } from '@/lib/domain/periods';
import { GET as tvStateGet } from '@/app/api/tv/state/route';
import { PATCH as AGENTS_PATCH } from '@/app/api/agents/[id]/route';

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

  it('returns computed leaderboards, goals, announcements and period label (no listings field)', async () => {
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

    // Hot Listings 页已移除(清理设计 §1):响应不再包含 listings 字段。
    expect(data).not.toHaveProperty('listings');

    // announcements: enabled only, sortOrder asc.
    expect(data.announcements.map((a: any) => a.title)).toEqual(['First news', 'Enabled news']);
  });

  it('assembles the scorecard block (totals, ranked rows, conversion)', async () => {
    const today = localDateStr(new Date());
    const bobId = crypto.randomUUID();
    await db.insert(agents).values({ id: bobId, orgId: basics.orgId, name: 'Bob Ray' });

    await db.insert(sales).values([
      // Alice:共享成交两行(0.5+0.5)
      { id: crypto.randomUUID(), orgId: basics.orgId, agentId: basics.agentId, address: '1 Split St', salePriceCents: 0, gciCents: 50000, saleDate: today, split: 0.5 },
      { id: crypto.randomUUID(), orgId: basics.orgId, agentId: basics.agentId, address: '2 Split St', salePriceCents: 0, gciCents: 50000, saleDate: today, split: 0.5 },
      // Bob:一行整单,GCI 更高 → rank 1
      { id: crypto.randomUUID(), orgId: basics.orgId, agentId: bobId, address: '3 Whole St', salePriceCents: 0, gciCents: 300000, saleDate: today },
    ]);
    await db.insert(listings).values([
      // sold 也计入 listings 指标与 conversion(不上 TV 在售页)
      { id: crypto.randomUUID(), orgId: basics.orgId, agentId: basics.agentId, address: '10 Beach Rd', listPriceCents: 0, listedDate: today, status: 'sold' },
    ]);
    await db.insert(appraisals).values([
      { id: crypto.randomUUID(), orgId: basics.orgId, agentId: basics.agentId, date: today, count: 4 },
    ]);

    const res = await tvStateGet(stateRequest(token));
    expect(res.status).toBe(200);
    const { data } = await res.json();

    expect(data.scorecard.rows).toEqual([
      { agentId: bobId, name: 'Bob Ray', appraisals: 0, listings: 0, sales: 1, split: 1, gciCents: 300000, conversionPct: null },
      { agentId: basics.agentId, name: 'Alice Ng', appraisals: 4, listings: 1, sales: 2, split: 1, gciCents: 100000, conversionPct: 25 },
    ]);
    expect(data.scorecard.totals).toEqual({ appraisals: 4, listings: 1, salesSplit: 2, gciCents: 400000 });
  });

  it('assembles the fiscal-year scorecardYtd plus fyLabel (设计 §7b)', async () => {
    const now = new Date();
    const fyStartStr = localDateStr(fyToDateRange(now).start);
    const monthStartStr = localDateStr(new Date(now.getFullYear(), now.getMonth(), 1));

    await db.insert(sales).values([
      // 本月首日:MTD 与 YTD 都计入
      { id: crypto.randomUUID(), orgId: basics.orgId, agentId: basics.agentId, address: '1 Month St', salePriceCents: 0, gciCents: 100000, saleDate: monthStartStr },
      // 财年首日(7 月 1 日):必计入 YTD;仅当"本月"就是 7 月时才同时计入 MTD
      { id: crypto.randomUUID(), orgId: basics.orgId, agentId: basics.agentId, address: '2 Fiscal St', salePriceCents: 0, gciCents: 200000, saleDate: fyStartStr, split: 0.5 },
    ]);
    await db.insert(listings).values([
      { id: crypto.randomUUID(), orgId: basics.orgId, agentId: basics.agentId, address: '3 Fiscal Rd', listPriceCents: 0, listedDate: fyStartStr, status: 'sold', split: 0.66 },
    ]);

    const res = await tvStateGet(stateRequest(token));
    expect(res.status).toBe(200);
    const { data } = await res.json();

    expect(data.fyLabel).toBe(fyLabel(now));
    // YTD:两笔成交(1 + 0.5)+ 一条 0.66 房源(round1 → 0.7)
    expect(data.scorecardYtd.totals).toEqual({ appraisals: 0, listings: 0.7, salesSplit: 1.5, gciCents: 300000 });
    // MTD:7 月里月初 = 财年首日(两行都算);其余月份只算本月首日那行
    const fyStartIsMonthStart = fyStartStr === monthStartStr;
    expect(data.scorecard.totals.gciCents).toBe(fyStartIsMonthStart ? 300000 : 100000);
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

  it('excludes staff from every leaderboard', async () => {
    const today = localDateStr(new Date());
    const staffId = crypto.randomUUID();
    await db.insert(agents).values({
      id: staffId, orgId: basics.orgId, name: 'Sam Staff', role: 'staff', birthday: '08-18',
    });
    await db.insert(sales).values({
      id: crypto.randomUUID(), orgId: basics.orgId, agentId: basics.agentId, address: '1 Main St',
      salePriceCents: 50000000, gciCents: 100000, saleDate: today,
    });

    const res = await tvStateGet(stateRequest(token));
    expect(res.status).toBe(200);
    const { data } = await res.json();
    for (const metric of ['sales_count', 'gci', 'listings'] as const) {
      expect(
        data.leaderboards[metric].some((e: { agentId: string }) => e.agentId === staffId),
      ).toBe(false);
    }
    // Alice (role agent) still ranks normally.
    expect(data.leaderboards.sales_count[0]).toMatchObject({ agentId: basics.agentId, value: 1 });
  });

  it('a demoted agent disappears from leaderboards but keeps counting toward goals', async () => {
    const today = localDateStr(new Date());
    const bobId = crypto.randomUUID();
    await db.insert(agents).values({ id: bobId, orgId: basics.orgId, name: 'Bob Ray' });
    await db.insert(sales).values({
      id: crypto.randomUUID(), orgId: basics.orgId, agentId: bobId, address: '9 High St',
      salePriceCents: 70000000, gciCents: 300000, saleDate: today,
    });

    const patchRes = await AGENTS_PATCH(
      await authedRequest(`/api/agents/${bobId}`, { method: 'PATCH', body: { role: 'staff' } }),
      { params: Promise.resolve({ id: bobId }) },
    );
    expect(patchRes.status).toBe(200);
    const { data: patched } = await patchRes.json();
    expect(patched.role).toBe('staff');

    await db.insert(goals).values({
      id: crypto.randomUUID(), orgId: basics.orgId, metric: 'gci', targetValue: 1000000, period: 'month', active: true,
    });

    const res = await tvStateGet(stateRequest(token));
    expect(res.status).toBe(200);
    const { data } = await res.json();
    for (const metric of ['sales_count', 'gci', 'listings'] as const) {
      expect(
        data.leaderboards[metric].some((e: { agentId: string }) => e.agentId === bobId),
      ).toBe(false);
    }
    expect(data.goals[0].currentValue).toBe(300000);
  });
});
