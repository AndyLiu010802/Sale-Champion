import { describe, expect, it } from 'vitest';
import {
  BAND, BOATS, BRIDGE, CITY_TOWERS, MOUNTAIN, SKY_HORIZON_Y,
  WAREHOUSES, WATERLINE, WHARF_EDGE_Y,
} from '@/lib/scene/hobart/geometry';
import { mulberry32 } from '@/lib/scene/types';

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
