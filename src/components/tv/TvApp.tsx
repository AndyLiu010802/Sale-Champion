'use client';

import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTvSocket } from '@/hooks/useTvSocket';
import { carouselReducer, initCarousel, type CarouselSlide, type QueuedCelebration } from '@/lib/carousel';
import { expandSlides, gridPageSize, pageSize, pageSlice } from '@/lib/pagination';
import type { SlideKey } from '@/lib/settings';
import type { TvStateResponse } from '@/lib/types';
import PairingScreen from '@/components/tv/PairingScreen';
import StartOverlay from '@/components/tv/StartOverlay';
import OfflineBadge from '@/components/tv/OfflineBadge';
import CelebrationOverlay from '@/components/tv/CelebrationOverlay';
import LeaderboardSlide from '@/components/tv/slides/LeaderboardSlide';
import GoalSlide from '@/components/tv/slides/GoalSlide';
import ListingsSlide from '@/components/tv/slides/ListingsSlide';
import AnnouncementSlide from '@/components/tv/slides/AnnouncementSlide';

// —— 每页容量常量:像素值与各 slide 组件的定高 CSS 同步,改组件样式必须同步这里 ——
// LeaderboardSlide:行 h-[72px] + 行间 gap-3(12px)。
const LEADERBOARD_ITEM_PX = 84;
// ListingsSlide:卡 h-[400px] + gap-6(24px);列数固定 4(grid-cols-4)。
const LISTINGS_ROW_PX = 424;
const LISTINGS_COLUMNS = 4;
// AnnouncementSlide:卡 h-[224px] + 卡间 gap-6(24px)。
const ANNOUNCEMENT_ITEM_PX = 248;
// 三个分页板块头部预留一致:py-12 上 48 + 标题 text-6xl 60 + mt-10 40 + py-12 下 48。
const SLIDE_RESERVED_PX = 196;
// 公告安全封顶(设计 §4:原 slice(0,5) 截断改为 cap 40 后分页)。
const ANNOUNCEMENTS_CAP = 40;

/** Order-sensitive shallow compare so an identical settings payload never resets the
 *  current slide's countdown. 展开队列后比较维度含 page/pageCount(设计 §2)。 */
function sameSlides(a: CarouselSlide[], b: CarouselSlide[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((s, i) =>
    s.key === b[i].key && s.durationSec === b[i].durationSec
    && s.page === b[i].page && s.pageCount === b[i].pageCount);
}

/** 把 slide 的 page 钳制到当前真实数据量能覆盖的范围内(质量审查修复:消除
 *  数据刷新与展开队列 effect 之间的竞态——刷新后条目变少而 effect 还没来得及重算
 *  队列时,渲染仍可能读到旧的 page,若不钳制会 slice 出空数组、闪一帧空白)。
 *  角标显示仍用未钳制的 currentSlide.page/pageCount,下一拍 effect 会纠正。 */
function effectivePage(page: number, total: number, perPage: number): number {
  return Math.min(page, Math.max(0, Math.ceil(Math.max(total, 1) / perPage) - 1));
}

/** window.innerHeight,监听 resize;SSR 渲染期取 1080 兜底(客户端首次渲染即真实值)。 */
function useWindowHeight(): number {
  const [height, setHeight] = useState(() =>
    (typeof window === 'undefined' ? 1080 : window.innerHeight));
  useEffect(() => {
    const onResize = () => setHeight(window.innerHeight);
    onResize(); // 挂载即校正一次,防 SSR 兜底值残留
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return height;
}

export default function TvApp() {
  const [tvState, setTvState] = useState<TvStateResponse | null>(null);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [carousel, dispatch] = useReducer(carouselReducer, [], initCarousel);
  const windowHeight = useWindowHeight();

  // Mirrors `carousel` for the expand effect to read without becoming a dependency —
  // keeps effect identities stable across ticks/celebrations while still letting
  // them compare against the latest slides before dispatching.
  const carouselRef = useRef(carousel);
  useEffect(() => {
    carouselRef.current = carousel;
  }, [carousel]);

  // Mirrors `audioUnlocked` for the onCelebration WS handler, which must decide
  // buffer-vs-dispatch against the latest value (same ref pattern useTvSocket uses
  // internally for its own handlers).
  const audioUnlockedRef = useRef(audioUnlocked);
  useEffect(() => {
    audioUnlockedRef.current = audioUnlocked;
  }, [audioUnlocked]);

  // Celebrations that arrive before the viewer has unlocked audio (StartOverlay still
  // showing): browsers block autoplay with sound pre-gesture, so we can't play the
  // anthem yet. Buffer them here and flush into the reducer's FIFO queue once unlocked.
  const pendingCelebrations = useRef<QueuedCelebration[]>([]);

  const celebrationSeq = useRef(0);

  // Discards stale /api/tv/state responses that resolve out of order (e.g. a slow
  // response from an earlier refresh landing after a newer one already completed).
  const requestSeq = useRef(0);

  const refreshState = useCallback(async () => {
    const token = localStorage.getItem('tv_device_token');
    if (!token) return;
    const seq = ++requestSeq.current;
    try {
      const res = await fetch('/api/tv/state', { headers: { 'x-device-token': token } });
      if (seq !== requestSeq.current) return; // a newer refresh has since started; drop this one
      if (!res.ok) return;
      const json = (await res.json()) as { data: TvStateResponse };
      if (seq !== requestSeq.current) return; // re-check: a newer refresh may have started while awaiting res.json()
      // setSlides 不在这里发:展开队列由数据与窗口高度共同决定,统一交给下面的 effect。
      setTvState(json.data);
    } catch (err) {
      console.warn('Failed to fetch TV state', err);
    }
  }, []);

  const socket = useTvSocket({
    onCelebration: (payload) => {
      // clientId: locally generated stable mount key — the same sale replayed
      // twice still remounts the overlay (saleId alone could not tell them apart).
      // Counter ref, not crypto.randomUUID(): TVs open /tv over plain LAN http
      // (non-secure context) where crypto.randomUUID is unavailable.
      const queued: QueuedCelebration = { ...payload, clientId: `c${++celebrationSeq.current}` };
      if (!audioUnlockedRef.current) {
        pendingCelebrations.current.push(queued);
        return;
      }
      dispatch({ type: 'celebration', payload: queued });
    },
    onDataUpdated: () => {
      void refreshState();
    },
    onConfigUpdated: () => {
      void refreshState();
    },
    onPaired: () => {
      void refreshState();
    },
    onUnpaired: () => {
      setTvState(null);
      dispatch({ type: 'reset' });
      pendingCelebrations.current = [];
    },
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

  // 每板块每页容量(设计 §3)。三个榜单共用一套行 CSS → 同一容量;goal_progress 不分页恒 1。
  const perPage = useMemo<Record<SlideKey, number>>(() => {
    const leaderboard = pageSize(windowHeight - SLIDE_RESERVED_PX, LEADERBOARD_ITEM_PX);
    return {
      leaderboard_sales_count: leaderboard,
      leaderboard_gci: leaderboard,
      leaderboard_listings: leaderboard,
      goal_progress: 1,
      listings: gridPageSize(windowHeight - SLIDE_RESERVED_PX, LISTINGS_ROW_PX, LISTINGS_COLUMNS),
      announcements: pageSize(windowHeight - SLIDE_RESERVED_PX, ANNOUNCEMENT_ITEM_PX),
      // 过渡态(Task 3/3b):Task 4 换成按 Scorecard 行高/预留计算的真实容量。
      scorecard: 1,
      scorecard_ytd: 1,
    };
  }, [windowHeight]);

  // 数据/设置刷新或窗口高度变化 → 重算展开队列(设计 §2);sameSlides 守卫让相同内容
  // 不重置当前页倒计时(data.updated 触发的刷新常常内容不变)。
  useEffect(() => {
    if (!tvState) return;
    const counts: Record<SlideKey, number> = {
      leaderboard_sales_count: tvState.leaderboards.sales_count.length,
      leaderboard_gci: tvState.leaderboards.gci.length,
      leaderboard_listings: tvState.leaderboards.listings.length,
      goal_progress: 1, // 恒 1 页;GoalSlide 自身 slice(0,4) 不动(非目标)
      listings: tvState.listings.length,
      announcements: Math.min(tvState.announcements.length, ANNOUNCEMENTS_CAP),
      // 过渡态(Task 3/3b):恒 0 → 1 页;Task 4 接入 scorecard/scorecardYtd 的 rows.length。
      scorecard: 0,
      scorecard_ytd: 0,
    };
    const nextSlides = expandSlides(tvState.settings.slides.filter((s) => s.enabled), counts, perPage);
    if (!sameSlides(carouselRef.current.slides, nextSlides)) {
      dispatch({ type: 'setSlides', slides: nextSlides });
    }
  }, [tvState, perPage]);

  const handleCelebrationDone = useCallback(() => dispatch({ type: 'celebrationDone' }), []);

  const handleStart = useCallback(() => {
    audioUnlockedRef.current = true;
    setAudioUnlocked(true);
    // Flush anything that arrived while audio was still locked, in original order;
    // the reducer's existing FIFO queue takes it from here.
    const queued = pendingCelebrations.current;
    pendingCelebrations.current = [];
    queued.forEach((payload) => dispatch({ type: 'celebration', payload }));
  }, []);

  const currentSlide = carousel.slides.length > 0 ? carousel.slides[carousel.index] : null;

  // Memoized so a bare 250ms tick (which only changes carousel.remainingMs) doesn't
  // rebuild the slide subtree — deliberately excludes remainingMs from deps.
  const slideContent = useMemo<ReactNode>(() => {
    if (!tvState || !currentSlide) {
      return (
        <div className="flex h-full items-center justify-center">
          <p className="font-display text-5xl text-muted">SALES CHAMPIONS TV</p>
        </div>
      );
    }
    const page = currentSlide.page;
    switch (currentSlide.key) {
      case 'leaderboard_sales_count': {
        const salesCount = tvState.leaderboards.sales_count;
        return (
          <LeaderboardSlide
            title="SALES CHAMPIONS"
            metric="sales_count"
            entries={pageSlice(
              salesCount, effectivePage(page, salesCount.length, perPage.leaderboard_sales_count),
              perPage.leaderboard_sales_count,
            )}
            periodLabel={tvState.periodLabel}
          />
        );
      }
      case 'leaderboard_gci': {
        const gci = tvState.leaderboards.gci;
        return (
          <LeaderboardSlide
            title="TOP EARNERS"
            metric="gci"
            entries={pageSlice(
              gci, effectivePage(page, gci.length, perPage.leaderboard_gci), perPage.leaderboard_gci,
            )}
            periodLabel={tvState.periodLabel}
          />
        );
      }
      case 'leaderboard_listings': {
        const listingsBoard = tvState.leaderboards.listings;
        return (
          <LeaderboardSlide
            title="LISTING LEGENDS"
            metric="listings"
            entries={pageSlice(
              listingsBoard, effectivePage(page, listingsBoard.length, perPage.leaderboard_listings),
              perPage.leaderboard_listings,
            )}
            periodLabel={tvState.periodLabel}
          />
        );
      }
      case 'goal_progress':
        return <GoalSlide goals={tvState.goals} />;
      case 'listings': {
        const listings = tvState.listings;
        return (
          <ListingsSlide
            listings={pageSlice(
              listings, effectivePage(page, listings.length, perPage.listings), perPage.listings,
            )}
          />
        );
      }
      case 'announcements': {
        const announcements = tvState.announcements.slice(0, ANNOUNCEMENTS_CAP);
        return (
          <AnnouncementSlide
            announcements={pageSlice(
              announcements, effectivePage(page, announcements.length, perPage.announcements),
              perPage.announcements,
            )}
          />
        );
      }
      default:
        return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- currentSlide is derived
    // purely from carousel.index/carousel.slides, both already listed below.
  }, [carousel.index, carousel.slides, tvState, perPage]);

  if (socket.phase === 'connecting' || socket.phase === 'pairing') {
    return <PairingScreen pairCode={socket.pairCode} />;
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

      {/* 页码角标(设计 §2):多页才显示;右上角弱霓虹,避开右下 OfflineBadge。 */}
      {currentSlide && currentSlide.pageCount > 1 ? (
        <div
          className="fixed right-8 top-8 z-40 font-heading text-3xl text-muted"
          style={{ textShadow: '0 0 12px rgba(0, 229, 255, 0.35)' }}
        >
          {currentSlide.page + 1}/{currentSlide.pageCount}
        </div>
      ) : null}

      <AnimatePresence>
        {carousel.mode === 'celebrate' && carousel.current ? (
          <CelebrationOverlay
            key={carousel.current.clientId}
            payload={carousel.current}
            volume={tvState ? tvState.settings.volume : 0.8}
            onDone={handleCelebrationDone}
          />
        ) : null}
      </AnimatePresence>

      {!audioUnlocked ? <StartOverlay onStart={handleStart} /> : null}
      {socket.phase === 'offline' ? <OfflineBadge /> : null}
    </div>
  );
}
