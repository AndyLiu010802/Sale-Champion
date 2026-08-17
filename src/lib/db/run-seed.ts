import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import { getDb } from './index';
import { seed } from './seed';

const demo = process.argv.includes('--demo');

(async () => {
  const db = await getDb();
  const result = await seed(db, { demo });
  console.log(`Seed complete: org=${result.orgId} demo=${demo}`);
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
