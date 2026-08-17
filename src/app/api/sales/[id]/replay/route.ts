import { and, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { getOrgId } from '@/lib/db/org';
import { agents, sales } from '@/lib/db/schema';
import { requireAdmin } from '@/lib/auth/session';
import { getHub } from '@/lib/ws/hub';
import { getSettings } from '@/lib/settings';
import { buildCelebrationPayload } from '@/lib/domain/celebration';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin(req);
  if (session instanceof Response) return session;
  const { id } = await ctx.params;
  const db = await getDb();
  const orgId = await getOrgId(db);
  const [sale] = await db
    .select()
    .from(sales)
    .where(and(eq(sales.id, id), eq(sales.orgId, orgId)));
  if (!sale) return Response.json({ error: 'Not found' }, { status: 404 });
  const [agent] = await db
    .select()
    .from(agents)
    .where(and(eq(agents.id, sale.agentId), eq(agents.orgId, orgId)));
  if (!agent) return Response.json({ error: 'Unknown agent' }, { status: 400 });
  const settings = await getSettings(db, orgId);
  const celebration = buildCelebrationPayload(
    { id: sale.id, address: sale.address, salePriceCents: sale.salePriceCents },
    { name: agent.name, photoUrl: agent.photoUrl, anthemUrl: agent.anthemUrl },
    settings,
  );
  getHub().broadcast({ type: 'celebration.play', celebration });
  return Response.json({ data: { ok: true } });
}
