'use client';

import { useEffect, useState } from 'react';
import { flapSequence, randomFlapChar } from '@/components/tv/splitFlap';

const STAGGER_MS = 80;      // 各牌按字母序错峰翻入(视觉设计 §2)
const FLIP_MS = 90;         // 单次翻转时长
const JITTER_MIN_MS = 6000; // 偶发抖动:6–10s 随机间隔
const JITTER_SPAN_MS = 4000;

type Tile = { char: string; flips: number };

/**
 * 机场翻牌板标题(视觉设计 §2):每字母一块翻牌,空格为间隙;整行钉死 h-[60px]
 * (原 text-6xl 标题行的高度——TvApp SCORECARD_RESERVED_PX=388 依赖它,不可改)。
 * - 挂载(轮播切到本页/翻页重挂)时:各牌从随机字母起,错峰 80ms,翻 3–6 次
 *   (每次 90ms rotateX)后停到目标字母;
 * - 停定期间每 6–10s 随机取 1–2 块牌快翻两轮回原字母;定时器卸载全清;
 * - E2E/可访问性:sr-only 完整标题文本 + 容器 aria-label,翻牌 tile 全部
 *   aria-hidden。Playwright 实测(计划头部):getByText 命中 sr-only 节点且
 *   toBeVisible 通过(1×1 bounding box 非空),现有断言零改动。
 * SSR 安全:初始 state 即目标字母(服务端与客户端首帧一致,无 hydration
 * mismatch),全部动画在 mount effect 里启动。
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

    // 翻入:随机起始字母 + 3–6 次随机翻转 + 目标字母。
    chars.forEach((ch, idx) => {
      if (ch === ' ') return;
      playSequence(idx, [randomFlapChar(Math.random), ...flapSequence(ch, Math.random)], idx * STAGGER_MS);
    });

    // 偶发抖动:6–10s 取 1–2 块牌快翻两轮回原字母(链式 setTimeout,卸载随 timers 清)。
    const letterIdx = chars.map((ch, i) => (ch === ' ' ? -1 : i)).filter((i) => i >= 0);
    const scheduleJitter = () => {
      later(() => {
        const picks = Math.random() < 0.5 ? 1 : 2;
        for (let n = 0; n < picks; n++) {
          const idx = letterIdx[Math.floor(Math.random() * letterIdx.length)];
          playSequence(idx, [randomFlapChar(Math.random), chars[idx]], 0);
        }
        scheduleJitter();
      }, JITTER_MIN_MS + Math.random() * JITTER_SPAN_MS);
    };
    scheduleJitter();

    return () => timers.forEach(clearTimeout);
  }, [text]);

  return (
    <h1 aria-label={text} className="flex h-[60px] items-center gap-2">
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
              background: 'linear-gradient(180deg, #2a2f3a 0%, #16191f 46%, #0a0c11 54%, #14171d 100%)',
              boxShadow:
                'inset 0 1px 0 rgba(255,255,255,0.09), inset 0 -1px 0 rgba(0,0,0,0.6), 0 2px 6px rgba(0,0,0,0.5)',
              perspective: '300px',
            }}
          >
            <span
              key={tiles[idx] ? tiles[idx].flips : 0}
              className="font-display text-4xl font-bold text-white"
              style={{
                animation: tiles[idx] && tiles[idx].flips > 0 ? `flap-flip ${FLIP_MS}ms ease-out` : undefined,
                backfaceVisibility: 'hidden',
              }}
            >
              {tiles[idx] ? tiles[idx].char : ch}
            </span>
            <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-black/70" />
          </span>
        ),
      )}
    </h1>
  );
}
