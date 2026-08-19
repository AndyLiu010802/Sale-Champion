// 团队资格口径的客户端纯谓词(团队设计 §3)——admin 三处录入下拉共用。
// 服务端同口径的 drizzle 条件在 src/lib/db/eligibility.ts,两边必须一起改。

/** 录入下拉里该出现的行:active 且(team 行 或 未归队的 agent)。 */
export function isEligiblePerformer(a: {
  active: boolean;
  role: string;
  teamId?: string | null;
}): boolean {
  if (!a.active) return false;
  if (a.role === 'team') return true;
  return a.role === 'agent' && !a.teamId;
}
