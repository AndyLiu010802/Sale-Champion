import type { CelebrationPayload } from './ws/protocol';
import type { SlideKey } from './settings';

export type CarouselSlide = { key: SlideKey; durationSec: number };

// clientId:TV 端收到事件时本地生成的稳定挂载键——同一 payload(如同一 sale 连续
// replay)也会重挂载 overlay;sale/birthday 两种 kind 统一用它当 React key。
export type QueuedCelebration = CelebrationPayload & { clientId: string };

export type CarouselState = {
  slides: CarouselSlide[];
  index: number;            // 0 when slides is empty; renderer shows idle
  remainingMs: number;
  mode: 'rotate' | 'celebrate';
  current: QueuedCelebration | null;   // current celebration in celebrate mode
  queue: QueuedCelebration[];          // FIFO
};

export type CarouselEvent =
  | { type: 'tick'; dtMs: number }
  | { type: 'celebration'; payload: QueuedCelebration }
  | { type: 'celebrationDone' }
  | { type: 'setSlides'; slides: CarouselSlide[] }
  | { type: 'reset' };

const MIN_RESUME_MS = 3_000;

export function initCarousel(slides: CarouselSlide[]): CarouselState {
  return {
    slides,
    index: 0,
    remainingMs: slides.length > 0 ? slides[0].durationSec * 1000 : 0,
    mode: 'rotate',
    current: null,
    queue: [],
  };
}

export function carouselReducer(state: CarouselState, event: CarouselEvent): CarouselState {
  switch (event.type) {
    case 'tick': {
      if (state.mode !== 'rotate' || state.slides.length === 0) return state;
      const remaining = state.remainingMs - event.dtMs;
      if (remaining > 0) return { ...state, remainingMs: remaining };
      const index = (state.index + 1) % state.slides.length;
      return { ...state, index, remainingMs: state.slides[index].durationSec * 1000 };
    }
    case 'celebration': {
      if (state.mode === 'celebrate') {
        return { ...state, queue: [...state.queue, event.payload] };
      }
      // Interrupt rotate; remainingMs of the interrupted slide is preserved untouched.
      return { ...state, mode: 'celebrate', current: event.payload };
    }
    case 'celebrationDone': {
      if (state.queue.length > 0) {
        const [next, ...rest] = state.queue;
        return { ...state, current: next, queue: rest };
      }
      return {
        ...state,
        mode: 'rotate',
        current: null,
        remainingMs: state.remainingMs < MIN_RESUME_MS ? MIN_RESUME_MS : state.remainingMs,
      };
    }
    case 'setSlides': {
      const slides = event.slides;
      if (slides.length === 0) {
        return { ...state, slides, index: 0, remainingMs: 0 };
      }
      const index = state.index % slides.length;
      return { ...state, slides, index, remainingMs: slides[index].durationSec * 1000 };
    }
    case 'reset': {
      // Unpaired / re-registering: drop cached slides, any in-flight celebration and
      // its queue — the next paired session starts from a clean slate.
      return initCarousel([]);
    }
  }
}
