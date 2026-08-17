import { z } from 'zod';
import { desc, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { getOrgId } from '@/lib/db/org';
import { goals } from '@/lib/db/schema';
import { requireAdmin } from '@/lib/auth/session';
import { getHub } from '@/lib/ws/hub';
import { METRICS } from '@/lib/types';

const createSchema = z.object({
  metric: z.enum(METRICS),
  targetValue: z.number().int().positive(),
  period: z.enum(['month', 'quarter']),
});

export async function GET(req: Request) {
  const session = await requireAdmin(req);
  if (session instanceof Response) return session;
  const db = await getDb();
  const orgId = await getOrgId(db);
  const rows = await db
    .select()
    .from(goals)
    .where(eq(goals.orgId, orgId))
    .orderBy(desc(goals.createdAt));
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
  const [goal] = await db
    .insert(goals)
    .values({
      id: crypto.randomUUID(),
      orgId,
      metric: parsed.data.metric,
      targetValue: parsed.data.targetValue,
      period: parsed.data.period,
    })
    .returning();
  getHub().broadcast({ type: 'data.updated', domain: 'goals' });
  return Response.json({ data: goal });
}
