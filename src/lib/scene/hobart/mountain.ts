// 威灵顿山画师(hobart 设计 §2 mountain 层;§3 修订为单色扁平剪影)。
// 剪影特征全部靠轮廓形状传达:远/近双段山脊折线(geometry.MOUNTAIN 锚点定死,不许
// 自创位置)+ 主峰上的发射塔桅杆(kunanyi 辨识点)+ 山脚雾霭带(唯一允许的透明度渐变)
// + 夜间山脚发光点阵(窗灯豁免:只画点亮态)。层内无描线、无多色阶受光面。
import { BAND, MOUNTAIN, rgba, type LayerFn, type Rgb } from './geometry';

/** 折线各段中点的最大 y 抖动(屏比例),让山脊轮廓不显呆板机械。 */
const RIDGE_JITTER = 0.004;

/**
 * 沿归一化折线点走轮廓、每段中点插入一个 rng 抖动顶点、向下闭合到 bottomY 并 fill 的
 * 山脊剪影路径。rng 调用次数固定 = points.length - 1(与 w/h 无关)。
 */
function buildRidgePath(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  points: readonly (readonly [number, number])[],
  bottomY: number,
  rng: () => number,
): void {
  const px = (nx: number) => nx * w;
  const py = (ny: number) => ny * h;
  ctx.beginPath();
  ctx.moveTo(px(points[0][0]), py(points[0][1]));
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    const jitter = (rng() - 0.5) * 2 * RIDGE_JITTER;
    ctx.lineTo(px((x0 + x1) / 2), py((y0 + y1) / 2 + jitter));
    ctx.lineTo(px(x1), py(y1));
  }
  const lastX = points[points.length - 1][0];
  ctx.lineTo(px(lastX), py(bottomY));
  ctx.lineTo(px(points[0][0]), py(bottomY));
  ctx.closePath();
}

/** 主峰发射塔桅杆:同色第二笔(不并入折线路径,细窄矩形 + 顶端小方点)。 */
function drawTower(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const peak = MOUNTAIN.farRidge.find(([x]) => x === MOUNTAIN.towerX) ?? MOUNTAIN.farRidge[3];
  const mastW = Math.max(2, 0.0022 * w);
  const topY = MOUNTAIN.towerTopY * h;
  const baseY = peak[1] * h;
  const cx = MOUNTAIN.towerX * w;
  ctx.fillRect(cx - mastW / 2, topY, mastW, baseY - topY);
  ctx.fillRect(cx - 1, topY - 2, 2, 2);
}

/** 山脚发光点阵(窗灯豁免):固定 30 候选点循环,rng 调用序列与 w/h 无关。 */
function drawSuburbLights(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  windowColor: Rgb,
  windowLit: number,
  rng: () => number,
): void {
  const { top, bottom } = MOUNTAIN.suburbBand;
  const litThreshold = windowLit * 0.4;
  ctx.fillStyle = rgba(windowColor, 0.8);
  for (let i = 0; i < 30; i++) {
    // 右半密度更高:u 经 <1 次幂偏移,质量堆向 1(x 越大)。
    const u = rng();
    const x = (0.04 + Math.pow(u, 0.6) * (0.96 - 0.04)) * w;
    const y = (top + rng() * (bottom - top)) * h;
    const litRand = rng();
    const r = 1.5 + rng() * 0.5;
    if (litRand >= litThreshold) continue; // 未点亮态不画(spec §3 豁免条款)
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

export const drawMountain: LayerFn = (ctx, w, h, sp, rng) => {
  const bottomY = BAND.mountain.bottom;

  // 远脊剪影(最浅)+ 发射塔桅杆同色。
  buildRidgePath(ctx, w, h, MOUNTAIN.farRidge, bottomY, rng);
  ctx.fillStyle = rgba(sp.far.ridgeFar, 1);
  ctx.fill();
  drawTower(ctx, w, h); // fillStyle 沿用远脊色,同色第二笔

  // 近脊剪影(叠在远脊之上,同样闭合到带底)。
  buildRidgePath(ctx, w, h, MOUNTAIN.nearRidge, bottomY, rng);
  ctx.fillStyle = rgba(sp.far.ridgeNear, 1);
  ctx.fill();

  // 雾霭带:唯一允许的透明度渐变(alpha 0 → sp.far.mistAlpha)。
  const mist = ctx.createLinearGradient(
    0, h * MOUNTAIN.mistBand.top, 0, h * MOUNTAIN.mistBand.bottom,
  );
  mist.addColorStop(0, rgba(sp.far.mist, 0));
  mist.addColorStop(1, rgba(sp.far.mist, sp.far.mistAlpha));
  ctx.fillStyle = mist;
  ctx.fillRect(
    0, h * MOUNTAIN.mistBand.top, w, h * (MOUNTAIN.mistBand.bottom - MOUNTAIN.mistBand.top),
  );

  // 夜间山脚发光点阵(日间 windowLit≈0 自然全灭)。
  drawSuburbLights(ctx, w, h, sp.light.window, sp.light.windowLit, rng);
};
