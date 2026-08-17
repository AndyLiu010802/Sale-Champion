import { asc, eq } from 'drizzle-orm';
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

  const rows = await db.select().from(screens)
    .where(eq(screens.orgId, orgId))
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
