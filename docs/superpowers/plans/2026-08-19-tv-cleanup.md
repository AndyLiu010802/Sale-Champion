# TV 内容清理(移除 Hot Listings 轮播页 + 成员真删除)Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 彻底从代码移除 TV 轮播的 Hot Listings 页(SLIDE_KEYS 8 键 → 7 键,Settings 不再出现该项),并给 Admin → Team 页加成员**真删除**:`DELETE /api/agents/[id]` 从"置 active=false"改为事务内级联删 sales/listings/appraisals 再删 agents 行,新增 `GET /api/agents/[id]/usage` 计数端点,行内红色 Delete 按钮带含真实计数的 `window.confirm` 二次确认。

**Architecture:** 移除侧靠类型系统收敛:`SLIDE_KEYS` 去掉 `'listings'` 后,TvApp 的 `Record<SlideKey,…>`(perPage/counts)与 settings 页 `SLIDE_LABELS: Record<SlideKey, string>` 编译期强制穷尽,漏删任何一处都是编译错;`tv/state` 只删专供该页的 `tvListings` 查询与响应字段,记分卡/榜单共用的 `listingRows` 全表查询、后台房源管理与 `listings` 表数据全部保留。删除侧沿用既有 admin route 形态(requireAdmin → org 过滤 → 404 → 写库 → hub 广播):DELETE 语义变更收敛在 `agents/[id]/route.ts` 一个处理器(drizzle `db.transaction` 在 node-postgres 与 PGlite 两条驱动路径均可用,已核实),usage 端点只读不广播;Team 页按本页现状照抄"序列化行操作 + busy 态 + 错误透传"模式(togglingId/broadcastingId 的第三个兄弟 deletingId)。停用语义(PATCH `{ active:false }`)原样保留。

**Tech Stack:** 与主项目一致(Next.js 15 / React 19 / Drizzle + PGlite/Postgres / Tailwind 3.4 / Vitest / Playwright),零新依赖、零迁移(不动 schema)。

**执行约定:**
- 基线:分支 `feature/tv-cleanup`(**已存在且已检出**,HEAD `e9d33d2` = 规格提交,落在 scorecard 合并提交 `114cf46` 之上)。开工前确认:
  ```bash
  git rev-parse --abbrev-ref HEAD
  git status
  ```
  预期:输出 `feature/tv-cleanup`;工作区干净(本计划文档已提交)。
- 基线测试数(已实测):`npx vitest run` → **22 files / 292 tests 全绿**(约 80s);E2E `npm run test:e2e` → **6 passed**(约 8–10 分钟,offline 用例自身要 3–4 分钟)。**E2E 全量只在 Task 2 收尾跑一次**(Task 1 已同步更新 `SLIDE_TITLE_RE`,但不把 E2E 作为 Task 1 门禁)。
- 按 Task 1→2 顺序执行,每个 Task 结束时 `npx tsc --noEmit` 零输出、全量 vitest 全绿、有独立 commit。
- 规格(权威需求):`docs/superpowers/specs/2026-08-19-tv-cleanup-design.md`。
- 所有命令在项目根 `C:\Users\andyl\Desktop\工作文档\TV SaaS` 执行(均为跨平台 `npx`/`npm` 形式,PowerShell 可直接用;含 `[id]`/`(dashboard)` 的路径在 git add 时**必须加双引号**)。
- 新增/修改 API route 一律 Next.js 15 约定:`ctx: { params: Promise<{ id: string }> }`,处理器内 `const { id } = await ctx.params;`。
- 事务可用性(已核实):`src/lib/db/index.ts` 的两条驱动路径(`DATABASE_URL` → node-postgres;否则 PGlite)上 drizzle `db.transaction` 均可用——`drizzle-orm/pglite` 的 session 通过 PGlite 的 `client.transaction` 实现互动事务。Task 2 的级联删除因此**用事务包裹**(schema 外键无 `ON DELETE CASCADE`,子表先删)。
- seed/settings 同步:`seed.ts` 内联的 `DEFAULT_SETTINGS_DATA` 与 `settings.ts` 的 `DEFAULT_SETTINGS` 的同步已由 `tests/db.test.ts` 的 `expect(settingsRows[0].data).toEqual(DEFAULT_SETTINGS)` deep-equal 断言钉死——Task 1 两边同步删行即可,漏改任何一边该测试自动变红,无需新增用例。
- 兼容性说明(设计 §1.3,不需要代码处理):SLIDE_KEYS 变 7 键后,已存的 8 键 settings 行读取时 safeParse 失败 → `getSettings` 回落新 DEFAULT_SETTINGS 并 console.warn,轮播自定义丢失一次,已接受(机制与前两次升级相同;README 升级注意事项补一段,见 Task 1;Task 1 新增测试钉住该回落)。
- usage 计数口径(设计 §2.2):返回**行数**——一条 appraisals 录入行算 1,不按其 `count` 字段展开(确认文案里的 "N appraisals" 指录入记录数)。

---
### Task 1: 移除 Hot Listings 轮播页(设计 §1)

**Files:**
- Modify: `src/lib/settings.ts`(SLIDE_KEYS 7 键、DEFAULT_SETTINGS 删 listings 行、注释)
- Modify: `src/lib/db/seed.ts`(内联 DEFAULT_SETTINGS_DATA 同步删行)
- Modify: `src/components/tv/TvApp.tsx`(删 import/常量/perPage/counts/switch case)
- Delete: `src/components/tv/slides/ListingsSlide.tsx`
- Modify: `src/app/api/tv/state/route.ts`(删 tvListings 查询与响应字段;保留 listingRows)
- Modify: `src/lib/types.ts`(删 TvStateResponse.listings 与 TvListing)
- Modify: `src/lib/pagination.ts`(删 gridPageSize)
- Modify: `src/app/admin/(dashboard)/settings/page.tsx`(SLIDE_LABELS 删 listings)
- Modify: `e2e/tv-flow.spec.ts`(SLIDE_TITLE_RE 去 HOT LISTINGS)
- Modify: `README.md`(轮播描述 8→7 页、升级注意事项补一段)
- Test: `tests/settings.test.ts`(7 键用例改写、+1 旧 8 键回落用例、2 处注释改口径)
- Test: `tests/api/tv-state.test.ts`(响应不再含 listings 字段;删 40 条封顶用例)
- Test: `tests/pagination.test.ts`(删 gridPageSize describe;expandSlides 用例 slide key 换 scorecard)
- Test: `tests/carousel.test.ts`(altSlides 的 'listings' 换 'scorecard'——类型连带)

- [ ] **Step 1: 更新测试(先测试)**

  ① 修改 `tests/settings.test.ts`。找到(逐字):

  ```ts
  describe('SLIDE_KEYS / DEFAULT_SETTINGS', () => {
    it('leads with both scorecard slides across all 8 keys (设计 §4/§7b)', () => {
      expect(SLIDE_KEYS).toHaveLength(8);
      expect(SLIDE_KEYS[0]).toBe('scorecard');
      expect(SLIDE_KEYS[1]).toBe('scorecard_ytd');
      expect(DEFAULT_SETTINGS.slides.map((s) => s.key)).toEqual([...SLIDE_KEYS]);
      expect(DEFAULT_SETTINGS.slides[0]).toEqual({ key: 'scorecard', enabled: true, durationSec: 20 });
      expect(DEFAULT_SETTINGS.slides[1]).toEqual({ key: 'scorecard_ytd', enabled: true, durationSec: 20 });
    });
  });
  ```

  替换为:

  ```ts
  describe('SLIDE_KEYS / DEFAULT_SETTINGS', () => {
    it('leads with both scorecard slides across all 7 keys (清理设计 §1:无 listings)', () => {
      expect(SLIDE_KEYS).toHaveLength(7);
      expect(SLIDE_KEYS[0]).toBe('scorecard');
      expect(SLIDE_KEYS[1]).toBe('scorecard_ytd');
      expect(SLIDE_KEYS).not.toContain('listings');
      expect(DEFAULT_SETTINGS.slides.map((s) => s.key)).toEqual([...SLIDE_KEYS]);
      expect(DEFAULT_SETTINGS.slides[0]).toEqual({ key: 'scorecard', enabled: true, durationSec: 20 });
      expect(DEFAULT_SETTINGS.slides[1]).toEqual({ key: 'scorecard_ytd', enabled: true, durationSec: 20 });
    });
  });
  ```

  再找到(`getSettings / saveSettings` describe 内):

  ```ts
    it('falls back to defaults when stored data is malformed', async () => {
      await db.insert(settings).values({ orgId, data: { garbage: true }, updatedAt: new Date() });
      expect(await getSettings(db, orgId)).toEqual(DEFAULT_SETTINGS);
    });
  ```

  替换为(其后追加旧 8 键回落用例;legacy 行故意带自定义 durationSec 25,保证实现前该行能通过校验被原样返回 → 用例先红):

  ```ts
    it('falls back to defaults when stored data is malformed', async () => {
      await db.insert(settings).values({ orgId, data: { garbage: true }, updatedAt: new Date() });
      expect(await getSettings(db, orgId)).toEqual(DEFAULT_SETTINGS);
    });

    it('falls back to defaults for a stored legacy 8-key row (清理设计 §1.3)', async () => {
      // 升级前保存的 8 键行(含被移除的 'listings' 键 + 自定义时长):
      // safeParse 失败 → 回落新 7 键 DEFAULT_SETTINGS,轮播自定义丢失一次(已接受)。
      const legacySlides = [
        { key: 'scorecard', enabled: true, durationSec: 20 },
        { key: 'scorecard_ytd', enabled: true, durationSec: 20 },
        { key: 'leaderboard_sales_count', enabled: true, durationSec: 15 },
        { key: 'leaderboard_gci', enabled: true, durationSec: 15 },
        { key: 'leaderboard_listings', enabled: true, durationSec: 15 },
        { key: 'goal_progress', enabled: true, durationSec: 10 },
        { key: 'listings', enabled: true, durationSec: 25 },
        { key: 'announcements', enabled: true, durationSec: 10 },
      ];
      await db.insert(settings).values({
        orgId,
        data: { ...DEFAULT_SETTINGS, slides: legacySlides },
        updatedAt: new Date(),
      });
      expect(await getSettings(db, orgId)).toEqual(DEFAULT_SETTINGS);
    });
  ```

  再找到:

  ```ts
      // Missing keys (only 5 of the 8 required slide keys present).
  ```

  替换为:

  ```ts
      // Missing keys (only 5 of the 7 required slide keys present).
  ```

  再找到:

  ```ts
      // Duplicate key (9 entries: all eight keys present plus the first key repeated).
  ```

  替换为:

  ```ts
      // Duplicate key (8 entries: all seven keys present plus the first key repeated).
  ```

  ② 修改 `tests/api/tv-state.test.ts`。找到:

  ```ts
    it('returns computed leaderboards, goals, listings, announcements and period label', async () => {
  ```

  替换为:

  ```ts
    it('returns computed leaderboards, goals, announcements and period label (no listings field)', async () => {
  ```

  再找到(同一用例内;插入的 listings 行**保留**——仍喂 listings 榜与 scorecard):

  ```ts
      // tv listings: active only, joined agent name.
      expect(data.listings).toHaveLength(1);
      expect(data.listings[0]).toMatchObject({
        address: '10 Beach Rd', listPriceCents: 80000000, agentName: 'Alice Ng',
      });
  ```

  替换为:

  ```ts
      // Hot Listings 页已移除(清理设计 §1):响应不再包含 listings 字段。
      expect(data).not.toHaveProperty('listings');
  ```

  再找到(整个用例删除——它测的正是被移除的 tvListings 查询):

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

  ```

  替换为(空——连同其后的一个空行整体删掉,即上面这段变成什么都不留)。

  ③ 修改 `tests/pagination.test.ts`。找到:

  ```ts
  import { expandSlides, pageSize, gridPageSize, pageCount, pageSlice } from '@/lib/pagination';
  ```

  替换为:

  ```ts
  import { expandSlides, pageSize, pageCount, pageSlice } from '@/lib/pagination';
  ```

  再找到(整个 describe 删除):

  ```ts
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

  ```

  替换为(空——describe 连同其后空行整体删掉)。

  再找到(expandSlides 用例的 'listings' 键换成仍存在的 'scorecard'——SlideKey 类型连带,断言值不变):

  ```ts
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
  ```

  替换为:

  ```ts
    it('expands a multi-page slide into consecutive steps sharing the full duration', () => {
      const out = expandSlides(
        [enabled('leaderboard_sales_count', 15), enabled('scorecard', 12)],
        { leaderboard_sales_count: 4, scorecard: 3 },
        { leaderboard_sales_count: 3, scorecard: 8 },
      );
      expect(out).toEqual([
        { key: 'leaderboard_sales_count', durationSec: 15, page: 0, pageCount: 2 },
        { key: 'leaderboard_sales_count', durationSec: 15, page: 1, pageCount: 2 },
        { key: 'scorecard', durationSec: 12, page: 0, pageCount: 1 },
      ]);
    });
  ```

  再找到:

  ```ts
    it('zero items still yield one page (renders the existing "No data yet")', () => {
      const out = expandSlides([enabled('listings', 12)], { listings: 0 }, { listings: 8 });
      expect(out).toEqual([{ key: 'listings', durationSec: 12, page: 0, pageCount: 1 }]);
    });
  ```

  替换为:

  ```ts
    it('zero items still yield one page (renders the existing "No data yet")', () => {
      const out = expandSlides([enabled('scorecard', 12)], { scorecard: 0 }, { scorecard: 8 });
      expect(out).toEqual([{ key: 'scorecard', durationSec: 12, page: 0, pageCount: 1 }]);
    });
  ```

  ④ 修改 `tests/carousel.test.ts`(类型连带,断言依赖的 durationSec 12/8 不变)。找到:

  ```ts
  const altSlides: CarouselSlide[] = [
    { key: 'listings', durationSec: 12, page: 0, pageCount: 1 },
    { key: 'announcements', durationSec: 8, page: 0, pageCount: 1 },
  ];
  ```

  替换为:

  ```ts
  const altSlides: CarouselSlide[] = [
    { key: 'scorecard', durationSec: 12, page: 0, pageCount: 1 },
    { key: 'announcements', durationSec: 8, page: 0, pageCount: 1 },
  ];
  ```

- [ ] **Step 2: 运行确认失败**

  ```bash
  npx vitest run tests/settings.test.ts tests/api/tv-state.test.ts tests/pagination.test.ts tests/carousel.test.ts
  ```

  预期失败恰好 3 个,其余全过:
  - settings:`all 7 keys` 用例失败(SLIDE_KEYS 仍是 8 键,`toHaveLength(7)` 收到 8);`legacy 8-key row` 用例失败(8 键行仍通过校验被原样返回,`durationSec: 25` ≠ 默认 12)。
  - tv-state:改名后的用例在 `expect(data).not.toHaveProperty('listings')` 处失败(字段还在)。
  - pagination **15 个**、carousel **20 个** 全过('scorecard' 本来就是合法 SlideKey)。

- [ ] **Step 3: 实现移除**

  ① 修改 `src/lib/settings.ts`。找到:

  ```ts
  // 8 键(设计 §4/§7b):scorecard(MTD)首位、scorecard_ytd(财年 to-date)第二位。
  // 已存的 6/7 键 settings 行 safeParse 失败后由 getSettings 回落新 DEFAULT_SETTINGS
  // (既有轮播自定义丢失一次,已接受)。
  export const SLIDE_KEYS = [
    'scorecard', 'scorecard_ytd',
    'leaderboard_sales_count', 'leaderboard_gci', 'leaderboard_listings',
    'goal_progress', 'listings', 'announcements',
  ] as const;
  ```

  替换为:

  ```ts
  // 7 键(清理设计 §1):scorecard(MTD)首位、scorecard_ytd(财年 to-date)第二位;
  // 'listings'(Hot Listings 页)已彻底移除。已存的 6/7/8 键 settings 行 safeParse 失败后
  // 由 getSettings 回落新 DEFAULT_SETTINGS(既有轮播自定义丢失一次,已接受)。
  export const SLIDE_KEYS = [
    'scorecard', 'scorecard_ytd',
    'leaderboard_sales_count', 'leaderboard_gci', 'leaderboard_listings',
    'goal_progress', 'announcements',
  ] as const;
  ```

  再找到(DEFAULT_SETTINGS 内):

  ```ts
      { key: 'goal_progress', enabled: true, durationSec: 10 },
      { key: 'listings', enabled: true, durationSec: 12 },
      { key: 'announcements', enabled: true, durationSec: 10 },
  ```

  替换为:

  ```ts
      { key: 'goal_progress', enabled: true, durationSec: 10 },
      { key: 'announcements', enabled: true, durationSec: 10 },
  ```

  ② 修改 `src/lib/db/seed.ts`(内联同步;`tests/db.test.ts` 的 deep-equal 断言会自动钉住这一步——漏改则 seed 用例红)。找到:

  ```ts
      { key: 'goal_progress', enabled: true, durationSec: 10 },
      { key: 'listings', enabled: true, durationSec: 12 },
      { key: 'announcements', enabled: true, durationSec: 10 },
  ```

  替换为:

  ```ts
      { key: 'goal_progress', enabled: true, durationSec: 10 },
      { key: 'announcements', enabled: true, durationSec: 10 },
  ```

  ③ 修改 `src/components/tv/TvApp.tsx`。找到:

  ```ts
  import { expandSlides, gridPageSize, pageSize, pageSlice } from '@/lib/pagination';
  ```

  替换为:

  ```ts
  import { expandSlides, pageSize, pageSlice } from '@/lib/pagination';
  ```

  再找到:

  ```ts
  import GoalSlide from '@/components/tv/slides/GoalSlide';
  import ListingsSlide from '@/components/tv/slides/ListingsSlide';
  import AnnouncementSlide from '@/components/tv/slides/AnnouncementSlide';
  ```

  替换为:

  ```ts
  import GoalSlide from '@/components/tv/slides/GoalSlide';
  import AnnouncementSlide from '@/components/tv/slides/AnnouncementSlide';
  ```

  再找到:

  ```ts
  // LeaderboardSlide:行 h-[72px] + 行间 gap-3(12px)。
  const LEADERBOARD_ITEM_PX = 84;
  // ListingsSlide:卡 h-[400px] + gap-6(24px);列数固定 4(grid-cols-4)。
  const LISTINGS_ROW_PX = 424;
  const LISTINGS_COLUMNS = 4;
  // AnnouncementSlide:卡 h-[224px] + 卡间 gap-6(24px)。
  ```

  替换为:

  ```ts
  // LeaderboardSlide:行 h-[72px] + 行间 gap-3(12px)。
  const LEADERBOARD_ITEM_PX = 84;
  // AnnouncementSlide:卡 h-[224px] + 卡间 gap-6(24px)。
  ```

  再找到(perPage record):

  ```ts
        goal_progress: 1,
        listings: gridPageSize(windowHeight - SLIDE_RESERVED_PX, LISTINGS_ROW_PX, LISTINGS_COLUMNS),
        announcements: pageSize(windowHeight - SLIDE_RESERVED_PX, ANNOUNCEMENT_ITEM_PX),
  ```

  替换为:

  ```ts
        goal_progress: 1,
        announcements: pageSize(windowHeight - SLIDE_RESERVED_PX, ANNOUNCEMENT_ITEM_PX),
  ```

  再找到(counts record):

  ```ts
        goal_progress: 1, // 恒 1 页;GoalSlide 自身 slice(0,4) 不动(非目标)
        listings: tvState.listings.length,
        announcements: Math.min(tvState.announcements.length, ANNOUNCEMENTS_CAP),
  ```

  替换为:

  ```ts
        goal_progress: 1, // 恒 1 页;GoalSlide 自身 slice(0,4) 不动(非目标)
        announcements: Math.min(tvState.announcements.length, ANNOUNCEMENTS_CAP),
  ```

  再找到(switch 内整个 case 删除):

  ```tsx
        case 'goal_progress':
          return <GoalSlide goals={tvState.goals} />;
        case 'listings': {
          const listings = tvState.listings;
          return (
            <ListingsSlide
              listings={pageSlice(
                listings, effectivePage(page, listings.length, perPage.listings), perPage.listings,
              )}
            />
          );
        }
        case 'announcements': {
  ```

  替换为:

  ```tsx
        case 'goal_progress':
          return <GoalSlide goals={tvState.goals} />;
        case 'announcements': {
  ```

  ④ 删除组件文件(git rm 直接暂存删除):

  ```bash
  git rm src/components/tv/slides/ListingsSlide.tsx
  ```

  ⑤ 修改 `src/app/api/tv/state/route.ts`。找到:

  ```ts
  import { and, asc, desc, eq } from 'drizzle-orm';
  ```

  替换为(`desc` 只被 tvListings 查询使用):

  ```ts
  import { and, asc, eq } from 'drizzle-orm';
  ```

  再找到:

  ```ts
  import type { GoalProgress, Metric, TvAnnouncement, TvListing, TvStateResponse } from '@/lib/types';
  ```

  替换为:

  ```ts
  import type { GoalProgress, Metric, TvAnnouncement, TvStateResponse } from '@/lib/types';
  ```

  再找到(整个 tvListings 查询删除;上方 `listingRows` 全表查询是记分卡/榜单的输入,**保留不动**):

  ```ts
    const tvListings: TvListing[] = await db.select({
      id: listings.id,
      address: listings.address,
      listPriceCents: listings.listPriceCents,
      photoUrl: listings.photoUrl,
      agentName: agents.name,
    }).from(listings)
      .innerJoin(agents, eq(listings.agentId, agents.id))
      .where(and(eq(listings.orgId, orgId), eq(listings.status, 'active')))
      .orderBy(desc(listings.listedDate))
      // 安全封顶:电视端分页后全量展示,40 仅防极端数据撑爆载荷(设计 §4)。
      .limit(40);

    const annRows = await db.select().from(announcements)
  ```

  替换为:

  ```ts
    const annRows = await db.select().from(announcements)
  ```

  再找到:

  ```ts
      goals: goalProgress,
      listings: tvListings,
      announcements: tvAnnouncements,
  ```

  替换为:

  ```ts
      goals: goalProgress,
      announcements: tvAnnouncements,
  ```

  ⑥ 修改 `src/lib/types.ts`。找到:

  ```ts
  export type TvListing = {
    id: string; address: string; listPriceCents: number;
    photoUrl: string | null; agentName: string;
  };

  export type TvAnnouncement = { id: string; title: string; body: string | null; imageUrl: string | null };
  ```

  替换为:

  ```ts
  export type TvAnnouncement = { id: string; title: string; body: string | null; imageUrl: string | null };
  ```

  再找到:

  ```ts
    goals: GoalProgress[];                              // active only
    listings: TvListing[];                              // status='active', listedDate desc, limit 40
    announcements: TvAnnouncement[];                    // enabled only, sortOrder asc
  ```

  替换为:

  ```ts
    goals: GoalProgress[];                              // active only
    announcements: TvAnnouncement[];                    // enabled only, sortOrder asc
  ```

  ⑦ 修改 `src/lib/pagination.ts`。找到:

  ```ts
  /** 网格容量:列数 × max(1, floor(可用高度 ÷ 行高))。 */
  export function gridPageSize(availablePx: number, rowPx: number, columns: number): number {
    return columns * Math.max(1, Math.floor(availablePx / rowPx));
  }

  /** 页数:0 条(或负数)→ 1 页(渲染既有 "No data yet");否则 ceil(total ÷ perPage)。 */
  ```

  替换为:

  ```ts
  /** 页数:0 条(或负数)→ 1 页(渲染既有 "No data yet");否则 ceil(total ÷ perPage)。 */
  ```

  ⑧ 修改 `src/app/admin/(dashboard)/settings/page.tsx`(`Record<SlideKey, string>` 编译连带)。找到:

  ```ts
    goal_progress: 'Team Goals',
    listings: 'Hot Listings',
    announcements: 'Team News',
  ```

  替换为:

  ```ts
    goal_progress: 'Team Goals',
    announcements: 'Team News',
  ```

  ⑨ 修改 `e2e/tv-flow.spec.ts`。找到:

  ```ts
  const SLIDE_TITLE_RE =
    /SALES SCORECARD|SALES CHAMPIONS|TOP EARNERS|LISTING LEGENDS|TEAM GOALS|HOT LISTINGS|TEAM NEWS/;
  ```

  替换为:

  ```ts
  const SLIDE_TITLE_RE =
    /SALES SCORECARD|SALES CHAMPIONS|TOP EARNERS|LISTING LEGENDS|TEAM GOALS|TEAM NEWS/;
  ```

  (已核对现有 6 条用例的时序:分页用例与 scorecard 用例只断言轮播**前两屏**(MTD scorecard 两页 / MTD→YTD),Hot Listings 原排在第 7 位、其移除只让整轮周期从 117s 缩到 105s,不影响任何断言;offline/celebration 用例只用 SLIDE_TITLE_RE 匹配任意一屏。无需其他 E2E 改动,全量回归在 Task 2 收尾统一跑。)

  ⑩ 修改 `README.md`。找到:

  ```
  A Spinify-style sales leaderboard for real-estate offices. An office TV runs a
  full-screen, esports-styled carousel of sales leaderboards, team goal progress,
  hot listings and announcements — and the moment a sale is recorded in the admin
  ```

  替换为:

  ```
  A Spinify-style sales leaderboard for real-estate offices. An office TV runs a
  full-screen, esports-styled carousel of sales scorecards, leaderboards, team
  goal progress and announcements — and the moment a sale is recorded in the admin
  ```

  再找到(Production considerations 最后一条之后补升级注意事项):

  ```
  - **Upgrading past the scorecard feature commit resets TV slide
    customization once.** The settings row's slide list grew from 6/7 keys to
    8 (`scorecard` and `scorecard_ytd` were added); an old stored row fails
    validation on first read after the upgrade and falls back to the new
    8-key defaults, silently dropping any custom slide order, enabled/disabled
    toggles or per-slide durations. An admin needs to reconfigure slides once
    after that upgrade.
  ```

  替换为:

  ```
  - **Upgrading past the scorecard feature commit resets TV slide
    customization once.** The settings row's slide list grew from 6/7 keys to
    8 (`scorecard` and `scorecard_ytd` were added); an old stored row fails
    validation on first read after the upgrade and falls back to the new
    8-key defaults, silently dropping any custom slide order, enabled/disabled
    toggles or per-slide durations. An admin needs to reconfigure slides once
    after that upgrade.
  - **Upgrading past the TV cleanup commit resets TV slide customization once
    more.** The Hot Listings carousel slide was removed entirely, shrinking the
    slide list from 8 keys to 7; a stored 8-key settings row fails validation on
    first read and falls back to the new 7-key defaults (same mechanism as the
    previous upgrades). Reconfigure slides once after upgrading.
  ```

- [ ] **Step 4: 转绿 + 全仓校验**

  ```bash
  npx vitest run tests/settings.test.ts tests/api/tv-state.test.ts tests/pagination.test.ts tests/carousel.test.ts tests/db.test.ts
  npx tsc --noEmit
  npx vitest run
  ```

  预期:settings **11 个**、tv-state **7 个**、pagination **15 个**、carousel **20 个**、db **7 个**全部通过;tsc 零输出;全量 **22 files / 289 tests** 全绿(292 − 3 gridPageSize − 1 封顶用例 + 1 回落用例)。

- [ ] **Step 5: Commit**

  ```bash
  git add src/lib/settings.ts src/lib/db/seed.ts src/components/tv/TvApp.tsx src/app/api/tv/state/route.ts src/lib/types.ts src/lib/pagination.ts "src/app/admin/(dashboard)/settings/page.tsx" e2e/tv-flow.spec.ts README.md tests/settings.test.ts tests/api/tv-state.test.ts tests/pagination.test.ts tests/carousel.test.ts
  git commit -m "feat: remove hot listings carousel slide"
  ```

  (ListingsSlide.tsx 的删除已由 Step 3-④ 的 `git rm` 暂存,随本次 commit 一起进库。)

---
### Task 2: 成员真删除(设计 §2)+ 收尾回归

**Files:**
- Modify: `src/app/api/agents/[id]/route.ts`(DELETE 改真删除:事务内按序删 sales/listings/appraisals 再删 agents 行)
- Create: `src/app/api/agents/[id]/usage/route.ts`(GET 计数端点)
- Modify: `src/app/admin/(dashboard)/agents/page.tsx`(红色 Delete 按钮 + usage 拉取 + confirm + deletingId busy + 错误透传)
- Test: `tests/api/agents.test.ts`(DELETE describe 重写 5 用例 + usage describe 5 用例;birthday-broadcast 停用用例改走 PATCH)
- Test: `tests/api/sales.test.ts` / `tests/api/listings.test.ts` / `tests/api/appraisals.test.ts`(inactive 用例由 AGENTS_DELETE 改 AGENTS_PATCH——DELETE 语义变更后仍准确覆盖"停用"路径)

- [ ] **Step 1: 改写/新增 agents API 测试(先测试)**

  ① 修改 `tests/api/agents.test.ts`。找到(文件头):

  ```ts
  import { describe, it, expect, beforeEach } from 'vitest';
  import { freshDb, seedBasics, type Basics } from '../helpers/db';
  import { jsonRequest, authedRequest } from '../helpers/request';
  import { getHub } from '@/lib/ws/hub';
  import type { ServerEvent } from '@/lib/ws/protocol';
  import { GET, POST } from '@/app/api/agents/route';
  import { PATCH, DELETE } from '@/app/api/agents/[id]/route';
  import { POST as BIRTHDAY_BROADCAST } from '@/app/api/agents/[id]/birthday-broadcast/route';

  let basics: Basics;
  let events: ServerEvent[];

  beforeEach(async () => {
    const db = await freshDb();
    basics = await seedBasics(db);
  ```

  替换为(留住 db 引用 + 引入 schema 表与 usage route):

  ```ts
  import { describe, it, expect, beforeEach } from 'vitest';
  import { eq } from 'drizzle-orm';
  import { freshDb, seedBasics, type Basics } from '../helpers/db';
  import { jsonRequest, authedRequest } from '../helpers/request';
  import { getHub } from '@/lib/ws/hub';
  import type { ServerEvent } from '@/lib/ws/protocol';
  import type { Db } from '@/lib/db';
  import { agents, appraisals, listings, orgs, sales } from '@/lib/db/schema';
  import { GET, POST } from '@/app/api/agents/route';
  import { PATCH, DELETE } from '@/app/api/agents/[id]/route';
  import { GET as USAGE_GET } from '@/app/api/agents/[id]/usage/route';
  import { POST as BIRTHDAY_BROADCAST } from '@/app/api/agents/[id]/birthday-broadcast/route';

  let db: Db;
  let basics: Basics;
  let events: ServerEvent[];

  /** 给某成员各插一批业绩行:2 sales、1 listing、3 条 appraisals 录入(count 4/1/2)。
   *  usage 口径 = 行数(appraisals 按录入行算,不按 count 展开)→ { 2, 1, 3 }。 */
  async function seedPerformanceRows(agentId: string, orgId: string): Promise<void> {
    await db.insert(sales).values([
      { id: crypto.randomUUID(), orgId, agentId, address: '1 Gone St', salePriceCents: 0, gciCents: 100000, saleDate: '2026-08-01' },
      { id: crypto.randomUUID(), orgId, agentId, address: '2 Gone St', salePriceCents: 0, gciCents: 200000, saleDate: '2026-08-02', split: 0.5 },
    ]);
    await db.insert(listings).values([
      { id: crypto.randomUUID(), orgId, agentId, address: '3 Gone Rd', listPriceCents: 0, listedDate: '2026-08-03', status: 'active' },
    ]);
    await db.insert(appraisals).values([
      { id: crypto.randomUUID(), orgId, agentId, date: '2026-08-04', count: 4 },
      { id: crypto.randomUUID(), orgId, agentId, date: '2026-08-05', count: 1 },
      { id: crypto.randomUUID(), orgId, agentId, date: '2026-08-06', count: 2 },
    ]);
  }

  beforeEach(async () => {
    db = await freshDb();
    basics = await seedBasics(db);
  ```

  再找到(整个旧 DELETE describe——软删语义已废止):

  ```ts
  describe('DELETE /api/agents/[id]', () => {
    it('soft-deletes: row remains with active=false, and broadcasts', async () => {
      const res = await DELETE(
        await authedRequest(`/api/agents/${basics.agentId}`, { method: 'DELETE' }),
        { params: Promise.resolve({ id: basics.agentId }) },
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ data: { id: basics.agentId } });

      const list = await GET(await authedRequest('/api/agents'));
      const { data } = await list.json();
      const alice = data.find((a: { id: string }) => a.id === basics.agentId);
      expect(alice).toBeDefined();
      expect(alice.active).toBe(false);
      expect(events).toEqual([{ type: 'data.updated', domain: 'agents' }]);
    });

    it('returns 404 for an unknown id', async () => {
      const res = await DELETE(
        await authedRequest('/api/agents/ghost', { method: 'DELETE' }),
        { params: Promise.resolve({ id: 'ghost' }) },
      );
      expect(res.status).toBe(404);
      expect(events).toEqual([]);
    });
  });
  ```

  替换为(真删除 5 用例 + usage 5 用例):

  ```ts
  describe('DELETE /api/agents/[id] (hard delete, 清理设计 §2.2)', () => {
    it('requires admin session', async () => {
      const res = await DELETE(
        jsonRequest(`/api/agents/${basics.agentId}`, { method: 'DELETE' }),
        { params: Promise.resolve({ id: basics.agentId }) },
      );
      expect(res.status).toBe(401);
      expect(events).toEqual([]);
    });

    it('hard-deletes the member and every sales/listings/appraisals row, then broadcasts once', async () => {
      await seedPerformanceRows(basics.agentId, basics.orgId);

      const res = await DELETE(
        await authedRequest(`/api/agents/${basics.agentId}`, { method: 'DELETE' }),
        { params: Promise.resolve({ id: basics.agentId }) },
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ data: { id: basics.agentId } });

      // 成员行与三张子表的行全部消失(真删除;schema 无级联,route 必须自己删子表)。
      expect(await db.select().from(agents).where(eq(agents.id, basics.agentId))).toHaveLength(0);
      expect(await db.select().from(sales).where(eq(sales.agentId, basics.agentId))).toHaveLength(0);
      expect(await db.select().from(listings).where(eq(listings.agentId, basics.agentId))).toHaveLength(0);
      expect(await db.select().from(appraisals).where(eq(appraisals.agentId, basics.agentId))).toHaveLength(0);
      expect(events).toEqual([{ type: 'data.updated', domain: 'agents' }]);
    });

    it('deletes a staff member (no performance rows) as well', async () => {
      const created = await POST(
        await authedRequest('/api/agents', { method: 'POST', body: { name: 'Sam Staff', role: 'staff' } }),
      );
      const { data: staff } = await created.json();
      events.length = 0;

      const res = await DELETE(
        await authedRequest(`/api/agents/${staff.id}`, { method: 'DELETE' }),
        { params: Promise.resolve({ id: staff.id }) },
      );
      expect(res.status).toBe(200);
      expect(await db.select().from(agents).where(eq(agents.id, staff.id))).toHaveLength(0);
      expect(events).toEqual([{ type: 'data.updated', domain: 'agents' }]);
    });

    it('returns 404 for an unknown id', async () => {
      const res = await DELETE(
        await authedRequest('/api/agents/ghost', { method: 'DELETE' }),
        { params: Promise.resolve({ id: 'ghost' }) },
      );
      expect(res.status).toBe(404);
      expect(events).toEqual([]);
    });

    it('cannot delete a member of another org (404) and leaves their rows untouched', async () => {
      const otherOrgId = crypto.randomUUID();
      await db.insert(orgs).values({ id: otherOrgId, name: 'Other Agency' });
      const outsiderId = crypto.randomUUID();
      await db.insert(agents).values({ id: outsiderId, orgId: otherOrgId, name: 'Olive Out' });
      await db.insert(sales).values({
        id: crypto.randomUUID(), orgId: otherOrgId, agentId: outsiderId,
        address: '9 Other St', salePriceCents: 0, gciCents: 100000, saleDate: '2026-08-01',
      });

      const res = await DELETE(
        await authedRequest(`/api/agents/${outsiderId}`, { method: 'DELETE' }),
        { params: Promise.resolve({ id: outsiderId }) },
      );
      expect(res.status).toBe(404);
      expect(await db.select().from(agents).where(eq(agents.id, outsiderId))).toHaveLength(1);
      expect(await db.select().from(sales).where(eq(sales.agentId, outsiderId))).toHaveLength(1);
      expect(events).toEqual([]);
    });
  });

  describe('GET /api/agents/[id]/usage (清理设计 §2.2)', () => {
    it('requires admin session', async () => {
      const res = await USAGE_GET(
        jsonRequest(`/api/agents/${basics.agentId}/usage`),
        { params: Promise.resolve({ id: basics.agentId }) },
      );
      expect(res.status).toBe(401);
    });

    it('counts the member sales, listings and appraisal entries without broadcasting', async () => {
      await seedPerformanceRows(basics.agentId, basics.orgId);

      const res = await USAGE_GET(
        await authedRequest(`/api/agents/${basics.agentId}/usage`),
        { params: Promise.resolve({ id: basics.agentId }) },
      );
      expect(res.status).toBe(200);
      // appraisals 按录入行数计(3 行),不按 count 字段展开(4+1+2=7)。
      expect(await res.json()).toEqual({ data: { sales: 2, listings: 1, appraisals: 3 } });
      expect(events).toEqual([]);
    });

    it('returns zero counts for a member with no records', async () => {
      const res = await USAGE_GET(
        await authedRequest(`/api/agents/${basics.agentId}/usage`),
        { params: Promise.resolve({ id: basics.agentId }) },
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ data: { sales: 0, listings: 0, appraisals: 0 } });
    });

    it('returns 404 for an unknown id', async () => {
      const res = await USAGE_GET(
        await authedRequest('/api/agents/ghost/usage'),
        { params: Promise.resolve({ id: 'ghost' }) },
      );
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: 'Not found' });
    });

    it('returns 404 for a member of another org', async () => {
      const otherOrgId = crypto.randomUUID();
      await db.insert(orgs).values({ id: otherOrgId, name: 'Other Agency' });
      const outsiderId = crypto.randomUUID();
      await db.insert(agents).values({ id: outsiderId, orgId: otherOrgId, name: 'Olive Out' });

      const res = await USAGE_GET(
        await authedRequest(`/api/agents/${outsiderId}/usage`),
        { params: Promise.resolve({ id: outsiderId }) },
      );
      expect(res.status).toBe(404);
    });
  });
  ```

  再找到(birthday-broadcast 的停用用例——DELETE 语义变更后必须改走 PATCH 才仍覆盖"inactive"路径):

  ```ts
    it('returns 404 for an inactive member', async () => {
      const del = await DELETE(
        await authedRequest(`/api/agents/${basics.agentId}`, { method: 'DELETE' }),
        { params: Promise.resolve({ id: basics.agentId }) },
      );
      expect(del.status).toBe(200);
      events.length = 0;
  ```

  替换为:

  ```ts
    it('returns 404 for an inactive member', async () => {
      const deactivate = await PATCH(
        await authedRequest(`/api/agents/${basics.agentId}`, { method: 'PATCH', body: { active: false } }),
        { params: Promise.resolve({ id: basics.agentId }) },
      );
      expect(deactivate.status).toBe(200);
      events.length = 0;
  ```

  ② 修改 `tests/api/sales.test.ts`(同理:inactive 覆盖改走 PATCH)。找到:

  ```ts
  import { DELETE as AGENTS_DELETE } from '@/app/api/agents/[id]/route';
  ```

  替换为:

  ```ts
  import { PATCH as AGENTS_PATCH } from '@/app/api/agents/[id]/route';
  ```

  再找到:

  ```ts
    it('rejects sales for inactive agents', async () => {
      const delRes = await AGENTS_DELETE(
        await authedRequest(`/api/agents/${basics.agentId}`, { method: 'DELETE' }),
        { params: Promise.resolve({ id: basics.agentId }) },
      );
      expect(delRes.status).toBe(200);
  ```

  替换为:

  ```ts
    it('rejects sales for inactive agents', async () => {
      const deactivateRes = await AGENTS_PATCH(
        await authedRequest(`/api/agents/${basics.agentId}`, { method: 'PATCH', body: { active: false } }),
        { params: Promise.resolve({ id: basics.agentId }) },
      );
      expect(deactivateRes.status).toBe(200);
  ```

  ③ 修改 `tests/api/listings.test.ts`。找到:

  ```ts
  import { DELETE as AGENTS_DELETE } from '@/app/api/agents/[id]/route';
  ```

  替换为:

  ```ts
  import { PATCH as AGENTS_PATCH } from '@/app/api/agents/[id]/route';
  ```

  再找到:

  ```ts
    it('rejects listings for inactive agents', async () => {
      const delRes = await AGENTS_DELETE(
        await authedRequest(`/api/agents/${basics.agentId}`, { method: 'DELETE' }),
        { params: Promise.resolve({ id: basics.agentId }) },
      );
      expect(delRes.status).toBe(200);
  ```

  替换为:

  ```ts
    it('rejects listings for inactive agents', async () => {
      const deactivateRes = await AGENTS_PATCH(
        await authedRequest(`/api/agents/${basics.agentId}`, { method: 'PATCH', body: { active: false } }),
        { params: Promise.resolve({ id: basics.agentId }) },
      );
      expect(deactivateRes.status).toBe(200);
  ```

  ④ 修改 `tests/api/appraisals.test.ts`。找到:

  ```ts
  import { DELETE as AGENTS_DELETE } from '@/app/api/agents/[id]/route';
  ```

  替换为:

  ```ts
  import { PATCH as AGENTS_PATCH } from '@/app/api/agents/[id]/route';
  ```

  再找到:

  ```ts
    it('rejects inactive agents with 400 Unknown agent', async () => {
      const delRes = await AGENTS_DELETE(
        await authedRequest(`/api/agents/${basics.agentId}`, { method: 'DELETE' }),
        { params: Promise.resolve({ id: basics.agentId }) },
      );
      expect(delRes.status).toBe(200);
  ```

  替换为:

  ```ts
    it('rejects inactive agents with 400 Unknown agent', async () => {
      const deactivateRes = await AGENTS_PATCH(
        await authedRequest(`/api/agents/${basics.agentId}`, { method: 'PATCH', body: { active: false } }),
        { params: Promise.resolve({ id: basics.agentId }) },
      );
      expect(deactivateRes.status).toBe(200);
  ```

- [ ] **Step 2: 运行确认失败(模块级)**

  ```bash
  npx vitest run tests/api/agents.test.ts tests/api/sales.test.ts tests/api/listings.test.ts tests/api/appraisals.test.ts
  ```

  预期:`tests/api/agents.test.ts` **整文件加载失败**(`Failed to resolve import "@/app/api/agents/[id]/usage/route"`——usage route 尚未创建);sales/listings/appraisals 三个文件**全绿**(PATCH 停用路径既有可用)。

- [ ] **Step 3: 创建 usage 计数端点**

  创建 `src/app/api/agents/[id]/usage/route.ts`:

  ```ts
  import { and, count, eq } from 'drizzle-orm';
  import { getDb } from '@/lib/db';
  import { getOrgId } from '@/lib/db/org';
  import { agents, appraisals, listings, sales } from '@/lib/db/schema';
  import { requireAdmin } from '@/lib/auth/session';

  // GET /api/agents/[id]/usage(清理设计 §2.2):删除确认弹窗用的记录计数。
  // 返回行数——一条 appraisals 录入行算 1,不按其 count 字段展开。只读,不广播。
  export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
    const session = await requireAdmin(req);
    if (session instanceof Response) return session;
    const { id } = await ctx.params;
    const db = await getDb();
    const orgId = await getOrgId(db);
    const [existing] = await db
      .select()
      .from(agents)
      .where(and(eq(agents.id, id), eq(agents.orgId, orgId)));
    if (!existing) return Response.json({ error: 'Not found' }, { status: 404 });
    const [salesCount] = await db
      .select({ value: count() })
      .from(sales)
      .where(and(eq(sales.agentId, id), eq(sales.orgId, orgId)));
    const [listingsCount] = await db
      .select({ value: count() })
      .from(listings)
      .where(and(eq(listings.agentId, id), eq(listings.orgId, orgId)));
    const [appraisalsCount] = await db
      .select({ value: count() })
      .from(appraisals)
      .where(and(eq(appraisals.agentId, id), eq(appraisals.orgId, orgId)));
    return Response.json({
      data: { sales: salesCount.value, listings: listingsCount.value, appraisals: appraisalsCount.value },
    });
  }
  ```

- [ ] **Step 4: 运行确认只剩级联删除红**

  ```bash
  npx vitest run tests/api/agents.test.ts
  ```

  预期:文件可加载,**32 个用例中恰好 2 个失败**——`hard-deletes the member …`(agents 行仍在:旧实现只置 active=false,`toHaveLength(0)` 收到 1)与 `deletes a staff member …`(同因);usage 5 个用例、404/org 隔离/401 等其余 30 个全过。

- [ ] **Step 5: DELETE 改真删除(事务)**

  修改 `src/app/api/agents/[id]/route.ts`。找到:

  ```ts
  import { agents } from '@/lib/db/schema';
  ```

  替换为:

  ```ts
  import { agents, appraisals, listings, sales } from '@/lib/db/schema';
  ```

  再找到(整个旧 DELETE 处理器):

  ```ts
  export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
    const session = await requireAdmin(req);
    if (session instanceof Response) return session;
    const { id } = await ctx.params;
    const db = await getDb();
    const orgId = await getOrgId(db);
    const [existing] = await db
      .select()
      .from(agents)
      .where(and(eq(agents.id, id), eq(agents.orgId, orgId)));
    if (!existing) return Response.json({ error: 'Not found' }, { status: 404 });
    await db
      .update(agents)
      .set({ active: false })
      .where(and(eq(agents.id, id), eq(agents.orgId, orgId)));
    getHub().broadcast({ type: 'data.updated', domain: 'agents' });
    return Response.json({ data: { id } });
  }
  ```

  替换为:

  ```ts
  export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
    const session = await requireAdmin(req);
    if (session instanceof Response) return session;
    const { id } = await ctx.params;
    const db = await getDb();
    const orgId = await getOrgId(db);
    const [existing] = await db
      .select()
      .from(agents)
      .where(and(eq(agents.id, id), eq(agents.orgId, orgId)));
    if (!existing) return Response.json({ error: 'Not found' }, { status: 404 });
    // 真删除(清理设计 §2.2):停用仍走 PATCH { active:false },此处是不可恢复的硬删除。
    // schema 外键无 ON DELETE CASCADE,事务内按子表 → 主表顺序删,不留孤儿行、也不会
    // 出现"业绩已删成员还在"的中间态(drizzle db.transaction 在 node-postgres 与 PGlite
    // 两条驱动路径均可用,已核实)。TV 端一条 agents 广播足够——refetch 是全量 state。
    await db.transaction(async (tx) => {
      await tx.delete(sales).where(and(eq(sales.agentId, id), eq(sales.orgId, orgId)));
      await tx.delete(listings).where(and(eq(listings.agentId, id), eq(listings.orgId, orgId)));
      await tx.delete(appraisals).where(and(eq(appraisals.agentId, id), eq(appraisals.orgId, orgId)));
      await tx.delete(agents).where(and(eq(agents.id, id), eq(agents.orgId, orgId)));
    });
    getHub().broadcast({ type: 'data.updated', domain: 'agents' });
    return Response.json({ data: { id } });
  }
  ```

- [ ] **Step 6: 转绿(API 层)**

  ```bash
  npx vitest run tests/api/agents.test.ts tests/api/sales.test.ts tests/api/listings.test.ts tests/api/appraisals.test.ts
  ```

  预期:agents **32 个**、sales **22 个**、listings、appraisals 全部通过。

- [ ] **Step 7: Team 页 Delete 按钮(usage 拉取 + confirm + busy + 错误透传)**

  修改 `src/app/admin/(dashboard)/agents/page.tsx`。找到:

  ```ts
    const [togglingId, setTogglingId] = useState<string | null>(null);
    const [broadcastingId, setBroadcastingId] = useState<string | null>(null);
  ```

  替换为:

  ```ts
    const [togglingId, setTogglingId] = useState<string | null>(null);
    const [broadcastingId, setBroadcastingId] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);
  ```

  再找到(broadcastBirthday 函数结尾与 isCustomAnthem 之间):

  ```ts
      } finally {
        // Only clear the pending flag if no other broadcast has started in the
        // meantime — same stale-finally guard as toggleActive.
        setBroadcastingId((cur) => (cur === agent.id ? null : cur));
      }
    }

    const isCustomAnthem = anthemUrl !== '' && !isBuiltinAnthem(anthemUrl);
  ```

  替换为:

  ```ts
      } finally {
        // Only clear the pending flag if no other broadcast has started in the
        // meantime — same stale-finally guard as toggleActive.
        setBroadcastingId((cur) => (cur === agent.id ? null : cur));
      }
    }

    async function deleteAgent(agent: AgentRow) {
      setError(null);
      setDeletingId(agent.id);
      try {
        // 先取该成员名下记录计数,让确认弹窗给出具体数字(清理设计 §2.1)。
        const usageRes = await fetch(`/api/agents/${agent.id}/usage`);
        if (!usageRes.ok) {
          const body = (await usageRes
            .json()
            .catch(() => ({ error: 'Failed to load member records' }))) as { error?: string };
          setError(body.error ?? 'Failed to load member records');
          return;
        }
        const { data: usage } = (await usageRes.json()) as {
          data: { sales: number; listings: number; appraisals: number };
        };
        const confirmed = window.confirm(
          `Delete "${agent.name}"? This permanently removes ${usage.sales} sales, ` +
            `${usage.listings} listings and ${usage.appraisals} appraisals. This cannot be undone.`,
        );
        if (!confirmed) return;
        const res = await fetch(`/api/agents/${agent.id}`, { method: 'DELETE' });
        if (!res.ok) {
          const body = (await res
            .json()
            .catch(() => ({ error: 'Failed to delete member' }))) as { error?: string };
          setError(body.error ?? 'Failed to delete member');
          return;
        }
        await load();
      } finally {
        // Only clear the pending flag if no other delete has started in the
        // meantime — same stale-finally guard as toggleActive.
        setDeletingId((cur) => (cur === agent.id ? null : cur));
      }
    }

    const isCustomAnthem = anthemUrl !== '' && !isBuiltinAnthem(anthemUrl);
  ```

  再找到(Actions 单元格;停用开关列不动):

  ```tsx
                <div className="flex items-center gap-2">
                  <Button variant="ghost" onClick={() => openEdit(a)}>
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    aria-label="Play birthday broadcast"
                    onClick={() => broadcastBirthday(a)}
                    disabled={broadcastingId !== null}
                  >
                    🎂
                  </Button>
                </div>
  ```

  替换为(红色按钮用 UI kit 既有 `danger` variant,与其他 admin 页 Delete 一致):

  ```tsx
                <div className="flex items-center gap-2">
                  <Button variant="ghost" onClick={() => openEdit(a)}>
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    aria-label="Play birthday broadcast"
                    onClick={() => broadcastBirthday(a)}
                    disabled={broadcastingId !== null}
                  >
                    🎂
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => deleteAgent(a)}
                    disabled={deletingId !== null}
                  >
                    Delete
                  </Button>
                </div>
  ```

- [ ] **Step 8: 全仓校验**

  ```bash
  npx tsc --noEmit
  npx vitest run
  ```

  预期:tsc 零输出;全量 **22 files / 297 tests** 全绿(289 + 8:DELETE describe 2→5、usage +5)。

- [ ] **Step 9: Commit**

  ```bash
  git add "src/app/api/agents/[id]/route.ts" "src/app/api/agents/[id]/usage/route.ts" "src/app/admin/(dashboard)/agents/page.tsx" tests/api/agents.test.ts tests/api/sales.test.ts tests/api/listings.test.ts tests/api/appraisals.test.ts
  git commit -m "feat: hard-delete team members with usage-count confirm"
  ```

- [ ] **Step 10: 收尾回归(build + 全量 E2E,一次性)**

  ```bash
  npm run build
  npm run test:e2e
  ```

  预期:build 成功结束(exit 0);Playwright **6 passed**(约 8–10 分钟;offline 用例自身要 3–4 分钟,勿提前中断)。Task 1 已把 `SLIDE_TITLE_RE` 去掉 `HOT LISTINGS`;6 条用例的断言只依赖前两屏(MTD/YTD scorecard)或任意屏标题,7 键轮播(整轮 117s→105s)不影响任何时序窗口,预期零改动通过。
  若有红:按 superpowers:systematic-debugging 定位(先看是否环境/超时抖动,重跑单条 `npx playwright test -g "<用例名>"`);确需代码修复时,修复 + 全量 vitest/E2E 重验后以独立 commit 提交(例:`fix: e2e regression after hot listings removal`)。

---
## Self-Review(计划完成后自查,已执行)

1. **Spec 覆盖**:§1.1 十一处移除点 → Task 1 Step 1/3 逐条(settings 7 键①、seed 同步②、TvApp③、删文件④、tv/state⑤、types⑥、pagination⑦、settings 页⑧、E2E⑨、README⑩、测试①-④);§1.2 保留清单 → Step 3-⑤ 明示保留 listingRows,不动房源 API/后台页/TOP LISTERS/广播;§1.3 兼容回落 → settings.test.ts 新用例 + README 升级段;§2.1 交互 → Task 2 Step 7(danger 按钮、usage→confirm(含计数文案)→DELETE→load、deletingId 序列化 busy、错误透传);§2.2 API → Step 3(usage:org 过滤/404/行数口径)与 Step 5(事务级联、requireAdmin、org 过滤、404、单条 agents 广播;停用 PATCH 原样);§2.3 边界(文件孤儿/生日随行删/goals 不动)无代码项;§3 测试矩阵 → 两任务测试步骤 + seed deep-equal 自动钉;§4 非目标(不组件化 confirm、不清理存储、不动 listings 数据)未引入;§5 成功标准 → 各 Step 门禁 + Step 10。
2. **占位符扫描**:无 TBD/TODO/"similar to";所有代码块为完整逐字锚点(取自当前工作区)与完整实现。
3. **类型/命名一致性**:`deletingId`/`deleteAgent`/`seedPerformanceRows`/`USAGE_GET` 各步一致;usage 响应形状 `{ data: { sales, listings, appraisals } }` 在 route、API 测试、前端解构三处一致;`AGENTS_PATCH` 别名在三个测试文件一致;Task 1 删除的 `TvListing`/`gridPageSize`/`'listings'` 键在后续任务无残留引用。
