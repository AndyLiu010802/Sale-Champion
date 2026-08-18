# 轮播分页(Slide Pagination)Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 电视端内容超过一屏时不再截断:同一板块按"数据量 ÷ 本屏每页容量"展开成连续多页,连续播完所有页再进下一板块,多页时右上角显示页码角标(`2/3`);为此解除服务端截断(榜单 top10→top50、房源 limit8→limit40、公告 slice5→cap40)。goals 页不分页。

**Architecture:** 展开式轮播队列——`CarouselSlide` 扩展为 `{ key, durationSec, page, pageCount }`,carousel reducer 推进逻辑零改动(只是数组变长);分页全部是客户端纯函数(`src/lib/pagination.ts`:pageSize/gridPageSize/pageCount/pageSlice/expandSlides),容量由 `window.innerHeight` 减各板块头部预留、除以定死的条目 CSS 高度得出;TvApp 用一个 effect 对 `[tvState, perPage]` 重算展开队列并沿用 sameSlides 守卫(比较维度扩展为 key+durationSec+page+pageCount),渲染时用 pageSlice 把当前页数据切给组件(组件 props 不变);页码角标由 TvApp 统一渲染 overlay。庆祝/生日打断与恢复机制不动。

**Tech Stack:** 与主项目一致(Next.js 15 / React 19 / Tailwind 3.4 / Vitest / Playwright),零新依赖。

**执行约定:**
- 基线:分支 `feature/slide-pagination`(**已存在且已检出**,HEAD `8c696eb`,含规格提交)。开工前确认:
  ```bash
  git rev-parse --abbrev-ref HEAD
  git status
  ```
  预期:输出 `feature/slide-pagination`;工作区干净。
- 基线测试数(已实测):`npx vitest run` → **18 files / 222 tests 全绿**(约 90s);E2E `npm run test:e2e` → **4 passed**。
- 按 Task 1→2→3→4 顺序执行,每个 Task 结束时 tsc 零输出、全量 vitest 全绿、有独立 commit。
- 规格:`docs/superpowers/specs/2026-08-18-slide-pagination-design.md`。
- 所有命令在项目根 `C:\Users\andyl\Desktop\工作文档\TV SaaS` 执行(命令均为跨平台 `npx`/`npm` 形式,PowerShell 可直接用)。
- 本计划不新增 API route(Next.js 15 params-Promise 约定不涉及);**不改 goals 页**(`GoalSlide.tsx` 的 `slice(0, 4)` 原样保留)。
- 每页容量在 1080p 下的设计值(供理解,代码里有对应常量):榜单 10 行/页、房源 2 行×4 列=8 卡/页、公告 3 卡/页——与现状视觉一致(单页、无角标);520px 高的小屏(E2E 用):榜单 3 行/页、房源 4 卡/页、公告 1 卡/页。

---
### Task 1: 分页纯函数 + 解除服务端截断

**Files:**
- Create: `src/lib/pagination.ts`(pageSize/gridPageSize/pageCount/pageSlice)
- Create: `tests/pagination.test.ts`(新,14 用例)
- Modify: `src/lib/domain/leaderboard.ts`(top10 → top50,导出 `LEADERBOARD_LIMIT`)
- Modify: `tests/domain/leaderboard.test.ts`(top10 截断用例改写为 12 人全出现 + 新增 50 封顶用例)
- Modify: `src/app/api/tv/state/route.ts`(listings limit 8 → 40)
- Modify: `src/lib/types.ts`(TvStateResponse 注释 limit 8 → 40)
- Modify: `tests/api/tv-state.test.ts`(**现状已读:文件里没有任何 8 条上限断言**,无需改既有用例;按规格 §5 新增一个 45 条→40 条的集成用例)

- [ ] **Step 1: 写分页纯函数测试(先测试)**

  创建 `tests/pagination.test.ts`:

  ```ts
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
  ```

- [ ] **Step 2: 运行确认失败**

  ```bash
  npx vitest run tests/pagination.test.ts
  ```

  预期失败:模块解析错误(`Failed to resolve import "@/lib/pagination"`),整个文件无法加载——`src/lib/pagination.ts` 尚不存在。

- [ ] **Step 3: 实现 src/lib/pagination.ts(契约权威签名)**

  创建 `src/lib/pagination.ts`:

  ```ts
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
  ```

- [ ] **Step 4: 转绿**

  ```bash
  npx vitest run tests/pagination.test.ts
  ```

  预期:4 个 describe 共 **14 个用例**全部通过。

- [ ] **Step 5: 改写 leaderboard 截断用例 + 新增 50 封顶用例(先测试)**

  修改 `tests/domain/leaderboard.test.ts`。找到(逐字):

  ```ts
    it('truncates to top 10 with ranks 1..10', () => {
      const agents = [];
      const salesRows = [];
      for (let i = 1; i <= 12; i++) {
        const id = `a${String(i).padStart(2, '0')}`;
        agents.push(agent(id, `Agent ${String(i).padStart(2, '0')}`));
        salesRows.push(sale(id, i * 100_000, '2026-08-05'));
      }
      const rows = computeLeaderboard({ agents, sales: salesRows, listings: [] }, 'gci', AUG);
      expect(rows).toHaveLength(10);
      expect(rows[0]).toMatchObject({ agentId: 'a12', value: 1_200_000, rank: 1 });
      expect(rows[9]).toMatchObject({ agentId: 'a03', value: 300_000, rank: 10 });
      expect(rows.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    });
  ```

  替换为:

  ```ts
    it('keeps every qualifying agent below the 50 cap (12 agents all appear)', () => {
      const agents = [];
      const salesRows = [];
      for (let i = 1; i <= 12; i++) {
        const id = `a${String(i).padStart(2, '0')}`;
        agents.push(agent(id, `Agent ${String(i).padStart(2, '0')}`));
        salesRows.push(sale(id, i * 100_000, '2026-08-05'));
      }
      const rows = computeLeaderboard({ agents, sales: salesRows, listings: [] }, 'gci', AUG);
      expect(rows).toHaveLength(12);
      expect(rows[0]).toMatchObject({ agentId: 'a12', value: 1_200_000, rank: 1 });
      expect(rows[11]).toMatchObject({ agentId: 'a01', value: 100_000, rank: 12 });
      expect(rows.map((r) => r.rank)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
    });

    it('caps the board at 50 entries (safety cap, TV paginates client-side)', () => {
      const agents = [];
      const salesRows = [];
      for (let i = 1; i <= 55; i++) {
        const id = `a${String(i).padStart(2, '0')}`;
        agents.push(agent(id, `Agent ${String(i).padStart(2, '0')}`));
        salesRows.push(sale(id, i * 100_000, '2026-08-05'));
      }
      const rows = computeLeaderboard({ agents, sales: salesRows, listings: [] }, 'gci', AUG);
      expect(rows).toHaveLength(50);
      expect(rows[0]).toMatchObject({ agentId: 'a55', rank: 1 });
      expect(rows[49]).toMatchObject({ agentId: 'a06', rank: 50 });
    });
  ```

- [ ] **Step 6: 运行确认失败**

  ```bash
  npx vitest run tests/domain/leaderboard.test.ts
  ```

  预期失败:两个新用例分别在 `expect(rows).toHaveLength(12)` 报 `expected [...] to have a length of 12 but got 10`、在 `toHaveLength(50)` 报 got 10;其余 13 个既有用例通过。

- [ ] **Step 7: 修改 leaderboard.ts 解除 top10**

  修改 `src/lib/domain/leaderboard.ts`。找到:

  ```ts
  /** Safe numeric compare (handles Infinity vs Infinity without NaN). */
  function cmp(a: number, b: number): number {
    return a < b ? -1 : a > b ? 1 : 0;
  }
  ```

  替换为:

  ```ts
  /** Safe numeric compare (handles Infinity vs Infinity without NaN). */
  function cmp(a: number, b: number): number {
    return a < b ? -1 : a > b ? 1 : 0;
  }

  /** 安全封顶:电视端分页后全量展示,50 仅防极端数据撑爆载荷(设计 §4)。 */
  export const LEADERBOARD_LIMIT = 50;
  ```

  再找到:

  ```ts
    return rows.slice(0, 10).map((r, i) => ({
  ```

  替换为:

  ```ts
    return rows.slice(0, LEADERBOARD_LIMIT).map((r, i) => ({
  ```

- [ ] **Step 8: 转绿**

  ```bash
  npx vitest run tests/domain/leaderboard.test.ts
  ```

  预期:**15 个用例**全部通过(原 14 个:改写 1 个、新增 1 个)。

- [ ] **Step 9: tv/state 房源 limit 40 集成用例(先测试)**

  修改 `tests/api/tv-state.test.ts`。找到(逐字,唯一锚点):

  ```ts
    it('caps goal percent at 100', async () => {
  ```

  替换为(在其前插入新用例):

  ```ts
    it('returns up to 40 active listings (was 8)', async () => {
      const today = localDateStr(new Date());
      await db.insert(listings).values(
        Array.from({ length: 45 }, (_, i) => ({
          id: crypto.randomUUID(),
          orgId: basics.orgId,
          agentId: basics.agentId,
          address: `${i + 1} Volume Street`,
          listPriceCents: 50_000_000 + i,
          listedDate: today,
          status: 'active',
        })),
      );

      const res = await tvStateGet(stateRequest(token));
      expect(res.status).toBe(200);
      const { data } = await res.json();
      // 45 条 active 只回 40(安全封顶);listedDate 相同,不断言被截掉的是哪 5 条。
      expect(data.listings).toHaveLength(40);
    });

    it('caps goal percent at 100', async () => {
  ```

  文件顶部已导入 `listings`,无需加 import。

- [ ] **Step 10: 运行确认失败**

  ```bash
  npx vitest run tests/api/tv-state.test.ts
  ```

  预期失败:新用例在 `toHaveLength(40)` 报 `expected [...] to have a length of 40 but got 8`(route 仍是 `limit(8)`);其余 5 个既有用例通过。

- [ ] **Step 11: route limit 40 + types 注释同步**

  修改 `src/app/api/tv/state/route.ts`。找到:

  ```ts
      .orderBy(desc(listings.listedDate))
      .limit(8);
  ```

  替换为:

  ```ts
      .orderBy(desc(listings.listedDate))
      // 安全封顶:电视端分页后全量展示,40 仅防极端数据撑爆载荷(设计 §4)。
      .limit(40);
  ```

  修改 `src/lib/types.ts`。找到:

  ```ts
    listings: TvListing[];                              // status='active', listedDate desc, limit 8
  ```

  替换为:

  ```ts
    listings: TvListing[];                              // status='active', listedDate desc, limit 40
  ```

- [ ] **Step 12: 转绿 + 全仓校验**

  ```bash
  npx vitest run tests/pagination.test.ts tests/domain/leaderboard.test.ts tests/api/tv-state.test.ts
  npx tsc --noEmit
  npx vitest run
  ```

  预期:三文件合计 **35 个用例**通过(14+15+6);tsc 零输出;全量 **19 files / 238 tests** 全绿(222 + 14 + 1 + 1;别的文件不受影响——TvApp 仍消费数组全量,只是数组可能变长,现有渲染各自 slice/overflow 兜底,行为到 Task 3 才改)。

- [ ] **Step 13: Commit**

  ```bash
  git add src/lib/pagination.ts tests/pagination.test.ts src/lib/domain/leaderboard.ts tests/domain/leaderboard.test.ts src/app/api/tv/state/route.ts src/lib/types.ts tests/api/tv-state.test.ts
  git commit -m "feat: pagination pure functions and lifted server truncation caps"
  ```

---
### Task 2: carousel 扩展 page/pageCount + 队列展开函数

**Files:**
- Modify: `src/lib/carousel.ts`(`CarouselSlide` +page/pageCount;reducer 逻辑零改动)
- Modify: `src/lib/pagination.ts`(+`expandSlides`)
- Modify: `src/components/tv/TvApp.tsx`(**过渡态最小改动**:refreshState 的 map 补 `page: 0, pageCount: 1`,保任务边界 tsc 干净;真正接入在 Task 3)
- Test: `tests/pagination.test.ts`(+expandSlides 4 用例)
- Test: `tests/carousel.test.ts`(slide fixture 机械补 `page: 0, pageCount: 1`,用例数不变)

- [ ] **Step 1: pagination.test.ts 追加 expandSlides 用例(先测试)**

  修改 `tests/pagination.test.ts`。找到:

  ```ts
  import { pageSize, gridPageSize, pageCount, pageSlice } from '@/lib/pagination';
  ```

  替换为:

  ```ts
  import { expandSlides, pageSize, gridPageSize, pageCount, pageSlice } from '@/lib/pagination';
  import type { SlideConfig } from '@/lib/settings';
  ```

  在文件末尾追加:

  ```ts

  describe('expandSlides', () => {
    const enabled = (key: SlideConfig['key'], durationSec: number): SlideConfig =>
      ({ key, enabled: true, durationSec });

    it('expands a multi-page slide into consecutive steps sharing the full duration', () => {
      const out = expandSlides(
        [enabled('leaderboard_sales_count', 15), enabled('listings', 12)],
        { leaderboard_sales_count: 4, listings: 3 },
        { leaderboard_sales_count: 3, listings: 8 },
      );
      expect(out).toEqual([
        { key: 'leaderboard_sales_count', durationSec: 15, page: 0, pageCount: 2 },
        { key: 'leaderboard_sales_count', durationSec: 15, page: 1, pageCount: 2 },
        { key: 'listings', durationSec: 12, page: 0, pageCount: 1 },
      ]);
    });

    it('single-page slides expand to exactly one step', () => {
      const out = expandSlides([enabled('announcements', 10)], { announcements: 5 }, { announcements: 5 });
      expect(out).toEqual([{ key: 'announcements', durationSec: 10, page: 0, pageCount: 1 }]);
    });

    it('zero items still yield one page (renders the existing "No data yet")', () => {
      const out = expandSlides([enabled('listings', 12)], { listings: 0 }, { listings: 8 });
      expect(out).toEqual([{ key: 'listings', durationSec: 12, page: 0, pageCount: 1 }]);
    });

    it('missing counts/perPage entries default to 0 items on 1-per-page (single page)', () => {
      const out = expandSlides([enabled('goal_progress', 10)], {}, {});
      expect(out).toEqual([{ key: 'goal_progress', durationSec: 10, page: 0, pageCount: 1 }]);
    });
  });
  ```

- [ ] **Step 2: 运行确认失败**

  ```bash
  npx vitest run tests/pagination.test.ts
  ```

  预期失败:4 个新用例全部失败——`expandSlides` 不是 `@/lib/pagination` 的导出(vitest 报 `does not provide an export named 'expandSlides'` 或 `expandSlides is not a function`);既有 14 个用例不受影响(若因导入错误整文件加载失败也算红,继续即可)。

- [ ] **Step 3: carousel.test.ts fixture 机械补 page/pageCount**

  修改 `tests/carousel.test.ts`。找到:

  ```ts
  const slides: CarouselSlide[] = [
    { key: 'leaderboard_sales_count', durationSec: 10 },
    { key: 'leaderboard_gci', durationSec: 15 },
    { key: 'goal_progress', durationSec: 5 },
  ];

  const altSlides: CarouselSlide[] = [
    { key: 'listings', durationSec: 12 },
    { key: 'announcements', durationSec: 8 },
  ];
  ```

  替换为:

  ```ts
  const slides: CarouselSlide[] = [
    { key: 'leaderboard_sales_count', durationSec: 10, page: 0, pageCount: 1 },
    { key: 'leaderboard_gci', durationSec: 15, page: 0, pageCount: 1 },
    { key: 'goal_progress', durationSec: 5, page: 0, pageCount: 1 },
  ];

  const altSlides: CarouselSlide[] = [
    { key: 'listings', durationSec: 12, page: 0, pageCount: 1 },
    { key: 'announcements', durationSec: 8, page: 0, pageCount: 1 },
  ];
  ```

  其余断言全部不动(断言用 `toEqual(slides)`/durationSec 推导,fixture 补字段即自洽)。

- [ ] **Step 4: 实现——carousel 类型扩展 + expandSlides + TvApp 过渡态**

  ① 修改 `src/lib/carousel.ts`。找到:

  ```ts
  export type CarouselSlide = { key: SlideKey; durationSec: number };
  ```

  替换为:

  ```ts
  // page/pageCount:展开式轮播队列(设计 §2)——一个板块的第 page 页(0 起)在队列里是
  // 独立一步,享有该板块完整 durationSec;reducer 推进逻辑不感知分页(数组变长而已)。
  export type CarouselSlide = { key: SlideKey; durationSec: number; page: number; pageCount: number };
  ```

  `initCarousel`/`carouselReducer`/`MIN_RESUME_MS` 全部原样不动。

  ② 修改 `src/lib/pagination.ts`。找到文件头两行注释:

  ```ts
  // 轮播分页纯函数(设计 §3):按屏幕高度算每页容量、页数与切片。
  // Task 2 在本文件追加 expandSlides,把启用板块展开成轮播队列。
  ```

  替换为:

  ```ts
  // 轮播分页纯函数(设计 §2/§3):按屏幕高度算每页容量、页数与切片,
  // 并把启用板块展开成轮播队列(expandSlides)。
  import type { CarouselSlide } from './carousel';
  import type { SlideConfig, SlideKey } from './settings';
  ```

  在文件末尾追加:

  ```ts

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
  ```

  (pagination.ts → carousel.ts 是 type-only import,carousel.ts 不回引 pagination.ts,无环。)

  ③ 修改 `src/components/tv/TvApp.tsx`(过渡态,保 tsc 绿)。找到:

  ```ts
        const nextSlides = json.data.settings.slides
          .filter((s) => s.enabled)
          .map((s) => ({ key: s.key, durationSec: s.durationSec }));
  ```

  替换为:

  ```ts
        // 过渡态(Task 2):CarouselSlide 已带 page/pageCount,先恒单页;
        // Task 3 换成 expandSlides 按屏幕高度真正展开。
        const nextSlides = json.data.settings.slides
          .filter((s) => s.enabled)
          .map((s) => ({ key: s.key, durationSec: s.durationSec, page: 0, pageCount: 1 }));
  ```

  (此时 `sameSlides` 仍只比较 key+durationSec——过渡态恒 page:0/pageCount:1,行为等价;比较维度扩展放 Task 3。)

- [ ] **Step 5: 转绿 + 全仓校验**

  ```bash
  npx vitest run tests/carousel.test.ts tests/pagination.test.ts
  npx tsc --noEmit
  npx vitest run
  ```

  预期:carousel **20 个**、pagination **18 个**(14+4)全部通过;tsc 零输出(若报 TvApp 缺 page/pageCount,回查 Step 4 ③);全量 **19 files / 242 tests** 全绿。

- [ ] **Step 6: Commit**

  ```bash
  git add src/lib/carousel.ts src/lib/pagination.ts src/components/tv/TvApp.tsx tests/carousel.test.ts tests/pagination.test.ts
  git commit -m "feat: expand carousel queue into per-page slides"
  ```

---
### Task 3: TvApp 接入 + 定高 CSS + 页码角标

**Files:**
- Modify: `src/components/tv/slides/LeaderboardSlide.tsx`(行定高 h-[72px])
- Modify: `src/components/tv/slides/ListingsSlide.tsx`(卡定高 h-[400px]、去 grid-rows-2、去内部 slice(0,8))
- Modify: `src/components/tv/slides/AnnouncementSlide.tsx`(卡定高 h-[224px])
- Modify: `src/components/tv/TvApp.tsx`(容量常量、useWindowHeight、展开队列 effect、pageSlice 渲染、页码角标、sameSlides 扩展)

本任务无组件级单测(项目一贯做法:TV 组件行为由 E2E 兜底,Task 4 补 E2E);任务内以 tsc + 全量回归 + `npm run build` 验证。定高取值原则:与现状 1080p 视觉尽量一致——榜单行 72px = 头像 h-14(56)+ 原 py-2 上下各 8;房源卡 400px ≈ 现状 grid-rows-2 在 1080p 下拉伸出的卡高(884−24)/2≈430 的近似值且保证 1080p 仍 2 行 8 卡;公告卡 224px = 图 h-40(160)+ p-8 上下各 32。**这些像素值与 TvApp 常量一一对应,改任何一边必须同步另一边。**

- [ ] **Step 1: LeaderboardSlide 行定高**

  修改 `src/components/tv/slides/LeaderboardSlide.tsx`。找到:

  ```tsx
          <div className="mt-10 flex flex-1 flex-col justify-start gap-3">
  ```

  替换为:

  ```tsx
          <div className="mt-10 flex flex-1 flex-col justify-start gap-3 overflow-hidden">
  ```

  再找到:

  ```tsx
                className={`flex items-center gap-8 rounded-lg border-l-4 bg-panel px-8 py-2 ${rowBorderClass(entry.rank)}`}
  ```

  替换为:

  ```tsx
                className={`flex h-[72px] shrink-0 items-center gap-8 rounded-lg border-l-4 bg-panel px-8 ${rowBorderClass(entry.rank)}`}
  ```

  (72px = 头像 56 + 原 py-2 的 8×2,items-center 垂直居中,视觉不变;py-2 由定高取代。对应 TvApp `LEADERBOARD_ITEM_PX = 84` = 72 + gap-3 的 12。)

- [ ] **Step 2: ListingsSlide 卡定高 + 去固定 2 行 + 去内部截断**

  修改 `src/components/tv/slides/ListingsSlide.tsx`。找到:

  ```tsx
          <div className="mt-10 grid flex-1 grid-cols-4 grid-rows-2 gap-6">
            {listings.slice(0, 8).map((listing, i) => (
  ```

  替换为:

  ```tsx
          <div className="mt-10 grid flex-1 content-start grid-cols-4 gap-6 overflow-hidden">
            {listings.map((listing, i) => (
  ```

  (行数改由 TvApp 分页容量决定,不再定死 2 行;`content-start` 防 auto 行被拉伸;截断上移到 TvApp 的 pageSlice——每页条数可能不是 8。)

  再找到:

  ```tsx
                className="flex flex-col overflow-hidden rounded-xl bg-panel"
  ```

  替换为:

  ```tsx
                className="flex h-[400px] flex-col overflow-hidden rounded-xl bg-panel"
  ```

  (400px:图 192 + 内容区 208,flex-1/justify-between 撑满,接近现状 1080p 卡高;对应 TvApp `LISTINGS_ROW_PX = 424` = 400 + gap-6 的 24,1080p 下 (1080−196)/424 = 2 行 → 8 卡/页与现状一致。)

- [ ] **Step 3: AnnouncementSlide 卡定高**

  修改 `src/components/tv/slides/AnnouncementSlide.tsx`。找到:

  ```tsx
                className="flex items-start gap-8 rounded-xl bg-panel p-8"
  ```

  替换为:

  ```tsx
                className="flex h-[224px] shrink-0 items-start gap-8 rounded-xl bg-panel p-8"
  ```

  (224px = 图 h-40 的 160 + p-8 上下各 32;正文已 line-clamp-2(标题 40 + mt-3 12 + 两行 78 ≈ 130 < 160),定高不裁内容;容器已有 overflow-hidden。对应 TvApp `ANNOUNCEMENT_ITEM_PX = 248` = 224 + gap-6 的 24。)

- [ ] **Step 4: TvApp 全文件覆盖(接入展开队列 + 角标)**

  用以下完整内容覆盖 `src/components/tv/TvApp.tsx`(相对现状的变化:新增容量常量区与 `useWindowHeight`;`sameSlides` 比较维度 +page/pageCount;refreshState 只 setTvState,setSlides 移入对 `[tvState, perPage]` 的新 effect;slideContent 用 pageSlice 切当前页;公告 slice(0,5) 改 cap 40;新增页码角标 overlay。其余——refs、socket 处理器、hourly/tick 定时器、celebration 渲染——逐字保留):

  ```tsx
  'use client';

  import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
  import { AnimatePresence, motion } from 'framer-motion';
  import { useTvSocket } from '@/hooks/useTvSocket';
  import { carouselReducer, initCarousel, type CarouselSlide, type QueuedCelebration } from '@/lib/carousel';
  import { expandSlides, gridPageSize, pageSize, pageSlice } from '@/lib/pagination';
  import type { SlideKey } from '@/lib/settings';
  import type { TvStateResponse } from '@/lib/types';
  import PairingScreen from '@/components/tv/PairingScreen';
  import StartOverlay from '@/components/tv/StartOverlay';
  import OfflineBadge from '@/components/tv/OfflineBadge';
  import CelebrationOverlay from '@/components/tv/CelebrationOverlay';
  import LeaderboardSlide from '@/components/tv/slides/LeaderboardSlide';
  import GoalSlide from '@/components/tv/slides/GoalSlide';
  import ListingsSlide from '@/components/tv/slides/ListingsSlide';
  import AnnouncementSlide from '@/components/tv/slides/AnnouncementSlide';

  // —— 每页容量常量:像素值与各 slide 组件的定高 CSS 同步,改组件样式必须同步这里 ——
  // LeaderboardSlide:行 h-[72px] + 行间 gap-3(12px)。
  const LEADERBOARD_ITEM_PX = 84;
  // ListingsSlide:卡 h-[400px] + gap-6(24px);列数固定 4(grid-cols-4)。
  const LISTINGS_ROW_PX = 424;
  const LISTINGS_COLUMNS = 4;
  // AnnouncementSlide:卡 h-[224px] + 卡间 gap-6(24px)。
  const ANNOUNCEMENT_ITEM_PX = 248;
  // 三个分页板块头部预留一致:py-12 上 48 + 标题 text-6xl 60 + mt-10 40 + py-12 下 48。
  const SLIDE_RESERVED_PX = 196;
  // 公告安全封顶(设计 §4:原 slice(0,5) 截断改为 cap 40 后分页)。
  const ANNOUNCEMENTS_CAP = 40;

  /** Order-sensitive shallow compare so an identical settings payload never resets the
   *  current slide's countdown. 展开队列后比较维度含 page/pageCount(设计 §2)。 */
  function sameSlides(a: CarouselSlide[], b: CarouselSlide[]): boolean {
    if (a.length !== b.length) return false;
    return a.every((s, i) =>
      s.key === b[i].key && s.durationSec === b[i].durationSec
      && s.page === b[i].page && s.pageCount === b[i].pageCount);
  }

  /** window.innerHeight,监听 resize;SSR 渲染期取 1080 兜底(客户端首次渲染即真实值)。 */
  function useWindowHeight(): number {
    const [height, setHeight] = useState(() =>
      (typeof window === 'undefined' ? 1080 : window.innerHeight));
    useEffect(() => {
      const onResize = () => setHeight(window.innerHeight);
      onResize(); // 挂载即校正一次,防 SSR 兜底值残留
      window.addEventListener('resize', onResize);
      return () => window.removeEventListener('resize', onResize);
    }, []);
    return height;
  }

  export default function TvApp() {
    const [tvState, setTvState] = useState<TvStateResponse | null>(null);
    const [audioUnlocked, setAudioUnlocked] = useState(false);
    const [carousel, dispatch] = useReducer(carouselReducer, [], initCarousel);
    const windowHeight = useWindowHeight();

    // Mirrors `carousel` for the expand effect to read without becoming a dependency —
    // keeps effect identities stable across ticks/celebrations while still letting
    // them compare against the latest slides before dispatching.
    const carouselRef = useRef(carousel);
    useEffect(() => {
      carouselRef.current = carousel;
    }, [carousel]);

    // Mirrors `audioUnlocked` for the onCelebration WS handler, which must decide
    // buffer-vs-dispatch against the latest value (same ref pattern useTvSocket uses
    // internally for its own handlers).
    const audioUnlockedRef = useRef(audioUnlocked);
    useEffect(() => {
      audioUnlockedRef.current = audioUnlocked;
    }, [audioUnlocked]);

    // Celebrations that arrive before the viewer has unlocked audio (StartOverlay still
    // showing): browsers block autoplay with sound pre-gesture, so we can't play the
    // anthem yet. Buffer them here and flush into the reducer's FIFO queue once unlocked.
    const pendingCelebrations = useRef<QueuedCelebration[]>([]);

    const celebrationSeq = useRef(0);

    // Discards stale /api/tv/state responses that resolve out of order (e.g. a slow
    // response from an earlier refresh landing after a newer one already completed).
    const requestSeq = useRef(0);

    const refreshState = useCallback(async () => {
      const token = localStorage.getItem('tv_device_token');
      if (!token) return;
      const seq = ++requestSeq.current;
      try {
        const res = await fetch('/api/tv/state', { headers: { 'x-device-token': token } });
        if (seq !== requestSeq.current) return; // a newer refresh has since started; drop this one
        if (!res.ok) return;
        const json = (await res.json()) as { data: TvStateResponse };
        if (seq !== requestSeq.current) return; // re-check: a newer refresh may have started while awaiting res.json()
        // setSlides 不在这里发:展开队列由数据与窗口高度共同决定,统一交给下面的 effect。
        setTvState(json.data);
      } catch (err) {
        console.warn('Failed to fetch TV state', err);
      }
    }, []);

    const socket = useTvSocket({
      onCelebration: (payload) => {
        // clientId: locally generated stable mount key — the same sale replayed
        // twice still remounts the overlay (saleId alone could not tell them apart).
        // Counter ref, not crypto.randomUUID(): TVs open /tv over plain LAN http
        // (non-secure context) where crypto.randomUUID is unavailable.
        const queued: QueuedCelebration = { ...payload, clientId: `c${++celebrationSeq.current}` };
        if (!audioUnlockedRef.current) {
          pendingCelebrations.current.push(queued);
          return;
        }
        dispatch({ type: 'celebration', payload: queued });
      },
      onDataUpdated: () => {
        void refreshState();
      },
      onConfigUpdated: () => {
        void refreshState();
      },
      onPaired: () => {
        void refreshState();
      },
      onUnpaired: () => {
        setTvState(null);
        dispatch({ type: 'reset' });
        pendingCelebrations.current = [];
      },
    });

    useEffect(() => {
      if (socket.phase === 'paired') void refreshState();
    }, [socket.phase, refreshState]);

    // Hourly fallback refresh: keeps leaderboard period rollover (new week/month/
    // quarter) and periodLabel current even when no data events arrive (spec §5/§12).
    useEffect(() => {
      if (socket.phase !== 'paired') return;
      const timer = setInterval(() => void refreshState(), 60 * 60 * 1000);
      return () => clearInterval(timer);
    }, [socket.phase, refreshState]);

    // Keep rotating while offline too — cached data + OfflineBadge (spec §8);
    // only connecting/pairing (no data yet) and locked audio stop the carousel.
    useEffect(() => {
      if (!audioUnlocked || (socket.phase !== 'paired' && socket.phase !== 'offline')) return;
      const timer = setInterval(() => dispatch({ type: 'tick', dtMs: 250 }), 250);
      return () => clearInterval(timer);
    }, [audioUnlocked, socket.phase]);

    // 每板块每页容量(设计 §3)。三个榜单共用一套行 CSS → 同一容量;goal_progress 不分页恒 1。
    const perPage = useMemo<Record<SlideKey, number>>(() => {
      const leaderboard = pageSize(windowHeight - SLIDE_RESERVED_PX, LEADERBOARD_ITEM_PX);
      return {
        leaderboard_sales_count: leaderboard,
        leaderboard_gci: leaderboard,
        leaderboard_listings: leaderboard,
        goal_progress: 1,
        listings: gridPageSize(windowHeight - SLIDE_RESERVED_PX, LISTINGS_ROW_PX, LISTINGS_COLUMNS),
        announcements: pageSize(windowHeight - SLIDE_RESERVED_PX, ANNOUNCEMENT_ITEM_PX),
      };
    }, [windowHeight]);

    // 数据/设置刷新或窗口高度变化 → 重算展开队列(设计 §2);sameSlides 守卫让相同内容
    // 不重置当前页倒计时(data.updated 触发的刷新常常内容不变)。
    useEffect(() => {
      if (!tvState) return;
      const counts: Record<SlideKey, number> = {
        leaderboard_sales_count: tvState.leaderboards.sales_count.length,
        leaderboard_gci: tvState.leaderboards.gci.length,
        leaderboard_listings: tvState.leaderboards.listings.length,
        goal_progress: 1, // 恒 1 页;GoalSlide 自身 slice(0,4) 不动(非目标)
        listings: tvState.listings.length,
        announcements: Math.min(tvState.announcements.length, ANNOUNCEMENTS_CAP),
      };
      const nextSlides = expandSlides(tvState.settings.slides.filter((s) => s.enabled), counts, perPage);
      if (!sameSlides(carouselRef.current.slides, nextSlides)) {
        dispatch({ type: 'setSlides', slides: nextSlides });
      }
    }, [tvState, perPage]);

    const handleCelebrationDone = useCallback(() => dispatch({ type: 'celebrationDone' }), []);

    const handleStart = useCallback(() => {
      audioUnlockedRef.current = true;
      setAudioUnlocked(true);
      // Flush anything that arrived while audio was still locked, in original order;
      // the reducer's existing FIFO queue takes it from here.
      const queued = pendingCelebrations.current;
      pendingCelebrations.current = [];
      queued.forEach((payload) => dispatch({ type: 'celebration', payload }));
    }, []);

    const currentSlide = carousel.slides.length > 0 ? carousel.slides[carousel.index] : null;

    // Memoized so a bare 250ms tick (which only changes carousel.remainingMs) doesn't
    // rebuild the slide subtree — deliberately excludes remainingMs from deps.
    const slideContent = useMemo<ReactNode>(() => {
      if (!tvState || !currentSlide) {
        return (
          <div className="flex h-full items-center justify-center">
            <p className="font-display text-5xl text-muted">SALES CHAMPIONS TV</p>
          </div>
        );
      }
      const page = currentSlide.page;
      switch (currentSlide.key) {
        case 'leaderboard_sales_count':
          return (
            <LeaderboardSlide
              title="SALES CHAMPIONS"
              metric="sales_count"
              entries={pageSlice(tvState.leaderboards.sales_count, page, perPage.leaderboard_sales_count)}
              periodLabel={tvState.periodLabel}
            />
          );
        case 'leaderboard_gci':
          return (
            <LeaderboardSlide
              title="TOP EARNERS"
              metric="gci"
              entries={pageSlice(tvState.leaderboards.gci, page, perPage.leaderboard_gci)}
              periodLabel={tvState.periodLabel}
            />
          );
        case 'leaderboard_listings':
          return (
            <LeaderboardSlide
              title="LISTING LEGENDS"
              metric="listings"
              entries={pageSlice(tvState.leaderboards.listings, page, perPage.leaderboard_listings)}
              periodLabel={tvState.periodLabel}
            />
          );
        case 'goal_progress':
          return <GoalSlide goals={tvState.goals} />;
        case 'listings':
          return <ListingsSlide listings={pageSlice(tvState.listings, page, perPage.listings)} />;
        case 'announcements':
          return (
            <AnnouncementSlide
              announcements={pageSlice(
                tvState.announcements.slice(0, ANNOUNCEMENTS_CAP), page, perPage.announcements,
              )}
            />
          );
        default:
          return null;
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps -- currentSlide is derived
      // purely from carousel.index/carousel.slides, both already listed below.
    }, [carousel.index, carousel.slides, tvState, perPage]);

    if (socket.phase === 'connecting' || socket.phase === 'pairing') {
      return <PairingScreen pairCode={socket.pairCode} />;
    }

    return (
      <div className="relative h-screen w-screen overflow-hidden bg-bg">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentSlide ? `${currentSlide.key}-${carousel.index}` : 'idle'}
            className="h-full w-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
          >
            {slideContent}
          </motion.div>
        </AnimatePresence>

        {/* 页码角标(设计 §2):多页才显示;右上角弱霓虹,避开右下 OfflineBadge。 */}
        {currentSlide && currentSlide.pageCount > 1 ? (
          <div
            className="fixed right-8 top-8 z-40 font-heading text-3xl text-muted"
            style={{ textShadow: '0 0 12px rgba(0, 229, 255, 0.35)' }}
          >
            {currentSlide.page + 1}/{currentSlide.pageCount}
          </div>
        ) : null}

        <AnimatePresence>
          {carousel.mode === 'celebrate' && carousel.current ? (
            <CelebrationOverlay
              key={carousel.current.clientId}
              payload={carousel.current}
              volume={tvState ? tvState.settings.volume : 0.8}
              onDone={handleCelebrationDone}
            />
          ) : null}
        </AnimatePresence>

        {!audioUnlocked ? <StartOverlay onStart={handleStart} /> : null}
        {socket.phase === 'offline' ? <OfflineBadge /> : null}
      </div>
    );
  }
  ```

  实现细节说明(执行时核对):
  - 分页翻页动画:motion.div 的 key 已含 `carousel.index`,每页是队列独立一步 → index 不同 → 自动沿用现有 0.4s 淡入淡出,无需额外动画代码。
  - 页码内容元素文本恰为 `1/2` 这种形式(Task 4 E2E 用 `exact: true` 断言)。
  - resize → perPage 变 → nextSlides 与当前不同 → setSlides(reducer 既有语义:index 取模保留、当前步倒计时重置)——设计接受。
  - 榜单第 2 页的 rank 徽章/描边仍按 entry.rank(服务端已算好)显示 4..N,颜色逻辑不变。

- [ ] **Step 5: 全仓校验(本任务无单测,红绿由 Task 4 E2E 兜底)**

  ```bash
  npx tsc --noEmit
  npx vitest run
  npm run build
  ```

  预期:tsc 零输出;全量 **242 tests** 全绿(本任务纯 UI 接入,无单测增减);Next.js 生产构建成功(useWindowHeight 有 `typeof window` SSR 防护,TvApp 是 client 组件,构建无 SSR 报错)。

  (可选人工冒烟:`npm run db:seed -- --demo` + `npm run dev`,浏览器开 `/tv` 把窗口压到约 500px 高,配对后应看到榜单右上角 `1/2` 并在 15s 后翻到 `2/2`。)

- [ ] **Step 6: Commit**

  ```bash
  git add src/components/tv/slides/LeaderboardSlide.tsx src/components/tv/slides/ListingsSlide.tsx src/components/tv/slides/AnnouncementSlide.tsx src/components/tv/TvApp.tsx
  git commit -m "feat: paginate tv slides by screen height with page badge"
  ```

---
### Task 4: E2E 分页用例 + 全量回归

**Files:**
- Modify: `e2e/tv-flow.spec.ts`(pairTv 接受可选 tvViewport 参数 + 新用例)

pairTv 是共享 helper 且**在内部自建 tvPage**(已读现状确认),按最小改动方案给它加可选 viewport 参数(不内联复制整个配对流程)。数据前提(e2e/start-server.ts 的 demo seed,已读确认):4 个销售员,三个榜单各 4 条;520px 高时榜单每页 3 行((520−196)/84=3.86→3)→ **2 页(3+1)**,断言 `1/2` → `2/2` 成立。前面的用例(同文件串行)会给某个已有销售员加成交,但榜单条目数恒为 4,不影响页数。

- [ ] **Step 1: pairTv 加可选 tvViewport 参数**

  修改 `e2e/tv-flow.spec.ts`。找到:

  ```ts
  async function pairTv(browser: import('@playwright/test').Browser, screenName: string) {
    // Two isolated browser contexts: one admin, one TV.
    const adminPage = await browser.newPage();
    const tvPage = await browser.newPage();
  ```

  替换为:

  ```ts
  async function pairTv(
    browser: import('@playwright/test').Browser,
    screenName: string,
    opts: { tvViewport?: { width: number; height: number } } = {},
  ) {
    // Two isolated browser contexts: one admin, one TV.
    const adminPage = await browser.newPage();
    const tvPage = await browser.newPage();
    // Viewport must be set before goto('/tv') so the first capacity calculation
    // (window.innerHeight) already sees the target height.
    if (opts.tvViewport) await tvPage.setViewportSize(opts.tvViewport);
  ```

  (helper 后续第一处导航是 `await tvPage.goto('/tv')`,viewport 在其之前生效,满足"goto /tv 前"要求;既有 3 个调用方不传 opts,行为不变。)

- [ ] **Step 2: 追加分页 E2E 用例**

  在 `e2e/tv-flow.spec.ts` 文件末尾(`manual birthday broadcast shows on tv` 用例的收尾 `});` 之后)追加:

  ```ts

  test('paginates a slide across rotations on short screens', async ({ browser }) => {
    test.setTimeout(120_000); // login+pair+15s rotation to page 2 leaves little room in the default 60s
    // 520px tall: each leaderboard fits 3 rows per page ((520-196)/84 → 3) and the demo
    // seed ranks 4 agents on every board → 2 pages (3 + 1).
    const { adminPage, tvPage } = await pairTv(browser, 'E2E TV 4', {
      tvViewport: { width: 1280, height: 520 },
    });

    // First slide (sales leaderboard, 15s per page) shows the page badge immediately.
    // exact: true — substring matching would also hit e.g. '22/2 Ocean Avenue' listings.
    await expect(tvPage.getByText('1/2', { exact: true })).toBeVisible({ timeout: 20000 });
    // After one full page duration (15s) the same board rotates to its second page.
    await expect(tvPage.getByText('2/2', { exact: true })).toBeVisible({ timeout: 20000 });

    await adminPage.close();
    await tvPage.close();
  });
  ```

- [ ] **Step 3: 单跑新用例**

  ```bash
  npm run build
  npx playwright test -g "paginates a slide across rotations"
  ```

  预期:`1 passed`(约 40–60s:配对 ~15s + 首页角标即现 + 15s 翻页)。若 `1/2` 超时不出现:先查 Task 3 的角标条件(`pageCount > 1`)与容量常数(520 高时榜单 perPage 应为 3,若算出 ≥4 则单页无角标——核对 `SLIDE_RESERVED_PX`/`LEADERBOARD_ITEM_PX` 与组件 CSS 是否同步)。

- [ ] **Step 4: 全量收尾回归**

  ```bash
  npx tsc --noEmit
  npx vitest run
  npm run test:e2e
  ```

  预期:tsc 零输出;vitest **19 files / 242 tests** 全绿;E2E **5 passed**(新用例 + 既有 4 个;offline 用例自身要 ~3–4 分钟,总时长约 8–10 分钟,勿提前中断)。

- [ ] **Step 5: Commit**

  ```bash
  git add e2e/tv-flow.spec.ts
  git commit -m "test: e2e slide pagination badge on short screens"
  ```

---
## 完成定义

- 4 个 commit 依次落在 `feature/slide-pagination`;
- `npx tsc --noEmit` 零输出、`npx vitest run` 242 全绿、`npm run build` 成功、`npm run test:e2e` 5 全绿;
- 手动验收对照设计 §7:小屏多页时角标 `1/2`→`2/2` 正确、每页停留完整时长;1080p 默认数据量(≤10 名/≤8 条)单页、无角标,与现状一致。
