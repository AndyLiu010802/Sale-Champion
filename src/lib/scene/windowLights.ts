// 窗灯点亮时间表(hobart 设计 §3 窗灯作息细化):纯本地时钟驱动,与 phaseFromClock 推的
// 调色相位 t(日出日落)无关,只看现场时钟"几点钟"。零 DOM,纯函数,单测钉死。

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

// —— 窗灯作息调度(独立于 phaseFromClock 的日出日落相位;只看现场时钟"几点钟")——
//
// [hobart 专属校准,scene-svg 迁移后需重验] 下面的候选数审计(322/4/8/30 格)数的是
// hobart 画师(city.ts/foreground.ts/waterfront.ts/mountain.ts)画出的窗格与灯位——
// Task 5 删掉这四个画师后,这条审计本身就没有对象了。DAY_BASE = 0.0075 这个数字本身
// 能留下来,是因为 SVG 版本目前按同一种"逐灯位伯努利判定"的语义接的(≈254 个灯光
// 元素 × 0.0075 ≈ 2 盏,仍落在"两三盏"的目标区间);如果以后哪版实现改成把 windowLit
// 当整组透明度用(而不是逐元素判定命中率),这个数字就没有意义,必须重新校准。
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
