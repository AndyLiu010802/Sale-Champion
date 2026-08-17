import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { freshDb, seedBasics } from './helpers/db';
import type { Db } from '@/lib/db';
import { getOrgId } from '@/lib/db/org';
import { agents, sales } from '@/lib/db/schema';

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
