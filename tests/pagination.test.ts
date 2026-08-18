import { describe, it, expect } from 'vitest';
import { pageSize, gridPageSize, pageCount, pageSlice } from '@/lib/pagination';

describe('pageSize', () => {
  it('floors the available height to whole items', () => {
    expect(pageSize(320, 84)).toBe(3); // 3.8 items of room → 3
  });

  it('exact division loses nothing', () => {
    expect(pageSize(336, 84)).toBe(4);
  });

  it('returns at least 1 when not even one item fits', () => {
    expect(pageSize(50, 84)).toBe(1);
    expect(pageSize(0, 84)).toBe(1);
    expect(pageSize(-200, 84)).toBe(1); // tiny window minus reserved px can go negative
  });
});

describe('gridPageSize', () => {
  it('multiplies whole rows by the column count', () => {
    expect(gridPageSize(884, 424, 4)).toBe(8); // 2 rows x 4 cols
  });

  it('exact division', () => {
    expect(gridPageSize(848, 424, 4)).toBe(8);
  });

  it('keeps one full row when not even one row fits', () => {
    expect(gridPageSize(100, 424, 4)).toBe(4);
    expect(gridPageSize(-50, 424, 4)).toBe(4);
  });
});

describe('pageCount', () => {
  it('0 or negative totals still yield a single page', () => {
    expect(pageCount(0, 5)).toBe(1);
    expect(pageCount(-3, 5)).toBe(1);
  });

  it('totals within one page yield 1', () => {
    expect(pageCount(4, 5)).toBe(1);
    expect(pageCount(5, 5)).toBe(1);
  });

  it('exact multiples do not add an empty trailing page', () => {
    expect(pageCount(10, 5)).toBe(2);
  });

  it('remainders round up', () => {
    expect(pageCount(11, 5)).toBe(3);
  });
});

describe('pageSlice', () => {
  const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];

  it('slices a middle page', () => {
    expect(pageSlice(items, 1, 3)).toEqual(['d', 'e', 'f']);
  });

  it('last page keeps only the remainder', () => {
    expect(pageSlice(items, 2, 3)).toEqual(['g']);
  });

  it('page 0 of an empty list is an empty array', () => {
    expect(pageSlice([], 0, 3)).toEqual([]);
  });

  it('an out-of-range page is an empty array', () => {
    expect(pageSlice(items, 5, 3)).toEqual([]);
  });
});
