// 轮播分页纯函数(设计 §2/§3):按屏幕高度算每页容量、页数与切片,
// 并把启用板块展开成轮播队列(expandSlides)。
import type { CarouselSlide } from './carousel';
import type { SlideConfig, SlideKey } from './settings';

/** 单列列表容量:max(1, floor(可用高度 ÷ 单条高度))。可用高度可为负(极小窗口),仍保底 1。 */
export function pageSize(availablePx: number, itemPx: number): number {
  return Math.max(1, Math.floor(availablePx / itemPx));
}

/** 网格容量:列数 × max(1, floor(可用高度 ÷ 行高))。 */
export function gridPageSize(availablePx: number, rowPx: number, columns: number): number {
  return columns * Math.max(1, Math.floor(availablePx / rowPx));
}

/** 页数:0 条(或负数)→ 1 页(渲染既有 "No data yet");否则 ceil(total ÷ perPage)。 */
export function pageCount(total: number, perPage: number): number {
  if (total <= 0) return 1;
  return Math.ceil(total / perPage);
}

/** 第 page 页(0 起)的条目;越界页返回空数组。 */
export function pageSlice<T>(items: T[], page: number, perPage: number): T[] {
  return items.slice(page * perPage, (page + 1) * perPage);
}

/**
 * 把启用板块展开成轮播队列(设计 §2):每个板块 pages = pageCount(counts, perPage),
 * 生成 page 0..pages-1 的连续步骤,每步同 durationSec、带 pageCount。
 * 调用方负责先过滤 enabled;缺失的 counts 当 0 条(得 1 页)、缺失的 perPage 当 1。
 */
export function expandSlides(
  slides: SlideConfig[],
  counts: Partial<Record<SlideKey, number>>,
  perPage: Partial<Record<SlideKey, number>>,
): CarouselSlide[] {
  return slides.flatMap((slide) => {
    const pages = pageCount(counts[slide.key] ?? 0, perPage[slide.key] ?? 1);
    return Array.from({ length: pages }, (_, page) => ({
      key: slide.key,
      durationSec: slide.durationSec,
      page,
      pageCount: pages,
    }));
  });
}
