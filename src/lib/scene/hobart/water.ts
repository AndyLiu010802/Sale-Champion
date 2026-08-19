// 港湾水面画师(hobart 设计 §2 water 层)。静态(入缓存)+ 动态(每帧)两函数。
// 占位:静态只铺扁平色带(§3 修订:水面不渐变),动态不画;P-water 重写两者。
// 契约:色带从 y 0.56 起铺(上沿藏进 waterfront 后防接缝),画到带底。
import { BAND, rgba, type LayerFn, type WaterDynamicFn } from './geometry';

export const drawWaterStatic: LayerFn = (ctx, w, h, sp) => {
  ctx.fillStyle = rgba(sp.water.base, 1);
  ctx.fillRect(0, h * 0.56, w, h * (BAND.water.bottom - 0.56));
};

export const drawWaterDynamic: WaterDynamicFn = () => {
  // 占位:P-water 实现波纹微动/日月波光/船摇/夜航灯。
};
