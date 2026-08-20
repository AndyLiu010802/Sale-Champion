'use client';

import { useEffect, useRef } from 'react';
import { phaseFromClock, sunPosition, nightProgress } from '@/lib/scene/palette';
import { effectsFromWeather } from '@/lib/scene/weather';
import { scenePaint } from '@/lib/scene/paint';
import { windowLitSchedule } from '@/lib/scene/windowLights';
import { slotColors } from '@/lib/scene/slots';
import { SCENE_SVG } from '@/lib/scene/sceneSvg';
import { mulberry32, rgba } from '@/lib/scene/types';
import type { TvWeather } from '@/lib/types';

const CACHE_T_STEP = 0.015;    // 沿用现有阈值
const WINDOW_LIT_STEP = 0.02;
const TICK_MS = 1000;          // 每秒查一次是否跨档,跨了才写变量

// —— canvas 特效层性能约束(沿用天际线设计 §2 的值;SVG 场景设计 §5)——
const MAX_DPR = 1.5;            // 电视浏览器:DPR 封顶
const FRAME_MIN_MS = 30;        // rAF 隔帧 → ~30fps
const MAX_RAIN = 300;
const MAX_SNOW = 150;

type Drop = { x: number; y: number; v: number };
type Flake = { x: number; y: number; v: number; drift: number; r: number };
type Particles = { rain: Drop[]; snow: Flake[] };

function buildParticles(w: number, h: number): Particles {
  const rainRand = mulberry32(555);
  const rain: Drop[] = Array.from({ length: MAX_RAIN }, () => ({
    x: rainRand() * w, y: rainRand() * h, v: 900 + rainRand() * 500,
  }));
  const snowRand = mulberry32(666);
  const snow: Flake[] = Array.from({ length: MAX_SNOW }, () => ({
    x: snowRand() * w, y: snowRand() * h, v: 45 + snowRand() * 55,
    drift: snowRand() * Math.PI * 2, r: 1.2 + snowRand() * 1.8,
  }));
  return { rain, snow };
}

/**
 * TV 场景背景装配器(SVG 场景设计 §3):SVG 美术稿经 dangerouslySetInnerHTML 内联进 DOM
 * (React 视之为单节点,958 个元素不进 reconciliation),由 CSS 变量(色槽,§4)与
 * transform/opacity 动画(云/碎光/波纹/倒影,§5)驱动。上层叠一块 canvas 只画天气
 * 特效(雨/雪/雾/雷暴闪电/vignette/整体压暗幕,逐字搬自旧 SkylineBackground——§5 补记)。
 * 组件对外 API { weather, paused } 不变(TvApp 零改动);weather=null → 按"晴"+ 回落
 * 日出日落渲染;paused=true(庆祝全屏)期间 SVG 动画整体暂停(is-paused)且 canvas rAF
 * 循环停止,画面停在最后一帧。
 */
export default function SceneBackground({
  weather,
  paused,
}: {
  weather: TvWeather | null;
  paused: boolean;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const weatherRef = useRef<TvWeather | null>(weather);
  useEffect(() => { weatherRef.current = weather; }, [weather]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let key = '';
    const apply = () => {
      const w = weatherRef.current;
      const fx = effectsFromWeather(w?.weatherCode ?? 0, w?.windSpeedKmh ?? 0);
      const now = new Date();
      const t = phaseFromClock(now, w?.sunrise, w?.sunset);
      const lit = windowLitSchedule(now);

      // 日/月位置:每次 tick 都写,不进下面的记忆化——夜里 t 整段恒 1(NIGHT 关键帧是
      // 平的),月弧要靠 nightProgress(now, …) 按真实时钟连续推进,锁进 t/lit 记忆化的话
      // 整夜 key 不变,月亮会钉死不动(此前 Task 7 已诊断过一次"记忆化钉住旧状态"的坑,
      // 这里是同一类问题的另一处)。
      const body = sunPosition(t, nightProgress(now, w?.sunrise, w?.sunset));
      root.style.setProperty('--body-x', `${(body.x * 1832).toFixed(1)}px`);
      root.style.setProperty('--body-y', `${(body.y * 859 * 0.6).toFixed(1)}px`);
      // 云遮日:旧的 canvas 实现按 `1 - cloudiness * 0.5` 压暗日轮,SVG 版最初只有"在天上 /
      // 落山"两态,结果暴雨天(云量 0.95)太阳照样刺眼——目验截图时抓到的。沿用同一条系数。
      root.style.setProperty(
        '--body-op',
        body.y < 1.04 ? (1 - fx.cloudiness * 0.5).toFixed(3) : '0',
      );

      const next = `${Math.round(t / CACHE_T_STEP)}|${Math.round(lit / WINDOW_LIT_STEP)}`
        + `|${Math.round(fx.cloudiness * 10)}`;
      if (next === key) return;
      key = next;
      const sp = scenePaint(t, fx);
      sp.light.windowLit = lit;
      for (const [name, value] of Object.entries(slotColors(sp))) {
        root.style.setProperty(name, value);
      }
      // 灯光整体亮度:山坡房屋与城市窗户共用窗灯作息。灯位/云朵可见性本身不再由 JS 逐元素
      // toggle(见 globals.css .scene-lamp/.scene-cloud 的 CSS 阈值比较)——只需要写下面
      // 这几个系数,标记里烧好的 --t/--i 会自己跟 --lit/--cloud-count 比较。
      root.style.setProperty('--lit', String(lit));
      root.style.setProperty('--cloud-count', String(2 + Math.round(fx.cloudiness * 6)));
      root.style.setProperty('--star', String(sp.sky.star * (1 - fx.cloudiness * 0.85)));
      // 日/月圆盘与光晕色:直接读 ScenePaint,不进色槽系统(见 build-scene.ts 的
      // NON_SLOT_GROUPS 注释)。
      root.style.setProperty('--celestial-glow', rgba(sp.sky.glow, 1));
      root.style.setProperty('--celestial-body', rgba(sp.sky.sun, 1));
    };
    apply();
    const id = window.setInterval(apply, TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  // —— 天气特效 canvas(SVG 场景设计 §5;逐字搬自旧 SkylineBackground 第 7–12 段)——
  useEffect(() => {
    if (paused) return; // 覆盖层透明,画面停在最后一帧即可;恢复时 effect 重启循环
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let W = 0;
    let H = 0;
    let dpr = 1;
    let particles: Particles = buildParticles(1, 1);
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
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      particles = buildParticles(W, H);
    };
    resize();
    window.addEventListener('resize', resize);

    const render = (nowMs: number) => {
      raf = requestAnimationFrame(render);
      if (nowMs - lastFrame < FRAME_MIN_MS) return; // 隔帧 ~30fps
      const dt = Math.min((nowMs - lastTick) / 1000, 0.1);
      lastFrame = nowMs;
      lastTick = nowMs;

      // canvas 只叠加天气特效(SVG 层已经画好场景本身),每帧先清空避免残留。
      ctx.clearRect(0, 0, W, H);

      const weatherNow = weatherRef.current;
      // weather=null → code 0(晴)+ 风 0;sunrise/sunset undefined → 06:30/19:00 回落。
      const fx = effectsFromWeather(weatherNow?.weatherCode ?? 0, weatherNow?.windSpeedKmh ?? 0);
      const now = new Date();
      const t = phaseFromClock(now, weatherNow?.sunrise, weatherNow?.sunset);
      const sp = scenePaint(t, fx);

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
          const d = particles.rain[i];
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
        for (const f of particles.snow) {
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

      // 10. 雷暴闪电:随机 6–18s 一次,2–3 帧打亮 + 分叉闪电线 + 山体一帧高亮(沿用改造)
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
          // 山体一帧高亮(替代旧实现描边 MOUNTAIN.farRidge——那份几何随画师一起删了):
          // 直接给 SVG 的 #mountains 分组临时加高亮类,90ms 后自动摘掉。
          const mountains = rootRef.current?.querySelector('#mountains');
          mountains?.classList.add('scene-flash');
          window.setTimeout(() => mountains?.classList.remove('scene-flash'), 90);
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
    <>
      <div
        ref={rootRef}
        aria-hidden="true"
        className={`scene-root pointer-events-none fixed inset-0 z-0 h-full w-full${paused ? ' is-paused' : ''}`}
        dangerouslySetInnerHTML={{ __html: SCENE_SVG }}
      />
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 h-full w-full"
      />
    </>
  );
}
