'use client';

import { useEffect, useState } from 'react';
import { GOAL_GRADIENTS, REACHED_GRADIENT, type GoalColor } from '@/lib/goals/palette';

// 目标页 SVG 圆环(goal-rings 设计 §2):深色半透轨道圆 + 品牌渐变描边,起点 12 点方向,
// 挂载时 strokeDashoffset 从满偏移过渡到实际百分比(~1.2s ease-out;轮播每次切入
// GoalSlide 都重挂载,入场必现)。≥100%(reached)换金色渐变 + 环外柔和金晕;
// 超 100% 环封顶画满、不绕第二圈(百分比文本由 GoalSlide 如实显示)。
// 入场动画一次性(mount 触发的 CSS transition),无持续动画,电视性能无忧。
//
// 渐变 defs 放组件内:多个实例会重复渲染同 id 的 defs,浏览器解析到首个即用——
// 内容完全相同,引用安全(设计 §2 允许组件内 defs)。id 里带上色名(2026-08-21 起每个
// 目标一条渐变),不同颜色的环拿到的是不同 id,同色的环拿到的 defs 内容仍旧一致。

const STROKE_RATIO = 0.075; // 描边宽 ≈ 环径的 7.5%

export default function ProgressRing({
  pct,
  size,
  reached,
  color,
}: {
  pct: number;      // 真实百分比(可 >100;环形填充自身封顶 100)
  size: number;     // 外径 px
  reached: boolean; // ≥100% 达成态(金色)
  color: GoalColor; // 未达成时的渐变(达成后一律金色 —— 金色是达成的信号,不参与选色)
}) {
  // mount 后下一帧才把 dashoffset 换成目标值 → 触发 CSS transition 入场。
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const stroke = Math.round(size * STROKE_RATIO);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const fill = Math.min(100, Math.max(0, pct)) / 100; // 环封顶(设计 §2)
  const gradientId = reached ? 'ring-grad-gold' : `ring-grad-${color}`;
  const stops = GOAL_GRADIENTS[color].stops;
  const gold = REACHED_GRADIENT.stops;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="-rotate-90"
      style={reached ? { filter: 'drop-shadow(0 0 18px rgba(245, 196, 69, 0.45))' } : undefined}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`ring-grad-${color}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={stops[0]} />
          <stop offset="55%" stopColor={stops[1]} />
          <stop offset="100%" stopColor={stops[2]} />
        </linearGradient>
        <linearGradient id="ring-grad-gold" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={gold[0]} />
          <stop offset="45%" stopColor={gold[1]} />
          <stop offset="100%" stopColor={gold[2]} />
        </linearGradient>
      </defs>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="rgba(10, 16, 30, 0.55)"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={`url(#${gradientId})`}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={entered ? c * (1 - fill) : c}
        style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(0.33, 1, 0.68, 1)' }}
      />
    </svg>
  );
}
