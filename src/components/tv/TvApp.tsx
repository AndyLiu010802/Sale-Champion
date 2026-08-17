'use client';

import { useCallback, useEffect, useReducer, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTvSocket } from '@/hooks/useTvSocket';
import { carouselReducer, initCarousel, type CarouselSlide } from '@/lib/carousel';
import type { TvStateResponse } from '@/lib/types';
import PairingScreen from '@/components/tv/PairingScreen';
import StartOverlay from '@/components/tv/StartOverlay';
import OfflineBadge from '@/components/tv/OfflineBadge';
import CelebrationOverlay from '@/components/tv/CelebrationOverlay';
import LeaderboardSlide from '@/components/tv/slides/LeaderboardSlide';
import GoalSlide from '@/components/tv/slides/GoalSlide';
import ListingsSlide from '@/components/tv/slides/ListingsSlide';
import AnnouncementSlide from '@/components/tv/slides/AnnouncementSlide';

/** Order-sensitive shallow compare so an identical settings payload never resets the current slide's countdown. */
function sameSlides(a: CarouselSlide[], b: CarouselSlide[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((s, i) => s.key === b[i].key && s.durationSec === b[i].durationSec);
}

export default function TvApp() {
  const [tvState, setTvState] = useState<TvStateResponse | null>(null);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [carousel, dispatch] = useReducer(carouselReducer, [], initCarousel);

  // Mirrors `carousel` for refreshState to read without becoming a dependency of it —
  // keeps refreshState's identity stable across ticks/celebrations while still letting
  // it compare against the latest slides before dispatching.
  const carouselRef = useRef(carousel);
  useEffect(() => {
    carouselRef.current = carousel;
  }, [carousel]);

  const refreshState = useCallback(async () => {
    const token = localStorage.getItem('tv_device_token');
    if (!token) return;
    try {
      const res = await fetch('/api/tv/state', { headers: { 'x-device-token': token } });
      if (!res.ok) return;
      const json = (await res.json()) as { data: TvStateResponse };
      setTvState(json.data);
      const nextSlides = json.data.settings.slides
        .filter((s) => s.enabled)
        .map((s) => ({ key: s.key, durationSec: s.durationSec }));
      // Guard: skip the dispatch when slides are unchanged so a data.updated event
      // (which triggers this refresh) doesn't reset the current slide's countdown.
      if (!sameSlides(carouselRef.current.slides, nextSlides)) {
        dispatch({ type: 'setSlides', slides: nextSlides });
      }
    } catch (err) {
      console.warn('Failed to fetch TV state', err);
    }
  }, []);

  const socket = useTvSocket({
    onCelebration: (payload) => dispatch({ type: 'celebration', payload }),
    onDataUpdated: () => {
      void refreshState();
    },
    onConfigUpdated: () => {
      void refreshState();
    },
    onPaired: () => {
      void refreshState();
    },
    onUnpaired: () => setTvState(null),
  });

  useEffect(() => {
    if (socket.phase === 'paired') void refreshState();
  }, [socket.phase, refreshState]);

  // Hourly fallback refresh: keeps leaderboard period rollover (new week/month/
  // quarter) and periodLabel current even when no data events arrive (spec §5/§12).
  useEffect(() => {
    if (socket.phase !== 'paired') return;
    const timer = setInterval(() => void refreshState(), 60 * 60 * 1000);
    return () => clearInterval(timer);
  }, [socket.phase, refreshState]);

  // Keep rotating while offline too — cached data + OfflineBadge (spec §8);
  // only connecting/pairing (no data yet) and locked audio stop the carousel.
  useEffect(() => {
    if (!audioUnlocked || (socket.phase !== 'paired' && socket.phase !== 'offline')) return;
    const timer = setInterval(() => dispatch({ type: 'tick', dtMs: 250 }), 250);
    return () => clearInterval(timer);
  }, [audioUnlocked, socket.phase]);

  const handleCelebrationDone = useCallback(() => dispatch({ type: 'celebrationDone' }), []);

  if (socket.phase === 'connecting' || socket.phase === 'pairing') {
    return <PairingScreen pairCode={socket.pairCode} />;
  }

  const currentSlide = carousel.slides.length > 0 ? carousel.slides[carousel.index] : null;

  let slideContent: ReactNode = null;
  if (!tvState || !currentSlide) {
    slideContent = (
      <div className="flex h-full items-center justify-center">
        <p className="font-display text-5xl text-muted">SALES CHAMPIONS TV</p>
      </div>
    );
  } else {
    switch (currentSlide.key) {
      case 'leaderboard_sales_count':
        slideContent = (
          <LeaderboardSlide
            title="SALES CHAMPIONS"
            metric="sales_count"
            entries={tvState.leaderboards.sales_count}
            periodLabel={tvState.periodLabel}
          />
        );
        break;
      case 'leaderboard_gci':
        slideContent = (
          <LeaderboardSlide
            title="TOP EARNERS"
            metric="gci"
            entries={tvState.leaderboards.gci}
            periodLabel={tvState.periodLabel}
          />
        );
        break;
      case 'leaderboard_listings':
        slideContent = (
          <LeaderboardSlide
            title="LISTING LEGENDS"
            metric="listings"
            entries={tvState.leaderboards.listings}
            periodLabel={tvState.periodLabel}
          />
        );
        break;
      case 'goal_progress':
        slideContent = <GoalSlide goals={tvState.goals} />;
        break;
      case 'listings':
        slideContent = <ListingsSlide listings={tvState.listings} />;
        break;
      case 'announcements':
        slideContent = <AnnouncementSlide announcements={tvState.announcements.slice(0, 5)} />;
        break;
    }
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-bg">
      <AnimatePresence mode="wait">
        <motion.div
          key={currentSlide ? `${currentSlide.key}-${carousel.index}` : 'idle'}
          className="h-full w-full"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
        >
          {slideContent}
        </motion.div>
      </AnimatePresence>

      <AnimatePresence>
        {carousel.mode === 'celebrate' && carousel.current ? (
          <CelebrationOverlay
            key={carousel.current.saleId}
            payload={carousel.current}
            volume={tvState ? tvState.settings.volume : 0.8}
            onDone={handleCelebrationDone}
          />
        ) : null}
      </AnimatePresence>

      {!audioUnlocked ? <StartOverlay onStart={() => setAudioUnlocked(true)} /> : null}
      {socket.phase === 'offline' ? <OfflineBadge /> : null}
    </div>
  );
}
