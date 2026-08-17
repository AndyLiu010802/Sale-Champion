import { z } from 'zod';
import { asc, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { getOrgId } from '@/lib/db/org';
import { announcements } from '@/lib/db/schema';
import { requireAdmin } from '@/lib/auth/session';
import { getHub } from '@/lib/ws/hub';

const createSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1).optional(),
  imageUrl: z.string().min(1).optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export async function GET(req: Request) {
  const session = await requireAdmin(req);
  if (session instanceof Response) return session;
  const db = await getDb();
  const orgId = await getOrgId(db);
  const rows = await db
    .select()
    .from(announcements)
    .where(eq(announcements.orgId, orgId))
    .orderBy(asc(announcements.sortOrder), asc(announcements.createdAt));
  return Response.json({ data: rows });
}

export async function POST(req: Request) {
  const session = await requireAdmin(req);
  if (session instanceof Response) return session;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues.map((i) => i.message).join('; ') },
      { status: 400 },
    );
  }
  const db = await getDb();
  const orgId = await getOrgId(db);
  const [announcement] = await db
    .insert(announcements)
    .values({
      id: crypto.randomUUID(),
      orgId,
      title: parsed.data.title,
      body: parsed.data.body ?? null,
      imageUrl: parsed.data.imageUrl ?? null,
      sortOrder: parsed.data.sortOrder ?? 0,
    })
    .returning();
  getHub().broadcast({ type: 'data.updated', domain: 'announcements' });
  return Response.json({ data: announcement });
}
