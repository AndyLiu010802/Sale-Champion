import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { getOrgId } from '@/lib/db/org';
import { screens } from '@/lib/db/schema';
import { requireAdmin } from '@/lib/auth/session';
import { getHub } from '@/lib/ws/hub';
import { generateDeviceToken, hashToken, isPairCodeExpired } from '@/lib/domain/pairing';

const bodySchema = z.object({
  pairCode: z.string().min(1),
  name: z.string().min(1),
});

export async function POST(req: Request): Promise<Response> {
  const session = await requireAdmin(req);
  if (session instanceof Response) return session;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'Invalid body' }, { status: 400 });
  }
  const { pairCode, name } = parsed.data;

  const db = await getDb();
  const orgId = await getOrgId(db);
  const code = pairCode.toUpperCase();
  const rows = await db.select().from(screens)
    .where(and(eq(screens.pairCode, code), eq(screens.status, 'pending'), eq(screens.orgId, orgId)))
    .limit(1);
  const row = rows[0];
  if (!row || !row.pairCodeExpiresAt || isPairCodeExpired(row.pairCodeExpiresAt, new Date())) {
    return Response.json({ error: 'Invalid or expired code' }, { status: 400 });
  }

  const token = generateDeviceToken();
  // Guard the UPDATE on status='pending' too: a concurrent pair of the same
  // code could have already claimed this row between the SELECT above and
  // here. If returning() is empty, the claim lost the race — treat it the
  // same as an invalid/expired code rather than silently overwriting.
  const updated = await db.update(screens).set({
    name,
    deviceTokenHash: hashToken(token),
    status: 'paired',
    pairCode: null,
    pairCodeExpiresAt: null,
  }).where(and(eq(screens.id, row.id), eq(screens.status, 'pending'))).returning();
  const paired = updated[0];
  if (!paired) {
    return Response.json({ error: 'Invalid or expired code' }, { status: 400 });
  }

  const hub = getHub();
  hub.sendToScreen(paired.id, {
    type: 'paired',
    deviceToken: token,
    screen: { id: paired.id, name: paired.name },
  });
  hub.markPaired(paired.id);

  return Response.json({ data: { id: paired.id, name: paired.name } });
}
