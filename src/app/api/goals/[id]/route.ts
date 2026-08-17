import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { getOrgId } from '@/lib/db/org';
import { goals } from '@/lib/db/schema';
import { requireAdmin } from '@/lib/auth/session';
import { getHub } from '@/lib/ws/hub';
import { METRICS } from '@/lib/types';

const patchSchema = z.object({
  metric: z.enum(METRICS).optional(),
  targetValue: z.number().int().positive().optional(),
  period: z.enum(['month', 'quarter']).optional(),
  active: z.boolean().optional(),
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
    .from(goals)
    .where(and(eq(goals.id, id), eq(goals.orgId, orgId)));
  if (!existing) return Response.json({ error: 'Not found' }, { status: 404 });
  if (Object.keys(parsed.data).length === 0) return Response.json({ data: existing });
  const [goal] = await db
    .update(goals)
    .set(parsed.data)
    .where(and(eq(goals.id, id), eq(goals.orgId, orgId)))
    .returning();
  getHub().broadcast({ type: 'data.updated', domain: 'goals' });
  return Response.json({ data: goal });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin(req);
  if (session instanceof Response) return session;
  const { id } = await ctx.params;
  const db = await getDb();
  const orgId = await getOrgId(db);
  const [existing] = await db
    .select()
    .from(goals)
    .where(and(eq(goals.id, id), eq(goals.orgId, orgId)));
  if (!existing) return Response.json({ error: 'Not found' }, { status: 404 });
  await db.delete(goals).where(and(eq(goals.id, id), eq(goals.orgId, orgId)));
  getHub().broadcast({ type: 'data.updated', domain: 'goals' });
  return Response.json({ data: { id } });
}
