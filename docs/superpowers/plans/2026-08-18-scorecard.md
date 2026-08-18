# 记分卡(Scorecard)与真实数据模型 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 对齐真实 SOUTH. SALES SCORECARD 表格:`sales` 增加拆分份额 `split`(sales_count 口径从行数改 Σsplit),新表 `appraisals`(估价录入),新增默认启用的整页 Scorecard 轮播 slide(4 汇总块 + Rank/Name/Appraisals/Listings/Sales/Split/Gross Comm/Conversion 色块明细表,复用按屏分页),后台可录 split 与 appraisals,并提供幂等 SQL 一键导入 2026-08 真实数据(Railway Data 标签粘贴 / 本地 runner)。

**Architecture:** 数据层加一列一表(0002 迁移);口径改动收敛在 `computeLeaderboard`/`computeMetricTotal` 的 sales_count 分支(Σsplit)与 `formatValue` 的显示(1 位小数 `.0` 去尾);新 domain 纯函数 `computeScorecard(inputs, range)` 产出 `{ totals, rows }` 由 `/api/tv/state` 组装进 `TvStateResponse.scorecard`;TV 端新组件 `ScorecardSlide` 接入既有展开式分页轮播(新 SlideKey `'scorecard'`,SLIDE_KEYS 变 7 键、默认首位 20s;`SCORECARD_ITEM_PX`/`SCORECARD_RESERVED_PX` 常量与组件定高 CSS 同步);Appraisals 走与 sales/listings 完全同构的 admin API + 广播新 DataDomain `'appraisals'`;导入 SQL 全部 `INSERT ... SELECT ... WHERE NOT EXISTS` 幂等,本地 runner 按行尾 `;` 拆句逐条 `db.execute(sql.raw(...))`。

**Tech Stack:** 与主项目一致(Next.js 15 / React 19 / Drizzle + PGlite/Postgres / Tailwind 3.4 / Vitest / Playwright),零新依赖。

**执行约定:**
- 基线:分支 `feature/scorecard`(**已存在且已检出**,HEAD `2390d24` = 规格提交,落在全绿基线 `384b2a1` 之上)。开工前确认:
  ```bash
  git rev-parse --abbrev-ref HEAD
  git status
  ```
  预期:输出 `feature/scorecard`;工作区干净。
- 基线测试数(已实测):`npx vitest run` → **19 files / 242 tests 全绿**(约 75–90s);E2E `npm run test:e2e` → **5 passed**(约 8–10 分钟,offline 用例自身要 3–4 分钟)。
- 按 Task 1→2→3→4→5→6 顺序执行,每个 Task 结束时 tsc 零输出、全量 vitest 全绿、有独立 commit。
- 规格(权威需求):`docs/superpowers/specs/2026-08-18-scorecard-design.md`。
- 所有命令在项目根 `C:\Users\andyl\Desktop\工作文档\TV SaaS` 执行(均为跨平台 `npx`/`npm` 形式,PowerShell 可直接用;含 `[id]`/`(dashboard)` 的路径在 git add 时**必须加双引号**)。
- 新增 API route 一律 Next.js 15 约定:`ctx: { params: Promise<{ id: string }> }`,处理器内 `const { id } = await ctx.params;`。
- **像素同步约定**:`ScorecardSlide` 的定高 CSS(汇总块 `h-[120px]`、表头 `h-[48px]`、行 `h-[56px]`、两个 `mt-8`)与 TvApp 的 `SCORECARD_ITEM_PX = 56`、`SCORECARD_RESERVED_PX = 388` 一一对应,改任何一边必须同步另一边(与既有三板块的约定相同)。
- 兼容性说明(设计 §4,不需要代码处理):SLIDE_KEYS 变 7 键后,已存的 6 键 settings 行读取时 safeParse 失败 → `getSettings` 回落新 DEFAULT_SETTINGS 并 console.warn,既有轮播自定义丢失一次,已接受。
- 已核实:本仓 PGlite 是 PostgreSQL 17.5,`gen_random_uuid()` 为核心函数可直接用(不需要 pgcrypto);但导入 SQL 仍采用**固定字面量 id**(幂等判重更直接、可调试,云端/本地行为完全一致)。

---
### Task 1: 数据层 —— sales.split 列 + appraisals 表 + 0002 迁移

**Files:**
- Modify: `src/lib/db/schema.ts`(sales +`split`;新表 `appraisals`)
- Create: `drizzle/0002_*.sql` 与 `drizzle/meta/0002_snapshot.json`、`drizzle/meta/_journal.json` 更新(由 `npm run db:generate` 生成,文件名随机)
- Modify: `src/app/api/sales/route.ts`(create schema +split,insert 落 `?? 1`)
- Modify: `src/app/api/sales/[id]/route.ts`(patch schema +split)
- Test: `tests/db.test.ts`(+1 往返用例)
- Test: `tests/api/sales.test.ts`(+4 split 用例)

- [ ] **Step 1: 写数据层与 API 测试(先测试)**

  修改 `tests/db.test.ts`。找到(逐字):

  ```ts
  import {
    orgs, users, agents, sales, listings, announcements, goals, settings,
  } from '@/lib/db/schema';
  ```

  替换为:

  ```ts
  import {
    orgs, users, agents, appraisals, sales, listings, announcements, goals, settings,
  } from '@/lib/db/schema';
  ```

  再找到(`describe('database layer'` 内):

  ```ts
    it('getOrgId resolves the first org', async () => {
  ```

  替换为(在其前插入新用例):

  ```ts
    it('round-trips sales.split and an appraisals row', async () => {
      const { orgId, agentId } = await seedBasics(db);

      const sharedId = crypto.randomUUID();
      await db.insert(sales).values({
        id: sharedId, orgId, agentId, address: '2 Split Street',
        salePriceCents: 0, gciCents: 144850, saleDate: '2026-08-11', split: 0.8,
      });
      const [sharedSale] = await db.select().from(sales).where(eq(sales.id, sharedId));
      expect(sharedSale.split).toBe(0.8);

      // 不显式给 split 的行落 DEFAULT 1(既有行零迁移成本)
      const plainId = crypto.randomUUID();
      await db.insert(sales).values({
        id: plainId, orgId, agentId, address: '3 Plain Street',
        salePriceCents: 0, gciCents: 100000, saleDate: '2026-08-12',
      });
      const [plainSale] = await db.select().from(sales).where(eq(sales.id, plainId));
      expect(plainSale.split).toBe(1);

      const appraisalId = crypto.randomUUID();
      await db.insert(appraisals).values({
        id: appraisalId, orgId, agentId, date: '2026-08-05', count: 8,
      });
      const [appraisal] = await db.select().from(appraisals).where(eq(appraisals.id, appraisalId));
      expect(appraisal.agentId).toBe(agentId);
      expect(appraisal.date).toBe('2026-08-05');
      expect(appraisal.count).toBe(8);
      expect(appraisal.createdAt).toBeInstanceOf(Date);
    });

    it('getOrgId resolves the first org', async () => {
  ```

  修改 `tests/api/sales.test.ts`。找到(逐字,唯一锚点):

  ```ts
  describe('buildCelebrationPayload', () => {
  ```

  替换为(在其前插入新 describe):

  ```ts
  describe('sales split (设计 §2)', () => {
    it('creates a sale with an explicit fractional split', async () => {
      const res = await POST(
        await authedRequest('/api/sales', { method: 'POST', body: { ...saleBody(), split: 0.8 } }),
      );
      expect(res.status).toBe(200);
      expect((await res.json()).data.split).toBe(0.8);
    });

    it('defaults split to 1 when omitted', async () => {
      const res = await POST(await authedRequest('/api/sales', { method: 'POST', body: saleBody() }));
      expect(res.status).toBe(200);
      expect((await res.json()).data.split).toBe(1);
    });

    it('rejects out-of-range splits with 400', async () => {
      for (const split of [0, -0.5, 1.5]) {
        const res = await POST(
          await authedRequest('/api/sales', { method: 'POST', body: { ...saleBody(), split } }),
        );
        expect(res.status).toBe(400);
      }
      expect(events).toEqual([]);
    });

    it('PATCH updates split and broadcasts data.updated sales', async () => {
      const created = await (
        await POST(await authedRequest('/api/sales', { method: 'POST', body: saleBody() }))
      ).json();
      events.length = 0;

      const res = await PATCH(
        await authedRequest(`/api/sales/${created.data.id}`, { method: 'PATCH', body: { split: 0.5 } }),
        { params: Promise.resolve({ id: created.data.id }) },
      );
      expect(res.status).toBe(200);
      expect((await res.json()).data.split).toBe(0.5);
      expect(events).toEqual([{ type: 'data.updated', domain: 'sales' }]);
    });
  });

  describe('buildCelebrationPayload', () => {
  ```

- [ ] **Step 2: 运行确认失败**

  ```bash
  npx vitest run tests/db.test.ts tests/api/sales.test.ts
  ```

  预期失败:`tests/db.test.ts` 整文件加载失败(schema 尚无 `appraisals` 导出,报 `No matching export`/`does not provide an export named 'appraisals'`);`tests/api/sales.test.ts` 4 个新用例失败(`data.split` 为 undefined;越界 split 返回 200 而非 400),其余 18 个既有用例通过。

- [ ] **Step 3: 修改 schema.ts**

  修改 `src/lib/db/schema.ts`。找到:

  ```ts
  import {
    pgTable, text, integer, bigint, boolean, timestamp, date, jsonb, uniqueIndex,
  } from 'drizzle-orm/pg-core';
  ```

  替换为:

  ```ts
  import {
    pgTable, text, integer, bigint, boolean, timestamp, date, jsonb, uniqueIndex, doublePrecision,
  } from 'drizzle-orm/pg-core';
  ```

  再找到(sales 表内):

  ```ts
    saleDate: date('sale_date', { mode: 'string' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  });
  ```

  替换为:

  ```ts
    saleDate: date('sale_date', { mode: 'string' }).notNull(),
    // 成交拆分份额(设计 §2):0 < split ≤ 1(zod 层校验);共享成交每位参与者各一行,
    // 各自 split 与佣金份额;既有行走 DEFAULT 1(整单)。
    split: doublePrecision('split').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  });
  ```

  再找到(listings 表定义结尾与 screens 表之间):

  ```ts
  export const screens = pgTable('screens', {
  ```

  替换为(在其前插入新表):

  ```ts
  export const appraisals = pgTable('appraisals', {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull().references(() => orgs.id),
    agentId: text('agent_id').notNull().references(() => agents.id),
    date: text('date').notNull(),                  // 'YYYY-MM-DD'(API 层 regex 校验,设计 §2)
    count: integer('count').notNull().default(1),  // 一次录入可 +N(≥1,API 层校验)
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  });

  export const screens = pgTable('screens', {
  ```

- [ ] **Step 4: 生成 0002 迁移并核对 SQL**

  ```bash
  npm run db:generate
  ls drizzle
  cat drizzle/0002_*.sql
  ```

  预期:drizzle-kit 生成 `drizzle/0002_<随机名>.sql`(纯加表加列不会触发交互式提问),内容恰为以下 4 条语句(语句顺序可能不同;只有出现 DROP、额外语句或缺语句时才回查上一步 schema 改动):

  ```sql
  CREATE TABLE "appraisals" (
  	"id" text PRIMARY KEY NOT NULL,
  	"org_id" text NOT NULL,
  	"agent_id" text NOT NULL,
  	"date" text NOT NULL,
  	"count" integer DEFAULT 1 NOT NULL,
  	"created_at" timestamp with time zone DEFAULT now() NOT NULL
  );
  --> statement-breakpoint
  ALTER TABLE "sales" ADD COLUMN "split" double precision DEFAULT 1 NOT NULL;--> statement-breakpoint
  ALTER TABLE "appraisals" ADD CONSTRAINT "appraisals_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
  ALTER TABLE "appraisals" ADD CONSTRAINT "appraisals_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;
  ```

  同时 `drizzle/meta/_journal.json` 应新增 `idx: 2` 条目、生成 `drizzle/meta/0002_snapshot.json`。

- [ ] **Step 5: sales API 加 split**

  修改 `src/app/api/sales/route.ts`。找到:

  ```ts
  const createSchema = z.object({
    agentId: z.string().min(1),
    address: z.string().min(1),
    salePriceCents: z.number().int().min(0),
    gciCents: z.number().int().min(0),
    saleDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'saleDate must be YYYY-MM-DD'),
  });
  ```

  替换为:

  ```ts
  const createSchema = z.object({
    agentId: z.string().min(1),
    address: z.string().min(1),
    salePriceCents: z.number().int().min(0),
    gciCents: z.number().int().min(0),
    saleDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'saleDate must be YYYY-MM-DD'),
    // 成交拆分份额(设计 §2):0 < split ≤ 1;缺省按 1(整单)
    split: z.number().positive().max(1).optional(),
  });
  ```

  再找到:

  ```ts
        salePriceCents: parsed.data.salePriceCents,
        gciCents: parsed.data.gciCents,
        saleDate: parsed.data.saleDate,
      })
  ```

  替换为:

  ```ts
        salePriceCents: parsed.data.salePriceCents,
        gciCents: parsed.data.gciCents,
        split: parsed.data.split ?? 1,
        saleDate: parsed.data.saleDate,
      })
  ```

  修改 `src/app/api/sales/[id]/route.ts`。找到:

  ```ts
    saleDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'saleDate must be YYYY-MM-DD').optional(),
  });
  ```

  替换为(optional 非 nullable——split 不允许清空回落):

  ```ts
    saleDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'saleDate must be YYYY-MM-DD').optional(),
    split: z.number().positive().max(1).optional(),
  });
  ```

  (PATCH 处理器用 `...parsed.data` 展开写库,split 自动生效,无需其他改动。)

- [ ] **Step 6: 转绿 + 全仓校验**

  ```bash
  npx vitest run tests/db.test.ts tests/api/sales.test.ts
  npx tsc --noEmit
  npx vitest run
  ```

  预期:db **7 个**、sales **22 个**用例全部通过;tsc 零输出;全量 **19 files / 247 tests** 全绿(242 + 1 + 4;其余文件不受影响——LeaderboardInputs 尚未变,tv/state 的映射忽略新列)。

- [ ] **Step 7: Commit**

  ```bash
  git add src/lib/db/schema.ts drizzle src/app/api/sales/route.ts "src/app/api/sales/[id]/route.ts" tests/db.test.ts tests/api/sales.test.ts
  git commit -m "feat: sales split column and appraisals table"
  ```

---
### Task 2: 口径改 Σsplit + formatValue 一位小数 + computeScorecard 域函数

**Files:**
- Modify: `src/lib/domain/leaderboard.ts`(LeaderboardInputs.sales +split;sales_count 改 Σsplit)
- Modify: `src/lib/format.ts`(+`formatCount`;`formatValue` 计数分支改一位小数去尾)
- Modify: `src/app/api/tv/state/route.ts`(inputs.sales 映射补 split——保 tsc 绿)
- Modify: `src/lib/types.ts`(LeaderboardEntry.value 注释同步)
- Create: `src/lib/domain/scorecard.ts`
- Test: `tests/domain/leaderboard.test.ts`(sale fixture +split=1;+2 新用例;format 用例改 1 加 1)
- Test: `tests/domain/scorecard.test.ts`(新,8 用例)

- [ ] **Step 1: 更新 leaderboard/format 测试(先测试)**

  修改 `tests/domain/leaderboard.test.ts`。找到:

  ```ts
  const sale = (agentId: string, gciCents: number, saleDate: string, createdAt = `${saleDate}T10:00:00`) =>
    ({ agentId, gciCents, saleDate, createdAt: new Date(createdAt) });
  ```

  替换为:

  ```ts
  const sale = (
    agentId: string, gciCents: number, saleDate: string,
    createdAt = `${saleDate}T10:00:00`, split = 1,
  ) => ({ agentId, gciCents, saleDate, createdAt: new Date(createdAt), split });
  ```

  (所有既有调用不带第 5 参 → split 1,既有口径用例值不变。)

  再找到:

  ```ts
    it('ignores sales from agents missing in the inputs but still counts them in totals', () => {
  ```

  替换为(在其前插入新用例):

  ```ts
    it('sales_count sums split fractions (设计 §3:Σsplit,可为小数)', () => {
      const inputs: LeaderboardInputs = {
        agents: [agent('a', 'Alice'), agent('b', 'Bob')],
        sales: [
          sale('a', 100_000, '2026-08-05', '2026-08-05T10:00:00', 0.5),
          sale('a', 100_000, '2026-08-06', '2026-08-06T10:00:00', 0.2),
          sale('b', 100_000, '2026-08-07'),
        ],
        listings: [],
      };
      const rows = computeLeaderboard(inputs, 'sales_count', AUG);
      expect(rows[0]).toMatchObject({ agentId: 'b', value: 1, rank: 1 });
      expect(rows[1]).toMatchObject({ agentId: 'a', value: 0.7, rank: 2 });
    });

    it('ignores sales from agents missing in the inputs but still counts them in totals', () => {
  ```

  再找到:

  ```ts
      expect(computeMetricTotal(inputs, 'sales_count', AUG)).toBe(2);
      expect(computeMetricTotal(inputs, 'gci', AUG)).toBe(300_000);
      expect(computeMetricTotal(inputs, 'listings', AUG)).toBe(1);
    });
  });
  ```

  替换为:

  ```ts
      expect(computeMetricTotal(inputs, 'sales_count', AUG)).toBe(2);
      expect(computeMetricTotal(inputs, 'gci', AUG)).toBe(300_000);
      expect(computeMetricTotal(inputs, 'listings', AUG)).toBe(1);
    });

    it('sales_count total sums splits (not row count)', () => {
      const inputs: LeaderboardInputs = {
        agents: [agent('a', 'Alice')],
        sales: [
          sale('a', 100_000, '2026-08-05', '2026-08-05T10:00:00', 1),
          sale('a', 100_000, '2026-08-06', '2026-08-06T10:00:00', 0.8),
          sale('ghost', 100_000, '2026-08-07', '2026-08-07T10:00:00', 0.5),
          sale('a', 100_000, '2026-07-01', '2026-07-01T10:00:00', 0.5), // out of period
        ],
        listings: [],
      };
      // 浮点求和用 toBeCloseTo(1 + 0.8 + 0.5 = 2.3)
      expect(computeMetricTotal(inputs, 'sales_count', AUG)).toBeCloseTo(2.3, 12);
    });
  });
  ```

  再找到:

  ```ts
    it('formatValue: gci uses formatMoney, counts use String', () => {
      expect(formatValue('gci', 850_000)).toBe('$8,500');
      expect(formatValue('sales_count', 7)).toBe('7');
      expect(formatValue('listings', 3)).toBe('3');
    });
  ```

  替换为:

  ```ts
    it('formatValue: gci uses formatMoney, whole counts render bare', () => {
      expect(formatValue('gci', 850_000)).toBe('$8,500');
      expect(formatValue('sales_count', 7)).toBe('7');
      expect(formatValue('listings', 3)).toBe('3');
    });

    it('formatValue: fractional sales counts keep one decimal and trim .0 (设计 §3)', () => {
      expect(formatValue('sales_count', 8)).toBe('8');
      expect(formatValue('sales_count', 1.8)).toBe('1.8');
      expect(formatValue('sales_count', 0.7)).toBe('0.7');
      // Σsplit 的浮点尘埃要先四舍五入到 1 位小数再判整,不能直接 String()
      expect(formatValue('sales_count', 7.999999999999999)).toBe('8');
    });
  ```

- [ ] **Step 2: 写 scorecard 域测试(先测试)**

  创建 `tests/domain/scorecard.test.ts`:

  ```ts
  import { describe, it, expect } from 'vitest';
  import { computeScorecard, type ScorecardInputs } from '@/lib/domain/scorecard';

  // August 2026, end exclusive
  const AUG = { start: new Date(2026, 7, 1), end: new Date(2026, 8, 1) };

  const agent = (id: string, name: string, role: 'agent' | 'staff' = 'agent', active = true) =>
    ({ id, name, role, active });
  const sale = (agentId: string, gciCents: number, saleDate: string, split = 1) =>
    ({ agentId, gciCents, saleDate, split });
  const listing = (agentId: string, listedDate: string) => ({ agentId, listedDate });
  const appraisal = (agentId: string, date: string, count = 1) => ({ agentId, date, count });

  describe('computeScorecard', () => {
    it('aggregates appraisals, listings, sales, split and gci per agent', () => {
      const inputs: ScorecardInputs = {
        agents: [agent('a', 'Alice')],
        sales: [sale('a', 100_000, '2026-08-05'), sale('a', 200_000, '2026-08-10', 0.8)],
        listings: [listing('a', '2026-08-03')],
        appraisals: [appraisal('a', '2026-08-02', 3), appraisal('a', '2026-08-04')],
      };
      const { rows, totals } = computeScorecard(inputs, AUG);
      expect(rows).toEqual([{
        agentId: 'a', name: 'Alice', appraisals: 4, listings: 1,
        sales: 2, split: 1.8, gciCents: 300_000, conversionPct: 25,
      }]);
      expect(totals).toEqual({ appraisals: 4, listings: 1, salesSplit: 1.8, gciCents: 300_000 });
    });

    it('filters every metric by the period range (start inclusive, end exclusive)', () => {
      const inputs: ScorecardInputs = {
        agents: [agent('a', 'Alice')],
        sales: [sale('a', 100_000, '2026-08-01'), sale('a', 900_000, '2026-09-01')],
        listings: [listing('a', '2026-08-31'), listing('a', '2026-07-31')],
        appraisals: [appraisal('a', '2026-08-01', 2), appraisal('a', '2026-07-31', 9)],
      };
      const { rows } = computeScorecard(inputs, AUG);
      expect(rows[0]).toMatchObject({ appraisals: 2, listings: 1, sales: 1, gciCents: 100_000 });
    });

    it('sorts by gciCents desc and breaks ties by name asc', () => {
      const inputs: ScorecardInputs = {
        agents: [
          agent('t', 'Team Cowley'), agent('m', 'Michael Hatzinicolaou'), agent('c', 'Chris Joyce'),
        ],
        sales: [
          sale('t', 500_000, '2026-08-05', 0.5),
          sale('m', 500_000, '2026-08-06', 0.5),
          sale('c', 900_000, '2026-08-07'),
        ],
        listings: [],
        appraisals: [],
      };
      const { rows } = computeScorecard(inputs, AUG);
      expect(rows.map((r) => r.name)).toEqual(['Chris Joyce', 'Michael Hatzinicolaou', 'Team Cowley']);
    });

    it('conversionPct: null without appraisals, 0 with appraisals but no listings, one decimal otherwise', () => {
      const inputs: ScorecardInputs = {
        agents: [agent('a', 'Alice'), agent('b', 'Bob'), agent('c', 'Cara')],
        sales: [sale('a', 100_000, '2026-08-05'), sale('b', 100_000, '2026-08-06')],
        listings: [listing('c', '2026-08-03'), listing('c', '2026-08-04')],
        appraisals: [appraisal('b', '2026-08-02', 4), appraisal('c', '2026-08-02', 13)],
      };
      const { rows } = computeScorecard(inputs, AUG);
      const byId = new Map(rows.map((r) => [r.agentId, r]));
      expect(byId.get('a')!.conversionPct).toBeNull();  // 无估价 → —
      expect(byId.get('b')!.conversionPct).toBe(0);     // 有估价无房源 → 0(红)
      expect(byId.get('c')!.conversionPct).toBe(15.4);  // 2/13 → 15.3846… → 15.4(样表 Hill & Co)
    });

    it('drops members with every metric at zero but keeps appraisal-only members', () => {
      const inputs: ScorecardInputs = {
        agents: [agent('a', 'Alice'), agent('idle', 'Idle Ivy'), agent('t', 'Team Brudenell')],
        sales: [sale('a', 100_000, '2026-08-05')],
        listings: [],
        appraisals: [
          appraisal('t', '2026-08-11', 4),
          appraisal('idle', '2026-07-01', 5), // idle 只有期外估价 → 全指标 0 → 不成行
        ],
      };
      const { rows } = computeScorecard(inputs, AUG);
      expect(rows.map((r) => r.agentId)).toEqual(['a', 't']);
      expect(rows[1]).toMatchObject({
        appraisals: 4, listings: 0, sales: 0, split: 0, gciCents: 0, conversionPct: 0,
      });
    });

    it('excludes staff and inactive members even with in-period activity', () => {
      const inputs: ScorecardInputs = {
        agents: [
          agent('a', 'Alice'),
          agent('s', 'Sam Staff', 'staff'),
          agent('x', 'Xavier Gone', 'agent', false),
        ],
        sales: [
          sale('a', 100_000, '2026-08-05'),
          sale('s', 900_000, '2026-08-06'),
          sale('x', 900_000, '2026-08-07'),
        ],
        listings: [],
        appraisals: [],
      };
      const { rows } = computeScorecard(inputs, AUG);
      expect(rows.map((r) => r.agentId)).toEqual(['a']);
    });

    it('totals sum the surviving rows and keep salesSplit fractional', () => {
      const inputs: ScorecardInputs = {
        agents: [agent('a', 'Alice'), agent('b', 'Bob')],
        sales: [
          sale('a', 100_000, '2026-08-05', 0.5),
          sale('b', 200_000, '2026-08-06', 0.2),
          sale('b', 300_000, '2026-08-07'),
        ],
        listings: [listing('a', '2026-08-03')],
        appraisals: [appraisal('a', '2026-08-02', 2)],
      };
      const { totals } = computeScorecard(inputs, AUG);
      expect(totals).toEqual({ appraisals: 2, listings: 1, salesSplit: 1.7, gciCents: 600_000 });
    });

    it('ignores rows referencing unknown agent ids', () => {
      const inputs: ScorecardInputs = {
        agents: [agent('a', 'Alice')],
        sales: [sale('ghost', 900_000, '2026-08-05')],
        listings: [],
        appraisals: [appraisal('a', '2026-08-02')],
      };
      const { rows, totals } = computeScorecard(inputs, AUG);
      expect(rows).toEqual([{
        agentId: 'a', name: 'Alice', appraisals: 1, listings: 0,
        sales: 0, split: 0, gciCents: 0, conversionPct: 0,
      }]);
      expect(totals.gciCents).toBe(0);
    });
  });
  ```

- [ ] **Step 3: 运行确认失败**

  ```bash
  npx vitest run tests/domain/leaderboard.test.ts tests/domain/scorecard.test.ts
  ```

  预期失败:leaderboard 的 2 个 Σsplit 新用例失败(value 仍按行数:0.7 处得 2、2.3 处得 3),format 尘埃用例失败(`String(7.999999999999999)` ≠ `'8'`);scorecard 整文件模块解析失败(`@/lib/domain/scorecard` 不存在);leaderboard 其余既有用例通过。

- [ ] **Step 4: 实现 —— 口径 + formatCount + scorecard.ts + route 映射**

  ① 修改 `src/lib/domain/leaderboard.ts`。找到:

  ```ts
  export type LeaderboardInputs = {
    agents: { id: string; name: string; photoUrl: string | null; active: boolean }[];
    sales: { agentId: string; gciCents: number; saleDate: string; createdAt: Date }[];      // saleDate 'YYYY-MM-DD'
    listings: { agentId: string; listedDate: string }[];
  };
  ```

  替换为:

  ```ts
  export type LeaderboardInputs = {
    agents: { id: string; name: string; photoUrl: string | null; active: boolean }[];
    // saleDate 'YYYY-MM-DD';split:成交拆分份额(设计 §3:sales_count 口径 = Σsplit)
    sales: { agentId: string; gciCents: number; saleDate: string; createdAt: Date; split: number }[];
    listings: { agentId: string; listedDate: string }[];
  };
  ```

  再找到:

  ```ts
      const s = get(row.agentId);
      s.salesCount += 1;
      s.gciCents += row.gciCents;
  ```

  替换为:

  ```ts
      const s = get(row.agentId);
      s.salesCount += row.split; // 设计 §3:sales_count = Σsplit(可为小数)
      s.gciCents += row.gciCents;
  ```

  再找到:

  ```ts
    const inPeriod = inputs.sales.filter((s) => inRange(s.saleDate, range));
    if (metric === 'sales_count') return inPeriod.length;
    return inPeriod.reduce((sum, s) => sum + s.gciCents, 0);
  ```

  替换为:

  ```ts
    const inPeriod = inputs.sales.filter((s) => inRange(s.saleDate, range));
    if (metric === 'sales_count') return inPeriod.reduce((sum, s) => sum + s.split, 0); // Σsplit(设计 §3)
    return inPeriod.reduce((sum, s) => sum + s.gciCents, 0);
  ```

  ② 修改 `src/lib/format.ts`。找到:

  ```ts
  export function formatValue(metric: Metric, value: number): string {
    return metric === 'gci' ? formatMoney(value) : String(value);
  }
  ```

  替换为:

  ```ts
  /** 计数类数值(sales_count/listings/split):最多 1 位小数、`.0` 去尾(8→'8'、1.8→'1.8')。
   *  先四舍五入到 1 位小数清 Σsplit 浮点尘埃(7.999999999999999→8),再判整。 */
  export function formatCount(value: number): string {
    const rounded = Math.round(value * 10) / 10;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  }

  export function formatValue(metric: Metric, value: number): string {
    return metric === 'gci' ? formatMoney(value) : formatCount(value);
  }
  ```

  ③ 创建 `src/lib/domain/scorecard.ts`:

  ```ts
  // Scorecard 域纯函数(设计 §4/§5):按周期聚合每位 agent 的
  // appraisals / listings / sales(参与笔数)/ split(Σ)/ gci 与 listing conversion。

  export type ScorecardInputs = {
    agents: { id: string; name: string; role: string; active: boolean }[];
    sales: { agentId: string; gciCents: number; saleDate: string; split: number }[];  // saleDate 'YYYY-MM-DD'
    listings: { agentId: string; listedDate: string }[];
    appraisals: { agentId: string; date: string; count: number }[];                   // date 'YYYY-MM-DD'
  };

  export type ScorecardRow = {
    agentId: string;
    name: string;
    appraisals: number;
    listings: number;
    sales: number;                 // 参与笔数(行数)
    split: number;                 // Σsplit,1 位小数
    gciCents: number;
    conversionPct: number | null;  // appraisals>0 ? round1(listings/appraisals*100) : null
  };

  export type ScorecardData = {
    totals: { appraisals: number; listings: number; salesSplit: number; gciCents: number };
    rows: ScorecardRow[];          // gciCents desc,tie 按 name asc;全指标 0 的成员不成行
  };

  type Range = { start: Date; end: Date };

  /** Parse 'YYYY-MM-DD' as local-time midnight of that day. */
  function parseLocalDate(dateStr: string): Date {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function inRange(dateStr: string, range: Range): boolean {
    const t = parseLocalDate(dateStr).getTime();
    return t >= range.start.getTime() && t < range.end.getTime();
  }

  /** 1 位小数;顺带清掉 Σsplit 的浮点尘埃,让 toEqual 断言与显示都确定。 */
  function round1(x: number): number {
    return Math.round(x * 10) / 10;
  }

  type Acc = { appraisals: number; listings: number; sales: number; split: number; gciCents: number };

  function newAcc(): Acc {
    return { appraisals: 0, listings: 0, sales: 0, split: 0, gciCents: 0 };
  }

  export function computeScorecard(inputs: ScorecardInputs, range: Range): ScorecardData {
    const acc = new Map<string, Acc>();
    const get = (agentId: string): Acc => {
      let a = acc.get(agentId);
      if (!a) {
        a = newAcc();
        acc.set(agentId, a);
      }
      return a;
    };
    for (const row of inputs.sales) {
      if (!inRange(row.saleDate, range)) continue;
      const a = get(row.agentId);
      a.sales += 1;
      a.split += row.split;
      a.gciCents += row.gciCents;
    }
    for (const row of inputs.listings) {
      if (!inRange(row.listedDate, range)) continue;
      get(row.agentId).listings += 1;
    }
    for (const row of inputs.appraisals) {
      if (!inRange(row.date, range)) continue;
      get(row.agentId).appraisals += row.count;
    }

    const rows: ScorecardRow[] = inputs.agents
      .filter((a) => a.role === 'agent' && a.active)
      .map((a) => {
        const s = acc.get(a.id) ?? newAcc();
        return {
          agentId: a.id,
          name: a.name,
          appraisals: s.appraisals,
          listings: s.listings,
          sales: s.sales,
          split: round1(s.split),
          gciCents: s.gciCents,
          conversionPct: s.appraisals > 0 ? round1((s.listings / s.appraisals) * 100) : null,
        };
      })
      // 全指标为 0 的成员不成行(设计 §5)。
      .filter((r) => r.appraisals > 0 || r.listings > 0 || r.sales > 0 || r.gciCents > 0);

    rows.sort((x, y) =>
      y.gciCents - x.gciCents
      || (x.name < y.name ? -1 : x.name > y.name ? 1 : 0));

    const totals = rows.reduce(
      (t, r) => ({
        appraisals: t.appraisals + r.appraisals,
        listings: t.listings + r.listings,
        salesSplit: t.salesSplit + r.split,
        gciCents: t.gciCents + r.gciCents,
      }),
      { appraisals: 0, listings: 0, salesSplit: 0, gciCents: 0 },
    );
    totals.salesSplit = round1(totals.salesSplit);

    return { totals, rows };
  }
  ```

  ④ 修改 `src/app/api/tv/state/route.ts`(LeaderboardInputs 变形后的编译连带)。找到:

  ```ts
      sales: saleRows.map((s) => ({
        agentId: s.agentId, gciCents: s.gciCents, saleDate: s.saleDate, createdAt: s.createdAt,
      })),
  ```

  替换为:

  ```ts
      sales: saleRows.map((s) => ({
        agentId: s.agentId, gciCents: s.gciCents, saleDate: s.saleDate, createdAt: s.createdAt, split: s.split,
      })),
  ```

  ⑤ 修改 `src/lib/types.ts`(注释同步)。找到:

  ```ts
    value: number;   // sales_count/listings: count; gci: cents
  ```

  替换为:

  ```ts
    value: number;   // sales_count: Σsplit(可为小数);listings: count;gci: cents
  ```

- [ ] **Step 5: 转绿 + 全仓校验**

  ```bash
  npx vitest run tests/domain/leaderboard.test.ts tests/domain/scorecard.test.ts
  npx tsc --noEmit
  npx vitest run
  ```

  预期:leaderboard **18 个**(原 15:format 改写 1、新增 3)、scorecard **8 个**全部通过;tsc 零输出;全量 **20 files / 258 tests** 全绿(247 + 3 + 8;tv-state 等集成用例的 split 全为默认 1,数值不变)。

- [ ] **Step 6: Commit**

  ```bash
  git add src/lib/domain/leaderboard.ts src/lib/format.ts src/lib/domain/scorecard.ts src/app/api/tv/state/route.ts src/lib/types.ts tests/domain/leaderboard.test.ts tests/domain/scorecard.test.ts
  git commit -m "feat: split-sum sales metric and scorecard domain function"
  ```

---
### Task 3: Appraisals API + settings 7 键 + tv/state 组装 scorecard

**Files:**
- Modify: `src/lib/ws/protocol.ts`(DataDomain +'appraisals')
- Modify: `src/lib/settings.ts`(SLIDE_KEYS 7 键、DEFAULT_SETTINGS 首位 scorecard 20s)
- Modify: `src/lib/db/seed.ts`(**内联 DEFAULT_SETTINGS_DATA 同步加行**)
- Create: `src/app/api/appraisals/route.ts`(GET/POST)
- Create: `src/app/api/appraisals/[id]/route.ts`(DELETE)
- Modify: `src/app/api/tv/state/route.ts`(查 appraisals + 组装 scorecard)
- Modify: `src/lib/types.ts`(TvStateResponse +scorecard)
- Modify: `src/components/tv/TvApp.tsx`(perPage/counts 补 scorecard 过渡态——保 tsc 绿,真接入在 Task 4)
- Modify: `src/app/admin/(dashboard)/settings/page.tsx`(SLIDE_LABELS +scorecard——`Record<SlideKey, string>` 编译连带)
- Test: `tests/api/appraisals.test.ts`(新,10 用例)
- Test: `tests/settings.test.ts`(+1 用例、2 处注释改 7 键口径)
- Test: `tests/db.test.ts`(seed 用例改 deep-equal 钉死 seed/settings 同步)
- Test: `tests/api/tv-state.test.ts`(+1 scorecard 用例)

- [ ] **Step 1: 写 settings/seed/tv-state 测试(先测试)**

  修改 `tests/settings.test.ts`。找到:

  ```ts
  import { getSettings, saveSettings, DEFAULT_SETTINGS, type SettingsData } from '@/lib/settings';
  ```

  替换为:

  ```ts
  import { getSettings, saveSettings, DEFAULT_SETTINGS, SLIDE_KEYS, type SettingsData } from '@/lib/settings';
  ```

  再找到:

  ```ts
  describe('getSettings / saveSettings', () => {
  ```

  替换为(在其前插入新 describe):

  ```ts
  describe('SLIDE_KEYS / DEFAULT_SETTINGS', () => {
    it('leads with the scorecard slide across all 7 keys (设计 §4)', () => {
      expect(SLIDE_KEYS).toHaveLength(7);
      expect(SLIDE_KEYS[0]).toBe('scorecard');
      expect(DEFAULT_SETTINGS.slides.map((s) => s.key)).toEqual([...SLIDE_KEYS]);
      expect(DEFAULT_SETTINGS.slides[0]).toEqual({ key: 'scorecard', enabled: true, durationSec: 20 });
    });
  });

  describe('getSettings / saveSettings', () => {
  ```

  再找到:

  ```ts
      // Missing one key (only 5 of the 6 required slide keys present).
  ```

  替换为:

  ```ts
      // Missing keys (only 5 of the 7 required slide keys present).
  ```

  再找到:

  ```ts
      // Duplicate key (7 entries: all six keys present plus the first key repeated).
  ```

  替换为:

  ```ts
      // Duplicate key (8 entries: all seven keys present plus the first key repeated).
  ```

  修改 `tests/db.test.ts`。找到:

  ```ts
  import { seed } from '@/lib/db/seed';
  ```

  替换为:

  ```ts
  import { seed } from '@/lib/db/seed';
  import { DEFAULT_SETTINGS } from '@/lib/settings';
  ```

  再找到:

  ```ts
      const settingsRows = await db.select().from(settings);
      expect(settingsRows).toHaveLength(1);
      const data = settingsRows[0].data as { leaderboardPeriod: string; celebrationDurationSec: number };
      expect(data.leaderboardPeriod).toBe('month');
      expect(data.celebrationDurationSec).toBe(18);
  ```

  替换为:

  ```ts
      const settingsRows = await db.select().from(settings);
      expect(settingsRows).toHaveLength(1);
      // seed 内联的 DEFAULT_SETTINGS_DATA 必须与 '@/lib/settings' 的 DEFAULT_SETTINGS 逐字段同步
      // (否则新库首读 safeParse 失败回落默认、seed 语义失真)——deep-equal 把同步约定钉死在测试里。
      expect(settingsRows[0].data).toEqual(DEFAULT_SETTINGS);
  ```

  修改 `tests/api/tv-state.test.ts`。找到:

  ```ts
  import { agents, announcements, goals, listings, sales, screens } from '@/lib/db/schema';
  ```

  替换为:

  ```ts
  import { agents, announcements, appraisals, goals, listings, sales, screens } from '@/lib/db/schema';
  ```

  再找到:

  ```ts
    it('caps goal percent at 100', async () => {
  ```

  替换为(在其前插入新用例):

  ```ts
    it('assembles the scorecard block (totals, ranked rows, conversion)', async () => {
      const today = localDateStr(new Date());
      const bobId = crypto.randomUUID();
      await db.insert(agents).values({ id: bobId, orgId: basics.orgId, name: 'Bob Ray' });

      await db.insert(sales).values([
        // Alice:共享成交两行(0.5+0.5)
        { id: crypto.randomUUID(), orgId: basics.orgId, agentId: basics.agentId, address: '1 Split St', salePriceCents: 0, gciCents: 50000, saleDate: today, split: 0.5 },
        { id: crypto.randomUUID(), orgId: basics.orgId, agentId: basics.agentId, address: '2 Split St', salePriceCents: 0, gciCents: 50000, saleDate: today, split: 0.5 },
        // Bob:一行整单,GCI 更高 → rank 1
        { id: crypto.randomUUID(), orgId: basics.orgId, agentId: bobId, address: '3 Whole St', salePriceCents: 0, gciCents: 300000, saleDate: today },
      ]);
      await db.insert(listings).values([
        // sold 也计入 listings 指标与 conversion(不上 TV 在售页)
        { id: crypto.randomUUID(), orgId: basics.orgId, agentId: basics.agentId, address: '10 Beach Rd', listPriceCents: 0, listedDate: today, status: 'sold' },
      ]);
      await db.insert(appraisals).values([
        { id: crypto.randomUUID(), orgId: basics.orgId, agentId: basics.agentId, date: today, count: 4 },
      ]);

      const res = await tvStateGet(stateRequest(token));
      expect(res.status).toBe(200);
      const { data } = await res.json();

      expect(data.scorecard.rows).toEqual([
        { agentId: bobId, name: 'Bob Ray', appraisals: 0, listings: 0, sales: 1, split: 1, gciCents: 300000, conversionPct: null },
        { agentId: basics.agentId, name: 'Alice Ng', appraisals: 4, listings: 1, sales: 2, split: 1, gciCents: 100000, conversionPct: 25 },
      ]);
      expect(data.scorecard.totals).toEqual({ appraisals: 4, listings: 1, salesSplit: 2, gciCents: 400000 });
    });

    it('caps goal percent at 100', async () => {
  ```

- [ ] **Step 2: 写 appraisals API 测试(先测试)**

  创建 `tests/api/appraisals.test.ts`:

  ```ts
  import { describe, it, expect, beforeEach } from 'vitest';
  import { freshDb, seedBasics, type Basics } from '../helpers/db';
  import { jsonRequest, authedRequest } from '../helpers/request';
  import { getHub } from '@/lib/ws/hub';
  import type { ServerEvent } from '@/lib/ws/protocol';
  import { GET, POST } from '@/app/api/appraisals/route';
  import { DELETE } from '@/app/api/appraisals/[id]/route';
  import { POST as AGENTS_POST } from '@/app/api/agents/route';
  import { DELETE as AGENTS_DELETE } from '@/app/api/agents/[id]/route';

  let basics: Basics;
  let events: ServerEvent[];

  beforeEach(async () => {
    const db = await freshDb();
    basics = await seedBasics(db);
    events = [];
    getHub().register(
      'screen-test',
      { send: (data: string) => events.push(JSON.parse(data) as ServerEvent), close: () => {} },
      true,
    );
  });

  const appraisalBody = () => ({ agentId: basics.agentId, date: '2026-08-15', count: 3 });

  describe('POST /api/appraisals', () => {
    it('requires admin session', async () => {
      const res = await POST(jsonRequest('/api/appraisals', { method: 'POST', body: appraisalBody() }));
      expect(res.status).toBe(401);
      expect(events).toEqual([]);
    });

    it('creates an appraisal entry and broadcasts data.updated appraisals', async () => {
      const res = await POST(
        await authedRequest('/api/appraisals', { method: 'POST', body: appraisalBody() }),
      );
      expect(res.status).toBe(200);
      const { data } = await res.json();
      expect(data.agentId).toBe(basics.agentId);
      expect(data.date).toBe('2026-08-15');
      expect(data.count).toBe(3);
      expect(events).toEqual([{ type: 'data.updated', domain: 'appraisals' }]);
    });

    it('rejects a malformed date with 400', async () => {
      const res = await POST(
        await authedRequest('/api/appraisals', {
          method: 'POST',
          body: { ...appraisalBody(), date: '15/08/2026' },
        }),
      );
      expect(res.status).toBe(400);
      expect(events).toEqual([]);
    });

    it('rejects out-of-range counts with 400', async () => {
      for (const count of [0, -1, 2.5, 1000]) {
        const res = await POST(
          await authedRequest('/api/appraisals', { method: 'POST', body: { ...appraisalBody(), count } }),
        );
        expect(res.status).toBe(400);
      }
      expect(events).toEqual([]);
    });

    it('rejects an unknown agentId with 400 Unknown agent', async () => {
      const res = await POST(
        await authedRequest('/api/appraisals', {
          method: 'POST',
          body: { ...appraisalBody(), agentId: 'ghost' },
        }),
      );
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Unknown agent' });
      expect(events).toEqual([]);
    });

    it('rejects staff members with 400 Unknown agent', async () => {
      const staffRes = await AGENTS_POST(
        await authedRequest('/api/agents', {
          method: 'POST',
          body: { name: 'Sam Staff', role: 'staff' },
        }),
      );
      expect(staffRes.status).toBe(200);
      const { data: staff } = await staffRes.json();
      events.length = 0;

      const res = await POST(
        await authedRequest('/api/appraisals', {
          method: 'POST',
          body: { ...appraisalBody(), agentId: staff.id },
        }),
      );
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Unknown agent' });
      expect(events).toEqual([]);
    });

    it('rejects inactive agents with 400 Unknown agent', async () => {
      const delRes = await AGENTS_DELETE(
        await authedRequest(`/api/agents/${basics.agentId}`, { method: 'DELETE' }),
        { params: Promise.resolve({ id: basics.agentId }) },
      );
      expect(delRes.status).toBe(200);
      events.length = 0;

      const res = await POST(
        await authedRequest('/api/appraisals', { method: 'POST', body: appraisalBody() }),
      );
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Unknown agent' });
      expect(events).toEqual([]);
    });
  });

  describe('GET /api/appraisals', () => {
    it('lists appraisals with agentName, newest date first', async () => {
      await POST(await authedRequest('/api/appraisals', {
        method: 'POST', body: { agentId: basics.agentId, date: '2026-08-10', count: 1 },
      }));
      await POST(await authedRequest('/api/appraisals', {
        method: 'POST', body: { agentId: basics.agentId, date: '2026-08-14', count: 2 },
      }));
      const res = await GET(await authedRequest('/api/appraisals'));
      expect(res.status).toBe(200);
      const { data } = await res.json();
      expect(data.map((r: { date: string }) => r.date)).toEqual(['2026-08-14', '2026-08-10']);
      expect(data[0].agentName).toBe('Alice Ng');
      expect(data[0].count).toBe(2);
    });
  });

  describe('DELETE /api/appraisals/[id]', () => {
    it('deletes and broadcasts data.updated appraisals', async () => {
      const created = await (
        await POST(await authedRequest('/api/appraisals', { method: 'POST', body: appraisalBody() }))
      ).json();
      events.length = 0;

      const res = await DELETE(
        await authedRequest(`/api/appraisals/${created.data.id}`, { method: 'DELETE' }),
        { params: Promise.resolve({ id: created.data.id }) },
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ data: { id: created.data.id } });

      const list = await (await GET(await authedRequest('/api/appraisals'))).json();
      expect(list.data).toHaveLength(0);
      expect(events).toEqual([{ type: 'data.updated', domain: 'appraisals' }]);
    });

    it('returns 404 for an unknown id', async () => {
      const res = await DELETE(
        await authedRequest('/api/appraisals/ghost', { method: 'DELETE' }),
        { params: Promise.resolve({ id: 'ghost' }) },
      );
      expect(res.status).toBe(404);
      expect(events).toEqual([]);
    });
  });
  ```

- [ ] **Step 3: 运行确认失败**

  ```bash
  npx vitest run tests/api/appraisals.test.ts tests/settings.test.ts tests/db.test.ts tests/api/tv-state.test.ts
  ```

  预期失败:appraisals 整文件模块解析失败(route 文件不存在);settings 新用例失败(SLIDE_KEYS 长度 6 ≠ 7);tv-state 新用例失败(`data.scorecard` 为 undefined,以及 schema 的 appraisals 导入已在 Task 1 就位所以文件能加载);db.test 的 seed 用例此刻**仍通过**(settings 还没改,内联数据与 DEFAULT_SETTINGS 尚一致)——它将在下一步改 settings.ts 而 seed.ts 未同步时变红,正是它存在的意义。

- [ ] **Step 4: 实现 —— protocol / settings / seed / 路由 / tv-state / 编译连带**

  ① 修改 `src/lib/ws/protocol.ts`。找到:

  ```ts
  export type DataDomain = 'sales' | 'listings' | 'goals' | 'announcements' | 'agents';
  ```

  替换为:

  ```ts
  export type DataDomain = 'sales' | 'listings' | 'goals' | 'announcements' | 'agents' | 'appraisals';
  ```

  ② 修改 `src/lib/settings.ts`。找到:

  ```ts
  export const SLIDE_KEYS = [
    'leaderboard_sales_count', 'leaderboard_gci', 'leaderboard_listings',
    'goal_progress', 'listings', 'announcements',
  ] as const;
  ```

  替换为:

  ```ts
  // 7 键(设计 §4):scorecard 排首位。已存的 6 键 settings 行 safeParse 失败后
  // 由 getSettings 回落新 DEFAULT_SETTINGS(既有轮播自定义丢失一次,已接受)。
  export const SLIDE_KEYS = [
    'scorecard',
    'leaderboard_sales_count', 'leaderboard_gci', 'leaderboard_listings',
    'goal_progress', 'listings', 'announcements',
  ] as const;
  ```

  再找到:

  ```ts
    slides: [
      { key: 'leaderboard_sales_count', enabled: true, durationSec: 15 },
      { key: 'leaderboard_gci', enabled: true, durationSec: 15 },
  ```

  替换为:

  ```ts
    slides: [
      { key: 'scorecard', enabled: true, durationSec: 20 },
      { key: 'leaderboard_sales_count', enabled: true, durationSec: 15 },
      { key: 'leaderboard_gci', enabled: true, durationSec: 15 },
  ```

  ③ 修改 `src/lib/db/seed.ts`(**同步内联默认**)。找到:

  ```ts
  // Keep in sync with DEFAULT_SETTINGS in '@/lib/settings' (introduced in Task 9).
  // Inlined here because seed.ts is created before settings.ts exists.
  const DEFAULT_SETTINGS_DATA = {
    slides: [
      { key: 'leaderboard_sales_count', enabled: true, durationSec: 15 },
  ```

  替换为:

  ```ts
  // Keep in sync with DEFAULT_SETTINGS in '@/lib/settings' (introduced in Task 9).
  // Inlined here because seed.ts is created before settings.ts exists.
  // 同步性由 tests/db.test.ts 的 toEqual(DEFAULT_SETTINGS) 断言钉死(scorecard Task 3)。
  const DEFAULT_SETTINGS_DATA = {
    slides: [
      { key: 'scorecard', enabled: true, durationSec: 20 },
      { key: 'leaderboard_sales_count', enabled: true, durationSec: 15 },
  ```

  ④ 创建 `src/app/api/appraisals/route.ts`:

  ```ts
  import { z } from 'zod';
  import { and, desc, eq } from 'drizzle-orm';
  import { getDb } from '@/lib/db';
  import { getOrgId } from '@/lib/db/org';
  import { agents, appraisals } from '@/lib/db/schema';
  import { requireAdmin } from '@/lib/auth/session';
  import { getHub } from '@/lib/ws/hub';

  const createSchema = z.object({
    agentId: z.string().min(1),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
    count: z.number().int().min(1).max(999),
  });

  export async function GET(req: Request) {
    const session = await requireAdmin(req);
    if (session instanceof Response) return session;
    const db = await getDb();
    const orgId = await getOrgId(db);
    const rows = await db
      .select({
        id: appraisals.id,
        orgId: appraisals.orgId,
        agentId: appraisals.agentId,
        date: appraisals.date,
        count: appraisals.count,
        createdAt: appraisals.createdAt,
        agentName: agents.name,
      })
      .from(appraisals)
      .innerJoin(agents, eq(appraisals.agentId, agents.id))
      .where(eq(appraisals.orgId, orgId))
      .orderBy(desc(appraisals.date), desc(appraisals.createdAt))
      .limit(50);
    return Response.json({ data: rows });
  }

  export async function POST(req: Request) {
    const session = await requireAdmin(req);
    if (session instanceof Response) return session;
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues.map((i) => i.message).join('; ') },
        { status: 400 },
      );
    }
    const db = await getDb();
    const orgId = await getOrgId(db);
    // 与 sales/listings 同口径:仅 active 的 agent 可录(staff 不做估价)。
    const [agent] = await db
      .select()
      .from(agents)
      .where(
        and(
          eq(agents.id, parsed.data.agentId),
          eq(agents.orgId, orgId),
          eq(agents.active, true),
          eq(agents.role, 'agent'),
        ),
      );
    if (!agent) return Response.json({ error: 'Unknown agent' }, { status: 400 });

    const [appraisal] = await db
      .insert(appraisals)
      .values({
        id: crypto.randomUUID(),
        orgId,
        agentId: parsed.data.agentId,
        date: parsed.data.date,
        count: parsed.data.count,
      })
      .returning();
    getHub().broadcast({ type: 'data.updated', domain: 'appraisals' });
    return Response.json({ data: appraisal });
  }
  ```

  ⑤ 创建 `src/app/api/appraisals/[id]/route.ts`:

  ```ts
  import { and, eq } from 'drizzle-orm';
  import { getDb } from '@/lib/db';
  import { getOrgId } from '@/lib/db/org';
  import { appraisals } from '@/lib/db/schema';
  import { requireAdmin } from '@/lib/auth/session';
  import { getHub } from '@/lib/ws/hub';

  export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
    const session = await requireAdmin(req);
    if (session instanceof Response) return session;
    const { id } = await ctx.params;
    const db = await getDb();
    const orgId = await getOrgId(db);
    const [existing] = await db
      .select()
      .from(appraisals)
      .where(and(eq(appraisals.id, id), eq(appraisals.orgId, orgId)));
    if (!existing) return Response.json({ error: 'Not found' }, { status: 404 });
    await db.delete(appraisals).where(and(eq(appraisals.id, id), eq(appraisals.orgId, orgId)));
    getHub().broadcast({ type: 'data.updated', domain: 'appraisals' });
    return Response.json({ data: { id } });
  }
  ```

  ⑥ 修改 `src/app/api/tv/state/route.ts`。找到:

  ```ts
  import { agents, announcements, goals, listings, sales, screens } from '@/lib/db/schema';
  ```

  替换为:

  ```ts
  import { agents, announcements, appraisals, goals, listings, sales, screens } from '@/lib/db/schema';
  ```

  再找到:

  ```ts
  import { computeLeaderboard, computeMetricTotal, type LeaderboardInputs } from '@/lib/domain/leaderboard';
  ```

  替换为:

  ```ts
  import { computeLeaderboard, computeMetricTotal, type LeaderboardInputs } from '@/lib/domain/leaderboard';
  import { computeScorecard } from '@/lib/domain/scorecard';
  ```

  再找到:

  ```ts
    const listingRows = await db.select().from(listings).where(eq(listings.orgId, orgId));
  ```

  替换为:

  ```ts
    const listingRows = await db.select().from(listings).where(eq(listings.orgId, orgId));
    const appraisalRows = await db.select().from(appraisals).where(eq(appraisals.orgId, orgId));
  ```

  再找到:

  ```ts
    const range = periodRange(settings.leaderboardPeriod, now);
    const leaderboards: TvStateResponse['leaderboards'] = {
      sales_count: computeLeaderboard(inputs, 'sales_count', range),
      gci: computeLeaderboard(inputs, 'gci', range),
      listings: computeLeaderboard(inputs, 'listings', range),
    };
  ```

  替换为:

  ```ts
    const range = periodRange(settings.leaderboardPeriod, now);
    const leaderboards: TvStateResponse['leaderboards'] = {
      sales_count: computeLeaderboard(inputs, 'sales_count', range),
      gci: computeLeaderboard(inputs, 'gci', range),
      listings: computeLeaderboard(inputs, 'listings', range),
    };

    // Scorecard 与三榜同周期(设计 §5);周期过滤在 computeScorecard 内完成——
    // 与 sales/listings 一样整表取 org 行、域层过滤。inputs.sales/listings 结构性兼容
    // ScorecardInputs(多出的 createdAt/photoUrl 字段无妨)。
    const scorecard = computeScorecard({
      agents: agentRows.map((a) => ({ id: a.id, name: a.name, role: a.role, active: a.active })),
      sales: inputs.sales,
      listings: inputs.listings,
      appraisals: appraisalRows.map((a) => ({ agentId: a.agentId, date: a.date, count: a.count })),
    }, range);
  ```

  再找到:

  ```ts
      announcements: tvAnnouncements,
      periodLabel: periodLabel(settings.leaderboardPeriod, now),
    };
  ```

  替换为:

  ```ts
      announcements: tvAnnouncements,
      scorecard,
      periodLabel: periodLabel(settings.leaderboardPeriod, now),
    };
  ```

  ⑦ 修改 `src/lib/types.ts`。找到:

  ```ts
  import type { SettingsData } from './settings';
  ```

  替换为:

  ```ts
  import type { ScorecardData } from './domain/scorecard';
  import type { SettingsData } from './settings';
  ```

  再找到:

  ```ts
    announcements: TvAnnouncement[];                    // enabled only, sortOrder asc
    periodLabel: string;                                // periodLabel(settings.leaderboardPeriod, now)
  };
  ```

  替换为:

  ```ts
    announcements: TvAnnouncement[];                    // enabled only, sortOrder asc
    scorecard: ScorecardData;                           // 设计 §5:全指标 0 不成行,gciCents desc
    periodLabel: string;                                // periodLabel(settings.leaderboardPeriod, now)
  };
  ```

  ⑧ 修改 `src/components/tv/TvApp.tsx`(过渡态,`Record<SlideKey, number>` 编译连带;真接入在 Task 4)。找到:

  ```ts
        goal_progress: 1,
        listings: gridPageSize(windowHeight - SLIDE_RESERVED_PX, LISTINGS_ROW_PX, LISTINGS_COLUMNS),
        announcements: pageSize(windowHeight - SLIDE_RESERVED_PX, ANNOUNCEMENT_ITEM_PX),
      };
    }, [windowHeight]);
  ```

  替换为:

  ```ts
        goal_progress: 1,
        listings: gridPageSize(windowHeight - SLIDE_RESERVED_PX, LISTINGS_ROW_PX, LISTINGS_COLUMNS),
        announcements: pageSize(windowHeight - SLIDE_RESERVED_PX, ANNOUNCEMENT_ITEM_PX),
        // 过渡态(Task 3):Task 4 换成按 Scorecard 行高/预留计算的真实容量。
        scorecard: 1,
      };
    }, [windowHeight]);
  ```

  再找到:

  ```ts
        goal_progress: 1, // 恒 1 页;GoalSlide 自身 slice(0,4) 不动(非目标)
        listings: tvState.listings.length,
        announcements: Math.min(tvState.announcements.length, ANNOUNCEMENTS_CAP),
      };
  ```

  替换为:

  ```ts
        goal_progress: 1, // 恒 1 页;GoalSlide 自身 slice(0,4) 不动(非目标)
        listings: tvState.listings.length,
        announcements: Math.min(tvState.announcements.length, ANNOUNCEMENTS_CAP),
        // 过渡态(Task 3):恒 0 → 1 页;Task 4 接入 tvState.scorecard.rows.length。
        scorecard: 0,
      };
  ```

  (`slideContent` 的 switch 有 `default: return null`,scorecard 键此刻渲染空白页——仅存在于 Task 3→4 之间的中间提交,不对外发布。)

  ⑨ 修改 `src/app/admin/(dashboard)/settings/page.tsx`(`Record<SlideKey, string>` 编译连带)。找到:

  ```ts
  const SLIDE_LABELS: Record<SlideKey, string> = {
    leaderboard_sales_count: 'Sales Champions (sales count)',
  ```

  替换为:

  ```ts
  const SLIDE_LABELS: Record<SlideKey, string> = {
    scorecard: 'Sales Scorecard (full page)',
    leaderboard_sales_count: 'Sales Champions (sales count)',
  ```

- [ ] **Step 5: 转绿 + 全仓校验**

  ```bash
  npx vitest run tests/api/appraisals.test.ts tests/settings.test.ts tests/db.test.ts tests/api/tv-state.test.ts
  npx tsc --noEmit
  npx vitest run
  ```

  预期:appraisals **10 个**、settings **10 个**、db **7 个**、tv-state **7 个**全部通过;tsc 零输出;全量 **21 files / 270 tests** 全绿(258 + 10 + 1 + 1)。

- [ ] **Step 6: Commit**

  ```bash
  git add src/lib/ws/protocol.ts src/lib/settings.ts src/lib/db/seed.ts src/app/api/appraisals/route.ts "src/app/api/appraisals/[id]/route.ts" src/app/api/tv/state/route.ts src/lib/types.ts src/components/tv/TvApp.tsx "src/app/admin/(dashboard)/settings/page.tsx" tests/api/appraisals.test.ts tests/settings.test.ts tests/db.test.ts tests/api/tv-state.test.ts
  git commit -m "feat: appraisals api, scorecard settings key and tv state assembly"
  ```

---
### Task 4: TV 端 ScorecardSlide + TvApp 接入分页

**Files:**
- Create: `src/components/tv/slides/ScorecardSlide.tsx`
- Modify: `src/components/tv/TvApp.tsx`(常量、perPage/counts 真值、slideContent case)

本任务无组件级单测(项目一贯做法:TV 组件行为由 E2E 兜底,Task 6 补 E2E);任务内以 tsc + 全量回归 + `npm run build` 验证。定高取值:表格行 56px、表头 48px、汇总块 120px;`SCORECARD_RESERVED_PX = 388` = py-12 上 48 + 标题 text-6xl 60 + mt-8 32 + 汇总块 120 + mt-8 32 + 表头 48 + py-12 下 48。1080p 下每页 `floor((1080−388)/56) = 12` 行(导入的 7 行单页);520px E2E 小屏下每页 2 行(demo 4 人 → 2 页)。**这些像素值与组件 CSS 一一对应,改任何一边必须同步另一边。**

- [ ] **Step 1: 创建 ScorecardSlide 组件**

  创建 `src/components/tv/slides/ScorecardSlide.tsx`:

  ```tsx
  'use client';

  import { motion } from 'framer-motion';
  import type { ScorecardData, ScorecardRow } from '@/lib/domain/scorecard';
  import { formatCount, formatMoney } from '@/lib/format';

  /** Conversion 色块三档(设计 §4):≥50 绿、20–49.9 黄、<20 红;无估价(null)灰 '—'。 */
  function conversionClass(conversionPct: number | null): string {
    if (conversionPct === null) return 'bg-panel-2 text-muted';
    if (conversionPct >= 50) return 'bg-green-500/20 text-green-300';
    if (conversionPct >= 20) return 'bg-yellow-500/20 text-yellow-300';
    return 'bg-red-500/20 text-red-300';
  }

  function TotalBlock({ label, value, money }: { label: string; value: string; money?: boolean }) {
    return (
      <div className="flex flex-col justify-center rounded-xl bg-panel px-8">
        <p className="text-2xl text-muted">{label}</p>
        <p className={`mt-1 font-display text-5xl ${money ? 'text-money neon-text' : 'text-ink'}`}>
          {value}
        </p>
      </div>
    );
  }

  export default function ScorecardSlide({
    data,
    rows,
    periodLabel,
  }: {
    data: ScorecardData;   // 满表:totals 与绝对名次的基准(分页切片后 rank 仍正确)
    rows: ScorecardRow[];  // 当前页切片(TvApp pageSlice)
    periodLabel: string;
  }) {
    // rank = 行在满表 data.rows 里的绝对名次(服务端已按 gciCents desc 排好序)。
    const rankOf = new Map(data.rows.map((r, i) => [r.agentId, i + 1]));
    return (
      <div className="flex h-full w-full flex-col px-16 py-12">
        <div className="flex items-baseline justify-between">
          <h1 className="font-display text-6xl text-neon neon-text">SALES SCORECARD</h1>
          <span className="font-heading text-3xl text-muted">{periodLabel}</span>
        </div>
        {data.rows.length === 0 ? (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-4xl text-muted">No data yet</p>
          </div>
        ) : (
          <>
            {/* 汇总块 h-[120px] 与下方表头 h-[48px]、行 h-[56px]、两个 mt-8:
                TvApp 的 SCORECARD_RESERVED_PX(388)/SCORECARD_ITEM_PX(56)依赖这些定值,
                改任何一边必须同步另一边。 */}
            <div className="mt-8 grid h-[120px] grid-cols-4 gap-6">
              <TotalBlock label="TOTAL APPRAISALS" value={String(data.totals.appraisals)} />
              <TotalBlock label="TOTAL LISTINGS" value={String(data.totals.listings)} />
              <TotalBlock label="TOTAL SALES" value={formatCount(data.totals.salesSplit)} />
              <TotalBlock label="TOTAL GROSS COMM" value={formatMoney(data.totals.gciCents)} money />
            </div>
            <div className="mt-8 flex-1 overflow-hidden">
              {/* Tailwind preflight 已设 border-collapse:collapse,行高恰为 56px;
                  行间不加边框,避免像素累计漂移破坏分页容量计算。 */}
              <table className="w-full table-fixed text-left">
                <thead>
                  <tr className="h-[48px] text-2xl text-muted">
                    <th className="w-24 font-medium">Rank</th>
                    <th className="font-medium">Name</th>
                    <th className="w-44 font-medium">Appraisals</th>
                    <th className="w-36 font-medium">Listings</th>
                    <th className="w-28 font-medium">Sales</th>
                    <th className="w-28 font-medium">Split</th>
                    <th className="w-52 font-medium">Gross Comm</th>
                    <th className="w-44 font-medium">Conversion</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <motion.tr
                      key={row.agentId}
                      initial={{ opacity: 0, x: -40 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.06, duration: 0.35 }}
                      className="h-[56px] text-3xl text-ink"
                    >
                      <td className="font-display text-muted">{rankOf.get(row.agentId)}</td>
                      <td className="truncate font-heading">{row.name}</td>
                      <td>{row.appraisals}</td>
                      <td>{row.listings}</td>
                      <td>{formatCount(row.sales)}</td>
                      <td>{formatCount(row.split)}</td>
                      <td className="font-display text-money">{formatMoney(row.gciCents)}</td>
                      <td>
                        <span
                          className={`inline-block rounded px-3 py-1 text-2xl ${conversionClass(row.conversionPct)}`}
                        >
                          {row.conversionPct === null ? '—' : `${row.conversionPct}%`}
                        </span>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    );
  }
  ```

- [ ] **Step 2: TvApp 接入(import + 常量 + 真实容量/条数 + case)**

  修改 `src/components/tv/TvApp.tsx`。

  ① 找到:

  ```ts
  import LeaderboardSlide from '@/components/tv/slides/LeaderboardSlide';
  ```

  替换为:

  ```ts
  import LeaderboardSlide from '@/components/tv/slides/LeaderboardSlide';
  import ScorecardSlide from '@/components/tv/slides/ScorecardSlide';
  ```

  ② 找到:

  ```ts
  // AnnouncementSlide:卡 h-[224px] + 卡间 gap-6(24px)。
  const ANNOUNCEMENT_ITEM_PX = 248;
  ```

  替换为:

  ```ts
  // AnnouncementSlide:卡 h-[224px] + 卡间 gap-6(24px)。
  const ANNOUNCEMENT_ITEM_PX = 248;
  // ScorecardSlide:表格行 h-[56px](border-collapse,行间无边框无间距)。
  const SCORECARD_ITEM_PX = 56;
  // Scorecard 头部预留:py-12 上 48 + 标题 text-6xl 60 + mt-8 32 + 汇总块 h-[120px] 120
  // + mt-8 32 + 表头 h-[48px] 48 + py-12 下 48 = 388(与 ScorecardSlide 定高 CSS 同步)。
  const SCORECARD_RESERVED_PX = 388;
  ```

  ③ 找到(Task 3 的过渡态):

  ```ts
        // 过渡态(Task 3):Task 4 换成按 Scorecard 行高/预留计算的真实容量。
        scorecard: 1,
  ```

  替换为:

  ```ts
        scorecard: pageSize(windowHeight - SCORECARD_RESERVED_PX, SCORECARD_ITEM_PX),
  ```

  ④ 找到:

  ```ts
        // 过渡态(Task 3):恒 0 → 1 页;Task 4 接入 tvState.scorecard.rows.length。
        scorecard: 0,
  ```

  替换为:

  ```ts
        scorecard: tvState.scorecard.rows.length,
  ```

  ⑤ 找到:

  ```ts
      const page = currentSlide.page;
      switch (currentSlide.key) {
        case 'leaderboard_sales_count': {
  ```

  替换为:

  ```ts
      const page = currentSlide.page;
      switch (currentSlide.key) {
        case 'scorecard': {
          const scorecardRows = tvState.scorecard.rows;
          return (
            <ScorecardSlide
              data={tvState.scorecard}
              rows={pageSlice(
                scorecardRows, effectivePage(page, scorecardRows.length, perPage.scorecard),
                perPage.scorecard,
              )}
              periodLabel={tvState.periodLabel}
            />
          );
        }
        case 'leaderboard_sales_count': {
  ```

- [ ] **Step 3: 全仓校验(本任务无单测,红绿由 Task 6 E2E 兜底)**

  ```bash
  npx tsc --noEmit
  npx vitest run
  npm run build
  ```

  预期:tsc 零输出;全量 **21 files / 270 tests** 全绿(纯 UI 接入,无单测增减);Next.js 生产构建成功。

  (可选人工冒烟:`npm run db:seed -- --demo` + `npm run dev`,浏览器开 `/tv` 配对后首屏应是 SALES SCORECARD:4 个汇总块 + 4 行明细,Conversion 列全灰 '—'——demo 数据没有估价。)

- [ ] **Step 4: Commit**

  ```bash
  git add src/components/tv/slides/ScorecardSlide.tsx src/components/tv/TvApp.tsx
  git commit -m "feat: tv scorecard slide with paginated ranking table"
  ```

---
### Task 5: Admin —— 成交 Split 输入 + Appraisals 页 + 导航

**Files:**
- Modify: `src/app/admin/(dashboard)/page.tsx`(录入表单 + 编辑 Modal 加 Split)
- Create: `src/app/admin/(dashboard)/appraisals/page.tsx`
- Modify: `src/app/admin/(dashboard)/layout.tsx`(导航 +Appraisals,Team 之后)

本任务为 admin 客户端页面(项目一贯做法:admin 页面无组件级单测,行为由 API 测试 + E2E 兜底);以 tsc + 全量回归 + build 验证。

- [ ] **Step 1: Dashboard 成交表单/编辑 Modal 加 Split**

  修改 `src/app/admin/(dashboard)/page.tsx`。

  ① 找到:

  ```ts
    salePriceCents: number;
    gciCents: number;
    saleDate: string;
  };
  ```

  替换为:

  ```ts
    salePriceCents: number;
    gciCents: number;
    split: number;
    saleDate: string;
  };
  ```

  ② 找到:

  ```ts
  function toCents(dollars: string): number | null {
    const cents = Math.round(parseFloat(dollars) * 100);
    return Number.isFinite(cents) ? cents : null;
  }

  function emptyForm() {
    return { agentId: '', address: '', salePrice: '', gci: '', saleDate: todayLocal() };
  }
  ```

  替换为:

  ```ts
  function toCents(dollars: string): number | null {
    const cents = Math.round(parseFloat(dollars) * 100);
    return Number.isFinite(cents) ? cents : null;
  }

  /** 成交拆分份额(设计 §6):0 < split ≤ 1;与 toCents 同款 Number.isFinite 兜底。 */
  function parseSplit(value: string): number | null {
    const split = parseFloat(value);
    return Number.isFinite(split) && split > 0 && split <= 1 ? split : null;
  }

  function emptyForm() {
    return { agentId: '', address: '', salePrice: '', gci: '', split: '1', saleDate: todayLocal() };
  }
  ```

  ③ 找到(createSale 内,form.*):

  ```ts
      const salePriceCents = toCents(form.salePrice);
      const gciCents = toCents(form.gci);
      if (salePriceCents === null || gciCents === null) {
        setError('Invalid amount');
        return;
      }
  ```

  替换为:

  ```ts
      const salePriceCents = toCents(form.salePrice);
      const gciCents = toCents(form.gci);
      if (salePriceCents === null || gciCents === null) {
        setError('Invalid amount');
        return;
      }
      const split = parseSplit(form.split);
      if (split === null) {
        setError('Invalid split');
        return;
      }
  ```

  ④ 找到:

  ```ts
          body: JSON.stringify({
            agentId: form.agentId,
            address: form.address,
            salePriceCents,
            gciCents,
            saleDate: form.saleDate,
          }),
  ```

  替换为:

  ```ts
          body: JSON.stringify({
            agentId: form.agentId,
            address: form.address,
            salePriceCents,
            gciCents,
            split,
            saleDate: form.saleDate,
          }),
  ```

  ⑤ 找到(openEdit 内):

  ```ts
        gci: (sale.gciCents / 100).toFixed(2),
        saleDate: sale.saleDate,
  ```

  替换为:

  ```ts
        gci: (sale.gciCents / 100).toFixed(2),
        split: String(sale.split),
        saleDate: sale.saleDate,
  ```

  ⑥ 找到(saveEdit 内,editForm.*):

  ```ts
      const salePriceCents = toCents(editForm.salePrice);
      const gciCents = toCents(editForm.gci);
      if (salePriceCents === null || gciCents === null) {
        setError('Invalid amount');
        return;
      }
  ```

  替换为:

  ```ts
      const salePriceCents = toCents(editForm.salePrice);
      const gciCents = toCents(editForm.gci);
      if (salePriceCents === null || gciCents === null) {
        setError('Invalid amount');
        return;
      }
      const split = parseSplit(editForm.split);
      if (split === null) {
        setError('Invalid split');
        return;
      }
  ```

  ⑦ 找到(diff-only patch):

  ```ts
      if (gciCents !== editing.gciCents) patch.gciCents = gciCents;
      if (editForm.saleDate !== editing.saleDate) patch.saleDate = editForm.saleDate;
  ```

  替换为(数值比较,避免 '1' vs '1.0' 字符串误报):

  ```ts
      if (gciCents !== editing.gciCents) patch.gciCents = gciCents;
      if (split !== editing.split) patch.split = split;
      if (editForm.saleDate !== editing.saleDate) patch.saleDate = editForm.saleDate;
  ```

  ⑧ 找到:

  ```tsx
        <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
  ```

  替换为:

  ```tsx
        <div className="grid grid-cols-1 gap-4 md:grid-cols-6">
  ```

  ⑨ 找到(录入表单,form.gci 的 Field 与 Sale date 之间):

  ```tsx
          <Field label="GCI ($)">
            <TextInput
              type="number"
              step="0.01"
              min="0"
              value={form.gci}
              onChange={(e) => setForm({ ...form, gci: e.target.value })}
              required
            />
          </Field>
          <Field label="Sale date">
  ```

  替换为:

  ```tsx
          <Field label="GCI ($)">
            <TextInput
              type="number"
              step="0.01"
              min="0"
              value={form.gci}
              onChange={(e) => setForm({ ...form, gci: e.target.value })}
              required
            />
          </Field>
          <Field label="Split">
            <TextInput
              type="number"
              step="0.05"
              min="0.05"
              max="1"
              value={form.split}
              onChange={(e) => setForm({ ...form, split: e.target.value })}
              required
            />
          </Field>
          <Field label="Sale date">
  ```

  ⑩ 找到(编辑 Modal,editForm.gci 的 Field 与 Sale date 之间):

  ```tsx
            <Field label="GCI ($)">
              <TextInput
                type="number"
                step="0.01"
                min="0"
                value={editForm.gci}
                onChange={(e) => setEditForm({ ...editForm, gci: e.target.value })}
                required
              />
            </Field>
            <Field label="Sale date">
  ```

  替换为:

  ```tsx
            <Field label="GCI ($)">
              <TextInput
                type="number"
                step="0.01"
                min="0"
                value={editForm.gci}
                onChange={(e) => setEditForm({ ...editForm, gci: e.target.value })}
                required
              />
            </Field>
            <Field label="Split">
              <TextInput
                type="number"
                step="0.05"
                min="0.05"
                max="1"
                value={editForm.split}
                onChange={(e) => setEditForm({ ...editForm, split: e.target.value })}
                required
              />
            </Field>
            <Field label="Sale date">
  ```

- [ ] **Step 2: 新建 Appraisals 页**

  创建 `src/app/admin/(dashboard)/appraisals/page.tsx`:

  ```tsx
  'use client';

  import { useCallback, useEffect, useState, type FormEvent } from 'react';
  import { Button, Field, Select, Table, TextInput } from '@/components/admin/ui';

  type AgentRow = { id: string; name: string; active: boolean; role: 'agent' | 'staff' };

  type AppraisalRow = {
    id: string;
    agentId: string;
    agentName: string;
    date: string;
    count: number;
  };

  function todayLocal(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function emptyForm() {
    return { agentId: '', date: todayLocal(), count: '1' };
  }

  export default function AppraisalsPage() {
    const [agents, setAgents] = useState<AgentRow[]>([]);
    const [appraisals, setAppraisals] = useState<AppraisalRow[]>([]);
    const [form, setForm] = useState(emptyForm);
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // 录入下拉只列 active 的 agent(staff 不做估价,与 sales/listings 同口径)。
    const activeAgents = agents.filter((a) => a.active && a.role === 'agent');

    const load = useCallback(async () => {
      const [agentsRes, appraisalsRes] = await Promise.all([
        fetch('/api/agents'),
        fetch('/api/appraisals'),
      ]);
      if (agentsRes.ok) {
        const body = (await agentsRes.json()) as { data: AgentRow[] };
        setAgents(body.data);
      }
      if (appraisalsRes.ok) {
        const body = (await appraisalsRes.json()) as { data: AppraisalRow[] };
        setAppraisals(body.data);
      }
    }, []);

    useEffect(() => {
      void load();
    }, [load]);

    async function createAppraisal(e: FormEvent) {
      e.preventDefault();
      setError(null);
      const count = Number.parseInt(form.count, 10);
      if (!Number.isInteger(count) || count < 1 || count > 999) {
        setError('Invalid count');
        return;
      }
      setCreating(true);
      try {
        const res = await fetch('/api/appraisals', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ agentId: form.agentId, date: form.date, count }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({ error: 'Failed to save appraisals' }))) as {
            error?: string;
          };
          setError(body.error ?? 'Failed to save appraisals');
          return;
        }
        setForm(emptyForm());
        await load();
      } finally {
        setCreating(false);
      }
    }

    async function deleteAppraisal(id: string) {
      if (!window.confirm('Delete this appraisal entry? The scorecard will recalculate.')) return;
      setError(null);
      const res = await fetch(`/api/appraisals/${id}`, { method: 'DELETE' });
      if (res.ok) {
        await load();
      } else {
        setError('Failed to delete appraisal');
      }
    }

    return (
      <div>
        <h1 className="mb-6 font-heading text-2xl font-bold text-ink">Appraisals</h1>

        <form onSubmit={createAppraisal} className="mb-8 rounded-lg border border-panel-2 bg-panel p-6">
          <h2 className="mb-4 font-heading text-lg font-bold text-ink">Record appraisals</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Field label="Member">
              <Select
                value={form.agentId}
                onChange={(e) => setForm({ ...form, agentId: e.target.value })}
                required
              >
                <option value="">Select member…</option>
                {activeAgents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Date">
              <TextInput
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                required
              />
            </Field>
            <Field label="Count">
              <TextInput
                type="number"
                step="1"
                min="1"
                max="999"
                value={form.count}
                onChange={(e) => setForm({ ...form, count: e.target.value })}
                required
              />
            </Field>
          </div>
          {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
          <div className="mt-4">
            <Button type="submit" disabled={creating}>
              Save appraisals
            </Button>
          </div>
        </form>

        <h2 className="mb-3 font-heading text-lg font-bold text-ink">Recent appraisals</h2>
        <Table headers={['Date', 'Member', 'Count', 'Actions']}>
          {appraisals.map((a) => (
            <tr key={a.id} className="text-ink">
              <td className="px-3 py-2">{a.date}</td>
              <td className="px-3 py-2">{a.agentName}</td>
              <td className="px-3 py-2">{a.count}</td>
              <td className="px-3 py-2">
                <Button variant="danger" onClick={() => deleteAppraisal(a.id)}>
                  Delete
                </Button>
              </td>
            </tr>
          ))}
          {appraisals.length === 0 && (
            <tr>
              <td colSpan={4} className="px-3 py-6 text-center text-muted">
                No appraisals yet — record the first batch above.
              </td>
            </tr>
          )}
        </Table>
      </div>
    );
  }
  ```

- [ ] **Step 3: 导航加 Appraisals**

  修改 `src/app/admin/(dashboard)/layout.tsx`。找到:

  ```ts
    { href: '/admin/agents', label: 'Team' },
    { href: '/admin/listings', label: 'Listings' },
  ```

  替换为:

  ```ts
    { href: '/admin/agents', label: 'Team' },
    { href: '/admin/appraisals', label: 'Appraisals' },
    { href: '/admin/listings', label: 'Listings' },
  ```

- [ ] **Step 4: 全仓校验**

  ```bash
  npx tsc --noEmit
  npx vitest run
  npm run build
  ```

  预期:tsc 零输出;全量 **21 files / 270 tests** 全绿(无单测增减);build 成功(新路由 `/admin/appraisals` 出现在构建输出的路由清单里)。

- [ ] **Step 5: Commit**

  ```bash
  git add "src/app/admin/(dashboard)/page.tsx" "src/app/admin/(dashboard)/appraisals/page.tsx" "src/app/admin/(dashboard)/layout.tsx"
  git commit -m "feat: admin split input and appraisals page"
  ```

---
### Task 6: 八月真实数据导入 SQL + runner + E2E + 全量回归

**Files:**
- Create: `docs/import/2026-08-south-scorecard.sql`(幂等导入,37 条语句)
- Create: `src/lib/db/run-sql.ts`(拆句 + 逐条执行的库函数;照 seed.ts/run-seed.ts 的库/CLI 分层)
- Create: `scripts/run-sql.ts`(CLI 包装:loadEnvConfig + argv 文件路径)
- Test: `tests/import.test.ts`(新,3 用例:拆句/数值/幂等)
- Modify: `e2e/tv-flow.spec.ts`(SLIDE_TITLE_RE +SALES SCORECARD;分页用例改 scorecard 口径;+1 新用例)

数值核对(规格 §7,逐行为准):sales 12 行 Σsplit = 3+1.8+1+1+1+0.2 = **8**;GCI 逐行分摊后总和 = 3,799,800+2,897,000+1,314,800+1,314,800+1,100,000+408,000 = **10,834,400 分($108,344)**,每位成员的行数都整除佣金、无余数(规则"余数进首行"本批数据未触发);listings 11 行(3+1+4+1+2)全部 `status='sold'`、$0;appraisals 每人单行 count=N 共 7 行、总数 **36**(设计 §7 已注明与样表表头 29 的口径差异);日期散布 2026-08-01~17。

- [ ] **Step 1: 写导入测试(先测试)**

  创建 `tests/import.test.ts`:

  ```ts
  import { describe, it, expect, beforeEach } from 'vitest';
  import path from 'node:path';
  import { freshDb } from './helpers/db';
  import type { Db } from '@/lib/db';
  import { runSqlFile, splitSqlStatements } from '@/lib/db/run-sql';
  import { orgs, agents, sales, listings, appraisals } from '@/lib/db/schema';

  const SQL_FILE = path.join(process.cwd(), 'docs', 'import', '2026-08-south-scorecard.sql');

  async function rowCounts(db: Db) {
    return {
      agents: (await db.select().from(agents)).length,
      sales: (await db.select().from(sales)).length,
      listings: (await db.select().from(listings)).length,
      appraisals: (await db.select().from(appraisals)).length,
    };
  }

  describe('splitSqlStatements', () => {
    it('splits on end-of-line semicolons and drops comment-only chunks', () => {
      const text = [
        '-- header comment',
        'INSERT INTO a (x) VALUES (1);',
        '',
        'INSERT INTO b (y)',
        'SELECT 2 WHERE NOT EXISTS (SELECT 1 FROM b WHERE y = 2);',
        '-- trailing comment',
      ].join('\n');
      const statements = splitSqlStatements(text);
      expect(statements).toHaveLength(2);
      expect(statements[0]).toContain('INSERT INTO a');
      expect(statements[1]).toContain('WHERE NOT EXISTS');
    });
  });

  describe('august scorecard import SQL', () => {
    let db: Db;

    beforeEach(async () => {
      db = await freshDb();
      // 导入 SQL 用 (SELECT id FROM orgs LIMIT 1) 取组织——预置一个 org(生产库 seed 已建)。
      await db.insert(orgs).values({ id: crypto.randomUUID(), name: 'Import Test Agency' });
    });

    it('imports the august dataset with per-row values from the spec', async () => {
      await runSqlFile(db, SQL_FILE);
      expect(await rowCounts(db)).toEqual({ agents: 7, sales: 12, listings: 11, appraisals: 7 });

      const saleRows = await db.select().from(sales);
      // Σsplit = 8(样表 TOTAL SALES);GCI 总额 = 10,834,400 分($108,344,逐行之和)
      expect(saleRows.reduce((s, r) => s + r.split, 0)).toBeCloseTo(8, 12);
      expect(saleRows.reduce((s, r) => s + r.gciCents, 0)).toBe(10_834_400);
      // 导入成交不携带售价(不触发庆祝口径);房源全部 sold + $0(不上 TV 在售页)
      expect(saleRows.every((r) => r.salePriceCents === 0)).toBe(true);
      const listingRows = await db.select().from(listings);
      expect(listingRows.every((r) => r.status === 'sold' && r.listPriceCents === 0)).toBe(true);

      // John Loveluck 两行 split 还原 1.0 + 0.8;Kathy Roberts 单行 0.2
      const agentRows = await db.select().from(agents);
      const john = agentRows.find((a) => a.name === 'John Loveluck')!;
      const johnSplits = saleRows
        .filter((r) => r.agentId === john.id)
        .map((r) => r.split)
        .sort((a, b) => a - b);
      expect(johnSplits).toEqual([0.8, 1]);
      const kathy = agentRows.find((a) => a.name === 'Kathy Roberts')!;
      expect(saleRows.filter((r) => r.agentId === kathy.id).map((r) => r.split)).toEqual([0.2]);

      // 估价总数 36(逐行口径,设计 §7 的 36 vs 29 说明)
      const appraisalRows = await db.select().from(appraisals);
      expect(appraisalRows.reduce((s, r) => s + r.count, 0)).toBe(36);
    });

    it('is idempotent — a second run changes nothing', async () => {
      await runSqlFile(db, SQL_FILE);
      const first = await rowCounts(db);
      await runSqlFile(db, SQL_FILE);
      expect(await rowCounts(db)).toEqual(first);
      expect(first).toEqual({ agents: 7, sales: 12, listings: 11, appraisals: 7 });
    });
  });
  ```

- [ ] **Step 2: 运行确认失败**

  ```bash
  npx vitest run tests/import.test.ts
  ```

  预期失败:整文件模块解析失败(`@/lib/db/run-sql` 不存在)。

- [ ] **Step 3: 实现 runner(库 + CLI)**

  创建 `src/lib/db/run-sql.ts`:

  ```ts
  import fs from 'node:fs';
  import { sql } from 'drizzle-orm';
  import type { Db } from './index';

  /**
   * 按"行尾分号"拆分 SQL 语句(约定:导入 SQL 的字符串字面量内不含分号),
   * 丢弃纯注释块。云端(Railway Data 标签)直接整贴执行,不走本函数。
   */
  export function splitSqlStatements(text: string): string[] {
    return text
      .split(/;\s*(?:\r?\n|$)/)
      .map((chunk) => chunk.trim())
      .filter((chunk) =>
        chunk
          .split(/\r?\n/)
          .some((line) => line.trim().length > 0 && !line.trim().startsWith('--')));
  }

  /** 逐语句执行一个 SQL 文件(本地 PGlite / DATABASE_URL 均可);返回执行的语句数。 */
  export async function runSqlFile(db: Db, filePath: string): Promise<number> {
    const text = fs.readFileSync(filePath, 'utf8');
    const statements = splitSqlStatements(text);
    for (const statement of statements) {
      await db.execute(sql.raw(statement));
    }
    return statements.length;
  }
  ```

  创建 `scripts/run-sql.ts`:

  ```ts
  import { loadEnvConfig } from '@next/env';
  loadEnvConfig(process.cwd());

  import path from 'node:path';
  import { getDb } from '../src/lib/db';
  import { runSqlFile } from '../src/lib/db/run-sql';

  // 用法:npx tsx scripts/run-sql.ts docs/import/2026-08-south-scorecard.sql
  // 不设 DATABASE_URL 时写本地 PGlite(.data/pglite);设了则写远程库。
  const fileArg = process.argv[2];
  if (!fileArg) {
    console.error('Usage: npx tsx scripts/run-sql.ts <path-to-sql-file>');
    process.exit(1);
  }

  (async () => {
    const db = await getDb();
    const count = await runSqlFile(db, path.resolve(fileArg));
    console.log(`Executed ${count} statements from ${fileArg}`);
    process.exit(0);
  })().catch((err) => {
    console.error(err);
    process.exit(1);
  });
  ```

- [ ] **Step 4: 写导入 SQL**

  创建 `docs/import/2026-08-south-scorecard.sql`(完整内容如下,37 条语句;id 用固定字面量,幂等且免扩展——本仓 PGlite 为 PG 17.5,`gen_random_uuid()` 虽可用但固定 id 判重更直接):

  ```sql
  -- 2026-08 SOUTH. SALES SCORECARD 真实数据导入(设计 §7)。
  -- 幂等:成员按 name 判重;sales/listings 按 'Imported Aug …' 地址标记判重;appraisals 按固定 id 判重。
  -- 前置:orgs 里已有组织(生产库已跑 seed;本地先 npm run db:seed)。
  -- 云端:Railway Postgres → Data 标签整贴执行;本地:npx tsx scripts/run-sql.ts docs/import/2026-08-south-scorecard.sql
  -- 还原规则:成交 sale_price_cents=0(仅佣金参与统计;SQL 直写不经 API,不触发庆祝);
  -- 佣金按人头均摊到各行(本批数据均整除,无余数);房源 status='sold'、$0(计入指标、不上 TV 在售页);
  -- split 按表格精确还原;日期散布 2026-08-01~17。

  -- ===== 成员(7)=====
  INSERT INTO agents (id, org_id, name, role, active)
  SELECT 'ac100000-0000-4000-8000-000000000001', (SELECT id FROM orgs LIMIT 1), 'Chris Joyce', 'agent', true
  WHERE NOT EXISTS (SELECT 1 FROM agents WHERE name = 'Chris Joyce');

  INSERT INTO agents (id, org_id, name, role, active)
  SELECT 'ac100000-0000-4000-8000-000000000002', (SELECT id FROM orgs LIMIT 1), 'John Loveluck', 'agent', true
  WHERE NOT EXISTS (SELECT 1 FROM agents WHERE name = 'John Loveluck');

  INSERT INTO agents (id, org_id, name, role, active)
  SELECT 'ac100000-0000-4000-8000-000000000003', (SELECT id FROM orgs LIMIT 1), 'Team Cowley', 'agent', true
  WHERE NOT EXISTS (SELECT 1 FROM agents WHERE name = 'Team Cowley');

  INSERT INTO agents (id, org_id, name, role, active)
  SELECT 'ac100000-0000-4000-8000-000000000004', (SELECT id FROM orgs LIMIT 1), 'Michael Hatzinicolaou', 'agent', true
  WHERE NOT EXISTS (SELECT 1 FROM agents WHERE name = 'Michael Hatzinicolaou');

  INSERT INTO agents (id, org_id, name, role, active)
  SELECT 'ac100000-0000-4000-8000-000000000005', (SELECT id FROM orgs LIMIT 1), 'Hill & Co', 'agent', true
  WHERE NOT EXISTS (SELECT 1 FROM agents WHERE name = 'Hill & Co');

  INSERT INTO agents (id, org_id, name, role, active)
  SELECT 'ac100000-0000-4000-8000-000000000006', (SELECT id FROM orgs LIMIT 1), 'Kathy Roberts', 'agent', true
  WHERE NOT EXISTS (SELECT 1 FROM agents WHERE name = 'Kathy Roberts');

  INSERT INTO agents (id, org_id, name, role, active)
  SELECT 'ac100000-0000-4000-8000-000000000007', (SELECT id FROM orgs LIMIT 1), 'Team Brudenell', 'agent', true
  WHERE NOT EXISTS (SELECT 1 FROM agents WHERE name = 'Team Brudenell');

  -- ===== 成交(12 行;Σsplit=8;GCI 合计 10,834,400 分)=====
  -- Chris Joyce:S3(1+1+1),$37,998 → 3 × 1,266,600
  INSERT INTO sales (id, org_id, agent_id, address, sale_price_cents, gci_cents, sale_date, split)
  SELECT 'ad200000-0000-4000-8000-000000000001', (SELECT id FROM orgs LIMIT 1),
         (SELECT id FROM agents WHERE name = 'Chris Joyce' LIMIT 1),
         'Imported Aug sale #1 (Chris Joyce)', 0, 1266600, '2026-08-04', 1
  WHERE NOT EXISTS (SELECT 1 FROM sales WHERE address = 'Imported Aug sale #1 (Chris Joyce)');

  INSERT INTO sales (id, org_id, agent_id, address, sale_price_cents, gci_cents, sale_date, split)
  SELECT 'ad200000-0000-4000-8000-000000000002', (SELECT id FROM orgs LIMIT 1),
         (SELECT id FROM agents WHERE name = 'Chris Joyce' LIMIT 1),
         'Imported Aug sale #2 (Chris Joyce)', 0, 1266600, '2026-08-08', 1
  WHERE NOT EXISTS (SELECT 1 FROM sales WHERE address = 'Imported Aug sale #2 (Chris Joyce)');

  INSERT INTO sales (id, org_id, agent_id, address, sale_price_cents, gci_cents, sale_date, split)
  SELECT 'ad200000-0000-4000-8000-000000000003', (SELECT id FROM orgs LIMIT 1),
         (SELECT id FROM agents WHERE name = 'Chris Joyce' LIMIT 1),
         'Imported Aug sale #3 (Chris Joyce)', 0, 1266600, '2026-08-13', 1
  WHERE NOT EXISTS (SELECT 1 FROM sales WHERE address = 'Imported Aug sale #3 (Chris Joyce)');

  -- John Loveluck:S2(1.0+0.8),$28,970 → 2 × 1,448,500
  INSERT INTO sales (id, org_id, agent_id, address, sale_price_cents, gci_cents, sale_date, split)
  SELECT 'ad200000-0000-4000-8000-000000000004', (SELECT id FROM orgs LIMIT 1),
         (SELECT id FROM agents WHERE name = 'John Loveluck' LIMIT 1),
         'Imported Aug sale #1 (John Loveluck)', 0, 1448500, '2026-08-05', 1
  WHERE NOT EXISTS (SELECT 1 FROM sales WHERE address = 'Imported Aug sale #1 (John Loveluck)');

  INSERT INTO sales (id, org_id, agent_id, address, sale_price_cents, gci_cents, sale_date, split)
  SELECT 'ad200000-0000-4000-8000-000000000005', (SELECT id FROM orgs LIMIT 1),
         (SELECT id FROM agents WHERE name = 'John Loveluck' LIMIT 1),
         'Imported Aug sale #2 (John Loveluck)', 0, 1448500, '2026-08-11', 0.8
  WHERE NOT EXISTS (SELECT 1 FROM sales WHERE address = 'Imported Aug sale #2 (John Loveluck)');

  -- Team Cowley:S2(0.5+0.5),$13,148 → 2 × 657,400
  INSERT INTO sales (id, org_id, agent_id, address, sale_price_cents, gci_cents, sale_date, split)
  SELECT 'ad200000-0000-4000-8000-000000000006', (SELECT id FROM orgs LIMIT 1),
         (SELECT id FROM agents WHERE name = 'Team Cowley' LIMIT 1),
         'Imported Aug sale #1 (Team Cowley)', 0, 657400, '2026-08-06', 0.5
  WHERE NOT EXISTS (SELECT 1 FROM sales WHERE address = 'Imported Aug sale #1 (Team Cowley)');

  INSERT INTO sales (id, org_id, agent_id, address, sale_price_cents, gci_cents, sale_date, split)
  SELECT 'ad200000-0000-4000-8000-000000000007', (SELECT id FROM orgs LIMIT 1),
         (SELECT id FROM agents WHERE name = 'Team Cowley' LIMIT 1),
         'Imported Aug sale #2 (Team Cowley)', 0, 657400, '2026-08-12', 0.5
  WHERE NOT EXISTS (SELECT 1 FROM sales WHERE address = 'Imported Aug sale #2 (Team Cowley)');

  -- Michael Hatzinicolaou:S2(0.5+0.5),$13,148 → 2 × 657,400
  INSERT INTO sales (id, org_id, agent_id, address, sale_price_cents, gci_cents, sale_date, split)
  SELECT 'ad200000-0000-4000-8000-000000000008', (SELECT id FROM orgs LIMIT 1),
         (SELECT id FROM agents WHERE name = 'Michael Hatzinicolaou' LIMIT 1),
         'Imported Aug sale #1 (Michael Hatzinicolaou)', 0, 657400, '2026-08-07', 0.5
  WHERE NOT EXISTS (SELECT 1 FROM sales WHERE address = 'Imported Aug sale #1 (Michael Hatzinicolaou)');

  INSERT INTO sales (id, org_id, agent_id, address, sale_price_cents, gci_cents, sale_date, split)
  SELECT 'ad200000-0000-4000-8000-000000000009', (SELECT id FROM orgs LIMIT 1),
         (SELECT id FROM agents WHERE name = 'Michael Hatzinicolaou' LIMIT 1),
         'Imported Aug sale #2 (Michael Hatzinicolaou)', 0, 657400, '2026-08-13', 0.5
  WHERE NOT EXISTS (SELECT 1 FROM sales WHERE address = 'Imported Aug sale #2 (Michael Hatzinicolaou)');

  -- Hill & Co:S2(0.5+0.5),$11,000 → 2 × 550,000
  INSERT INTO sales (id, org_id, agent_id, address, sale_price_cents, gci_cents, sale_date, split)
  SELECT 'ad200000-0000-4000-8000-000000000010', (SELECT id FROM orgs LIMIT 1),
         (SELECT id FROM agents WHERE name = 'Hill & Co' LIMIT 1),
         'Imported Aug sale #1 (Hill & Co)', 0, 550000, '2026-08-03', 0.5
  WHERE NOT EXISTS (SELECT 1 FROM sales WHERE address = 'Imported Aug sale #1 (Hill & Co)');

  INSERT INTO sales (id, org_id, agent_id, address, sale_price_cents, gci_cents, sale_date, split)
  SELECT 'ad200000-0000-4000-8000-000000000011', (SELECT id FROM orgs LIMIT 1),
         (SELECT id FROM agents WHERE name = 'Hill & Co' LIMIT 1),
         'Imported Aug sale #2 (Hill & Co)', 0, 550000, '2026-08-15', 0.5
  WHERE NOT EXISTS (SELECT 1 FROM sales WHERE address = 'Imported Aug sale #2 (Hill & Co)');

  -- Kathy Roberts:S1(0.2),$4,080 → 408,000
  INSERT INTO sales (id, org_id, agent_id, address, sale_price_cents, gci_cents, sale_date, split)
  SELECT 'ad200000-0000-4000-8000-000000000012', (SELECT id FROM orgs LIMIT 1),
         (SELECT id FROM agents WHERE name = 'Kathy Roberts' LIMIT 1),
         'Imported Aug sale #1 (Kathy Roberts)', 0, 408000, '2026-08-10', 0.2
  WHERE NOT EXISTS (SELECT 1 FROM sales WHERE address = 'Imported Aug sale #1 (Kathy Roberts)');

  -- ===== 房源(11 行,status='sold',$0)=====
  -- Chris Joyce:L3
  INSERT INTO listings (id, org_id, agent_id, address, list_price_cents, listed_date, status)
  SELECT 'ae300000-0000-4000-8000-000000000001', (SELECT id FROM orgs LIMIT 1),
         (SELECT id FROM agents WHERE name = 'Chris Joyce' LIMIT 1),
         'Imported Aug listing #1 (Chris Joyce)', 0, '2026-08-03', 'sold'
  WHERE NOT EXISTS (SELECT 1 FROM listings WHERE address = 'Imported Aug listing #1 (Chris Joyce)');

  INSERT INTO listings (id, org_id, agent_id, address, list_price_cents, listed_date, status)
  SELECT 'ae300000-0000-4000-8000-000000000002', (SELECT id FROM orgs LIMIT 1),
         (SELECT id FROM agents WHERE name = 'Chris Joyce' LIMIT 1),
         'Imported Aug listing #2 (Chris Joyce)', 0, '2026-08-07', 'sold'
  WHERE NOT EXISTS (SELECT 1 FROM listings WHERE address = 'Imported Aug listing #2 (Chris Joyce)');

  INSERT INTO listings (id, org_id, agent_id, address, list_price_cents, listed_date, status)
  SELECT 'ae300000-0000-4000-8000-000000000003', (SELECT id FROM orgs LIMIT 1),
         (SELECT id FROM agents WHERE name = 'Chris Joyce' LIMIT 1),
         'Imported Aug listing #3 (Chris Joyce)', 0, '2026-08-12', 'sold'
  WHERE NOT EXISTS (SELECT 1 FROM listings WHERE address = 'Imported Aug listing #3 (Chris Joyce)');

  -- John Loveluck:L1
  INSERT INTO listings (id, org_id, agent_id, address, list_price_cents, listed_date, status)
  SELECT 'ae300000-0000-4000-8000-000000000004', (SELECT id FROM orgs LIMIT 1),
         (SELECT id FROM agents WHERE name = 'John Loveluck' LIMIT 1),
         'Imported Aug listing #1 (John Loveluck)', 0, '2026-08-06', 'sold'
  WHERE NOT EXISTS (SELECT 1 FROM listings WHERE address = 'Imported Aug listing #1 (John Loveluck)');

  -- Team Cowley:L4
  INSERT INTO listings (id, org_id, agent_id, address, list_price_cents, listed_date, status)
  SELECT 'ae300000-0000-4000-8000-000000000005', (SELECT id FROM orgs LIMIT 1),
         (SELECT id FROM agents WHERE name = 'Team Cowley' LIMIT 1),
         'Imported Aug listing #1 (Team Cowley)', 0, '2026-08-02', 'sold'
  WHERE NOT EXISTS (SELECT 1 FROM listings WHERE address = 'Imported Aug listing #1 (Team Cowley)');

  INSERT INTO listings (id, org_id, agent_id, address, list_price_cents, listed_date, status)
  SELECT 'ae300000-0000-4000-8000-000000000006', (SELECT id FROM orgs LIMIT 1),
         (SELECT id FROM agents WHERE name = 'Team Cowley' LIMIT 1),
         'Imported Aug listing #2 (Team Cowley)', 0, '2026-08-05', 'sold'
  WHERE NOT EXISTS (SELECT 1 FROM listings WHERE address = 'Imported Aug listing #2 (Team Cowley)');

  INSERT INTO listings (id, org_id, agent_id, address, list_price_cents, listed_date, status)
  SELECT 'ae300000-0000-4000-8000-000000000007', (SELECT id FROM orgs LIMIT 1),
         (SELECT id FROM agents WHERE name = 'Team Cowley' LIMIT 1),
         'Imported Aug listing #3 (Team Cowley)', 0, '2026-08-10', 'sold'
  WHERE NOT EXISTS (SELECT 1 FROM listings WHERE address = 'Imported Aug listing #3 (Team Cowley)');

  INSERT INTO listings (id, org_id, agent_id, address, list_price_cents, listed_date, status)
  SELECT 'ae300000-0000-4000-8000-000000000008', (SELECT id FROM orgs LIMIT 1),
         (SELECT id FROM agents WHERE name = 'Team Cowley' LIMIT 1),
         'Imported Aug listing #4 (Team Cowley)', 0, '2026-08-14', 'sold'
  WHERE NOT EXISTS (SELECT 1 FROM listings WHERE address = 'Imported Aug listing #4 (Team Cowley)');

  -- Michael Hatzinicolaou:L1
  INSERT INTO listings (id, org_id, agent_id, address, list_price_cents, listed_date, status)
  SELECT 'ae300000-0000-4000-8000-000000000009', (SELECT id FROM orgs LIMIT 1),
         (SELECT id FROM agents WHERE name = 'Michael Hatzinicolaou' LIMIT 1),
         'Imported Aug listing #1 (Michael Hatzinicolaou)', 0, '2026-08-09', 'sold'
  WHERE NOT EXISTS (SELECT 1 FROM listings WHERE address = 'Imported Aug listing #1 (Michael Hatzinicolaou)');

  -- Hill & Co:L2
  INSERT INTO listings (id, org_id, agent_id, address, list_price_cents, listed_date, status)
  SELECT 'ae300000-0000-4000-8000-000000000010', (SELECT id FROM orgs LIMIT 1),
         (SELECT id FROM agents WHERE name = 'Hill & Co' LIMIT 1),
         'Imported Aug listing #1 (Hill & Co)', 0, '2026-08-04', 'sold'
  WHERE NOT EXISTS (SELECT 1 FROM listings WHERE address = 'Imported Aug listing #1 (Hill & Co)');

  INSERT INTO listings (id, org_id, agent_id, address, list_price_cents, listed_date, status)
  SELECT 'ae300000-0000-4000-8000-000000000011', (SELECT id FROM orgs LIMIT 1),
         (SELECT id FROM agents WHERE name = 'Hill & Co' LIMIT 1),
         'Imported Aug listing #2 (Hill & Co)', 0, '2026-08-11', 'sold'
  WHERE NOT EXISTS (SELECT 1 FROM listings WHERE address = 'Imported Aug listing #2 (Hill & Co)');

  -- ===== 估价(7 行,单行 count=N,总数 36)=====
  INSERT INTO appraisals (id, org_id, agent_id, "date", "count")
  SELECT 'af400000-0000-4000-8000-000000000001', (SELECT id FROM orgs LIMIT 1),
         (SELECT id FROM agents WHERE name = 'Chris Joyce' LIMIT 1), '2026-08-05', 4
  WHERE NOT EXISTS (SELECT 1 FROM appraisals WHERE id = 'af400000-0000-4000-8000-000000000001');

  INSERT INTO appraisals (id, org_id, agent_id, "date", "count")
  SELECT 'af400000-0000-4000-8000-000000000002', (SELECT id FROM orgs LIMIT 1),
         (SELECT id FROM agents WHERE name = 'John Loveluck' LIMIT 1), '2026-08-04', 4
  WHERE NOT EXISTS (SELECT 1 FROM appraisals WHERE id = 'af400000-0000-4000-8000-000000000002');

  INSERT INTO appraisals (id, org_id, agent_id, "date", "count")
  SELECT 'af400000-0000-4000-8000-000000000003', (SELECT id FROM orgs LIMIT 1),
         (SELECT id FROM agents WHERE name = 'Team Cowley' LIMIT 1), '2026-08-07', 8
  WHERE NOT EXISTS (SELECT 1 FROM appraisals WHERE id = 'af400000-0000-4000-8000-000000000003');

  INSERT INTO appraisals (id, org_id, agent_id, "date", "count")
  SELECT 'af400000-0000-4000-8000-000000000004', (SELECT id FROM orgs LIMIT 1),
         (SELECT id FROM agents WHERE name = 'Michael Hatzinicolaou' LIMIT 1), '2026-08-08', 2
  WHERE NOT EXISTS (SELECT 1 FROM appraisals WHERE id = 'af400000-0000-4000-8000-000000000004');

  INSERT INTO appraisals (id, org_id, agent_id, "date", "count")
  SELECT 'af400000-0000-4000-8000-000000000005', (SELECT id FROM orgs LIMIT 1),
         (SELECT id FROM agents WHERE name = 'Hill & Co' LIMIT 1), '2026-08-06', 13
  WHERE NOT EXISTS (SELECT 1 FROM appraisals WHERE id = 'af400000-0000-4000-8000-000000000005');

  INSERT INTO appraisals (id, org_id, agent_id, "date", "count")
  SELECT 'af400000-0000-4000-8000-000000000006', (SELECT id FROM orgs LIMIT 1),
         (SELECT id FROM agents WHERE name = 'Kathy Roberts' LIMIT 1), '2026-08-09', 1
  WHERE NOT EXISTS (SELECT 1 FROM appraisals WHERE id = 'af400000-0000-4000-8000-000000000006');

  INSERT INTO appraisals (id, org_id, agent_id, "date", "count")
  SELECT 'af400000-0000-4000-8000-000000000007', (SELECT id FROM orgs LIMIT 1),
         (SELECT id FROM agents WHERE name = 'Team Brudenell' LIMIT 1), '2026-08-11', 4
  WHERE NOT EXISTS (SELECT 1 FROM appraisals WHERE id = 'af400000-0000-4000-8000-000000000007');
  ```

- [ ] **Step 5: 转绿**

  ```bash
  npx vitest run tests/import.test.ts
  ```

  预期:**3 个用例**全部通过。若行数断言失败,先核对 SQL 中 NOT EXISTS 的判重字段与地址/名字拼写是否与断言一致。

- [ ] **Step 6: E2E —— SLIDE_TITLE_RE + 分页用例改 scorecard 口径 + 新用例**

  修改 `e2e/tv-flow.spec.ts`。

  ① 找到:

  ```ts
  const SLIDE_TITLE_RE =
    /SALES CHAMPIONS|TOP EARNERS|LISTING LEGENDS|TEAM GOALS|HOT LISTINGS|TEAM NEWS/;
  ```

  替换为(scorecard 默认首位,pairTv 首屏即它;'SALES SCORECARD' 与 'SALES CHAMPIONS' 都以 SALES 开头,把新词放交替最前):

  ```ts
  const SLIDE_TITLE_RE =
    /SALES SCORECARD|SALES CHAMPIONS|TOP EARNERS|LISTING LEGENDS|TEAM GOALS|HOT LISTINGS|TEAM NEWS/;
  ```

  ② 找到(分页用例,首个 slide 从 15s 榜单变成 20s scorecard):

  ```ts
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
  ```

  替换为:

  ```ts
    test.setTimeout(120_000); // login+pair+20s rotation to page 2 leaves little room in the default 60s
    // 520px tall: the scorecard (now first, 20s/page) fits 2 table rows per page
    // ((520-388)/56 → 2) and the demo seed puts 4 agents on it → 2 pages (2 + 2);
    // the leaderboards behind it still split 3 + 1 ((520-196)/84 → 3 rows per page).
    const { adminPage, tvPage } = await pairTv(browser, 'E2E TV 4', {
      tvViewport: { width: 1280, height: 520 },
    });

    // First slide (scorecard, 20s per page) shows the page badge immediately.
    // exact: true — substring matching would also hit e.g. '22/2 Ocean Avenue' listings.
    await expect(tvPage.getByText('1/2', { exact: true })).toBeVisible({ timeout: 20000 });
    // After one full page duration (20s) the same scorecard rotates to its second page.
    await expect(tvPage.getByText('2/2', { exact: true })).toBeVisible({ timeout: 30000 });
  ```

  ③ 在文件末尾(`paginates a slide across rotations on short screens` 用例收尾的 `});` 之后)追加:

  ```ts

  test('scorecard slide shows totals and rows', async ({ browser }) => {
    test.setTimeout(120_000);
    const { adminPage, tvPage } = await pairTv(browser, 'E2E TV 5');

    // Scorecard 默认排在轮播首位(20s/页),配对完成后立即可见(标题文案钉死,设计 §8)。
    await expect(tvPage.getByText('SALES SCORECARD')).toBeVisible({ timeout: 20000 });
    await expect(tvPage.getByText('TOTAL GROSS COMM')).toBeVisible({ timeout: 5000 });

    await adminPage.close();
    await tvPage.close();
  });
  ```

- [ ] **Step 7: 四件套全量回归**

  ```bash
  npx tsc --noEmit
  npx vitest run
  npm run build
  npm run test:e2e
  ```

  预期:tsc 零输出;vitest **22 files / 273 tests** 全绿;build 成功;E2E **6 passed**(新用例 + 既有 5 个;offline 用例自身要 3–4 分钟,总时长约 10–12 分钟,勿提前中断)。若分页用例的 `1/2` 超时不出现:核对 Task 4 的 `SCORECARD_RESERVED_PX`/`SCORECARD_ITEM_PX` 与 ScorecardSlide 定高 CSS 是否同步(520 高时 scorecard perPage 应为 2)。

  (可选人工验收:`npm run db:seed`(不带 --demo)+ `npx tsx scripts/run-sql.ts docs/import/2026-08-south-scorecard.sql` + `npm run dev`,`/tv` 配对后应看到与样表口径一致的记分卡——TOTAL SALES 8、TOTAL GROSS COMM $108K、Chris/John/Michael/Cowley/Hill/Kathy/Brudenell 七行,conversion 色块 75 绿 / 25 黄 / 50 绿×2 / 15.4 红 / 0 红×2;再跑一遍 run-sql 验证幂等无副作用。)

- [ ] **Step 8: Commit**

  ```bash
  git add docs/import/2026-08-south-scorecard.sql src/lib/db/run-sql.ts scripts/run-sql.ts tests/import.test.ts e2e/tv-flow.spec.ts
  git commit -m "feat: idempotent august scorecard import and e2e coverage"
  ```

---
## 完成定义

- 6 个 commit 依次落在 `feature/scorecard`;
- `npx tsc --noEmit` 零输出、`npx vitest run` **22 files / 273 tests** 全绿、`npm run build` 成功、`npm run test:e2e` **6 passed**;
- 手动验收对照设计 §10:TV 出现记分卡整页(4 汇总块 + 色块明细表,Σsplit=8、GCI 总额 $108,343±舍入、逐行 conversion 颜色与样表一致);后台可录 split(0.05 步进)与 appraisals(成员/日期/数量,可删);三榜 sales 口径变 Σsplit 无回归(整数显示不变、共享成交显示 1 位小数);`docs/import/2026-08-south-scorecard.sql` 在 Railway Data 标签一次粘贴导入成功、重复运行零副作用。
