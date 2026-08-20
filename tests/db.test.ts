import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import { eq, sql } from 'drizzle-orm';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import { freshDb, seedBasics } from './helpers/db';
import { assertSchemaAtHead, getDb, migrateToLatest, type Db } from '@/lib/db';
import { getOrgId } from '@/lib/db/org';
import { seed } from '@/lib/db/seed';
import { DEFAULT_SETTINGS } from '@/lib/settings';
import {
  orgs, users, agents, appraisals, sales, listings, announcements, goals, settings,
} from '@/lib/db/schema';

describe('database layer', () => {
  let db: Db;

  beforeEach(async () => {
    db = await freshDb();
  });

  it('runs migrations and round-trips org, agent and sale', async () => {
    const { orgId, agentId } = await seedBasics(db);
    const saleId = crypto.randomUUID();
    await db.insert(sales).values({
      id: saleId,
      orgId,
      agentId,
      address: '1 Test Street, Testville',
      salePriceCents: 150000000,
      gciCents: 3000000,
      saleDate: '2026-08-15',
    });

    const rows = await db.select().from(sales).where(eq(sales.id, saleId));
    expect(rows).toHaveLength(1);
    expect(rows[0].agentId).toBe(agentId);
    expect(rows[0].salePriceCents).toBe(150000000);
    expect(rows[0].gciCents).toBe(3000000);
    expect(rows[0].saleDate).toBe('2026-08-15');
    expect(rows[0].createdAt).toBeInstanceOf(Date);
  });

  it('round-trips agent role/birthday and org lastBirthdayBroadcastDate', async () => {
    const { orgId, agentId } = await seedBasics(db);

    // 既有行走默认值:role='agent'、birthday 为 null(零迁移成本)
    const [alice] = await db.select().from(agents).where(eq(agents.id, agentId));
    expect(alice.role).toBe('agent');
    expect(alice.birthday).toBeNull();

    const staffId = crypto.randomUUID();
    await db.insert(agents).values({
      id: staffId, orgId, name: 'Front Desk Fay', role: 'staff', birthday: '08-18',
    });
    const [fay] = await db.select().from(agents).where(eq(agents.id, staffId));
    expect(fay.role).toBe('staff');
    expect(fay.birthday).toBe('08-18');

    const [orgBefore] = await db.select().from(orgs).where(eq(orgs.id, orgId));
    expect(orgBefore.lastBirthdayBroadcastDate).toBeNull();

    await db.update(orgs).set({ lastBirthdayBroadcastDate: '2026-08-18' }).where(eq(orgs.id, orgId));
    const [orgAfter] = await db.select().from(orgs).where(eq(orgs.id, orgId));
    expect(orgAfter.lastBirthdayBroadcastDate).toBe('2026-08-18');
  });

  it('round-trips sales.split and an appraisals row', async () => {
    const { orgId, agentId } = await seedBasics(db);

    const sharedId = crypto.randomUUID();
    await db.insert(sales).values({
      id: sharedId, orgId, agentId, address: '2 Split Street',
      salePriceCents: 0, gciCents: 144850, saleDate: '2026-08-11', split: 0.8,
    });
    const [sharedSale] = await db.select().from(sales).where(eq(sales.id, sharedId));
    expect(sharedSale.split).toBe(0.8);

    // 不显式给 split 的行落 DEFAULT 1(既有行零迁移成本)
    const plainId = crypto.randomUUID();
    await db.insert(sales).values({
      id: plainId, orgId, agentId, address: '3 Plain Street',
      salePriceCents: 0, gciCents: 100000, saleDate: '2026-08-12',
    });
    const [plainSale] = await db.select().from(sales).where(eq(sales.id, plainId));
    expect(plainSale.split).toBe(1);

    const appraisalId = crypto.randomUUID();
    await db.insert(appraisals).values({
      id: appraisalId, orgId, agentId, date: '2026-08-05', count: 8,
    });
    const [appraisal] = await db.select().from(appraisals).where(eq(appraisals.id, appraisalId));
    expect(appraisal.agentId).toBe(agentId);
    expect(appraisal.date).toBe('2026-08-05');
    expect(appraisal.count).toBe(8);
    expect(appraisal.createdAt).toBeInstanceOf(Date);
  });

  it('getOrgId resolves the first org', async () => {
    const { orgId } = await seedBasics(db);
    expect(await getOrgId(db)).toBe(orgId);
  });

  it('freshDb gives each test an isolated database', async () => {
    const agentRows = await db.select().from(agents);
    expect(agentRows).toHaveLength(0);
  });
});

describe('seed', () => {
  let db: Db;

  beforeEach(async () => {
    db = await freshDb();
    delete process.env.ADMIN_EMAIL;
    delete process.env.ADMIN_PASSWORD;
  });

  it('creates org, admin and settings, and is idempotent', async () => {
    const first = await seed(db);
    const second = await seed(db);
    expect(second.orgId).toBe(first.orgId);

    const orgRows = await db.select().from(orgs);
    expect(orgRows).toHaveLength(1);
    expect(orgRows[0].name).toBe('Default Agency');

    const userRows = await db.select().from(users);
    expect(userRows).toHaveLength(1);
    expect(userRows[0].email).toBe('admin@example.com');
    expect(userRows[0].passwordHash).not.toBe('admin1234'); // stored hashed, never plaintext

    const settingsRows = await db.select().from(settings);
    expect(settingsRows).toHaveLength(1);
    // seed 内联的 DEFAULT_SETTINGS_DATA 必须与 '@/lib/settings' 的 DEFAULT_SETTINGS 逐字段同步
    // (否则新库首读 safeParse 失败回落默认、seed 语义失真)——deep-equal 把同步约定钉死在测试里。
    expect(settingsRows[0].data).toEqual(DEFAULT_SETTINGS);
  });

  it('demo mode inserts demo rows exactly once, all sales in the current month', async () => {
    await seed(db, { demo: true });
    await seed(db, { demo: true }); // second run must not duplicate

    expect(await db.select().from(agents)).toHaveLength(4);
    const saleRows = await db.select().from(sales);
    expect(saleRows).toHaveLength(6);
    expect(await db.select().from(listings)).toHaveLength(4);
    expect(await db.select().from(announcements)).toHaveLength(1);
    expect(await db.select().from(goals)).toHaveLength(1);

    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    for (const row of saleRows) {
      expect(row.saleDate.startsWith(ym)).toBe(true);
    }
  });
});

// 生产事故回归(2026-08-20):drizzle 的 migrator 在事务外读 __drizzle_migrations 的最新
// created_at,所以两个并发 migrator(容器启动时 run-seed.ts 与 server.ts 各调一次 getDb())
// 可以都判定 0004 未应用;赢锁的一方提交后,另一方重跑 0004 撞上 42701
// 'column "team_id" of relation "agents" already exists',进程退出、生产启动链中断。
// 这里精确复现"DDL 已在库里、但迁移未记录"这一状态,钉住 0004 必须可重复应用。
describe('migration idempotency', () => {
  const MIGRATIONS = { migrationsFolder: path.join(process.cwd(), 'drizzle') };
  const TEAMS_MIGRATION_WHEN = 1787181726662; // drizzle/meta/_journal.json 的 0004 条目

  it('re-applies the teams migration when its row is missing but the column already exists', async () => {
    const db = await freshDb();
    await db.execute(
      sql`delete from drizzle.__drizzle_migrations where created_at >= ${TEAMS_MIGRATION_WHEN}`,
    );

    // 生产上这一步抛 42701 并杀掉启动;幂等改写后必须安静通过。
    await migratePglite(db as never, MIGRATIONS);

    // 列与自引用外键都还在,且迁移这次被记录下来了。
    const cols = await db.execute(
      sql`select column_name from information_schema.columns
          where table_name = 'agents' and column_name = 'team_id'`,
    );
    expect(cols.rows).toHaveLength(1);
    const fks = await db.execute(
      sql`select constraint_name from information_schema.table_constraints
          where table_name = 'agents' and constraint_name = 'agents_team_id_agents_id_fk'`,
    );
    expect(fks.rows).toHaveLength(1);
    const applied = await db.execute(
      sql`select created_at from drizzle.__drizzle_migrations where created_at = ${TEAMS_MIGRATION_WHEN}`,
    );
    expect(applied.rows).toHaveLength(1);

    // 外键仍然生效:队籍只能指向真实存在的行。
    const orgId = crypto.randomUUID();
    await db.insert(orgs).values({ id: orgId, name: 'FK Check Agency' });
    await expect(
      db.insert(agents).values({ id: crypto.randomUUID(), orgId, name: 'Orphan', teamId: 'nope' }),
    ).rejects.toThrow();
  });

  const FK_MIGRATION_WHEN = 1787188518141; // 0005_normalize_team_fk

  /** agents.team_id 这一列上现存的自引用外键名(按列查,不按名查)。 */
  async function teamIdForeignKeys(db: Db): Promise<string[]> {
    const res = await db.execute(sql`
      select conname from pg_constraint
      where conrelid = 'agents'::regclass and contype = 'f'
        and conkey = array[(select attnum from pg_attribute
                            where attrelid = 'agents'::regclass and attname = 'team_id')]
      order by conname`);
    return res.rows.map((r) => (r as { conname: string }).conname);
  }

  it('collapses a hand-made foreign key on team_id down to the canonical one', async () => {
    const db = await freshDb();
    // 生产库上 team_id 与一条外键是手工加的,名字不是规范名 —— 0004 的
    // DROP CONSTRAINT IF EXISTS 按名删,命中不到它,于是同列并存两条外键。
    await db.execute(sql`alter table agents add constraint agents_team_id_by_hand
                         foreign key (team_id) references agents(id)`);
    expect(await teamIdForeignKeys(db)).toHaveLength(2);

    await db.execute(
      sql`delete from drizzle.__drizzle_migrations where created_at >= ${FK_MIGRATION_WHEN}`);
    await migratePglite(db as never, MIGRATIONS);

    expect(await teamIdForeignKeys(db)).toEqual(['agents_team_id_agents_id_fk']);

    // 外键仍然生效:队籍只能指向真实存在的行。
    const orgId = crypto.randomUUID();
    await db.insert(orgs).values({ id: orgId, name: 'FK Normalise Agency' });
    await expect(
      db.insert(agents).values({ id: crypto.randomUUID(), orgId, name: 'Orphan', teamId: 'nope' }),
    ).rejects.toThrow();
  });

  it('is a no-op on a database that never had the hand-made key', async () => {
    const db = await freshDb();
    expect(await teamIdForeignKeys(db)).toEqual(['agents_team_id_agents_id_fk']);
    await db.execute(
      sql`delete from drizzle.__drizzle_migrations where created_at >= ${FK_MIGRATION_WHEN}`);
    await migratePglite(db as never, MIGRATIONS);
    expect(await teamIdForeignKeys(db)).toEqual(['agents_team_id_agents_id_fk']);
  });
});

// 迁移移出启动路径后的守门(生产事故 2026-08-20 的结构性修复):应用启动只连库,
// 迁移由 pre-deploy 的 npm run db:migrate 单独跑。启动时校验 schema 不落后于代码,
// 落后就拒绝监听——宁可红,也不要"健康检查绿、一查 team_id 就 42703"。
describe('assertSchemaAtHead', () => {

  it('passes on a freshly migrated database', async () => {
    const db = await freshDb();
    await expect(assertSchemaAtHead(db)).resolves.toBeUndefined();
  });

  it('refuses to serve when the newest applied migration is behind the code', async () => {
    const db = await freshDb();
    await db.execute(sql`delete from drizzle.__drizzle_migrations
                         where created_at = (select max(created_at) from drizzle.__drizzle_migrations)`);
    await expect(assertSchemaAtHead(db)).rejects.toThrow(/schema is behind the code/);
  });

  it('refuses to serve when the migration ledger does not exist at all', async () => {
    const db = await freshDb();
    await db.execute(sql`drop schema drizzle cascade`);
    await expect(assertSchemaAtHead(db)).rejects.toThrow(/never been migrated/);
  });
});

describe('migrateToLatest', () => {
  it('is safe to run twice', async () => {
    await freshDb();
    await expect(migrateToLatest()).resolves.toBeUndefined();
    await expect(migrateToLatest()).resolves.toBeUndefined();
    const db = await getDb();
    await expect(assertSchemaAtHead(db)).resolves.toBeUndefined();
  });
});
