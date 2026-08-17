import { isBuiltinAnthem } from '@/lib/audio/anthems';

type Note = { freq: number; dur: number }; // dur in seconds

const MELODIES: Record<string, Note[]> = {
  'builtin:victory': [
    { freq: 523.25, dur: 0.15 }, { freq: 523.25, dur: 0.15 }, { freq: 523.25, dur: 0.15 },
    { freq: 659.25, dur: 0.45 }, { freq: 523.25, dur: 0.3 }, { freq: 659.25, dur: 0.3 },
    { freq: 783.99, dur: 0.6 }, { freq: 659.25, dur: 0.2 }, { freq: 783.99, dur: 0.2 },
    { freq: 1046.5, dur: 0.9 },
  ],
  'builtin:neon-rush': [
    { freq: 440, dur: 0.12 }, { freq: 523.25, dur: 0.12 }, { freq: 659.25, dur: 0.12 },
    { freq: 880, dur: 0.24 }, { freq: 659.25, dur: 0.12 }, { freq: 880, dur: 0.24 },
    { freq: 987.77, dur: 0.24 }, { freq: 880, dur: 0.12 }, { freq: 659.25, dur: 0.12 },
    { freq: 587.33, dur: 0.24 }, { freq: 659.25, dur: 0.24 }, { freq: 880, dur: 0.48 },
  ],
  'builtin:champion': [
    { freq: 392, dur: 0.2 }, { freq: 440, dur: 0.2 }, { freq: 493.88, dur: 0.2 },
    { freq: 587.33, dur: 0.4 }, { freq: 493.88, dur: 0.2 }, { freq: 587.33, dur: 0.4 },
    { freq: 783.99, dur: 0.6 }, { freq: 587.33, dur: 0.3 }, { freq: 783.99, dur: 0.9 },
  ],
};

let _ctx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!_ctx) {
    try {
      _ctx = new AudioContext();
    } catch (err) {
      console.warn('AudioContext unavailable', err);
      return null;
    }
  }
  if (_ctx.state === 'suspended') {
    _ctx.resume().catch(() => {});
  }
  return _ctx;
}

function clampVolume(volume: number): number {
  return Math.max(0, Math.min(1, volume));
}

function playBuiltin(id: string, volume: number): { stop(): void } {
  const ctx = getAudioContext();
  if (!ctx) return { stop() {} };

  const melody = MELODIES[id] ?? MELODIES['builtin:victory'];
  const master = ctx.createGain();
  // Scale down: two oscillators per note clip easily at full gain.
  master.gain.value = clampVolume(volume) * 0.3;
  master.connect(ctx.destination);

  const oscillators: OscillatorNode[] = [];
  let loopTimer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const schedulePass = () => {
    if (stopped) return;
    let t = ctx.currentTime + 0.05;
    for (const note of melody) {
      for (const type of ['square', 'sawtooth'] as const) {
        const osc = ctx.createOscillator();
        osc.type = type;
        // Sawtooth an octave down for body under the square lead.
        osc.frequency.value = type === 'sawtooth' ? note.freq / 2 : note.freq;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(1, t + 0.01);              // attack
        gain.gain.linearRampToValueAtTime(0.7, t + note.dur * 0.6);  // decay
        gain.gain.linearRampToValueAtTime(0, t + note.dur);          // release
        osc.connect(gain);
        gain.connect(master);
        osc.start(t);
        osc.stop(t + note.dur + 0.02);
        oscillators.push(osc);
      }
      t += note.dur;
    }
    const passMs = melody.reduce((sum, n) => sum + n.dur, 0) * 1000;
    loopTimer = setTimeout(schedulePass, passMs + 300);
  };

  try {
    schedulePass();
  } catch (err) {
    console.warn('Anthem synthesis failed', err);
  }

  return {
    stop() {
      stopped = true;
      if (loopTimer) clearTimeout(loopTimer);
      for (const osc of oscillators) {
        try {
          osc.stop();
        } catch {
          // already stopped
        }
      }
      try {
        master.disconnect();
      } catch {
        // already disconnected
      }
    },
  };
}

function playFile(url: string, volume: number): { stop(): void } {
  const audio = new Audio(url);
  audio.volume = clampVolume(volume);
  audio.play().catch((err) => console.warn('Anthem playback failed', err));
  return {
    stop() {
      audio.pause();
      audio.src = '';
    },
  };
}

export function playAnthem(anthemUrl: string | null, volume: number): { stop(): void } {
  const url = anthemUrl ?? 'builtin:victory';
  if (isBuiltinAnthem(url)) return playBuiltin(url, volume);
  return playFile(url, volume);
}
