// 前景屋顶群画师(hobart 设计 §2 foreground 层;剪影版 spec §3 修订)。
// 全场最深的单一剪影色 sp.near.silhouette:一条连续轮廓(屋顶山墙齿廓 + 烟囱 + 老虎窗
// 凸点 + 两侧树冠)闭合到画面底边收口,靠轮廓形状传特征,层内不分色、不描线。
// 唯一豁免:夜间窗灯发光点阵(sp.light.window / windowLit,点亮态才画)。
import { BAND, rgba, type LayerFn } from './geometry';

/** 一座双坡山墙屋顶:eaveY 为两侧檐口高度(先当作同高,近似真实剪影已足够)。 */
type Roof = { xLeft: number; xMid: number; xRight: number; ridgeY: number; eaveY: number };

const ROOF_X0 = 0.05;
const ROOF_X1 = 0.95;

function buildRoofs(rng: () => number): Roof[] {
  const count = 5 + Math.floor(rng() * 4); // 5..8 座
  const span = ROOF_X1 - ROOF_X0;
  const roofs: Roof[] = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const jitter = (rng() - 0.5) * (span / count) * 0.7; // 相邻可轻微搭接
    const cx = ROOF_X0 + t * span + jitter;
    const w = 0.1 + rng() * 0.1; // 0.10–0.20
    const ridgeY = 0.76 + rng() * 0.06; // 0.76–0.82
    const eaveY = ridgeY + 0.05 + rng() * 0.03; // 檐口比屋脊低 0.05–0.08
    roofs.push({ xLeft: cx - w / 2, xMid: cx, xRight: cx + w / 2, ridgeY, eaveY });
  }
  roofs.sort((a, b) => a.xLeft - b.xLeft);
  return roofs;
}

/** 坡面上任意 x 处的轮廓 y(线性插值两段坡;供烟囱/老虎窗"骑"在坡面上取基准点)。 */
function roofSurfaceY(r: Roof, x: number): number {
  if (x <= r.xMid) {
    const u = r.xMid === r.xLeft ? 0 : (x - r.xLeft) / (r.xMid - r.xLeft);
    return r.eaveY + (r.ridgeY - r.eaveY) * u;
  }
  const u = r.xRight === r.xMid ? 0 : (x - r.xMid) / (r.xRight - r.xMid);
  return r.ridgeY + (r.eaveY - r.ridgeY) * u;
}

/** 屋顶齿廓主轮廓:两端落到 y=1(底边收口),中段沿檐口/屋脊折线,整体一次填充。 */
function fillRoofline(ctx: CanvasRenderingContext2D, w: number, h: number, roofs: Roof[]): void {
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.lineTo(0, h * roofs[0].eaveY);
  for (const r of roofs) {
    ctx.lineTo(w * r.xLeft, h * r.eaveY);
    ctx.lineTo(w * r.xMid, h * r.ridgeY);
    ctx.lineTo(w * r.xRight, h * r.eaveY);
  }
  ctx.lineTo(w, h * roofs[roofs.length - 1].eaveY);
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();
}

/** 烟囱齿:窄立柱 + 顶部略宽的压顶凸起,单路径一次填充(轮廓的一部分,非描线)。 */
function fillChimney(ctx: CanvasRenderingContext2D, w: number, h: number, x: number, baseY: number, height: number): void {
  const bodyW = 0.008;
  const capW = bodyW * 1.6;
  const capH = height * 0.16;
  const topY = baseY - height;
  const capTopY = topY - capH;
  ctx.beginPath();
  ctx.moveTo(w * (x - bodyW / 2), h * baseY);
  ctx.lineTo(w * (x - bodyW / 2), h * topY);
  ctx.lineTo(w * (x - capW / 2), h * topY);
  ctx.lineTo(w * (x - capW / 2), h * capTopY);
  ctx.lineTo(w * (x + capW / 2), h * capTopY);
  ctx.lineTo(w * (x + capW / 2), h * topY);
  ctx.lineTo(w * (x + bodyW / 2), h * topY);
  ctx.lineTo(w * (x + bodyW / 2), h * baseY);
  ctx.closePath();
  ctx.fill();
}

/** 老虎窗凸点:骑在坡面上的小三角,底边贴合坡面轮廓,顶点向上凸起。 */
function fillDormer(ctx: CanvasRenderingContext2D, w: number, h: number, x: number, baseY: number): void {
  const dw = 0.018;
  const dh = 0.01;
  ctx.beginPath();
  ctx.moveTo(w * (x - dw / 2), h * baseY);
  ctx.lineTo(w * x, h * (baseY - dh));
  ctx.lineTo(w * (x + dw / 2), h * baseY);
  ctx.closePath();
  ctx.fill();
}

/** 一组相交大圆并成一团树冠;圆心/半径以画布高度换算,保证屏上是正圆。 */
function fillCanopyCluster(ctx: CanvasRenderingContext2D, w: number, h: number, rng: () => number, xLo: number, xHi: number, yTop: number, yBase: number): void {
  const n = 3 + Math.floor(rng() * 3); // 3..5
  for (let i = 0; i < n; i++) {
    const cx = xLo + rng() * (xHi - xLo);
    const r = 0.03 + rng() * 0.04; // 0.03–0.07
    const cy = Math.min(yBase, yTop + r + rng() * (yBase - yTop));
    ctx.beginPath();
    ctx.arc(w * cx, h * cy, h * r, 0, Math.PI * 2);
    ctx.fill();
  }
}

export const drawForeground: LayerFn = (ctx, w, h, sp, rng) => {
  ctx.fillStyle = rgba(sp.near.silhouette, 1);

  const roofs = buildRoofs(rng);
  fillRoofline(ctx, w, h, roofs);

  // 烟囱:挑 3–5 座不同屋脊,按固定步长取索引(roofs.length 恒 >= 5,天然互不相同)。
  const chimneyCount = 3 + Math.floor(rng() * 3); // 3..5
  const step = Math.max(1, Math.floor(roofs.length / chimneyCount));
  for (let i = 0; i < chimneyCount; i++) {
    const r = roofs[(i * step) % roofs.length];
    const x = Math.min(r.xRight - 0.006, Math.max(r.xLeft + 0.006, r.xMid + (rng() - 0.5) * (r.xRight - r.xLeft) * 0.4));
    const baseY = roofSurfaceY(r, x);
    fillChimney(ctx, w, h, x, baseY, 0.02 + rng() * 0.01);
  }

  // 老虎窗:只挑较宽的大屋顶,每座 0–2 个,骑在左右坡面之一。
  for (const r of roofs) {
    if (r.xRight - r.xLeft < 0.14) continue;
    const dormerCount = Math.floor(rng() * 3); // 0..2
    for (let i = 0; i < dormerCount; i++) {
      const onLeftSlope = rng() < 0.5;
      const x = onLeftSlope
        ? r.xLeft + (0.25 + rng() * 0.4) * (r.xMid - r.xLeft)
        : r.xMid + (0.25 + rng() * 0.4) * (r.xRight - r.xMid);
      fillDormer(ctx, w, h, x, roofSurfaceY(r, x));
    }
  }

  // 深色树冠:左右两侧收口团簇(顶部允许略破带顶到 0.72),再加中段矮团破直线。
  fillCanopyCluster(ctx, w, h, rng, 0, 0.14, 0.72, BAND.foreground.top + 0.05);
  fillCanopyCluster(ctx, w, h, rng, 0.86, 1, 0.72, BAND.foreground.top + 0.05);
  const midClusters = 1 + Math.floor(rng() * 2); // 1..2
  for (let i = 0; i < midClusters; i++) {
    const cx = 0.3 + rng() * 0.4;
    const r = 0.025 + rng() * 0.015; // 矮团
    const cy = BAND.foreground.top + 0.08 + rng() * 0.05;
    ctx.beginPath();
    ctx.arc(w * cx, h * cy, h * r, 0, Math.PI * 2);
    ctx.fill();
  }

  // 夜间窗点(发光点阵豁免):布局期固定 4 个候选,点亮态取决于 windowLit,不画熄灭态。
  const litColor = rgba(sp.light.window, 0.9);
  for (let i = 0; i < 4; i++) {
    const x = 0.08 + rng() * 0.84;
    const y = 0.8 + rng() * 0.08;
    const litRand = rng();
    if (litRand >= sp.light.windowLit * 0.5) continue;
    ctx.fillStyle = litColor;
    ctx.fillRect(w * x - 1, h * y - 1.5, 2, 3);
  }
};
