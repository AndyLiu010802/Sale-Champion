import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import { freshDb } from './helpers/db';
import type { Db } from '@/lib/db';
import { runSqlFile, splitSqlStatements } from '@/lib/db/run-sql';
import { computeScorecard } from '@/lib/domain/scorecard';
import { orgs, agents, sales, listings, appraisals } from '@/lib/db/schema';

const SQL_FILE = path.join(process.cwd(), 'docs', 'import', '2026-08-south-scorecard.sql');

async function rowCounts(db: Db) {
  return {
    agents: (await db.select().from(agents)).length,
    sales: (await db.select().from(sales)).length,
    listings: (await db.select().from(listings)).length,
    appraisals: (await db.select().from(appraisals)).length,
  };
}

describe('splitSqlStatements', () => {
  it('splits on end-of-line semicolons and drops comment-only chunks', () => {
    const text = [
      '-- header comment',
      'INSERT INTO a (x) VALUES (1);',
      '',
      'INSERT INTO b (y)',
      'SELECT 2 WHERE NOT EXISTS (SELECT 1 FROM b WHERE y = 2);',
      '-- trailing comment',
    ].join('\n');
    const statements = splitSqlStatements(text);
    expect(statements).toHaveLength(2);
    expect(statements[0]).toContain('INSERT INTO a');
    expect(statements[1]).toContain('WHERE NOT EXISTS');
  });
});

describe('july + august scorecard import SQL', () => {
  let db: Db;

  beforeEach(async () => {
    db = await freshDb();
    // 导入 SQL 用 (SELECT id FROM orgs LIMIT 1) 取组织——预置一个 org(生产库 seed 已建)。
    await db.insert(orgs).values({ id: crypto.randomUUID(), name: 'Import Test Agency' });
  });

  it('imports the dataset with per-row values from the spec (§7 + §7b)', async () => {
    await runSqlFile(db, SQL_FILE);
    expect(await rowCounts(db)).toEqual({ agents: 7, sales: 26, listings: 48, appraisals: 13 });

    const saleRows = await db.select().from(sales);
    // YTD Σsplit = 15(8 月 8 + 7 月 7);GCI 总额 = 21,482,200 分($214,822)
    expect(saleRows.reduce((s, r) => s + r.split, 0)).toBeCloseTo(15, 12);
    expect(saleRows.reduce((s, r) => s + r.gciCents, 0)).toBe(21_482_200);
    expect(saleRows.every((r) => r.salePriceCents === 0)).toBe(true);

    const listingRows = await db.select().from(listings);
    expect(listingRows.every((r) => r.status === 'sold' && r.listPriceCents === 0)).toBe(true);
    // YTD 房源 Σsplit = 46.65(8 月 11 + 7 月 35.65)
    expect(listingRows.reduce((s, r) => s + r.split, 0)).toBeCloseTo(46.65, 12);

    const agentRows = await db.select().from(agents);
    const idOf = (name: string) => agentRows.find((a) => a.name === name)!.id;
    // John Loveluck 8 月两行 split 1.0 + 0.8;Kathy Roberts 8 月 0.2 + 7 月 4×0.3
    expect(
      saleRows.filter((r) => r.agentId === idOf('John Loveluck')).map((r) => r.split).sort((a, b) => a - b),
    ).toEqual([0.8, 1]);
    expect(
      saleRows.filter((r) => r.agentId === idOf('Kathy Roberts')).map((r) => r.split).sort((a, b) => a - b),
    ).toEqual([0.2, 0.3, 0.3, 0.3, 0.3]);
    // Team Brudenell 7 月佣金均摊余数进首行:829,220 + 5×829,216 = 4,975,300
    expect(
      saleRows.filter((r) => r.agentId === idOf('Team Brudenell')).map((r) => r.gciCents).sort((a, b) => b - a),
    ).toEqual([829_220, 829_216, 829_216, 829_216, 829_216, 829_216]);
    // Hill & Co 的 7 月小数房源行 0.66
    expect(
      listingRows.filter((r) => r.agentId === idOf('Hill & Co')).map((r) => r.split).sort((a, b) => a - b),
    ).toEqual([0.66, 1, 1, 1]);

    // 估价总数 141(8 月 36 + 7 月 105,逐行口径,设计 §7/§7b)
    const appraisalRows = await db.select().from(appraisals);
    expect(appraisalRows.reduce((s, r) => s + r.count, 0)).toBe(141);
  });

  it('reproduces the spec YTD scorecard from the imported rows', async () => {
    await runSqlFile(db, SQL_FILE);
    const agentRows = await db.select().from(agents);
    const saleRows = await db.select().from(sales);
    const listingRows = await db.select().from(listings);
    const appraisalRows = await db.select().from(appraisals);

    // 固定财年窗口 2026-07-01 ~ 2026-09-01(排他),不依赖测试运行日期。
    const { totals, rows } = computeScorecard({
      agents: agentRows.map((a) => ({ id: a.id, name: a.name, role: a.role, active: a.active })),
      sales: saleRows.map((s) => ({ agentId: s.agentId, gciCents: s.gciCents, saleDate: s.saleDate, split: s.split })),
      listings: listingRows.map((l) => ({ agentId: l.agentId, listedDate: l.listedDate, split: l.split })),
      appraisals: appraisalRows.map((a) => ({ agentId: a.agentId, date: a.date, count: a.count })),
    }, { start: new Date(2026, 6, 1), end: new Date(2026, 8, 1) });

    // 设计 §7b:Σsplit 15、GCI $214,822、Appraisals 141;Listings 逐行 46.65,
    // 行值按 1 位小数呈现后合计 46.7(46.65 无法以 1 位小数显示)。
    expect(totals).toEqual({ appraisals: 141, listings: 46.7, salesSplit: 15, gciCents: 21_482_200 });
    expect(rows.map((r) => r.name)).toEqual([
      'Team Brudenell', 'Team Cowley', 'Chris Joyce', 'John Loveluck',
      'Michael Hatzinicolaou', 'Kathy Roberts', 'Hill & Co',
    ]);
    // Brudenell 行:A26 / L7.7 / S6 / split 3 / $49,753 / conversion 7.66÷26 → 29.5%
    expect(rows[0]).toMatchObject({
      appraisals: 26, listings: 7.7, sales: 6, split: 3, gciCents: 4_975_300, conversionPct: 29.5,
    });
  });

  it('is idempotent — a second run changes nothing', async () => {
    await runSqlFile(db, SQL_FILE);
    const first = await rowCounts(db);
    const firstSales = await db.select().from(sales);
    const firstGciCents = firstSales.reduce((s, r) => s + r.gciCents, 0);
    const firstSplitTotal = firstSales.reduce((s, r) => s + r.split, 0);

    await runSqlFile(db, SQL_FILE);
    expect(await rowCounts(db)).toEqual(first);
    expect(first).toEqual({ agents: 7, sales: 26, listings: 48, appraisals: 13 });

    const secondSales = await db.select().from(sales);
    expect(secondSales.reduce((s, r) => s + r.gciCents, 0)).toBe(firstGciCents);
    expect(secondSales.reduce((s, r) => s + r.split, 0)).toBeCloseTo(firstSplitTotal, 12);
  });
});
