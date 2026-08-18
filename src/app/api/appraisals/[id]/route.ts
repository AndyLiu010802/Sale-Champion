import { and, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { getOrgId } from '@/lib/db/org';
import { appraisals } from '@/lib/db/schema';
import { requireAdmin } from '@/lib/auth/session';
import { getHub } from '@/lib/ws/hub';

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin(req);
  if (session instanceof Response) return session;
  const { id } = await ctx.params;
  const db = await getDb();
  const orgId = await getOrgId(db);
  const [existing] = await db
    .select()
    .from(appraisals)
    .where(and(eq(appraisals.id, id), eq(appraisals.orgId, orgId)));
  if (!existing) return Response.json({ error: 'Not found' }, { status: 404 });
  await db.delete(appraisals).where(and(eq(appraisals.id, id), eq(appraisals.orgId, orgId)));
  getHub().broadcast({ type: 'data.updated', domain: 'appraisals' });
  return Response.json({ data: { id } });
}
