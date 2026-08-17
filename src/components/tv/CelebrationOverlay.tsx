'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import type { CelebrationPayload } from '@/lib/ws/protocol';
import { formatMoney } from '@/lib/format';
import { playAnthem } from '@/components/tv/audio';
import { BIRTHDAY_ANTHEM_ID } from '@/lib/audio/anthems';

type Particle = { left: number; size: number; duration: number; delay: number; color: string };

function Avatar({ name, photoUrl }: { name: string; photoUrl: string | null }) {
  const [failed, setFailed] = useState(false);
  if (photoUrl && !failed) {
    return (
      <img
        src={photoUrl}
        alt={name}
        className="h-48 w-48 rounded-full border-4 border-neon object-cover"
        style={{ boxShadow: '0 0 32px rgba(0, 229, 255, 0.8)' }}
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <span
      className="flex h-48 w-48 items-center justify-center rounded-full border-4 border-neon bg-panel-2 font-display text-7xl text-neon"
      style={{ boxShadow: '0 0 32px rgba(0, 229, 255, 0.8)' }}
    >
      {(Array.from(name)[0] ?? '?').toUpperCase()}
    </span>
  );
}

export default function CelebrationOverlay({
  payload,
  volume,
  onDone,
}: {
  payload: CelebrationPayload;
  volume: number;
  onDone(): void;
}) {
  useEffect(() => {
    // Birthday broadcasts always use the built-in birthday melody; sales keep the
    // resolved agent/default anthem. Either way the melody plays exactly once
    // (audio.ts no longer loops) while the overlay runs its full durationSec.
    const anthemUrl =
      payload.kind === 'birthday' ? BIRTHDAY_ANTHEM_ID : payload.anthemUrl ?? 'builtin:victory';
    const player = playAnthem(anthemUrl, volume);
    const timer = setTimeout(() => {
      player.stop();
      onDone();
    }, payload.durationSec * 1000);
    return () => {
      clearTimeout(timer);
      player.stop();
    };
  }, [payload, volume, onDone]);

  const particles = useMemo<Particle[]>(
    () =>
      Array.from({ length: 20 }, (_, i) => ({
        left: (i * 37 + 11) % 100,
        size: 10 + (i % 4) * 6,
        duration: 4 + (i % 5),
        delay: (i * 0.4) % 3,
        color: i % 2 === 0 ? '#00e5ff' : '#ffc800',
      })),
    [],
  );

  const isBirthday = payload.kind === 'birthday';

  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden"
      style={{
        background: isBirthday
          ? 'radial-gradient(circle at 50% 40%, rgba(255, 105, 180, 0.18), #0a0e1a 70%)'
          : 'radial-gradient(circle at 50% 40%, rgba(0, 229, 255, 0.18), #0a0e1a 70%)',
      }}
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.05 }}
      transition={{ duration: 0.5 }}
    >
      <style>{`
        @keyframes celebration-float {
          from { transform: translateY(0) rotate(0deg); opacity: 1; }
          to { transform: translateY(-110vh) rotate(720deg); opacity: 0; }
        }
      `}</style>
      {particles.map((p, i) => (
        <span
          key={i}
          className="absolute bottom-0 block"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            animation: `celebration-float ${p.duration}s linear ${p.delay}s infinite`,
          }}
        />
      ))}
      {payload.kind === 'birthday' ? (
        <>
          <p
            className="font-display text-8xl text-gold neon-text"
            style={{ textShadow: '0 0 18px rgba(255, 200, 0, 0.9), 0 0 42px rgba(255, 105, 180, 0.8)' }}
          >
            🎂 HAPPY BIRTHDAY 🎂
          </p>
          <div className="mt-12">
            <Avatar key={payload.photoUrl ?? 'none'} name={payload.name} photoUrl={payload.photoUrl} />
          </div>
          <p className="mt-10 font-display text-9xl text-neon neon-text">{payload.name}</p>
        </>
      ) : (
        <>
          <p className="font-display text-8xl text-gold neon-text">🎉 SOLD! 🎉</p>
          <div className="mt-12">
            <Avatar key={payload.agentPhotoUrl ?? 'none'} name={payload.agentName} photoUrl={payload.agentPhotoUrl} />
          </div>
          <p className="mt-8 font-display text-7xl text-neon neon-text">{payload.agentName}</p>
          <p className="mt-6 font-heading text-4xl text-ink">{payload.address}</p>
          <p className="mt-6 font-display text-8xl text-money neon-text">{formatMoney(payload.salePriceCents)}</p>
        </>
      )}
    </motion.div>
  );
}
