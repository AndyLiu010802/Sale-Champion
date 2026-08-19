'use client';

import { motion } from 'framer-motion';
import type { GoalProgress } from '@/lib/types';
import { formatValue } from '@/lib/format';

const METRIC_LABELS: Record<GoalProgress['metric'], string> = {
  sales_count: 'SALES',
  gci: 'GCI',
  listings: 'LISTINGS',
};

const PERIOD_LABELS: Record<GoalProgress['period'], string> = {
  month: 'THIS MONTH',
  quarter: 'THIS QUARTER',
};

export default function GoalSlide({ goals }: { goals: GoalProgress[] }) {
  return (
    <div className="flex h-full w-full flex-col px-24 py-12">
      <h1 className="font-display text-6xl text-neon neon-text">TEAM GOALS</h1>
      {goals.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-4xl text-muted">No data yet</p>
        </div>
      ) : (
        <div className="mt-12 flex flex-1 flex-col justify-center gap-10">
          {goals.slice(0, 4).map((goal, i) => (
            <motion.div
              key={goal.id}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.12, duration: 0.4 }}
              className="rounded-xl bg-panel/70 p-10 backdrop-blur-sm"
            >
              <div className="flex items-baseline justify-between">
                <h2 className="font-heading text-4xl text-ink">
                  {METRIC_LABELS[goal.metric]}{' '}
                  <span className="text-2xl text-muted">{PERIOD_LABELS[goal.period]}</span>
                </h2>
                <span className="font-display text-3xl text-ink">
                  {formatValue(goal.metric, goal.currentValue)}{' '}
                  <span className="text-muted">/ {formatValue(goal.metric, goal.targetValue)}</span>
                </span>
              </div>
              <div className="mt-6 flex items-center gap-8">
                <div className="h-10 flex-1 overflow-hidden rounded-full bg-panel-2">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-neon to-neon-purple"
                    style={{ boxShadow: '0 0 16px rgba(0, 229, 255, 0.8)' }}
                    initial={{ width: 0 }}
                    animate={{ width: `${goal.percent}%` }}
                    transition={{ delay: 0.3 + i * 0.12, duration: 0.8, ease: 'easeOut' }}
                  />
                </div>
                <span className="w-40 text-right font-display text-5xl text-neon neon-text">
                  {goal.percent}%
                </span>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
