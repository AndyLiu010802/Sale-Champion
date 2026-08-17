import { and, eq, lte } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { getOrgId } from '@/lib/db/org';
import { screens } from '@/lib/db/schema';
import { generatePairCode, pairCodeExpiry } from '@/lib/domain/pairing';

export async function POST(): Promise<Response> {
  const db = await getDb();
  const orgId = await getOrgId(db);
  const now = new Date();

  // Purge expired pending rows so abandoned codes do not pile up.
  // lte matches isPairCodeExpired (now >= expiresAt counts as expired).
  await db.delete(screens).where(
    and(eq(screens.status, 'pending'), lte(screens.pairCodeExpiresAt, now)),
  );

  const id = crypto.randomUUID();
  const pairCode = generatePairCode().toUpperCase();
  const expiresAt = pairCodeExpiry(now);
  await db.insert(screens).values({
    id,
    orgId,
    pairCode,
    pairCodeExpiresAt: expiresAt,
    status: 'pending',
  });

  return Response.json({
    data: { screenId: id, pairCode, expiresAt: expiresAt.toISOString() },
  });
}
