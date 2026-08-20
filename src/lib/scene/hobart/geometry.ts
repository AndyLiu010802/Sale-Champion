// 霍巴特剪影场景的归一化几何契约(hobart 设计 §2;§3 修订为单色剪影画风)。
// 坐标系:x、y 均为屏幕比例 0..1(绘制时 × 画布 w/h)。7 个画师文件只依赖本文件与
// ScenePaint,互不 import,可并行开发;跨层必须对齐的锚点(桥墩、塔楼、仓库、船位)
// 全部定死在这里 —— city 画师按锚点起轮廓,water 画师按同一锚点拉倒影。
// 剪影可辨识性全部来自这些轮廓锚点,不许自创位置。

// —— 兼容 shim(scene-svg Task 1,2026-08-20)——
// Rgb / ScenePaint / mulberry32 / rgba 这四个名字已经搬到 ../types(唯一权威副本);
// 这里只是重新导出,好让本目录 7 个画师文件里未改动的 `from './geometry'` 继续能用。
// 整个 hobart/ 目录会在 Task 5 随画师一起删掉,这层 shim 到时候一并消失——新代码请直接
// `import ... from '@/lib/scene/types'`,不要再从这里绕。
// ScenePaint 用 import + `export type { ScenePaint }`(而非纯 `export type {...} from`)
// 是因为下面 LayerFn / WaterDynamicFn / CloudFn 三个函数签名要在本文件内部用到这个类型
// 名字——纯 re-export-from 语法不会给当前模块留下本地绑定,直接用会编译报错。
import type { Rgb, ScenePaint } from '../types';

export type { Rgb, ScenePaint };
export { mulberry32, rgba } from '../types';

// —— 分层纵向区间(设计 §2 表格;层间刻意重叠做遮挡)——
export const BAND = {
  sky: { top: 0, bottom: 0.4 },
  mountain: { top: 0.08, bottom: 0.42 },
  bridge: { top: 0.34, bottom: 0.42 },
  city: { top: 0.38, bottom: 0.58 },
  waterfront: { top: 0.54, bottom: 0.7 },
  water: { top: 0.6, bottom: 0.8 },
  foreground: { top: 0.74, bottom: 1 },
} as const;

/** 天空渐变终点 & 日月弧线的"地平线":日/月最低点沉入山体/城市之后。 */
export const SKY_HORIZON_Y = BAND.sky.bottom;
/** 名义水面上沿(倒影/波纹参考线;水面色带实际从 0.56 起铺,藏进码头层后防接缝)。 */
export const WATERLINE = BAND.water.top;
/** 码头岸壁下缘:倒影与灯影从这里往下拉;waterfront 的剪影立面到此为止。 */
export const WHARF_EDGE_Y = 0.635;

// —— 威灵顿山(mountain 画师)——
export const MOUNTAIN = {
  /** 远脊剪影折线:主峰 x≈0.30;点间直线或平滑曲线,向下闭合填充到带底。 */
  farRidge: [
    [0, 0.2], [0.1, 0.155], [0.2, 0.118], [0.3, 0.095], [0.36, 0.105],
    [0.46, 0.148], [0.56, 0.168], [0.68, 0.205], [0.84, 0.245], [1, 0.285],
  ] as [number, number][],
  /** 近脊剪影折线。 */
  nearRidge: [
    [0, 0.3], [0.08, 0.252], [0.17, 0.212], [0.27, 0.238], [0.4, 0.286],
    [0.55, 0.33], [0.72, 0.368], [0.9, 0.396], [1, 0.404],
  ] as [number, number][],
  /** 山顶发射塔(kunanyi 塔;剪影桅杆并入远脊轮廓,允许高出带顶)。 */
  towerX: 0.3,
  towerTopY: 0.052,
  /** 山脚碎点带(夜间发光点阵用)与雾霭带。 */
  suburbBand: { top: 0.34, bottom: 0.41 },
  mistBand: { top: 0.36, bottom: 0.42 },
} as const;

// —— 塔斯曼桥(bridge 画师;夜晚灯串也按这些锚点)——
export const BRIDGE = {
  x0: 0.02,
  x1: 0.38,
  /** 桥面两端基准高度;主跨中央拱起 deckRise(最高点 x=crestX)。 */
  deckY: 0.378,
  deckRise: 0.02,
  crestX: 0.17,
  deckThickness: 0.008,
  pierBottom: 0.42,
  /** 桥墩横位(升序);mainSpan 两墩是主航道墩(更高更粗)。 */
  pierXs: [0.05, 0.1, 0.145, 0.2, 0.25, 0.3, 0.35],
  mainSpan: [0.145, 0.2],
  /** 夜晚桥面路灯串间距。 */
  lampStep: 0.022,
} as const;

// —— 中景 CBD 天际线锚点(city 起轮廓;water 按同一锚点拉倒影)——
// kind 只区分剪影轮廓形状:block 平顶方楼 / dome 圆顶 / clock 细高钟楼(小尖顶)。
export type TowerKind = 'block' | 'dome' | 'clock';
export type TowerSpec = { x: number; w: number; top: number; kind: TowerKind };
export const CITY_TOWERS: TowerSpec[] = [
  { x: 0.315, w: 0.048, top: 0.386, kind: 'block' }, // 参考图主楼(最高)
  { x: 0.395, w: 0.03, top: 0.412, kind: 'block' },
  { x: 0.435, w: 0.042, top: 0.398, kind: 'block' },
  { x: 0.487, w: 0.026, top: 0.428, kind: 'block' },
  { x: 0.523, w: 0.036, top: 0.408, kind: 'block' },
  { x: 0.568, w: 0.03, top: 0.432, kind: 'block' },
  { x: 0.664, w: 0.034, top: 0.452, kind: 'dome' },  // 圆顶地标
  { x: 0.862, w: 0.02, top: 0.44, kind: 'clock' },   // 钟楼(细高+小尖顶)
];

// —— 码头仓库带(waterfront 画师;剪影 = 连排山墙齿线)——
export type WarehouseSpec = { x: number; w: number; ridgeY: number };
export const WAREHOUSES: WarehouseSpec[] = [
  { x: 0.1, w: 0.11, ridgeY: 0.56 },
  { x: 0.23, w: 0.09, ridgeY: 0.568 },
  { x: 0.56, w: 0.12, ridgeY: 0.556 },
  { x: 0.7, w: 0.1, ridgeY: 0.566 },
];
/** 连排小山墙齿段(仓库之间的锯齿屋顶线)。 */
export const TERRACE_ROW = { x0: 0.335, x1: 0.545, topY: 0.578, baseY: WHARF_EDGE_Y } as const;

// —— 港湾小船(water 画师;2–3 艘,轻微上下摇)——
export type BoatSpec = { x: number; y: number; scale: number; bobPhase: number };
export const BOATS: BoatSpec[] = [
  { x: 0.5, y: 0.685, scale: 1, bobPhase: 0 },
  { x: 0.66, y: 0.715, scale: 1.35, bobPhase: 2.1 },
  { x: 0.83, y: 0.67, scale: 0.8, bobPhase: 4.2 },
];
/** 船摇幅度(屏高比例;drawWaterDynamic 里 sin(timeSec*0.9 + bobPhase) × 此值)。 */
export const BOAT_BOB_AMPL = 0.004;

// —— 绘制函数契约 ——
export type LayerFn = (
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  sp: ScenePaint,
  rng: () => number,
) => void;

/** 水面动态(每帧):timeSec 驱动波纹/船摇;bodyX = 日/月水平位(0..1,波光路径锚);
 *  bodyVisible = 日/月在地平线上(false 时不画波光)。 */
export type WaterDynamicFn = (
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  sp: ScenePaint,
  timeSec: number,
  bodyX: number,
  bodyVisible: boolean,
) => void;

/** 平涂积云:cx/cy 云心(屏比例;x 由装配器逐帧推进),scale 0.7–1.6,alpha 由云量推得。 */
export type CloudFn = (
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  sp: ScenePaint,
  cx: number,
  cy: number,
  scale: number,
  alpha: number,
  rng: () => number,
) => void;

/** 各层固定随机种子:装配器每次调用画师前用它新建 rng,细节布局刷新不变形(设计 §2)。 */
export const LAYER_SEEDS = {
  sky: 877, mountain: 811, bridge: 822, city: 833,
  waterfront: 844, water: 855, foreground: 866,
} as const;
