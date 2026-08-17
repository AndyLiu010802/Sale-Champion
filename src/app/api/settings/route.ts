import { requireAdmin } from '@/lib/auth/session';
import { getDb } from '@/lib/db';
import { getOrgId } from '@/lib/db/org';
import { getSettings, saveSettings, settingsSchema } from '@/lib/settings';
import { getHub } from '@/lib/ws/hub';

export async function GET(req: Request) {
  const session = await requireAdmin(req);
  if (session instanceof Response) return session;
  const db = await getDb();
  const orgId = await getOrgId(db);
  const data = await getSettings(db, orgId);
  return Response.json({ data });
}

export async function PUT(req: Request) {
  const session = await requireAdmin(req);
  if (session instanceof Response) return session;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = settingsSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? 'Invalid settings' }, { status: 400 });
  }
  const db = await getDb();
  const orgId = await getOrgId(db);
  await saveSettings(db, orgId, parsed.data);
  getHub().broadcast({ type: 'config.updated' });
  return Response.json({ data: parsed.data });
}
