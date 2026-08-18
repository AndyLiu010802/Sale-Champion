import { describe, it, expect } from 'vitest';
import { computeScorecard, type ScorecardInputs } from '@/lib/domain/scorecard';

// August 2026, end exclusive
const AUG = { start: new Date(2026, 7, 1), end: new Date(2026, 8, 1) };

const agent = (id: string, name: string, role: 'agent' | 'staff' = 'agent', active = true) =>
  ({ id, name, role, active });
const sale = (agentId: string, gciCents: number, saleDate: string, split = 1) =>
  ({ agentId, gciCents, saleDate, split });
const listing = (agentId: string, listedDate: string) => ({ agentId, listedDate });
const appraisal = (agentId: string, date: string, count = 1) => ({ agentId, date, count });

describe('computeScorecard', () => {
  it('aggregates appraisals, listings, sales, split and gci per agent', () => {
    const inputs: ScorecardInputs = {
      agents: [agent('a', 'Alice')],
      sales: [sale('a', 100_000, '2026-08-05'), sale('a', 200_000, '2026-08-10', 0.8)],
      listings: [listing('a', '2026-08-03')],
      appraisals: [appraisal('a', '2026-08-02', 3), appraisal('a', '2026-08-04')],
    };
    const { rows, totals } = computeScorecard(inputs, AUG);
    expect(rows).toEqual([{
      agentId: 'a', name: 'Alice', appraisals: 4, listings: 1,
      sales: 2, split: 1.8, gciCents: 300_000, conversionPct: 25,
    }]);
    expect(totals).toEqual({ appraisals: 4, listings: 1, salesSplit: 1.8, gciCents: 300_000 });
  });

  it('filters every metric by the period range (start inclusive, end exclusive)', () => {
    const inputs: ScorecardInputs = {
      agents: [agent('a', 'Alice')],
      sales: [sale('a', 100_000, '2026-08-01'), sale('a', 900_000, '2026-09-01')],
      listings: [listing('a', '2026-08-31'), listing('a', '2026-07-31')],
      appraisals: [appraisal('a', '2026-08-01', 2), appraisal('a', '2026-07-31', 9)],
    };
    const { rows } = computeScorecard(inputs, AUG);
    expect(rows[0]).toMatchObject({ appraisals: 2, listings: 1, sales: 1, gciCents: 100_000 });
  });

  it('sorts by gciCents desc and breaks ties by name asc', () => {
    const inputs: ScorecardInputs = {
      agents: [
        agent('t', 'Team Cowley'), agent('m', 'Michael Hatzinicolaou'), agent('c', 'Chris Joyce'),
      ],
      sales: [
        sale('t', 500_000, '2026-08-05', 0.5),
        sale('m', 500_000, '2026-08-06', 0.5),
        sale('c', 900_000, '2026-08-07'),
      ],
      listings: [],
      appraisals: [],
    };
    const { rows } = computeScorecard(inputs, AUG);
    expect(rows.map((r) => r.name)).toEqual(['Chris Joyce', 'Michael Hatzinicolaou', 'Team Cowley']);
  });

  it('conversionPct: null without appraisals, 0 with appraisals but no listings, one decimal otherwise', () => {
    const inputs: ScorecardInputs = {
      agents: [agent('a', 'Alice'), agent('b', 'Bob'), agent('c', 'Cara')],
      sales: [sale('a', 100_000, '2026-08-05'), sale('b', 100_000, '2026-08-06')],
      listings: [listing('c', '2026-08-03'), listing('c', '2026-08-04')],
      appraisals: [appraisal('b', '2026-08-02', 4), appraisal('c', '2026-08-02', 13)],
    };
    const { rows } = computeScorecard(inputs, AUG);
    const byId = new Map(rows.map((r) => [r.agentId, r]));
    expect(byId.get('a')!.conversionPct).toBeNull();  // 无估价 → —
    expect(byId.get('b')!.conversionPct).toBe(0);     // 有估价无房源 → 0(红)
    expect(byId.get('c')!.conversionPct).toBe(15.4);  // 2/13 → 15.3846… → 15.4(样表 Hill & Co)
  });

  it('drops members with every metric at zero but keeps appraisal-only members', () => {
    const inputs: ScorecardInputs = {
      agents: [agent('a', 'Alice'), agent('idle', 'Idle Ivy'), agent('t', 'Team Brudenell')],
      sales: [sale('a', 100_000, '2026-08-05')],
      listings: [],
      appraisals: [
        appraisal('t', '2026-08-11', 4),
        appraisal('idle', '2026-07-01', 5), // idle 只有期外估价 → 全指标 0 → 不成行
      ],
    };
    const { rows } = computeScorecard(inputs, AUG);
    expect(rows.map((r) => r.agentId)).toEqual(['a', 't']);
    expect(rows[1]).toMatchObject({
      appraisals: 4, listings: 0, sales: 0, split: 0, gciCents: 0, conversionPct: 0,
    });
  });

  it('excludes staff and inactive members even with in-period activity', () => {
    const inputs: ScorecardInputs = {
      agents: [
        agent('a', 'Alice'),
        agent('s', 'Sam Staff', 'staff'),
        agent('x', 'Xavier Gone', 'agent', false),
      ],
      sales: [
        sale('a', 100_000, '2026-08-05'),
        sale('s', 900_000, '2026-08-06'),
        sale('x', 900_000, '2026-08-07'),
      ],
      listings: [],
      appraisals: [],
    };
    const { rows } = computeScorecard(inputs, AUG);
    expect(rows.map((r) => r.agentId)).toEqual(['a']);
  });

  it('totals sum the surviving rows and keep salesSplit fractional', () => {
    const inputs: ScorecardInputs = {
      agents: [agent('a', 'Alice'), agent('b', 'Bob')],
      sales: [
        sale('a', 100_000, '2026-08-05', 0.5),
        sale('b', 200_000, '2026-08-06', 0.2),
        sale('b', 300_000, '2026-08-07'),
      ],
      listings: [listing('a', '2026-08-03')],
      appraisals: [appraisal('a', '2026-08-02', 2)],
    };
    const { totals } = computeScorecard(inputs, AUG);
    expect(totals).toEqual({ appraisals: 2, listings: 1, salesSplit: 1.7, gciCents: 600_000 });
  });

  it('ignores rows referencing unknown agent ids', () => {
    const inputs: ScorecardInputs = {
      agents: [agent('a', 'Alice')],
      sales: [sale('ghost', 900_000, '2026-08-05')],
      listings: [],
      appraisals: [appraisal('a', '2026-08-02')],
    };
    const { rows, totals } = computeScorecard(inputs, AUG);
    expect(rows).toEqual([{
      agentId: 'a', name: 'Alice', appraisals: 1, listings: 0,
      sales: 0, split: 0, gciCents: 0, conversionPct: 0,
    }]);
    expect(totals.gciCents).toBe(0);
  });
});
