import type { ScorecardData } from './domain/scorecard';
import type { SettingsData } from './settings';

export const METRICS = ['sales_count', 'gci', 'listings'] as const;
export type Metric = (typeof METRICS)[number];

export const PERIODS = ['week', 'month', 'quarter', 'year'] as const;
export type Period = (typeof PERIODS)[number];

export type LeaderboardEntry = {
  agentId: string;
  name: string;
  photoUrl: string | null;
  value: number;   // sales_count/listings: Σsplit(可为小数);gci: cents
  rank: number;    // 1-based, fully ordered (ties broken deterministically)
};

export type GoalProgress = {
  id: string;
  metric: Metric;
  period: 'month' | 'quarter';
  targetValue: number;
  currentValue: number;
  percent: number; // 0-100, rounded, capped at 100
};

export type TvAnnouncement = { id: string; title: string; body: string | null; imageUrl: string | null };

export type TvScreenInfo = { id: string; name: string };

export type TvStateResponse = {
  screen: TvScreenInfo;
  settings: SettingsData;
  leaderboards: Record<Metric, LeaderboardEntry[]>;  // all three metrics
  goals: GoalProgress[];                              // active only
  announcements: TvAnnouncement[];                    // enabled only, sortOrder asc
  scorecard: ScorecardData;                           // 设计 §5:全指标 0 不成行,gciCents desc
  scorecardYtd: ScorecardData;                        // 设计 §7b:澳洲财年 to-date,同一形状
  periodLabel: string;                                // periodLabel(settings.leaderboardPeriod, now)
  fyLabel: string;                                    // fyLabel(now),如 'FY 2026–27'
};

/** GET /api/tv/weather 的响应形状(天际线背景设计 §3)。
 *  sunrise/sunset 为 Open-Meteo `timezone=auto` 返回的 ISO 本地时间字符串。 */
export type TvWeather = {
  weatherCode: number;   // WMO 天气码
  windSpeedKmh: number;  // 10m 风速,km/h
  isDay: boolean;
  sunrise: string;       // 如 '2026-08-19T07:10'
  sunset: string;
};
