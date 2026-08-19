import { describe, expect, it } from 'vitest';
import { FLAP_CHARS, flapSequence, randomFlapChar } from '@/components/tv/splitFlap';

/** 固定种子伪随机(mulberry32):与 SkylineBackground 同款,序列可复现。 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('flapSequence', () => {
  it('ends on the target with 2-3 intermediates, all from FLAP_CHARS', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const seq = flapSequence('S', mulberry32(seed));
      expect(seq[seq.length - 1]).toBe('S');
      expect(seq.length).toBeGreaterThanOrEqual(3); // 2 中间 + 1 目标
      expect(seq.length).toBeLessThanOrEqual(4);    // 3 中间 + 1 目标
      for (const ch of seq) expect(FLAP_CHARS).toContain(ch);
    }
  });

  it('never repeats adjacent chars and never shows the target early', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const seq = flapSequence('D', mulberry32(seed));
      for (let i = 0; i < seq.length - 1; i++) {
        expect(seq[i]).not.toBe(seq[i + 1]);
        expect(seq[i]).not.toBe('D'); // 目标只在末位出现
      }
    }
  });

  it('is deterministic for a fixed rng seed', () => {
    expect(flapSequence('R', mulberry32(42))).toEqual(flapSequence('R', mulberry32(42)));
    expect(randomFlapChar(mulberry32(7))).toBe(randomFlapChar(mulberry32(7)));
  });

  it('returns a single-element sequence for a non-A-Z target char', () => {
    // Note: FLAP_CHARS is a plain string, so String#includes does substring
    // matching — only single chars absent from A-Z (not '' and not multi-char
    // substrings like 'AB') reliably hit the early-return branch.
    for (const ch of [' ', '1', '#', '!']) {
      expect(flapSequence(ch, mulberry32(3))).toEqual([ch]);
    }
  });
});
