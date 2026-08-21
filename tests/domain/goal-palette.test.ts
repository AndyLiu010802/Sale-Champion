import { describe, it, expect } from 'vitest';
import {
  GOAL_COLORS, GOAL_GRADIENTS, DEFAULT_GOAL_COLOR, REACHED_GRADIENT, goalColor, isGoalColor,
} from '@/lib/goals/palette';
import { METRICS } from '@/lib/types';

const HEX = /^#[0-9A-F]{6}$/;

describe('goal ring palette', () => {
  it('gives every colour three hex stops and a glow', () => {
    for (const c of GOAL_COLORS) {
      const g = GOAL_GRADIENTS[c];
      expect(g.label.length).toBeGreaterThan(0);
      expect(g.stops).toHaveLength(3);
      for (const stop of g.stops) expect(stop).toMatch(HEX);
      expect(g.glow).toMatch(/^rgba\(/);
    }
    // 名册与色表必须一一对应,多出来的键在后台下拉里查不到 label。
    expect(Object.keys(GOAL_GRADIENTS).sort()).toEqual([...GOAL_COLORS].sort());
  });

  it('defaults every metric to a different colour', () => {
    // 三个环并排,默认色撞了就等于没做这件事。
    const used = METRICS.map((m) => DEFAULT_GOAL_COLOR[m]);
    expect(used).toHaveLength(METRICS.length);
    expect(new Set(used).size).toBe(METRICS.length);
    for (const c of used) expect(GOAL_COLORS).toContain(c);
  });

  it('keeps every selectable colour well clear of the reached gold', () => {
    // >=100% 时 ProgressRing 一律换 REACHED_GRADIENT + 金晕。可选色里混进一条接近金色的,
    // 达标那一刻就没有变化可言了。按三段色的平均 RGB 距离比,金色自己是 0。
    const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const distance = (g: readonly [string, string, string]) => {
      const d = g.map((hex, i) => {
        const [r1, g1, b1] = rgb(hex);
        const [r2, g2, b2] = rgb(REACHED_GRADIENT.stops[i]);
        return Math.hypot(r1 - r2, g1 - g2, b1 - b2);
      });
      return d.reduce((a2, b2) => a2 + b2, 0) / d.length;
    };
    expect(distance(REACHED_GRADIENT.stops)).toBe(0);   // 判据本身有效
    const tooClose = GOAL_COLORS.filter((c) => distance(GOAL_GRADIENTS[c].stops) < 60);
    expect(tooClose).toEqual([]);   // 失败时直接点名是哪一条
  });

  it('falls back to the metric default for null, unknown and junk', () => {
    // 库里的 color 可空,而且调色板改名之后老行会留着查不到的名字 —— 一律回落,
    // 绝不能把查不到的键交给 GOAL_GRADIENTS,那会在 TV 上炸成读 undefined。
    expect(goalColor('gci', null)).toBe(DEFAULT_GOAL_COLOR.gci);
    expect(goalColor('gci', undefined)).toBe(DEFAULT_GOAL_COLOR.gci);
    expect(goalColor('listings', 'retired-name')).toBe(DEFAULT_GOAL_COLOR.listings);
    expect(goalColor('sales_count', '')).toBe(DEFAULT_GOAL_COLOR.sales_count);
    expect(GOAL_GRADIENTS[goalColor('gci', 'nope')]).toBeDefined();
  });

  it('echoes a stored colour that is still in the palette', () => {
    expect(goalColor('gci', 'ice')).toBe('ice');
  });

  it('isGoalColor guards the API enum', () => {
    expect(isGoalColor('aqua')).toBe(true);
    expect(isGoalColor('gold')).toBe(false);
    expect(isGoalColor(7)).toBe(false);
    expect(isGoalColor(null)).toBe(false);
  });
});
