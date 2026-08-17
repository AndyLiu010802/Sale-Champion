import { and, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { getOrgId } from '@/lib/db/org';
import { agents } from '@/lib/db/schema';
import { requireAdmin } from '@/lib/auth/session';
import { getHub } from '@/lib/ws/hub';
import { getSettings } from '@/lib/settings';
import { buildBirthdayPayload } from '@/lib/domain/celebration';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin(req);
  if (session instanceof Response) return session;
  const { id } = await ctx.params;
  const db = await getDb();
  const orgId = await getOrgId(db);
  // No role filter (agents AND staff can be celebrated) and no birthday/date
  // check (manual broadcast works any day). It also never touches the
  // 11:00 scheduler's dedupe mark.
  const [member] = await db
    .select()
    .from(agents)
    .where(and(eq(agents.id, id), eq(agents.orgId, orgId), eq(agents.active, true)));
  if (!member) return Response.json({ error: 'Not found' }, { status: 404 });
  const settings = await getSettings(db, orgId);
  const celebration = buildBirthdayPayload(
    { id: member.id, name: member.name, photoUrl: member.photoUrl },
    settings,
  );
  getHub().broadcast({ type: 'celebration.play', celebration });
  return Response.json({ data: { ok: true } });
}
