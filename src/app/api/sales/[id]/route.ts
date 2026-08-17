import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { getOrgId } from '@/lib/db/org';
import { agents, sales } from '@/lib/db/schema';
import { requireAdmin } from '@/lib/auth/session';
import { getHub } from '@/lib/ws/hub';

const patchSchema = z.object({
  agentId: z.string().min(1).optional(),
  address: z.string().min(1).optional(),
  salePriceCents: z.number().int().min(0).optional(),
  gciCents: z.number().int().min(0).optional(),
  saleDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'saleDate must be YYYY-MM-DD').optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin(req);
  if (session instanceof Response) return session;
  const { id } = await ctx.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues.map((i) => i.message).join('; ') },
      { status: 400 },
    );
  }
  const db = await getDb();
  const orgId = await getOrgId(db);
  const [existing] = await db
    .select()
    .from(sales)
    .where(and(eq(sales.id, id), eq(sales.orgId, orgId)));
  if (!existing) return Response.json({ error: 'Not found' }, { status: 404 });
  if (parsed.data.agentId !== undefined) {
    const [agent] = await db
      .select()
      .from(agents)
      .where(and(eq(agents.id, parsed.data.agentId), eq(agents.orgId, orgId)));
    if (!agent) return Response.json({ error: 'Unknown agent' }, { status: 400 });
  }
  const [sale] = await db
    .update(sales)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(sales.id, id), eq(sales.orgId, orgId)))
    .returning();
  getHub().broadcast({ type: 'data.updated', domain: 'sales' });
  return Response.json({ data: sale });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin(req);
  if (session instanceof Response) return session;
  const { id } = await ctx.params;
  const db = await getDb();
  const orgId = await getOrgId(db);
  const [existing] = await db
    .select()
    .from(sales)
    .where(and(eq(sales.id, id), eq(sales.orgId, orgId)));
  if (!existing) return Response.json({ error: 'Not found' }, { status: 404 });
  await db.delete(sales).where(and(eq(sales.id, id), eq(sales.orgId, orgId)));
  getHub().broadcast({ type: 'data.updated', domain: 'sales' });
  return Response.json({ data: { id } });
}
