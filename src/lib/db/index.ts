import { drizzle as drizzlePg, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import { PGlite } from '@electric-sql/pglite';
import { sql } from 'drizzle-orm';
import { Pool } from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import * as schema from './schema';

export type Db = NodePgDatabase<typeof schema>;

// Custom server (tsx) and Next-bundled route handlers live in separate module
// registries within the same process — a module-level variable would give each
// side its own database instance. globalThis is the only shared spot.
type DbGlobal = typeof globalThis & { __tvDb?: Promise<Db> };

const MIGRATIONS = { migrationsFolder: path.join(process.cwd(), 'drizzle') };

/** 'tv_m' — one migrator at a time per database(见 migrateToLatest)。 */
const MIGRATION_LOCK_KEY = 0x74765f6d;

async function buildDb(): Promise<Db> {
  if (process.env.DATABASE_URL) {
    // 生产路径:只连库,**不跑迁移**(事故 2026-08-20 的结构性修复)。迁移由部署前的
    // `npm run db:migrate` 单独跑,详见 migrateToLatest。请求容器不再做 DDL,也就不会
    // 出现两个进程并发迁移、或迁移失败导致整个服务起不来。
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      connectionTimeoutMillis: 10_000, // pg 默认 0 = 永远等下去
      application_name: 'tv-saas-app',
    });
    return drizzlePg(pool, { schema });
  }
  // 本地/测试/E2E 走 PGlite:单进程、单连接,没有并发迁移的问题,迁移就地跑最省事。
  let client: PGlite;
  if (process.env.PGLITE_MEMORY === '1') {
    client = new PGlite();
  } else {
    const dir = path.join(process.cwd(), '.data', 'pglite');
    fs.mkdirSync(dir, { recursive: true });
    client = new PGlite(dir);
  }
  const db = drizzlePglite(client, { schema }) as unknown as Db;
  await migratePglite(db as any, MIGRATIONS);
  return db;
}

export async function getDb(): Promise<Db> {
  const g = globalThis as DbGlobal;
  if (!g.__tvDb) g.__tvDb = buildDb();
  return g.__tvDb;
}

/**
 * 部署前专用,**绝不在服务请求的进程里调用**(`scripts/migrate.ts` → `npm run db:migrate`)。
 *
 * 用独占连接 + `pg_advisory_lock` 串行化:drizzle 的 migrator 在事务外读"最新已应用迁移"
 * 且自身不加锁,两个并发 migrator 会双双判定同一迁移待应用,后到的那个重复执行 DDL
 * (2026-08-20 生产事故:42701 column "team_id" already exists)。顾问锁把这个窗口封死。
 * `lock_timeout` 让抢不到表锁时快速失败并给出明确报错,而不是无限期挂住部署。
 */
export async function migrateToLatest(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    // 本地无 DATABASE_URL 时这是正常路径;但如果这行出现在**生产的 pre-deploy 日志**里,
    // 说明该步骤没拿到数据库变量,迁移迁到了一个用完即弃的 PGlite 上——等于没迁。
    console.log('[migrate] no DATABASE_URL — migrating the embedded PGlite database instead');
    await getDb(); // PGlite 分支在 buildDb 里就地迁移
    return;
  }
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: 10_000,
    lock_timeout: 15_000,       // 等表锁的上限(顾问锁与 ALTER TABLE 都适用)
    statement_timeout: 300_000, // 宽松:要能熬过一次真正的整表重写
    application_name: 'tv-saas-migrator',
  });
  try {
    console.log('[migrate] acquiring advisory lock');
    await pool.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
    console.log('[migrate] applying pending migrations');
    await migratePg(drizzlePg(pool, { schema }), MIGRATIONS);
    console.log('[migrate] up to date');
  } finally {
    await pool.end(); // 不 end 进程不会退出,pre-deploy 会一直挂着
  }
}

/** drizzle/meta/_journal.json 里最新一条迁移的 `when`(= 代码要求的 schema 版本)。 */
function journalHead(): number {
  const journal = JSON.parse(
    fs.readFileSync(path.join(MIGRATIONS.migrationsFolder, 'meta', '_journal.json'), 'utf8'),
  ) as { entries: { when: number }[] };
  return Math.max(...journal.entries.map((e) => e.when));
}

/**
 * 启动守门:schema 落后于代码就拒绝服务(fail closed)。
 *
 * drizzle 的跳过判断只看 `__drizzle_migrations` 里**最新一行**的 created_at,所以一旦
 * 迁移因故没跑成,应用照样能启动、健康检查照样返回 200,直到某个请求碰到不存在的列才
 * 报 42703。宁可在启动时红,也不要这种"绿的但坏的"状态——尤其 Railway 要等新容器健康
 * 才肯撤旧容器,启动即失败反而能保住上一版继续服务。
 */
export async function assertSchemaAtHead(db: Db): Promise<void> {
  const present = await db.execute(
    sql`select to_regclass('drizzle.__drizzle_migrations') is not null as present`,
  );
  if (!(present.rows[0] as { present: boolean } | undefined)?.present) {
    throw new Error(
      '[boot] this database has never been migrated — run `npm run db:migrate` before starting',
    );
  }
  const res = await db.execute(
    sql`select coalesce(max(created_at), 0)::text as at from drizzle.__drizzle_migrations`,
  );
  const applied = Number((res.rows[0] as { at: string | null } | undefined)?.at ?? 0);
  const head = journalHead();
  if (applied < head) {
    throw new Error(
      `[boot] schema is behind the code (applied=${applied} head=${head}) — `
      + 'the pre-deploy migration did not run; run `npm run db:migrate`',
    );
  }
}

/** Tests only: drop the singleton so the next getDb() builds a fresh database. */
export async function resetDb(): Promise<void> {
  delete (globalThis as DbGlobal).__tvDb;
}
