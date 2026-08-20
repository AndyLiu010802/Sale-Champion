'use client';

import { useEffect, useRef } from 'react';
import { phaseFromClock } from '@/lib/scene/palette';
import { effectsFromWeather } from '@/lib/scene/weather';
import { scenePaint } from '@/lib/scene/paint';
import { windowLitSchedule } from '@/lib/scene/windowLights';
import { slotColors } from '@/lib/scene/slots';
import { SCENE_SVG } from '@/lib/scene/sceneSvg';
import type { TvWeather } from '@/lib/types';

const CACHE_T_STEP = 0.015;    // 沿用现有阈值
const WINDOW_LIT_STEP = 0.02;
const TICK_MS = 1000;          // 每秒查一次是否跨档,跨了才写变量

/**
 * TV 场景背景装配器(SVG 场景设计 §3):SVG 美术稿经 dangerouslySetInnerHTML 内联进 DOM
 * (React 视之为单节点,958 个元素不进 reconciliation),由 CSS 变量(色槽,§4)与
 * transform/opacity 动画(云/碎光/波纹/倒影,§5)驱动。canvas 天气特效层由 Task 5 加。
 * 组件对外 API { weather, paused } 不变(TvApp 零改动);weather=null → 按"晴"+ 回落
 * 日出日落渲染;paused=true(庆祝全屏)期间动画整体暂停(见 globals.css .is-paused)。
 */
export default function SceneBackground({
  weather,
  paused,
}: {
  weather: TvWeather | null;
  paused: boolean;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
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
      const next = `${Math.round(t / CACHE_T_STEP)}|${Math.round(lit / WINDOW_LIT_STEP)}`
        + `|${Math.round(fx.cloudiness * 10)}`;
      if (next === key) return;
      key = next;
      const sp = scenePaint(t, fx);
      sp.light.windowLit = lit;
      for (const [name, value] of Object.entries(slotColors(sp))) {
        root.style.setProperty(name, value);
      }
      // 灯光整体亮度:山坡房屋与城市窗户共用窗灯作息
      root.style.setProperty('--lit', String(lit));
      // 云量决定显示几朵云(2–8)
      root.style.setProperty('--cloud-count', String(2 + Math.round(fx.cloudiness * 6)));
      root.style.setProperty('--star', String(sp.sky.star * (1 - fx.cloudiness * 0.85)));

      // 灯位不能用整组透明度(见 SceneBackground 设计约束):windowLitSchedule 返回的是
      // 每盏灯独立点亮的概率,逐元素伯努利判定才能保住"白天零星两三盏"的细节。
      root.querySelectorAll<HTMLElement>('.scene-lamp').forEach((el) => {
        el.style.display = Number(el.dataset.t) < lit ? '' : 'none';
      });

      // 云的显示朵数:构建期已给每朵云加了 data-i,用 JS 直接控制。
      const count = 2 + Math.round(fx.cloudiness * 6);
      root.querySelectorAll<HTMLElement>('.scene-cloud').forEach((el, i) => {
        el.style.display = i < count ? '' : 'none';
      });
    };
    apply();
    const id = window.setInterval(apply, TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div
      ref={rootRef}
      aria-hidden="true"
      className={`scene-root pointer-events-none fixed inset-0 z-0 h-full w-full${paused ? ' is-paused' : ''}`}
      dangerouslySetInnerHTML={{ __html: SCENE_SVG }}
    />
  );
}
