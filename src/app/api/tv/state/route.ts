import { and, asc, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { agents, announcements, appraisals, goals, listings, sales, screens } from '@/lib/db/schema';
import { hashToken } from '@/lib/domain/pairing';
import { computeLeaderboard, computeMetricTotal, type LeaderboardInputs } from '@/lib/domain/leaderboard';
import { computeScorecard } from '@/lib/domain/scorecard';
import { fyLabel, fyToDateRange, periodLabel, periodRange } from '@/lib/domain/periods';
import { getSettings } from '@/lib/settings';
import type { GoalProgress, Metric, TvAnnouncement, TvStateResponse } from '@/lib/types';

export async function GET(req: Request): Promise<Response> {
  const token = req.headers.get('x-device-token');
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const db = await getDb();
  const screenRows = await db.select().from(screens)
    .where(and(
      eq(screens.deviceTokenHash, hashToken(token)),
      eq(screens.status, 'paired'),
    ))
    .limit(1);
  const screen = screenRows[0];
  if (!screen) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const orgId = screen.orgId;
  const now = new Date();
  const settings = await getSettings(db, orgId);

  // Staff never enter the leaderboards. Sales/listings rows can only reference
  // role='agent' members (enforced by their APIs), so computeMetricTotal's
  // team-wide goal totals need no extra role filtering here.
  const agentRows = await db.select().from(agents)
    .where(and(eq(agents.orgId, orgId), eq(agents.role, 'agent')));
  const saleRows = await db.select().from(sales).where(eq(sales.orgId, orgId));
  const listingRows = await db.select().from(listings).where(eq(listings.orgId, orgId));
  const appraisalRows = await db.select().from(appraisals).where(eq(appraisals.orgId, orgId));

  const inputs: LeaderboardInputs = {
    agents: agentRows.map((a) => ({
      id: a.id, name: a.name, photoUrl: a.photoUrl, active: a.active,
    })),
    sales: saleRows.map((s) => ({
      agentId: s.agentId, gciCents: s.gciCents, saleDate: s.saleDate, createdAt: s.createdAt, split: s.split,
    })),
    listings: listingRows.map((l) => ({ agentId: l.agentId, listedDate: l.listedDate, split: l.split })),
  };

  const range = periodRange(settings.leaderboardPeriod, now);
  const leaderboards: TvStateResponse['leaderboards'] = {
    sales_count: computeLeaderboard(inputs, 'sales_count', range),
    gci: computeLeaderboard(inputs, 'gci', range),
    listings: computeLeaderboard(inputs, 'listings', range),
  };

  // Scorecard 与三榜同周期(设计 §5);周期过滤在 computeScorecard 内完成——
  // 与 sales/listings 一样整表取 org 行、域层过滤。inputs.sales/listings 结构性兼容
  // ScorecardInputs(多出的 createdAt/photoUrl 字段无妨)。
  const scorecardInputs = {
    agents: agentRows.map((a) => ({ id: a.id, name: a.name, role: a.role, active: a.active })),
    sales: inputs.sales,
    listings: inputs.listings,
    appraisals: appraisalRows.map((a) => ({ agentId: a.agentId, date: a.date, count: a.count })),
  };
  const scorecard = computeScorecard(scorecardInputs, range);
  // YTD 记分卡:澳洲财年 to-date(设计 §7b),与 MTD 同一份输入、只换周期。
  const scorecardYtd = computeScorecard(scorecardInputs, fyToDateRange(now));

  const goalRows = await db.select().from(goals)
    .where(and(eq(goals.orgId, orgId), eq(goals.active, true)))
    .orderBy(asc(goals.createdAt));
  const goalProgress: GoalProgress[] = goalRows.map((g) => {
    const metric = g.metric as Metric;
    const period = g.period as 'month' | 'quarter';
    const currentValue = computeMetricTotal(inputs, metric, periodRange(period, now));
    const percent = g.targetValue > 0
      ? Math.min(100, Math.round((currentValue / g.targetValue) * 100))
      : 100;
    return { id: g.id, metric, period, targetValue: g.targetValue, currentValue, percent };
  });

  const annRows = await db.select().from(announcements)
    .where(and(eq(announcements.orgId, orgId), eq(announcements.enabled, true)))
    .orderBy(asc(announcements.sortOrder));
  const tvAnnouncements: TvAnnouncement[] = annRows.map((a) => ({
    id: a.id, title: a.title, body: a.body, imageUrl: a.imageUrl,
  }));

  const data: TvStateResponse = {
    screen: { id: screen.id, name: screen.name },
    settings,
    leaderboards,
    goals: goalProgress,
    announcements: tvAnnouncements,
    scorecard,
    scorecardYtd,
    periodLabel: periodLabel(settings.leaderboardPeriod, now),
    fyLabel: fyLabel(now),
  };
  return Response.json({ data });
}
