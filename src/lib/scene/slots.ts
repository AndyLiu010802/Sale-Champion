// 色槽取色:把 scenePaint 产出的 ScenePaint 铺到 sceneSvg 的色槽上(SVG 场景设计 §4.2)。
// 每组一条暗→亮色带,槽位按构建期记下的原始亮度在带上取值 —— 原画的明暗层次因此保留。
// 纯函数,零 DOM。

import { SCENE_SLOTS } from './sceneSvg';
import type { Rgb, ScenePaint } from './types';

type Ramp = [Rgb, Rgb];

function ramps(sp: ScenePaint): Record<string, Ramp> {
  return {
    'sky': [sp.sky.top, sp.sky.horizon],
    'sky-clouds': [sp.sky.cloudShade, sp.sky.cloud],
    'mountains': [sp.far.ridgeNear, sp.far.ridgeFar],
    'mountain-contours': [sp.far.ridgeNear, sp.far.ridgeFar],
    'mountain-contour-lines': [sp.far.ridgeNear, sp.far.mist],
    'hillside-houses': [sp.light.window, sp.light.window],
    'city': [sp.near.silhouette, sp.far.mist],
    'tasman-bridge': [sp.mid.bridge, sp.far.mist],
    'water': [sp.water.base, sp.water.ripple],
    'water-sparkles': [sp.water.base, sp.water.glitter],
    'reflections': [sp.water.reflection, sp.light.waterGlow],
    'sailboat': [sp.water.hull, sp.sky.cloud],
    'foreground-ripples': [sp.water.base, sp.water.ripple],
  };
}

function hex(c: Rgb): string {
  return '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v)))
    .toString(16).padStart(2, '0').toUpperCase()).join('');
}

/** 各组的 lum 上下界:模块加载时算一次,用于把槽位归一化到自己组的色带上。 */
const BOUNDS: Record<string, [number, number]> = (() => {
  const b: Record<string, [number, number]> = {};
  for (const s of SCENE_SLOTS) {
    const cur = b[s.group] ?? [1, 0];
    b[s.group] = [Math.min(cur[0], s.lum), Math.max(cur[1], s.lum)];
  }
  return b;
})();

export function slotColors(sp: ScenePaint): Record<string, string> {
  const table = ramps(sp);
  const out: Record<string, string> = {};
  for (const slot of SCENE_SLOTS) {
    const [dark, light] = table[slot.group] ?? table['mountains'];
    const [lo, hi] = BOUNDS[slot.group];
    const t = hi > lo ? (slot.lum - lo) / (hi - lo) : 0.5;  // 单槽组取中点
    out[`--${slot.id}`] = hex([
      dark[0] + (light[0] - dark[0]) * t,
      dark[1] + (light[1] - dark[1]) * t,
      dark[2] + (light[2] - dark[2]) * t,
    ]);
  }
  return out;
}
