'use client';

import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTvSocket } from '@/hooks/useTvSocket';
import { carouselReducer, initCarousel, type CarouselSlide, type QueuedCelebration } from '@/lib/carousel';
import { expandSlides, pageSize, pageSlice } from '@/lib/pagination';
import type { SlideKey } from '@/lib/settings';
import type { TvStateResponse, TvWeather } from '@/lib/types';
import SkylineBackground from '@/components/tv/SkylineBackground';
import PairingScreen from '@/components/tv/PairingScreen';
import StartOverlay from '@/components/tv/StartOverlay';
import OfflineBadge from '@/components/tv/OfflineBadge';
import CelebrationOverlay from '@/components/tv/CelebrationOverlay';
import LeaderboardSlide from '@/components/tv/slides/LeaderboardSlide';
import ScorecardSlide from '@/components/tv/slides/ScorecardSlide';
import GoalSlide from '@/components/tv/slides/GoalSlide';
import AnnouncementSlide from '@/components/tv/slides/AnnouncementSlide';

// —— 每页容量常量:像素值与各 slide 组件的定高 CSS 同步,改组件样式必须同步这里 ——
// LeaderboardSlide:行 h-[72px] + 行间 gap-3(12px)。
const LEADERBOARD_ITEM_PX = 84;
// AnnouncementSlide:卡 h-[224px] + 卡间 gap-6(24px)。
const ANNOUNCEMENT_ITEM_PX = 248;
// ScorecardSlide:表格行 h-[56px](border-collapse,行间无边框无间距);MTD/YTD 共用。
const SCORECARD_ITEM_PX = 56;
// Scorecard 头部预留:py-12 上 48 + 标题行(SplitFlapTitle 定高 h-[60px])60 + mt-8 32
// + 汇总块 h-[120px] 120 + mt-8 32 + 表头 h-[48px] 48 + py-12 下 48 = 388
// (与 ScorecardSlide/SplitFlapTitle 定高 CSS 同步)。
const SCORECARD_RESERVED_PX = 388;
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

/** 液态玻璃折射用的隐藏 SVG filter(视觉设计 §1.2):feTurbulence fractalNoise
 *  baseFrequency 0.008 0.012、numOctaves 2、固定 seed=7(布局稳定不闪变),
 *  feDisplacementMap scale=13(轻微扭曲,spec 给的 12–14 区间取中)。
 *  配对/主界面两个渲染分支都要挂,故抽成小组件;width/height 0 不占布局。 */
function LiquidGlassFilter() {
  return (
    <svg aria-hidden="true" width="0" height="0" style={{ position: 'absolute' }}>
      <filter id="liquid-glass" x="-20%" y="-20%" width="140%" height="140%">
        <feTurbulence type="fractalNoise" baseFrequency="0.008 0.012" numOctaves="2" seed="7" result="noise" />
        <feDisplacementMap in="SourceGraphic" in2="noise" scale="13" xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </svg>
  );
}

export default function TvApp() {
  const [tvState, setTvState] = useState<TvStateResponse | null>(null);
  // 天气(天际线设计 §3):null = 从未成功(背景按"晴"+ 回落日出日落渲染)。
  const [weather, setWeather] = useState<TvWeather | null>(null);
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

  // 天气轮询(天际线设计 §3):挂载即拉取,此后每 10 分钟一次;配对/轮播/离线三分支
  // 共用,不依赖 socket.phase,与 refreshState/WS 互不干扰。失败沿用上次结果,
  // 从未成功保持 null——天气链路任何故障都不影响数据展示。
  useEffect(() => {
    let cancelled = false;
    const fetchWeather = async () => {
      try {
        const res = await fetch('/api/tv/weather');
        if (!res.ok) return; // 503 等:沿用上次结果
        const json = (await res.json()) as { data: TvWeather };
        if (!cancelled) setWeather(json.data);
      } catch {
        // 网络失败:沿用上次结果(设计 §3)
      }
    };
    void fetchWeather();
    const timer = setInterval(() => void fetchWeather(), 10 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  // 液态玻璃折射检测(视觉设计 §1.2):仅客户端一次性执行,SSR 安全。Chromium 系
  // 支持 backdrop-filter: url(#…) 时在 <html> 挂 glass-refract,.glass 升级为折射
  // 扭曲;不支持(Firefox/Safari)停留在毛玻璃基底。挂 <html> 而非组件根:
  // 配对/主界面两个分支共用一次检测结果。
  useEffect(() => {
    if (typeof CSS !== 'undefined' && CSS.supports('backdrop-filter', 'url(#liquid-glass)')) {
      document.documentElement.classList.add('glass-refract');
    }
  }, []);

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
    // MTD/YTD 两个 scorecard section 共用同一套行 CSS → 同一容量。
    const scorecardPerPage = pageSize(windowHeight - SCORECARD_RESERVED_PX, SCORECARD_ITEM_PX);
    return {
      leaderboard_sales_count: leaderboard,
      leaderboard_gci: leaderboard,
      leaderboard_listings: leaderboard,
      goal_progress: 1,
      announcements: pageSize(windowHeight - SLIDE_RESERVED_PX, ANNOUNCEMENT_ITEM_PX),
      scorecard: scorecardPerPage,
      scorecard_ytd: scorecardPerPage,
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
      announcements: Math.min(tvState.announcements.length, ANNOUNCEMENTS_CAP),
      scorecard: tvState.scorecard.rows.length,
      scorecard_ytd: tvState.scorecardYtd.rows.length,
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
      case 'scorecard': {
        const scorecardRows = tvState.scorecard.rows;
        return (
          <ScorecardSlide
            data={tvState.scorecard}
            rows={pageSlice(
              scorecardRows, effectivePage(page, scorecardRows.length, perPage.scorecard),
              perPage.scorecard,
            )}
            heading="SALES SCORECARD"
            subheading={`${tvState.periodLabel} · MONTH TO DATE`}
          />
        );
      }
      case 'scorecard_ytd': {
        const ytdRows = tvState.scorecardYtd.rows;
        return (
          <ScorecardSlide
            data={tvState.scorecardYtd}
            rows={pageSlice(
              ytdRows, effectivePage(page, ytdRows.length, perPage.scorecard_ytd),
              perPage.scorecard_ytd,
            )}
            heading="SALES SCORECARD"
            subheading={`${tvState.fyLabel} · YEAR TO DATE`}
          />
        );
      }
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
    return (
      <div className="relative h-screen w-screen overflow-hidden bg-bg">
        <LiquidGlassFilter />
        <SkylineBackground weather={weather} paused={false} />
        <PairingScreen pairCode={socket.pairCode} />
      </div>
    );
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-bg">
      <LiquidGlassFilter />
      {/* 天际线背景(设计 §2):z-0 垫底;庆祝/生日全屏播放期间暂停渲染循环。 */}
      <SkylineBackground weather={weather} paused={carousel.mode === 'celebrate'} />
      <AnimatePresence mode="wait">
        <motion.div
          key={currentSlide ? `${currentSlide.key}-${carousel.index}` : 'idle'}
          className="relative z-10 h-full w-full"
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
          className="glass fixed right-8 top-8 z-40 rounded-xl px-4 py-1 font-heading text-3xl text-muted"
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
