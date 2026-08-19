// 威灵顿山画师(hobart 设计 §2 mountain 层)。占位:整带平涂矩形;P-mountain 重写为
// 双脊剪影 + 发射塔桅杆 + 雾霭带 + 夜间山脚灯点。
import { BAND, rgba, type LayerFn } from './geometry';

export const drawMountain: LayerFn = (ctx, w, h, sp) => {
  ctx.fillStyle = rgba(sp.far.ridgeFar, 1);
  ctx.fillRect(0, h * BAND.mountain.top, w, h * (BAND.mountain.bottom - BAND.mountain.top));
};
