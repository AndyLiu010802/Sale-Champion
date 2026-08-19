// 码头仓库带画师(hobart 设计 §2 waterfront 层;§3 修订为单色剪影画风)。
// 整带一色 sp.near.wharf,靠仓库山墙齿线 + 连排小山墙锯齿 + 栈桥 + 系泊游艇桅杆线的
// 轮廓传达霍巴特码头特征;唯二例外是夜间发光点阵(窗灯/码头灯,只画点亮态)。
// 本层画在水面静态层之后,由装配器负责叠放顺序;这里只管自己 y 0.54–0.70 的静态剪影。
import {
  TERRACE_ROW, WAREHOUSES, WHARF_EDGE_Y, rgba,
  type LayerFn, type ScenePaint, type WarehouseSpec,
} from './geometry';

// —— 岸壁/甲板带 ——
const WHARF_X0 = 0.05;
const WHARF_X1 = 0.96;
const DECK_TOP = WHARF_EDGE_Y; // 0.635
const DECK_BOTTOM = 0.648;

// —— 仓库山墙(锚点取自 geometry.WAREHOUSES,x/w/ridgeY 不改)——
const EAVE_DROP = 0.022; // 檐口 = ridgeY + EAVE_DROP
const VENT_SIZE = 0.006; // 屋脊小通风塔凸起(宽/高同值)

// —— 连排小山墙锯齿(TERRACE_ROW 锚点)——
const TERRACE_MIN_TEETH = 6;
const TERRACE_TEETH_SPAN = 4; // 6..9 颗(含)
const TERRACE_EAVE_DROP = 0.006; // 齿间凹点相对 topY 下沉量
const TERRACE_PEAK_JITTER = 0.004; // 齿顶相对 topY 的抖动幅度(±)→ 0.574..0.582

// —— 栈桥(避让区同时供系泊游艇布局复用)——
const PIER_ZONES = [
  { x0: 0.28, x1: 0.33 },
  { x0: 0.62, x1: 0.68 },
] as const;
const PIER_WIDTH = 0.012;
const PIER_BOTTOM_Y = 0.68;
const PIER_AVOID_MARGIN = 0.015; // 游艇与栈桥中轴的最小间距
const PIER_PUSH_MARGIN = 0.02; // 被挤出后与栈桥区间边缘的间距

// —— 系泊游艇(固定 12 次循环,布局与 w/h 无关)——
const YACHT_COUNT = 12;
const YACHT_X0 = 0.12;
const YACHT_X1 = 0.9;
const HULL_Y0 = 0.64;
const HULL_Y_SPAN = 0.006; // 0.640..0.646
const HULL_W0 = 0.012;
const HULL_W_SPAN = 0.008; // 0.012..0.02
const HULL_H = 0.004;
const MAST_H0 = 0.035;
const MAST_H_SPAN = 0.035; // 0.035..0.07
const YARD_PROB = 0.4;
const YARD_W = 0.01;

// —— 夜间灯点(发光点阵豁免;只画点亮态)——
const DOT_R = 2; // 画布像素(与桥灯/窗灯的"2px 点"字面一致)

function drawWarehouse(
  ctx: CanvasRenderingContext2D, w: number, h: number, wh: WarehouseSpec, rng: () => number,
): void {
  const eaveY = wh.ridgeY + EAVE_DROP;
  const apexX = wh.x + wh.w / 2;
  ctx.beginPath();
  ctx.moveTo(w * wh.x, h * WHARF_EDGE_Y);
  ctx.lineTo(w * wh.x, h * eaveY);
  ctx.lineTo(w * apexX, h * wh.ridgeY);
  ctx.lineTo(w * (wh.x + wh.w), h * eaveY);
  ctx.lineTo(w * (wh.x + wh.w), h * WHARF_EDGE_Y);
  ctx.closePath();
  ctx.fill();

  // 屋脊 0–1 个小通风塔凸起,与屋顶同色一次成型(不描边)。
  if (rng() < 0.5) {
    ctx.fillRect(
      w * (apexX - VENT_SIZE / 2), h * (wh.ridgeY - VENT_SIZE),
      w * VENT_SIZE, h * VENT_SIZE,
    );
  }
}

function drawTerraceRow(ctx: CanvasRenderingContext2D, w: number, h: number, rng: () => number): void {
  const { x0, x1, topY, baseY } = TERRACE_ROW;
  const teeth = TERRACE_MIN_TEETH + Math.floor(rng() * (TERRACE_TEETH_SPAN + 1));
  const toothW = (x1 - x0) / teeth;
  const eaveY = topY + TERRACE_EAVE_DROP;
  ctx.beginPath();
  ctx.moveTo(w * x0, h * eaveY);
  for (let i = 0; i < teeth; i++) {
    const peakX = x0 + toothW * (i + 0.5);
    const peakY = topY + (rng() * 2 - 1) * TERRACE_PEAK_JITTER;
    ctx.lineTo(w * peakX, h * peakY);
    ctx.lineTo(w * (x0 + toothW * (i + 1)), h * eaveY);
  }
  ctx.lineTo(w * x1, h * baseY);
  ctx.lineTo(w * x0, h * baseY);
  ctx.closePath();
  ctx.fill();
}

function drawPier(ctx: CanvasRenderingContext2D, w: number, h: number, zone: { x0: number; x1: number }): void {
  const cx = (zone.x0 + zone.x1) / 2;
  ctx.fillRect(
    w * (cx - PIER_WIDTH / 2), h * DECK_BOTTOM,
    w * PIER_WIDTH, h * (PIER_BOTTOM_Y - DECK_BOTTOM),
  );
  // 端头系缆柱凸点(同色,轮廓的一部分)。
  ctx.beginPath();
  ctx.arc(w * cx, h * PIER_BOTTOM_Y, DOT_R, 0, Math.PI * 2);
  ctx.fill();
}

/** 落进栈桥避让区的游艇 x 就近挤到区外邻位,不消耗额外 rng。 */
function avoidPiers(x: number): number {
  for (const z of PIER_ZONES) {
    const lo = z.x0 - PIER_AVOID_MARGIN;
    const hi = z.x1 + PIER_AVOID_MARGIN;
    if (x > lo && x < hi) {
      const distLeft = x - lo;
      const distRight = hi - x;
      return distLeft < distRight ? z.x0 - PIER_PUSH_MARGIN : z.x1 + PIER_PUSH_MARGIN;
    }
  }
  return x;
}

function drawYacht(
  ctx: CanvasRenderingContext2D, w: number, h: number,
  x: number, hullY: number, hullW: number, mastH: number, hasYard: boolean,
): void {
  // 艇壳:贴在岸壁前的小椭圆剪影。
  ctx.beginPath();
  ctx.ellipse(w * x, h * (hullY + HULL_H / 2), (w * hullW) / 2, (h * HULL_H) / 2, 0, 0, Math.PI * 2);
  ctx.fill();

  // 桅杆:1px 竖线(剪影轮廓本身,不是描边)。
  ctx.beginPath();
  ctx.moveTo(w * x, h * hullY);
  ctx.lineTo(w * x, h * (hullY - mastH));
  ctx.stroke();

  if (hasYard) {
    const yardY = hullY - mastH * 0.85;
    ctx.beginPath();
    ctx.moveTo(w * (x - YARD_W / 2), h * yardY);
    ctx.lineTo(w * (x + YARD_W / 2), h * yardY);
    ctx.stroke();
  }
}

function drawWarehouseLights(
  ctx: CanvasRenderingContext2D, w: number, h: number, sp: ScenePaint, wh: WarehouseSpec, rng: () => number,
): void {
  const spots = [
    { dx: wh.w * 0.3, dy: 0.014 },
    { dx: wh.w * 0.68, dy: 0.02 },
  ];
  ctx.fillStyle = rgba(sp.light.window, 0.85);
  for (const spot of spots) {
    const litRand = rng();
    if (litRand < sp.light.windowLit * 0.6) {
      ctx.beginPath();
      ctx.arc(w * (wh.x + spot.dx), h * (wh.ridgeY + EAVE_DROP + spot.dy), DOT_R, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawWharfLamps(ctx: CanvasRenderingContext2D, w: number, h: number, sp: ScenePaint, rng: () => number): void {
  ctx.fillStyle = rgba(sp.light.bridgeLamp, sp.light.bridgeLampAlpha);
  const count = rng() < 0.5 ? 2 : 3;
  for (let i = 0; i < 3; i++) {
    const x = WHARF_X0 + rng() * (WHARF_X1 - WHARF_X0);
    if (i >= count) continue;
    ctx.beginPath();
    ctx.arc(w * x, h * DECK_TOP, DOT_R, 0, Math.PI * 2);
    ctx.fill();
  }
}

export const drawWaterfront: LayerFn = (ctx, w, h, sp, rng) => {
  const sil = rgba(sp.near.wharf, 1);
  ctx.fillStyle = sil;
  ctx.strokeStyle = sil;
  ctx.lineWidth = 1;

  // 1. 岸壁/甲板带:全宽条带,压在建筑与水面之间。
  ctx.fillRect(w * WHARF_X0, h * DECK_TOP, w * (WHARF_X1 - WHARF_X0), h * (DECK_BOTTOM - DECK_TOP));

  // 2. 仓库山墙齿线(4 座,锚点定死)。
  for (const wh of WAREHOUSES) drawWarehouse(ctx, w, h, wh, rng);

  // 3. 连排小山墙锯齿(仓库之间的过渡带)。
  drawTerraceRow(ctx, w, h, rng);

  // 4. 栈桥 2 条,伸向水面。
  for (const zone of PIER_ZONES) drawPier(ctx, w, h, zone);

  // 5. 系泊游艇桅杆线:固定 12 次循环,x 落入栈桥区就近挤开。
  for (let i = 0; i < YACHT_COUNT; i++) {
    const xRaw = YACHT_X0 + rng() * (YACHT_X1 - YACHT_X0);
    const x = avoidPiers(xRaw);
    const hullY = HULL_Y0 + rng() * HULL_Y_SPAN;
    const hullW = HULL_W0 + rng() * HULL_W_SPAN;
    const mastH = MAST_H0 + rng() * MAST_H_SPAN;
    const hasYard = rng() < YARD_PROB;
    drawYacht(ctx, w, h, x, hullY, hullW, mastH, hasYard);
  }
  ctx.fillStyle = sil; // 恢复主色(drawYacht 未改 fillStyle,防御性重置)

  // 6. 夜间灯点(点亮态才画;白天各 alpha/windowLit 趋 0 自然熄灭)。
  for (const wh of WAREHOUSES) drawWarehouseLights(ctx, w, h, sp, wh, rng);
  drawWharfLamps(ctx, w, h, sp, rng);
};
