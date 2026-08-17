import { describe, it, expect } from 'vitest';
import { periodRange, periodLabel } from '@/lib/domain/periods';

describe('periodRange', () => {
  it('month: mid-month date maps to [1st 00:00, 1st of next month)', () => {
    const { start, end } = periodRange('month', new Date(2026, 7, 17, 14, 30));
    expect(start.getTime()).toBe(new Date(2026, 7, 1).getTime());
    expect(end.getTime()).toBe(new Date(2026, 8, 1).getTime());
  });

  it('month: first day at midnight stays in the same month', () => {
    const { start, end } = periodRange('month', new Date(2026, 7, 1, 0, 0, 0));
    expect(start.getTime()).toBe(new Date(2026, 7, 1).getTime());
    expect(end.getTime()).toBe(new Date(2026, 8, 1).getTime());
  });

  it('month: December ends at January 1 of the next year', () => {
    const { start, end } = periodRange('month', new Date(2026, 11, 15));
    expect(start.getTime()).toBe(new Date(2026, 11, 1).getTime());
    expect(end.getTime()).toBe(new Date(2027, 0, 1).getTime());
  });

  it('week: starts Monday 00:00 local time', () => {
    // 2026-08-19 is a Wednesday; that week's Monday is 2026-08-17
    const { start, end } = periodRange('week', new Date(2026, 7, 19, 9, 0));
    expect(start.getTime()).toBe(new Date(2026, 7, 17).getTime());
    expect(end.getTime()).toBe(new Date(2026, 7, 24).getTime());
  });

  it('week: Sunday belongs to the week that started the previous Monday', () => {
    // 2026-08-16 is a Sunday → week of Monday 2026-08-10
    const { start, end } = periodRange('week', new Date(2026, 7, 16, 23, 59));
    expect(start.getTime()).toBe(new Date(2026, 7, 10).getTime());
    expect(end.getTime()).toBe(new Date(2026, 7, 17).getTime());
  });

  it('week: crosses the year boundary', () => {
    // 2026-01-01 is a Thursday → its week starts Monday 2025-12-29
    const { start, end } = periodRange('week', new Date(2026, 0, 1));
    expect(start.getTime()).toBe(new Date(2025, 11, 29).getTime());
    expect(end.getTime()).toBe(new Date(2026, 0, 5).getTime());
  });

  it('quarter: Q1-Q4 boundaries', () => {
    const q1 = periodRange('quarter', new Date(2026, 1, 10));
    expect(q1.start.getTime()).toBe(new Date(2026, 0, 1).getTime());
    expect(q1.end.getTime()).toBe(new Date(2026, 3, 1).getTime());

    const q2 = periodRange('quarter', new Date(2026, 4, 1));
    expect(q2.start.getTime()).toBe(new Date(2026, 3, 1).getTime());
    expect(q2.end.getTime()).toBe(new Date(2026, 6, 1).getTime());

    const q3 = periodRange('quarter', new Date(2026, 7, 17));
    expect(q3.start.getTime()).toBe(new Date(2026, 6, 1).getTime());
    expect(q3.end.getTime()).toBe(new Date(2026, 9, 1).getTime());

    const q4 = periodRange('quarter', new Date(2026, 11, 31));
    expect(q4.start.getTime()).toBe(new Date(2026, 9, 1).getTime());
    expect(q4.end.getTime()).toBe(new Date(2027, 0, 1).getTime());
  });

  it('year: full calendar year', () => {
    const { start, end } = periodRange('year', new Date(2026, 11, 31, 23, 59));
    expect(start.getTime()).toBe(new Date(2026, 0, 1).getTime());
    expect(end.getTime()).toBe(new Date(2027, 0, 1).getTime());
  });
});

describe('periodLabel', () => {
  it("month → 'AUGUST 2026' (uppercase month + year)", () => {
    expect(periodLabel('month', new Date(2026, 7, 17))).toBe('AUGUST 2026');
    expect(periodLabel('month', new Date(2026, 11, 5))).toBe('DECEMBER 2026');
  });

  it("week → 'WEEK OF 17 AUG' (Monday of that week)", () => {
    expect(periodLabel('week', new Date(2026, 7, 17))).toBe('WEEK OF 17 AUG');
    expect(periodLabel('week', new Date(2026, 7, 19))).toBe('WEEK OF 17 AUG');
    expect(periodLabel('week', new Date(2026, 0, 1))).toBe('WEEK OF 29 DEC');
  });

  it("quarter → 'Q3 2026'", () => {
    expect(periodLabel('quarter', new Date(2026, 1, 10))).toBe('Q1 2026');
    expect(periodLabel('quarter', new Date(2026, 7, 17))).toBe('Q3 2026');
    expect(periodLabel('quarter', new Date(2026, 11, 31))).toBe('Q4 2026');
  });

  it("year → '2026'", () => {
    expect(periodLabel('year', new Date(2026, 7, 17))).toBe('2026');
  });
});
