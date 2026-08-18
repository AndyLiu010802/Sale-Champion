import type { LeaderboardEntry, Metric } from '../types';

export type LeaderboardInputs = {
  agents: { id: string; name: string; photoUrl: string | null; active: boolean }[];
  sales: { agentId: string; gciCents: number; saleDate: string; createdAt: Date }[];      // saleDate 'YYYY-MM-DD'
  listings: { agentId: string; listedDate: string }[];
};

type Range = { start: Date; end: Date };

/** Parse 'YYYY-MM-DD' as local-time midnight of that day. */
function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function inRange(dateStr: string, range: Range): boolean {
  const t = parseLocalDate(dateStr).getTime();
  return t >= range.start.getTime() && t < range.end.getTime();
}

type AgentStats = {
  salesCount: number;
  gciCents: number;
  listingsCount: number;
  earliestSaleCreatedAt: number; // ms epoch; +Infinity when no sales in period
};

function newStats(): AgentStats {
  return { salesCount: 0, gciCents: 0, listingsCount: 0, earliestSaleCreatedAt: Number.POSITIVE_INFINITY };
}

function collectStats(inputs: LeaderboardInputs, range: Range): Map<string, AgentStats> {
  const stats = new Map<string, AgentStats>();
  const get = (agentId: string): AgentStats => {
    let s = stats.get(agentId);
    if (!s) {
      s = newStats();
      stats.set(agentId, s);
    }
    return s;
  };
  for (const row of inputs.sales) {
    if (!inRange(row.saleDate, range)) continue;
    const s = get(row.agentId);
    s.salesCount += 1;
    s.gciCents += row.gciCents;
    s.earliestSaleCreatedAt = Math.min(s.earliestSaleCreatedAt, row.createdAt.getTime());
  }
  for (const row of inputs.listings) {
    if (!inRange(row.listedDate, range)) continue;
    get(row.agentId).listingsCount += 1;
  }
  return stats;
}

function metricValue(stats: AgentStats, metric: Metric): number {
  if (metric === 'sales_count') return stats.salesCount;
  if (metric === 'gci') return stats.gciCents;
  return stats.listingsCount;
}

/** Safe numeric compare (handles Infinity vs Infinity without NaN). */
function cmp(a: number, b: number): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** 安全封顶:电视端分页后全量展示,50 仅防极端数据撑爆载荷(设计 §4)。 */
export const LEADERBOARD_LIMIT = 50;

export function computeLeaderboard(inputs: LeaderboardInputs, metric: Metric, range: Range): LeaderboardEntry[] {
  const stats = collectStats(inputs, range);
  const rows = inputs.agents
    .filter((a) => a.active)
    .map((a) => {
      const s = stats.get(a.id) ?? newStats();
      return { agent: a, value: metricValue(s, metric), gci: s.gciCents, earliest: s.earliestSaleCreatedAt };
    })
    .filter((r) => r.value > 0);

  rows.sort((x, y) =>
    cmp(y.value, x.value)                          // primary metric desc
    || cmp(y.gci, x.gci)                           // period GCI desc
    || cmp(x.earliest, y.earliest)                 // earliest sale createdAt asc
    || (x.agent.name < y.agent.name ? -1 : x.agent.name > y.agent.name ? 1 : 0), // name asc
  );

  return rows.slice(0, LEADERBOARD_LIMIT).map((r, i) => ({
    agentId: r.agent.id,
    name: r.agent.name,
    photoUrl: r.agent.photoUrl,
    value: r.value,
    rank: i + 1,
  }));
}

/** Team-wide total for goal progress. Includes ALL agents (active filter not applied). */
export function computeMetricTotal(inputs: LeaderboardInputs, metric: Metric, range: Range): number {
  if (metric === 'listings') {
    return inputs.listings.filter((l) => inRange(l.listedDate, range)).length;
  }
  const inPeriod = inputs.sales.filter((s) => inRange(s.saleDate, range));
  if (metric === 'sales_count') return inPeriod.length;
  return inPeriod.reduce((sum, s) => sum + s.gciCents, 0);
}
