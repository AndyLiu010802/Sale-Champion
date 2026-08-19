'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import type { TvAnnouncement } from '@/lib/types';

function AnnouncementImage({ imageUrl, title }: { imageUrl: string; title: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <img
      src={imageUrl}
      alt={title}
      className="h-40 w-64 rounded-lg object-cover"
      onError={() => setFailed(true)}
    />
  );
}

export default function AnnouncementSlide({ announcements }: { announcements: TvAnnouncement[] }) {
  return (
    <div className="flex h-full w-full flex-col px-24 py-12">
      <h1 className="font-display text-6xl text-neon neon-text">TEAM NEWS</h1>
      {announcements.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-4xl text-muted">No data yet</p>
        </div>
      ) : (
        <div className="mt-10 flex flex-1 flex-col gap-6 overflow-hidden">
          {announcements.map((a, i) => (
            <motion.div
              key={a.id}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1, duration: 0.35 }}
              className="glass flex h-[224px] shrink-0 items-start gap-8 rounded-2xl p-8"
            >
              <div className="flex-1">
                <h2 className="truncate font-heading text-4xl text-ink">{a.title}</h2>
                {a.body ? (
                  <p className="mt-3 line-clamp-2 text-2xl leading-relaxed text-muted">{a.body}</p>
                ) : null}
              </div>
              {a.imageUrl ? (
                <AnnouncementImage key={a.imageUrl ?? 'none'} imageUrl={a.imageUrl} title={a.title} />
              ) : null}
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
