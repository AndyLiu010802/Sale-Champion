'use client';

import { useEffect, useState } from 'react';
import { flapSequence } from '@/components/tv/splitFlap';

const FLIP_MS = 250;         // 单次翻转时长(视觉设计 §2 修订:机械慢节奏,220–280ms 区间取中值)
const JITTER_MIN_MS = 6000;  // 偶发抖动:6–10s 随机间隔
const JITTER_SPAN_MS = 4000;

type Tile = { char: string; flips: number };

/**
 * 机场翻牌板标题(视觉设计 §2 修订版:整行翻入已移除,偶发抖动是唯一动画)。
 * 每字母一块翻牌,空格为间隙;整行钉死 h-[60px](原 text-6xl 标题行的高度——
 * TvApp SCORECARD_RESERVED_PX=388 依赖它,不可改)。
 * - 挂载(轮播切到本页/翻页重挂)时:直接静止呈现目标字母,不做随机化翻入
 *   (SSR 初始帧本就是目标字母,首帧与稳定态一致);
 * - 停定期间每 6–10s 随机取 1–2 块牌慢速翻 2–3 次(每次 250ms rotateX)后
 *   停回原字母;定时器卸载全清;
 * - E2E/可访问性:sr-only 完整标题文本 + 容器 aria-label,翻牌 tile 全部
 *   aria-hidden。Playwright 实测(计划头部):getByText 命中 sr-only 节点且
 *   toBeVisible 通过(1×1 bounding box 非空),现有断言零改动。
 * SSR 安全:初始 state 即目标字母(服务端与客户端首帧一致,无 hydration
 * mismatch);挂载 effect 只负责重置状态与调度抖动,不驱动任何初始动画。
 */
export default function SplitFlapTitle({ text }: { text: string }) {
  const letters = Array.from(text);
  const [tiles, setTiles] = useState<Tile[]>(() => letters.map((ch) => ({ char: ch, flips: 0 })));

  useEffect(() => {
    const chars = Array.from(text);
    setTiles(chars.map((ch) => ({ char: ch, flips: 0 })));

    const timers: ReturnType<typeof setTimeout>[] = [];
    const later = (fn: () => void, ms: number) => timers.push(setTimeout(fn, ms));
    const setTile = (idx: number, char: string) =>
      setTiles((prev) => prev.map((t, i) => (i === idx ? { char, flips: t.flips + 1 } : t)));
    const playSequence = (idx: number, seq: string[], startMs: number) =>
      seq.forEach((ch, s) => later(() => setTile(idx, ch), startMs + s * FLIP_MS));

    // 偶发抖动:6–10s 取 1–2 块牌慢速翻 2–3 次回原字母(链式 setTimeout,卸载随 timers 清)。
    const letterIdx = chars.map((ch, i) => (ch === ' ' ? -1 : i)).filter((i) => i >= 0);
    const scheduleJitter = () => {
      later(() => {
        const picks = Math.random() < 0.5 ? 1 : 2;
        for (let n = 0; n < picks; n++) {
          const idx = letterIdx[Math.floor(Math.random() * letterIdx.length)];
          playSequence(idx, flapSequence(chars[idx], Math.random), 0);
        }
        scheduleJitter();
      }, JITTER_MIN_MS + Math.random() * JITTER_SPAN_MS);
    };
    scheduleJitter();

    return () => timers.forEach(clearTimeout);
  }, [text]);

  return (
    <h1 aria-label={text} className="flex h-[60px] items-center gap-1">
      <style>{`
        @keyframes flap-flip {
          from { transform: rotateX(-88deg); }
          to { transform: rotateX(0deg); }
        }
      `}</style>
      <span className="sr-only">{text}</span>
      {letters.map((ch, idx) =>
        ch === ' ' ? (
          <span key={idx} aria-hidden="true" className="w-5 shrink-0" />
        ) : (
          <span
            key={idx}
            aria-hidden="true"
            className="relative flex h-[60px] w-[46px] shrink-0 items-center justify-center overflow-hidden rounded-md"
            style={{
              background: 'linear-gradient(180deg, #22262e 0%, #121419 46%, #060708 54%, #0e1015 100%)',
              boxShadow:
                'inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -1px 0 rgba(0,0,0,0.65), 0 2px 6px rgba(0,0,0,0.5)',
              perspective: '300px',
            }}
          >
            <span
              key={tiles[idx] ? tiles[idx].flips : 0}
              className="font-display text-4xl font-bold tracking-tight text-white"
              style={{
                animation: tiles[idx] && tiles[idx].flips > 0 ? `flap-flip ${FLIP_MS}ms ease-out` : undefined,
                backfaceVisibility: 'hidden',
              }}
            >
              {tiles[idx] ? tiles[idx].char : ch}
            </span>
            <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-black/80" />
          </span>
        ),
      )}
    </h1>
  );
}
