import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { getOrgId } from '@/lib/db/org';
import { agents } from '@/lib/db/schema';
import { requireAdmin } from '@/lib/auth/session';
import { getHub } from '@/lib/ws/hub';

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  photoUrl: z.string().min(1).nullable().optional(),
  anthemUrl: z.string().min(1).nullable().optional(),
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
    .from(agents)
    .where(and(eq(agents.id, id), eq(agents.orgId, orgId)));
  if (!existing) return Response.json({ error: 'Not found' }, { status: 404 });
  if (Object.keys(parsed.data).length === 0) return Response.json({ data: existing });
  const [agent] = await db
    .update(agents)
    .set(parsed.data)
    .where(and(eq(agents.id, id), eq(agents.orgId, orgId)))
    .returning();
  getHub().broadcast({ type: 'data.updated', domain: 'agents' });
  return Response.json({ data: agent });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
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
  await db
    .update(agents)
    .set({ active: false })
    .where(and(eq(agents.id, id), eq(agents.orgId, orgId)));
  getHub().broadcast({ type: 'data.updated', domain: 'agents' });
  return Response.json({ data: { id } });
}
