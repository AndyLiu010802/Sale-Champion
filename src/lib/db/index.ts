import { drizzle as drizzlePg, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import { PGlite } from '@electric-sql/pglite';
import { Pool } from 'pg';
import path from 'node:path';
import * as schema from './schema';

export type Db = NodePgDatabase<typeof schema>;

// Custom server (tsx) and Next-bundled route handlers live in separate module
// registries within the same process — a module-level variable would give each
// side its own database instance. globalThis is the only shared spot.
type DbGlobal = typeof globalThis & { __tvDb?: Promise<Db> };

const MIGRATIONS = { migrationsFolder: path.join(process.cwd(), 'drizzle') };

async function buildDb(): Promise<Db> {
  if (process.env.DATABASE_URL) {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const db = drizzlePg(pool, { schema });
    await migratePg(db, MIGRATIONS);
    return db;
  }
  const client = process.env.PGLITE_MEMORY === '1'
    ? new PGlite()
    : new PGlite(path.join(process.cwd(), '.data', 'pglite'));
  const db = drizzlePglite(client, { schema }) as unknown as Db;
  await migratePglite(db as any, MIGRATIONS);
  return db;
}

export async function getDb(): Promise<Db> {
  const g = globalThis as DbGlobal;
  if (!g.__tvDb) g.__tvDb = buildDb();
  return g.__tvDb;
}

/** Tests only: drop the singleton so the next getDb() builds a fresh database. */
export async function resetDb(): Promise<void> {
  delete (globalThis as DbGlobal).__tvDb;
}
