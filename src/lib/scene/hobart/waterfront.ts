// 码头仓库带画师(hobart 设计 §2 waterfront 层)。占位:一条剪影带;P-waterfront 重写为
// 山墙齿线+栈桥+桅杆线单色剪影。
import { BAND, WHARF_EDGE_Y, rgba, type LayerFn } from './geometry';

export const drawWaterfront: LayerFn = (ctx, w, h, sp) => {
  ctx.fillStyle = rgba(sp.near.wharf, 1);
  ctx.fillRect(0, h * BAND.waterfront.top, w, h * (WHARF_EDGE_Y - BAND.waterfront.top));
};
