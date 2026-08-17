import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { screens } from '@/lib/db/schema';
import { requireAdmin } from '@/lib/auth/session';
import { getHub } from '@/lib/ws/hub';

const patchSchema = z.object({ name: z.string().min(1) });

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await requireAdmin(req);
  if (session instanceof Response) return session;
  const { id } = await ctx.params;

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'Invalid body' }, { status: 400 });
  }

  const db = await getDb();
  const rows = await db.update(screens)
    .set({ name: parsed.data.name })
    .where(eq(screens.id, id))
    .returning();
  const row = rows[0];
  if (!row) return Response.json({ error: 'Not found' }, { status: 404 });

  getHub().sendToScreen(id, { type: 'screen.updated', screen: { id, name: row.name } });
  return Response.json({ data: { id, name: row.name } });
}

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await requireAdmin(req);
  if (session instanceof Response) return session;
  const { id } = await ctx.params;

  const db = await getDb();
  const rows = await db.delete(screens).where(eq(screens.id, id)).returning();
  if (!rows[0]) return Response.json({ error: 'Not found' }, { status: 404 });

  getHub().sendToScreen(id, { type: 'screen.unpaired' });
  return Response.json({ data: { id } });
}
