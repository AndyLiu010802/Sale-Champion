import { z } from 'zod';
import { and, eq, inArray, notInArray } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { getOrgId } from '@/lib/db/org';
import { findInvalidMembers } from '@/lib/db/eligibility';
import { agents, appraisals, listings, sales } from '@/lib/db/schema';
import { requireAdmin } from '@/lib/auth/session';
import { getHub } from '@/lib/ws/hub';
import { BIRTHDAY_RE } from '@/lib/domain/birthday';

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  photoUrl: z.string().min(1).nullable().optional(),
  anthemUrl: z.string().min(1).nullable().optional(),
  active: z.boolean().optional(),
  role: z.enum(['agent', 'staff', 'team']).optional(),
  birthday: z.string().regex(BIRTHDAY_RE).nullable().optional(),
  // 队籍只经全量名单进出(团队设计 §5):勾选者挂队、原属该队但未勾选者释放。
  memberIds: z.array(z.string()).optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin(req);
  if (session instanceof Response) return session;
  const { id } = await ctx.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues.map((i) => i.message).join('; ') },
      { status: 400 },
    );
  }
  const db = await getDb();
  const orgId = await getOrgId(db);
  const [existing] = await db
    .select()
    .from(agents)
    .where(and(eq(agents.id, id), eq(agents.orgId, orgId)));
  if (!existing) return Response.json({ error: 'Not found' }, { status: 404 });
  if (Object.keys(parsed.data).length === 0) return Response.json({ data: existing });

  const { memberIds, ...fields } = parsed.data;
  const nextRole = fields.role ?? existing.role;
  const wasTeam = existing.role === 'team';

  // 团队设计 §2/§5 的应用层约束(顺序即拒绝优先级)。
  // memberIds 只对 team 行有意义;唯一例外是"从 Team 改走"时随请求发空数组先清空成员。
  if (memberIds !== undefined && nextRole !== 'team' && !(wasTeam && memberIds.length === 0)) {
    return Response.json({ error: 'memberIds is only allowed for team rows' }, { status: 400 });
  }
  if (nextRole === 'team' && fields.birthday) {
    return Response.json({ error: 'Team rows cannot have a birthday' }, { status: 400 });
  }
  if (nextRole === 'team' && memberIds?.length) {
    const invalid = await findInvalidMembers(db, memberIds, orgId, id);
    if (invalid.length) return Response.json({ error: 'Invalid member' }, { status: 400 });
  }
  // 从 Team 改走前必须清空成员——否则会留下指向非 team 行的孤儿队籍。
  if (wasTeam && nextRole !== 'team' && memberIds === undefined) {
    const current = await db
      .select({ id: agents.id })
      .from(agents)
      .where(and(eq(agents.teamId, id), eq(agents.orgId, orgId)));
    if (current.length) {
      return Response.json({ error: 'Team still has members' }, { status: 400 });
    }
  }

  const values: Partial<typeof agents.$inferInsert> = { ...fields };
  // team 行自身恒不嵌套、且无生日(role 转为 team 时自动清掉旧生日)。
  if (nextRole === 'team') {
    values.teamId = null;
    values.birthday = null;
  } else if (existing.teamId && nextRole !== 'agent') {
    // 归队成员改为 staff → 同一 UPDATE 内自动脱队。
    values.teamId = null;
  }

  // 成员 diff 与本行更新同一事务:不出现"成员已改队、队还没改"的中间态。
  const agent = await db.transaction(async (tx) => {
    if (memberIds !== undefined) {
      const releaseWhere = memberIds.length
        ? and(eq(agents.teamId, id), eq(agents.orgId, orgId), notInArray(agents.id, memberIds))
        : and(eq(agents.teamId, id), eq(agents.orgId, orgId));
      await tx.update(agents).set({ teamId: null }).where(releaseWhere);
      if (memberIds.length) {
        await tx
          .update(agents)
          .set({ teamId: id })
          .where(and(inArray(agents.id, memberIds), eq(agents.orgId, orgId)));
      }
    }
    if (Object.keys(values).length === 0) {
      // 只改了成员名单:本行无字段变化,回读现况即可(drizzle 拒绝空 set)。
      const [row] = await tx
        .select()
        .from(agents)
        .where(and(eq(agents.id, id), eq(agents.orgId, orgId)));
      return row;
    }
    const [row] = await tx
      .update(agents)
      .set(values)
      .where(and(eq(agents.id, id), eq(agents.orgId, orgId)))
      .returning();
    return row;
  });
  getHub().broadcast({ type: 'data.updated', domain: 'agents' });
  return Response.json({ data: agent });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin(req);
  if (session instanceof Response) return session;
  const { id } = await ctx.params;
  const db = await getDb();
  const orgId = await getOrgId(db);
  const [existing] = await db
    .select()
    .from(agents)
    .where(and(eq(agents.id, id), eq(agents.orgId, orgId)));
  if (!existing) return Response.json({ error: 'Not found' }, { status: 404 });
  // 真删除(清理设计 §2.2):停用仍走 PATCH { active:false },此处是不可恢复的硬删除。
  // schema 外键无 ON DELETE CASCADE,事务内按子表 → 主表顺序删,不留孤儿行、也不会
  // 出现"业绩已删成员还在"的中间态(drizzle db.transaction 在 node-postgres 与 PGlite
  // 两条驱动路径均可用,已核实)。TV 端一条 agents 广播足够——refetch 是全量 state。
  await db.transaction(async (tx) => {
    // 删队先释放成员(团队设计 §5):成员本身保留、只脱队;team_id 自引用外键也要求
    // 先解除引用才能删掉这一行。
    await tx.update(agents).set({ teamId: null })
      .where(and(eq(agents.teamId, id), eq(agents.orgId, orgId)));
    await tx.delete(sales).where(and(eq(sales.agentId, id), eq(sales.orgId, orgId)));
    await tx.delete(listings).where(and(eq(listings.agentId, id), eq(listings.orgId, orgId)));
    await tx.delete(appraisals).where(and(eq(appraisals.agentId, id), eq(appraisals.orgId, orgId)));
    await tx.delete(agents).where(and(eq(agents.id, id), eq(agents.orgId, orgId)));
  });
  getHub().broadcast({ type: 'data.updated', domain: 'agents' });
  return Response.json({ data: { id } });
}
