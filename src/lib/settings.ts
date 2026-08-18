import { z } from 'zod';
import { eq } from 'drizzle-orm';
import type { Db } from './db';
import { settings } from './db/schema';
import type { Period } from './types';

// 7 键(清理设计 §1):scorecard(MTD)首位、scorecard_ytd(财年 to-date)第二位;
// 'listings'(Hot Listings 页)已彻底移除。已存的 6/7/8 键 settings 行 safeParse 失败后
// 由 getSettings 回落新 DEFAULT_SETTINGS(既有轮播自定义丢失一次,已接受)。
export const SLIDE_KEYS = [
  'scorecard', 'scorecard_ytd',
  'leaderboard_sales_count', 'leaderboard_gci', 'leaderboard_listings',
  'goal_progress', 'announcements',
] as const;
export type SlideKey = (typeof SLIDE_KEYS)[number];

export type SlideConfig = { key: SlideKey; enabled: boolean; durationSec: number };

export type SettingsData = {
  slides: SlideConfig[];             // 有序
  leaderboardPeriod: Period;         // 默认 'month'
  celebrationDurationSec: number;    // 10–30, 默认 18
  volume: number;                    // 0–1, 默认 0.8
  defaultAnthemUrl: string | null;   // 默认 'builtin:victory'
};

export const settingsSchema: z.ZodType<SettingsData> = z.object({
  slides: z.array(z.object({
    key: z.enum(SLIDE_KEYS),
    enabled: z.boolean(),
    durationSec: z.number().int().min(5).max(120),
  })),
  leaderboardPeriod: z.enum(['week', 'month', 'quarter', 'year']),
  celebrationDurationSec: z.number().int().min(10).max(30),
  volume: z.number().min(0).max(1),
  defaultAnthemUrl: z.string().nullable(),
}).refine(
  (s) => {
    const keys = new Set(s.slides.map((x) => x.key));
    return keys.size === s.slides.length && keys.size === SLIDE_KEYS.length;
  },
  { message: 'slides must contain each slide key exactly once' },
);

export const DEFAULT_SETTINGS: SettingsData = {
  slides: [
    { key: 'scorecard', enabled: true, durationSec: 20 },
    { key: 'scorecard_ytd', enabled: true, durationSec: 20 },
    { key: 'leaderboard_sales_count', enabled: true, durationSec: 15 },
    { key: 'leaderboard_gci', enabled: true, durationSec: 15 },
    { key: 'leaderboard_listings', enabled: true, durationSec: 15 },
    { key: 'goal_progress', enabled: true, durationSec: 10 },
    { key: 'announcements', enabled: true, durationSec: 10 },
  ],
  leaderboardPeriod: 'month',
  celebrationDurationSec: 18,
  volume: 0.8,
  defaultAnthemUrl: 'builtin:victory',
};

export async function getSettings(db: Db, orgId: string): Promise<SettingsData> {
  const rows = await db.select().from(settings).where(eq(settings.orgId, orgId)).limit(1);
  if (!rows[0]) return DEFAULT_SETTINGS;
  const parsed = settingsSchema.safeParse(rows[0].data);
  if (!parsed.success) {
    console.warn('[settings] stored settings failed validation, falling back to defaults');
    return DEFAULT_SETTINGS;
  }
  return parsed.data;
}

export async function saveSettings(db: Db, orgId: string, data: SettingsData): Promise<void> {
  await db
    .insert(settings)
    .values({ orgId, data, updatedAt: new Date() })
    .onConflictDoUpdate({ target: settings.orgId, set: { data, updatedAt: new Date() } });
}
