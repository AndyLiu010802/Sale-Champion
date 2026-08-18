// Scorecard 域纯函数(设计 §4/§5):按周期聚合每位 agent 的
// appraisals / listings / sales(参与笔数)/ split(Σ)/ gci 与 listing conversion。

import { round1 } from '../format';

export type ScorecardInputs = {
  agents: { id: string; name: string; role: string; active: boolean }[];
  sales: { agentId: string; gciCents: number; saleDate: string; split: number }[];  // saleDate 'YYYY-MM-DD'
  listings: { agentId: string; listedDate: string }[];
  appraisals: { agentId: string; date: string; count: number }[];                   // date 'YYYY-MM-DD'
};

export type ScorecardRow = {
  agentId: string;
  name: string;
  appraisals: number;
  listings: number;
  sales: number;                 // 参与笔数(行数)
  split: number;                 // Σsplit,1 位小数
  gciCents: number;
  conversionPct: number | null;  // appraisals>0 ? round1(listings/appraisals*100) : null
};

export type ScorecardData = {
  totals: { appraisals: number; listings: number; salesSplit: number; gciCents: number };
  rows: ScorecardRow[];          // gciCents desc,tie 按 name asc;全指标 0 的成员不成行
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

type Acc = { appraisals: number; listings: number; sales: number; split: number; gciCents: number };

function newAcc(): Acc {
  return { appraisals: 0, listings: 0, sales: 0, split: 0, gciCents: 0 };
}

export function computeScorecard(inputs: ScorecardInputs, range: Range): ScorecardData {
  const acc = new Map<string, Acc>();
  const get = (agentId: string): Acc => {
    let a = acc.get(agentId);
    if (!a) {
      a = newAcc();
      acc.set(agentId, a);
    }
    return a;
  };
  for (const row of inputs.sales) {
    if (!inRange(row.saleDate, range)) continue;
    const a = get(row.agentId);
    a.sales += 1;
    a.split += row.split;
    a.gciCents += row.gciCents;
  }
  for (const row of inputs.listings) {
    if (!inRange(row.listedDate, range)) continue;
    get(row.agentId).listings += 1;
  }
  for (const row of inputs.appraisals) {
    if (!inRange(row.date, range)) continue;
    get(row.agentId).appraisals += row.count;
  }

  const rows: ScorecardRow[] = inputs.agents
    .filter((a) => a.role === 'agent' && a.active)
    .map((a) => {
      const s = acc.get(a.id) ?? newAcc();
      return {
        agentId: a.id,
        name: a.name,
        appraisals: s.appraisals,
        listings: s.listings,
        sales: s.sales,
        split: round1(s.split),
        gciCents: s.gciCents,
        conversionPct: s.appraisals > 0 ? round1((s.listings / s.appraisals) * 100) : null,
      };
    })
    // 全指标为 0 的成员不成行(设计 §5)。
    .filter((r) => r.appraisals > 0 || r.listings > 0 || r.sales > 0 || r.gciCents > 0);

  rows.sort((x, y) =>
    y.gciCents - x.gciCents
    || (x.name < y.name ? -1 : x.name > y.name ? 1 : 0));

  const totals = rows.reduce(
    (t, r) => ({
      appraisals: t.appraisals + r.appraisals,
      listings: t.listings + r.listings,
      salesSplit: t.salesSplit + r.split,
      gciCents: t.gciCents + r.gciCents,
    }),
    { appraisals: 0, listings: 0, salesSplit: 0, gciCents: 0 },
  );
  totals.salesSplit = round1(totals.salesSplit);

  return { totals, rows };
}
