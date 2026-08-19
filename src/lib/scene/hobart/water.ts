// 港湾水面画师(hobart 设计 §2 water 层;§3 修订剪影画风)。
// drawWaterStatic(入缓存):扁平色带 + 塔群剪影倒影(亮缝切段)+ 静态波纹 + 夜灯影竖拉。
// drawWaterDynamic(每帧):波纹漂移 + 日/月波光路径 + 小船摇摆/帆桅/夜航灯。
//
// 契约备注:geometry.ts 的 WaterDynamicFn 签名不带 rng 形参(装配器调用处 SkylineBackground.tsx
// 也确实不传 rng)。task-P-water 文档描述"动态函数每帧收到同种子 rng"的意图,在此签名下用
// 「函数内部以 LAYER_SEEDS.water 固定种子现建 rng」实现等价效果:每帧新建的 mulberry32 序列
// 完全相同 → 波纹基准位置逐帧不变,动画只由 timeSec 驱动漂移/闪烁,不产生布局跳变。
import {
  BAND, BOATS, BOAT_BOB_AMPL, BRIDGE, CITY_TOWERS, LAYER_SEEDS, WHARF_EDGE_Y,
  mulberry32, rgba, type LayerFn, type WaterDynamicFn,
} from './geometry';

/** 圆角短条路径(倒影亮缝/波纹/波光统一用它;半径按短边自适应,不描线)。 */
function roundedRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, bw: number, bh: number): void {
  const r = Math.min(bh, bw) / 2;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + bw - r, y);
  ctx.arcTo(x + bw, y, x + bw, y + r, r);
  ctx.lineTo(x + bw, y + bh - r);
  ctx.arcTo(x + bw, y + bh, x + bw - r, y + bh, r);
  ctx.lineTo(x + r, y + bh);
  ctx.arcTo(x, y + bh, x, y + bh - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function fillBar(ctx: CanvasRenderingContext2D, x: number, y: number, bw: number, bh: number, style: string): void {
  ctx.fillStyle = style;
  roundedRectPath(ctx, x, y, bw, bh);
  ctx.fill();
}

export const drawWaterStatic: LayerFn = (ctx, w, h, sp, rng) => {
  // 1. 扁平水面色带(§3 修订:不渐变;从 0.56 起铺,藏进 waterfront 后防接缝)。
  ctx.fillStyle = rgba(sp.water.base, 1);
  ctx.fillRect(0, h * 0.56, w, h * (BAND.water.bottom - 0.56));

  // 2. 剪影倒影:CITY_TOWERS 逐塔,垂直拉伸更深色块,2–3 条水平亮缝切成 3–4 段。
  for (const tower of CITY_TOWERS) {
    const rw = tower.w * 0.9 * w;
    const rx = (tower.x + tower.w * 0.05) * w;
    const topPx = h * (WHARF_EDGE_Y + 0.005);
    const lenPx = h * (0.58 - tower.top) * 0.55;
    const gapCount = 2 + Math.floor(rng() * 2); // 2 或 3 条亮缝 → 3 或 4 段
    const segCount = gapCount + 1;
    const gapPx = 2; // 亮缝固定 2px 跳空(不画色块,露出下方色带)
    const segBase = Math.max(1, (lenPx - gapCount * gapPx) / segCount);
    ctx.fillStyle = rgba(sp.water.reflection, sp.water.reflectionAlpha);
    let cursor = topPx;
    for (let s = 0; s < segCount; s++) {
      const jitter = (rng() - 0.5) * 0.01 * h; // 段位 ±0.005(归一化)微调
      const segH = Math.max(1, segBase + jitter);
      ctx.fillRect(rx, cursor, rw, segH);
      cursor += segH + gapPx;
    }
  }

  // 3. 静态波纹线:12–16 条横向圆角短条,y 0.62–0.79 随机撒。
  const rippleCount = 12 + Math.floor(rng() * 5);
  const rippleColor = rgba(sp.water.ripple, sp.water.rippleAlpha * 0.6);
  for (let i = 0; i < rippleCount; i++) {
    const x = (0.05 + rng() * 0.9) * w;
    const y = (0.62 + rng() * 0.17) * h;
    const bw = (0.03 + rng() * 0.09) * w;
    const bh = 1.5 + rng() * 0.5;
    fillBar(ctx, x, y, bw, bh, rippleColor);
  }

  // 4. 夜晚灯影竖拉:7 个锚位(CBD 前 5 座塔中心 + 桥拱顶 crestX + 0.30)。=0 跳过。
  if (sp.light.waterGlowAlpha > 0) {
    const anchors = [...CITY_TOWERS.slice(0, 5).map((t) => t.x + t.w / 2), BRIDGE.crestX, 0.3];
    for (const ax of anchors) {
      const jitterX = (rng() - 0.5) * 0.006; // ±0.003
      const glowW = (0.004 + rng() * 0.003) * w;
      const glowLen = (0.05 + rng() * 0.05) * h;
      const x0 = (ax + jitterX) * w - glowW / 2;
      const y0 = h * WHARF_EDGE_Y;
      const grad = ctx.createLinearGradient(0, y0, 0, y0 + glowLen); // 透明度渐变(灯影豁免)
      grad.addColorStop(0, rgba(sp.light.waterGlow, sp.light.waterGlowAlpha));
      grad.addColorStop(1, rgba(sp.light.waterGlow, 0));
      ctx.fillStyle = grad;
      ctx.fillRect(x0, y0, glowW, glowLen);
    }
  }
};

export const drawWaterDynamic: WaterDynamicFn = (ctx, w, h, sp, timeSec, bodyX, bodyVisible) => {
  // 见文件顶部注释:签名无 rng,内部以本层固定种子逐帧重建,基准布局稳定。
  const rng = mulberry32(LAYER_SEEDS.water);

  // 1. 波纹微动:6–10 条与静态同款圆角短条,x 随 timeSec 向右漂移循环,y 固定。
  const rippleCount = 6 + Math.floor(rng() * 5);
  const rippleColor = rgba(sp.water.ripple, sp.water.rippleAlpha * 0.5);
  for (let i = 0; i < rippleCount; i++) {
    const baseX = 0.05 + rng() * 0.9;
    const y = (0.62 + rng() * 0.17) * h;
    const bw = (0.03 + rng() * 0.09) * w;
    const bh = 1.5 + rng() * 0.5;
    const x = (((baseX + timeSec * 0.008) % 1.1) - 0.05) * w;
    fillBar(ctx, x, y, bw, bh, rippleColor);
  }

  // 2. 日/月波光路径:x=bodyX 正下方竖列短横线,近宽远窄 + 正弦闪动。
  if (bodyVisible && sp.water.glitterAlpha > 0.02) {
    const glitterCount = 12 + Math.floor(rng() * 7); // 12–18
    const yTop = 0.615;
    const yBottom = 0.76;
    for (let i = 0; i < glitterCount; i++) {
      const frac = glitterCount === 1 ? 0 : i / (glitterCount - 1);
      const y = yTop + frac * (yBottom - yTop);
      const segW = 0.01 + frac * 0.04; // 近宽远窄
      const xJit = bodyX + Math.sin(timeSec * 1.7 + i * 2.4) * 0.012;
      const alpha = sp.water.glitterAlpha * Math.max(0, 0.5 + 0.5 * Math.sin(timeSec * 2.3 + i));
      if (alpha < 0.01) continue;
      fillBar(ctx, (xJit - segW / 2) * w, y * h, segW * w, 1.6, rgba(sp.water.glitter, alpha));
    }
  }

  // 3. 小船剪影(BOATS 锚点固定;竖摇 + 帆/桅 + 夜航灯,全部 sp.water.hull 单色)。
  const hullColor = rgba(sp.water.hull, 1);
  for (let bi = 0; bi < BOATS.length; bi++) {
    const b = BOATS[bi];
    const yy = b.y + Math.sin(timeSec * 0.9 + b.bobPhase) * BOAT_BOB_AMPL;
    const cx = b.x * w;
    const cy = yy * h;
    const hullW = 0.03 * b.scale * w;
    const hullH = 0.006 * b.scale * h;
    const deckY = cy - hullH / 2;

    // 船体:舟形六点多边形(两端收窄成尖)。
    ctx.fillStyle = hullColor;
    ctx.beginPath();
    ctx.moveTo(cx - hullW / 2, cy);
    ctx.lineTo(cx - hullW * 0.25, deckY);
    ctx.lineTo(cx + hullW * 0.25, deckY);
    ctx.lineTo(cx + hullW / 2, cy);
    ctx.lineTo(cx + hullW * 0.25, cy + hullH / 2);
    ctx.lineTo(cx - hullW * 0.25, cy + hullH / 2);
    ctx.closePath();
    ctx.fill();

    const mastH = 0.03 * b.scale * h;
    let lampY: number;
    if (bi < 2) {
      // 前两艘:三角帆,桅位居船中,与船体同色(剪影不分色)。
      const apexY = deckY - mastH;
      ctx.beginPath();
      ctx.moveTo(cx, apexY);
      ctx.lineTo(cx, deckY);
      ctx.lineTo(cx + hullW * 0.4, deckY);
      ctx.closePath();
      ctx.fill();
      lampY = apexY;
    } else {
      // 第三艘:只立 1px 桅杆。
      const mastTopY = deckY - mastH;
      ctx.strokeStyle = hullColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx, deckY);
      ctx.lineTo(cx, mastTopY);
      ctx.stroke();
      lampY = mastTopY;
    }

    // 夜航灯:桅顶实点 + 船体正下方竖向光影短条(alpha×0.5)。=0 跳过。
    if (sp.light.boatLampAlpha > 0) {
      ctx.fillStyle = rgba(sp.light.boatLamp, sp.light.boatLampAlpha);
      ctx.beginPath();
      ctx.arc(cx, lampY, 0.75, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = rgba(sp.light.boatLamp, sp.light.boatLampAlpha * 0.5);
      ctx.fillRect(cx - 1, cy + hullH / 2, 2, 0.02 * h);
    }
  }
};
