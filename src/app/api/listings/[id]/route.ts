import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { getOrgId } from '@/lib/db/org';
import { agents, listings } from '@/lib/db/schema';
import { requireAdmin } from '@/lib/auth/session';
import { getHub } from '@/lib/ws/hub';

const patchSchema = z.object({
  agentId: z.string().min(1).optional(),
  address: z.string().min(1).optional(),
  listPriceCents: z.number().int().min(0).optional(),
  photoUrl: z.string().min(1).nullable().optional(),
  listedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'listedDate must be YYYY-MM-DD').optional(),
  status: z.enum(['active', 'sold', 'withdrawn']).optional(),
  split: z.number().positive().max(1).optional(),
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
    .from(listings)
    .where(and(eq(listings.id, id), eq(listings.orgId, orgId)));
  if (!existing) return Response.json({ error: 'Not found' }, { status: 404 });
  if (parsed.data.agentId !== undefined) {
    const [agent] = await db
      .select()
      .from(agents)
      .where(
        and(
          eq(agents.id, parsed.data.agentId),
          eq(agents.orgId, orgId),
          eq(agents.active, true),
          eq(agents.role, 'agent'),
        ),
      );
    if (!agent) return Response.json({ error: 'Unknown agent' }, { status: 400 });
  }
  if (Object.keys(parsed.data).length === 0) return Response.json({ data: existing });
  const [listing] = await db
    .update(listings)
    .set(parsed.data)
    .where(and(eq(listings.id, id), eq(listings.orgId, orgId)))
    .returning();
  getHub().broadcast({ type: 'data.updated', domain: 'listings' });
  return Response.json({ data: listing });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin(req);
  if (session instanceof Response) return session;
  const { id } = await ctx.params;
  const db = await getDb();
  const orgId = await getOrgId(db);
  const [existing] = await db
    .select()
    .from(listings)
    .where(and(eq(listings.id, id), eq(listings.orgId, orgId)));
  if (!existing) return Response.json({ error: 'Not found' }, { status: 404 });
  await db.delete(listings).where(and(eq(listings.id, id), eq(listings.orgId, orgId)));
  getHub().broadcast({ type: 'data.updated', domain: 'listings' });
  return Response.json({ data: { id } });
}
