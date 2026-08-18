// 轮播分页纯函数(设计 §3):按屏幕高度算每页容量、页数与切片。
// Task 2 在本文件追加 expandSlides,把启用板块展开成轮播队列。

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
