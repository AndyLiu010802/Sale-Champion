import { describe, it, expect } from 'vitest';
import { slotColors } from '@/lib/scene/slots';
import { scenePaint } from '@/lib/scene/paint';
import { effectsFromWeather } from '@/lib/scene/weather';
import { SCENE_SLOTS } from '@/lib/scene/sceneSvg';

const CLEAR = effectsFromWeather(0, 0);       // 晴,云量 0.1
const OVERCAST = effectsFromWeather(3, 0);    // 阴,云量 0.9

/** '#1A2B3C' → 相对亮度 0..1 */
function lum(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}
const groupSlots = (g: string) => SCENE_SLOTS.filter((s) => s.group === g);

describe('slotColors', () => {
  it('returns a colour for every declared slot, keyed with the -- prefix', () => {
    const out = slotColors(scenePaint(0.5, CLEAR));
    expect(Object.keys(out)).toHaveLength(SCENE_SLOTS.length);
    for (const s of SCENE_SLOTS) expect(out[`--${s.id}`]).toMatch(/^#[0-9A-F]{6}$/);
  });

  it('preserves the artwork ordering inside a group — brighter source stays brighter', () => {
    const out = slotColors(scenePaint(0.5, CLEAR));
    for (const g of ['mountains', 'city', 'water']) {
      const ranked = [...groupSlots(g)].sort((a, b) => a.lum - b.lum);
      const got = ranked.map((s) => lum(out[`--${s.id}`]));
      for (let i = 1; i < got.length; i++) expect(got[i]).toBeGreaterThanOrEqual(got[i - 1] - 1e-6);
    }
  });

  it('night is darker than midday for every scenery group', () => {
    const day = slotColors(scenePaint(0.5, CLEAR));
    const night = slotColors(scenePaint(1, CLEAR));
    for (const g of ['sky', 'mountains', 'city', 'water']) {
      for (const s of groupSlots(g)) {
        expect(lum(night[`--${s.id}`])).toBeLessThan(lum(day[`--${s.id}`]));
      }
    }
  });

  it('overcast desaturates the scenery (设计 §4.3 阴天压灰)', () => {
    const clear = slotColors(scenePaint(0.5, CLEAR));
    const dull = slotColors(scenePaint(0.5, OVERCAST));
    const spread = (hex: string) => {
      const ch = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      return Math.max(...ch) - Math.min(...ch);
    };
    const id = `--${groupSlots('sky')[0].id}`;
    expect(spread(dull[id])).toBeLessThan(spread(clear[id]));
  });

  it('lamp colours are never desaturated by weather (设计 §4.3 灯光保暖色)', () => {
    const clear = slotColors(scenePaint(1, CLEAR));
    const dull = slotColors(scenePaint(1, OVERCAST));
    for (const s of groupSlots('hillside-houses')) {
      expect(dull[`--${s.id}`]).toBe(clear[`--${s.id}`]);
    }
  });

  it('never flattens a group — midday keeps visible light and shade inside each group', () => {
    // 归一化前实测:sailboat 三个槽全在 0.20–0.23(白帆与船体同色)、city 七个槽全在
    // 0.19–0.29(白雨棚融进楼体)。这条把那种坍塌钉死。
    const out = slotColors(scenePaint(0.5, CLEAR));
    for (const g of [...new Set(SCENE_SLOTS.map((s) => s.group))]) {
      const got = groupSlots(g).map((s) => lum(out[`--${s.id}`]));
      if (got.length < 2) continue;  // 单槽组无所谓层次
      expect(Math.max(...got) - Math.min(...got)).toBeGreaterThanOrEqual(0.08);
    }
  });

  it('is pure — same input twice gives the identical object', () => {
    const sp = scenePaint(0.68, CLEAR);
    expect(slotColors(sp)).toEqual(slotColors(sp));
  });
});
