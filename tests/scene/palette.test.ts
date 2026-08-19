import { describe, expect, it } from 'vitest';
import { KEYS, getPalette, nightProgress, phaseFromClock, sunPosition } from '@/lib/scene/palette';

/** 本地时间构造:phaseFromClock/nightProgress 只读 now 的本地时分秒。 */
function at(hours: number, minutes: number): Date {
  return new Date(2026, 7, 19, hours, minutes, 0);
}

describe('KEYS / getPalette', () => {
  it('has six keyframes DAWN→NIGHT at fixed t stops', () => {
    expect(KEYS.map((k) => k.name)).toEqual(['DAWN', 'MORNING', 'MIDDAY', 'GOLDEN', 'SUNSET', 'NIGHT']);
    expect(KEYS.map((k) => k.t)).toEqual([0, 0.28, 0.5, 0.68, 0.84, 1]);
  });

  it('t=0 returns the DAWN frame verbatim', () => {
    expect(getPalette(0)).toEqual(KEYS[0].p);
  });

  it('t=1 returns the NIGHT frame verbatim', () => {
    expect(getPalette(1)).toEqual(KEYS[5].p);
  });

  it('clamps t outside 0..1', () => {
    expect(getPalette(-0.7)).toEqual(KEYS[0].p);
    expect(getPalette(1.7)).toEqual(KEYS[5].p);
  });

  it('midway between two frames every channel is the arithmetic mean', () => {
    const mid = getPalette(0.14); // DAWN(t=0)与 MORNING(t=0.28)的中点
    const a = KEYS[0].p;
    const b = KEYS[1].p;
    for (let c = 0; c < 3; c++) {
      expect(mid.skyTop[c]).toBeCloseTo((a.skyTop[c] + b.skyTop[c]) / 2, 6);
      expect(mid.buildingNear[c]).toBeCloseTo((a.buildingNear[c] + b.buildingNear[c]) / 2, 6);
    }
    expect(mid.windowLit).toBeCloseTo((a.windowLit + b.windowLit) / 2, 6);
    expect(mid.star).toBeCloseTo((a.star + b.star) / 2, 6);
    expect(mid.dim).toBeCloseTo((a.dim + b.dim) / 2, 6);
  });
});

describe('phaseFromClock', () => {
  // 回落锚点(无日出日落,设计 §2:06:30/19:00)→
  // DAWN 05:45(t=0)→ MORNING 07:15(0.28)→ 日照中点 12:45(0.5)
  // → GOLDEN 17:30(0.68)→ SUNSET 19:00(0.84)→ NIGHT 19:40(1.0)
  it('falls back to 06:30/19:00 anchors without sunrise/sunset', () => {
    expect(phaseFromClock(at(5, 45))).toBeCloseTo(0, 6);
    expect(phaseFromClock(at(7, 15))).toBeCloseTo(0.28, 6);
    expect(phaseFromClock(at(12, 45))).toBeCloseTo(0.5, 6);
    expect(phaseFromClock(at(17, 30))).toBeCloseTo(0.68, 6);
    expect(phaseFromClock(at(19, 0))).toBeCloseTo(0.84, 6);
    expect(phaseFromClock(at(19, 40))).toBeCloseTo(1, 6);
  });

  it('interpolates inside a segment (sunrise 06:30 sits mid-DAWN)', () => {
    expect(phaseFromClock(at(6, 30))).toBeCloseTo(0.14, 6);
  });

  it('holds t=1 through the whole night, across midnight', () => {
    expect(phaseFromClock(at(23, 0))).toBe(1);
    expect(phaseFromClock(at(0, 0))).toBe(1);
    expect(phaseFromClock(at(3, 0))).toBe(1);
    expect(phaseFromClock(at(5, 0))).toBe(1); // 日出前(锚点 05:45 之前)仍是夜
  });

  it('anchors on real sunrise/sunset ISO strings (Hobart winter-ish)', () => {
    const sunrise = '2026-08-19T07:10';
    const sunset = '2026-08-19T17:20';
    expect(phaseFromClock(at(6, 25), sunrise, sunset)).toBeCloseTo(0, 6); // 07:10−45m
    expect(phaseFromClock(at(7, 55), sunrise, sunset)).toBeCloseTo(0.28, 6); // 07:10+45m
    expect(phaseFromClock(at(12, 15), sunrise, sunset)).toBeCloseTo(0.5, 6); // 日照中点
    expect(phaseFromClock(at(15, 50), sunrise, sunset)).toBeCloseTo(0.68, 6); // 17:20−90m
    expect(phaseFromClock(at(17, 20), sunrise, sunset)).toBeCloseTo(0.84, 6);
    expect(phaseFromClock(at(18, 0), sunrise, sunset)).toBeCloseTo(1, 6); // 17:20+40m 进夜
    expect(phaseFromClock(at(21, 0), sunrise, sunset)).toBe(1);
  });

  it('falls back to defaults on unparseable ISO strings', () => {
    expect(phaseFromClock(at(12, 45), 'not-a-date', 'garbage')).toBeCloseTo(0.5, 6);
  });
});

describe('sunPosition / nightProgress', () => {
  it('daytime returns the sun on an arc (high near t=0.5)', () => {
    const noon = sunPosition(0.5);
    expect(noon.kind).toBe('sun');
    expect(noon.y).toBeLessThan(0.2);
    expect(noon.x).toBeGreaterThan(0.4);
    expect(noon.x).toBeLessThan(0.65);
  });

  it('the sun sits below the horizon at the very start of DAWN', () => {
    expect(sunPosition(0).y).toBeGreaterThan(1);
  });

  it('night returns the moon, positioned by nightT', () => {
    const mid = sunPosition(1, 0.5);
    expect(mid.kind).toBe('moon');
    expect(mid.x).toBeCloseTo(0.5, 6);
    expect(mid.y).toBeCloseTo(0.25, 6);
    expect(sunPosition(1, 0).y).toBeCloseTo(1, 6);
  });

  it('nightProgress walks 0→1 from sunset+40m to sunrise−45m across midnight', () => {
    // 回落锚点:夜 = 19:40 → 次日 05:45(时长 605 分钟)
    expect(nightProgress(at(19, 40))).toBeCloseTo(0, 6);
    expect(nightProgress(at(0, 0))).toBeCloseTo(260 / 605, 6);
    expect(nightProgress(at(5, 45))).toBeCloseTo(1, 6);
  });
});
