// 目标环配色(2026-08-21):每个目标一条渐变,让三个环一眼分得开。
//
// 配色是**定死的一套**,后台只在这套里挑,不做任意取色 —— 电视离得远、背景是压暗过的
// 夜景,自由取色很容易选出对比度不够、或者与"达成态金色"撞色的组合(需求方定稿)。
//
// 金色不在名册里:它是 ≥100% 达成态的专属信号(ProgressRing 换金渐变 + 金晕)。所以
// gci 的默认色用 coral —— 起手是金橙,但收在玫红上,达成的那一刻仍然认得出来。

import type { Metric } from '@/lib/types';

export const GOAL_COLORS = ['aqua', 'violet', 'lime', 'coral', 'magenta', 'ice'] as const;
export type GoalColor = (typeof GOAL_COLORS)[number];

/** 三段停靠点 0% / 55% / 100%,与 .value-3d 和 ring-grad-brand 同构。 */
export type GoalGradient = {
  label: string;                        // 后台下拉显示
  stops: readonly [string, string, string];
  glow: string;                         // 百分比数字的外发光,取首色的低透明版
};

export const GOAL_GRADIENTS: Record<GoalColor, GoalGradient> = {
  aqua:    { label: 'Aqua',    stops: ['#5CF7DE', '#46C9F0', '#3B7BC8'], glow: 'rgba(92, 247, 222, 0.5)' },
  violet:  { label: 'Violet',  stops: ['#5CF7DE', '#6FA8FF', '#B06CFF'], glow: 'rgba(92, 247, 222, 0.5)' },
  lime:    { label: 'Lime',    stops: ['#B6FF6C', '#4EE38A', '#21B39B'], glow: 'rgba(182, 255, 108, 0.45)' },
  coral:   { label: 'Coral',   stops: ['#FFB36B', '#FF6F91', '#C8467B'], glow: 'rgba(255, 150, 120, 0.45)' },
  magenta: { label: 'Magenta', stops: ['#FF8AE2', '#C86BFF', '#7B5CFF'], glow: 'rgba(255, 138, 226, 0.45)' },
  ice:     { label: 'Ice',     stops: ['#E4F0FF', '#9DC0FF', '#5B7FD8'], glow: 'rgba(190, 215, 255, 0.45)' },
};

/**
 * ≥100% 达成态的金渐变。放在这里不是为了给人选,而是为了让"可选色不许接近金色"这条
 * 约束有一个可比对的基准(见 tests/domain/goal-palette.test.ts)—— 金色是达成的信号,
 * 名册里混进一条金的,达标那一刻就没有变化可言了。ProgressRing 从这里取值。
 */
export const REACHED_GRADIENT: GoalGradient = {
  label: 'Reached',
  stops: ['#F9E7A0', '#F5C445', '#A8741A'],
  glow: 'rgba(245, 196, 69, 0.45)',
};

/** 没选色时按口径给默认:三个默认色彼此差得最开(青绿 / 青蓝紫 / 金橙玫红)。 */
export const DEFAULT_GOAL_COLOR: Record<Metric, GoalColor> = {
  listings: 'lime',
  sales_count: 'violet',
  gci: 'coral',
};

export function isGoalColor(v: unknown): v is GoalColor {
  return typeof v === 'string' && (GOAL_COLORS as readonly string[]).includes(v);
}

/**
 * 库里存的是可空的 color:空 = 跟随口径默认。名册里删掉某个色之后,老数据仍会存着那个
 * 名字,所以这里对不认识的值也回落默认,而不是让 TV 端拿到一个查不到的键。
 */
export function goalColor(metric: Metric, stored: string | null | undefined): GoalColor {
  return isGoalColor(stored) ? stored : DEFAULT_GOAL_COLOR[metric];
}
