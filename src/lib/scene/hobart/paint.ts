// 分层剪影调色(hobart 设计 §3 修订版):六关键帧(与 palette.KEYS 相同的 t 停靠点)
// 插值出 ScenePaint;进深五档剪影色远浅近深(测试钉死亮度递减);阴/雨去饱和并入
// (画师拿到的已是压灰后的颜色);灯光组不去饱和。纯函数,零 DOM,单测钉死。
// 日/月/星/窗灯系数/压暗幕沿用 getPalette(公共 API 不动)。

import { getPalette } from '@/lib/scene/palette';
import type { SceneEffects } from '@/lib/scene/weather';
import type { Rgb, ScenePaint } from './geometry';

// 灯光固定暖色(全帧同色,强度由各 alpha 控)。
const BRIDGE_LAMP: Rgb = [255, 214, 140];
const BOAT_LAMP: Rgb = [255, 190, 110];
const WATER_GLOW: Rgb = [255, 200, 120];

type HFrame = {
  skyTop: Rgb; skyHor: Rgb; cloud: Rgb; cloudShade: Rgb;
  ridgeFar: Rgb; ridgeNear: Rgb; mist: Rgb; mistAlpha: number;
  bridgeSil: Rgb; midSil: Rgb; wharfSil: Rgb; fgSil: Rgb;
  waterBase: Rgb; ripple: Rgb; rippleAlpha: number;
  reflection: Rgb; reflectionAlpha: number; glitter: Rgb; glitterAlpha: number;
  hull: Rgb;
  bridgeLampAlpha: number; boatLampAlpha: number; waterGlowAlpha: number;
};

// 停靠点与 palette.KEYS 一致:DAWN 0 / MORNING 0.28 / MIDDAY 0.5 / GOLDEN 0.68 / SUNSET 0.84 / NIGHT 1。
const STOPS = [0, 0.28, 0.5, 0.68, 0.84, 1];

// MIDDAY 的天空/山体/水面沿用原参考基准色(#3E7BD0/#BBD9EF、#8B7A8D/#6B5D75、#5C8CC4,
// 测试逐字钉死;正是需求方"正午天空更通透的钴蓝→近地平线奶白"参考质感的目标色,不再调整)。
// 其余帧按时段氛围定稿写死;色调质感打磨(2026-08-19 二轮):MORNING 云暖白化、
// GOLDEN 天空/云饱和度上调(更浓烈暖金)、NIGHT 天空/云整体压深(更藏蓝);
// 只动 sky/cloud 字段,far/mid/near 剪影色与水面/灯光组不动 —— 进深五档亮度序与既有
// 单测(hobart.test.ts)逐字钉死的 MIDDAY 值均不受影响。
// 每一帧内进深亮度严格递减:ridgeFar > ridgeNear > bridgeSil > midSil > wharfSil > fgSil
// (已逐帧验算;线性插值保序,任意 t 都成立)。
const FRAMES: HFrame[] = [
  { // DAWN 黎明深蓝
    skyTop: [18, 24, 58], skyHor: [96, 62, 78], cloud: [96, 88, 112], cloudShade: [74, 66, 92],
    ridgeFar: [52, 48, 76], ridgeNear: [40, 38, 62], mist: [70, 60, 90], mistAlpha: 0.35,
    bridgeSil: [32, 34, 56], midSil: [25, 27, 46], wharfSil: [19, 21, 37], fgSil: [12, 14, 27],
    waterBase: [34, 40, 72], ripple: [90, 94, 130], rippleAlpha: 0.22,
    reflection: [14, 18, 38], reflectionAlpha: 0.42, glitter: [255, 190, 150], glitterAlpha: 0.12,
    hull: [18, 20, 36],
    bridgeLampAlpha: 0.55, boatLampAlpha: 0.5, waterGlowAlpha: 0.35,
  },
  { // MORNING 清爽偏冷(云暖白化,呼应参考插画质感)
    skyTop: [92, 148, 210], skyHor: [178, 208, 232], cloud: [244, 238, 226], cloudShade: [212, 204, 190],
    ridgeFar: [150, 140, 160], ridgeNear: [118, 108, 132], mist: [176, 196, 218], mistAlpha: 0.34,
    bridgeSil: [98, 108, 132], midSil: [76, 88, 112], wharfSil: [56, 68, 92], fgSil: [40, 50, 70],
    waterBase: [104, 146, 192], ripple: [222, 236, 244], rippleAlpha: 0.32,
    reflection: [50, 72, 102], reflectionAlpha: 0.3, glitter: [255, 244, 210], glitterAlpha: 0.3,
    hull: [46, 54, 72],
    bridgeLampAlpha: 0, boatLampAlpha: 0, waterGlowAlpha: 0,
  },
  { // MIDDAY 日间基准(测试钉死)
    skyTop: [62, 123, 208], skyHor: [187, 217, 239], cloud: [244, 241, 232], cloudShade: [214, 212, 204],
    ridgeFar: [139, 122, 141], ridgeNear: [107, 93, 117], mist: [186, 208, 226], mistAlpha: 0.26,
    bridgeSil: [88, 96, 120], midSil: [70, 80, 104], wharfSil: [52, 62, 84], fgSil: [36, 44, 62],
    waterBase: [92, 140, 196], ripple: [216, 234, 246], rippleAlpha: 0.35,
    reflection: [42, 64, 94], reflectionAlpha: 0.32, glitter: [255, 248, 220], glitterAlpha: 0.35,
    hull: [40, 48, 66],
    bridgeLampAlpha: 0, boatLampAlpha: 0, waterGlowAlpha: 0,
  },
  { // GOLDEN 整城暖金(饱和度上调,天空/云更浓烈的暖金调)
    skyTop: [80, 110, 178], skyHor: [248, 158, 72], cloud: [253, 208, 150], cloudShade: [222, 158, 104],
    ridgeFar: [148, 116, 124], ridgeNear: [116, 90, 102], mist: [230, 176, 120], mistAlpha: 0.3,
    bridgeSil: [104, 82, 96], midSil: [84, 66, 82], wharfSil: [62, 48, 66], fgSil: [42, 32, 50],
    waterBase: [150, 126, 140], ripple: [252, 216, 160], rippleAlpha: 0.4,
    reflection: [70, 56, 80], reflectionAlpha: 0.36, glitter: [255, 214, 140], glitterAlpha: 0.5,
    hull: [46, 36, 54],
    bridgeLampAlpha: 0.12, boatLampAlpha: 0.1, waterGlowAlpha: 0.08,
  },
  { // SUNSET 天空橙红、全场剪影化
    skyTop: [46, 46, 100], skyHor: [246, 118, 74], cloud: [234, 150, 120], cloudShade: [176, 102, 96],
    ridgeFar: [70, 56, 92], ridgeNear: [52, 42, 72], mist: [160, 96, 100], mistAlpha: 0.32,
    bridgeSil: [42, 35, 62], midSil: [33, 28, 52], wharfSil: [24, 21, 42], fgSil: [15, 14, 30],
    waterBase: [96, 70, 100], ripple: [244, 150, 110], rippleAlpha: 0.38,
    reflection: [28, 24, 50], reflectionAlpha: 0.46, glitter: [255, 150, 90], glitterAlpha: 0.55,
    hull: [18, 17, 36],
    bridgeLampAlpha: 0.5, boatLampAlpha: 0.45, waterGlowAlpha: 0.35,
  },
  { // NIGHT 更深邃的藏蓝压暗、暖灯点亮
    skyTop: [5, 8, 26], skyHor: [20, 28, 58], cloud: [28, 34, 58], cloudShade: [18, 22, 40],
    ridgeFar: [26, 30, 52], ridgeNear: [19, 23, 42], mist: [36, 46, 78], mistAlpha: 0.24,
    bridgeSil: [18, 22, 40], midSil: [14, 18, 34], wharfSil: [11, 14, 27], fgSil: [7, 9, 20],
    waterBase: [20, 30, 56], ripple: [92, 110, 150], rippleAlpha: 0.2,
    reflection: [6, 10, 24], reflectionAlpha: 0.55, glitter: [214, 228, 250], glitterAlpha: 0.3,
    hull: [10, 12, 24],
    bridgeLampAlpha: 0.9, boatLampAlpha: 0.85, waterGlowAlpha: 0.55,
  },
];

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function lerp(a: number, b: number, u: number): number {
  return a + (b - a) * u;
}

/** 三次平滑过渡(Hermite ease):0..1 之间导数在两端为 0,无硬折线突变。 */
function smoothstep(edge0: number, edge1: number, x: number): number {
  const u = clamp01((x - edge0) / (edge1 - edge0));
  return u * u * (3 - 2 * u);
}

function lerpRgb(a: Rgb, b: Rgb, u: number): Rgb {
  return [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)];
}

/** 帧字段只有 Rgb 与 number 两种,逐键泛化插值。 */
function lerpFrame(a: HFrame, b: HFrame, u: number): HFrame {
  const out: Record<string, Rgb | number> = {};
  for (const k of Object.keys(a) as (keyof HFrame)[]) {
    const va = a[k];
    const vb = b[k];
    out[k] = typeof va === 'number' ? lerp(va, vb as number, u) : lerpRgb(va, vb as Rgb, u);
  }
  return out as unknown as HFrame;
}

function frameAt(t: number): HFrame {
  const tc = clamp01(t);
  let i = 0;
  while (i < FRAMES.length - 2 && tc > STOPS[i + 1]) i++;
  const span = STOPS[i + 1] - STOPS[i];
  const u = span === 0 ? 0 : clamp01((tc - STOPS[i]) / span);
  return lerpFrame(FRAMES[i], FRAMES[i + 1], u);
}

/** 阴/雨天压灰(与旧装配器同公式):向自身灰度值混合 amount。 */
function grayMix(c: Rgb, amount: number): Rgb {
  const g = 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
  const u = Math.min(1, amount);
  return [lerp(c[0], g, u), lerp(c[1], g, u), lerp(c[2], g, u)];
}

/**
 * 分层剪影调色主入口:t = phaseFromClock 的调色相位,fx = effectsFromWeather 的天气特效,
 * flickerEpoch = 4s 窗灯闪烁纪元(装配器注入;city 画师用它做低频闪烁)。
 * 返回的色槽已按云量/雨量去饱和;灯光组(light.* 与 water.glitter)保持暖色不压灰,
 * 波光强度按云量衰减(云遮日)。
 */
export function scenePaint(t: number, fx: SceneEffects, flickerEpoch = 0): ScenePaint {
  const base = getPalette(t);
  const f = frameAt(t);
  const gray = Math.min(1, fx.cloudiness * 0.45 + fx.rain * 0.08);
  const g = (c: Rgb): Rgb => grayMix(c, gray);
  return {
    sky: {
      top: g(f.skyTop), horizon: g(f.skyHor), cloud: g(f.cloud), cloudShade: g(f.cloudShade),
      sun: base.sun, glow: base.glow, star: base.star,
    },
    far: {
      ridgeFar: g(f.ridgeFar), ridgeNear: g(f.ridgeNear),
      mist: g(f.mist), mistAlpha: Math.min(0.85, f.mistAlpha + (fx.fog ? 0.2 : 0)),
    },
    mid: {
      silhouette: g(f.midSil), bridge: g(f.bridgeSil),
    },
    near: {
      silhouette: g(f.fgSil), wharf: g(f.wharfSil),
    },
    water: {
      base: g(f.waterBase),
      ripple: g(f.ripple), rippleAlpha: f.rippleAlpha,
      reflection: g(f.reflection), reflectionAlpha: f.reflectionAlpha,
      glitter: f.glitter, glitterAlpha: f.glitterAlpha * (1 - fx.cloudiness * 0.8),
      hull: g(f.hull),
    },
    light: {
      window: base.window, windowLit: base.windowLit,
      bridgeLamp: BRIDGE_LAMP, bridgeLampAlpha: f.bridgeLampAlpha,
      boatLamp: BOAT_LAMP, boatLampAlpha: f.boatLampAlpha,
      waterGlow: WATER_GLOW, waterGlowAlpha: f.waterGlowAlpha,
      flickerEpoch,
    },
    dim: base.dim,
  };
}

// —— 窗灯作息调度(独立于 phaseFromClock 的日出日落相位;只看现场时钟"几点钟")——
//
// 白天基线校准依据(2026-08-19 实测,mirrors 各画师 litRand < windowLit 的判定逻辑):
//   city.ts drawWindowGrid  — 6 座 block 塔楼窗格网格(列距 0.008/行距 0.014,内边距
//     0.003),逐塔楼实测网格数 84+48+65+33+48+44 = 322 格,命中概率直接用 windowLit;
//   foreground.ts           — 屋顶窗点 4 个候选,命中概率 windowLit×0.5;
//   waterfront.ts           — 4 座仓库×2 处灯位 = 8 个候选,命中概率 windowLit×0.6;
//   mountain.ts             — 山脚发光点阵 30 个候选,命中概率 windowLit×0.4。
// 折算成同权重下的"等效候选数"= 322×1 + 4×0.5 + 8×0.6 + 30×0.4 ≈ 340.8(≥ 原设计
// 估算的"~150+",按实测数据为准)。要让白天期望点亮数落在 2–3 盏区间(取中值 2.5),
// 基线 = 2.5 / 340.8 ≈ 0.0073,就近取 DAY_BASE = 0.0075(期望 ≈ 2.6 盏;伯努利方差下
// 单帧实际点亮数多在 0–5 盏间波动,与"大约两三个"的目视描述相符)。
const DAY_BASE = 0.0075;
// 18:00→19:00 爬升 / 22:00→23:00 回落的目标峰值(需求方直接给定,不参与网格校准)。
const NIGHT_PEAK = 0.92;

/**
 * 窗灯作息调度:纯本地时钟驱动(与 phaseFromClock 推的调色相位 t 无关,不随日出日落
 * 漂移)。05:00–18:00 白天基线 DAY_BASE(见上方校准注释);18:00→19:00 用 smoothstep
 * 平滑爬升到夜间峰值 NIGHT_PEAK——随机顺序渐次点亮由各画师既有的
 * `litRand < sp.light.windowLit` 判定天然实现,不需要改画师;19:00–22:00 保持峰值;
 * 22:00→23:00 平滑回落到 0(渐次熄灭);23:00–05:00 全暗。桥灯/船灯/水面灯影走各自的
 * bridgeLampAlpha/boatLampAlpha/waterGlowAlpha,不受本调度影响。
 */
export function windowLitSchedule(now: Date): number {
  const hr = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
  if (hr < 5 || hr >= 23) return 0;
  if (hr < 18) return DAY_BASE;
  if (hr < 19) return lerp(DAY_BASE, NIGHT_PEAK, smoothstep(18, 19, hr));
  if (hr < 22) return NIGHT_PEAK;
  return lerp(NIGHT_PEAK, 0, smoothstep(22, 23, hr)); // hr ∈ [22, 23)
}
