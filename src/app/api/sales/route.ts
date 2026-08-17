import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { getOrgId } from '@/lib/db/org';
import { agents, sales } from '@/lib/db/schema';
import { requireAdmin } from '@/lib/auth/session';
import { getHub } from '@/lib/ws/hub';
import { getSettings } from '@/lib/settings';
import { buildCelebrationPayload } from '@/lib/domain/celebration';

const createSchema = z.object({
  agentId: z.string().min(1),
  address: z.string().min(1),
  salePriceCents: z.number().int().min(0),
  gciCents: z.number().int().min(0),
  saleDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'saleDate must be YYYY-MM-DD'),
});

export async function GET(req: Request) {
  const session = await requireAdmin(req);
  if (session instanceof Response) return session;
  const db = await getDb();
  const orgId = await getOrgId(db);
  const rows = await db
    .select({
      id: sales.id,
      orgId: sales.orgId,
      agentId: sales.agentId,
      address: sales.address,
      salePriceCents: sales.salePriceCents,
      gciCents: sales.gciCents,
      saleDate: sales.saleDate,
      createdAt: sales.createdAt,
      updatedAt: sales.updatedAt,
      agentName: agents.name,
    })
    .from(sales)
    .innerJoin(agents, eq(sales.agentId, agents.id))
    .where(eq(sales.orgId, orgId))
    .orderBy(desc(sales.createdAt))
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
  const [agent] = await db
    .select()
    .from(agents)
    .where(
      and(eq(agents.id, parsed.data.agentId), eq(agents.orgId, orgId), eq(agents.active, true)),
    );
  if (!agent) return Response.json({ error: 'Unknown agent' }, { status: 400 });

  const [sale] = await db
    .insert(sales)
    .values({
      id: crypto.randomUUID(),
      orgId,
      agentId: parsed.data.agentId,
      address: parsed.data.address,
      salePriceCents: parsed.data.salePriceCents,
      gciCents: parsed.data.gciCents,
      saleDate: parsed.data.saleDate,
    })
    .returning();

  const settings = await getSettings(db, orgId);
  const celebration = buildCelebrationPayload(
    { id: sale.id, address: sale.address, salePriceCents: sale.salePriceCents },
    { name: agent.name, photoUrl: agent.photoUrl, anthemUrl: agent.anthemUrl },
    settings,
  );
  const hub = getHub();
  hub.broadcast({ type: 'celebration.play', celebration });
  hub.broadcast({ type: 'data.updated', domain: 'sales' });
  return Response.json({ data: sale });
}
