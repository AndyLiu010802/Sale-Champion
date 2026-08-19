// 前景屋顶群画师(hobart 设计 §2 foreground 层)。占位:整带平涂;P-foreground 重写为
// 屋顶齿廓+树冠单色剪影(全场最深)。
import { BAND, rgba, type LayerFn } from './geometry';

export const drawForeground: LayerFn = (ctx, w, h, sp) => {
  ctx.fillStyle = rgba(sp.near.silhouette, 1);
  ctx.fillRect(0, h * BAND.foreground.top, w, h * (BAND.foreground.bottom - BAND.foreground.top));
};
