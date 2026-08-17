import { and, asc, eq, gt, or } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { getOrgId } from '@/lib/db/org';
import { screens } from '@/lib/db/schema';
import { requireAdmin } from '@/lib/auth/session';
import { getHub } from '@/lib/ws/hub';

export async function GET(req: Request): Promise<Response> {
  const session = await requireAdmin(req);
  if (session instanceof Response) return session;

  const db = await getDb();
  const orgId = await getOrgId(db);
  const hub = getHub();

  // Paired screens always show; pending screens only show while their
  // pairing code is still live, so expired/abandoned pending rows don't
  // clutter the admin list (they get physically purged on next /tv/register).
  const rows = await db.select().from(screens)
    .where(and(
      eq(screens.orgId, orgId),
      or(eq(screens.status, 'paired'), gt(screens.pairCodeExpiresAt, new Date())),
    ))
    .orderBy(asc(screens.createdAt));

  const data = rows.map((s) => ({
    id: s.id,
    name: s.name,
    status: s.status,
    online: hub.isOnline(s.id),
    lastSeenAt: s.lastSeenAt ? s.lastSeenAt.toISOString() : null,
  }));
  return Response.json({ data });
}
