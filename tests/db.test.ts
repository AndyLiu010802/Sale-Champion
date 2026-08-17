import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { freshDb, seedBasics } from './helpers/db';
import type { Db } from '@/lib/db';
import { getOrgId } from '@/lib/db/org';
import { seed } from '@/lib/db/seed';
import {
  orgs, users, agents, sales, listings, announcements, goals, settings,
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
    const data = settingsRows[0].data as { leaderboardPeriod: string; celebrationDurationSec: number };
    expect(data.leaderboardPeriod).toBe('month');
    expect(data.celebrationDurationSec).toBe(18);
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
