'use client';

import { motion } from 'framer-motion';
import type { GoalProgress } from '@/lib/types';
import { formatValue } from '@/lib/format';
import GradientValue from '@/components/tv/GradientValue';
import ProgressRing from '@/components/tv/ProgressRing';
import { GOAL_GRADIENTS } from '@/lib/goals/palette';

const METRIC_LABELS: Record<GoalProgress['metric'], string> = {
  sales_count: 'SALES',
  gci: 'GCI',
  listings: 'LISTINGS',
};

const PERIOD_LABELS: Record<GoalProgress['period'], string> = {
  month: 'THIS MONTH',
  quarter: 'THIS QUARTER',
};

/** 环径按目标数自适应(圆环设计 §1):1 = 英雄大环,2 = 并排,3–4 = 2×2 紧凑。 */
function ringSize(count: number): number {
  if (count === 1) return 420;
  if (count === 2) return 340;
  return 260;
}

/** 显示百分比:API 的 percent 封顶 100(旧横条约定),圆环设计 §2 要求超额"如实显示
 *  (如 128%)"——用已有的 currentValue/targetValue 纯客户端还原;服务端计算逻辑不动。 */
function displayPct(goal: GoalProgress): number {
  return goal.targetValue > 0
    ? Math.round((goal.currentValue / goal.targetValue) * 100)
    : goal.percent;
}

export default function GoalSlide({ goals }: { goals: GoalProgress[] }) {
  const shown = goals.slice(0, 4);
  const compact = shown.length >= 3; // 2×2 网格档
  const size = ringSize(shown.length);
  const pctText = shown.length === 1 ? 'text-8xl' : compact ? 'text-5xl' : 'text-7xl';
  return (
    <div className="flex h-full w-full flex-col px-24 py-12">
      <h1 className="gold-title font-display text-6xl">TEAM GOALS</h1>
      {shown.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-4xl text-muted">No data yet</p>
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center">
          <div className={compact ? 'grid grid-cols-2 gap-8' : 'flex items-stretch justify-center gap-14'}>
            {shown.map((goal, i) => {
              const pct = displayPct(goal);
              const reached = pct >= 100;
              return (
                <motion.div
                  key={goal.id}
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.12, duration: 0.4 }}
                  className={`glass flex flex-col items-center rounded-3xl ${compact ? 'px-10 py-6' : 'px-14 py-10'}`}
                >
                  <h2 className={`font-heading font-bold tracking-[0.18em] text-ink ${compact ? 'text-2xl' : 'text-3xl'}`}>
                    {METRIC_LABELS[goal.metric]}
                    <span className={`ml-3 text-muted ${compact ? 'text-lg' : 'text-xl'}`}>
                      {PERIOD_LABELS[goal.period]}
                    </span>
                  </h2>
                  <div className={`relative ${compact ? 'mt-3' : 'mt-6'}`} style={{ width: size, height: size }}>
                    <ProgressRing pct={pct} size={size} reached={reached} color={goal.color} />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className={`font-display ${pctText}`}>
                        {reached ? (
                          <span className="gold-title">{pct}%</span>
                        ) : (
                          <GradientValue value={`${pct}%`} gradient={GOAL_GRADIENTS[goal.color]} />
                        )}
                      </span>
                    </div>
                  </div>
                  <p className={`font-display text-ink ${compact ? 'mt-3 text-2xl' : 'mt-6 text-3xl'}`}>
                    {formatValue(goal.metric, goal.currentValue)}
                    <span className="text-muted"> / {formatValue(goal.metric, goal.targetValue)}</span>
                  </p>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
