import { describe, it, expect } from 'vitest';
import {
  initCarousel, carouselReducer,
  type CarouselSlide, type CarouselState, type QueuedCelebration,
} from '@/lib/carousel';

const slides: CarouselSlide[] = [
  { key: 'leaderboard_sales_count', durationSec: 10 },
  { key: 'leaderboard_gci', durationSec: 15 },
  { key: 'goal_progress', durationSec: 5 },
];

const altSlides: CarouselSlide[] = [
  { key: 'listings', durationSec: 12 },
  { key: 'announcements', durationSec: 8 },
];

function payload(id: string): QueuedCelebration {
  return {
    kind: 'sale',
    saleId: id,
    agentName: 'Alice Ng',
    agentPhotoUrl: null,
    address: '1 Test St, Sydney',
    salePriceCents: 100_000_000,
    anthemUrl: null,
    durationSec: 18,
    clientId: `client-${id}`,
  };
}

describe('initCarousel', () => {
  it('starts at slide 0 in rotate mode with the first slide full duration', () => {
    const s = initCarousel(slides);
    expect(s).toEqual({
      slides,
      index: 0,
      remainingMs: 10_000,
      mode: 'rotate',
      current: null,
      queue: [],
    });
  });

  it('handles an empty slide list safely', () => {
    const s = initCarousel([]);
    expect(s.index).toBe(0);
    expect(s.remainingMs).toBe(0);
    expect(s.mode).toBe('rotate');
  });
});

describe('tick', () => {
  it('decrements remainingMs within the current slide', () => {
    const s = carouselReducer(initCarousel(slides), { type: 'tick', dtMs: 250 });
    expect(s.index).toBe(0);
    expect(s.remainingMs).toBe(9_750);
  });

  it('advances to the next slide when time runs out', () => {
    const s = carouselReducer(initCarousel(slides), { type: 'tick', dtMs: 10_000 });
    expect(s.index).toBe(1);
    expect(s.remainingMs).toBe(15_000);
  });

  it('wraps from the last slide back to the first', () => {
    const last: CarouselState = { ...initCarousel(slides), index: 2, remainingMs: 100 };
    const s = carouselReducer(last, { type: 'tick', dtMs: 250 });
    expect(s.index).toBe(0);
    expect(s.remainingMs).toBe(10_000);
  });

  it('is a no-op when slides are empty', () => {
    const s = carouselReducer(initCarousel([]), { type: 'tick', dtMs: 250 });
    expect(s.index).toBe(0);
    expect(s.remainingMs).toBe(0);
  });
});

describe('celebration', () => {
  it('interrupts rotate and preserves the interrupted slide remaining time', () => {
    let s = carouselReducer(initCarousel(slides), { type: 'tick', dtMs: 4_000 });
    s = carouselReducer(s, { type: 'celebration', payload: payload('sale-1') });
    expect(s.mode).toBe('celebrate');
    expect(s.current?.clientId).toBe('client-sale-1');
    expect(s.index).toBe(0);
    expect(s.remainingMs).toBe(6_000);
    expect(s.queue).toEqual([]);
  });

  it('freezes the carousel during celebrate: tick does not advance anything', () => {
    const celebrating = carouselReducer(initCarousel(slides), {
      type: 'celebration',
      payload: payload('sale-1'),
    });
    const after = carouselReducer(celebrating, { type: 'tick', dtMs: 60_000 });
    expect(after).toEqual(celebrating);
  });

  it('queues subsequent celebrations in FIFO order', () => {
    let s = carouselReducer(initCarousel(slides), { type: 'celebration', payload: payload('sale-1') });
    s = carouselReducer(s, { type: 'celebration', payload: payload('sale-2') });
    s = carouselReducer(s, { type: 'celebration', payload: payload('sale-3') });
    expect(s.current?.clientId).toBe('client-sale-1');
    expect(s.queue.map((p) => p.clientId)).toEqual(['client-sale-2', 'client-sale-3']);
  });

  it('accepts a birthday celebration through the same interrupt path', () => {
    const birthday: QueuedCelebration = {
      kind: 'birthday',
      agentId: 'agent-1',
      name: 'Alice Ng',
      photoUrl: null,
      durationSec: 18,
      clientId: 'client-bday-1',
    };
    let s = carouselReducer(initCarousel(slides), { type: 'celebration', payload: birthday });
    expect(s.mode).toBe('celebrate');
    expect(s.current?.clientId).toBe('client-bday-1');
    s = carouselReducer(s, { type: 'celebrationDone' });
    expect(s.mode).toBe('rotate');
    expect(s.current).toBeNull();
  });
});

describe('celebrationDone', () => {
  it('dequeues the next celebration when the queue is non-empty', () => {
    let s = carouselReducer(initCarousel(slides), { type: 'celebration', payload: payload('sale-1') });
    s = carouselReducer(s, { type: 'celebration', payload: payload('sale-2') });
    s = carouselReducer(s, { type: 'celebrationDone' });
    expect(s.mode).toBe('celebrate');
    expect(s.current?.clientId).toBe('client-sale-2');
    expect(s.queue).toEqual([]);
  });

  it('returns to rotate keeping the preserved remaining time when it is >= 3000ms', () => {
    let s = carouselReducer(initCarousel(slides), { type: 'tick', dtMs: 4_000 }); // remaining 6000
    s = carouselReducer(s, { type: 'celebration', payload: payload('sale-1') });
    s = carouselReducer(s, { type: 'celebrationDone' });
    expect(s.mode).toBe('rotate');
    expect(s.current).toBeNull();
    expect(s.index).toBe(0);
    expect(s.remainingMs).toBe(6_000);
  });

  it('raises remaining time to 3000ms when the interrupted page had almost expired', () => {
    let s = carouselReducer(initCarousel(slides), { type: 'tick', dtMs: 9_500 }); // remaining 500
    s = carouselReducer(s, { type: 'celebration', payload: payload('sale-1') });
    s = carouselReducer(s, { type: 'celebrationDone' });
    expect(s.mode).toBe('rotate');
    expect(s.remainingMs).toBe(3_000);
  });

  it('after draining the queue, restores rotate with the 3000ms floor', () => {
    let s = carouselReducer(initCarousel(slides), { type: 'tick', dtMs: 9_800 }); // remaining 200
    s = carouselReducer(s, { type: 'celebration', payload: payload('sale-1') });
    s = carouselReducer(s, { type: 'celebration', payload: payload('sale-2') });
    s = carouselReducer(s, { type: 'celebrationDone' }); // dequeues sale-2
    expect(s.mode).toBe('celebrate');
    expect(s.current?.clientId).toBe('client-sale-2');
    s = carouselReducer(s, { type: 'celebrationDone' }); // queue now empty
    expect(s.mode).toBe('rotate');
    expect(s.current).toBeNull();
    expect(s.remainingMs).toBe(3_000);
  });
});

describe('setSlides', () => {
  it('rotate mode: keeps an in-range index and resets remaining to the current slide duration', () => {
    let s = carouselReducer(initCarousel(slides), { type: 'tick', dtMs: 10_000 }); // index 1
    s = carouselReducer(s, { type: 'setSlides', slides: altSlides });
    expect(s.index).toBe(1);
    expect(s.remainingMs).toBe(8_000); // altSlides[1].durationSec * 1000
    expect(s.slides).toEqual(altSlides);
  });

  it('rotate mode: clamps an out-of-range index by modulo', () => {
    const atLast: CarouselState = { ...initCarousel(slides), index: 2, remainingMs: 1_234 };
    const s = carouselReducer(atLast, { type: 'setSlides', slides: altSlides });
    expect(s.index).toBe(0); // 2 % 2
    expect(s.remainingMs).toBe(12_000);
  });

  it('celebrate mode: swaps slides without interrupting the celebration', () => {
    let s = carouselReducer(initCarousel(slides), { type: 'celebration', payload: payload('sale-1') });
    s = carouselReducer(s, { type: 'setSlides', slides: altSlides });
    expect(s.mode).toBe('celebrate');
    expect(s.current?.clientId).toBe('client-sale-1');
    expect(s.slides).toEqual(altSlides);
    s = carouselReducer(s, { type: 'celebrationDone' });
    expect(s.mode).toBe('rotate');
    expect(s.index).toBe(0);
    expect(s.remainingMs).toBe(12_000);
  });

  it('setting an empty slide list is safe and tick stays put', () => {
    let s = carouselReducer(initCarousel(slides), { type: 'setSlides', slides: [] });
    expect(s.index).toBe(0);
    expect(s.remainingMs).toBe(0);
    s = carouselReducer(s, { type: 'tick', dtMs: 250 });
    expect(s.index).toBe(0);
    expect(s.remainingMs).toBe(0);
  });
});

describe('reset', () => {
  it('clears everything, even mid-celebration with a queued item', () => {
    let s = carouselReducer(initCarousel(slides), { type: 'celebration', payload: payload('sale-1') });
    s = carouselReducer(s, { type: 'celebration', payload: payload('sale-2') });
    s = carouselReducer(s, { type: 'reset' });
    expect(s).toEqual(initCarousel([]));
  });

  it('is safe to tick after a reset (no-op, no crash)', () => {
    let s = carouselReducer(initCarousel(slides), { type: 'tick', dtMs: 4_000 });
    s = carouselReducer(s, { type: 'reset' });
    s = carouselReducer(s, { type: 'tick', dtMs: 250 });
    expect(s.index).toBe(0);
    expect(s.remainingMs).toBe(0);
    expect(s.mode).toBe('rotate');
    expect(s.slides).toEqual([]);
  });
});
