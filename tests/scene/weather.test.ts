import { describe, expect, it } from 'vitest';
import { effectsFromWeather } from '@/lib/scene/weather';

describe('effectsFromWeather', () => {
  it('clear sky (0): faint clouds, nothing else', () => {
    expect(effectsFromWeather(0, 0)).toEqual({
      rain: 0, snow: 0, thunder: false, wind: 0, cloudiness: 0.1, fog: false,
    });
  });

  it('partly cloudy (1/2): 0.35 / 0.6', () => {
    expect(effectsFromWeather(1, 0).cloudiness).toBe(0.35);
    expect(effectsFromWeather(2, 0).cloudiness).toBe(0.6);
  });

  it('overcast (3): 0.9', () => {
    expect(effectsFromWeather(3, 0).cloudiness).toBe(0.9);
  });

  it('fog (45/48): fog flag, no rain', () => {
    for (const code of [45, 48]) {
      const fx = effectsFromWeather(code, 0);
      expect(fx.fog).toBe(true);
      expect(fx.rain).toBe(0);
      expect(fx.cloudiness).toBe(0.85);
    }
  });

  it('drizzle (51–57): rain 1', () => {
    for (const code of [51, 53, 55, 56, 57]) {
      expect(effectsFromWeather(code, 0).rain).toBe(1);
    }
  });

  it('rain tiers: 61/80 → 1, 63/81 → 2, 65/67/82 → 3', () => {
    for (const code of [61, 80]) expect(effectsFromWeather(code, 0).rain).toBe(1);
    for (const code of [63, 81]) expect(effectsFromWeather(code, 0).rain).toBe(2);
    for (const code of [65, 67, 82]) expect(effectsFromWeather(code, 0).rain).toBe(3);
  });

  it('any rain forces cloudiness ≥ 0.7 (设计 §4)', () => {
    for (const code of [51, 61, 63, 65, 80, 81, 82, 95]) {
      expect(effectsFromWeather(code, 0).cloudiness).toBeGreaterThanOrEqual(0.7);
    }
  });

  it('snow (71–77, 85, 86): snow 1, no rain', () => {
    for (const code of [71, 73, 75, 77, 85, 86]) {
      const fx = effectsFromWeather(code, 0);
      expect(fx.snow).toBe(1);
      expect(fx.rain).toBe(0);
    }
  });

  it('thunderstorm (95/96/99): rain 3 + thunder', () => {
    for (const code of [95, 96, 99]) {
      const fx = effectsFromWeather(code, 0);
      expect(fx.rain).toBe(3);
      expect(fx.thunder).toBe(true);
    }
  });

  it('wind thresholds: <30 → 0, 30–49.9 → 1, ≥50 → 2 (km/h)', () => {
    expect(effectsFromWeather(0, 0).wind).toBe(0);
    expect(effectsFromWeather(0, 29.9).wind).toBe(0);
    expect(effectsFromWeather(0, 30).wind).toBe(1);
    expect(effectsFromWeather(0, 49.9).wind).toBe(1);
    expect(effectsFromWeather(0, 50).wind).toBe(2);
    expect(effectsFromWeather(0, 90).wind).toBe(2);
  });

  it('unlisted codes fall back to neutral clouds only', () => {
    expect(effectsFromWeather(40, 0)).toEqual({
      rain: 0, snow: 0, thunder: false, wind: 0, cloudiness: 0.5, fog: false,
    });
  });
});
