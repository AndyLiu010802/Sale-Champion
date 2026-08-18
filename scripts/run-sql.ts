import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import path from 'node:path';
import { getDb } from '../src/lib/db';
import { runSqlFile } from '../src/lib/db/run-sql';

// 用法:npx tsx scripts/run-sql.ts docs/import/2026-08-south-scorecard.sql
// 不设 DATABASE_URL 时写本地 PGlite(.data/pglite);设了则连远程库。
const fileArg = process.argv[2];
if (!fileArg) {
  console.error('Usage: npx tsx scripts/run-sql.ts <path-to-sql-file>');
  process.exit(1);
}

(async () => {
  const db = await getDb();
  const count = await runSqlFile(db, path.resolve(fileArg));
  console.log(`Executed ${count} statements from ${fileArg}`);
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
