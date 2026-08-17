import { z } from 'zod';
import { eq } from 'drizzle-orm';
import type { Db } from './db';
import { settings } from './db/schema';
import type { Period } from './types';

export const SLIDE_KEYS = [
  'leaderboard_sales_count', 'leaderboard_gci', 'leaderboard_listings',
  'goal_progress', 'listings', 'announcements',
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
    { key: 'leaderboard_sales_count', enabled: true, durationSec: 15 },
    { key: 'leaderboard_gci', enabled: true, durationSec: 15 },
    { key: 'leaderboard_listings', enabled: true, durationSec: 15 },
    { key: 'goal_progress', enabled: true, durationSec: 10 },
    { key: 'listings', enabled: true, durationSec: 12 },
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
  return parsed.success ? parsed.data : DEFAULT_SETTINGS;
}

export async function saveSettings(db: Db, orgId: string, data: SettingsData): Promise<void> {
  await db
    .insert(settings)
    .values({ orgId, data, updatedAt: new Date() })
    .onConflictDoUpdate({ target: settings.orgId, set: { data, updatedAt: new Date() } });
}
