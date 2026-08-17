import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
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
  const code = pairCode.toUpperCase();
  const rows = await db.select().from(screens)
    .where(and(eq(screens.pairCode, code), eq(screens.status, 'pending')))
    .limit(1);
  const row = rows[0];
  if (!row || !row.pairCodeExpiresAt || isPairCodeExpired(row.pairCodeExpiresAt, new Date())) {
    return Response.json({ error: 'Invalid or expired code' }, { status: 400 });
  }

  const token = generateDeviceToken();
  await db.update(screens).set({
    name,
    deviceTokenHash: hashToken(token),
    status: 'paired',
    pairCode: null,
    pairCodeExpiresAt: null,
  }).where(eq(screens.id, row.id));

  const hub = getHub();
  hub.sendToScreen(row.id, {
    type: 'paired',
    deviceToken: token,
    screen: { id: row.id, name },
  });
  hub.markPaired(row.id);

  return Response.json({ data: { id: row.id, name } });
}
