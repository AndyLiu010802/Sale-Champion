import { and, asc, desc, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { agents, announcements, goals, listings, sales, screens } from '@/lib/db/schema';
import { hashToken } from '@/lib/domain/pairing';
import { computeLeaderboard, computeMetricTotal, type LeaderboardInputs } from '@/lib/domain/leaderboard';
import { periodLabel, periodRange } from '@/lib/domain/periods';
import { getSettings } from '@/lib/settings';
import type { GoalProgress, Metric, TvAnnouncement, TvListing, TvStateResponse } from '@/lib/types';

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

  const agentRows = await db.select().from(agents).where(eq(agents.orgId, orgId));
  const saleRows = await db.select().from(sales).where(eq(sales.orgId, orgId));
  const listingRows = await db.select().from(listings).where(eq(listings.orgId, orgId));

  const inputs: LeaderboardInputs = {
    agents: agentRows.map((a) => ({
      id: a.id, name: a.name, photoUrl: a.photoUrl, active: a.active,
    })),
    sales: saleRows.map((s) => ({
      agentId: s.agentId, gciCents: s.gciCents, saleDate: s.saleDate, createdAt: s.createdAt,
    })),
    listings: listingRows.map((l) => ({ agentId: l.agentId, listedDate: l.listedDate })),
  };

  const range = periodRange(settings.leaderboardPeriod, now);
  const leaderboards: TvStateResponse['leaderboards'] = {
    sales_count: computeLeaderboard(inputs, 'sales_count', range),
    gci: computeLeaderboard(inputs, 'gci', range),
    listings: computeLeaderboard(inputs, 'listings', range),
  };

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

  const tvListings: TvListing[] = await db.select({
    id: listings.id,
    address: listings.address,
    listPriceCents: listings.listPriceCents,
    photoUrl: listings.photoUrl,
    agentName: agents.name,
  }).from(listings)
    .innerJoin(agents, eq(listings.agentId, agents.id))
    .where(and(eq(listings.orgId, orgId), eq(listings.status, 'active')))
    .orderBy(desc(listings.listedDate))
    .limit(8);

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
    listings: tvListings,
    announcements: tvAnnouncements,
    periodLabel: periodLabel(settings.leaderboardPeriod, now),
  };
  return Response.json({ data });
}
