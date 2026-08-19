// TV 天际线背景的配色系统(天际线设计 §2):KEYS 关键帧 + 线性插值。全部纯函数,零 DOM。
//
// t(0..1)是"一天的调色相位",由 phaseFromClock 从真实时钟与日出日落推出:
//   0    DAWN    日出前 45 分钟(黎明前深蓝;与 NIGHT 相近,夜→晨切换不跳变)
//   0.28 MORNING 日出后 45 分钟(清晨蓝天)
//   0.5  MIDDAY  日照中点(正午高蓝)
//   0.68 GOLDEN  日落前 90 分钟(金色时刻)
//   0.84 SUNSET  日落时刻(橙红)
//   1    NIGHT   日落后 40 分钟起整夜恒定(月亮位置由 nightProgress 另推)

export type Rgb = [number, number, number];

export type Palette = {
  skyTop: Rgb;       // 天空渐变顶色
  skyHor: Rgb;       // 天空渐变地平线色
  sun: Rgb;          // 太阳圆盘色(NIGHT 帧 = 月亮色)
  glow: Rgb;         // 日/月径向光晕色
  buildingFar: Rgb;  // 楼群三档:远(最浅,进深感)
  buildingMid: Rgb;  //           中
  buildingNear: Rgb; //           近(最深,前景剪影)
  window: Rgb;       // 窗灯暖黄(全帧同色,亮度由 windowLit 控)
  windowLit: number; // 0..1 点亮窗户比例(夜间渐次点亮、日间熄灭)
  star: number;      // 0..1 星星亮度系数
  haze: Rgb;         // 地平线雾霭色
  hazeAlpha: number; // 雾霭不透明度
  dim: number;       // 整体压暗幕 rgba(6,8,15,dim)(设计 §5:白天 0.45 → 夜 0.35)
};

export type PaletteKey = { t: number; name: string; p: Palette };

// 六关键帧(城市版,自海洋版参考实现的天空/太阳/光晕值改造;数值写死,不留调参项)。
export const KEYS: PaletteKey[] = [
  {
    t: 0,
    name: 'DAWN',
    p: {
      skyTop: [18, 24, 58], skyHor: [96, 62, 78],
      sun: [255, 178, 128], glow: [255, 140, 100],
      buildingFar: [36, 38, 60], buildingMid: [26, 28, 46], buildingNear: [16, 17, 30],
      window: [255, 196, 120], windowLit: 0.5,
      star: 0.35,
      haze: [70, 60, 90], hazeAlpha: 0.35,
      dim: 0.38,
    },
  },
  {
    t: 0.28,
    name: 'MORNING',
    p: {
      skyTop: [92, 148, 210], skyHor: [178, 208, 232],
      sun: [255, 238, 200], glow: [255, 220, 160],
      buildingFar: [88, 108, 138], buildingMid: [62, 78, 106], buildingNear: [38, 48, 70],
      window: [255, 196, 120], windowLit: 0.06,
      star: 0,
      haze: [170, 195, 220], hazeAlpha: 0.22,
      dim: 0.45,
    },
  },
  {
    t: 0.5,
    name: 'MIDDAY',
    p: {
      skyTop: [58, 128, 214], skyHor: [150, 200, 240],
      sun: [255, 250, 235], glow: [255, 244, 214],
      buildingFar: [96, 118, 148], buildingMid: [66, 84, 112], buildingNear: [40, 52, 74],
      window: [255, 196, 120], windowLit: 0.03,
      star: 0,
      haze: [160, 190, 220], hazeAlpha: 0.16,
      dim: 0.45,
    },
  },
  {
    t: 0.68,
    name: 'GOLDEN',
    p: {
      skyTop: [80, 110, 178], skyHor: [244, 176, 96],
      sun: [255, 214, 130], glow: [255, 176, 90],
      buildingFar: [96, 92, 120], buildingMid: [64, 62, 90], buildingNear: [38, 38, 58],
      window: [255, 196, 120], windowLit: 0.15,
      star: 0,
      haze: [220, 160, 110], hazeAlpha: 0.24,
      dim: 0.44,
    },
  },
  {
    t: 0.84,
    name: 'SUNSET',
    p: {
      skyTop: [46, 46, 100], skyHor: [246, 118, 74],
      sun: [255, 132, 74], glow: [255, 96, 60],
      buildingFar: [58, 48, 84], buildingMid: [40, 33, 60], buildingNear: [24, 20, 40],
      window: [255, 196, 120], windowLit: 0.55,
      star: 0.08,
      haze: [150, 90, 100], hazeAlpha: 0.3,
      dim: 0.4,
    },
  },
  {
    t: 1,
    name: 'NIGHT',
    p: {
      skyTop: [8, 12, 32], skyHor: [30, 38, 72],
      sun: [230, 236, 250], glow: [180, 200, 235],
      buildingFar: [24, 28, 50], buildingMid: [16, 19, 36], buildingNear: [9, 11, 22],
      window: [255, 196, 120], windowLit: 0.85,
      star: 1,
      haze: [40, 50, 85], hazeAlpha: 0.28,
      dim: 0.35,
    },
  },
];

export function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function lerp(a: number, b: number, u: number): number {
  return a + (b - a) * u;
}

function lerpRgb(a: Rgb, b: Rgb, u: number): Rgb {
  return [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)];
}

/** 关键帧线性插值;t 越界钳制到 0..1。 */
export function getPalette(t: number): Palette {
  const tc = clamp01(t);
  let i = 0;
  while (i < KEYS.length - 2 && tc > KEYS[i + 1].t) i++;
  const a = KEYS[i];
  const b = KEYS[i + 1];
  const u = b.t === a.t ? 0 : clamp01((tc - a.t) / (b.t - a.t));
  const pa = a.p;
  const pb = b.p;
  return {
    skyTop: lerpRgb(pa.skyTop, pb.skyTop, u),
    skyHor: lerpRgb(pa.skyHor, pb.skyHor, u),
    sun: lerpRgb(pa.sun, pb.sun, u),
    glow: lerpRgb(pa.glow, pb.glow, u),
    buildingFar: lerpRgb(pa.buildingFar, pb.buildingFar, u),
    buildingMid: lerpRgb(pa.buildingMid, pb.buildingMid, u),
    buildingNear: lerpRgb(pa.buildingNear, pb.buildingNear, u),
    window: lerpRgb(pa.window, pb.window, u),
    windowLit: lerp(pa.windowLit, pb.windowLit, u),
    star: lerp(pa.star, pb.star, u),
    haze: lerpRgb(pa.haze, pb.haze, u),
    hazeAlpha: lerp(pa.hazeAlpha, pb.hazeAlpha, u),
    dim: lerp(pa.dim, pb.dim, u),
  };
}

const MIN_PER_DAY = 1440;
const DEFAULT_SUNRISE_MIN = 6 * 60 + 30; // 06:30(设计 §2 回落)
const DEFAULT_SUNSET_MIN = 19 * 60;      // 19:00

/** ISO 本地时间字符串 → 当日分钟数;缺失/解析失败回落。 */
function parseMinutes(iso: string | undefined, fallback: number): number {
  if (!iso) return fallback;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return fallback;
  return d.getHours() * 60 + d.getMinutes();
}

/**
 * 真实时钟 → 调色相位 t(0..1)。锚点(契约,测试钉死):
 * 日出−45m → 0;日出+45m → 0.28;日照中点 (sr+ss)/2 → 0.5;
 * 日落−90m → 0.68;日落 → 0.84;日落+40m → 1;其余(整夜,跨午夜)恒 1。
 * 锚点间线性插值;无参/解析失败回落 06:30/19:00。
 */
export function phaseFromClock(now: Date, sunrise?: string, sunset?: string): number {
  const sr = parseMinutes(sunrise, DEFAULT_SUNRISE_MIN);
  const ss = parseMinutes(sunset, DEFAULT_SUNSET_MIN);
  const m = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  const anchors: [number, number][] = [
    [sr - 45, 0],
    [sr + 45, 0.28],
    [(sr + ss) / 2, 0.5],
    [ss - 90, 0.68],
    [ss, 0.84],
    [ss + 40, 1],
  ];
  // 锚点必须严格递增(Hobart 全年日照远超所需最短白昼);异常数据当夜处理。
  for (let i = 1; i < anchors.length; i++) {
    if (anchors[i][0] <= anchors[i - 1][0]) return 1;
  }
  if (m < anchors[0][0] || m >= anchors[anchors.length - 1][0]) return 1;
  for (let i = 1; i < anchors.length; i++) {
    const [m0, t0] = anchors[i - 1];
    const [m1, t1] = anchors[i];
    if (m <= m1) return t0 + ((m - m0) / (m1 - m0)) * (t1 - t0);
  }
  return 1;
}

/**
 * 夜间进度 0..1(月亮弧线用):日落+40m(=0)→ 次日日出−45m(=1),跨午夜连续。
 * 夜间 t 恒 1,月亮位置无法由 t 推,这里由时钟另推(设计 §2)。白天调用无意义(钳制)。
 */
export function nightProgress(now: Date, sunrise?: string, sunset?: string): number {
  const sr = parseMinutes(sunrise, DEFAULT_SUNRISE_MIN);
  const ss = parseMinutes(sunset, DEFAULT_SUNSET_MIN);
  const nightStart = ss + 40;
  const duration = sr - 45 + MIN_PER_DAY - nightStart;
  if (duration <= 0) return 0;
  const m = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  const sinceStart = (m - nightStart + MIN_PER_DAY) % MIN_PER_DAY;
  return clamp01(sinceStart / duration);
}

export type CelestialBody = {
  kind: 'sun' | 'moon';
  x: number; // 水平位置 0(左)..1(右)
  y: number; // 高度 0(天顶附近)..1(地平线);>1 = 地平线下(不绘制)
};

/**
 * t ≥ NIGHT_T 时按月亮弧线(由 nightT 推进),否则太阳弧线。
 * 必须等于 1(而非 0.84..1 之间的中间值):nightProgress 的定义域从日落+40m(=t=1)才开始——
 * 在那之前查询,(m - nightStart + MIN_PER_DAY) % MIN_PER_DAY 会算出一个接近满周期的值,
 * 钳到 1,让月亮在真正的夜起点之前就被钉在弧线末端;到 t=1 那一帧 nightProgress 才纠正回 0,
 * 造成月亮位置瞬移(已用回归测试钉死)。NIGHT_T=1 让"渲染月亮"与 nightProgress 的定义域完全
 * 重合,月亮永远从 nightT=0(弧线起点)开始画,不会用到回绕后的假值。
 */
export const NIGHT_T = 1;

export function sunPosition(t: number, nightT = 0): CelestialBody {
  if (t >= NIGHT_T) {
    const u = clamp01(nightT);
    return { kind: 'moon', x: 0.15 + 0.7 * u, y: 1 - Math.sin(Math.PI * u) * 0.75 };
  }
  // 太阳:t=0(DAWN 起点)在地平线下,清晨升起,t≈0.5 最高,SUNSET 段落回地平线。
  const u = clamp01(t / NIGHT_T);
  return { kind: 'sun', x: 0.08 + 0.84 * u, y: 1.08 - Math.sin(Math.PI * u) };
}
