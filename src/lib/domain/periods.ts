import type { Period } from '../types';

const MONTH_NAMES = [
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER',
];
const MONTH_ABBR = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** Local-time period range; week starts Monday 00:00; end is exclusive (start of next period). */
export function periodRange(period: Period, now: Date): { start: Date; end: Date } {
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (period) {
    case 'week': {
      const daysSinceMonday = (now.getDay() + 6) % 7; // getDay(): 0=Sunday
      const start = new Date(y, m, now.getDate() - daysSinceMonday);
      const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
      return { start, end };
    }
    case 'month':
      return { start: new Date(y, m, 1), end: new Date(y, m + 1, 1) };
    case 'quarter': {
      const qStartMonth = Math.floor(m / 3) * 3;
      return { start: new Date(y, qStartMonth, 1), end: new Date(y, qStartMonth + 3, 1) };
    }
    case 'year':
      return { start: new Date(y, 0, 1), end: new Date(y + 1, 0, 1) };
  }
}

export function periodLabel(period: Period, now: Date): string {
  switch (period) {
    case 'month':
      return `${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}`;
    case 'week': {
      const { start } = periodRange('week', now);
      return `WEEK OF ${start.getDate()} ${MONTH_ABBR[start.getMonth()]}`;
    }
    case 'quarter':
      return `Q${Math.floor(now.getMonth() / 3) + 1} ${now.getFullYear()}`;
    case 'year':
      return String(now.getFullYear());
  }
}

/** 澳洲财年起始年:7 月(含)以后属当年启动的财年,1–6 月属前一年启动的财年(设计 §7b)。 */
function fyStartYear(now: Date): number {
  return now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
}

/** 财年 to-date:7 月 1 日 00:00(本地)起,至明日 00:00(排他)——今天整天计入。 */
export function fyToDateRange(now: Date): { start: Date; end: Date } {
  return {
    start: new Date(fyStartYear(now), 6, 1),
    end: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1),
  };
}

/** 财年标签:2026-07-01~2027-06-30 → 'FY 2026–27'(en dash)。 */
export function fyLabel(now: Date): string {
  const startYear = fyStartYear(now);
  const nextYY = String((startYear + 1) % 100).padStart(2, '0');
  return `FY ${startYear}–${nextYY}`;
}
