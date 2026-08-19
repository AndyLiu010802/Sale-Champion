import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import { freshDb } from './helpers/db';
import type { Db } from '@/lib/db';
import { runSqlFile } from '@/lib/db/run-sql';
import { computeScorecard } from '@/lib/domain/scorecard';
import { orgs, agents, sales, listings, appraisals } from '@/lib/db/schema';

const SCORECARD_SQL = path.join(process.cwd(), 'docs', 'import', '2026-08-south-scorecard.sql');
const TEAMS_SQL = path.join(process.cwd(), 'docs', 'import', '2026-08-teams.sql');

/** 三个存量团队行 → 各自的成员名单(团队设计 §6,逐字)。 */
const ROSTER: Record<string, string[]> = {
  'Hill & Co': ['Marnie Hill', 'Martin Waldhoff'],
  'Team Cowley': ['Haylee Abbott', 'Nick Cowley'],
  'Team Brudenell': ['Alex Muller', 'Eloise', 'Mark Brudenell'],
};

describe('teams migration SQL', () => {
  let db: Db;

  beforeEach(async () => {
    db = await freshDb();
    // 与既有导入同前置:单一 org(脚本全程 (SELECT id FROM orgs LIMIT 1))。
    await db.insert(orgs).values({ id: crypto.randomUUID(), name: 'Import Test Agency' });
    await runSqlFile(db, SCORECARD_SQL);
  });

  it('converts the three standing team rows in place and attaches their members', async () => {
    await runSqlFile(db, TEAMS_SQL);
    const rows = await db.select().from(agents);
    expect(rows).toHaveLength(14); // 7 既有 + 7 新建成员

    const byName = new Map(rows.map((a) => [a.name, a]));
    for (const [teamName, memberNames] of Object.entries(ROSTER)) {
      const team = byName.get(teamName)!;
      expect(team.role).toBe('team');
      expect(team.birthday).toBeNull();
      expect(team.teamId).toBeNull(); // 团队不嵌套
      for (const memberName of memberNames) {
        const member = byName.get(memberName)!;
        expect(member).toBeDefined();
        expect(member.role).toBe('agent');
        expect(member.active).toBe(true);
        expect(member.photoUrl).toBeNull(); // 照片后台补传
        expect(member.teamId).toBe(team.id);
      }
    }
    // 未组队的四位个人成员不受影响。
    for (const solo of ['Chris Joyce', 'John Loveluck', 'Michael Hatzinicolaou', 'Kathy Roberts']) {
      expect(byName.get(solo)!.role).toBe('agent');
      expect(byName.get(solo)!.teamId).toBeNull();
    }
  });

  it('is idempotent — a second run changes nothing', async () => {
    await runSqlFile(db, TEAMS_SQL);
    const first = await db.select().from(agents);

    await runSqlFile(db, TEAMS_SQL);
    const second = await db.select().from(agents);
    expect(second).toHaveLength(first.length);
    expect(
      second.map((a) => `${a.name}|${a.role}|${a.teamId ?? ''}`).sort(),
    ).toEqual(first.map((a) => `${a.name}|${a.role}|${a.teamId ?? ''}`).sort());
    // 业绩行数也不该被这份迁移碰到。
    expect((await db.select().from(sales)).length).toBe(26);
    expect((await db.select().from(listings)).length).toBe(48);
    expect((await db.select().from(appraisals)).length).toBe(13);
  });

  it('does nothing at all when the scorecard import has not run first', async () => {
    // 前置未满足(三个队行不存在)时必须是空操作 —— 建出 7 个未挂队的成员会让他们
    // 直接上榜,比什么都不做糟糕得多。
    const fresh = await freshDb();
    await fresh.insert(orgs).values({ id: crypto.randomUUID(), name: 'Empty Agency' });
    await runSqlFile(fresh, TEAMS_SQL);
    expect(await fresh.select().from(agents)).toHaveLength(0);
  });

  it('leaves the YTD scorecard identical — members add no rows, teams keep theirs', async () => {
    await runSqlFile(db, TEAMS_SQL);
    const agentRows = await db.select().from(agents);
    const saleRows = await db.select().from(sales);
    const listingRows = await db.select().from(listings);
    const appraisalRows = await db.select().from(appraisals);

    const { totals, rows } = computeScorecard({
      // tv/state 的成行过滤(团队设计 §3):归队成员不成行,故这里同样先剔除。
      agents: agentRows
        .filter((a) => a.teamId === null)
        .map((a) => ({ id: a.id, name: a.name, role: a.role, active: a.active })),
      sales: saleRows.map((s) => ({ agentId: s.agentId, gciCents: s.gciCents, saleDate: s.saleDate, split: s.split })),
      listings: listingRows.map((l) => ({ agentId: l.agentId, listedDate: l.listedDate, split: l.split })),
      appraisals: appraisalRows.map((a) => ({ agentId: a.agentId, date: a.date, count: a.count })),
    }, { start: new Date(2026, 6, 1), end: new Date(2026, 8, 1) });

    // 与 tests/import.test.ts 的转 Team 前断言逐字一致——业绩本就挂在团队行上。
    expect(totals).toEqual({ appraisals: 141, listings: 46.7, salesSplit: 15, gciCents: 21_482_200 });
    expect(rows.map((r) => r.name)).toEqual([
      'Team Brudenell', 'Team Cowley', 'Chris Joyce', 'John Loveluck',
      'Michael Hatzinicolaou', 'Kathy Roberts', 'Hill & Co',
    ]);
  });
});
