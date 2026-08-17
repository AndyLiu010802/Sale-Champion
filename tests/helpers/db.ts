// PROVISIONAL VERSION (Task 2, resetHub wired in Task 3).
// One follow-up edit is already scheduled — do not "fix" it here:
//   - Task 7 adds `import { hashPassword } from '@/lib/auth/password';` and replaces the
//     'placeholder-hash' literal below with `await hashPassword(adminPassword)`.
// Until Task 7, the stored hash is a fixed placeholder, so password login against this
// user is not testable yet — auth tests only arrive with Task 7.
import { getDb, resetDb, type Db } from '@/lib/db';
import { resetOrgCache } from '@/lib/db/org';
import { resetHub } from '@/lib/ws/hub';
import { orgs, users, agents } from '@/lib/db/schema';

/** Fresh in-memory database (and clean hub/org caches) for each test file/case. */
export async function freshDb(): Promise<Db> {
  process.env.PGLITE_MEMORY = '1';
  delete process.env.DATABASE_URL;
  await resetDb();
  resetOrgCache();
  resetHub();
  return getDb();
}

export type Basics = { orgId: string; adminEmail: string; adminPassword: string; agentId: string };

/** org + admin(admin@test.dev / secret123)+ 一个销售员 Alice。 */
export async function seedBasics(db: Db): Promise<Basics> {
  const orgId = crypto.randomUUID();
  await db.insert(orgs).values({ id: orgId, name: 'Test Agency' });
  const adminEmail = 'admin@test.dev';
  const adminPassword = 'secret123';
  await db.insert(users).values({
    id: crypto.randomUUID(), orgId, email: adminEmail,
    passwordHash: 'placeholder-hash', name: 'Admin',
  });
  const agentId = crypto.randomUUID();
  await db.insert(agents).values({ id: agentId, orgId, name: 'Alice Ng' });
  return { orgId, adminEmail, adminPassword, agentId };
}
