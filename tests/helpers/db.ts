import { getDb, resetDb, type Db } from '@/lib/db';
import { resetOrgCache } from '@/lib/db/org';
import { resetHub } from '@/lib/ws/hub';
import { orgs, users, agents } from '@/lib/db/schema';
import { hashPassword } from '@/lib/auth/password';

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
    passwordHash: await hashPassword(adminPassword), name: 'Admin',
  });
  const agentId = crypto.randomUUID();
  await db.insert(agents).values({ id: agentId, orgId, name: 'Alice Ng' });
  return { orgId, adminEmail, adminPassword, agentId };
}
