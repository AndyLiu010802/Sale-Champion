import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { getOrgId } from '@/lib/db/org';
import { announcements } from '@/lib/db/schema';
import { requireAdmin } from '@/lib/auth/session';
import { getHub } from '@/lib/ws/hub';

const patchSchema = z.object({
  title: z.string().min(1).optional(),
  body: z.string().min(1).nullable().optional(),
  imageUrl: z.string().min(1).nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
  enabled: z.boolean().optional(),
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
    .from(announcements)
    .where(and(eq(announcements.id, id), eq(announcements.orgId, orgId)));
  if (!existing) return Response.json({ error: 'Not found' }, { status: 404 });
  if (Object.keys(parsed.data).length === 0) return Response.json({ data: existing });
  const [announcement] = await db
    .update(announcements)
    .set(parsed.data)
    .where(and(eq(announcements.id, id), eq(announcements.orgId, orgId)))
    .returning();
  getHub().broadcast({ type: 'data.updated', domain: 'announcements' });
  return Response.json({ data: announcement });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin(req);
  if (session instanceof Response) return session;
  const { id } = await ctx.params;
  const db = await getDb();
  const orgId = await getOrgId(db);
  const [existing] = await db
    .select()
    .from(announcements)
    .where(and(eq(announcements.id, id), eq(announcements.orgId, orgId)));
  if (!existing) return Response.json({ error: 'Not found' }, { status: 404 });
  await db
    .delete(announcements)
    .where(and(eq(announcements.id, id), eq(announcements.orgId, orgId)));
  getHub().broadcast({ type: 'data.updated', domain: 'announcements' });
  return Response.json({ data: { id } });
}
