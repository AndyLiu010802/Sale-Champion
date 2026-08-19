import { z } from 'zod';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { getOrgId } from '@/lib/db/org';
import { findInvalidMembers } from '@/lib/db/eligibility';
import { agents } from '@/lib/db/schema';
import { requireAdmin } from '@/lib/auth/session';
import { getHub } from '@/lib/ws/hub';
import { BIRTHDAY_RE } from '@/lib/domain/birthday';

const createSchema = z.object({
  name: z.string().min(1),
  photoUrl: z.string().min(1).optional(),
  anthemUrl: z.string().min(1).optional(),
  role: z.enum(['agent', 'staff', 'team']).optional(),
  birthday: z.string().regex(BIRTHDAY_RE).optional(),
  // 队籍只经全量名单进出(团队设计 §5);team_id 不可直接写。
  memberIds: z.array(z.string()).optional(),
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

  const role = parsed.data.role ?? 'agent';
  const { memberIds } = parsed.data;
  // 团队设计 §2 的应用层约束,顺序即拒绝优先级。
  if (memberIds !== undefined && role !== 'team') {
    return Response.json({ error: 'memberIds is only allowed for team rows' }, { status: 400 });
  }
  if (role === 'team' && parsed.data.birthday !== undefined) {
    return Response.json({ error: 'Team rows cannot have a birthday' }, { status: 400 });
  }
  const id = crypto.randomUUID();
  if (memberIds?.length) {
    const invalid = await findInvalidMembers(db, memberIds, orgId, id);
    if (invalid.length) return Response.json({ error: 'Invalid member' }, { status: 400 });
  }

  // 建行与挂队同一事务:不出现"队已建、成员没挂上"的中间态。
  const agent = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(agents)
      .values({
        id,
        orgId,
        name: parsed.data.name,
        photoUrl: parsed.data.photoUrl ?? null,
        anthemUrl: parsed.data.anthemUrl ?? null,
        role,
        birthday: parsed.data.birthday ?? null,
      })
      .returning();
    if (memberIds?.length) {
      await tx
        .update(agents)
        .set({ teamId: id })
        .where(and(inArray(agents.id, memberIds), eq(agents.orgId, orgId)));
    }
    return row;
  });
  getHub().broadcast({ type: 'data.updated', domain: 'agents' });
  return Response.json({ data: agent });
}
