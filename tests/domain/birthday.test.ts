import { describe, it, expect } from 'vitest';
import { BIRTHDAY_RE, isValidBirthday, localYmd, localMmdd, isElevenAm } from '@/lib/domain/birthday';

describe('BIRTHDAY_RE / isValidBirthday', () => {
  it.each(['01-01', '08-18', '12-31', '02-29', '10-05'])('accepts %s', (s) => {
    expect(isValidBirthday(s)).toBe(true);
  });

  it.each([
    '8-18',        // month not zero-padded
    '08-8',        // day not zero-padded
    '13-01',       // month out of range
    '00-10',       // month zero
    '01-32',       // day out of range
    '01-00',       // day zero
    '2026-08-18',  // full date, not MM-DD
    '08/18',       // wrong separator
    '08-18 ',      // trailing space
    '',            // empty
    'aa-bb',       // not numeric
  ])('rejects %s', (s) => {
    expect(isValidBirthday(s)).toBe(false);
  });

  it('exposes the regex itself for zod .regex() reuse', () => {
    expect(BIRTHDAY_RE.test('08-18')).toBe(true);
    expect(BIRTHDAY_RE.test('18-08')).toBe(false);
  });
});

describe('localYmd / localMmdd', () => {
  it('formats a local date as YYYY-MM-DD and MM-DD', () => {
    const d = new Date(2026, 7, 18, 11, 0); // 2026-08-18 local time
    expect(localYmd(d)).toBe('2026-08-18');
    expect(localMmdd(d)).toBe('08-18');
  });

  it('zero-pads single-digit months and days', () => {
    const d = new Date(2026, 0, 5, 9, 30); // 2026-01-05
    expect(localYmd(d)).toBe('2026-01-05');
    expect(localMmdd(d)).toBe('01-05');
  });
});

describe('isElevenAm', () => {
  it('is true at 11:00 local time regardless of seconds', () => {
    expect(isElevenAm(new Date(2026, 7, 18, 11, 0, 0))).toBe(true);
    expect(isElevenAm(new Date(2026, 7, 18, 11, 0, 59))).toBe(true);
  });

  it('is false at any other hour or minute', () => {
    expect(isElevenAm(new Date(2026, 7, 18, 10, 59))).toBe(false);
    expect(isElevenAm(new Date(2026, 7, 18, 11, 1))).toBe(false);
    expect(isElevenAm(new Date(2026, 7, 18, 23, 0))).toBe(false);
    expect(isElevenAm(new Date(2026, 7, 18, 0, 0))).toBe(false);
  });
});
