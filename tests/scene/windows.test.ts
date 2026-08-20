import { describe, it, expect } from 'vitest';
import { windowLitSchedule } from '@/lib/scene/windows';

// 窗灯作息调度(2026-08-19 二轮):纯本地时钟驱动,与 phaseFromClock 的日出日落相位
// 无关。DAY_BASE/NIGHT_PEAK 与 paint.ts 实现字面量保持同步——两边同时改,任何一边
// 单独漂移都会在这里炸开(边界值就是校准结果本身,值得被钉死)。
describe('windowLitSchedule (clock-driven window light schedule)', () => {
  const at = (h: number, m = 0, s = 0) => new Date(2026, 0, 1, h, m, s);
  // paint.ts 顶部注释:全场景等效候选数实测 ≈340.8,目标白天期望点亮数 2–3 盏(中值
  // 2.5),基线 = 2.5/340.8 ≈ 0.0073,就近取 0.0075。
  const DAY_BASE = 0.0075;
  const NIGHT_PEAK = 0.92;

  it('holds the day baseline across 05:00–18:00 inclusive of both ends', () => {
    expect(windowLitSchedule(at(5))).toBeCloseTo(DAY_BASE, 6);
    expect(windowLitSchedule(at(12))).toBeCloseTo(DAY_BASE, 6);
    expect(windowLitSchedule(at(18))).toBeCloseTo(DAY_BASE, 6);
  });

  it('is a small fraction — calibrated for ~2-3 lit windows out of ~340 weighted candidates', () => {
    expect(DAY_BASE).toBeGreaterThan(0);
    expect(DAY_BASE).toBeLessThan(0.02);
  });

  it('ramps smoothly (smoothstep, not a hard step) from baseline to peak across 18:00–19:00', () => {
    expect(windowLitSchedule(at(18))).toBeCloseTo(DAY_BASE, 6);
    expect(windowLitSchedule(at(18, 30))).toBeCloseTo((DAY_BASE + NIGHT_PEAK) / 2, 6);
    expect(windowLitSchedule(at(19))).toBeCloseTo(NIGHT_PEAK, 6);
  });

  it('holds the night peak (~0.92) across 19:00–22:00', () => {
    expect(windowLitSchedule(at(19))).toBeCloseTo(NIGHT_PEAK, 6);
    expect(windowLitSchedule(at(21))).toBeCloseTo(NIGHT_PEAK, 6);
    expect(windowLitSchedule(at(21, 59, 59))).toBeCloseTo(NIGHT_PEAK, 3);
  });

  it('ramps smoothly back down to 0 across 22:00–23:00', () => {
    expect(windowLitSchedule(at(22))).toBeCloseTo(NIGHT_PEAK, 6);
    expect(windowLitSchedule(at(22, 30))).toBeCloseTo(NIGHT_PEAK / 2, 6);
    expect(windowLitSchedule(at(23))).toBe(0);
  });

  it('stays fully dark across 23:00–05:00 (late night / pre-dawn)', () => {
    expect(windowLitSchedule(at(23))).toBe(0);
    expect(windowLitSchedule(at(3))).toBe(0);
    expect(windowLitSchedule(at(0))).toBe(0);
    expect(windowLitSchedule(at(4, 59, 59))).toBe(0);
  });

  it('the 18:00–19:00 ramp is monotonically non-decreasing (ease, not jittery)', () => {
    const hours = [18, 18.15, 18.3, 18.45, 18.6, 18.75, 18.9, 19];
    const samples = hours.map((h) => windowLitSchedule(at(Math.floor(h), Math.round((h % 1) * 60))));
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]).toBeGreaterThanOrEqual(samples[i - 1]);
    }
  });

  it('the 22:00–23:00 fade is monotonically non-increasing (ease, not jittery)', () => {
    const hours = [22, 22.15, 22.3, 22.45, 22.6, 22.75, 22.9, 23];
    const samples = hours.map((h) => windowLitSchedule(at(Math.floor(h), Math.round((h % 1) * 60))));
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]).toBeLessThanOrEqual(samples[i - 1]);
    }
  });

  it('is pure clock — same wall-clock instant always resolves the same regardless of call site', () => {
    expect(windowLitSchedule(at(20))).toBe(windowLitSchedule(at(20)));
    expect(windowLitSchedule(new Date(2020, 5, 15, 20, 0, 0))).toBe(windowLitSchedule(new Date(2031, 10, 3, 20, 0, 0)));
  });
});
