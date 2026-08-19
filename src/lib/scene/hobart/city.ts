// 中景 CBD 画师(hobart 设计 §2 city 层;§3 修订为单色扁平剪影)。
// 整个 CBD 一个剪影色 sp.mid.silhouette:全宽底带(契约,接住山脚/桥墩脚)+ 上缘齿线
// (左岸折线 / 低矮房块起伏 / 砂岩连排山墙锯齿一次成型)+ 楼间树冠团 + 主塔群(锚点
// geometry.CITY_TOWERS 定死,block 平顶 / dome 圆顶 / clock 细高尖顶三种轮廓)。
// 唯一豁免:6 座 block 塔楼上的夜间窗灯发光点阵(sp.light.window,只画点亮态)。
// 静态层:只在缓存重绘时执行,rng 调用序列只依赖归一化坐标与固定循环次数,与 w/h 无关。
import {
  BAND, CITY_TOWERS, rgba,
  type LayerFn, type ScenePaint, type TowerSpec,
} from './geometry';

const CITY_BOTTOM = BAND.city.bottom; // 0.58,全部塔楼/底带的落地线

// —— 底带上缘齿线分区(x 0..1 连续一条折线,四段拼接,始终闭合到 CITY_BOTTOM)——
const SHORE_X0 = 0;
const SHORE_X1 = 0.3; // 左岸低带(桥墩脚落地区)
const SHORE_Y_LO = 0.405;
const SHORE_Y_HI = 0.44;

const LOWBLOCK_X0 = SHORE_X1;
const LOWBLOCK_X1 = 0.7; // 低矮房块起伏区
const LOWBLOCK_BASE_Y = 0.46;
const LOWBLOCK_MIN_H = 0.005;
const LOWBLOCK_MAX_H = 0.02;
const LOWBLOCK_MIN_W = 0.01;
const LOWBLOCK_MAX_W = 0.03;

const SAW_X0 = LOWBLOCK_X1;
const SAW_X1 = 0.95; // 砂岩连排山墙锯齿区(钟楼两侧)
const SAW_APEX_LO = 0.47;
const SAW_APEX_HI = 0.5;
const SAW_TROUGH_Y = 0.512; // 齿间谷底(自选,略低于齿顶上限,保证锯齿始终可见)

// —— 楼间树冠团候选位(手选,落在塔群空档,避免正压主塔footprint)——
const CANOPY_X = [0.1, 0.38, 0.55, 0.63, 0.73, 0.94] as const;
const CANOPY_Y_LO = 0.44;
const CANOPY_Y_HI = 0.5;

// —— block 塔楼装饰 ——
const NOTCH_W = 0.004;
const NOTCH_D = 0.003;
const NOTCH_MARGIN = 0.006;
const ANTENNA_H_LO = 0.008;
const ANTENNA_H_HI = 0.015;

// —— dome 塔楼顶尖小柱(自选高度,宽 2px 由 fillRect 字面像素给出)——
const DOME_SPIKE_H = 0.008;

// —— clock 塔楼尖顶 ——
const CLOCK_SPIRE_H = 0.012;

// —— 夜间窗灯网格(6 座 block 塔楼)——
const WIN_COL_STEP = 0.008;
const WIN_ROW_STEP = 0.014;
const WIN_MARGIN = 0.003;

/**
 * 全宽底带 + 上缘齿线一次成型(单路径 fill,契约:铺满全宽、落地到 CITY_BOTTOM,
 * 接住山脚与桥墩脚)。四段拼接,x 单调递增,互不交叉:
 *   左岸折线(0–0.30,y 0.405–0.44)→ 低矮房块起伏(0.30–0.70,基线 0.46)→
 *   砂岩锯齿(0.70–0.95,齿顶 0.47–0.50)→ 收尾平段(0.95–1)。
 * rng 调用次数只取决于各段自身的随机块数/齿数,与 w/h 无关。
 */
function fillBaseBand(ctx: CanvasRenderingContext2D, w: number, h: number, rng: () => number): void {
  const X = (nx: number) => nx * w;
  const Y = (ny: number) => ny * h;
  const top: [number, number][] = [];

  // 左岸低带:3–4 个 rng 折线点,桥墩脚落于其上。
  const shorePts = 3 + Math.floor(rng() * 2); // 3..4
  for (let i = 0; i < shorePts; i++) {
    const x = (SHORE_X1 * i) / (shorePts - 1);
    const y = SHORE_Y_LO + rng() * (SHORE_Y_HI - SHORE_Y_LO);
    top.push([x, y]);
  }

  // 低矮房块起伏:10–16 块,宽/高 rng,基线 LOWBLOCK_BASE_Y 向上凸起。
  top.push([LOWBLOCK_X0, LOWBLOCK_BASE_Y]);
  const blockCount = 10 + Math.floor(rng() * 7); // 10..16
  const blockSpan = LOWBLOCK_X1 - LOWBLOCK_X0;
  for (let i = 0; i < blockCount; i++) {
    const slotX = LOWBLOCK_X0 + (blockSpan * i) / blockCount;
    const bw = LOWBLOCK_MIN_W + rng() * (LOWBLOCK_MAX_W - LOWBLOCK_MIN_W);
    const bh = LOWBLOCK_MIN_H + rng() * (LOWBLOCK_MAX_H - LOWBLOCK_MIN_H);
    const bx1 = Math.min(slotX + bw, LOWBLOCK_X1);
    top.push([slotX, LOWBLOCK_BASE_Y]);
    top.push([slotX, LOWBLOCK_BASE_Y - bh]);
    top.push([bx1, LOWBLOCK_BASE_Y - bh]);
    top.push([bx1, LOWBLOCK_BASE_Y]);
  }
  top.push([LOWBLOCK_X1, LOWBLOCK_BASE_Y]);

  // 砂岩连排山墙锯齿:5–7 齿,齿宽精确铺满区间(天然落在 0.036–0.05,贴合 0.03–0.05)。
  const teeth = 5 + Math.floor(rng() * 3); // 5..7
  const toothW = (SAW_X1 - SAW_X0) / teeth;
  top.push([SAW_X0, SAW_TROUGH_Y]);
  for (let i = 0; i < teeth; i++) {
    const baseX = SAW_X0 + i * toothW;
    const jitter = (rng() - 0.5) * toothW * 0.2;
    const apexY = SAW_APEX_LO + rng() * (SAW_APEX_HI - SAW_APEX_LO);
    top.push([baseX + toothW / 2 + jitter, apexY]);
    top.push([baseX + toothW, SAW_TROUGH_Y]);
  }
  top.push([1, SAW_TROUGH_Y]);

  ctx.beginPath();
  ctx.moveTo(0, Y(CITY_BOTTOM));
  ctx.lineTo(X(top[0][0]), Y(top[0][1]));
  for (let i = 1; i < top.length; i++) ctx.lineTo(X(top[i][0]), Y(top[i][1]));
  ctx.lineTo(w, Y(CITY_BOTTOM));
  ctx.closePath();
  ctx.fill();
}

/** 楼间空档的树冠团:4–6 团候选(手选定位,避开主塔 footprint),每团 2–3 个相交圆。 */
function fillCanopyClusters(ctx: CanvasRenderingContext2D, w: number, h: number, rng: () => number): void {
  const X = (nx: number) => nx * w;
  const Y = (ny: number) => ny * h;
  const clusterCount = 4 + Math.floor(rng() * 3); // 4..6(候选池恰好 6 个)
  for (let i = 0; i < clusterCount; i++) {
    const cx = CANOPY_X[i];
    const cy = CANOPY_Y_LO + rng() * (CANOPY_Y_HI - CANOPY_Y_LO);
    const circles = 2 + Math.floor(rng() * 2); // 2..3
    for (let j = 0; j < circles; j++) {
      const dx = (rng() - 0.5) * 0.02;
      const dy = (rng() - 0.5) * 0.012;
      const r = 0.008 + rng() * 0.008; // 0.008–0.016
      ctx.beginPath();
      ctx.arc(X(cx + dx), Y(cy + dy), h * r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/**
 * block 平顶方楼:从 tw.top 画到 CITY_BOTTOM。二选一装饰(同一剪影色,轮廓的一部分):
 * 0–2 个女儿墙缺口(直接刻进顶边路径,不做减法合成)或 0–1 根细天线(1px 描边)。
 */
function drawBlockTower(ctx: CanvasRenderingContext2D, w: number, h: number, tw: TowerSpec, rng: () => number): void {
  const X = (nx: number) => nx * w;
  const Y = (ny: number) => ny * h;
  const { x, w: bw, top } = tw;
  const useNotch = rng() < 0.5;

  const outline: [number, number][] = [[x, top]];
  if (useNotch) {
    const notchCount = Math.floor(rng() * 3); // 0..2
    const usable = Math.max(0, bw - NOTCH_MARGIN * 2 - NOTCH_W);
    for (let i = 0; i < notchCount; i++) {
      const nx0 = x + NOTCH_MARGIN + rng() * usable;
      outline.push([nx0, top]);
      outline.push([nx0, top + NOTCH_D]);
      outline.push([nx0 + NOTCH_W, top + NOTCH_D]);
      outline.push([nx0 + NOTCH_W, top]);
    }
  }
  outline.push([x + bw, top]);

  ctx.beginPath();
  ctx.moveTo(X(outline[0][0]), Y(outline[0][1]));
  for (let i = 1; i < outline.length; i++) ctx.lineTo(X(outline[i][0]), Y(outline[i][1]));
  ctx.lineTo(X(x + bw), Y(CITY_BOTTOM));
  ctx.lineTo(X(x), Y(CITY_BOTTOM));
  ctx.closePath();
  ctx.fill();

  if (!useNotch && rng() < 0.5) {
    const ah = ANTENNA_H_LO + rng() * (ANTENNA_H_HI - ANTENNA_H_LO);
    const cx = x + bw / 2;
    ctx.beginPath();
    ctx.moveTo(X(cx), Y(top));
    ctx.lineTo(X(cx), Y(top - ah));
    ctx.stroke();
  }
}

/**
 * dome 圆顶地标:方基座 + 半圆穹顶(半径=楼宽/2,ellipse rx/ry 分别按 w/h 换算,
 * 精确同时满足"与基座等宽"和"顶点落在 tw.top")+ 顶尖 2px 小柱。
 */
function drawDomeTower(ctx: CanvasRenderingContext2D, w: number, h: number, tw: TowerSpec): void {
  const X = (nx: number) => nx * w;
  const Y = (ny: number) => ny * h;
  const { x, w: bw, top } = tw;
  const radius = bw / 2;
  const baseTop = top + radius;
  const cx = x + radius;

  ctx.fillRect(X(x), Y(baseTop), w * bw, h * (CITY_BOTTOM - baseTop));

  ctx.beginPath();
  ctx.ellipse(X(cx), Y(baseTop), w * radius, h * radius, 0, Math.PI, Math.PI * 2);
  ctx.closePath();
  ctx.fill();

  ctx.fillRect(X(cx) - 1, Y(top - DOME_SPIKE_H), 2, h * DOME_SPIKE_H);
}

/** clock 细高钟楼:小金字塔尖顶(等腰三角,高 0.012)+ 细高塔身,不画表盘。 */
function drawClockTower(ctx: CanvasRenderingContext2D, w: number, h: number, tw: TowerSpec): void {
  const X = (nx: number) => nx * w;
  const Y = (ny: number) => ny * h;
  const { x, w: bw, top } = tw;
  const bodyTop = top + CLOCK_SPIRE_H;
  const cx = x + bw / 2;

  ctx.beginPath();
  ctx.moveTo(X(x), Y(bodyTop));
  ctx.lineTo(X(cx), Y(top));
  ctx.lineTo(X(x + bw), Y(bodyTop));
  ctx.lineTo(X(x + bw), Y(CITY_BOTTOM));
  ctx.lineTo(X(x), Y(CITY_BOTTOM));
  ctx.closePath();
  ctx.fill();
}

/**
 * 夜间窗灯发光点阵(唯一豁免):固定网格(列距 0.008、行距 0.014,楼体内边距 0.003),
 * 每格 litRand/flickerRand 各取一次 rng(网格边界只依赖 tw 的归一化尺寸,循环次数与
 * w/h 无关)。点亮判定与像素点大小均照 task 契约字面实现,未点亮格不画任何东西。
 */
function drawWindowGrid(
  ctx: CanvasRenderingContext2D, w: number, h: number, sp: ScenePaint, tw: TowerSpec, rng: () => number,
): void {
  const { x, w: bw, top } = tw;
  const x0 = x + WIN_MARGIN;
  const x1 = x + bw - WIN_MARGIN;
  const y0 = top + WIN_MARGIN;
  const y1 = CITY_BOTTOM - WIN_MARGIN;
  for (let y = y0; y <= y1; y += WIN_ROW_STEP) {
    for (let cx = x0; cx <= x1; cx += WIN_COL_STEP) {
      const litRand = rng();
      const flickerRand = rng();
      const lit = litRand < sp.light.windowLit
        && !(flickerRand > 0.92 && (sp.light.flickerEpoch + Math.floor(flickerRand * 1000)) % 3 === 0);
      if (!lit) continue;
      ctx.fillRect(cx * w - 1, y * h - 1.5, 2, 3);
    }
  }
}

export const drawCity: LayerFn = (ctx, w, h, sp, rng) => {
  const sil = rgba(sp.mid.silhouette, 1);
  ctx.fillStyle = sil;
  ctx.strokeStyle = sil;
  ctx.lineWidth = 1;

  // 1+2+3+5. 全宽底带(契约)+ 上缘齿线(左岸折线/低矮房块/砂岩锯齿一次成型)。
  fillBaseBand(ctx, w, h, rng);

  // 6. 树冠团,贴在底带上缘楼间空档。
  fillCanopyClusters(ctx, w, h, rng);

  // 4. 主塔群(锚点 CITY_TOWERS 定死,x/w/top 不改)。
  for (const tw of CITY_TOWERS) {
    if (tw.kind === 'block') drawBlockTower(ctx, w, h, tw, rng);
    else if (tw.kind === 'dome') drawDomeTower(ctx, w, h, tw);
    else drawClockTower(ctx, w, h, tw);
  }

  // 7. 夜间窗灯点阵(6 座 block 塔楼;日间 windowLit≈0 自然全灭)。
  ctx.fillStyle = rgba(sp.light.window, 0.9);
  for (const tw of CITY_TOWERS) {
    if (tw.kind === 'block') drawWindowGrid(ctx, w, h, sp, tw, rng);
  }
};
