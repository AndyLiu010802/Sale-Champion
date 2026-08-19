import { describe, expect, it } from 'vitest';
import { effectsFromWeather, type SceneEffects } from '@/lib/scene/weather';
import { scenePaint, windowLitSchedule } from '@/lib/scene/hobart/paint';
import {
  BAND, BOATS, BRIDGE, CITY_TOWERS, MOUNTAIN, SKY_HORIZON_Y,
  WAREHOUSES, WATERLINE, WHARF_EDGE_Y, mulberry32, type Rgb,
} from '@/lib/scene/hobart/geometry';

// cloudiness 0(而非"晴"的 0.1):压灰量为 0,关键帧数值可逐字断言。
const CLEAR: SceneEffects = { rain: 0, snow: 0, thunder: false, wind: 0, cloudiness: 0, fog: false };

function lum(c: Rgb): number {
  return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
}

describe('scenePaint', () => {
  it('t=0.5 (midday, zero cloud) returns the pinned day base colors verbatim', () => {
    const sp = scenePaint(0.5, CLEAR);
    expect(sp.sky.top).toEqual([62, 123, 208]);       // #3E7BD0
    expect(sp.sky.horizon).toEqual([187, 217, 239]);  // #BBD9EF
    expect(sp.sky.cloud).toEqual([244, 241, 232]);    // #F4F1E8
    expect(sp.far.ridgeFar).toEqual([139, 122, 141]); // #8B7A8D
    expect(sp.far.ridgeNear).toEqual([107, 93, 117]); // #6B5D75
    expect(sp.water.base).toEqual([92, 140, 196]);    // #5C8CC4
  });

  it('silhouette depth tiers darken from far to near (远浅近深)', () => {
    for (const t of [0.5, 1]) {
      const sp = scenePaint(t, CLEAR);
      expect(lum(sp.far.ridgeFar)).toBeGreaterThan(lum(sp.far.ridgeNear));
      expect(lum(sp.far.ridgeNear)).toBeGreaterThan(lum(sp.mid.bridge));
      expect(lum(sp.mid.bridge)).toBeGreaterThan(lum(sp.mid.silhouette));
      expect(lum(sp.mid.silhouette)).toBeGreaterThan(lum(sp.near.wharf));
      expect(lum(sp.near.wharf)).toBeGreaterThan(lum(sp.near.silhouette));
    }
  });

  it('daytime lights are off; night lights are on (spec §3 夜晚)', () => {
    const day = scenePaint(0.5, CLEAR);
    expect(day.light.windowLit).toBeLessThanOrEqual(0.05);
    expect(day.light.bridgeLampAlpha).toBe(0);
    expect(day.light.boatLampAlpha).toBe(0);
    expect(day.light.waterGlowAlpha).toBe(0);
    const night = scenePaint(1, CLEAR);
    expect(night.light.windowLit).toBeGreaterThanOrEqual(0.8);
    expect(night.light.bridgeLampAlpha).toBeGreaterThan(0.5);
    expect(night.light.boatLampAlpha).toBeGreaterThan(0.5);
    expect(night.light.waterGlowAlpha).toBeGreaterThan(0.3);
  });

  it('t=0 (dawn) keeps some lights on and stays dark', () => {
    const dawn = scenePaint(0, CLEAR);
    expect(dawn.light.bridgeLampAlpha).toBeGreaterThan(0.3);
    expect(dawn.sky.top[2]).toBeLessThan(90); // 黎明深蓝
  });

  it('interpolates midway between keyframes channel-wise', () => {
    const mid = scenePaint(0.14, CLEAR); // DAWN(0) ↔ MORNING(0.28) 中点
    const a = scenePaint(0, CLEAR);
    const b = scenePaint(0.28, CLEAR);
    for (let c = 0; c < 3; c++) {
      expect(mid.water.base[c]).toBeCloseTo((a.water.base[c] + b.water.base[c]) / 2, 6);
      expect(mid.mid.silhouette[c]).toBeCloseTo((a.mid.silhouette[c] + b.mid.silhouette[c]) / 2, 6);
    }
    expect(mid.water.rippleAlpha).toBeCloseTo((a.water.rippleAlpha + b.water.rippleAlpha) / 2, 6);
  });

  it('clamps t outside 0..1', () => {
    expect(scenePaint(-1, CLEAR)).toEqual(scenePaint(0, CLEAR));
    expect(scenePaint(2, CLEAR)).toEqual(scenePaint(1, CLEAR));
  });

  it('overcast desaturates the colour slots (阴天压灰,沿用)', () => {
    const clear = scenePaint(0.5, CLEAR);
    const overcast = scenePaint(0.5, effectsFromWeather(3, 0)); // cloudiness 0.9
    const spread = (c: Rgb) => Math.max(...c) - Math.min(...c);
    expect(spread(overcast.water.base)).toBeLessThan(spread(clear.water.base));
    expect(spread(overcast.sky.top)).toBeLessThan(spread(clear.sky.top));
    expect(spread(overcast.far.ridgeFar)).toBeLessThan(spread(clear.far.ridgeFar));
  });

  it('cloud cover suppresses the sun glitter path', () => {
    const clear = scenePaint(0.5, CLEAR);
    const overcast = scenePaint(0.5, effectsFromWeather(3, 0));
    expect(overcast.water.glitterAlpha).toBeLessThan(clear.water.glitterAlpha);
    expect(overcast.water.glitterAlpha).toBeGreaterThanOrEqual(0);
  });

  it('lamp colours are not desaturated by weather (灯光保暖色)', () => {
    const clearNight = scenePaint(1, CLEAR);
    const rainyNight = scenePaint(1, effectsFromWeather(63, 0));
    expect(rainyNight.light.bridgeLamp).toEqual(clearNight.light.bridgeLamp);
    expect(rainyNight.light.window).toEqual(clearNight.light.window);
  });

  it('carries the flicker epoch through (default 0)', () => {
    expect(scenePaint(0.5, CLEAR).light.flickerEpoch).toBe(0);
    expect(scenePaint(0.5, CLEAR, 7).light.flickerEpoch).toBe(7);
  });
});

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

describe('geometry contract', () => {
  it('bands match the spec §2 table and are each top<bottom', () => {
    expect(BAND.sky).toEqual({ top: 0, bottom: 0.4 });
    expect(BAND.mountain).toEqual({ top: 0.08, bottom: 0.42 });
    expect(BAND.bridge).toEqual({ top: 0.34, bottom: 0.42 });
    expect(BAND.city).toEqual({ top: 0.38, bottom: 0.58 });
    expect(BAND.waterfront).toEqual({ top: 0.54, bottom: 0.7 });
    expect(BAND.water).toEqual({ top: 0.6, bottom: 0.8 });
    expect(BAND.foreground).toEqual({ top: 0.74, bottom: 1 });
    for (const band of Object.values(BAND)) expect(band.top).toBeLessThan(band.bottom);
    expect(SKY_HORIZON_Y).toBe(BAND.sky.bottom);
    expect(WATERLINE).toBe(BAND.water.top);
    expect(WHARF_EDGE_Y).toBeGreaterThan(WATERLINE);
    expect(WHARF_EDGE_Y).toBeLessThan(BAND.waterfront.bottom);
  });

  it('shared anchors sit inside their bands (跨画师对齐锚点)', () => {
    expect(BRIDGE.x0).toBe(0.02);
    expect(BRIDGE.x1).toBe(0.38);
    for (let i = 0; i < BRIDGE.pierXs.length; i++) {
      expect(BRIDGE.pierXs[i]).toBeGreaterThanOrEqual(BRIDGE.x0);
      expect(BRIDGE.pierXs[i]).toBeLessThanOrEqual(BRIDGE.x1);
      if (i > 0) expect(BRIDGE.pierXs[i]).toBeGreaterThan(BRIDGE.pierXs[i - 1]);
    }
    for (const tw of CITY_TOWERS) {
      expect(tw.top).toBeGreaterThanOrEqual(BAND.city.top);
      expect(tw.top).toBeLessThan(BAND.city.bottom);
      expect(tw.x).toBeGreaterThan(0);
      expect(tw.x + tw.w).toBeLessThan(1);
    }
    for (const wh of WAREHOUSES) {
      expect(wh.ridgeY).toBeGreaterThanOrEqual(BAND.waterfront.top);
      expect(wh.ridgeY).toBeLessThan(WHARF_EDGE_Y);
    }
    for (const b of BOATS) {
      expect(b.y).toBeGreaterThan(WATERLINE);
      expect(b.y).toBeLessThan(BAND.water.bottom);
    }
    // 山脊折线 x 单调、y 在带内(山顶发射塔允许高出带顶,不在此断言)
    for (const ridge of [MOUNTAIN.farRidge, MOUNTAIN.nearRidge]) {
      for (let i = 1; i < ridge.length; i++) expect(ridge[i][0]).toBeGreaterThan(ridge[i - 1][0]);
      for (const [, y] of ridge) {
        expect(y).toBeGreaterThanOrEqual(BAND.mountain.top);
        expect(y).toBeLessThanOrEqual(BAND.mountain.bottom);
      }
    }
  });

  it('mulberry32 is deterministic per seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const c = mulberry32(43);
    const seqA = [a(), a(), a(), a(), a()];
    const seqB = [b(), b(), b(), b(), b()];
    const seqC = [c(), c(), c(), c(), c()];
    expect(seqA).toEqual(seqB);
    expect(seqA).not.toEqual(seqC);
    for (const v of seqA) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
