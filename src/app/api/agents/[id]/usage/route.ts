import { and, count, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { getOrgId } from '@/lib/db/org';
import { agents, appraisals, listings, sales } from '@/lib/db/schema';
import { requireAdmin } from '@/lib/auth/session';

// GET /api/agents/[id]/usage(清理设计 §2.2):删除确认弹窗用的记录计数。
// 返回行数——一条 appraisals 录入行算 1,不按其 count 字段展开。只读,不广播。
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin(req);
  if (session instanceof Response) return session;
  const { id } = await ctx.params;
  const db = await getDb();
  const orgId = await getOrgId(db);
  const [existing] = await db
    .select()
    .from(agents)
    .where(and(eq(agents.id, id), eq(agents.orgId, orgId)));
  if (!existing) return Response.json({ error: 'Not found' }, { status: 404 });
  const [salesCount] = await db
    .select({ value: count() })
    .from(sales)
    .where(and(eq(sales.agentId, id), eq(sales.orgId, orgId)));
  const [listingsCount] = await db
    .select({ value: count() })
    .from(listings)
    .where(and(eq(listings.agentId, id), eq(listings.orgId, orgId)));
  const [appraisalsCount] = await db
    .select({ value: count() })
    .from(appraisals)
    .where(and(eq(appraisals.agentId, id), eq(appraisals.orgId, orgId)));
  return Response.json({
    data: { sales: salesCount.value, listings: listingsCount.value, appraisals: appraisalsCount.value },
  });
}
