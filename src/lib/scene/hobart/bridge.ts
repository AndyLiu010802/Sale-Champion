// 塔斯曼桥画师(hobart 设计 §2 bridge 层;§3 修订为单色剪影画风)。
// 整桥一个剪影色(sp.mid.bridge),靠"缓拱桥面 + 桥墩列(含主航道双柱门形塔)"的轮廓
// 传达塔斯曼桥辨识特征;唯一发光物 = 夜晚桥面灯串(sp.light.bridgeLamp)。
// 静态层:只在缓存重绘时执行(≤1 次/4s),rng 调用序列与 w/h 无关(全部走归一化坐标 +
// 固定循环次数),保证 resize/重挂载布局不变形。
import { BRIDGE, rgba, type LayerFn } from './geometry';

// 硬约束:不得越出 x 0.015–0.385、y 0.33–0.425。以下常量取值已按 BRIDGE 锚点验算
// (桥面拱顶 y=0.358、主航道门形塔顶 y≈0.3525、桥墩最低 y=0.42),留有余量,故不再
// 引入运行时裁剪。

const DECK_STEP = 0.01; // 桥面曲线采样步长(x,归一化)

// 桥墩尺寸(归一化 w 比例)。
const PIER_BASE_W = 0.0045; // 普通墩基准宽,rng ±10% → 落在 0.004–0.005 区间
const PIER_JITTER = 0.1;
const PORTAL_PILLAR_W = 0.0045; // 主航道双柱门架:单柱宽
const PORTAL_SPACING = 0.006; // 双柱间距(柱中心间距)
const PORTAL_RISE = 0.006; // 门形塔顶高出桥面上缘
const PORTAL_BEAM_H = 0.0035; // 门架顶部横梁厚度

// 护栏镂空剪影带。
const GUARDRAIL_GAP = 0.002; // 与桥面上缘之间的镂空间隙
const GUARDRAIL_PX = 1.4; // 细带厚度(设备像素,近似"1px")

// 夜晚桥面灯串。
const LAMP_Y_OFFSET = 0.003; // 灯位于桥面上缘上方
const LAMP_RADIUS_MIN = 1.5; // 实点半径(px)
const LAMP_RADIUS_MAX = 2;
const LAMP_HALO_RADIUS = 4; // 柔光圈半径(px)
const LAMP_HALO_ALPHA_MULT = 0.25;

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/**
 * 桥面中线(上缘)在归一化 x 处的 y:两段正弦缓拱,crestX 处 C1 连续(平顶不折角),
 * 两端在墩顶处收平——比二次贝塞尔更容易保证"缓"(deckRise 仅 0.02,曲率天然平缓)。
 */
function deckTopY(x: number): number {
  const { x0, x1, deckY, deckRise, crestX } = BRIDGE;
  if (x <= crestX) {
    const u = clamp01((x - x0) / (crestX - x0));
    return deckY - deckRise * Math.sin((u * Math.PI) / 2);
  }
  const v = clamp01((x1 - x) / (x1 - crestX));
  return deckY - deckRise * Math.sin((v * Math.PI) / 2);
}

/** 按 DECK_STEP 采样桥面上缘折线(x0..x1,含端点),步数固定与 w/h 无关。 */
function sampleDeckTop(): [number, number][] {
  const { x0, x1 } = BRIDGE;
  const steps = Math.round((x1 - x0) / DECK_STEP);
  const pts: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const x = x0 + (i / steps) * (x1 - x0);
    pts.push([x, deckTopY(x)]);
  }
  return pts;
}

export const drawBridge: LayerFn = (ctx, w, h, sp, rng) => {
  const X = (nx: number) => nx * w;
  const Y = (ny: number) => ny * h;
  const fill = rgba(sp.mid.bridge, 1);

  ctx.save();
  ctx.fillStyle = fill;

  const topPts = sampleDeckTop();

  // 1) 桥面缓拱带:上缘曲线 + 下缘(上缘 + deckThickness)闭合填充。
  ctx.beginPath();
  ctx.moveTo(X(topPts[0][0]), Y(topPts[0][1]));
  for (let i = 1; i < topPts.length; i++) ctx.lineTo(X(topPts[i][0]), Y(topPts[i][1]));
  for (let i = topPts.length - 1; i >= 0; i--) {
    ctx.lineTo(X(topPts[i][0]), Y(topPts[i][1] + BRIDGE.deckThickness));
  }
  ctx.closePath();
  ctx.fill();

  // 2) 护栏镂空剪影带:上缘之上留 GUARDRAIL_GAP 空隙,再叠一条 ~1px 同色细带。
  ctx.beginPath();
  ctx.moveTo(X(topPts[0][0]), Y(topPts[0][1] - GUARDRAIL_GAP));
  for (let i = 1; i < topPts.length; i++) {
    ctx.lineTo(X(topPts[i][0]), Y(topPts[i][1] - GUARDRAIL_GAP));
  }
  for (let i = topPts.length - 1; i >= 0; i--) {
    ctx.lineTo(X(topPts[i][0]), Y(topPts[i][1] - GUARDRAIL_GAP) - GUARDRAIL_PX);
  }
  ctx.closePath();
  ctx.fill();

  // 3) 桥墩列:普通单柱 vs 主航道双柱门形塔(塔斯曼桥辨识点)。
  const mainSpan = BRIDGE.mainSpan as readonly number[];
  for (const px of BRIDGE.pierXs) {
    if (mainSpan.includes(px)) {
      const portalTopY = deckTopY(px) - PORTAL_RISE;
      const leftX = px - PORTAL_SPACING / 2;
      const rightX = px + PORTAL_SPACING / 2;
      const pierH = BRIDGE.pierBottom - portalTopY;
      ctx.fillRect(X(leftX - PORTAL_PILLAR_W / 2), Y(portalTopY), w * PORTAL_PILLAR_W, h * pierH);
      ctx.fillRect(X(rightX - PORTAL_PILLAR_W / 2), Y(portalTopY), w * PORTAL_PILLAR_W, h * pierH);
      ctx.fillRect(
        X(leftX - PORTAL_PILLAR_W / 2),
        Y(portalTopY),
        w * (rightX - leftX + PORTAL_PILLAR_W),
        h * PORTAL_BEAM_H,
      );
    } else {
      const pierW = PIER_BASE_W * (1 + (rng() - 0.5) * 2 * PIER_JITTER);
      const deckBottomY = deckTopY(px) + BRIDGE.deckThickness;
      const pierH = BRIDGE.pierBottom - deckBottomY;
      ctx.fillRect(X(px - pierW / 2), Y(deckBottomY), w * pierW, h * pierH);
    }
  }

  // 4) 夜晚桥面灯串:仅点亮态,实点 + 同心柔光圈两层叠加(禁 shadowBlur)。
  const lampAlpha = sp.light.bridgeLampAlpha;
  if (lampAlpha > 0) {
    const { x0, x1, lampStep } = BRIDGE;
    const lampFill = rgba(sp.light.bridgeLamp, lampAlpha);
    const haloFill = rgba(sp.light.bridgeLamp, lampAlpha * LAMP_HALO_ALPHA_MULT);
    for (let x = x0 + lampStep / 2; x <= x1; x += lampStep) {
      const lx = X(x);
      const ly = Y(deckTopY(x) - LAMP_Y_OFFSET);
      const r = LAMP_RADIUS_MIN + rng() * (LAMP_RADIUS_MAX - LAMP_RADIUS_MIN);

      ctx.beginPath();
      ctx.fillStyle = haloFill;
      ctx.arc(lx, ly, LAMP_HALO_RADIUS, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.fillStyle = lampFill;
      ctx.arc(lx, ly, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
};
