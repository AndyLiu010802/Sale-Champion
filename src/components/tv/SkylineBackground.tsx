'use client';

import { useEffect, useRef } from 'react';
import { getPalette, nightProgress, phaseFromClock, sunPosition, type Palette, type Rgb } from '@/lib/scene/palette';
import { effectsFromWeather } from '@/lib/scene/weather';
import type { TvWeather } from '@/lib/types';

// —— 性能约束(天际线设计 §2)——
const MAX_DPR = 1.5;            // 电视浏览器:DPR 封顶
const FRAME_MIN_MS = 30;        // rAF 隔帧 → ~30fps
const MAX_RAIN = 300;
const MAX_SNOW = 150;
const STAR_COUNT = 140;
const CLOUD_COUNT = 5;          // 生成 5 朵,按云量显示 2–5 朵
const HORIZON = 0.82;           // 地平线在画布高度的位置
const CACHE_T_STEP = 0.015;     // 调色相位跨过该步进才重绘楼群底图
const FLICKER_EPOCH_MS = 4000;  // 窗灯低频闪烁纪元(也是底图重绘频率上限:每 4s 一次)

// 伪随机(固定种子,mulberry32):楼群/星星/云/窗灯布局在每次挂载与重建间完全一致。
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rgba(c: Rgb, a: number): string {
  return `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;
}

function mix(a: Rgb, b: Rgb, u: number): Rgb {
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
}

/** 阴/雨天压灰(设计 §4):向自身灰度值混合 amount(0..1)。 */
function grayMix(c: Rgb, amount: number): Rgb {
  const g = 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
  return mix(c, [g, g, g], Math.min(1, amount));
}

type WindowCell = { wx: number; wy: number; litRand: number; flickerRand: number };
type Building = { x: number; w: number; h: number; antenna: number; windows: WindowCell[] };
type Star = { x: number; y: number; r: number; phase: number };
type Cloud = { x: number; y: number; scale: number; speed: number; blobs: [number, number, number, number][] };
type Drop = { x: number; y: number; v: number };
type Flake = { x: number; y: number; v: number; drift: number; r: number };

type Scene = {
  stars: Star[];
  clouds: Cloud[];
  layers: Building[][];         // 远 → 近(三层进深)
  outline: [number, number][];  // 近层楼顶折线(闪电时描边高亮)
  rain: Drop[];
  snow: Flake[];
};

// 三层楼群:远层高瘦浅色(城市核心天际线)、近层矮宽深色(前景剪影)。
const LAYER_CONFIGS = [
  { seed: 101, minH: 0.26, maxH: 0.5, minW: 40, maxW: 80, gap: 5, antennaP: 0.3, windows: false },
  { seed: 202, minH: 0.18, maxH: 0.34, minW: 50, maxW: 100, gap: 8, antennaP: 0.2, windows: true },
  { seed: 303, minH: 0.1, maxH: 0.24, minW: 70, maxW: 140, gap: 12, antennaP: 0.12, windows: true },
] as const;

function buildLayer(cfg: (typeof LAYER_CONFIGS)[number], w: number, h: number): Building[] {
  const rand = mulberry32(cfg.seed);
  const buildings: Building[] = [];
  let x = -30;
  while (x < w + 30) {
    const bw = cfg.minW + rand() * (cfg.maxW - cfg.minW);
    const bh = (cfg.minH + rand() * (cfg.maxH - cfg.minH)) * h;
    const antenna = rand() < cfg.antennaP ? 12 + rand() * 28 : 0;
    const windows: WindowCell[] = [];
    if (cfg.windows) {
      const cols = Math.floor((bw - 12) / 18);
      const rows = Math.floor((bh - 20) / 26);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          windows.push({ wx: 8 + c * 18, wy: 10 + r * 26, litRand: rand(), flickerRand: rand() });
        }
      }
    }
    buildings.push({ x, w: bw, h: bh, antenna, windows });
    x += bw + cfg.gap;
  }
  return buildings;
}

function buildScene(w: number, h: number): Scene {
  const rand = mulberry32(777);
  const stars: Star[] = Array.from({ length: STAR_COUNT }, () => ({
    x: rand(), y: rand() * 0.7, r: 0.6 + rand() * 1.2, phase: rand() * Math.PI * 2,
  }));
  const clouds: Cloud[] = Array.from({ length: CLOUD_COUNT }, (_, i) => ({
    x: rand() * 1.4 - 0.2,
    y: 0.08 + rand() * 0.32,
    scale: 0.7 + rand() * 0.9,
    speed: 0.004 + rand() * 0.006, // 屏宽比例/秒 → 慢速流云
    blobs: Array.from({ length: 4 + (i % 3) }, (): [number, number, number, number] => [
      (rand() - 0.5) * 180, (rand() - 0.5) * 34, 55 + rand() * 55, 16 + rand() * 12,
    ]),
  }));
  const layers = LAYER_CONFIGS.map((cfg) => buildLayer(cfg, w, h));
  const outline: [number, number][] = [];
  for (const b of layers[2]) {
    outline.push([b.x, h - b.h], [b.x + b.w, h - b.h]);
  }
  const rainRand = mulberry32(555);
  const rain: Drop[] = Array.from({ length: MAX_RAIN }, () => ({
    x: rainRand() * w, y: rainRand() * h, v: 900 + rainRand() * 500,
  }));
  const snowRand = mulberry32(666);
  const snow: Flake[] = Array.from({ length: MAX_SNOW }, () => ({
    x: snowRand() * w, y: snowRand() * h, v: 45 + snowRand() * 55,
    drift: snowRand() * Math.PI * 2, r: 1.2 + snowRand() * 1.8,
  }));
  return { stars, clouds, layers, outline, rain, snow };
}

/**
 * TV 动画天际线背景(天际线设计 §2):最底层 fixed z-0 canvas,pointer-events-none。
 * 时间驱动纯自动(phaseFromClock),天气特效由 props.weather 推导;
 * weather=null(从未成功)→ 按"晴"+ 回落日出日落渲染(设计 §3)。
 * paused=true(庆祝/生日全屏播放)期间整个 rAF 循环停止(设计 §2)。
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
    const cache = document.createElement('canvas'); // 楼群+窗灯离屏底图(设计 §2)
    const cacheCtx = cache.getContext('2d');
    let cacheKey = '';
    let raf = 0;
    let lastFrame = 0;
    let lastTick = 0;
    // 雷暴闪电状态(设计 §4:6–18s 随机一次,2–3 帧序列)
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

    const drawCache = (p: Palette, epoch: number, gray: number) => {
      if (!cacheCtx) return;
      cacheCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cacheCtx.clearRect(0, 0, W, H);
      const layerColors = [p.buildingFar, p.buildingMid, p.buildingNear].map((c) => grayMix(c, gray));
      scene.layers.forEach((buildings, li) => {
        cacheCtx.fillStyle = rgba(layerColors[li], 1);
        for (const b of buildings) {
          const top = H - b.h;
          cacheCtx.fillRect(b.x, top, b.w, b.h);
          if (b.antenna > 0) cacheCtx.fillRect(b.x + b.w / 2 - 1.5, top - b.antenna, 3, b.antenna);
        }
        if (li === 0) return; // 远层免窗(雾霭距离感)
        for (const b of buildings) {
          const top = H - b.h;
          for (const win of b.windows) {
            const lit = win.litRand < p.windowLit
              && !(win.flickerRand > 0.92 && (epoch + Math.floor(win.flickerRand * 1000)) % 3 === 0);
            cacheCtx.fillStyle = lit ? rgba(p.window, li === 2 ? 0.85 : 0.55) : 'rgba(0,0,0,0.18)';
            cacheCtx.fillRect(b.x + win.wx, top + win.wy, li === 2 ? 8 : 6, li === 2 ? 12 : 9);
          }
        }
      });
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
      const p = getPalette(t);
      const gray = Math.min(1, fx.cloudiness * 0.45 + fx.rain * 0.08); // 阴/雨压灰
      const windMul = fx.wind === 2 ? 3.5 : fx.wind === 1 ? 2 : 1;

      // 楼群底图:resize / 调色跨步进 / 闪烁纪元 / 云量档 变化才重绘(设计 §2)。
      const epoch = Math.floor(nowMs / FLICKER_EPOCH_MS);
      const key = `${W}x${H}|${Math.round(t / CACHE_T_STEP)}|${epoch}|${Math.round(fx.cloudiness * 10)}`;
      if (key !== cacheKey) {
        drawCache(p, epoch, gray);
        cacheKey = key;
      }

      // 1. 天空线性渐变(顶 → 地平线;渐变终点以下延展地平线色)
      const sky = ctx.createLinearGradient(0, 0, 0, H * HORIZON);
      sky.addColorStop(0, rgba(grayMix(p.skyTop, gray), 1));
      sky.addColorStop(1, rgba(grayMix(p.skyHor, gray), 1));
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);

      // 2. 星星(夜间;云多则遮蔽)
      const starAlpha = p.star * (1 - fx.cloudiness * 0.85);
      if (starAlpha > 0.02) {
        for (const s of scene.stars) {
          const tw = 0.55 + 0.45 * Math.sin(nowMs * 0.0012 + s.phase);
          ctx.fillStyle = `rgba(210,225,255,${(starAlpha * tw).toFixed(3)})`;
          ctx.fillRect(s.x * W, s.y * H, s.r, s.r);
        }
      }

      // 3. 太阳/月亮 + 径向光晕
      const body = sunPosition(t, nightT);
      if (body.y < 1.04) {
        const bx = body.x * W;
        const by = body.y * H * HORIZON;
        const radius = body.kind === 'sun' ? H * 0.05 : H * 0.038;
        const glowR = radius * 5;
        const glow = ctx.createRadialGradient(bx, by, radius * 0.4, bx, by, glowR);
        glow.addColorStop(0, rgba(p.glow, 0.4 * (1 - fx.cloudiness * 0.7)));
        glow.addColorStop(1, rgba(p.glow, 0));
        ctx.fillStyle = glow;
        ctx.fillRect(bx - glowR, by - glowR, glowR * 2, glowR * 2);
        ctx.fillStyle = rgba(p.sun, 1 - fx.cloudiness * 0.5);
        ctx.beginPath();
        ctx.arc(bx, by, radius, 0, Math.PI * 2);
        ctx.fill();
      }

      // 4. 慢速流云(云量定朵数/浓度,风加速 ×2/×3.5)
      const cloudCount = Math.min(CLOUD_COUNT, 2 + Math.round(fx.cloudiness * 3));
      const cloudColor = grayMix(mix(p.skyHor, [255, 255, 255], 0.22 * (1 - p.star)), gray + fx.rain * 0.1);
      for (let i = 0; i < cloudCount; i++) {
        const c = scene.clouds[i];
        c.x += c.speed * windMul * dt;
        if (c.x > 1.25) c.x = -0.25;
        ctx.fillStyle = rgba(cloudColor, 0.28 + fx.cloudiness * 0.4);
        for (const [bdx, bdy, brx, bry] of c.blobs) {
          ctx.beginPath();
          ctx.ellipse(c.x * W + bdx * c.scale, c.y * H + bdy * c.scale, brx * c.scale, bry * c.scale, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // 5. 地平线雾霭层(雾天加厚)
      const hazeTop = H * (HORIZON - 0.16);
      const haze = ctx.createLinearGradient(0, hazeTop, 0, H * HORIZON);
      haze.addColorStop(0, rgba(p.haze, 0));
      haze.addColorStop(1, rgba(p.haze, Math.min(0.85, p.hazeAlpha + (fx.fog ? 0.3 : 0))));
      ctx.fillStyle = haze;
      ctx.fillRect(0, hazeTop, W, H - hazeTop);

      // 6. 楼群底图(含窗灯)
      ctx.drawImage(cache, 0, 0, W, H);

      // 7. 雾天:楼群之上再罩一层能见度雾幕(设计 §4)
      if (fx.fog) {
        const fog = ctx.createLinearGradient(0, H * 0.4, 0, H);
        fog.addColorStop(0, rgba(p.haze, 0.06));
        fog.addColorStop(1, rgba(p.haze, 0.42));
        ctx.fillStyle = fog;
        ctx.fillRect(0, 0, W, H);
      }

      // 8. 雨:短线段粒子,强度定数量/速度,风定倾角 ~12°/~22°(设计 §4)
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

      // 9. 雪:慢速圆点,轻微左右摆(设计 §4)
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

      // 10. 雷暴闪电:随机 6–18s 一次,2–3 帧打亮 + 分叉闪电线 + 楼群边缘高亮(设计 §4)
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
          while (py < H * (HORIZON - 0.08)) {
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
          // 楼群边缘高亮:近层楼顶折线描边
          ctx.strokeStyle = 'rgba(200,220,255,0.55)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(0, H);
          for (const [qx, qy] of scene.outline) ctx.lineTo(qx, qy);
          ctx.lineTo(W, H);
          ctx.stroke();
          flashLeft--;
        }
      } else {
        nextStrikeAt = 0;
        flashLeft = 0;
      }

      // 11. vignette
      const vig = ctx.createRadialGradient(
        W / 2, H * 0.45, Math.min(W, H) * 0.45,
        W / 2, H * 0.45, Math.max(W, H) * 0.75,
      );
      vig.addColorStop(0, 'rgba(0,0,0,0)');
      vig.addColorStop(1, 'rgba(0,0,0,0.38)');
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, W, H);

      // 12. 整体压暗幕(设计 §5:白天 0.45 → 夜 0.35,随 t 插值,保前景文字对比度)
      ctx.fillStyle = `rgba(6,8,15,${p.dim.toFixed(3)})`;
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
