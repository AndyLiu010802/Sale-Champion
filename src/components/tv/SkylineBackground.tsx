'use client';

import { useEffect, useRef } from 'react';
import { nightProgress, phaseFromClock, sunPosition } from '@/lib/scene/palette';
import { effectsFromWeather } from '@/lib/scene/weather';
import { scenePaint, windowLitSchedule } from '@/lib/scene/hobart/paint';
import {
  LAYER_SEEDS, MOUNTAIN, SKY_HORIZON_Y, mulberry32, rgba,
  type LayerFn, type ScenePaint,
} from '@/lib/scene/hobart/geometry';
import { drawCloudFlat, drawSkyBase } from '@/lib/scene/hobart/sky';
import { drawMountain } from '@/lib/scene/hobart/mountain';
import { drawBridge } from '@/lib/scene/hobart/bridge';
import { drawCity } from '@/lib/scene/hobart/city';
import { drawWaterfront } from '@/lib/scene/hobart/waterfront';
import { drawWaterDynamic, drawWaterStatic } from '@/lib/scene/hobart/water';
import { drawForeground } from '@/lib/scene/hobart/foreground';
import type { TvWeather } from '@/lib/types';

// —— 性能约束(沿用天际线设计 §2 的值)——
const MAX_DPR = 1.5;            // 电视浏览器:DPR 封顶
const FRAME_MIN_MS = 30;        // rAF 隔帧 → ~30fps
const MAX_RAIN = 300;
const MAX_SNOW = 150;
const STAR_COUNT = 140;
const CLOUD_COUNT = 5;          // 生成 5 朵,按云量显示 2–5 朵
const CACHE_T_STEP = 0.015;     // 调色相位跨过该步进才重绘静态场景
const FLICKER_EPOCH_MS = 4000;  // 窗灯低频闪烁纪元(也是缓存重绘频率上限:每 4s 一次)
const WINDOW_LIT_STEP = 0.02;   // 窗灯作息量化档:跨过该步进才重绘静态场景(爬升/熄灭期跟手)

// 静态层(后→前)与各自固定种子:一次画进离屏缓存(hobart 设计 §4)。
// 顺序契约:水的静态色带/倒影画在 waterfront 之前 —— 码头岸线、栈桥、船桅要压在水上沿。
const STATIC_LAYERS: [LayerFn, number][] = [
  [drawMountain, LAYER_SEEDS.mountain],
  [drawBridge, LAYER_SEEDS.bridge],
  [drawCity, LAYER_SEEDS.city],
  [drawWaterStatic, LAYER_SEEDS.water],
  [drawWaterfront, LAYER_SEEDS.waterfront],
  [drawForeground, LAYER_SEEDS.foreground],
];

type Star = { x: number; y: number; r: number; phase: number };
type Cloud = { x: number; y: number; scale: number; speed: number };
type Drop = { x: number; y: number; v: number };
type Flake = { x: number; y: number; v: number; drift: number; r: number };

type Scene = {
  stars: Star[];
  clouds: Cloud[];
  rain: Drop[];
  snow: Flake[];
};

function buildScene(w: number, h: number): Scene {
  const rand = mulberry32(777);
  // 星星只撒在山脊以上的天区(y<0.4;山下天区被静态场景全部遮住)。
  const stars: Star[] = Array.from({ length: STAR_COUNT }, () => ({
    x: rand(), y: rand() * 0.4, r: 0.6 + rand() * 1.2, phase: rand() * Math.PI * 2,
  }));
  const clouds: Cloud[] = Array.from({ length: CLOUD_COUNT }, () => ({
    x: rand() * 1.4 - 0.2,
    y: 0.05 + rand() * 0.26,
    scale: 0.7 + rand() * 0.9,
    speed: 0.004 + rand() * 0.006, // 屏宽比例/秒 → 慢速流云
  }));
  const rainRand = mulberry32(555);
  const rain: Drop[] = Array.from({ length: MAX_RAIN }, () => ({
    x: rainRand() * w, y: rainRand() * h, v: 900 + rainRand() * 500,
  }));
  const snowRand = mulberry32(666);
  const snow: Flake[] = Array.from({ length: MAX_SNOW }, () => ({
    x: snowRand() * w, y: snowRand() * h, v: 45 + snowRand() * 55,
    drift: snowRand() * Math.PI * 2, r: 1.2 + snowRand() * 1.8,
  }));
  return { stars, clouds, rain, snow };
}

/**
 * TV 霍巴特剪影背景装配器(hobart 设计 §4):最底层 fixed z-0 canvas,pointer-events-none。
 * 静态层(山/桥/城/水面/码头/前景)由 7 个画师纯函数画进离屏缓存;每帧只画:
 * 天空渐变 → 星 → 日/月(沉入山后)→ 平涂流云 → 贴缓存 → 水面动态(波光/船摇)
 * → 天气粒子/闪电 → vignette → 压暗幕。
 * 组件对外 API { weather, paused } 不变(TvApp 零改动);weather=null → 按"晴"+
 * 回落日出日落渲染;paused=true(庆祝全屏)期间 rAF 循环停止。
 */
export default function SkylineBackground({
  weather,
  paused,
}: {
  weather: TvWeather | null;
  paused: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // 天气经 ref 透传:10 分钟轮询只换数据,不重启渲染循环。
  const weatherRef = useRef<TvWeather | null>(weather);
  useEffect(() => {
    weatherRef.current = weather;
  }, [weather]);

  useEffect(() => {
    if (paused) return; // 覆盖层不透明,画面停在最后一帧即可;恢复时 effect 重启循环
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let W = 0;
    let H = 0;
    let dpr = 1;
    let scene: Scene = buildScene(1, 1);
    const cache = document.createElement('canvas'); // 静态场景离屏底图(hobart 设计 §4)
    const cacheCtx = cache.getContext('2d');
    let cacheKey = '';
    let raf = 0;
    let lastFrame = 0;
    let lastTick = 0;
    // 雷暴闪电状态(沿用:6–18s 随机一次,2–3 帧序列)
    let nextStrikeAt = 0;
    let flashLeft = 0;
    let bolt: [number, number][] = [];
    let forks: [number, number][][] = [];
    const boltRand = mulberry32(Date.now() >>> 0); // 唯一非固定种子:闪电形态每次不同

    const resize = () => {
      W = window.innerWidth;
      H = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      cache.width = canvas.width;
      cache.height = canvas.height;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      scene = buildScene(W, H);
      cacheKey = ''; // 强制底图重绘
    };
    resize();
    window.addEventListener('resize', resize);

    const drawCacheLayers = (sp: ScenePaint) => {
      if (!cacheCtx) return;
      cacheCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cacheCtx.clearRect(0, 0, W, H);
      for (const [draw, seed] of STATIC_LAYERS) draw(cacheCtx, W, H, sp, mulberry32(seed));
    };

    const render = (nowMs: number) => {
      raf = requestAnimationFrame(render);
      if (nowMs - lastFrame < FRAME_MIN_MS) return; // 隔帧 ~30fps
      const dt = Math.min((nowMs - lastTick) / 1000, 0.1);
      lastFrame = nowMs;
      lastTick = nowMs;

      const weatherNow = weatherRef.current;
      // weather=null → code 0(晴)+ 风 0;sunrise/sunset undefined → 06:30/19:00 回落。
      const fx = effectsFromWeather(weatherNow?.weatherCode ?? 0, weatherNow?.windSpeedKmh ?? 0);
      const now = new Date();
      const t = phaseFromClock(now, weatherNow?.sunrise, weatherNow?.sunset);
      const nightT = nightProgress(now, weatherNow?.sunrise, weatherNow?.sunset);
      const epoch = Math.floor(nowMs / FLICKER_EPOCH_MS);
      const sp = scenePaint(t, fx, epoch);
      // 窗灯作息:纯本地时钟驱动,覆盖 scenePaint 关键帧里插值出的 windowLit(那份改为
      // 未使用的回落值,不再进渲染路径)——山脚/码头/前景/塔楼窗点阵共用同一系数,
      // 自动跟随作息(设计:晚 6–7 点渐次点亮、10–11 点渐次熄灭、白天零星 2–3 盏)。
      sp.light.windowLit = windowLitSchedule(now);
      const windMul = fx.wind === 2 ? 3.5 : fx.wind === 1 ? 2 : 1;

      // 静态场景缓存:resize / 调色跨步进 / 闪烁纪元 / 云量档 / 窗灯作息量化档 变化才
      // 重绘(沿用现机制;窗灯档位保证爬升/熄灭渐变期缓存跟手重绘)。
      const key = `${W}x${H}|${Math.round(t / CACHE_T_STEP)}|${epoch}|${Math.round(fx.cloudiness * 10)}`
        + `|${Math.round(sp.light.windowLit / WINDOW_LIT_STEP)}`;
      if (key !== cacheKey) {
        drawCacheLayers(sp);
        cacheKey = key;
      }

      // 1. 天空渐变整幅打底(sky 画师)
      drawSkyBase(ctx, W, H, sp, mulberry32(LAYER_SEEDS.sky));

      // 2. 星星(夜间;云多则遮蔽)
      const starAlpha = sp.sky.star * (1 - fx.cloudiness * 0.85);
      if (starAlpha > 0.02) {
        for (const s of scene.stars) {
          const tw = 0.55 + 0.45 * Math.sin(nowMs * 0.0012 + s.phase);
          ctx.fillStyle = `rgba(210,225,255,${(starAlpha * tw).toFixed(3)})`;
          ctx.fillRect(s.x * W, s.y * H, s.r, s.r);
        }
      }

      // 3. 太阳/月亮 + 径向光晕(在贴缓存之前画 → 低角度时沉入山体/城市之后)
      const body = sunPosition(t, nightT);
      const bodyVisible = body.y < 1.04;
      if (bodyVisible) {
        const bx = body.x * W;
        const by = body.y * H * SKY_HORIZON_Y;
        const radius = body.kind === 'sun' ? H * 0.05 : H * 0.038;
        const glowR = radius * 5;
        const glow = ctx.createRadialGradient(bx, by, radius * 0.4, bx, by, glowR);
        glow.addColorStop(0, rgba(sp.sky.glow, 0.4 * (1 - fx.cloudiness * 0.7)));
        glow.addColorStop(1, rgba(sp.sky.glow, 0));
        ctx.fillStyle = glow;
        ctx.fillRect(bx - glowR, by - glowR, glowR * 2, glowR * 2);
        ctx.fillStyle = rgba(sp.sky.sun, 1 - fx.cloudiness * 0.5);
        ctx.beginPath();
        ctx.arc(bx, by, radius, 0, Math.PI * 2);
        ctx.fill();
      }

      // 4. 平涂流云(sky 画师;位置由装配器推进,风加速 ×2/×3.5)
      const cloudCount = Math.min(CLOUD_COUNT, 2 + Math.round(fx.cloudiness * 3));
      const cloudAlpha = 0.5 + fx.cloudiness * 0.45;
      for (let i = 0; i < cloudCount; i++) {
        const c = scene.clouds[i];
        c.x += c.speed * windMul * dt;
        if (c.x > 1.25) c.x = -0.25;
        drawCloudFlat(ctx, W, H, sp, c.x, c.y, c.scale, cloudAlpha, mulberry32(877 + i * 13));
      }

      // 5. 静态场景缓存(山/桥/城/水面色带与倒影/码头/前景)
      ctx.drawImage(cache, 0, 0, W, H);

      // 6. 水面动态:波纹微动 + 日/月波光 + 船摇/夜航灯(water 画师)
      drawWaterDynamic(ctx, W, H, sp, nowMs / 1000, body.x, bodyVisible);

      // 7. 雾天:场景之上再罩一层能见度雾幕(沿用)
      if (fx.fog) {
        const fog = ctx.createLinearGradient(0, H * 0.4, 0, H);
        fog.addColorStop(0, rgba(sp.far.mist, 0.06));
        fog.addColorStop(1, rgba(sp.far.mist, 0.42));
        ctx.fillStyle = fog;
        ctx.fillRect(0, 0, W, H);
      }

      // 8. 雨:短线段粒子,强度定数量/速度,风定倾角 ~12°/~22°(沿用)
      if (fx.rain > 0) {
        const count = Math.min(MAX_RAIN, fx.rain * 100);
        const tilt = Math.tan(((fx.wind === 2 ? 22 : fx.wind === 1 ? 12 : 4) * Math.PI) / 180);
        const len = 8 + fx.rain * 5;
        ctx.strokeStyle = 'rgba(170,195,230,0.38)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        for (let i = 0; i < count; i++) {
          const d = scene.rain[i];
          d.y += d.v * (0.6 + fx.rain * 0.2) * dt;
          d.x += d.v * tilt * dt;
          if (d.y > H) d.y -= H + len;
          if (d.x > W) d.x -= W;
          ctx.moveTo(d.x, d.y);
          ctx.lineTo(d.x - tilt * len, d.y - len);
        }
        ctx.stroke();
      }

      // 9. 雪:慢速圆点,轻微左右摆(沿用)
      if (fx.snow > 0) {
        ctx.fillStyle = 'rgba(235,240,250,0.8)';
        for (const f of scene.snow) {
          f.y += f.v * dt;
          f.x += (Math.sin(nowMs * 0.0008 + f.drift) * 12 + fx.wind * 18) * dt;
          if (f.y > H) f.y -= H + 4;
          if (f.x > W) f.x -= W;
          if (f.x < 0) f.x += W;
          ctx.beginPath();
          ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // 10. 雷暴闪电:随机 6–18s 一次,2–3 帧打亮 + 分叉闪电线 + 山脊描边高亮(沿用改造)
      if (fx.thunder) {
        if (nextStrikeAt === 0) nextStrikeAt = nowMs + 2000 + boltRand() * 6000;
        if (nowMs >= nextStrikeAt && flashLeft === 0) {
          flashLeft = 2 + (boltRand() < 0.5 ? 1 : 0);
          nextStrikeAt = nowMs + 6000 + boltRand() * 12000;
          bolt = [];
          forks = [];
          let px = W * (0.15 + boltRand() * 0.7);
          let py = H * 0.05;
          bolt.push([px, py]);
          while (py < H * 0.55) { // 闪电落到港湾上空为止
            px += (boltRand() - 0.5) * 90;
            py += 30 + boltRand() * 55;
            bolt.push([px, py]);
            if (boltRand() < 0.3 && forks.length < 2) {
              const fork: [number, number][] = [[px, py]];
              let fkx = px;
              let fky = py;
              const dir = boltRand() < 0.5 ? -1 : 1;
              const segs = 2 + Math.round(boltRand());
              for (let s = 0; s < segs; s++) {
                fkx += dir * (30 + boltRand() * 60);
                fky += 25 + boltRand() * 40;
                fork.push([fkx, fky]);
              }
              forks.push(fork);
            }
          }
        }
        if (flashLeft > 0) {
          ctx.fillStyle = `rgba(225,235,255,${flashLeft >= 2 ? 0.22 : 0.1})`;
          ctx.fillRect(0, 0, W, H); // 天空整体打亮
          const strokePath = (pts: [number, number][]) => {
            ctx.beginPath();
            ctx.moveTo(pts[0][0], pts[0][1]);
            for (const [qx, qy] of pts.slice(1)) ctx.lineTo(qx, qy);
            ctx.stroke();
          };
          ctx.strokeStyle = 'rgba(240,246,255,0.95)';
          ctx.lineWidth = 2.5;
          strokePath(bolt);
          ctx.lineWidth = 1.5;
          for (const fork of forks) strokePath(fork);
          // 山脊边缘高亮(替代旧楼顶折线):远脊轮廓描边
          ctx.strokeStyle = 'rgba(200,220,255,0.55)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          const ridge = MOUNTAIN.farRidge;
          ctx.moveTo(ridge[0][0] * W, ridge[0][1] * H);
          for (let i = 1; i < ridge.length; i++) ctx.lineTo(ridge[i][0] * W, ridge[i][1] * H);
          ctx.stroke();
          flashLeft--;
        }
      } else {
        nextStrikeAt = 0;
        flashLeft = 0;
      }

      // 11. vignette(沿用)
      const vig = ctx.createRadialGradient(
        W / 2, H * 0.45, Math.min(W, H) * 0.45,
        W / 2, H * 0.45, Math.max(W, H) * 0.75,
      );
      vig.addColorStop(0, 'rgba(0,0,0,0)');
      vig.addColorStop(1, 'rgba(0,0,0,0.38)');
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, W, H);

      // 12. 整体压暗幕(沿用:白天 0.45 → 夜 0.35,随 t 插值,保前景文字对比度)
      ctx.fillStyle = `rgba(6,8,15,${sp.dim.toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
    };

    raf = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [paused]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 h-full w-full"
    />
  );
}
