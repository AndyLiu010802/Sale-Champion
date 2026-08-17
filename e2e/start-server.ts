process.env.PGLITE_MEMORY = '1';
// bootstrap.ts loads .env via @next/env — a developer .env may carry DATABASE_URL,
// which must never leak into an E2E run against the in-memory database.
delete process.env.DATABASE_URL;
process.env.SESSION_SECRET ||= 'e2e-secret-e2e-secret-e2e-secret-!!';
process.env.ADMIN_EMAIL = 'admin@e2e.dev';
process.env.ADMIN_PASSWORD = 'e2e-password';
import { getDb } from '../src/lib/db';
import { seed } from '../src/lib/db/seed';
import { startServer } from '../src/server/bootstrap';
const port = Number(process.env.PORT) || 3344;
(async () => {
  const db = await getDb();
  await seed(db, { demo: true });
  await startServer(port);
  console.log('E2E server ready');
})();
