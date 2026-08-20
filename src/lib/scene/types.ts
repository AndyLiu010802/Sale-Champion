import type { Rgb } from '@/lib/scene/palette';

export type { Rgb };

// —— 分层剪影调色结果(paint.ts 产出;画师只取自己层的色槽)——
// 进深剪影五档(远浅近深,测试钉死亮度递减):
//   far.ridgeFar > far.ridgeNear > mid.bridge > mid.silhouette > near.wharf > near.silhouette
export type ScenePaint = {
  sky: {
    top: Rgb; horizon: Rgb;          // 天空渐变(全场唯一的颜色渐变)
    cloud: Rgb; cloudShade: Rgb;     // 平涂云主体 / 底部暗带
    sun: Rgb; glow: Rgb;             // 日/月圆盘与光晕(沿用 palette 引擎)
    star: number;                    // 星星亮度系数 0..1
  };
  far: {
    ridgeFar: Rgb;                   // 远脊剪影(最浅)
    ridgeNear: Rgb;                  // 近脊剪影
    mist: Rgb; mistAlpha: number;    // 山脚雾霭带(透明度渐变豁免)
  };
  mid: {
    silhouette: Rgb;                 // CBD 天际线剪影(含底带/树冠/砂岩齿线)
    bridge: Rgb;                     // 塔斯曼桥剪影(略浅于 city,居其后)
  };
  near: {
    silhouette: Rgb;                 // 前景屋顶/树冠剪影(全场最深)
    wharf: Rgb;                      // 码头仓库带剪影(含岸壁/栈桥/桅杆线)
  };
  water: {
    base: Rgb;                       // 扁平水面色带(§3 修订:不再渐变)
    ripple: Rgb; rippleAlpha: number;        // 横向浅色波纹线
    reflection: Rgb; reflectionAlpha: number; // 剪影倒影(垂直拉伸更深色块)
    glitter: Rgb; glitterAlpha: number;       // 日/月波光路径
    hull: Rgb;                       // 小船剪影(船体+帆同色)
  };
  light: {
    window: Rgb; windowLit: number;  // 窗灯发光点阵色 + 点亮比例(沿用系数)
    bridgeLamp: Rgb; bridgeLampAlpha: number;
    boatLamp: Rgb; boatLampAlpha: number;
    waterGlow: Rgb; waterGlowAlpha: number;   // 水面灯光竖向倒影
    flickerEpoch: number;            // 4s 窗灯闪烁纪元(装配器注入)
  };
  dim: number;                       // 整体压暗幕 rgba(6,8,15,dim)(沿用)
};

/** 伪随机(固定种子;与旧 SkylineBackground 同一实现,唯一权威副本迁到这里)。 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** rgba() 字符串(画师与装配器公用)。 */
export function rgba(c: Rgb, a: number): string {
  return `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;
}
