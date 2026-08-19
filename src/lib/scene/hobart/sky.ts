// 天空画师(hobart 设计 §2 sky 层;§3 剪影修订对本层影响很小 —— 云本来就是平涂扁平)。
// drawSkyBase:整幅天空三停靠渐变打底(全场唯一的颜色渐变,豁免于剪影规则)。
// drawCloudFlat:平涂积云簇(3–5 扁圆瓣堆叠 + 底部暗带),日/月/星与云的位置推进
// 都在装配器,这里只画"一朵云"本身的形状。
import { SKY_HORIZON_Y, rgba, type CloudFn, type LayerFn, type Rgb } from './geometry';

/**
 * 整幅天空打底:顶色 → 0.62×SKY_HORIZON_Y 处的中间色(top/horizon 均值)→ SKY_HORIZON_Y
 * 处地平线色;渐变终点以下(画布其余部分)canvas 会延展最后一站的地平线色,天然接住
 * mountain 层。三停靠比双停靠线性插值多一档,低空更亮更接近参考图的透视雾感。
 */
export const drawSkyBase: LayerFn = (ctx, w, h, sp) => {
  const mid: Rgb = [
    (sp.sky.top[0] + sp.sky.horizon[0]) / 2,
    (sp.sky.top[1] + sp.sky.horizon[1]) / 2,
    (sp.sky.top[2] + sp.sky.horizon[2]) / 2,
  ];
  const g = ctx.createLinearGradient(0, 0, 0, h * SKY_HORIZON_Y);
  g.addColorStop(0, rgba(sp.sky.top, 1));
  g.addColorStop(0.62, rgba(mid, 1));
  g.addColorStop(1, rgba(sp.sky.horizon, 1));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
};

type Lobe = { dx: number; rx: number; ry: number; dy: number };

/**
 * 一朵平涂积云的瓣序列(cx,cy = 云心,单位 px;由 rng 固定序列生成 —— 同一 rng 序列
 * 必须画出同一形状,调用次数只取决于瓣数,与 w/h 无关)。中央瓣最大最高,两侧瓣依次
 * 矮小;每瓣的下缘都钉在同一条 baseline 上(lobeCy = baseline - ry),天然形成积云的
 * "平底"轮廓,无需裁剪路径。
 */
function buildLobes(footW: number, footH: number, dyLimitPx: number, rng: () => number): Lobe[] {
  const numLobes = 3 + Math.floor(rng() * 3); // 3..5 瓣
  const halfW = footW / 2;
  const maxRy = footH / 2;
  const lobes: Lobe[] = [];
  for (let i = 0; i < numLobes; i++) {
    const t = numLobes === 1 ? 0 : (i / (numLobes - 1)) * 2 - 1; // -1(左端)..0(中央)..1(右端)
    const edge = Math.abs(t);
    const sizeJitter = 0.8 + rng() * 0.35;
    const size = Math.max(0.35, (1 - edge * 0.6) * sizeJitter); // 中央最大,两侧递减
    const rx = halfW * (0.3 + size * 0.28);
    const ry = maxRy * (0.45 + size * 0.55);
    const dx = t * halfW * 0.58 + (rng() - 0.5) * rx * 0.25;
    const dy = (rng() - 0.5) * 2 * dyLimitPx; // 瓣心 y 偏移 ≤0.008(屏高比例)
    lobes.push({ dx, rx, ry, dy });
  }
  return lobes;
}

/** 把瓣序列画成一个填充路径(单次 fill,避免瓣间重叠处 alpha 叠加变深)。 */
function fillLobes(ctx: CanvasRenderingContext2D, cxPx: number, baseline: number, lobes: Lobe[], heightMul: number, style: string): void {
  ctx.fillStyle = style;
  ctx.beginPath();
  for (const l of lobes) {
    const ry = l.ry * heightMul;
    const lobeCy = baseline - ry + l.dy * heightMul;
    const lx = cxPx + l.dx;
    ctx.moveTo(lx + l.rx, lobeCy);
    ctx.ellipse(lx, lobeCy, l.rx, ry, 0, 0, Math.PI * 2);
  }
  ctx.fill();
}

/**
 * 平涂积云簇:3–5 个扁圆瓣堆叠成"风积云"轮廓,底部 25–30% 高度再叠一层
 * sp.sky.cloudShade 的矮瓣序列(同一形状原地压扁),体现"底部微暗"。
 * 只用 sp.sky.cloud / cloudShade,alpha 由装配器按云量推得,直接使用不再自乘。
 */
export const drawCloudFlat: CloudFn = (ctx, w, h, sp, cx, cy, scale, alpha, rng) => {
  const footW = (0.1 + rng() * 0.06) * scale * w; // 总 footprint 宽:0.10–0.16 × scale
  const footH = (0.03 + rng() * 0.015) * scale * h; // 总 footprint 高:0.030–0.045 × scale
  const cxPx = cx * w;
  const baseline = cy * h + footH * 0.5; // 云簇平底基线

  const lobes = buildLobes(footW, footH, 0.008 * h, rng);

  fillLobes(ctx, cxPx, baseline, lobes, 1, rgba(sp.sky.cloud, alpha));
  fillLobes(ctx, cxPx, baseline, lobes, 0.28, rgba(sp.sky.cloudShade, alpha)); // 底部约 28% 高度暗带
};
