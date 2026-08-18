import { describe, it, expect } from 'vitest';
import { computeLeaderboard, computeMetricTotal, type LeaderboardInputs } from '@/lib/domain/leaderboard';
import { formatMoney, formatValue } from '@/lib/format';

// August 2026, end exclusive
const AUG = { start: new Date(2026, 7, 1), end: new Date(2026, 8, 1) };

const agent = (id: string, name: string, active = true, photoUrl: string | null = null) =>
  ({ id, name, photoUrl, active });
const sale = (
  agentId: string, gciCents: number, saleDate: string,
  createdAt = `${saleDate}T10:00:00`, split = 1,
) => ({ agentId, gciCents, saleDate, createdAt: new Date(createdAt), split });
const listing = (agentId: string, listedDate: string) => ({ agentId, listedDate });

describe('computeLeaderboard', () => {
  it('sales_count: counts in-period sales, ranks desc, passes photoUrl through', () => {
    const inputs: LeaderboardInputs = {
      agents: [agent('a', 'Alice', true, '/p/alice.jpg'), agent('b', 'Bob')],
      sales: [
        sale('a', 100_000, '2026-08-05'),
        sale('a', 200_000, '2026-08-10'),
        sale('b', 900_000, '2026-08-12'),
      ],
      listings: [],
    };
    const rows = computeLeaderboard(inputs, 'sales_count', AUG);
    expect(rows).toEqual([
      { agentId: 'a', name: 'Alice', photoUrl: '/p/alice.jpg', value: 2, rank: 1 },
      { agentId: 'b', name: 'Bob', photoUrl: null, value: 1, rank: 2 },
    ]);
  });

  it('gci: sums gciCents per agent within the period', () => {
    const inputs: LeaderboardInputs = {
      agents: [agent('a', 'Alice'), agent('b', 'Bob')],
      sales: [
        sale('a', 100_000, '2026-08-05'),
        sale('a', 200_000, '2026-08-10'),
        sale('b', 250_000, '2026-08-12'),
        sale('b', 999_999, '2026-07-30'), // out of period
      ],
      listings: [],
    };
    const rows = computeLeaderboard(inputs, 'gci', AUG);
    expect(rows[0]).toMatchObject({ agentId: 'a', value: 300_000, rank: 1 });
    expect(rows[1]).toMatchObject({ agentId: 'b', value: 250_000, rank: 2 });
  });

  it('listings: counts listings by listedDate within the period', () => {
    const inputs: LeaderboardInputs = {
      agents: [agent('a', 'Alice'), agent('b', 'Bob')],
      sales: [],
      listings: [
        listing('a', '2026-08-03'),
        listing('a', '2026-08-20'),
        listing('b', '2026-08-15'),
        listing('b', '2026-07-01'), // out of period
      ],
    };
    const rows = computeLeaderboard(inputs, 'listings', AUG);
    expect(rows[0]).toMatchObject({ agentId: 'a', value: 2, rank: 1 });
    expect(rows[1]).toMatchObject({ agentId: 'b', value: 1, rank: 2 });
  });

  it('tie on primary metric → higher period GCI wins', () => {
    const inputs: LeaderboardInputs = {
      agents: [agent('a', 'Alice'), agent('b', 'Bob')],
      sales: [
        sale('a', 100_000, '2026-08-05'),
        sale('b', 500_000, '2026-08-06'),
      ],
      listings: [],
    };
    const rows = computeLeaderboard(inputs, 'sales_count', AUG);
    expect(rows.map((r) => r.agentId)).toEqual(['b', 'a']);
    expect(rows.map((r) => r.rank)).toEqual([1, 2]);
  });

  it('tie on metric and GCI → earliest sale createdAt wins', () => {
    const inputs: LeaderboardInputs = {
      agents: [agent('a', 'Alice'), agent('b', 'Bob')],
      sales: [
        sale('a', 100_000, '2026-08-05', '2026-08-05T15:00:00'),
        sale('b', 100_000, '2026-08-05', '2026-08-05T09:00:00'),
      ],
      listings: [],
    };
    const rows = computeLeaderboard(inputs, 'sales_count', AUG);
    expect(rows.map((r) => r.agentId)).toEqual(['b', 'a']);
  });

  it('full tie → name asc', () => {
    const inputs: LeaderboardInputs = {
      agents: [agent('z', 'Zoe'), agent('ad', 'Adam')],
      sales: [
        sale('z', 100_000, '2026-08-05', '2026-08-05T09:00:00'),
        sale('ad', 100_000, '2026-08-05', '2026-08-05T09:00:00'),
      ],
      listings: [],
    };
    const rows = computeLeaderboard(inputs, 'sales_count', AUG);
    expect(rows.map((r) => r.name)).toEqual(['Adam', 'Zoe']);
  });

  it('inactive agents are excluded even with sales in period', () => {
    const inputs: LeaderboardInputs = {
      agents: [agent('a', 'Alice'), agent('b', 'Bob', false)],
      sales: [
        sale('a', 100_000, '2026-08-05'),
        sale('b', 900_000, '2026-08-06'),
      ],
      listings: [],
    };
    const rows = computeLeaderboard(inputs, 'sales_count', AUG);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.agentId).toBe('a');
  });

  it('agents with value 0 are excluded', () => {
    const inputs: LeaderboardInputs = {
      agents: [agent('a', 'Alice'), agent('b', 'Bob')],
      sales: [sale('a', 100_000, '2026-08-05')],
      listings: [],
    };
    expect(computeLeaderboard(inputs, 'sales_count', AUG)).toHaveLength(1);
    expect(computeLeaderboard(inputs, 'listings', AUG)).toHaveLength(0);
  });

  it('period boundaries: start day counts, end day does not', () => {
    const inputs: LeaderboardInputs = {
      agents: [agent('a', 'Alice')],
      sales: [
        sale('a', 100_000, '2026-08-01'), // exactly start → in
        sale('a', 100_000, '2026-09-01'), // exactly end → out
        sale('a', 100_000, '2026-07-31'), // before start → out
      ],
      listings: [],
    };
    const rows = computeLeaderboard(inputs, 'sales_count', AUG);
    expect(rows[0]!.value).toBe(1);
  });

  it('keeps every qualifying agent below the 50 cap (12 agents all appear)', () => {
    const agents = [];
    const salesRows = [];
    for (let i = 1; i <= 12; i++) {
      const id = `a${String(i).padStart(2, '0')}`;
      agents.push(agent(id, `Agent ${String(i).padStart(2, '0')}`));
      salesRows.push(sale(id, i * 100_000, '2026-08-05'));
    }
    const rows = computeLeaderboard({ agents, sales: salesRows, listings: [] }, 'gci', AUG);
    expect(rows).toHaveLength(12);
    expect(rows[0]).toMatchObject({ agentId: 'a12', value: 1_200_000, rank: 1 });
    expect(rows[11]).toMatchObject({ agentId: 'a01', value: 100_000, rank: 12 });
    expect(rows.map((r) => r.rank)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
  });

  it('caps the board at 50 entries (safety cap, TV paginates client-side)', () => {
    const agents = [];
    const salesRows = [];
    for (let i = 1; i <= 55; i++) {
      const id = `a${String(i).padStart(2, '0')}`;
      agents.push(agent(id, `Agent ${String(i).padStart(2, '0')}`));
      salesRows.push(sale(id, i * 100_000, '2026-08-05'));
    }
    const rows = computeLeaderboard({ agents, sales: salesRows, listings: [] }, 'gci', AUG);
    expect(rows).toHaveLength(50);
    expect(rows[0]).toMatchObject({ agentId: 'a55', rank: 1 });
    expect(rows[49]).toMatchObject({ agentId: 'a06', rank: 50 });
  });

  it('sales_count sums split fractions (设计 §3:Σsplit,可为小数)', () => {
    const inputs: LeaderboardInputs = {
      agents: [agent('a', 'Alice'), agent('b', 'Bob')],
      sales: [
        sale('a', 100_000, '2026-08-05', '2026-08-05T10:00:00', 0.5),
        sale('a', 100_000, '2026-08-06', '2026-08-06T10:00:00', 0.2),
        sale('b', 100_000, '2026-08-07'),
      ],
      listings: [],
    };
    const rows = computeLeaderboard(inputs, 'sales_count', AUG);
    expect(rows[0]).toMatchObject({ agentId: 'b', value: 1, rank: 1 });
    expect(rows[1]).toMatchObject({ agentId: 'a', value: 0.7, rank: 2 });
  });

  it('ignores sales from agents missing in the inputs but still counts them in totals', () => {
    const inputs: LeaderboardInputs = {
      agents: [agent('a', 'Alice')],
      sales: [
        sale('a', 100_000, '2026-08-05'),
        sale('ghost', 200_000, '2026-08-06'), // agentId not present in inputs.agents
      ],
      listings: [],
    };
    const rows = computeLeaderboard(inputs, 'gci', AUG);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ agentId: 'a', value: 100_000 });
    expect(computeMetricTotal(inputs, 'gci', AUG)).toBe(300_000);
  });
});

describe('computeMetricTotal', () => {
  it('includes inactive agents, filters by period, for all three metrics', () => {
    const inputs: LeaderboardInputs = {
      agents: [agent('a', 'Alice'), agent('b', 'Bob', false)],
      sales: [
        sale('a', 100_000, '2026-08-05'),
        sale('b', 200_000, '2026-08-06'), // inactive agent still counts
        sale('a', 900_000, '2026-07-01'), // out of period
      ],
      listings: [
        listing('b', '2026-08-10'),
        listing('a', '2026-06-01'), // out of period
      ],
    };
    expect(computeMetricTotal(inputs, 'sales_count', AUG)).toBe(2);
    expect(computeMetricTotal(inputs, 'gci', AUG)).toBe(300_000);
    expect(computeMetricTotal(inputs, 'listings', AUG)).toBe(1);
  });

  it('sales_count total sums splits (not row count)', () => {
    const inputs: LeaderboardInputs = {
      agents: [agent('a', 'Alice')],
      sales: [
        sale('a', 100_000, '2026-08-05', '2026-08-05T10:00:00', 1),
        sale('a', 100_000, '2026-08-06', '2026-08-06T10:00:00', 0.8),
        sale('ghost', 100_000, '2026-08-07', '2026-08-07T10:00:00', 0.5),
        sale('a', 100_000, '2026-07-01', '2026-07-01T10:00:00', 0.5), // out of period
      ],
      listings: [],
    };
    // 浮点求和用 toBeCloseTo(1 + 0.8 + 0.5 = 2.3)
    expect(computeMetricTotal(inputs, 'sales_count', AUG)).toBeCloseTo(2.3, 12);
  });
});

describe('format', () => {
  it('formatMoney: three tiers', () => {
    expect(formatMoney(0)).toBe('$0');
    expect(formatMoney(850_000)).toBe('$8,500');       // < $10k → full with thousands separator
    expect(formatMoney(1_000_000)).toBe('$10K');       // ≥ $10k → K, rounded
    expect(formatMoney(8_500_000)).toBe('$85K');
    expect(formatMoney(100_000_000)).toBe('$1M');      // ≥ $1M → M, trailing zeros trimmed
    expect(formatMoney(150_000_000)).toBe('$1.5M');
    expect(formatMoney(142_000_000)).toBe('$1.42M');
  });

  it('formatValue: gci uses formatMoney, whole counts render bare', () => {
    expect(formatValue('gci', 850_000)).toBe('$8,500');
    expect(formatValue('sales_count', 7)).toBe('7');
    expect(formatValue('listings', 3)).toBe('3');
  });

  it('formatValue: fractional sales counts keep one decimal and trim .0 (设计 §3)', () => {
    expect(formatValue('sales_count', 8)).toBe('8');
    expect(formatValue('sales_count', 1.8)).toBe('1.8');
    expect(formatValue('sales_count', 0.7)).toBe('0.7');
    // Σsplit 的浮点尘埃要先四舍五入到 1 位小数再判整,不能直接 String()
    expect(formatValue('sales_count', 7.999999999999999)).toBe('8');
  });
});
