// 塔斯曼桥画师(hobart 设计 §2 bridge 层)。占位:一条平桥面;P-bridge 重写为
// 缓拱+墩列单色剪影 + 夜晚灯串。
import { BRIDGE, rgba, type LayerFn } from './geometry';

export const drawBridge: LayerFn = (ctx, w, h, sp) => {
  ctx.fillStyle = rgba(sp.mid.bridge, 1);
  ctx.fillRect(w * BRIDGE.x0, h * BRIDGE.deckY, w * (BRIDGE.x1 - BRIDGE.x0), h * BRIDGE.deckThickness);
};
