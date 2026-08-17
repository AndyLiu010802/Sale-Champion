// 生日域纯函数:格式校验与服务器本地时区的日期格式化(设计 §2/§5)。

/** 'MM-DD':月 01-12、日 01-31。不做逐月天数联动(02-31 这类宽松度由设计接受)。 */
export const BIRTHDAY_RE = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export function isValidBirthday(s: string): boolean {
  return BIRTHDAY_RE.test(s);
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** 服务器本地时区的 'YYYY-MM-DD'(orgs.lastBirthdayBroadcastDate 防重复标记用)。 */
export function localYmd(now: Date): string {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

/** 服务器本地时区的 'MM-DD'(与 agents.birthday 精确匹配用)。 */
export function localMmdd(now: Date): string {
  return `${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

/** 每分钟 tick 的触发判定:本地时间恰为 11:00(秒忽略)。 */
export function isElevenAm(now: Date): boolean {
  return now.getHours() === 11 && now.getMinutes() === 0;
}
