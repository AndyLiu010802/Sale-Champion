import type { CelebrationPayload } from './ws/protocol';
import type { SlideKey } from './settings';

export type CarouselSlide = { key: SlideKey; durationSec: number };

export type CarouselState = {
  slides: CarouselSlide[];
  index: number;            // 0 when slides is empty; renderer shows idle
  remainingMs: number;
  mode: 'rotate' | 'celebrate';
  current: CelebrationPayload | null;   // current celebration in celebrate mode
  queue: CelebrationPayload[];          // FIFO
};

export type CarouselEvent =
  | { type: 'tick'; dtMs: number }
  | { type: 'celebration'; payload: CelebrationPayload }
  | { type: 'celebrationDone' }
  | { type: 'setSlides'; slides: CarouselSlide[] };

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
  }
}
