// 团队资格口径的服务端单一出处(团队设计 §2/§3)。
// 客户端同口径的纯谓词在 src/lib/domain/eligibility.ts,两边必须一起改。

import { and, asc, eq, inArray, isNull, or, type SQL } from 'drizzle-orm';
import type { Db } from '.';
import { agents } from './schema';

/**
 * 「可录业绩」的成员资格:active 且(role='team' 或(role='agent' 且未归队))。
 * 归队成员与 staff 一律查不到 → 五处录入门统一回 400 'Unknown agent'。
 */
export function eligiblePerformerWhere(agentId: string, orgId: string): SQL | undefined {
  return and(
    eq(agents.id, agentId),
    eq(agents.orgId, orgId),
    eq(agents.active, true),
    or(
      eq(agents.role, 'team'),
      and(eq(agents.role, 'agent'), isNull(agents.teamId)),
    ),
  );
}

/**
 * 从一份 memberIds 名单里挑出不合法的:必须是本 org 的 role='agent' 行,且不是团队自身
 * (staff 不可入队、team 不可嵌套、不存在的 id 亦不可)。返回的是不合法 id 列表,
 * 调用方非空即回 400 'Invalid member'。成员不要求 active——UI 只列 active,
 * 但把一个已停用的成员挂在队上无害。
 */
export async function findInvalidMembers(
  db: Db,
  memberIds: string[],
  orgId: string,
  selfId: string,
): Promise<string[]> {
  if (memberIds.length === 0) return [];
  const rows = await db
    .select({ id: agents.id })
    .from(agents)
    .where(and(
      inArray(agents.id, memberIds),
      eq(agents.orgId, orgId),
      eq(agents.role, 'agent'),
    ));
  const valid = new Set(rows.map((r) => r.id));
  return memberIds.filter((id) => id === selfId || !valid.has(id));
}

/**
 * 团队成交庆祝要并排展示的成员(团队设计 §4):该队 active 成员,按 name 排序。
 * 传入的不是 team 行时返回空数组 → 调用方省略 payload 的 members 字段。
 */
export async function celebrationMembers(
  db: Db,
  agent: { id: string; role: string },
  orgId: string,
): Promise<{ name: string; photoUrl: string | null }[]> {
  if (agent.role !== 'team') return [];
  return db
    .select({ name: agents.name, photoUrl: agents.photoUrl })
    .from(agents)
    .where(and(
      eq(agents.teamId, agent.id),
      eq(agents.orgId, orgId),
      eq(agents.active, true),
    ))
    .orderBy(asc(agents.name));
}
