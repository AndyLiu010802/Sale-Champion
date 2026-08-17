# Birthday Broadcast 与 Team 类型 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在既有 TV Sales Leaderboard 上新增:成交庆祝音乐只播一遍;Team 名单分销售员/员工两类(员工不上榜不可录业绩);生日(MM-DD)当天 11:00 自动全屏生日播报 + 任意时间手动播报。

**Architecture:** 庆祝 payload 扩展为 kind 判别的 union(sale/birthday),复用既有 WS 庆祝通道与电视端打断/队列机制;11:00 触发用服务器进程内每分钟定时器,防重复标记落库(先写后播);agents 表加 role/birthday 两列,role 约束在 API 与榜单组装两层强制。

**Tech Stack:** 与主项目一致(Next.js 15 / Drizzle / ws / Vitest / Playwright),零新依赖。

**执行约定:** 基线 main;按编号顺序执行(1→2→3→4→5→6→7,3/4/5 有内部顺序依赖);规格 `docs/superpowers/specs/2026-08-18-birthday-broadcast-design.md`;既有代码约定(diff-only PATCH、挂起 disabled、错误透传、org 过滤)一律沿用。

---
### Task 1: 数据层与生日域函数

**Files:**
- Modify: `src/lib/db/schema.ts`(agents +`role`/`birthday`,orgs +`lastBirthdayBroadcastDate`)
- Create: `drizzle/0001_*.sql` 与 `drizzle/meta/0001_snapshot.json`、`drizzle/meta/_journal.json` 更新(由 `npm run db:generate` 生成,文件名随机)
- Create: `src/lib/domain/birthday.ts`
- Test: `tests/domain/birthday.test.ts`(新)
- Test: `tests/db.test.ts`(+role/birthday/标记往返用例)

本任务只做数据层:三列新增 + 生日域纯函数。`schema.ts` 现已从 `drizzle-orm/pg-core` 导入 `date`(sales/listings 在用),无需改 import。`tests/helpers/db.ts` 的 `seedBasics` 不动——Alice 走 `role` 默认值 `'agent'`、`birthday` 为 null,正好当"既有行零迁移成本"的断言对象。

- [ ] **Step 1: 写生日域函数测试(先测试)**

  创建 `tests/domain/birthday.test.ts`:

  ```ts
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
  ```

- [ ] **Step 2: 运行确认失败**

  ```bash
  npx vitest run tests/domain/birthday.test.ts
  ```

  预期失败:vitest 报模块解析错误(`Failed to resolve import "@/lib/domain/birthday"` / Cannot find module),整个文件无法加载——`src/lib/domain/birthday.ts` 尚不存在。

- [ ] **Step 3: 实现 src/lib/domain/birthday.ts(契约权威签名)**

  创建 `src/lib/domain/birthday.ts`:

  ```ts
  // 生日域纯函数:格式校验与服务器本地时区的日期格式化(设计 §2/§5)。

  /** 'MM-DD':月 01-12、日 01-31。不做逐月天数联动(02-31 这类宽松度由设计接受)。 */
  export const BIRTHDAY_RE = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

  export function isValidBirthday(s: string): boolean {
    return BIRTHDAY_RE.test(s);
  }

  function pad2(n: number): string {
    return String(n).padStart(2, '0');
  }

  /** 服务器本地时区的 'YYYY-MM-DD'(orgs.lastBirthdayBroadcastDate 防重复标记用)。 */
  export function localYmd(now: Date): string {
    return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  }

  /** 服务器本地时区的 'MM-DD'(与 agents.birthday 精确匹配用)。 */
  export function localMmdd(now: Date): string {
    return `${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  }

  /** 每分钟 tick 的触发判定:本地时间恰为 11:00(秒忽略)。 */
  export function isElevenAm(now: Date): boolean {
    return now.getHours() === 11 && now.getMinutes() === 0;
  }
  ```

- [ ] **Step 4: 转绿**

  ```bash
  npx vitest run tests/domain/birthday.test.ts
  ```

  预期:3 个 describe 全部通过(21 个用例)。

- [ ] **Step 5: 给 tests/db.test.ts 加三列往返用例(先测试)**

  修改 `tests/db.test.ts`,在 `'runs migrations and round-trips org, agent and sale'` 用例结束与 `'getOrgId resolves the first org'` 用例之间插入新用例。找到:

  ```ts
      expect(rows[0].createdAt).toBeInstanceOf(Date);
    });

    it('getOrgId resolves the first org', async () => {
  ```

  替换为:

  ```ts
      expect(rows[0].createdAt).toBeInstanceOf(Date);
    });

    it('round-trips agent role/birthday and org lastBirthdayBroadcastDate', async () => {
      const { orgId, agentId } = await seedBasics(db);

      // 既有行走默认值:role='agent'、birthday 为 null(零迁移成本)
      const [alice] = await db.select().from(agents).where(eq(agents.id, agentId));
      expect(alice.role).toBe('agent');
      expect(alice.birthday).toBeNull();

      const staffId = crypto.randomUUID();
      await db.insert(agents).values({
        id: staffId, orgId, name: 'Front Desk Fay', role: 'staff', birthday: '08-18',
      });
      const [fay] = await db.select().from(agents).where(eq(agents.id, staffId));
      expect(fay.role).toBe('staff');
      expect(fay.birthday).toBe('08-18');

      const [orgBefore] = await db.select().from(orgs).where(eq(orgs.id, orgId));
      expect(orgBefore.lastBirthdayBroadcastDate).toBeNull();

      await db.update(orgs).set({ lastBirthdayBroadcastDate: '2026-08-18' }).where(eq(orgs.id, orgId));
      const [orgAfter] = await db.select().from(orgs).where(eq(orgs.id, orgId));
      expect(orgAfter.lastBirthdayBroadcastDate).toBe('2026-08-18');
    });

    it('getOrgId resolves the first org', async () => {
  ```

  该文件顶部已导入 `eq`、`orgs`、`agents`、`seedBasics`,无需加 import。

- [ ] **Step 6: 运行确认失败**

  ```bash
  npx vitest run tests/db.test.ts
  ```

  预期失败:新用例在 `expect(alice.role).toBe('agent')` 处失败(schema 尚无 `role` 列,select 结果里该属性为 `undefined`);其余既有用例保持通过。

- [ ] **Step 7: 修改 schema.ts 加三列(契约权威定义)**

  修改 `src/lib/db/schema.ts`。找到:

  ```ts
  export const orgs = pgTable('orgs', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  });
  ```

  替换为:

  ```ts
  export const orgs = pgTable('orgs', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    // 当天自动生日播报的防重复标记('YYYY-MM-DD');进程重启不重播(设计 §2/§5)
    lastBirthdayBroadcastDate: date('last_birthday_broadcast_date', { mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  });
  ```

  再找到:

  ```ts
  export const agents = pgTable('agents', {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull().references(() => orgs.id),
    name: text('name').notNull(),
    photoUrl: text('photo_url'),
    anthemUrl: text('anthem_url'),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  });
  ```

  替换为:

  ```ts
  export const agents = pgTable('agents', {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull().references(() => orgs.id),
    name: text('name').notNull(),
    photoUrl: text('photo_url'),
    anthemUrl: text('anthem_url'),
    role: text('role').notNull().default('agent'), // 'agent' | 'staff'
    birthday: text('birthday'),                    // 'MM-DD' 或 null
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  });
  ```

  `date` 已在文件顶部的 import 列表中,不用动 import。

- [ ] **Step 8: 生成 0001 迁移并核对 SQL**

  ```bash
  npm run db:generate
  ls drizzle
  cat drizzle/0001_*.sql
  ```

  预期:drizzle-kit 生成 `drizzle/0001_<随机名>.sql`(纯加列不会触发交互式提问),内容**恰为以下三条 ADD COLUMN 语句**(语句顺序可能不同,不必与下面完全一致;agents 表内 role 应在 birthday 之前[随 schema 声明序]。只有出现 DROP、额外语句或缺语句时才回查上一步的 schema 改动):

  ```sql
  ALTER TABLE "agents" ADD COLUMN "role" text DEFAULT 'agent' NOT NULL;--> statement-breakpoint
  ALTER TABLE "agents" ADD COLUMN "birthday" text;--> statement-breakpoint
  ALTER TABLE "orgs" ADD COLUMN "last_birthday_broadcast_date" date;
  ```

  同时 `drizzle/meta/_journal.json` 应新增 `idx: 1` 条目、生成 `drizzle/meta/0001_snapshot.json`。若 SQL 与上面不符(例如出现 DROP/额外语句),不要继续——回头核对 Step 7 的 schema 改动。

- [ ] **Step 9: 转绿 + 全仓校验**

  ```bash
  npx vitest run tests/db.test.ts tests/domain/birthday.test.ts
  npx tsc --noEmit
  npx vitest run
  ```

  预期:`tests/db.test.ts` 6 个用例、`tests/domain/birthday.test.ts` 全部通过(freshDb 会把新迁移一并跑掉);tsc 无输出;全量测试套件与基线一致全绿(既有列纯追加,不影响任何现有查询)。

- [ ] **Step 10: Commit**

  ```bash
  git add src/lib/db/schema.ts drizzle src/lib/domain/birthday.ts tests/domain/birthday.test.ts tests/db.test.ts
  git commit -m "feat: add team roles, birthdays and broadcast marker to data layer"
  ```

---
### Task 2: 庆祝链路改造(union + 音频一遍 + TV 分支渲染)

**Files:**
- Modify: `src/lib/ws/protocol.ts`(CelebrationPayload → discriminated union)
- Modify: `src/lib/domain/celebration.ts`(+`kind:'sale'`、新增 `buildBirthdayPayload`)
- Modify: `src/lib/audio/anthems.ts`(+`BIRTHDAY_ANTHEM_ID`,不进 `BUILTIN_ANTHEMS`)
- Modify: `src/components/tv/audio.ts`(合成曲删循环、+`builtin:birthday` 旋律)
- Modify: `src/lib/carousel.ts`(+`QueuedCelebration`,state/事件改用之)
- Modify: `src/components/tv/TvApp.tsx`(onCelebration 注入 clientId、overlay key 改 clientId)
- Modify: `src/components/tv/CelebrationOverlay.tsx`(按 kind 分支渲染 + 生日旋律)
- Test: `tests/api/sales.test.ts`(+kind 断言、+buildBirthdayPayload 用例)
- Test: `tests/carousel.test.ts`(fixture 补 kind/clientId,断言改 clientId)

跨切类型改造:union 一动,`carousel.ts`/`TvApp.tsx`/`CelebrationOverlay.tsx`/两个测试文件全部连锁,**中间态不编译是正常的**——本任务先把两份测试改到位(红),然后一口气完成 7 个源文件改动,最后统一转绿 + 全仓 `tsc` 干净 + `npm run build`。三点现状说明:

1. `protocol.ts` 中**不存在** `celebrationPayloadSchema` 这个 zod schema(只有 `clientEventSchema`),契约"如仍存在则删"无动作。
2. sales 两个 route(`src/app/api/sales/route.ts` 与 `src/app/api/sales/[id]/replay/route.ts`)的 payload 全部由 `buildCelebrationPayload` 产生,函数加上 `kind:'sale'` 后 **route 文件零改动**、自动带 kind。
3. `audio.ts` 是纯浏览器 API 模块(AudioContext),契约 Task 2 文件清单不含 audio 单测——删循环以本任务的代码改动 + tsc/build 保证,行为由 Task 7 E2E 兜底。**规格 §9 的"audio 不循环"单测项在此被有意裁定放弃**(其保留语"以纯逻辑可测部分为准"允许此取舍;E2E 无法断言音频,人工验收时留意一遍即止),此偏离以本条为准可追溯。

- [ ] **Step 1: 更新 tests/api/sales.test.ts(先测试)**

  对 `tests/api/sales.test.ts` 做 5 处修改。

  ① import 行,找到:

  ```ts
  import { buildCelebrationPayload } from '@/lib/domain/celebration';
  ```

  替换为:

  ```ts
  import { buildCelebrationPayload, buildBirthdayPayload } from '@/lib/domain/celebration';
  ```

  ② 用例 `'creates a sale then broadcasts celebration.play followed by data.updated sales'` 中,找到:

  ```ts
      const c = first.celebration;
      expect(c.saleId).toBe(data.id);
  ```

  替换为(`if` 收窄兼作 kind 期望,并让后续字段访问过 tsc):

  ```ts
      const c = first.celebration;
      if (c.kind !== 'sale') throw new Error('expected a sale celebration');
      expect(c.saleId).toBe(data.id);
  ```

  ③ 用例 `'re-broadcasts celebration.play for an existing sale'` 中,找到:

  ```ts
      expect(events).toHaveLength(1);
      const first = events[0];
      if (first.type !== 'celebration.play') throw new Error('expected celebration.play');
      expect(first.celebration.saleId).toBe(created.data.id);
      expect(first.celebration.agentName).toBe('Alice Ng');
      expect(first.celebration.durationSec).toBe(18);
  ```

  替换为:

  ```ts
      expect(events).toHaveLength(1);
      const first = events[0];
      if (first.type !== 'celebration.play') throw new Error('expected celebration.play');
      const c = first.celebration;
      if (c.kind !== 'sale') throw new Error('expected a sale celebration');
      expect(c.saleId).toBe(created.data.id);
      expect(c.agentName).toBe('Alice Ng');
      expect(c.durationSec).toBe(18);
  ```

  ④ 用例 `'replay uses the current agent after a PATCH reassignment'` 中,找到:

  ```ts
      expect(events).toHaveLength(1);
      const first = events[0];
      if (first.type !== 'celebration.play') throw new Error('expected celebration.play');
      expect(first.celebration.agentName).toBe('Bob Tran');
      expect(first.celebration.anthemUrl).toBe('builtin:hero');
  ```

  替换为:

  ```ts
      expect(events).toHaveLength(1);
      const first = events[0];
      if (first.type !== 'celebration.play') throw new Error('expected celebration.play');
      const c = first.celebration;
      if (c.kind !== 'sale') throw new Error('expected a sale celebration');
      expect(c.agentName).toBe('Bob Tran');
      expect(c.anthemUrl).toBe('builtin:hero');
  ```

  ⑤ 文件末尾整个 `describe('buildCelebrationPayload', ...)` 块,找到:

  ```ts
  describe('buildCelebrationPayload', () => {
    it('empty-string anthem falls back to the default', () => {
      const celebration = buildCelebrationPayload(
        { id: 'sale-1', address: '1 Main St', salePriceCents: 100 },
        { name: 'Alice Ng', photoUrl: null, anthemUrl: '' },
        DEFAULT_SETTINGS,
      );
      expect(celebration.anthemUrl).toBe(DEFAULT_SETTINGS.defaultAnthemUrl);
    });
  });
  ```

  替换为:

  ```ts
  describe('buildCelebrationPayload', () => {
    it('empty-string anthem falls back to the default and carries kind sale', () => {
      const celebration = buildCelebrationPayload(
        { id: 'sale-1', address: '1 Main St', salePriceCents: 100 },
        { name: 'Alice Ng', photoUrl: null, anthemUrl: '' },
        DEFAULT_SETTINGS,
      );
      expect(celebration.kind).toBe('sale');
      expect(celebration.anthemUrl).toBe(DEFAULT_SETTINGS.defaultAnthemUrl);
    });
  });

  describe('buildBirthdayPayload', () => {
    it('builds a birthday payload with the org celebration duration', () => {
      const payload = buildBirthdayPayload(
        { id: 'agent-1', name: 'Alice Ng', photoUrl: '/files/alice.jpg' },
        DEFAULT_SETTINGS,
      );
      expect(payload).toEqual({
        kind: 'birthday',
        agentId: 'agent-1',
        name: 'Alice Ng',
        photoUrl: '/files/alice.jpg',
        durationSec: 18,
      });
    });

    it('keeps photoUrl null when the member has no photo', () => {
      const payload = buildBirthdayPayload(
        { id: 'agent-2', name: 'Bob Tran', photoUrl: null },
        DEFAULT_SETTINGS,
      );
      expect(payload.kind).toBe('birthday');
      expect(payload.photoUrl).toBeNull();
    });
  });
  ```

- [ ] **Step 2: 运行确认失败**

  ```bash
  npx vitest run tests/api/sales.test.ts
  ```

  预期失败:改过的 3 个 sale 用例抛 `expected a sale celebration`(现有 payload 还没有 `kind` 字段);`buildBirthdayPayload` 的 2 个用例报 `buildBirthdayPayload is not a function`(该导出尚不存在)。其余用例通过。

- [ ] **Step 3: 全文件重写 tests/carousel.test.ts(fixture 补 kind/clientId,断言改 clientId)**

  改动是散点式的(fixture、6 处 `saleId` 断言、import、新增 birthday 用例),用完整内容覆盖 `tests/carousel.test.ts`:

  ```ts
  import { describe, it, expect } from 'vitest';
  import {
    initCarousel, carouselReducer,
    type CarouselSlide, type CarouselState, type QueuedCelebration,
  } from '@/lib/carousel';

  const slides: CarouselSlide[] = [
    { key: 'leaderboard_sales_count', durationSec: 10 },
    { key: 'leaderboard_gci', durationSec: 15 },
    { key: 'goal_progress', durationSec: 5 },
  ];

  const altSlides: CarouselSlide[] = [
    { key: 'listings', durationSec: 12 },
    { key: 'announcements', durationSec: 8 },
  ];

  function payload(id: string): QueuedCelebration {
    return {
      kind: 'sale',
      saleId: id,
      agentName: 'Alice Ng',
      agentPhotoUrl: null,
      address: '1 Test St, Sydney',
      salePriceCents: 100_000_000,
      anthemUrl: null,
      durationSec: 18,
      clientId: `client-${id}`,
    };
  }

  describe('initCarousel', () => {
    it('starts at slide 0 in rotate mode with the first slide full duration', () => {
      const s = initCarousel(slides);
      expect(s).toEqual({
        slides,
        index: 0,
        remainingMs: 10_000,
        mode: 'rotate',
        current: null,
        queue: [],
      });
    });

    it('handles an empty slide list safely', () => {
      const s = initCarousel([]);
      expect(s.index).toBe(0);
      expect(s.remainingMs).toBe(0);
      expect(s.mode).toBe('rotate');
    });
  });

  describe('tick', () => {
    it('decrements remainingMs within the current slide', () => {
      const s = carouselReducer(initCarousel(slides), { type: 'tick', dtMs: 250 });
      expect(s.index).toBe(0);
      expect(s.remainingMs).toBe(9_750);
    });

    it('advances to the next slide when time runs out', () => {
      const s = carouselReducer(initCarousel(slides), { type: 'tick', dtMs: 10_000 });
      expect(s.index).toBe(1);
      expect(s.remainingMs).toBe(15_000);
    });

    it('wraps from the last slide back to the first', () => {
      const last: CarouselState = { ...initCarousel(slides), index: 2, remainingMs: 100 };
      const s = carouselReducer(last, { type: 'tick', dtMs: 250 });
      expect(s.index).toBe(0);
      expect(s.remainingMs).toBe(10_000);
    });

    it('is a no-op when slides are empty', () => {
      const s = carouselReducer(initCarousel([]), { type: 'tick', dtMs: 250 });
      expect(s.index).toBe(0);
      expect(s.remainingMs).toBe(0);
    });
  });

  describe('celebration', () => {
    it('interrupts rotate and preserves the interrupted slide remaining time', () => {
      let s = carouselReducer(initCarousel(slides), { type: 'tick', dtMs: 4_000 });
      s = carouselReducer(s, { type: 'celebration', payload: payload('sale-1') });
      expect(s.mode).toBe('celebrate');
      expect(s.current?.clientId).toBe('client-sale-1');
      expect(s.index).toBe(0);
      expect(s.remainingMs).toBe(6_000);
      expect(s.queue).toEqual([]);
    });

    it('freezes the carousel during celebrate: tick does not advance anything', () => {
      const celebrating = carouselReducer(initCarousel(slides), {
        type: 'celebration',
        payload: payload('sale-1'),
      });
      const after = carouselReducer(celebrating, { type: 'tick', dtMs: 60_000 });
      expect(after).toEqual(celebrating);
    });

    it('queues subsequent celebrations in FIFO order', () => {
      let s = carouselReducer(initCarousel(slides), { type: 'celebration', payload: payload('sale-1') });
      s = carouselReducer(s, { type: 'celebration', payload: payload('sale-2') });
      s = carouselReducer(s, { type: 'celebration', payload: payload('sale-3') });
      expect(s.current?.clientId).toBe('client-sale-1');
      expect(s.queue.map((p) => p.clientId)).toEqual(['client-sale-2', 'client-sale-3']);
    });

    it('accepts a birthday celebration through the same interrupt path', () => {
      const birthday: QueuedCelebration = {
        kind: 'birthday',
        agentId: 'agent-1',
        name: 'Alice Ng',
        photoUrl: null,
        durationSec: 18,
        clientId: 'client-bday-1',
      };
      let s = carouselReducer(initCarousel(slides), { type: 'celebration', payload: birthday });
      expect(s.mode).toBe('celebrate');
      expect(s.current?.clientId).toBe('client-bday-1');
      s = carouselReducer(s, { type: 'celebrationDone' });
      expect(s.mode).toBe('rotate');
      expect(s.current).toBeNull();
    });
  });

  describe('celebrationDone', () => {
    it('dequeues the next celebration when the queue is non-empty', () => {
      let s = carouselReducer(initCarousel(slides), { type: 'celebration', payload: payload('sale-1') });
      s = carouselReducer(s, { type: 'celebration', payload: payload('sale-2') });
      s = carouselReducer(s, { type: 'celebrationDone' });
      expect(s.mode).toBe('celebrate');
      expect(s.current?.clientId).toBe('client-sale-2');
      expect(s.queue).toEqual([]);
    });

    it('returns to rotate keeping the preserved remaining time when it is >= 3000ms', () => {
      let s = carouselReducer(initCarousel(slides), { type: 'tick', dtMs: 4_000 }); // remaining 6000
      s = carouselReducer(s, { type: 'celebration', payload: payload('sale-1') });
      s = carouselReducer(s, { type: 'celebrationDone' });
      expect(s.mode).toBe('rotate');
      expect(s.current).toBeNull();
      expect(s.index).toBe(0);
      expect(s.remainingMs).toBe(6_000);
    });

    it('raises remaining time to 3000ms when the interrupted page had almost expired', () => {
      let s = carouselReducer(initCarousel(slides), { type: 'tick', dtMs: 9_500 }); // remaining 500
      s = carouselReducer(s, { type: 'celebration', payload: payload('sale-1') });
      s = carouselReducer(s, { type: 'celebrationDone' });
      expect(s.mode).toBe('rotate');
      expect(s.remainingMs).toBe(3_000);
    });

    it('after draining the queue, restores rotate with the 3000ms floor', () => {
      let s = carouselReducer(initCarousel(slides), { type: 'tick', dtMs: 9_800 }); // remaining 200
      s = carouselReducer(s, { type: 'celebration', payload: payload('sale-1') });
      s = carouselReducer(s, { type: 'celebration', payload: payload('sale-2') });
      s = carouselReducer(s, { type: 'celebrationDone' }); // dequeues sale-2
      expect(s.mode).toBe('celebrate');
      expect(s.current?.clientId).toBe('client-sale-2');
      s = carouselReducer(s, { type: 'celebrationDone' }); // queue now empty
      expect(s.mode).toBe('rotate');
      expect(s.current).toBeNull();
      expect(s.remainingMs).toBe(3_000);
    });
  });

  describe('setSlides', () => {
    it('rotate mode: keeps an in-range index and resets remaining to the current slide duration', () => {
      let s = carouselReducer(initCarousel(slides), { type: 'tick', dtMs: 10_000 }); // index 1
      s = carouselReducer(s, { type: 'setSlides', slides: altSlides });
      expect(s.index).toBe(1);
      expect(s.remainingMs).toBe(8_000); // altSlides[1].durationSec * 1000
      expect(s.slides).toEqual(altSlides);
    });

    it('rotate mode: clamps an out-of-range index by modulo', () => {
      const atLast: CarouselState = { ...initCarousel(slides), index: 2, remainingMs: 1_234 };
      const s = carouselReducer(atLast, { type: 'setSlides', slides: altSlides });
      expect(s.index).toBe(0); // 2 % 2
      expect(s.remainingMs).toBe(12_000);
    });

    it('celebrate mode: swaps slides without interrupting the celebration', () => {
      let s = carouselReducer(initCarousel(slides), { type: 'celebration', payload: payload('sale-1') });
      s = carouselReducer(s, { type: 'setSlides', slides: altSlides });
      expect(s.mode).toBe('celebrate');
      expect(s.current?.clientId).toBe('client-sale-1');
      expect(s.slides).toEqual(altSlides);
      s = carouselReducer(s, { type: 'celebrationDone' });
      expect(s.mode).toBe('rotate');
      expect(s.index).toBe(0);
      expect(s.remainingMs).toBe(12_000);
    });

    it('setting an empty slide list is safe and tick stays put', () => {
      let s = carouselReducer(initCarousel(slides), { type: 'setSlides', slides: [] });
      expect(s.index).toBe(0);
      expect(s.remainingMs).toBe(0);
      s = carouselReducer(s, { type: 'tick', dtMs: 250 });
      expect(s.index).toBe(0);
      expect(s.remainingMs).toBe(0);
    });
  });

  describe('reset', () => {
    it('clears everything, even mid-celebration with a queued item', () => {
      let s = carouselReducer(initCarousel(slides), { type: 'celebration', payload: payload('sale-1') });
      s = carouselReducer(s, { type: 'celebration', payload: payload('sale-2') });
      s = carouselReducer(s, { type: 'reset' });
      expect(s).toEqual(initCarousel([]));
    });

    it('is safe to tick after a reset (no-op, no crash)', () => {
      let s = carouselReducer(initCarousel(slides), { type: 'tick', dtMs: 4_000 });
      s = carouselReducer(s, { type: 'reset' });
      s = carouselReducer(s, { type: 'tick', dtMs: 250 });
      expect(s.index).toBe(0);
      expect(s.remainingMs).toBe(0);
      expect(s.mode).toBe('rotate');
      expect(s.slides).toEqual([]);
    });
  });
  ```

- [ ] **Step 4: 运行确认失败(类型层红以 tsc 为准)**

  ```bash
  npx vitest run tests/carousel.test.ts
  npx tsc --noEmit
  ```

  预期:vitest **运行时可能全绿**(类型仅存在于编译期,reducer 行为未变、多余字段被透传)——这一步的红以 `tsc` 为准:必然报错,至少包括 `Module '"@/lib/carousel"' has no exported member 'QueuedCelebration'`、`'kind' does not exist in type 'CelebrationPayload'`、sales.test.ts 的 `Property 'kind' does not exist`、`has no exported member 'buildBirthdayPayload'`。确认这些错误在,再进入实现。

- [ ] **Step 5: protocol.ts — CelebrationPayload 拆 union(契约权威定义)**

  用完整内容覆盖 `src/lib/ws/protocol.ts`(仅类型区变化,`ServerEvent`/`clientEventSchema` 原样保留):

  ```ts
  import { z } from 'zod';
  import type { TvScreenInfo } from '../types';

  export type SaleCelebration = {
    kind: 'sale';
    saleId: string;
    agentName: string;
    agentPhotoUrl: string | null;
    address: string;
    salePriceCents: number;
    anthemUrl: string | null;   // 已解析:agent.anthemUrl ?? settings.defaultAnthemUrl(可能为 builtin:xxx 或文件 URL)
    durationSec: number;
  };

  export type BirthdayCelebration = {
    kind: 'birthday';
    agentId: string;
    name: string;
    photoUrl: string | null;
    durationSec: number;
  };

  export type CelebrationPayload = SaleCelebration | BirthdayCelebration;

  export type DataDomain = 'sales' | 'listings' | 'goals' | 'announcements' | 'agents';

  export type ServerEvent =
    | { type: 'paired'; deviceToken: string; screen: TvScreenInfo }
    | { type: 'celebration.play'; celebration: CelebrationPayload }
    | { type: 'data.updated'; domain: DataDomain }
    | { type: 'config.updated' }
    | { type: 'screen.updated'; screen: TvScreenInfo }
    | { type: 'screen.unpaired' }
    | { type: 'pong' };

  export const clientEventSchema = z.discriminatedUnion('type', [
    z.object({
      type: z.literal('hello'),
      deviceToken: z.string().optional(),
      screenId: z.string().optional(),
      pairCode: z.string().optional(),
    }),
    z.object({ type: z.literal('ping') }),
  ]);
  export type ClientEvent = z.infer<typeof clientEventSchema>;
  ```

- [ ] **Step 6: celebration.ts — kind:'sale' + buildBirthdayPayload(契约权威签名)**

  用完整内容覆盖 `src/lib/domain/celebration.ts`:

  ```ts
  import type { SaleCelebration, BirthdayCelebration } from '../ws/protocol';
  import type { SettingsData } from '../settings';

  export function buildCelebrationPayload(
    sale: { id: string; address: string; salePriceCents: number },
    agent: { name: string; photoUrl: string | null; anthemUrl: string | null },
    settings: SettingsData,
  ): SaleCelebration {
    return {
      kind: 'sale',
      saleId: sale.id,
      agentName: agent.name,
      agentPhotoUrl: agent.photoUrl,
      address: sale.address,
      salePriceCents: sale.salePriceCents,
      anthemUrl: agent.anthemUrl || settings.defaultAnthemUrl,
      durationSec: settings.celebrationDurationSec,
    };
  }

  export function buildBirthdayPayload(
    agent: { id: string; name: string; photoUrl: string | null },
    settings: SettingsData,
  ): BirthdayCelebration {
    return {
      kind: 'birthday',
      agentId: agent.id,
      name: agent.name,
      photoUrl: agent.photoUrl,
      durationSec: settings.celebrationDurationSec,
    };
  }
  ```

  两个 sales route 的调用点因返回类型收窄为 `SaleCelebration`(仍可赋给 `CelebrationPayload`)而**无需任何改动**。

- [ ] **Step 7: anthems.ts — BIRTHDAY_ANTHEM_ID 常量**

  用完整内容覆盖 `src/lib/audio/anthems.ts`:

  ```ts
  export type BuiltinAnthem = { id: string; name: string }; // id 形如 'builtin:victory'

  export const BUILTIN_ANTHEMS: BuiltinAnthem[] = [
    { id: 'builtin:victory', name: 'Victory Fanfare' },
    { id: 'builtin:neon-rush', name: 'Neon Rush' },
    { id: 'builtin:champion', name: 'Champion Rise' },
  ];

  // 生日播报专用——刻意不放进 BUILTIN_ANTHEMS,主题曲下拉永远不出现它(设计 §4)。
  export const BIRTHDAY_ANTHEM_ID = 'builtin:birthday';

  export function isBuiltinAnthem(url: string | null): boolean {
    return url !== null && url.startsWith('builtin:');
  }
  ```

- [ ] **Step 8: audio.ts — 删循环重排 + builtin:birthday 旋律**

  用完整内容覆盖 `src/components/tv/audio.ts`。相对现状的三点变化:①`MELODIES` 增加 `'builtin:birthday'`(生日快乐旋律,25 个音符,同款双振荡器);②`playBuiltin` 删除 `loopTimer`/`stopped`/`setTimeout(schedulePass, ...)` 自我重排——`schedulePass` 只调一次,旋律播完即止;③`stop()` 保持原语义:遍历 `oscillators` 数组逐个 `osc.stop()` 并 `master.disconnect()`(提前打断仍立即静音),`playFile` 与 `playAnthem` 不动:

  ```ts
  import { isBuiltinAnthem } from '@/lib/audio/anthems';

  type Note = { freq: number; dur: number }; // dur in seconds

  const MELODIES: Record<string, Note[]> = {
    'builtin:victory': [
      { freq: 523.25, dur: 0.15 }, { freq: 523.25, dur: 0.15 }, { freq: 523.25, dur: 0.15 },
      { freq: 659.25, dur: 0.45 }, { freq: 523.25, dur: 0.3 }, { freq: 659.25, dur: 0.3 },
      { freq: 783.99, dur: 0.6 }, { freq: 659.25, dur: 0.2 }, { freq: 783.99, dur: 0.2 },
      { freq: 1046.5, dur: 0.9 },
    ],
    'builtin:neon-rush': [
      { freq: 440, dur: 0.12 }, { freq: 523.25, dur: 0.12 }, { freq: 659.25, dur: 0.12 },
      { freq: 880, dur: 0.24 }, { freq: 659.25, dur: 0.12 }, { freq: 880, dur: 0.24 },
      { freq: 987.77, dur: 0.24 }, { freq: 880, dur: 0.12 }, { freq: 659.25, dur: 0.12 },
      { freq: 587.33, dur: 0.24 }, { freq: 659.25, dur: 0.24 }, { freq: 880, dur: 0.48 },
    ],
    'builtin:champion': [
      { freq: 392, dur: 0.2 }, { freq: 440, dur: 0.2 }, { freq: 493.88, dur: 0.2 },
      { freq: 587.33, dur: 0.4 }, { freq: 493.88, dur: 0.2 }, { freq: 587.33, dur: 0.4 },
      { freq: 783.99, dur: 0.6 }, { freq: 587.33, dur: 0.3 }, { freq: 783.99, dur: 0.9 },
    ],
    // Birthday broadcasts only (BIRTHDAY_ANTHEM_ID) — deliberately absent from
    // BUILTIN_ANTHEMS so it never shows in the agent anthem dropdown.
    'builtin:birthday': [
      // Happy birthday to you
      { freq: 392, dur: 0.25 }, { freq: 392, dur: 0.25 }, { freq: 440, dur: 0.5 },
      { freq: 392, dur: 0.5 }, { freq: 523.25, dur: 0.5 }, { freq: 493.88, dur: 1 },
      // Happy birthday to you
      { freq: 392, dur: 0.25 }, { freq: 392, dur: 0.25 }, { freq: 440, dur: 0.5 },
      { freq: 392, dur: 0.5 }, { freq: 587.33, dur: 0.5 }, { freq: 523.25, dur: 1 },
      // Happy birthday dear champion
      { freq: 392, dur: 0.25 }, { freq: 392, dur: 0.25 }, { freq: 783.99, dur: 0.5 },
      { freq: 659.25, dur: 0.5 }, { freq: 523.25, dur: 0.5 }, { freq: 493.88, dur: 0.5 },
      { freq: 440, dur: 1 },
      // Happy birthday to you
      { freq: 698.46, dur: 0.25 }, { freq: 698.46, dur: 0.25 }, { freq: 659.25, dur: 0.5 },
      { freq: 523.25, dur: 0.5 }, { freq: 587.33, dur: 0.5 }, { freq: 523.25, dur: 1.2 },
    ],
  };

  let _ctx: AudioContext | null = null;

  function getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!_ctx) {
      try {
        _ctx = new AudioContext();
      } catch (err) {
        console.warn('AudioContext unavailable', err);
        return null;
      }
    }
    if (_ctx.state === 'suspended') {
      _ctx.resume().catch(() => {});
    }
    return _ctx;
  }

  function clampVolume(volume: number): number {
    return Math.max(0, Math.min(1, volume));
  }

  function playBuiltin(id: string, volume: number): { stop(): void } {
    const ctx = getAudioContext();
    if (!ctx) return { stop() {} };

    const melody = MELODIES[id] ?? MELODIES['builtin:victory'];
    const master = ctx.createGain();
    // Scale down: two oscillators per note clip easily at full gain.
    master.gain.value = clampVolume(volume) * 0.3;
    master.connect(ctx.destination);

    const oscillators: OscillatorNode[] = [];

    // Single pass: the melody plays exactly once (no self-rescheduling loop);
    // the celebration visual runs out its own durationSec independently.
    const schedulePass = () => {
      let t = ctx.currentTime + 0.05;
      for (const note of melody) {
        for (const type of ['square', 'sawtooth'] as const) {
          const osc = ctx.createOscillator();
          osc.type = type;
          // Sawtooth an octave down for body under the square lead.
          osc.frequency.value = type === 'sawtooth' ? note.freq / 2 : note.freq;
          const gain = ctx.createGain();
          gain.gain.setValueAtTime(0, t);
          gain.gain.linearRampToValueAtTime(1, t + 0.01);              // attack
          gain.gain.linearRampToValueAtTime(0.7, t + note.dur * 0.6);  // decay
          gain.gain.linearRampToValueAtTime(0, t + note.dur);          // release
          osc.connect(gain);
          gain.connect(master);
          osc.start(t);
          osc.stop(t + note.dur + 0.02);
          oscillators.push(osc);
        }
        t += note.dur;
      }
    };

    try {
      schedulePass();
    } catch (err) {
      console.warn('Anthem synthesis failed', err);
    }

    return {
      stop() {
        for (const osc of oscillators) {
          try {
            osc.stop();
          } catch {
            // already stopped
          }
        }
        try {
          master.disconnect();
        } catch {
          // already disconnected
        }
      },
    };
  }

  function playFile(url: string, volume: number): { stop(): void } {
    const audio = new Audio(url);
    audio.volume = clampVolume(volume);
    audio.play().catch((err) => console.warn('Anthem playback failed', err));
    return {
      stop() {
        audio.pause();
        audio.src = '';
      },
    };
  }

  export function playAnthem(anthemUrl: string | null, volume: number): { stop(): void } {
    const url = anthemUrl ?? 'builtin:victory';
    if (isBuiltinAnthem(url)) return playBuiltin(url, volume);
    return playFile(url, volume);
  }
  ```

- [ ] **Step 9: carousel.ts — QueuedCelebration**

  修改 `src/lib/carousel.ts` 头部类型区。找到:

  ```ts
  import type { CelebrationPayload } from './ws/protocol';
  import type { SlideKey } from './settings';

  export type CarouselSlide = { key: SlideKey; durationSec: number };

  export type CarouselState = {
    slides: CarouselSlide[];
    index: number;            // 0 when slides is empty; renderer shows idle
    remainingMs: number;
    mode: 'rotate' | 'celebrate';
    current: CelebrationPayload | null;   // current celebration in celebrate mode
    queue: CelebrationPayload[];          // FIFO
  };

  export type CarouselEvent =
    | { type: 'tick'; dtMs: number }
    | { type: 'celebration'; payload: CelebrationPayload }
    | { type: 'celebrationDone' }
    | { type: 'setSlides'; slides: CarouselSlide[] }
    | { type: 'reset' };
  ```

  替换为:

  ```ts
  import type { CelebrationPayload } from './ws/protocol';
  import type { SlideKey } from './settings';

  export type CarouselSlide = { key: SlideKey; durationSec: number };

  // clientId:TV 端收到事件时本地生成的稳定挂载键——同一 payload(如同一 sale 连续
  // replay)也会重挂载 overlay;sale/birthday 两种 kind 统一用它当 React key。
  export type QueuedCelebration = CelebrationPayload & { clientId: string };

  export type CarouselState = {
    slides: CarouselSlide[];
    index: number;            // 0 when slides is empty; renderer shows idle
    remainingMs: number;
    mode: 'rotate' | 'celebrate';
    current: QueuedCelebration | null;   // current celebration in celebrate mode
    queue: QueuedCelebration[];          // FIFO
  };

  export type CarouselEvent =
    | { type: 'tick'; dtMs: number }
    | { type: 'celebration'; payload: QueuedCelebration }
    | { type: 'celebrationDone' }
    | { type: 'setSlides'; slides: CarouselSlide[] }
    | { type: 'reset' };
  ```

  `MIN_RESUME_MS`、`initCarousel`、`carouselReducer` 全部原样不动。

- [ ] **Step 10: TvApp.tsx — 注入 clientId、overlay key 改 clientId**

  对 `src/components/tv/TvApp.tsx` 做 4 处修改。

  ① import(两行并一行,`CelebrationPayload` 不再被本文件使用),找到:

  ```ts
  import { carouselReducer, initCarousel, type CarouselSlide } from '@/lib/carousel';
  import type { CelebrationPayload } from '@/lib/ws/protocol';
  ```

  替换为:

  ```ts
  import { carouselReducer, initCarousel, type CarouselSlide, type QueuedCelebration } from '@/lib/carousel';
  ```

  ② 缓冲 ref 类型,找到:

  ```ts
    const pendingCelebrations = useRef<CelebrationPayload[]>([]);
  ```

  替换为:

  ```ts
    const pendingCelebrations = useRef<QueuedCelebration[]>([]);
  ```

  ③ onCelebration 处理器(缓冲与直发都 wrap,`handleStart` 的 flush 逻辑因此不用改)。**注意不要用 `crypto.randomUUID()`**——办公室电视通过 `http://<内网IP>` 打开时是非 secure context,该 API 不存在会抛错吞掉庆祝事件;用递增计数器 ref 即可(仅需本客户端会话内唯一)。

  先在 `pendingCelebrations` 声明的下一行加一个计数器 ref:

  ```ts
    const celebrationSeq = useRef(0);
  ```

  然后找到:

  ```ts
      onCelebration: (payload) => {
        if (!audioUnlockedRef.current) {
          pendingCelebrations.current.push(payload);
          return;
        }
        dispatch({ type: 'celebration', payload });
      },
  ```

  替换为:

  ```ts
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
  ```

  ④ overlay 的 key(union-safe 稳定键,顺带修复同 saleId 连续重播不重挂载的既有边界),找到:

  ```tsx
            <CelebrationOverlay
              key={carousel.current.saleId}
  ```

  替换为:

  ```tsx
            <CelebrationOverlay
              key={carousel.current.clientId}
  ```

- [ ] **Step 11: CelebrationOverlay.tsx — 按 kind 分支渲染**

  用完整内容覆盖 `src/components/tv/CelebrationOverlay.tsx`。props 签名不变(`payload: CelebrationPayload`,clientId 不需要);sale 分支视觉与逻辑与现状逐字一致;birthday 分支含精确文本 `HAPPY BIRTHDAY`(E2E 钉死)、复用 `Avatar` 子组件与粒子、固定播 `BIRTHDAY_ANTHEM_ID`;JSX 分支直接用 `payload.kind === 'birthday'` 判别(保证 TS 收窄),背景色才用 `isBirthday` 布尔:

  ```tsx
  'use client';

  import { useEffect, useMemo, useState } from 'react';
  import { motion } from 'framer-motion';
  import type { CelebrationPayload } from '@/lib/ws/protocol';
  import { formatMoney } from '@/lib/format';
  import { playAnthem } from '@/components/tv/audio';
  import { BIRTHDAY_ANTHEM_ID } from '@/lib/audio/anthems';

  type Particle = { left: number; size: number; duration: number; delay: number; color: string };

  function Avatar({ name, photoUrl }: { name: string; photoUrl: string | null }) {
    const [failed, setFailed] = useState(false);
    if (photoUrl && !failed) {
      return (
        <img
          src={photoUrl}
          alt={name}
          className="h-48 w-48 rounded-full border-4 border-neon object-cover"
          style={{ boxShadow: '0 0 32px rgba(0, 229, 255, 0.8)' }}
          onError={() => setFailed(true)}
        />
      );
    }
    return (
      <span
        className="flex h-48 w-48 items-center justify-center rounded-full border-4 border-neon bg-panel-2 font-display text-7xl text-neon"
        style={{ boxShadow: '0 0 32px rgba(0, 229, 255, 0.8)' }}
      >
        {(Array.from(name)[0] ?? '?').toUpperCase()}
      </span>
    );
  }

  export default function CelebrationOverlay({
    payload,
    volume,
    onDone,
  }: {
    payload: CelebrationPayload;
    volume: number;
    onDone(): void;
  }) {
    useEffect(() => {
      // Birthday broadcasts always use the built-in birthday melody; sales keep the
      // resolved agent/default anthem. Either way the melody plays exactly once
      // (audio.ts no longer loops) while the overlay runs its full durationSec.
      const anthemUrl =
        payload.kind === 'birthday' ? BIRTHDAY_ANTHEM_ID : payload.anthemUrl ?? 'builtin:victory';
      const player = playAnthem(anthemUrl, volume);
      const timer = setTimeout(() => {
        player.stop();
        onDone();
      }, payload.durationSec * 1000);
      return () => {
        clearTimeout(timer);
        player.stop();
      };
    }, [payload, volume, onDone]);

    const particles = useMemo<Particle[]>(
      () =>
        Array.from({ length: 20 }, (_, i) => ({
          left: (i * 37 + 11) % 100,
          size: 10 + (i % 4) * 6,
          duration: 4 + (i % 5),
          delay: (i * 0.4) % 3,
          color: i % 2 === 0 ? '#00e5ff' : '#ffc800',
        })),
      [],
    );

    const isBirthday = payload.kind === 'birthday';

    return (
      <motion.div
        className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden"
        style={{
          background: isBirthday
            ? 'radial-gradient(circle at 50% 40%, rgba(255, 105, 180, 0.18), #0a0e1a 70%)'
            : 'radial-gradient(circle at 50% 40%, rgba(0, 229, 255, 0.18), #0a0e1a 70%)',
        }}
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 1.05 }}
        transition={{ duration: 0.5 }}
      >
        <style>{`
          @keyframes celebration-float {
            from { transform: translateY(0) rotate(0deg); opacity: 1; }
            to { transform: translateY(-110vh) rotate(720deg); opacity: 0; }
          }
        `}</style>
        {particles.map((p, i) => (
          <span
            key={i}
            className="absolute bottom-0 block"
            style={{
              left: `${p.left}%`,
              width: p.size,
              height: p.size,
              backgroundColor: p.color,
              animation: `celebration-float ${p.duration}s linear ${p.delay}s infinite`,
            }}
          />
        ))}
        {payload.kind === 'birthday' ? (
          <>
            <p
              className="font-display text-8xl text-gold neon-text"
              style={{ textShadow: '0 0 18px rgba(255, 200, 0, 0.9), 0 0 42px rgba(255, 105, 180, 0.8)' }}
            >
              🎂 HAPPY BIRTHDAY 🎂
            </p>
            <div className="mt-12">
              <Avatar key={payload.photoUrl ?? 'none'} name={payload.name} photoUrl={payload.photoUrl} />
            </div>
            <p className="mt-10 font-display text-9xl text-neon neon-text">{payload.name}</p>
          </>
        ) : (
          <>
            <p className="font-display text-8xl text-gold neon-text">🎉 SOLD! 🎉</p>
            <div className="mt-12">
              <Avatar key={payload.agentPhotoUrl ?? 'none'} name={payload.agentName} photoUrl={payload.agentPhotoUrl} />
            </div>
            <p className="mt-8 font-display text-7xl text-neon neon-text">{payload.agentName}</p>
            <p className="mt-6 font-heading text-4xl text-ink">{payload.address}</p>
            <p className="mt-6 font-display text-8xl text-money neon-text">{formatMoney(payload.salePriceCents)}</p>
          </>
        )}
      </motion.div>
    );
  }
  ```

- [ ] **Step 12: 转绿 + 全仓 tsc 干净**

  ```bash
  npx vitest run tests/api/sales.test.ts tests/carousel.test.ts
  npx tsc --noEmit
  npx vitest run
  ```

  预期:sales.test.ts 全部通过(含新 `buildBirthdayPayload` describe),carousel.test.ts 全部通过(含新 birthday 用例);`tsc` **零输出**(本任务铁律——union 波及的 `useTvSocket.ts`/`hub.ts` 只透传 `CelebrationPayload`,无需改动,若 tsc 报到别的文件,回查 Step 5–11 是否有遗漏);全量套件全绿。

- [ ] **Step 13: npm run build**

  ```bash
  npm run build
  ```

  预期:Next.js 生产构建成功(TvApp/CelebrationOverlay 均为 client 组件,AudioContext 只在浏览器运行时触达,构建无 SSR 报错)。

- [ ] **Step 14: Commit**

  ```bash
  git add src/lib/ws/protocol.ts src/lib/domain/celebration.ts src/lib/audio/anthems.ts src/components/tv/audio.ts src/lib/carousel.ts src/components/tv/TvApp.tsx src/components/tv/CelebrationOverlay.tsx tests/api/sales.test.ts tests/carousel.test.ts
  git commit -m "feat: celebration payload union, one-shot anthems and birthday overlay"
  ```
---
### Task 3: Team API 约束(role/birthday 读写 + agent-only 强约束)

**Files:**
- Modify: `src/app/api/agents/route.ts`
- Modify: `src/app/api/agents/[id]/route.ts`
- Modify: `src/app/api/sales/route.ts`
- Modify: `src/app/api/sales/[id]/route.ts`
- Modify: `src/app/api/listings/route.ts`
- Modify: `src/app/api/listings/[id]/route.ts`
- Modify: `src/app/api/tv/state/route.ts`
- Test: `tests/api/agents.test.ts`
- Test: `tests/api/sales.test.ts`
- Test: `tests/api/listings.test.ts`
- Test: `tests/api/tv-state.test.ts`

前置依赖:Task 1(`agents.role`/`agents.birthday` 列与 `src/lib/domain/birthday.ts` 的 `BIRTHDAY_RE` 已存在)、Task 2(协议 union 已落地)。

本任务做三件事:agents 的 create/patch schema 增加 `role` 与 `birthday`;sales 与 listings 的 agentId 校验在 `active=true` 之上追加 `role='agent'`(staff 不能录成交/房源,错误文案维持 `'Unknown agent'` 不泄漏);`/api/tv/state` 组装榜单输入时过滤掉 staff。role 过滤**只加在这三处**,其余查询(agents 列表、replay 的历史回放查询等)一律不动。

- [ ] **Step 1: 写测试(四个测试文件追加用例)**

  **1a. `tests/api/agents.test.ts`** — 在文件末尾(`describe('DELETE /api/agents/[id]', ...)` 块之后)追加:

  ```ts
  describe('role & birthday', () => {
    it('creates a staff member with a birthday and returns both fields', async () => {
      const res = await POST(
        await authedRequest('/api/agents', {
          method: 'POST',
          body: { name: 'Fay Ops', role: 'staff', birthday: '08-18' },
        }),
      );
      expect(res.status).toBe(200);
      const { data } = await res.json();
      expect(data.role).toBe('staff');
      expect(data.birthday).toBe('08-18');
    });

    it('defaults role to agent and birthday to null', async () => {
      const res = await POST(
        await authedRequest('/api/agents', { method: 'POST', body: { name: 'Gil Doe' } }),
      );
      expect(res.status).toBe(200);
      const { data } = await res.json();
      expect(data.role).toBe('agent');
      expect(data.birthday).toBeNull();
    });

    it('rejects invalid birthday formats with 400', async () => {
      for (const birthday of ['8-18', '13-01', '00-10', '01-32', '0818']) {
        const res = await POST(
          await authedRequest('/api/agents', {
            method: 'POST',
            body: { name: 'Bad Birthday', birthday },
          }),
        );
        expect(res.status).toBe(400);
      }
      expect(events).toEqual([]);
    });

    it('rejects an invalid role with 400', async () => {
      const res = await POST(
        await authedRequest('/api/agents', {
          method: 'POST',
          body: { name: 'Bad Role', role: 'manager' },
        }),
      );
      expect(res.status).toBe(400);
      expect(events).toEqual([]);
    });

    it('accepts 02-31 (regex-level validation only, by design)', async () => {
      const res = await POST(
        await authedRequest('/api/agents', {
          method: 'POST',
          body: { name: 'Loose Day', birthday: '02-31' },
        }),
      );
      expect(res.status).toBe(200);
      const { data } = await res.json();
      expect(data.birthday).toBe('02-31');
    });

    it('PATCH updates role and birthday, and null clears birthday', async () => {
      const patched = await PATCH(
        await authedRequest(`/api/agents/${basics.agentId}`, {
          method: 'PATCH',
          body: { role: 'staff', birthday: '12-31' },
        }),
        { params: Promise.resolve({ id: basics.agentId }) },
      );
      expect(patched.status).toBe(200);
      const { data } = await patched.json();
      expect(data.role).toBe('staff');
      expect(data.birthday).toBe('12-31');

      const cleared = await PATCH(
        await authedRequest(`/api/agents/${basics.agentId}`, {
          method: 'PATCH',
          body: { birthday: null },
        }),
        { params: Promise.resolve({ id: basics.agentId }) },
      );
      expect(cleared.status).toBe(200);
      const { data: after } = await cleared.json();
      expect(after.birthday).toBeNull();
      expect(after.role).toBe('staff');
    });

    it('PATCH rejects an invalid birthday with 400', async () => {
      const res = await PATCH(
        await authedRequest(`/api/agents/${basics.agentId}`, {
          method: 'PATCH',
          body: { birthday: '2-3' },
        }),
        { params: Promise.resolve({ id: basics.agentId }) },
      );
      expect(res.status).toBe(400);
      expect(events).toEqual([]);
    });
  });
  ```

  说明:`02-29`/`02-31` 这类"regex 合法但日历上可疑"的值按设计放行(仅 `BIRTHDAY_RE` 级校验),`accepts 02-31` 用例就是把这个宽松度锁死成契约,后续没人"顺手修复"它。

  **1b. `tests/api/sales.test.ts`** — 在**文件末尾**追加(Task 2 之后文件末尾是 `describe('buildBirthdayPayload', ...)` 块,追加在它之后即可)。所需的 `AGENTS_POST` 与 `PATCH` 该文件已导入,无需改 import:

  ```ts
  describe('role guard: staff cannot transact', () => {
    it('rejects creating a sale for a staff member with 400 Unknown agent', async () => {
      const staffRes = await AGENTS_POST(
        await authedRequest('/api/agents', {
          method: 'POST',
          body: { name: 'Sam Staff', role: 'staff' },
        }),
      );
      expect(staffRes.status).toBe(200);
      const { data: staff } = await staffRes.json();
      expect(staff.role).toBe('staff');
      events.length = 0;

      const res = await POST(
        await authedRequest('/api/sales', {
          method: 'POST',
          body: { ...saleBody(), agentId: staff.id },
        }),
      );
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Unknown agent' });
      expect(events).toEqual([]);
    });

    it('rejects reassigning a sale to a staff member with 400 Unknown agent', async () => {
      const created = await (
        await POST(await authedRequest('/api/sales', { method: 'POST', body: saleBody() }))
      ).json();
      const staffRes = await AGENTS_POST(
        await authedRequest('/api/agents', {
          method: 'POST',
          body: { name: 'Sam Staff', role: 'staff' },
        }),
      );
      const { data: staff } = await staffRes.json();
      events.length = 0;

      const res = await PATCH(
        await authedRequest(`/api/sales/${created.data.id}`, {
          method: 'PATCH',
          body: { agentId: staff.id },
        }),
        { params: Promise.resolve({ id: created.data.id }) },
      );
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Unknown agent' });
      expect(events).toEqual([]);
    });
  });
  ```

  **1c. `tests/api/listings.test.ts`** — 第一步补 import:现有第 8 行

  ```ts
  import { DELETE as AGENTS_DELETE } from '@/app/api/agents/[id]/route';
  ```

  改为两行:

  ```ts
  import { POST as AGENTS_POST } from '@/app/api/agents/route';
  import { DELETE as AGENTS_DELETE } from '@/app/api/agents/[id]/route';
  ```

  然后在文件末尾(`describe('DELETE /api/listings/[id]', ...)` 块之后)追加:

  ```ts
  describe('role guard: staff cannot hold listings', () => {
    it('rejects creating a listing for a staff member with 400 Unknown agent', async () => {
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
        await authedRequest('/api/listings', {
          method: 'POST',
          body: { ...listingBody(), agentId: staff.id },
        }),
      );
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Unknown agent' });
      expect(events).toEqual([]);
    });

    it('rejects reassigning a listing to a staff member with 400 Unknown agent', async () => {
      const created = await (
        await POST(await authedRequest('/api/listings', { method: 'POST', body: listingBody() }))
      ).json();
      const staffRes = await AGENTS_POST(
        await authedRequest('/api/agents', {
          method: 'POST',
          body: { name: 'Sam Staff', role: 'staff' },
        }),
      );
      const { data: staff } = await staffRes.json();
      events.length = 0;

      const res = await PATCH(
        await authedRequest(`/api/listings/${created.data.id}`, {
          method: 'PATCH',
          body: { agentId: staff.id },
        }),
        { params: Promise.resolve({ id: created.data.id }) },
      );
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Unknown agent' });
      expect(events).toEqual([]);
    });
  });
  ```

  **1d. `tests/api/tv-state.test.ts`** — 在 `it('caps goal percent at 100', ...)` 块结束之后、文件最后一个 `});`(即 `describe('GET /api/tv/state')` 的收尾)之前插入:

  ```ts
    it('excludes staff from every leaderboard', async () => {
      const today = localDateStr(new Date());
      const staffId = crypto.randomUUID();
      await db.insert(agents).values({
        id: staffId, orgId: basics.orgId, name: 'Sam Staff', role: 'staff', birthday: '08-18',
      });
      await db.insert(sales).values({
        id: crypto.randomUUID(), orgId: basics.orgId, agentId: basics.agentId, address: '1 Main St',
        salePriceCents: 50000000, gciCents: 100000, saleDate: today,
      });

      const res = await tvStateGet(stateRequest(token));
      expect(res.status).toBe(200);
      const { data } = await res.json();
      for (const metric of ['sales_count', 'gci', 'listings'] as const) {
        expect(
          data.leaderboards[metric].some((e: { agentId: string }) => e.agentId === staffId),
        ).toBe(false);
      }
      // Alice (role agent) still ranks normally.
      expect(data.leaderboards.sales_count[0]).toMatchObject({ agentId: basics.agentId, value: 1 });
    });
  ```

  说明:staff 有成交历史的场景**不用造**——sales/listings API 会把它拦成 400,正常路径造不出这种数据;这里直接建一个 staff 并断言它不出现在任何榜单上。该用例是回归锁(实现前它就已经绿,因为无业绩的成员本来就不入榜),Task 3 的红灯信号来自 1a/1b/1c。

- [ ] **Step 2: 运行测试,确认失败**

  ```bash
  npx vitest run tests/api/agents.test.ts tests/api/sales.test.ts tests/api/listings.test.ts tests/api/tv-state.test.ts
  ```

  预期:**恰好 10 个新增用例失败**——agents 6 个(`creates a staff member...` 报 `expected 'agent' to be 'staff'`;两个 invalid 用例与 `PATCH rejects an invalid birthday` 报 `expected 200 to be 400`,因为未知键被 zod strip 后请求照常成功;`accepts 02-31` 报 `expected null to be '02-31'`;`PATCH updates role and birthday` 报 `expected 'agent' to be 'staff'`)。sales 2 个、listings 2 个的失败形态**并不相同**:凡是用例内先有 `expect(staff.role).toBe('staff')` 前置断言的,会先死在该断言(报 `expected 'agent' to be 'staff'`,因为 createSchema 尚未支持 role,staff 落库成了默认 'agent'),走不到 400 断言;没有该前置断言的用例才报 `expected 200 to be 400`(staff 被当普通 agent、交易照常成功)。两种失败签名都属预期红灯,不要据此回查前置任务。`defaults role to agent...`(列默认值已由 Task 1 提供)与 tv-state 的 `excludes staff...`(回归锁)是**预期先天绿**,其余既有用例全部保持绿。仅当失败**总数**不是 10 时才核对 Task 1/2 是否已完成。

- [ ] **Step 3: 实现——agents 两个 route 增加 role/birthday**

  **3a.** 将 `src/app/api/agents/route.ts` 整体替换为:

  ```ts
  import { z } from 'zod';
  import { asc, eq } from 'drizzle-orm';
  import { getDb } from '@/lib/db';
  import { getOrgId } from '@/lib/db/org';
  import { agents } from '@/lib/db/schema';
  import { requireAdmin } from '@/lib/auth/session';
  import { getHub } from '@/lib/ws/hub';
  import { BIRTHDAY_RE } from '@/lib/domain/birthday';

  const createSchema = z.object({
    name: z.string().min(1),
    photoUrl: z.string().min(1).optional(),
    anthemUrl: z.string().min(1).optional(),
    role: z.enum(['agent', 'staff']).optional(),
    birthday: z.string().regex(BIRTHDAY_RE).optional(),
  });

  export async function GET(req: Request) {
    const session = await requireAdmin(req);
    if (session instanceof Response) return session;
    const db = await getDb();
    const orgId = await getOrgId(db);
    const rows = await db
      .select()
      .from(agents)
      .where(eq(agents.orgId, orgId))
      .orderBy(asc(agents.name));
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
    const [agent] = await db
      .insert(agents)
      .values({
        id: crypto.randomUUID(),
        orgId,
        name: parsed.data.name,
        photoUrl: parsed.data.photoUrl ?? null,
        anthemUrl: parsed.data.anthemUrl ?? null,
        role: parsed.data.role ?? 'agent',
        birthday: parsed.data.birthday ?? null,
      })
      .returning();
    getHub().broadcast({ type: 'data.updated', domain: 'agents' });
    return Response.json({ data: agent });
  }
  ```

  **3b.** `src/app/api/agents/[id]/route.ts`:在 import 区块末尾(`import { getHub } from '@/lib/ws/hub';` 之后)追加一行:

  ```ts
  import { BIRTHDAY_RE } from '@/lib/domain/birthday';
  ```

  并把现有 `patchSchema`:

  ```ts
  const patchSchema = z.object({
    name: z.string().min(1).optional(),
    photoUrl: z.string().min(1).nullable().optional(),
    anthemUrl: z.string().min(1).nullable().optional(),
    active: z.boolean().optional(),
  });
  ```

  替换为:

  ```ts
  const patchSchema = z.object({
    name: z.string().min(1).optional(),
    photoUrl: z.string().min(1).nullable().optional(),
    anthemUrl: z.string().min(1).nullable().optional(),
    active: z.boolean().optional(),
    role: z.enum(['agent', 'staff']).optional(),
    birthday: z.string().regex(BIRTHDAY_RE).nullable().optional(),
  });
  ```

  PATCH/DELETE 函数体不动——`.set(parsed.data)` 会让 role/birthday(含 `birthday: null` 清空)自然流入 diff-only 更新。

- [ ] **Step 4: 实现——sales/listings 四处 agent 校验追加 role 过滤**

  四处改动同构:在现有 `active=true` 校验的 `and(...)` 里追加 `eq(agents.role, 'agent')`。错误文案保持 `'Unknown agent'` 不变。

  **4a.** `src/app/api/sales/route.ts` 的 `POST` 中,将:

  ```ts
    const [agent] = await db
      .select()
      .from(agents)
      .where(
        and(eq(agents.id, parsed.data.agentId), eq(agents.orgId, orgId), eq(agents.active, true)),
      );
    if (!agent) return Response.json({ error: 'Unknown agent' }, { status: 400 });
  ```

  替换为:

  ```ts
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
  ```

  **4b.** `src/app/api/sales/[id]/route.ts` 的 `PATCH` 中,将:

  ```ts
    if (parsed.data.agentId !== undefined) {
      const [agent] = await db
        .select()
        .from(agents)
        .where(
          and(eq(agents.id, parsed.data.agentId), eq(agents.orgId, orgId), eq(agents.active, true)),
        );
      if (!agent) return Response.json({ error: 'Unknown agent' }, { status: 400 });
    }
  ```

  替换为:

  ```ts
    if (parsed.data.agentId !== undefined) {
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
    }
  ```

  **4c.** `src/app/api/listings/route.ts` 的 `POST` 中,将:

  ```ts
    const [agent] = await db
      .select()
      .from(agents)
      .where(
        and(eq(agents.id, parsed.data.agentId), eq(agents.orgId, orgId), eq(agents.active, true)),
      );
    if (!agent) return Response.json({ error: 'Unknown agent' }, { status: 400 });
  ```

  替换为:

  ```ts
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
  ```

  **4d.** `src/app/api/listings/[id]/route.ts` 的 `PATCH` 中,将:

  ```ts
    if (parsed.data.agentId !== undefined) {
      const [agent] = await db
        .select()
        .from(agents)
        .where(
          and(eq(agents.id, parsed.data.agentId), eq(agents.orgId, orgId), eq(agents.active, true)),
        );
      if (!agent) return Response.json({ error: 'Unknown agent' }, { status: 400 });
    }
  ```

  替换为:

  ```ts
    if (parsed.data.agentId !== undefined) {
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
    }
  ```

  注意:`src/app/api/sales/[id]/replay/route.ts` 的 agent 查询**保持不动**——replay 回放的是历史事实(该文件里已有注释说明),不做 role 过滤。

- [ ] **Step 5: 实现——tv/state 榜单输入过滤 staff**

  `src/app/api/tv/state/route.ts` 中,将:

  ```ts
    const agentRows = await db.select().from(agents).where(eq(agents.orgId, orgId));
  ```

  替换为:

  ```ts
    // Staff never enter the leaderboards. Sales/listings rows can only reference
    // role='agent' members (enforced by their APIs), so computeMetricTotal's
    // team-wide goal totals need no extra role filtering here.
    const agentRows = await db.select().from(agents)
      .where(and(eq(agents.orgId, orgId), eq(agents.role, 'agent')));
  ```

  `and` 该文件已从 `drizzle-orm` 导入,无需改 import。`computeMetricTotal` 直接汇总 sales/listings 行、不经过 agents 列表,而这两张表的行在 API 层已被限定只能挂在 `role='agent'` 的成员上,所以目标进度口径自动排除 staff——这正是上面那行注释存在的原因,不要"顺手"给它加过滤。

- [ ] **Step 6: 转绿并全量回归**

  ```bash
  npx vitest run tests/api/agents.test.ts tests/api/sales.test.ts tests/api/listings.test.ts tests/api/tv-state.test.ts
  npx tsc --noEmit
  npx vitest run
  ```

  预期:三条命令全部通过(0 failed);`tsc` 无输出即成功。

- [ ] **Step 7: Commit**

  ```bash
  git add src/app/api/agents/route.ts "src/app/api/agents/[id]/route.ts" src/app/api/sales/route.ts "src/app/api/sales/[id]/route.ts" src/app/api/listings/route.ts "src/app/api/listings/[id]/route.ts" src/app/api/tv/state/route.ts tests/api/agents.test.ts tests/api/sales.test.ts tests/api/listings.test.ts tests/api/tv-state.test.ts
  git commit -m "feat: team roles and birthdays with agent-only sales, listings and leaderboards"
  ```

  注意路径里的 `[id]` 必须带引号,否则 Git Bash 会把方括号当 glob 展开。

---
### Task 4: 手动生日播报端点

**Files:**
- Create: `src/app/api/agents/[id]/birthday-broadcast/route.ts`
- Test: `tests/api/agents.test.ts`(追加用例)

前置依赖:Task 2(`buildBirthdayPayload` 与 `BirthdayCelebration` 已存在)、Task 3(测试里用 `role: 'staff'` 建 staff,依赖 create schema 已支持 role)。

新增 `POST /api/agents/[id]/birthday-broadcast`(requireAdmin):按 `id + orgId + active=true` 查成员——**不筛 role**(agent 和 staff 都能播)、**不看 birthday 是否今天**(任意时间可播)、**不写防重复标记**(手动播报与 11:00 自动播报的防重复互不相干);未命中一律 404 `{ error: 'Not found' }`(含 inactive,不区分文案避免泄漏存在性)。命中则 `getSettings → buildBirthdayPayload → broadcast celebration.play`,返回 `{ data: { ok: true } }`(与 replay 端点同形)。

- [ ] **Step 1: 写测试**

  `tests/api/agents.test.ts`:在 import 区块末尾(`import { PATCH, DELETE } from '@/app/api/agents/[id]/route';` 之后)追加一行:

  ```ts
  import { POST as BIRTHDAY_BROADCAST } from '@/app/api/agents/[id]/birthday-broadcast/route';
  ```

  然后在文件末尾(Task 3 加的 `describe('role & birthday', ...)` 块之后)追加:

  ```ts
  describe('POST /api/agents/[id]/birthday-broadcast', () => {
    it('requires admin session', async () => {
      const res = await BIRTHDAY_BROADCAST(
        jsonRequest(`/api/agents/${basics.agentId}/birthday-broadcast`, { method: 'POST' }),
        { params: Promise.resolve({ id: basics.agentId }) },
      );
      expect(res.status).toBe(401);
      expect(events).toEqual([]);
    });

    it('broadcasts a birthday celebration payload for an agent', async () => {
      const res = await BIRTHDAY_BROADCAST(
        await authedRequest(`/api/agents/${basics.agentId}/birthday-broadcast`, { method: 'POST' }),
        { params: Promise.resolve({ id: basics.agentId }) },
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ data: { ok: true } });
      expect(events).toEqual([
        {
          type: 'celebration.play',
          celebration: {
            kind: 'birthday',
            agentId: basics.agentId,
            name: 'Alice Ng',
            photoUrl: null,
            durationSec: 18,
          },
        },
      ]);
    });

    it('broadcasts for staff members too, regardless of birthday value', async () => {
      const created = await POST(
        await authedRequest('/api/agents', {
          method: 'POST',
          body: { name: 'Sam Staff', role: 'staff', photoUrl: 'https://example.com/sam.jpg' },
        }),
      );
      const { data: staff } = await created.json();
      events.length = 0;

      const res = await BIRTHDAY_BROADCAST(
        await authedRequest(`/api/agents/${staff.id}/birthday-broadcast`, { method: 'POST' }),
        { params: Promise.resolve({ id: staff.id }) },
      );
      expect(res.status).toBe(200);
      expect(events).toHaveLength(1);
      const first = events[0];
      if (first.type !== 'celebration.play') throw new Error('expected celebration.play');
      if (first.celebration.kind !== 'birthday') throw new Error('expected birthday celebration');
      expect(first.celebration.agentId).toBe(staff.id);
      expect(first.celebration.name).toBe('Sam Staff');
      expect(first.celebration.photoUrl).toBe('https://example.com/sam.jpg');
      expect(first.celebration.durationSec).toBe(18);
    });

    it('returns 404 for an unknown id', async () => {
      const res = await BIRTHDAY_BROADCAST(
        await authedRequest('/api/agents/ghost/birthday-broadcast', { method: 'POST' }),
        { params: Promise.resolve({ id: 'ghost' }) },
      );
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: 'Not found' });
      expect(events).toEqual([]);
    });

    it('returns 404 for an inactive member', async () => {
      const del = await DELETE(
        await authedRequest(`/api/agents/${basics.agentId}`, { method: 'DELETE' }),
        { params: Promise.resolve({ id: basics.agentId }) },
      );
      expect(del.status).toBe(200);
      events.length = 0;

      const res = await BIRTHDAY_BROADCAST(
        await authedRequest(`/api/agents/${basics.agentId}/birthday-broadcast`, { method: 'POST' }),
        { params: Promise.resolve({ id: basics.agentId }) },
      );
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: 'Not found' });
      expect(events).toEqual([]);
    });
  });
  ```

  说明:Alice(seedBasics)没有 birthday 也能播——端点不看日期;`durationSec: 18` 来自 `DEFAULT_SETTINGS.celebrationDurationSec`(测试库没有 settings 行,`getSettings` 回落默认值)。

- [ ] **Step 2: 运行测试,确认失败**

  ```bash
  npx vitest run tests/api/agents.test.ts
  ```

  预期:整个文件**收集失败**,报 `Failed to resolve import "@/app/api/agents/[id]/birthday-broadcast/route"`(route 文件还不存在)。这是本任务的红灯形态,不会出现逐用例断言失败。

- [ ] **Step 3: 实现 route**

  创建 `src/app/api/agents/[id]/birthday-broadcast/route.ts`:

  ```ts
  import { and, eq } from 'drizzle-orm';
  import { getDb } from '@/lib/db';
  import { getOrgId } from '@/lib/db/org';
  import { agents } from '@/lib/db/schema';
  import { requireAdmin } from '@/lib/auth/session';
  import { getHub } from '@/lib/ws/hub';
  import { getSettings } from '@/lib/settings';
  import { buildBirthdayPayload } from '@/lib/domain/celebration';

  export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
    const session = await requireAdmin(req);
    if (session instanceof Response) return session;
    const { id } = await ctx.params;
    const db = await getDb();
    const orgId = await getOrgId(db);
    // No role filter (agents AND staff can be celebrated) and no birthday/date
    // check (manual broadcast works any day). It also never touches the
    // 11:00 scheduler's dedupe mark.
    const [member] = await db
      .select()
      .from(agents)
      .where(and(eq(agents.id, id), eq(agents.orgId, orgId), eq(agents.active, true)));
    if (!member) return Response.json({ error: 'Not found' }, { status: 404 });
    const settings = await getSettings(db, orgId);
    const celebration = buildBirthdayPayload(
      { id: member.id, name: member.name, photoUrl: member.photoUrl },
      settings,
    );
    getHub().broadcast({ type: 'celebration.play', celebration });
    return Response.json({ data: { ok: true } });
  }
  ```

- [ ] **Step 4: 转绿**

  ```bash
  npx vitest run tests/api/agents.test.ts
  npx tsc --noEmit
  ```

  预期:agents 测试全绿(0 failed);`tsc` 无输出。

- [ ] **Step 5: Commit**

  ```bash
  git add "src/app/api/agents/[id]/birthday-broadcast/route.ts" tests/api/agents.test.ts
  git commit -m "feat: manual birthday broadcast endpoint"
  ```

---
### Task 5: 11:00 进程内调度器

**Files:**
- Modify: `src/server/bootstrap.ts`
- Test: `tests/server/birthday-scheduler.test.ts`(新建)

前置依赖:Task 1(`orgs.lastBirthdayBroadcastDate` 列、`isElevenAm`/`localYmd`/`localMmdd`)、Task 2(`buildBirthdayPayload`)。与 Task 3/4 无代码耦合。

调度逻辑抽成可导出的 `runBirthdayTick(db, hub, now)`,测试用 `freshDb` + fake socket **直接调用**它,不起真实 HTTP 服务器;`startServer` 内只挂一个每 60 秒的 interval,并在 `server` 的 `close` 事件里清理(既有 `tests/server/ws-integration.test.ts` 的 afterAll 会 close 服务器,interval 随之清掉,vitest 不会因悬挂句柄卡住)。语义要点:非 11:00 直接返回;当天已播(`lastBirthdayBroadcastDate === localYmd(now)`)直接返回;无寿星**不写标记**(11:00 只有一分钟窗口,但重启后同一分钟内的重复 tick 也必须幂等);有寿星则**先写标记后广播**——宁可极端情况(写完标记进程崩溃)少播一次,也不重播。

- [ ] **Step 1: 写测试**

  创建 `tests/server/birthday-scheduler.test.ts`:

  ```ts
  import { describe, it, expect, beforeEach } from 'vitest';
  import { eq } from 'drizzle-orm';
  import { freshDb, seedBasics, type Basics } from '../helpers/db';
  import type { Db } from '@/lib/db';
  import { agents, orgs } from '@/lib/db/schema';
  import { getHub } from '@/lib/ws/hub';
  import type { ServerEvent } from '@/lib/ws/protocol';
  import { runBirthdayTick } from '@/server/bootstrap';

  const AT_ELEVEN = new Date(2026, 7, 18, 11, 0, 0);   // local 2026-08-18 11:00
  const NOT_ELEVEN = new Date(2026, 7, 18, 10, 59, 0); // local 2026-08-18 10:59
  const TODAY_YMD = '2026-08-18';
  const TODAY_MMDD = '08-18';

  let db: Db;
  let basics: Basics;
  let events: ServerEvent[];

  beforeEach(async () => {
    db = await freshDb();
    basics = await seedBasics(db);
    events = [];
    getHub().register(
      'screen-test',
      { send: (data: string) => events.push(JSON.parse(data) as ServerEvent), close: () => {} },
      true,
    );
  });

  async function insertMember(
    over: Partial<typeof agents.$inferInsert> & { name: string },
  ): Promise<string> {
    const id = crypto.randomUUID();
    await db.insert(agents).values({ id, orgId: basics.orgId, ...over });
    return id;
  }

  async function orgMark(): Promise<string | null> {
    const [org] = await db.select().from(orgs).where(eq(orgs.id, basics.orgId));
    return org.lastBirthdayBroadcastDate;
  }

  describe('runBirthdayTick', () => {
    it('at 11:00 broadcasts for a matching birthday and writes the dedupe mark', async () => {
      const bobId = await insertMember({ name: 'Bob Birthday', birthday: TODAY_MMDD });
      await runBirthdayTick(db, getHub(), AT_ELEVEN);

      expect(events).toEqual([
        {
          type: 'celebration.play',
          celebration: {
            kind: 'birthday',
            agentId: bobId,
            name: 'Bob Birthday',
            photoUrl: null,
            durationSec: 18,
          },
        },
      ]);
      expect(await orgMark()).toBe(TODAY_YMD);

      // A second tick in the same minute (or after a process restart) must not replay.
      await runBirthdayTick(db, getHub(), AT_ELEVEN);
      expect(events).toHaveLength(1);
    });

    it('does nothing outside 11:00', async () => {
      await insertMember({ name: 'Bob Birthday', birthday: TODAY_MMDD });
      await runBirthdayTick(db, getHub(), NOT_ELEVEN);
      expect(events).toEqual([]);
      expect(await orgMark()).toBeNull();
    });

    it('skips when the mark already says today', async () => {
      await insertMember({ name: 'Bob Birthday', birthday: TODAY_MMDD });
      await db.update(orgs)
        .set({ lastBirthdayBroadcastDate: TODAY_YMD })
        .where(eq(orgs.id, basics.orgId));
      await runBirthdayTick(db, getHub(), AT_ELEVEN);
      expect(events).toEqual([]);
    });

    it('writes no mark when nobody has a birthday today', async () => {
      await insertMember({ name: 'No Match', birthday: '01-01' });
      await runBirthdayTick(db, getHub(), AT_ELEVEN);
      expect(events).toEqual([]);
      expect(await orgMark()).toBeNull();
    });

    it('excludes inactive members', async () => {
      await insertMember({ name: 'Gone Away', birthday: TODAY_MMDD, active: false });
      await runBirthdayTick(db, getHub(), AT_ELEVEN);
      expect(events).toEqual([]);
      expect(await orgMark()).toBeNull();
    });

    it('broadcasts for staff members too', async () => {
      const staffId = await insertMember({ name: 'Sam Staff', birthday: TODAY_MMDD, role: 'staff' });
      await runBirthdayTick(db, getHub(), AT_ELEVEN);
      expect(events).toHaveLength(1);
      const first = events[0];
      if (first.type !== 'celebration.play') throw new Error('expected celebration.play');
      if (first.celebration.kind !== 'birthday') throw new Error('expected birthday celebration');
      expect(first.celebration.agentId).toBe(staffId);
      expect(await orgMark()).toBe(TODAY_YMD);
    });

    it('broadcasts one event per celebrant, name ascending', async () => {
      await insertMember({ name: 'Zoe Late', birthday: TODAY_MMDD });
      await insertMember({ name: 'Abe Early', birthday: TODAY_MMDD, role: 'staff' });
      await runBirthdayTick(db, getHub(), AT_ELEVEN);
      expect(events).toHaveLength(2);
      const names = events.map((e) => {
        if (e.type !== 'celebration.play' || e.celebration.kind !== 'birthday') {
          throw new Error('unexpected event');
        }
        return e.celebration.name;
      });
      expect(names).toEqual(['Abe Early', 'Zoe Late']);
    });
  });
  ```

  说明:`AT_ELEVEN` 用本地时间构造(`new Date(y, m, d, 11, 0)`),与 `isElevenAm`/`localYmd`/`localMmdd` 的本地时区语义一致,任何部署时区下都稳定;seedBasics 的 Alice 没有 birthday,永不误命中;`durationSec: 18` 同样来自默认 settings。

- [ ] **Step 2: 运行测试,确认失败**

  ```bash
  npx vitest run tests/server/birthday-scheduler.test.ts
  ```

  预期:报 `does not provide an export named 'runBirthdayTick'`(或 `runBirthdayTick is not a function`),七个用例全部失败——`src/server/bootstrap.ts` 还没有该导出。

- [ ] **Step 3: 实现——bootstrap.ts 增加 runBirthdayTick 与 interval**

  **3a.** 将 `src/server/bootstrap.ts` 顶部的 import 区块(第 1–12 行):

  ```ts
  import { loadEnvConfig } from '@next/env';
  loadEnvConfig(process.cwd());

  import http from 'node:http';
  import type { Duplex } from 'node:stream';
  import { WebSocketServer, type WebSocket } from 'ws';
  import { and, eq } from 'drizzle-orm';
  import { getDb } from '@/lib/db';
  import { screens } from '@/lib/db/schema';
  import { getHub } from '@/lib/ws/hub';
  import { clientEventSchema, type ClientEvent } from '@/lib/ws/protocol';
  import { hashToken, isPairCodeExpired } from '@/lib/domain/pairing';
  ```

  替换为:

  ```ts
  import { loadEnvConfig } from '@next/env';
  loadEnvConfig(process.cwd());

  import http from 'node:http';
  import type { Duplex } from 'node:stream';
  import { WebSocketServer, type WebSocket } from 'ws';
  import { and, asc, eq } from 'drizzle-orm';
  import { getDb, type Db } from '@/lib/db';
  import { getOrgId } from '@/lib/db/org';
  import { agents, orgs, screens } from '@/lib/db/schema';
  import { getHub, type Hub } from '@/lib/ws/hub';
  import { clientEventSchema, type ClientEvent } from '@/lib/ws/protocol';
  import { hashToken, isPairCodeExpired } from '@/lib/domain/pairing';
  import { isElevenAm, localMmdd, localYmd } from '@/lib/domain/birthday';
  import { getSettings } from '@/lib/settings';
  import { buildBirthdayPayload } from '@/lib/domain/celebration';
  ```

  **3b.** 在 `const HELLO_TIMEOUT_MS = 5000;` 之后、`export async function startServer(` 之前插入:

  ```ts
  /**
   * One scheduler tick, exported for direct testing. At 11:00 local time
   * (deployment TZ), broadcasts a birthday celebration for every active member
   * (agent or staff) whose birthday (MM-DD) is today — at most once per day.
   * The dedupe mark is written to orgs BEFORE broadcasting: if the process
   * dies in between we lose one broadcast rather than ever replaying it,
   * and a restart within the same minute stays idempotent.
   */
  export async function runBirthdayTick(db: Db, hub: Hub, now: Date): Promise<void> {
    if (!isElevenAm(now)) return;
    const today = localYmd(now);
    const orgId = await getOrgId(db);
    const [org] = await db.select().from(orgs).where(eq(orgs.id, orgId));
    if (!org || org.lastBirthdayBroadcastDate === today) return;

    const celebrants = await db
      .select()
      .from(agents)
      .where(and(
        eq(agents.orgId, orgId),
        eq(agents.active, true),
        eq(agents.birthday, localMmdd(now)),
      ))
      .orderBy(asc(agents.name));
    if (celebrants.length === 0) return; // no celebrants → leave the mark unset

    await db.update(orgs)
      .set({ lastBirthdayBroadcastDate: today })
      .where(eq(orgs.id, orgId));

    const settings = await getSettings(db, orgId);
    for (const member of celebrants) {
      hub.broadcast({
        type: 'celebration.play',
        celebration: buildBirthdayPayload(
          { id: member.id, name: member.name, photoUrl: member.photoUrl },
          settings,
        ),
      });
    }
  }
  ```

  **3c.** 在 `startServer` 内,把结尾的:

  ```ts
    await new Promise<void>((resolve) => server.listen(port, resolve));
    return server;
  }
  ```

  替换为(interval 挂在 `server.on('upgrade', ...)` 块之后、listen 之前;close 时清理):

  ```ts
    const birthdayTimer = setInterval(() => {
      runBirthdayTick(db, getHub(), new Date()).catch((err) => console.error('[birthday] tick failed:', err));
    }, 60_000);
    server.on('close', () => clearInterval(birthdayTimer));

    await new Promise<void>((resolve) => server.listen(port, resolve));
    return server;
  }
  ```

  说明:`startServer` 里已有 `const db = await getDb();`,tick 直接闭包引用;每分钟一次的 tick 与 `isElevenAm` 的"分钟精确匹配"配合,一天最多命中一次窗口;写标记用的是 drizzle 的 `db.update(orgs).set(...)`,列是 `date mode:'string'`,直接写 `'YYYY-MM-DD'` 字符串。

- [ ] **Step 4: 转绿并回归 server 测试**

  ```bash
  npx vitest run tests/server/birthday-scheduler.test.ts
  npx vitest run tests/server/
  npx tsc --noEmit
  ```

  预期:调度器 7 个用例全绿;`tests/server/` 两个文件(含 ws-integration,验证 interval 不影响服务器启动/关闭、vitest 正常退出)全绿;`tsc` 无输出。

- [ ] **Step 5: Commit**

  ```bash
  git add src/server/bootstrap.ts tests/server/birthday-scheduler.test.ts
  git commit -m "feat: in-process 11am birthday broadcast scheduler"
  ```
### Task 6: Team 管理页(导航改名 + 类型/生日列 + 🎂 手动播报 + Modal 扩展)

依赖:Task 3(agents API 已返回/接受 `role`、`birthday`)与 Task 4(`POST /api/agents/[id]/birthday-broadcast` 已存在)必须已完成。本任务为纯 UI 任务(无单测),采用 实现 → tsc/build → commit 流程。

**Files:**
- Modify: `src/app/admin/(dashboard)/layout.tsx`
- Modify: `src/app/admin/(dashboard)/agents/page.tsx`
- Modify: `src/app/admin/(dashboard)/page.tsx`(仪表盘 agent 下拉排除 staff,见 Step 5b)
- Modify: `src/app/admin/(dashboard)/listings/page.tsx`(同上,见 Step 5b)

设计约束(来自契约,执行时不得偏离):
- 路由路径 `/admin/agents` 不变,只改导航文案与页面标题为 `Team`。
- 🎂 按钮 `aria-label="Play birthday broadcast"` **一字不差**(E2E 依赖该 accessible name)。
- 🎂 挂起守卫复用 `replayingId` 式单值 state(`broadcastingId`),禁用方式与 `togglingId` 一致(任一在途则全部 🎂 禁用),失败 `setError` 透传服务端文案。
- Modal:Type 下拉(Agent/Staff);Birthday 为 Month(01-12)/Day(01-31)两个下拉,首项 `—` 表示清空;提交时组装 `'MM-DD'` 或 `null`;`role === 'staff'` 时隐藏 Anthem 字段(仅隐藏,`anthemUrl` state 不清除,数据保留)。
- 日期合法性只到 `BIRTHDAY_RE` 级别:`02-31` 允许被选出且服务端 regex 放行(regex 允许 31)。设计接受此宽松度,页面**不做**逐月天数联动。
- diff-only PATCH 沿用既有模式,扩展 `role` 与 `birthday`(`birthday` 以 `null` 清空)。
- 按钮 `New agent`、Modal 标题 `New agent`/`Edit agent`、空表文案 `No agents yet.` 维持现文案(契约未要求改动)。

- [ ] **Step 1: 改导航文案 Agents → Team**

  `src/app/admin/(dashboard)/layout.tsx` 中 `NAV` 常量整体替换为(仅 `/admin/agents` 一行的 `label` 变化,`href` 不变):

  ```tsx
  const NAV = [
    { href: '/admin', label: 'Dashboard' },
    { href: '/admin/agents', label: 'Team' },
    { href: '/admin/listings', label: 'Listings' },
    { href: '/admin/announcements', label: 'Announcements' },
    { href: '/admin/goals', label: 'Goals' },
    { href: '/admin/screens', label: 'Screens' },
    { href: '/admin/settings', label: 'Settings' },
  ];
  ```

  文件其余部分(getSession、logout、DashboardLayout)不动。

- [ ] **Step 2: agents/page.tsx —— 类型与模块级常量**

  文件顶部的 `AgentRow` 类型整体替换为(新增 `role`、`birthday` 两个字段,与 Task 3 后 GET /api/agents 返回的行形状一致):

  ```tsx
  type AgentRow = {
    id: string;
    name: string;
    photoUrl: string | null;
    anthemUrl: string | null;
    role: 'agent' | 'staff';
    birthday: string | null;
    active: boolean;
  };
  ```

  紧随其后的 `const UPLOAD_OPTION = 'upload-custom';` 行**下方**新增两个模块级常量(`anthemLabel`、`uploadFile` 保持原样不动):

  ```tsx
  const UPLOAD_OPTION = 'upload-custom';

  // Birthday dropdown options — zero-padded to match the server's 'MM-DD' format.
  // Day range is a flat 01-31 (no per-month clamping); the server's BIRTHDAY_RE is
  // equally permissive by design, so e.g. 02-31 is selectable and accepted.
  const MONTHS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
  const DAYS = Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0'));
  ```

- [ ] **Step 3: agents/page.tsx —— 新增 state 与 openCreate/openEdit/save/broadcastBirthday**

  组件内 state 声明区,在现有这一行:

  ```tsx
  const [togglingId, setTogglingId] = useState<string | null>(null);
  ```

  之后插入四行(其余 state 与 ref 不动):

  ```tsx
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [broadcastingId, setBroadcastingId] = useState<string | null>(null);
  const [role, setRole] = useState<'agent' | 'staff'>('agent');
  const [birthdayMonth, setBirthdayMonth] = useState('');
  const [birthdayDay, setBirthdayDay] = useState('');
  ```

  `openCreate` 与 `openEdit` 整体替换为:

  ```tsx
  function openCreate() {
    setEditingAgent(null);
    setName('');
    setPhotoUrl('');
    setAnthemUrl('');
    setRole('agent');
    setBirthdayMonth('');
    setBirthdayDay('');
    setError(null);
    setModalOpen(true);
  }

  function openEdit(agent: AgentRow) {
    setEditingAgent(agent);
    setName(agent.name);
    setPhotoUrl(agent.photoUrl ?? '');
    setAnthemUrl(agent.anthemUrl ?? '');
    setRole(agent.role);
    const [bm, bd] = agent.birthday ? agent.birthday.split('-') : ['', ''];
    setBirthdayMonth(bm ?? '');
    setBirthdayDay(bd ?? '');
    setError(null);
    setModalOpen(true);
  }
  ```

  `save` 整体替换为(diff-only PATCH 扩展 `role`/`birthday`;POST 总是带 `role`,`birthday` 仅在组装出值时携带——createSchema 的 birthday 是 optional 非 nullable):

  ```tsx
  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      // Both dropdowns picked → 'MM-DD'; either left on '—' → null (cleared).
      const birthday = birthdayMonth && birthdayDay ? `${birthdayMonth}-${birthdayDay}` : null;
      let res: Response;
      if (editingAgent) {
        // Diff-only PATCH: only send fields that actually changed from the agent
        // being edited. Cleared photo/anthem/birthday fields are sent as explicit
        // `null` (the API supports clearing that way); untouched fields are omitted
        // so an unrelated field's empty-string state never trips server validation.
        const patch: Record<string, string | null> = {};
        if (name !== editingAgent.name) patch.name = name;
        if (photoUrl !== (editingAgent.photoUrl ?? '')) patch.photoUrl = photoUrl || null;
        if (anthemUrl !== (editingAgent.anthemUrl ?? '')) patch.anthemUrl = anthemUrl || null;
        if (role !== editingAgent.role) patch.role = role;
        if (birthday !== editingAgent.birthday) patch.birthday = birthday;
        if (Object.keys(patch).length === 0) {
          setModalOpen(false);
          return;
        }
        res = await fetch(`/api/agents/${editingAgent.id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(patch),
        });
      } else {
        res = await fetch('/api/agents', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            name,
            role,
            ...(photoUrl ? { photoUrl } : {}),
            ...(anthemUrl ? { anthemUrl } : {}),
            ...(birthday ? { birthday } : {}),
          }),
        });
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => ({ error: 'Failed to save agent' }))) as { error?: string };
        setError(body.error ?? 'Failed to save agent');
        return;
      }
      setModalOpen(false);
      await load();
    } finally {
      setSaving(false);
    }
  }
  ```

  在 `toggleActive` 函数之后、`const isCustomAnthem = ...` 之前插入新函数(单值挂起守卫与 stale-finally 保护和 `toggleActive`/`replay` 同款):

  ```tsx
  async function broadcastBirthday(agent: AgentRow) {
    setError(null);
    setBroadcastingId(agent.id);
    try {
      const res = await fetch(`/api/agents/${agent.id}/birthday-broadcast`, { method: 'POST' });
      if (!res.ok) {
        const body = (await res
          .json()
          .catch(() => ({ error: 'Failed to play birthday broadcast' }))) as { error?: string };
        setError(body.error ?? 'Failed to play birthday broadcast');
      }
    } finally {
      // Only clear the pending flag if no other broadcast has started in the
      // meantime — same stale-finally guard as toggleActive.
      setBroadcastingId((cur) => (cur === agent.id ? null : cur));
    }
  }
  ```

- [ ] **Step 4: agents/page.tsx —— 列表 JSX(标题、Type/Birthday 列、🎂 按钮)**

  return 中从 `<div className="mb-6 flex items-center justify-between">` 起到 `</Table>` 止的整段替换为(标题 Agents → Team;headers 由 5 列变 7 列;空行 `colSpan` 5 → 7;Actions 列 Edit 旁新增 🎂 按钮,`aria-label` 一字不差):

  ```tsx
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold text-ink">Team</h1>
        <Button onClick={openCreate}>New agent</Button>
      </div>

      <Table headers={['Photo', 'Name', 'Type', 'Birthday', 'Anthem', 'Active', 'Actions']}>
        {agents.map((a) => (
          <tr key={a.id} className="text-ink">
            <td className="px-3 py-2">
              {a.photoUrl ? (
                <img src={a.photoUrl} alt={a.name} className="h-10 w-10 rounded-full object-cover" />
              ) : (
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-panel-2 text-sm text-muted">
                  {a.name.charAt(0).toUpperCase()}
                </span>
              )}
            </td>
            <td className="px-3 py-2">{a.name}</td>
            <td className="px-3 py-2">
              {a.role === 'staff' ? (
                <span className="rounded bg-panel-2 px-2 py-0.5 text-xs font-medium text-muted">
                  Staff
                </span>
              ) : (
                <span className="rounded bg-neon/10 px-2 py-0.5 text-xs font-medium text-neon">
                  Agent
                </span>
              )}
            </td>
            <td className="px-3 py-2 text-muted">{a.birthday ?? '—'}</td>
            <td className="px-3 py-2 text-muted">{anthemLabel(a.anthemUrl)}</td>
            <td className="px-3 py-2">
              <input
                type="checkbox"
                checked={a.active}
                onChange={() => toggleActive(a)}
                disabled={togglingId !== null}
                className="h-4 w-4 accent-neon disabled:cursor-not-allowed disabled:opacity-50"
              />
            </td>
            <td className="px-3 py-2">
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
            </td>
          </tr>
        ))}
        {agents.length === 0 && (
          <tr>
            <td colSpan={7} className="px-3 py-6 text-center text-muted">
              No agents yet.
            </td>
          </tr>
        )}
      </Table>
  ```

  紧随其后的 `{error && !modalOpen && <p className="mt-3 text-sm text-red-400">{error}</p>}` 保持不动(🎂 失败文案即由它展示)。

- [ ] **Step 5: agents/page.tsx —— Modal JSX(Type 下拉、Birthday 双下拉、staff 隐藏 Anthem)**

  return 中从 `<Modal open={modalOpen} ...>` 起到 `</Modal>` 止的整段替换为(Name 后加 Type;Photo 后加 Birthday;Anthem 的 Field、隐藏 file input 与 Uploading 提示整体包进 `role === 'agent'` 条件——staff 时仅隐藏,`anthemUrl` state 保留不清除):

  ```tsx
      <Modal open={modalOpen} onClose={closeModal} title={editingAgent ? 'Edit agent' : 'New agent'}>
        <form onSubmit={save} className="space-y-4">
          <Field label="Name">
            <TextInput value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          </Field>
          <Field label="Type">
            <Select value={role} onChange={(e) => setRole(e.target.value as 'agent' | 'staff')}>
              <option value="agent">Agent</option>
              <option value="staff">Staff</option>
            </Select>
          </Field>
          <Field label="Photo">
            <div className="flex items-center gap-3">
              {photoUrl ? (
                <img src={photoUrl} alt="Agent" className="h-12 w-12 rounded-full object-cover" />
              ) : (
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-panel-2 text-muted">
                  ?
                </span>
              )}
              <input
                type="file"
                accept=".jpg,.jpeg,.png,.webp"
                onChange={onPhotoChange}
                disabled={uploadingPhoto}
                className="text-sm text-muted disabled:cursor-not-allowed disabled:opacity-50"
              />
              {uploadingPhoto && <span className="text-sm text-muted">Uploading…</span>}
            </div>
          </Field>
          <Field label="Birthday">
            <div className="flex gap-2">
              <Select
                aria-label="Birthday month"
                value={birthdayMonth}
                onChange={(e) => setBirthdayMonth(e.target.value)}
              >
                <option value="">—</option>
                {MONTHS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </Select>
              <Select
                aria-label="Birthday day"
                value={birthdayDay}
                onChange={(e) => setBirthdayDay(e.target.value)}
              >
                <option value="">—</option>
                {DAYS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </Select>
            </div>
          </Field>
          {role === 'agent' && (
            <>
              <Field label="Anthem">
                <Select value={anthemUrl} onChange={(e) => onAnthemSelect(e.target.value)}>
                  <option value="">Default (org anthem)</option>
                  {BUILTIN_ANTHEMS.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                  {isCustomAnthem && <option value={anthemUrl}>Custom upload</option>}
                  <option value={UPLOAD_OPTION}>Upload custom…</option>
                </Select>
              </Field>
              <input
                ref={anthemFileRef}
                type="file"
                accept=".mp3,.m4a,.ogg"
                onChange={onAnthemFileChange}
                disabled={uploadingAnthem}
                className="hidden"
              />
              {uploadingAnthem && <p className="text-sm text-muted">Uploading anthem…</p>}
            </>
          )}
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={closeModal}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || uploadingPhoto || uploadingAnthem}>
              {editingAgent ? 'Save changes' : 'Create agent'}
            </Button>
          </div>
        </form>
      </Modal>
  ```

  文件其余部分(`uploadFile`、`anthemLabel`、`load`、`closeModal`、`onPhotoChange`、`onAnthemSelect`、`onAnthemFileChange`、`toggleActive`、`isCustomAnthem`)全部保持原样。

- [ ] **Step 5b: 仪表盘与 Listings 页的 agent 下拉排除 staff(规格 §11:staff 不出现在任何下拉)**

  Task 3 之后 `GET /api/agents` 会返回 staff 行,这两个页面的销售员选择下拉若不加 role 过滤,staff 会成为"可选但提交必 400"的选项。两个文件做同构小改(先 Read 现状再改):

  **5b-1. `src/app/admin/(dashboard)/page.tsx`(仪表盘快速录入 + 编辑成交 Modal)**

  - 该文件本地的 agent 行类型(含 `id/name/active` 的那个 type)追加字段 `role: 'agent' | 'staff';`。
  - 找到派生列表:

  ```ts
  const activeAgents = agents.filter((a) => a.active);
  ```

  替换为:

  ```ts
  const activeAgents = agents.filter((a) => a.active && a.role === 'agent');
  ```

  - 编辑 Modal 的回填兜底:现有 `editingInactiveAgent` 逻辑是"editing 行的 agent 已 inactive 则追加一个禁用选项"。把它的判定条件从"该 agent inactive"放宽为"该 agent 不在过滤后的 `activeAgents` 列表中"(覆盖 inactive **或** 后来被改成 staff 两种情况),追加选项的 label 后缀统一为 `(unavailable)`。变量名可改为 `editingUnavailableAgent`,实现保持原模式(从全量 `agents` 里按 `editing.agentId` 查找)。

  **5b-2. `src/app/admin/(dashboard)/listings/page.tsx`(房源页 agent 选择器)**

  与 5b-1 完全同构:本地 agent 行类型加 `role`;`agents.filter((a) => a.active)` 改为 `a.active && a.role === 'agent'`;编辑回填兜底条件同样放宽为"不在过滤后列表中",label 后缀 `(unavailable)`。

  改完后本步不单独验证,进入 Step 6 的 tsc/build 统一把关(两文件类型如与实际 GET 返回不符,tsc 会在此暴露)。

- [ ] **Step 6: 类型检查与生产构建**

  ```bash
  cd "c:/Users/andyl/Desktop/工作文档/TV SaaS"
  npx tsc --noEmit
  ```

  预期:无任何输出,退出码 0。

  ```bash
  npm run build
  ```

  预期:输出包含 `✓ Compiled successfully` 与路由表(含 `/admin/agents`),退出码 0,无类型或构建错误。

- [ ] **Step 7: commit**

  ```bash
  git add "src/app/admin/(dashboard)/layout.tsx" "src/app/admin/(dashboard)/agents/page.tsx" "src/app/admin/(dashboard)/page.tsx" "src/app/admin/(dashboard)/listings/page.tsx"
  git commit -m "feat: team page with role, birthday and manual birthday broadcast"
  ```

---

### Task 7: E2E 生日播报用例与全量回归

依赖:Task 1-6 全部完成。E2E 环境由 `e2e/start-server.ts` 启动(PGLite 内存库 + `seed(db, { demo: true })`),demo seed 含四名 active 销售员(默认 `role='agent'`),因此 Team 页首行必有可用的 🎂 按钮;手动播报端点不校验生日是否今天,seed 无需生日数据。`pairTv` helper 已存在于 `e2e/tv-flow.spec.ts`,原样复用,不改动。

**Files:**
- Modify: `e2e/tv-flow.spec.ts`(文件末尾追加 1 个用例)
- Test: 全量回归(tsc / vitest / build / e2e)

- [ ] **Step 1: 追加 E2E 用例**

  在 `e2e/tv-flow.spec.ts` 文件末尾(`'tv shows offline badge and keeps rotating while disconnected'` 用例的收尾 `});` 之后)追加以下完整用例。定位文本 `HAPPY BIRTHDAY` 与按钮 accessible name `Play birthday broadcast` 均为契约钉死值,不得改动:

  ```ts
  test('manual birthday broadcast shows on tv', async ({ browser }) => {
    test.setTimeout(120_000); // login+pair+18s celebration leaves little room in the default 60s
    const { adminPage, tvPage } = await pairTv(browser, 'E2E TV 3');

    // 5. Admin fires a manual birthday broadcast from the Team page. The endpoint
    // ignores the actual birthday date, so any seeded active member works.
    await adminPage.goto('/admin/agents');
    const broadcastBtn = adminPage
      .getByRole('button', { name: 'Play birthday broadcast' })
      .first();
    await expect(broadcastBtn).toBeVisible({ timeout: 10000 });
    await broadcastBtn.click();

    // 6. TV interrupts the carousel with the birthday celebration.
    await expect(tvPage.getByText('HAPPY BIRTHDAY')).toBeVisible({ timeout: 15000 });

    // 7. Celebration (default 18s) finishes and the carousel resumes.
    await expect(tvPage.getByText('HAPPY BIRTHDAY')).toBeHidden({ timeout: 30000 });
    await expect(tvPage.getByText(SLIDE_TITLE_RE).first()).toBeVisible({
      timeout: 10000,
    });

    await adminPage.close();
    await tvPage.close();
  });
  ```

- [ ] **Step 2: 单跑新用例,确认通过**

  实现已在 Task 1-6 完成,本用例应当首跑即绿:

  ```bash
  cd "c:/Users/andyl/Desktop/工作文档/TV SaaS"
  npx playwright test -g "manual birthday broadcast"
  ```

  预期:`1 passed`,退出码 0。若失败:按报错回修对应实现任务(常见根因:`CelebrationOverlay` birthday 分支缺少精确文本 `HAPPY BIRTHDAY`(Task 2)、🎂 按钮 `aria-label` 不是 `Play birthday broadcast`(Task 6)、端点 404/未广播(Task 4))。**不得**修改测试中的契约钉死文案来迁就实现。

- [ ] **Step 3: commit 测试**

  ```bash
  git add e2e/tv-flow.spec.ts
  git commit -m "test: e2e manual birthday broadcast interrupts tv carousel"
  ```

- [ ] **Step 4: 全量回归(四项全部必须通过)**

  依次执行以下四条命令,任何一项失败都必须修复后从第 1 项重跑,直至一次连续全绿:

  1. 类型检查:

     ```bash
     npx tsc --noEmit
     ```

     预期:无任何输出,退出码 0。

  2. 全量单元/集成测试:

     ```bash
     npx vitest run
     ```

     预期:所有测试文件通过,退出码 0,末尾摘要形如 `Test Files  N passed (N)` / `Tests  M passed (M)`,**不得出现任何 failed/skipped-by-error**。N/M 为 Task 1-5 增补后的实际总数,执行时如实记录并在最终汇报中给出真实数字。

  3. 生产构建:

     ```bash
     npm run build
     ```

     预期:`✓ Compiled successfully` 与完整路由表(含 `/api/agents/[id]/birthday-broadcast`),退出码 0。

  4. 全量 E2E(playwright 自起 e2e server,勿手动占用 3344 端口):

     ```bash
     npm run test:e2e
     ```

     预期:`4 passed`,退出码 0——四个用例分别为 `pairing code shows on tv`、`sale entry triggers celebration on tv`、`tv shows offline badge and keeps rotating while disconnected`、`manual birthday broadcast shows on tv`。

- [ ] **Step 5: 回归产生的修复(如有)单独 commit**

  若 Step 4 中任何修复改动了实现文件,按所属域给 conventional commit(例如 `fix: <scope> <what>`),仅提交实际修改的文件路径;若四项一次全绿则本步骤跳过,无需空 commit。
