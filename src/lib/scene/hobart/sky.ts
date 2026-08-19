// 天空画师(hobart 设计 §2 sky 层)。drawSkyBase 的整幅渐变已是最终行为;
// drawCloudFlat 目前是单椭圆占位 —— P-sky 任务将重写为平涂积云簇。
import { SKY_HORIZON_Y, rgba, type CloudFn, type LayerFn } from './geometry';

/** 整幅天空打底:顶色 → 地平线色(渐变终点 SKY_HORIZON_Y,以下延展地平线色)。 */
export const drawSkyBase: LayerFn = (ctx, w, h, sp) => {
  const g = ctx.createLinearGradient(0, 0, 0, h * SKY_HORIZON_Y);
  g.addColorStop(0, rgba(sp.sky.top, 1));
  g.addColorStop(1, rgba(sp.sky.horizon, 1));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
};

/** 一朵平涂积云(占位:单椭圆;P-sky 重写为 3–5 瓣扁平云簇 + 底部暗带)。 */
export const drawCloudFlat: CloudFn = (ctx, w, h, sp, cx, cy, scale, alpha) => {
  ctx.fillStyle = rgba(sp.sky.cloud, alpha);
  ctx.beginPath();
  ctx.ellipse(cx * w, cy * h, 90 * scale, 26 * scale, 0, 0, Math.PI * 2);
  ctx.fill();
};
