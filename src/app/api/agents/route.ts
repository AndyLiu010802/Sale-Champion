import { z } from 'zod';
import { asc, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { getOrgId } from '@/lib/db/org';
import { agents } from '@/lib/db/schema';
import { requireAdmin } from '@/lib/auth/session';
import { getHub } from '@/lib/ws/hub';

const createSchema = z.object({
  name: z.string().min(1),
  photoUrl: z.string().min(1).optional(),
  anthemUrl: z.string().min(1).optional(),
});

export async function GET(req: Request) {
  const session = await requireAdmin(req);
  if (session instanceof Response) return session;
  const db = await getDb();
  const orgId = await getOrgId(db);
  const rows = await db
    .select()
    .from(agents)
    .where(eq(agents.orgId, orgId))
    .orderBy(asc(agents.name));
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
  const [agent] = await db
    .insert(agents)
    .values({
      id: crypto.randomUUID(),
      orgId,
      name: parsed.data.name,
      photoUrl: parsed.data.photoUrl ?? null,
      anthemUrl: parsed.data.anthemUrl ?? null,
    })
    .returning();
  getHub().broadcast({ type: 'data.updated', domain: 'agents' });
  return Response.json({ data: agent });
}
