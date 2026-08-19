import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { getOrgId } from '@/lib/db/org';
import { eligiblePerformerWhere } from '@/lib/db/eligibility';
import { agents, appraisals } from '@/lib/db/schema';
import { requireAdmin } from '@/lib/auth/session';
import { getHub } from '@/lib/ws/hub';

const createSchema = z.object({
  agentId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
  count: z.number().int().min(1).max(999),
});

export async function GET(req: Request) {
  const session = await requireAdmin(req);
  if (session instanceof Response) return session;
  const db = await getDb();
  const orgId = await getOrgId(db);
  const rows = await db
    .select({
      id: appraisals.id,
      orgId: appraisals.orgId,
      agentId: appraisals.agentId,
      date: appraisals.date,
      count: appraisals.count,
      createdAt: appraisals.createdAt,
      agentName: agents.name,
    })
    .from(appraisals)
    .innerJoin(agents, eq(appraisals.agentId, agents.id))
    .where(eq(appraisals.orgId, orgId))
    .orderBy(desc(appraisals.date), desc(appraisals.createdAt))
    .limit(50);
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
  // 与 sales/listings 同口径:仅 active 的 agent 可录(staff 不做估价)。
  const [agent] = await db
    .select()
    .from(agents)
    .where(eligiblePerformerWhere(parsed.data.agentId, orgId));
  if (!agent) return Response.json({ error: 'Unknown agent' }, { status: 400 });

  const [appraisal] = await db
    .insert(appraisals)
    .values({
      id: crypto.randomUUID(),
      orgId,
      agentId: parsed.data.agentId,
      date: parsed.data.date,
      count: parsed.data.count,
    })
    .returning();
  getHub().broadcast({ type: 'data.updated', domain: 'appraisals' });
  return Response.json({ data: appraisal });
}
