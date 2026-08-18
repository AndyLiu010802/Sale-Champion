import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { getOrgId } from '@/lib/db/org';
import { agents, listings } from '@/lib/db/schema';
import { requireAdmin } from '@/lib/auth/session';
import { getHub } from '@/lib/ws/hub';

const createSchema = z.object({
  agentId: z.string().min(1),
  address: z.string().min(1),
  listPriceCents: z.number().int().min(0),
  photoUrl: z.string().min(1).optional(),
  listedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'listedDate must be YYYY-MM-DD'),
  // 房源拆分份额(设计 §7b):0 < split ≤ 1;缺省按 1(整单)
  split: z.number().positive().max(1).optional(),
});

export async function GET(req: Request) {
  const session = await requireAdmin(req);
  if (session instanceof Response) return session;
  const db = await getDb();
  const orgId = await getOrgId(db);
  const rows = await db
    .select({
      id: listings.id,
      orgId: listings.orgId,
      agentId: listings.agentId,
      address: listings.address,
      listPriceCents: listings.listPriceCents,
      photoUrl: listings.photoUrl,
      listedDate: listings.listedDate,
      status: listings.status,
      split: listings.split,
      createdAt: listings.createdAt,
      agentName: agents.name,
    })
    .from(listings)
    .innerJoin(agents, eq(listings.agentId, agents.id))
    .where(eq(listings.orgId, orgId))
    .orderBy(desc(listings.createdAt));
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
  const [listing] = await db
    .insert(listings)
    .values({
      id: crypto.randomUUID(),
      orgId,
      agentId: parsed.data.agentId,
      address: parsed.data.address,
      listPriceCents: parsed.data.listPriceCents,
      photoUrl: parsed.data.photoUrl ?? null,
      listedDate: parsed.data.listedDate,
      split: parsed.data.split ?? 1,
    })
    .returning();
  getHub().broadcast({ type: 'data.updated', domain: 'listings' });
  return Response.json({ data: listing });
}
