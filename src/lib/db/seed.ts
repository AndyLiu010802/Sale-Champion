import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import type { Db } from './index';
import {
  orgs, users, agents, sales, listings, announcements, goals, settings,
} from './schema';

// Keep in sync with DEFAULT_SETTINGS in '@/lib/settings' (introduced in Task 9).
// Inlined here because seed.ts is created before settings.ts exists.
// 同步性由 tests/db.test.ts 的 toEqual(DEFAULT_SETTINGS) 断言钉死(scorecard Task 3)。
const DEFAULT_SETTINGS_DATA = {
  slides: [
    { key: 'scorecard', enabled: true, durationSec: 20 },
    { key: 'leaderboard_sales_count', enabled: true, durationSec: 15 },
    { key: 'leaderboard_gci', enabled: true, durationSec: 15 },
    { key: 'leaderboard_listings', enabled: true, durationSec: 15 },
    { key: 'goal_progress', enabled: true, durationSec: 10 },
    { key: 'listings', enabled: true, durationSec: 12 },
    { key: 'announcements', enabled: true, durationSec: 10 },
  ],
  leaderboardPeriod: 'month',
  celebrationDurationSec: 18,
  volume: 0.8,
  defaultAnthemUrl: 'builtin:victory',
};

export async function seed(db: Db, opts: { demo?: boolean } = {}): Promise<{ orgId: string }> {
  // Org: create only if none exists (name 'Default Agency').
  const existingOrg = await db.select().from(orgs).limit(1);
  let orgId: string;
  if (existingOrg[0]) {
    orgId = existingOrg[0].id;
  } else {
    orgId = crypto.randomUUID();
    await db.insert(orgs).values({ id: orgId, name: 'Default Agency' });
  }

  // Admin user: upsert by ADMIN_EMAIL (defaults match .env.example).
  const adminEmail = process.env.ADMIN_EMAIL ?? 'admin@example.com';
  if (!process.env.ADMIN_PASSWORD) {
    console.warn(
      '[seed] WARNING: ADMIN_PASSWORD not set — using the default password "admin1234". ' +
      'Set ADMIN_PASSWORD in .env before deploying to production.',
    );
  }
  const adminPassword = process.env.ADMIN_PASSWORD ?? 'admin1234';
  const passwordHash = await bcrypt.hash(adminPassword, 10);
  const existingAdmin = await db.select().from(users).where(eq(users.email, adminEmail));
  if (existingAdmin[0]) {
    await db.update(users).set({ passwordHash }).where(eq(users.id, existingAdmin[0].id));
  } else {
    await db.insert(users).values({
      id: crypto.randomUUID(), orgId, email: adminEmail, passwordHash, name: 'Admin',
    });
  }

  // Settings: write defaults only if the row does not exist yet.
  const existingSettings = await db.select().from(settings).where(eq(settings.orgId, orgId));
  if (!existingSettings[0]) {
    await db.insert(settings).values({ orgId, data: DEFAULT_SETTINGS_DATA });
  }

  if (opts.demo) {
    await seedDemoData(db, orgId);
  }

  return { orgId };
}

async function seedDemoData(db: Db, orgId: string): Promise<void> {
  // Demo rows go in only when the agents table is empty (idempotent).
  const existingAgents = await db.select().from(agents).limit(1);
  if (existingAgents.length > 0) return;

  const sophie = crypto.randomUUID();
  const marcus = crypto.randomUUID();
  const priya = crypto.randomUUID();
  const jake = crypto.randomUUID();
  await db.insert(agents).values([
    { id: sophie, orgId, name: 'Sophie Chen' },
    { id: marcus, orgId, name: 'Marcus Webb' },
    { id: priya, orgId, name: 'Priya Sharma' },
    { id: jake, orgId, name: 'Jake Thompson' },
  ]);

  // All demo dates fall in the current month, clamped to today so nothing is in the future.
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const day = (d: number) => `${ym}-${String(Math.min(d, now.getDate())).padStart(2, '0')}`;

  await db.insert(sales).values([
    { id: crypto.randomUUID(), orgId, agentId: sophie, address: '12 Harbour View Terrace, Mosman', salePriceCents: 185000000, gciCents: 3700000, saleDate: day(2) },
    { id: crypto.randomUUID(), orgId, agentId: sophie, address: '4/88 Beach Road, Bondi', salePriceCents: 120000000, gciCents: 2400000, saleDate: day(5) },
    { id: crypto.randomUUID(), orgId, agentId: marcus, address: '27 Eucalyptus Drive, Chatswood', salePriceCents: 240000000, gciCents: 4800000, saleDate: day(8) },
    { id: crypto.randomUUID(), orgId, agentId: priya, address: '9 Fig Tree Lane, Paddington', salePriceCents: 165000000, gciCents: 3300000, saleDate: day(11) },
    { id: crypto.randomUUID(), orgId, agentId: priya, address: '302/15 Wharf Street, Milsons Point', salePriceCents: 98000000, gciCents: 1960000, saleDate: day(13) },
    { id: crypto.randomUUID(), orgId, agentId: jake, address: '71 Banksia Avenue, Manly', salePriceCents: 210000000, gciCents: 4200000, saleDate: day(16) },
  ]);

  await db.insert(listings).values([
    { id: crypto.randomUUID(), orgId, agentId: sophie, address: '18 Curlewis Street, Bondi Beach', listPriceCents: 199500000, listedDate: day(3), status: 'active' },
    { id: crypto.randomUUID(), orgId, agentId: marcus, address: '5 Alexandra Parade, Clovelly', listPriceCents: 325000000, listedDate: day(7), status: 'active' },
    { id: crypto.randomUUID(), orgId, agentId: priya, address: '22/2 Ocean Avenue, Double Bay', listPriceCents: 145000000, listedDate: day(10), status: 'active' },
    { id: crypto.randomUUID(), orgId, agentId: jake, address: '36 Kangaroo Street, Randwick', listPriceCents: 178000000, listedDate: day(14), status: 'active' },
  ]);

  await db.insert(announcements).values({
    id: crypto.randomUUID(), orgId,
    title: 'Welcome to Sales Champions TV',
    body: 'Every deal counts this month — ring the bell and top the board!',
    enabled: true, sortOrder: 0,
  });

  await db.insert(goals).values({
    id: crypto.randomUUID(), orgId,
    metric: 'gci', targetValue: 25000000, period: 'month', active: true,
  });
}
