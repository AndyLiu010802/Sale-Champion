'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import type { LeaderboardEntry, Metric } from '@/lib/types';
import { formatValue } from '@/lib/format';

/** rank 彩色左边:只染 border-left(.glass 会给四边 1px 白描边,四边色类会把它整圈染金)。 */
function rowBorderClass(rank: number): string {
  if (rank === 1) return 'border-l-gold';
  if (rank === 2) return 'border-l-silver';
  if (rank === 3) return 'border-l-bronze';
  return 'border-l-panel-2';
}

function rankBadgeClass(rank: number): string {
  if (rank === 1) return 'text-gold neon-text';
  if (rank === 2) return 'text-silver neon-text';
  if (rank === 3) return 'text-bronze neon-text';
  return 'text-muted';
}

function Avatar({ name, photoUrl }: { name: string; photoUrl: string | null }) {
  const [failed, setFailed] = useState(false);
  if (photoUrl && !failed) {
    return (
      <img
        src={photoUrl}
        alt={name}
        className="h-14 w-14 rounded-full object-cover"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <span className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-neon bg-panel-2 font-display text-2xl text-neon">
      {(Array.from(name)[0] ?? '?').toUpperCase()}
    </span>
  );
}

export default function LeaderboardSlide({
  title,
  metric,
  entries,
  periodLabel,
}: {
  title: string;
  metric: Metric;
  entries: LeaderboardEntry[];
  periodLabel: string;
}) {
  return (
    <div className="flex h-full w-full flex-col px-24 py-12">
      <div className="flex items-baseline justify-between">
        <h1 className="font-display text-6xl text-neon neon-text">{title}</h1>
        <span className="font-heading text-3xl text-muted">{periodLabel}</span>
      </div>
      {entries.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-4xl text-muted">No data yet</p>
        </div>
      ) : (
        <div className="mt-10 flex flex-1 flex-col justify-start gap-3 overflow-hidden">
          {entries.map((entry, i) => (
            <motion.div
              key={entry.agentId}
              layout
              initial={{ opacity: 0, x: -40 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.06, duration: 0.35 }}
              className={`glass flex h-[72px] shrink-0 items-center gap-8 rounded-xl border-l-4 px-8 ${rowBorderClass(entry.rank)}`}
            >
              <span className={`w-16 text-center font-display text-4xl ${rankBadgeClass(entry.rank)}`}>
                {entry.rank}
              </span>
              <Avatar key={entry.photoUrl ?? 'none'} name={entry.name} photoUrl={entry.photoUrl} />
              <span className="flex-1 truncate font-heading text-4xl text-ink">{entry.name}</span>
              <span className="font-display text-4xl text-money neon-text">
                {formatValue(metric, entry.value)}
              </span>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
