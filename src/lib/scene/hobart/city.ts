// 中景 CBD 画师(hobart 设计 §2 city 层)。占位:只铺契约要求的全宽底带;P-city 重写为
// 塔群天际线单色剪影 + 夜间窗灯点阵。
// 契约:city 必须铺满 y 0.42–0.58 全宽底带(接住山脚与桥墩脚),楼群轮廓立于其上。
import { BAND, rgba, type LayerFn } from './geometry';

export const drawCity: LayerFn = (ctx, w, h, sp) => {
  ctx.fillStyle = rgba(sp.mid.silhouette, 1);
  ctx.fillRect(0, h * 0.42, w, h * (BAND.city.bottom - 0.42));
};
