# TV Sales Leaderboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建类 Spinify 的房产销售电视展示系统:游戏电竞风排行榜全天候轮播,新成交实时全屏庆祝(销售员照片 + 专属主题曲),浏览器配对码接入电视,管理员后台录入与配置;单租户先用,数据模型预留多租户。

**Architecture:** Next.js(App Router)全栈单体 + 自定义 Node 服务器同端口承载 `ws` WebSocket Hub;PostgreSQL(开发/测试用内嵌 PGlite,生产用 `DATABASE_URL`)+ Drizzle ORM;文件存储本地磁盘/Cloudflare R2 双驱动;所有表带 `org_id`。电视端为单页应用:配对 → 全屏轮播 → WebSocket 实时打断庆祝。

**Tech Stack:** Next.js 15 / React 19 / TypeScript strict / Tailwind CSS 3 / Framer Motion / Drizzle ORM / PGlite + node-postgres / ws / iron-session + bcryptjs / zod / Vitest / Playwright。

**权威参考文档(执行每个任务前先读):**
- 设计规格:`docs/superpowers/specs/2026-08-17-tv-sales-leaderboard-design.md`
- 本计划各任务内的代码即为权威实现;跨任务共享的签名/字段名/路由/JSON 形状在先行任务中定义,后续任务必须与之一致,不得改名。

**执行约定:**
- 环境:Windows + Git Bash,命令在项目根目录执行;Node ≥ 20。
- 仓库已 `git init`(main 分支)且已有 `.gitignore` 与 `docs/`;按各任务的 commit 步骤频繁提交,conventional commits。
- 依赖顺序:1 → 2 → 3 → {4,5,6,7} → 8/9 → 10/11/12/13 → 14 → 15 → 16/17 → 18/19 → 20 → 21–24 → 25 → 26 → 27。注意 Task 4/5/7 都依赖 Task 3 的 `types.ts`/`hub.ts`,必须在 3 之后;**一律按编号顺序执行**,不要并行。
- `tests/helpers/db.ts` 会分三步演进:Task 2 写临时版(占位密码哈希、无 resetHub)→ Task 3 增补 resetHub → Task 7 覆盖为最终版(真 bcrypt 哈希)。这是有意设计,不是遗漏。

---
### Task 1: 项目脚手架

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.ts`
- Create: `drizzle.config.ts`
- Create: `vitest.config.ts`
- Create: `tailwind.config.ts`
- Create: `postcss.config.mjs`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `public/.gitkeep`
- Create: `src/app/globals.css`
- Create: `src/app/layout.tsx`
- Create: `src/app/page.tsx`
- Test: 无单测;`npm run build` 成功即验收(契约 §19)

本任务不写任何业务逻辑,只搭建可构建的 Next.js 15 骨架。所有配置文件内容来自契约 §1/§3,**必须逐字照抄**。

- [ ] **Step 1: 初始化 git 仓库与目录骨架**

  在项目根目录执行(Git Bash):

  ```bash
  git init
  mkdir -p src/app public
  touch public/.gitkeep
  ```

  预期输出:`Initialized empty Git repository in ...`。若目录已是 git 仓库,跳过 `git init`。若 `git config user.name` / `user.email` 为空,先配置一次,否则后续 commit 会失败。

- [ ] **Step 2: 写 package.json(契约 §1 权威原文)**

  创建 `package.json`:

  ```json
  {
    "name": "tv-sales-leaderboard",
    "private": true,
    "scripts": {
      "dev": "tsx watch --clear-screen=false server.ts",
      "build": "next build",
      "start": "cross-env NODE_ENV=production tsx server.ts",
      "db:generate": "drizzle-kit generate",
      "db:seed": "tsx src/lib/db/run-seed.ts",
      "test": "vitest run",
      "test:watch": "vitest",
      "test:e2e": "playwright test"
    },
    "dependencies": {
      "@aws-sdk/client-s3": "^3.700.0",
      "@electric-sql/pglite": "^0.3.0",
      "@next/env": "^15.3.0",
      "bcryptjs": "^3.0.2",
      "cross-env": "^7.0.3",
      "drizzle-orm": "^0.44.0",
      "framer-motion": "^12.0.0",
      "iron-session": "^8.0.4",
      "next": "^15.3.0",
      "pg": "^8.16.0",
      "react": "^19.1.0",
      "react-dom": "^19.1.0",
      "tsx": "^4.19.0",
      "ws": "^8.18.0",
      "zod": "^3.25.0"
    },
    "devDependencies": {
      "@playwright/test": "^1.50.0",
      "@types/node": "^22.0.0",
      "@types/pg": "^8.11.0",
      "@types/react": "^19.0.0",
      "@types/react-dom": "^19.0.0",
      "@types/ws": "^8.5.0",
      "autoprefixer": "^10.4.20",
      "drizzle-kit": "^0.31.0",
      "postcss": "^8.5.0",
      "tailwindcss": "^3.4.17",
      "typescript": "^5.8.0",
      "vitest": "^3.0.0"
    }
  }
  ```

  注意:`dev`/`start` 脚本引用的 `server.ts` 要到 Task 14 才存在,本任务只用 `npm run build`,不受影响。

- [ ] **Step 3: 写 tsconfig.json 与 next.config.ts(契约 §3 权威原文)**

  创建 `tsconfig.json`:

  ```json
  {
    "compilerOptions": {
      "target": "ES2022",
      "lib": ["dom", "dom.iterable", "esnext"],
      "allowJs": true,
      "skipLibCheck": true,
      "strict": true,
      "noEmit": true,
      "esModuleInterop": true,
      "module": "esnext",
      "moduleResolution": "bundler",
      "resolveJsonModule": true,
      "isolatedModules": true,
      "jsx": "preserve",
      "incremental": true,
      "plugins": [{ "name": "next" }],
      "paths": { "@/*": ["./src/*"] }
    },
    "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
    "exclude": ["node_modules"]
  }
  ```

  创建 `next.config.ts`:

  ```ts
  import type { NextConfig } from 'next';

  const nextConfig: NextConfig = {
    eslint: { ignoreDuringBuilds: true },
    images: { unoptimized: true },
  };

  export default nextConfig;
  ```

- [ ] **Step 4: 写 drizzle.config.ts 与 vitest.config.ts(契约 §3 权威原文)**

  创建 `drizzle.config.ts`:

  ```ts
  import { defineConfig } from 'drizzle-kit';

  export default defineConfig({
    dialect: 'postgresql',
    schema: './src/lib/db/schema.ts',
    out: './drizzle',
  });
  ```

  创建 `vitest.config.ts`(`fileParallelism: false` 是刻意的:hub 是 globalThis 单例、各测试各建内存库,串行更稳):

  ```ts
  import { defineConfig } from 'vitest/config';
  import path from 'node:path';

  export default defineConfig({
    test: {
      environment: 'node',
      include: ['tests/**/*.test.ts'],
      testTimeout: 20000,
      fileParallelism: false,
    },
    resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  });
  ```

- [ ] **Step 5: 写 tailwind.config.ts 与 postcss.config.mjs(契约 §3 权威原文)**

  创建 `tailwind.config.ts`:

  ```ts
  import type { Config } from 'tailwindcss';

  export default {
    content: ['./src/**/*.{ts,tsx}'],
    theme: {
      extend: {
        colors: {
          bg: '#0a0e1a',
          panel: '#101828',
          'panel-2': '#16203a',
          neon: '#00e5ff',
          'neon-purple': '#a020f0',
          money: '#00ff9d',
          gold: '#ffc800',
          silver: '#b8c2d8',
          bronze: '#cd7f32',
          ink: '#dfe6f2',
          muted: '#8fa3c8',
        },
        fontFamily: {
          display: ['var(--font-orbitron)', 'sans-serif'],
          heading: ['var(--font-rajdhani)', 'sans-serif'],
          body: ['var(--font-inter)', 'sans-serif'],
        },
      },
    },
    plugins: [],
  } satisfies Config;
  ```

  创建 `postcss.config.mjs`:

  ```js
  export default { plugins: { tailwindcss: {}, autoprefixer: {} } };
  ```

- [ ] **Step 6: 写 .gitignore 与 .env.example**

  **覆盖**已有的 `.gitignore` 为以下合并版(保留仓库原有的 `.superpowers/` 等条目;`next-env.d.ts` 由 build 自动生成、`.data/` 是 PGlite 落盘目录、`storage/` 是本地上传目录,均不入库):

  ```
  node_modules/
  .next/
  out/
  .data/
  storage/
  next-env.d.ts
  *.tsbuildinfo
  .env
  .env.*
  !.env.example
  .superpowers/
  test-results/
  playwright-report/
  *.log
  .DS_Store
  ```

  创建 `.env.example`(契约 §3 权威原文):

  ```
  # Server
  PORT=3000
  TZ=Australia/Sydney
  SESSION_SECRET=change-me-to-a-random-string-at-least-32-chars

  # Database — leave DATABASE_URL unset to use embedded PGlite (dev). Set for PostgreSQL (prod).
  # DATABASE_URL=postgres://user:pass@host:5432/dbname
  # PGLITE_MEMORY=1   # tests only: in-memory db

  # First admin (created by `npm run db:seed`)
  ADMIN_EMAIL=admin@example.com
  ADMIN_PASSWORD=admin1234

  # Storage: local | s3
  STORAGE_DRIVER=local
  # R2_ENDPOINT=https://<account>.r2.cloudflarestorage.com
  # R2_BUCKET=tv-saas
  # R2_ACCESS_KEY_ID=
  # R2_SECRET_ACCESS_KEY=
  # R2_PUBLIC_BASE_URL=https://files.example.com
  ```

- [ ] **Step 7: 写 src/app/globals.css 与 src/app/layout.tsx(契约 §3 权威原文)**

  创建 `src/app/globals.css`:

  ```css
  @tailwind base;
  @tailwind components;
  @tailwind utilities;

  :root { color-scheme: dark; }
  body { @apply bg-bg text-ink font-body; }

  .neon-text { text-shadow: 0 0 8px currentColor, 0 0 24px currentColor; }
  .neon-border { box-shadow: 0 0 8px rgba(0, 229, 255, 0.6), inset 0 0 8px rgba(0, 229, 255, 0.15); }
  ```

  创建 `src/app/layout.tsx`:

  ```tsx
  import type { Metadata } from 'next';
  import { Inter, Orbitron, Rajdhani } from 'next/font/google';
  import './globals.css';

  const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
  const orbitron = Orbitron({ subsets: ['latin'], variable: '--font-orbitron' });
  const rajdhani = Rajdhani({ subsets: ['latin'], weight: ['500', '700'], variable: '--font-rajdhani' });

  export const metadata: Metadata = { title: 'Sales Champions TV' };

  export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
      <html lang="en" className={`${inter.variable} ${orbitron.variable} ${rajdhani.variable}`}>
        <body>{children}</body>
      </html>
    );
  }
  ```

- [ ] **Step 8: 写首页 src/app/page.tsx**

  简单入口页:标题 + 两个链接(`/admin` 到 Task 21、`/tv` 到 Task 20 才有页面,现在点进去 404 是预期的):

  ```tsx
  import Link from 'next/link';

  export default function HomePage() {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-12">
        <h1 className="neon-text text-center font-display text-5xl tracking-widest text-neon">
          SALES CHAMPIONS TV
        </h1>
        <div className="flex gap-8">
          <Link
            href="/tv"
            className="neon-border rounded-xl bg-panel px-10 py-5 font-heading text-2xl text-neon transition hover:bg-panel-2"
          >
            TV DISPLAY
          </Link>
          <Link
            href="/admin"
            className="rounded-xl border border-neon-purple bg-panel px-10 py-5 font-heading text-2xl text-neon-purple transition hover:bg-panel-2"
          >
            ADMIN
          </Link>
        </div>
      </main>
    );
  }
  ```

- [ ] **Step 9: 安装依赖**

  ```bash
  npm install
  ```

  预期:生成 `package-lock.json` 与 `node_modules/`,输出类似 `added 700+ packages`。少量 peer/deprecated 警告可忽略;不允许出现 `ERESOLVE` 错误(若出现,说明 package.json 抄写有误,回查 Step 2)。

- [ ] **Step 10: 构建验证**

  ```bash
  npm run build
  ```

  预期输出包含 `✓ Compiled successfully` 与路由表:

  ```
  Route (app)
  ┌ ○ /
  └ ○ /_not-found
  ```

  说明:本次 build 会自动生成 `next-env.d.ts`(已被 .gitignore 忽略,不提交)并完成 TypeScript 严格检查。`next/font` 在构建期从 Google 下载并自托管 Inter/Orbitron/Rajdhani,因此**这一步需要联网**;运行时不依赖外网字体服务,符合规格 §7。

- [ ] **Step 11: 提交**

  ```bash
  git add package.json package-lock.json tsconfig.json next.config.ts drizzle.config.ts vitest.config.ts tailwind.config.ts postcss.config.mjs .gitignore .env.example public/.gitkeep src/app/globals.css src/app/layout.tsx src/app/page.tsx
  git commit -m "chore: scaffold Next.js app with configs and landing page"
  ```

---

### Task 2: 数据库层

**Files:**
- Create: `src/lib/db/schema.ts`(契约 §4 权威原文)
- Create: `src/lib/db/index.ts`(契约 §4 权威原文)
- Create: `src/lib/db/org.ts`(契约 §4 权威原文)
- Create: `src/lib/db/seed.ts`
- Create: `src/lib/db/run-seed.ts`
- Create: `drizzle/`(由 `npx drizzle-kit generate` 生成的迁移,提交入库)
- Create: `tests/helpers/db.ts`(临时版本,见 Step 1 说明)
- Test: `tests/db.test.ts`

依赖 Task 1。TDD:先写 helper 与失败测试,再实现 schema/驱动工厂,生成迁移后转绿;seed 同样先写失败测试再实现。

**关于 tests/helpers/db.ts 的临时版本**:契约 §4 的权威版 import 了 `resetHub`(Task 3 的 `@/lib/ws/hub`)与 `hashPassword`(Task 7 的 `@/lib/auth/password`),这两个模块现在还不存在,且禁止提前创建存根。因此本任务写一个**不含这两个 import** 的临时版:`freshDb()` 暂不调 `resetHub()`,`seedBasics()` 暂用固定字符串 `'placeholder-hash'` 作密码哈希。Task 3 与 Task 7 各有一个 Modify 步骤把它补全成权威版(此衔接契约已排定)。临时版的其余每一行都与权威版逐字一致,保证后续 diff 最小。

- [ ] **Step 1: 写 tests/helpers/db.ts(临时版)**

  创建 `tests/helpers/db.ts`:

  ```ts
  // PROVISIONAL VERSION (Task 2).
  // Two follow-up edits are already scheduled — do not "fix" them here:
  //   - Task 3 adds `import { resetHub } from '@/lib/ws/hub';` and calls `resetHub()` inside freshDb().
  //   - Task 7 adds `import { hashPassword } from '@/lib/auth/password';` and replaces the
  //     'placeholder-hash' literal below with `await hashPassword(adminPassword)`.
  // Until Task 7, the stored hash is a fixed placeholder, so password login against this
  // user is not testable yet — auth tests only arrive with Task 7.
  import { getDb, resetDb, type Db } from '@/lib/db';
  import { resetOrgCache } from '@/lib/db/org';
  import { orgs, users, agents } from '@/lib/db/schema';

  /** Fresh in-memory database (and clean hub/org caches) for each test file/case. */
  export async function freshDb(): Promise<Db> {
    process.env.PGLITE_MEMORY = '1';
    delete process.env.DATABASE_URL;
    await resetDb();
    resetOrgCache();
    return getDb();
  }

  export type Basics = { orgId: string; adminEmail: string; adminPassword: string; agentId: string };

  /** org + admin(admin@test.dev / secret123)+ 一个销售员 Alice。 */
  export async function seedBasics(db: Db): Promise<Basics> {
    const orgId = crypto.randomUUID();
    await db.insert(orgs).values({ id: orgId, name: 'Test Agency' });
    const adminEmail = 'admin@test.dev';
    const adminPassword = 'secret123';
    await db.insert(users).values({
      id: crypto.randomUUID(), orgId, email: adminEmail,
      passwordHash: 'placeholder-hash', name: 'Admin',
    });
    const agentId = crypto.randomUUID();
    await db.insert(agents).values({ id: agentId, orgId, name: 'Alice Ng' });
    return { orgId, adminEmail, adminPassword, agentId };
  }
  ```

- [ ] **Step 2: 写失败测试 tests/db.test.ts(第一版:schema 往返)**

  创建 `tests/db.test.ts`:

  ```ts
  import { describe, it, expect, beforeEach } from 'vitest';
  import { eq } from 'drizzle-orm';
  import { freshDb, seedBasics } from './helpers/db';
  import type { Db } from '@/lib/db';
  import { getOrgId } from '@/lib/db/org';
  import { agents, sales } from '@/lib/db/schema';

  describe('database layer', () => {
    let db: Db;

    beforeEach(async () => {
      db = await freshDb();
    });

    it('runs migrations and round-trips org, agent and sale', async () => {
      const { orgId, agentId } = await seedBasics(db);
      const saleId = crypto.randomUUID();
      await db.insert(sales).values({
        id: saleId,
        orgId,
        agentId,
        address: '1 Test Street, Testville',
        salePriceCents: 150000000,
        gciCents: 3000000,
        saleDate: '2026-08-15',
      });

      const rows = await db.select().from(sales).where(eq(sales.id, saleId));
      expect(rows).toHaveLength(1);
      expect(rows[0].agentId).toBe(agentId);
      expect(rows[0].salePriceCents).toBe(150000000);
      expect(rows[0].gciCents).toBe(3000000);
      expect(rows[0].saleDate).toBe('2026-08-15');
      expect(rows[0].createdAt).toBeInstanceOf(Date);
    });

    it('getOrgId resolves the first org', async () => {
      const { orgId } = await seedBasics(db);
      expect(await getOrgId(db)).toBe(orgId);
    });

    it('freshDb gives each test an isolated database', async () => {
      const agentRows = await db.select().from(agents);
      expect(agentRows).toHaveLength(0);
    });
  });
  ```

- [ ] **Step 3: 运行测试,确认按预期失败**

  ```bash
  npx vitest run tests/db.test.ts
  ```

  预期 **FAIL**,报模块解析错误(实现文件尚不存在):

  ```
  Error: Failed to resolve import "@/lib/db" from "tests/helpers/db.ts". Does the file exist?
  ```

- [ ] **Step 4: 写 src/lib/db/schema.ts(契约 §4 权威原文)**

  创建 `src/lib/db/schema.ts`:

  ```ts
  import {
    pgTable, text, integer, bigint, boolean, timestamp, date, jsonb, uniqueIndex,
  } from 'drizzle-orm/pg-core';

  export const orgs = pgTable('orgs', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  });

  export const users = pgTable('users', {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull().references(() => orgs.id),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  }, (t) => [uniqueIndex('users_email_idx').on(t.email)]);

  export const agents = pgTable('agents', {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull().references(() => orgs.id),
    name: text('name').notNull(),
    photoUrl: text('photo_url'),
    anthemUrl: text('anthem_url'),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  });

  export const sales = pgTable('sales', {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull().references(() => orgs.id),
    agentId: text('agent_id').notNull().references(() => agents.id),
    address: text('address').notNull(),
    salePriceCents: bigint('sale_price_cents', { mode: 'number' }).notNull(),
    gciCents: bigint('gci_cents', { mode: 'number' }).notNull(),
    saleDate: date('sale_date', { mode: 'string' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  });

  export const listings = pgTable('listings', {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull().references(() => orgs.id),
    agentId: text('agent_id').notNull().references(() => agents.id),
    address: text('address').notNull(),
    listPriceCents: bigint('list_price_cents', { mode: 'number' }).notNull(),
    photoUrl: text('photo_url'),
    listedDate: date('listed_date', { mode: 'string' }).notNull(),
    status: text('status').notNull().default('active'), // 'active' | 'sold' | 'withdrawn'
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  });

  export const screens = pgTable('screens', {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull().references(() => orgs.id),
    name: text('name').notNull().default('Unnamed TV'),
    deviceTokenHash: text('device_token_hash'),
    pairCode: text('pair_code'),
    pairCodeExpiresAt: timestamp('pair_code_expires_at', { withTimezone: true }),
    status: text('status').notNull().default('pending'), // 'pending' | 'paired'
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  }, (t) => [uniqueIndex('screens_device_token_hash_idx').on(t.deviceTokenHash)]);

  export const announcements = pgTable('announcements', {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull().references(() => orgs.id),
    title: text('title').notNull(),
    body: text('body'),
    imageUrl: text('image_url'),
    enabled: boolean('enabled').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  });

  export const goals = pgTable('goals', {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull().references(() => orgs.id),
    metric: text('metric').notNull(), // 'sales_count' | 'gci' | 'listings'
    targetValue: bigint('target_value', { mode: 'number' }).notNull(), // gci 目标为 cents,其余为个数
    period: text('period').notNull(), // 'month' | 'quarter'
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  });

  export const settings = pgTable('settings', {
    orgId: text('org_id').primaryKey().references(() => orgs.id),
    data: jsonb('data').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  });
  ```

- [ ] **Step 5: 写 src/lib/db/index.ts 与 src/lib/db/org.ts(契约 §4 权威原文)**

  创建 `src/lib/db/index.ts`(驱动工厂:有 `DATABASE_URL` 走 node-postgres,否则 PGlite;`PGLITE_MEMORY=1` 用纯内存库,测试专用)。**单例必须挂在 `globalThis` 上**:自定义服务器(tsx 加载的 `server.ts`/`bootstrap.ts`)与 Next 编译打包的 route handler 分属两个模块注册表,模块级变量会各持一份实例——内存/磁盘 PGlite 会分裂成两个数据库(hub.ts 用 `globalThis` 也是同一原因)。存 Promise 还能避免并发首调时的重复初始化:

  ```ts
  import { drizzle as drizzlePg, NodePgDatabase } from 'drizzle-orm/node-postgres';
  import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator';
  import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
  import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
  import { PGlite } from '@electric-sql/pglite';
  import { Pool } from 'pg';
  import path from 'node:path';
  import * as schema from './schema';

  export type Db = NodePgDatabase<typeof schema>;

  // Custom server (tsx) and Next-bundled route handlers live in separate module
  // registries within the same process — a module-level variable would give each
  // side its own database instance. globalThis is the only shared spot.
  type DbGlobal = typeof globalThis & { __tvDb?: Promise<Db> };

  const MIGRATIONS = { migrationsFolder: path.join(process.cwd(), 'drizzle') };

  async function buildDb(): Promise<Db> {
    if (process.env.DATABASE_URL) {
      const pool = new Pool({ connectionString: process.env.DATABASE_URL });
      const db = drizzlePg(pool, { schema });
      await migratePg(db, MIGRATIONS);
      return db;
    }
    const client = process.env.PGLITE_MEMORY === '1'
      ? new PGlite()
      : new PGlite(path.join(process.cwd(), '.data', 'pglite'));
    const db = drizzlePglite(client, { schema }) as unknown as Db;
    await migratePglite(db as any, MIGRATIONS);
    return db;
  }

  export async function getDb(): Promise<Db> {
    const g = globalThis as DbGlobal;
    if (!g.__tvDb) g.__tvDb = buildDb();
    return g.__tvDb;
  }

  /** Tests only: drop the singleton so the next getDb() builds a fresh database. */
  export async function resetDb(): Promise<void> {
    delete (globalThis as DbGlobal).__tvDb;
  }
  ```

  创建 `src/lib/db/org.ts`:

  ```ts
  import type { Db } from './index';
  import { orgs } from './schema';

  let _orgId: string | undefined;

  export async function getOrgId(db: Db): Promise<string> {
    if (_orgId) return _orgId;
    const rows = await db.select().from(orgs).limit(1);
    if (!rows[0]) throw new Error('No org found — run `npm run db:seed` first');
    _orgId = rows[0].id;
    return _orgId;
  }

  /** Tests only. */
  export function resetOrgCache(): void { _orgId = undefined; }
  ```

- [ ] **Step 6: 生成 drizzle 迁移**

  ```bash
  npx drizzle-kit generate
  ```

  预期输出列出 **9 tables**(orgs, users, agents, sales, listings, screens, announcements, goals, settings),并生成:

  ```
  drizzle/0000_<随机名>.sql
  drizzle/meta/_journal.json
  drizzle/meta/0000_snapshot.json
  ```

  这些文件是运行时迁移的来源(`getDb()` 里的 `migrationsFolder`),**必须提交入库**。

- [ ] **Step 7: 再跑测试,确认转绿**

  ```bash
  npx vitest run tests/db.test.ts
  ```

  预期 **PASS**:`Test Files 1 passed`,`Tests 3 passed`。若报找不到迁移目录,回查 Step 6 是否在项目根目录执行。

- [ ] **Step 8: 提交 schema 层**

  ```bash
  git add src/lib/db/schema.ts src/lib/db/index.ts src/lib/db/org.ts drizzle tests/helpers/db.ts tests/db.test.ts
  git commit -m "feat: add database schema, driver factory and org resolver"
  ```

- [ ] **Step 9: 扩展 tests/db.test.ts,加入 seed 的失败测试**

  将 `tests/db.test.ts` **整体替换**为以下内容(在原有 3 个用例基础上新增 `seed` describe 块与相应 import):

  ```ts
  import { describe, it, expect, beforeEach } from 'vitest';
  import { eq } from 'drizzle-orm';
  import { freshDb, seedBasics } from './helpers/db';
  import type { Db } from '@/lib/db';
  import { getOrgId } from '@/lib/db/org';
  import { seed } from '@/lib/db/seed';
  import {
    orgs, users, agents, sales, listings, announcements, goals, settings,
  } from '@/lib/db/schema';

  describe('database layer', () => {
    let db: Db;

    beforeEach(async () => {
      db = await freshDb();
    });

    it('runs migrations and round-trips org, agent and sale', async () => {
      const { orgId, agentId } = await seedBasics(db);
      const saleId = crypto.randomUUID();
      await db.insert(sales).values({
        id: saleId,
        orgId,
        agentId,
        address: '1 Test Street, Testville',
        salePriceCents: 150000000,
        gciCents: 3000000,
        saleDate: '2026-08-15',
      });

      const rows = await db.select().from(sales).where(eq(sales.id, saleId));
      expect(rows).toHaveLength(1);
      expect(rows[0].agentId).toBe(agentId);
      expect(rows[0].salePriceCents).toBe(150000000);
      expect(rows[0].gciCents).toBe(3000000);
      expect(rows[0].saleDate).toBe('2026-08-15');
      expect(rows[0].createdAt).toBeInstanceOf(Date);
    });

    it('getOrgId resolves the first org', async () => {
      const { orgId } = await seedBasics(db);
      expect(await getOrgId(db)).toBe(orgId);
    });

    it('freshDb gives each test an isolated database', async () => {
      const agentRows = await db.select().from(agents);
      expect(agentRows).toHaveLength(0);
    });
  });

  describe('seed', () => {
    let db: Db;

    beforeEach(async () => {
      db = await freshDb();
      delete process.env.ADMIN_EMAIL;
      delete process.env.ADMIN_PASSWORD;
    });

    it('creates org, admin and settings, and is idempotent', async () => {
      const first = await seed(db);
      const second = await seed(db);
      expect(second.orgId).toBe(first.orgId);

      const orgRows = await db.select().from(orgs);
      expect(orgRows).toHaveLength(1);
      expect(orgRows[0].name).toBe('Default Agency');

      const userRows = await db.select().from(users);
      expect(userRows).toHaveLength(1);
      expect(userRows[0].email).toBe('admin@example.com');
      expect(userRows[0].passwordHash).not.toBe('admin1234'); // stored hashed, never plaintext

      const settingsRows = await db.select().from(settings);
      expect(settingsRows).toHaveLength(1);
      const data = settingsRows[0].data as { leaderboardPeriod: string; celebrationDurationSec: number };
      expect(data.leaderboardPeriod).toBe('month');
      expect(data.celebrationDurationSec).toBe(18);
    });

    it('demo mode inserts demo rows exactly once, all sales in the current month', async () => {
      await seed(db, { demo: true });
      await seed(db, { demo: true }); // second run must not duplicate

      expect(await db.select().from(agents)).toHaveLength(4);
      const saleRows = await db.select().from(sales);
      expect(saleRows).toHaveLength(6);
      expect(await db.select().from(listings)).toHaveLength(4);
      expect(await db.select().from(announcements)).toHaveLength(1);
      expect(await db.select().from(goals)).toHaveLength(1);

      const now = new Date();
      const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      for (const row of saleRows) {
        expect(row.saleDate.startsWith(ym)).toBe(true);
      }
    });
  });
  ```

- [ ] **Step 10: 运行测试,确认新用例按预期失败**

  ```bash
  npx vitest run tests/db.test.ts
  ```

  预期 **FAIL**:

  ```
  Error: Failed to resolve import "@/lib/db/seed" from "tests/db.test.ts". Does the file exist?
  ```

- [ ] **Step 11: 写 src/lib/db/seed.ts(完整实现)**

  两个时点说明:(1)admin 密码哈希直接用 `bcryptjs`(cost 10)——Task 7 的 `hashPassword` 封装同为 bcryptjs cost 10,登录时 `verifyPassword` 可正常校验此哈希,seed 不依赖尚不存在的 `@/lib/auth/password`;(2)默认 settings JSON 以内联常量写入,内容与契约 §6 的 `DEFAULT_SETTINGS` 逐字段一致——`@/lib/settings` 要到 Task 9 才存在。文件内部 import 全部用相对路径,保证 `tsx` CLI 与 vitest 两种运行方式都可解析。

  创建 `src/lib/db/seed.ts`:

  ```ts
  import bcrypt from 'bcryptjs';
  import { eq } from 'drizzle-orm';
  import type { Db } from './index';
  import {
    orgs, users, agents, sales, listings, announcements, goals, settings,
  } from './schema';

  // Keep in sync with DEFAULT_SETTINGS in '@/lib/settings' (introduced in Task 9).
  // Inlined here because seed.ts is created before settings.ts exists.
  const DEFAULT_SETTINGS_DATA = {
    slides: [
      { key: 'leaderboard_sales_count', enabled: true, durationSec: 15 },
      { key: 'leaderboard_gci', enabled: true, durationSec: 15 },
      { key: 'leaderboard_listings', enabled: true, durationSec: 15 },
      { key: 'goal_progress', enabled: true, durationSec: 10 },
      { key: 'listings', enabled: true, durationSec: 12 },
      { key: 'announcements', enabled: true, durationSec: 10 },
    ],
    leaderboardPeriod: 'month',
    celebrationDurationSec: 18,
    volume: 0.8,
    defaultAnthemUrl: 'builtin:victory',
  };

  export async function seed(db: Db, opts: { demo?: boolean } = {}): Promise<{ orgId: string }> {
    // Org: create only if none exists (name 'Default Agency').
    const existingOrg = await db.select().from(orgs).limit(1);
    let orgId: string;
    if (existingOrg[0]) {
      orgId = existingOrg[0].id;
    } else {
      orgId = crypto.randomUUID();
      await db.insert(orgs).values({ id: orgId, name: 'Default Agency' });
    }

    // Admin user: upsert by ADMIN_EMAIL (defaults match .env.example).
    const adminEmail = process.env.ADMIN_EMAIL ?? 'admin@example.com';
    const adminPassword = process.env.ADMIN_PASSWORD ?? 'admin1234';
    const passwordHash = await bcrypt.hash(adminPassword, 10);
    const existingAdmin = await db.select().from(users).where(eq(users.email, adminEmail));
    if (existingAdmin[0]) {
      await db.update(users).set({ passwordHash }).where(eq(users.id, existingAdmin[0].id));
    } else {
      await db.insert(users).values({
        id: crypto.randomUUID(), orgId, email: adminEmail, passwordHash, name: 'Admin',
      });
    }

    // Settings: write defaults only if the row does not exist yet.
    const existingSettings = await db.select().from(settings).where(eq(settings.orgId, orgId));
    if (!existingSettings[0]) {
      await db.insert(settings).values({ orgId, data: DEFAULT_SETTINGS_DATA });
    }

    if (opts.demo) {
      await seedDemoData(db, orgId);
    }

    return { orgId };
  }

  async function seedDemoData(db: Db, orgId: string): Promise<void> {
    // Demo rows go in only when the agents table is empty (idempotent).
    const existingAgents = await db.select().from(agents).limit(1);
    if (existingAgents.length > 0) return;

    const sophie = crypto.randomUUID();
    const marcus = crypto.randomUUID();
    const priya = crypto.randomUUID();
    const jake = crypto.randomUUID();
    await db.insert(agents).values([
      { id: sophie, orgId, name: 'Sophie Chen' },
      { id: marcus, orgId, name: 'Marcus Webb' },
      { id: priya, orgId, name: 'Priya Sharma' },
      { id: jake, orgId, name: 'Jake Thompson' },
    ]);

    // All demo dates fall in the current month, clamped to today so nothing is in the future.
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const day = (d: number) => `${ym}-${String(Math.min(d, now.getDate())).padStart(2, '0')}`;

    await db.insert(sales).values([
      { id: crypto.randomUUID(), orgId, agentId: sophie, address: '12 Harbour View Terrace, Mosman', salePriceCents: 185000000, gciCents: 3700000, saleDate: day(2) },
      { id: crypto.randomUUID(), orgId, agentId: sophie, address: '4/88 Beach Road, Bondi', salePriceCents: 120000000, gciCents: 2400000, saleDate: day(5) },
      { id: crypto.randomUUID(), orgId, agentId: marcus, address: '27 Eucalyptus Drive, Chatswood', salePriceCents: 240000000, gciCents: 4800000, saleDate: day(8) },
      { id: crypto.randomUUID(), orgId, agentId: priya, address: '9 Fig Tree Lane, Paddington', salePriceCents: 165000000, gciCents: 3300000, saleDate: day(11) },
      { id: crypto.randomUUID(), orgId, agentId: priya, address: '302/15 Wharf Street, Milsons Point', salePriceCents: 98000000, gciCents: 1960000, saleDate: day(13) },
      { id: crypto.randomUUID(), orgId, agentId: jake, address: '71 Banksia Avenue, Manly', salePriceCents: 210000000, gciCents: 4200000, saleDate: day(16) },
    ]);

    await db.insert(listings).values([
      { id: crypto.randomUUID(), orgId, agentId: sophie, address: '18 Curlewis Street, Bondi Beach', listPriceCents: 199500000, listedDate: day(3), status: 'active' },
      { id: crypto.randomUUID(), orgId, agentId: marcus, address: '5 Alexandra Parade, Clovelly', listPriceCents: 325000000, listedDate: day(7), status: 'active' },
      { id: crypto.randomUUID(), orgId, agentId: priya, address: '22/2 Ocean Avenue, Double Bay', listPriceCents: 145000000, listedDate: day(10), status: 'active' },
      { id: crypto.randomUUID(), orgId, agentId: jake, address: '36 Kangaroo Street, Randwick', listPriceCents: 178000000, listedDate: day(14), status: 'active' },
    ]);

    await db.insert(announcements).values({
      id: crypto.randomUUID(), orgId,
      title: 'Welcome to Sales Champions TV',
      body: 'Every deal counts this month — ring the bell and top the board!',
      enabled: true, sortOrder: 0,
    });

    await db.insert(goals).values({
      id: crypto.randomUUID(), orgId,
      metric: 'gci', targetValue: 25000000, period: 'month', active: true,
    });
  }
  ```

- [ ] **Step 12: 再跑测试,确认全绿**

  ```bash
  npx vitest run tests/db.test.ts
  ```

  预期 **PASS**:`Test Files 1 passed`,`Tests 5 passed`。

- [ ] **Step 13: 写 src/lib/db/run-seed.ts 并冒烟运行**

  创建 `src/lib/db/run-seed.ts`(CLI 入口,`npm run db:seed` 调用;`--demo` 开关)。tsx 直接运行不会像 `next dev` 那样自动加载 `.env`,所以顶部用 `@next/env` 显式加载,否则用户在 `.env` 里配置的 `DATABASE_URL`/`ADMIN_EMAIL`/`ADMIN_PASSWORD` 会被静默忽略:

  ```ts
  import { loadEnvConfig } from '@next/env';
  loadEnvConfig(process.cwd());

  import { getDb } from './index';
  import { seed } from './seed';

  const demo = process.argv.includes('--demo');

  (async () => {
    const db = await getDb();
    const result = await seed(db, { demo });
    console.log(`Seed complete: org=${result.orgId} demo=${demo}`);
    process.exit(0);
  })().catch((err) => {
    console.error(err);
    process.exit(1);
  });
  ```

  说明:ESM 的 import 提升意味着 `loadEnvConfig` 在其他 import 之后才执行,但 `db/index.ts` 与 `seed.ts` 都是**惰性**读取 env(在函数调用时才读),顺序安全。

  冒烟运行(用内存库,不在工作区落盘):

  ```bash
  PGLITE_MEMORY=1 npx tsx src/lib/db/run-seed.ts --demo
  ```

  预期输出:`Seed complete: org=<uuid> demo=true`,退出码 0。

- [ ] **Step 14: 提交 seed 层**

  ```bash
  git add src/lib/db/seed.ts src/lib/db/run-seed.ts tests/db.test.ts
  git commit -m "feat: add idempotent seed with demo data and CLI entry"
  ```
### Task 3: 共享类型、WebSocket 协议与连接 Hub

**Files:**
- Create: `src/lib/types.ts`
- Create: `src/lib/ws/protocol.ts`
- Create: `src/lib/ws/hub.ts`
- Modify: `tests/helpers/db.ts`
- Test: `tests/ws/hub.test.ts`

Hub 是单进程内存中的"screenId → WebSocket 连接"注册表,API 路由通过它向电视推送事件。本任务同时补上 Task 2 在 `tests/helpers/db.ts` 留下的衔接点(`resetHub` 的 import 与调用)。

- [ ] **Step 1: 编写 Hub 的失败测试**

创建 `tests/ws/hub.test.ts`,用假 socket(把 `send` 收到的字符串收集进数组)测试 Hub 全部行为:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { getHub, resetHub, type HubSocket } from '@/lib/ws/hub';
import type { ServerEvent } from '@/lib/ws/protocol';

function fakeSocket() {
  const sent: string[] = [];
  let closed = false;
  const socket: HubSocket = {
    send(data: string) { sent.push(data); },
    close() { closed = true; },
  };
  return { socket, sent, isClosed: () => closed };
}

function throwingSocket(): HubSocket {
  return {
    send() { throw new Error('socket dead'); },
    close() {},
  };
}

const PONG: ServerEvent = { type: 'pong' };
const CONFIG: ServerEvent = { type: 'config.updated' };

describe('hub', () => {
  beforeEach(() => { resetHub(); });

  it('getHub returns a global singleton until resetHub', () => {
    const a = getHub();
    expect(getHub()).toBe(a);
    resetHub();
    expect(getHub()).not.toBe(a);
  });

  it('register + sendToScreen delivers the JSON-serialized event even when unpaired', () => {
    const hub = getHub();
    const tv = fakeSocket();
    hub.register('s1', tv.socket, false);
    hub.sendToScreen('s1', PONG);
    expect(tv.sent).toEqual([JSON.stringify(PONG)]);
  });

  it('sendToScreen to an unknown screen is a no-op', () => {
    expect(() => getHub().sendToScreen('nope', PONG)).not.toThrow();
  });

  it('broadcast reaches only paired sockets', () => {
    const hub = getHub();
    const paired = fakeSocket();
    const pending = fakeSocket();
    hub.register('s1', paired.socket, true);
    hub.register('s2', pending.socket, false);
    hub.broadcast(CONFIG);
    expect(paired.sent).toEqual([JSON.stringify(CONFIG)]);
    expect(pending.sent).toEqual([]);
  });

  it('markPaired upgrades a pending connection to receive broadcasts', () => {
    const hub = getHub();
    const tv = fakeSocket();
    hub.register('s1', tv.socket, false);
    hub.markPaired('s1');
    hub.broadcast(CONFIG);
    expect(tv.sent).toEqual([JSON.stringify(CONFIG)]);
  });

  it('re-registering the same screenId closes the old socket and routes to the new one', () => {
    const hub = getHub();
    const oldSock = fakeSocket();
    const newSock = fakeSocket();
    hub.register('s1', oldSock.socket, true);
    hub.register('s1', newSock.socket, true);
    expect(oldSock.isClosed()).toBe(true);
    hub.sendToScreen('s1', PONG);
    expect(oldSock.sent).toEqual([]);
    expect(newSock.sent).toEqual([JSON.stringify(PONG)]);
    // 被顶掉的旧 socket 随后触发 close → unregister,不得把新连接踢下线
    hub.unregister(oldSock.socket);
    expect(hub.isOnline('s1')).toBe(true);
  });

  it('unregister removes the screen', () => {
    const hub = getHub();
    const tv = fakeSocket();
    hub.register('s1', tv.socket, true);
    hub.unregister(tv.socket);
    expect(hub.isOnline('s1')).toBe(false);
    expect(hub.onlineScreenIds()).toEqual([]);
  });

  it('a send failure unregisters the connection instead of throwing', () => {
    const hub = getHub();
    hub.register('s1', throwingSocket(), true);
    expect(() => hub.broadcast(CONFIG)).not.toThrow();
    expect(hub.isOnline('s1')).toBe(false);
  });

  it('isOnline / onlineScreenIds reflect current connections', () => {
    const hub = getHub();
    const a = fakeSocket();
    const b = fakeSocket();
    hub.register('a', a.socket, true);
    hub.register('b', b.socket, false);
    expect(hub.isOnline('a')).toBe(true);
    expect(hub.isOnline('b')).toBe(true);
    expect(hub.onlineScreenIds().sort()).toEqual(['a', 'b']);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run tests/ws/hub.test.ts
```

预期 FAIL:测试文件加载即报错 `Error: Failed to resolve import "@/lib/ws/hub" from "tests/ws/hub.test.ts"`(模块尚不存在),`Test Files 1 failed (1)`,退出码非 0。

- [ ] **Step 3: 创建共享类型 src/lib/types.ts(契约 §5 权威全文,原样照抄)**

```ts
export const METRICS = ['sales_count', 'gci', 'listings'] as const;
export type Metric = (typeof METRICS)[number];

export const PERIODS = ['week', 'month', 'quarter', 'year'] as const;
export type Period = (typeof PERIODS)[number];

export type LeaderboardEntry = {
  agentId: string;
  name: string;
  photoUrl: string | null;
  value: number;   // sales_count/listings: count; gci: cents
  rank: number;    // 1-based, fully ordered (ties broken deterministically)
};

export type GoalProgress = {
  id: string;
  metric: Metric;
  period: 'month' | 'quarter';
  targetValue: number;
  currentValue: number;
  percent: number; // 0-100, rounded, capped at 100
};

export type TvListing = {
  id: string; address: string; listPriceCents: number;
  photoUrl: string | null; agentName: string;
};

export type TvAnnouncement = { id: string; title: string; body: string | null; imageUrl: string | null };

export type TvScreenInfo = { id: string; name: string };
```

(`TvStateResponse` 类型按契约 §14 也放本文件,但它依赖 Task 9 的 `SettingsData`,由 Task 15 追加,本任务不写。)

- [ ] **Step 4: 创建 WS 协议 src/lib/ws/protocol.ts(契约 §7 权威全文,原样照抄)**

```ts
import { z } from 'zod';
import type { TvScreenInfo } from '../types';

export type CelebrationPayload = {
  saleId: string;
  agentName: string;
  agentPhotoUrl: string | null;
  address: string;
  salePriceCents: number;
  anthemUrl: string | null;   // 已解析:agent.anthemUrl ?? settings.defaultAnthemUrl(可能为 builtin:xxx 或文件 URL)
  durationSec: number;
};

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

- [ ] **Step 5: 实现 src/lib/ws/hub.ts**

导出签名与契约 §7 完全一致。内部用 `Map<screenId, {socket, paired}>` 加一个反查 `Map<HubSocket, screenId>`;`unregister` 只在"该 socket 仍是该 screen 的现役 socket"时才删除条目(防止被顶掉的旧连接的迟到 close 把新连接踢下线);`send` 包 try/catch,失败即 unregister;同 screenId 重复注册先 close 旧 socket:

```ts
import type { ServerEvent } from './protocol';

export type HubSocket = { send(data: string): void; close(): void };

export type Hub = {
  register(screenId: string, socket: HubSocket, paired: boolean): void;
  unregister(socket: HubSocket): void;
  markPaired(screenId: string): void;
  sendToScreen(screenId: string, event: ServerEvent): void;
  broadcast(event: ServerEvent): void;
  isOnline(screenId: string): boolean;
  onlineScreenIds(): string[];
};

type Entry = { socket: HubSocket; paired: boolean };

function createHub(): Hub {
  const byScreen = new Map<string, Entry>();
  const bySocket = new Map<HubSocket, string>();

  function unregister(socket: HubSocket): void {
    const screenId = bySocket.get(socket);
    if (screenId === undefined) return;
    bySocket.delete(socket);
    const entry = byScreen.get(screenId);
    if (entry && entry.socket === socket) byScreen.delete(screenId);
  }

  function safeSend(socket: HubSocket, event: ServerEvent): void {
    try {
      socket.send(JSON.stringify(event));
    } catch {
      unregister(socket);
    }
  }

  return {
    register(screenId, socket, paired) {
      const existing = byScreen.get(screenId);
      if (existing && existing.socket !== socket) {
        bySocket.delete(existing.socket);
        try {
          existing.socket.close();
        } catch {
          // old socket may already be dead; ignore
        }
      }
      byScreen.set(screenId, { socket, paired });
      bySocket.set(socket, screenId);
    },
    unregister,
    markPaired(screenId) {
      const entry = byScreen.get(screenId);
      if (entry) entry.paired = true;
    },
    sendToScreen(screenId, event) {
      const entry = byScreen.get(screenId);
      if (entry) safeSend(entry.socket, event);
    },
    broadcast(event) {
      // 快照遍历:safeSend 失败会在遍历中修改 Map
      for (const entry of [...byScreen.values()]) {
        if (entry.paired) safeSend(entry.socket, event);
      }
    },
    isOnline(screenId) {
      return byScreen.has(screenId);
    },
    onlineScreenIds() {
      return [...byScreen.keys()];
    },
  };
}

type GlobalWithHub = typeof globalThis & { __tvHub?: Hub };

export function getHub(): Hub {
  const g = globalThis as GlobalWithHub;
  if (!g.__tvHub) g.__tvHub = createHub();
  return g.__tvHub;
}

/** Tests only. */
export function resetHub(): void {
  (globalThis as GlobalWithHub).__tvHub = undefined;
}
```

- [ ] **Step 6: 运行测试确认通过**

```bash
npx vitest run tests/ws/hub.test.ts
```

预期 PASS:`Test Files 1 passed (1)`,`Tests 9 passed (9)`。

- [ ] **Step 7: 补上 tests/helpers/db.ts 的 resetHub 衔接点**

Task 2 创建的 `tests/helpers/db.ts` 是临时版(顶部有 PROVISIONAL 注释)。本步只做两处增补:在 import 区加入 `import { resetHub } from '@/lib/ws/hub';`,并在 `freshDb()` 中 `resetOrgCache();` 之后调用 `resetHub();`。同时把顶部注释中"Task 3 adds …"一行删掉(该衔接点已完成)。**注意:不要在本步引入 `hashPassword`** —— `src/lib/auth/password.ts` 要到 Task 7 才创建,`passwordHash: 'placeholder-hash'` 保持原样。改完后整个文件为:

```ts
// PROVISIONAL VERSION (Task 2, resetHub wired in Task 3).
// One follow-up edit is already scheduled — do not "fix" it here:
//   - Task 7 adds `import { hashPassword } from '@/lib/auth/password';` and replaces the
//     'placeholder-hash' literal below with `await hashPassword(adminPassword)`.
// Until Task 7, the stored hash is a fixed placeholder, so password login against this
// user is not testable yet — auth tests only arrive with Task 7.
import { getDb, resetDb, type Db } from '@/lib/db';
import { resetOrgCache } from '@/lib/db/org';
import { resetHub } from '@/lib/ws/hub';
import { orgs, users, agents } from '@/lib/db/schema';

/** Fresh in-memory database (and clean hub/org caches) for each test file/case. */
export async function freshDb(): Promise<Db> {
  process.env.PGLITE_MEMORY = '1';
  delete process.env.DATABASE_URL;
  await resetDb();
  resetOrgCache();
  resetHub();
  return getDb();
}

export type Basics = { orgId: string; adminEmail: string; adminPassword: string; agentId: string };

/** org + admin(admin@test.dev / secret123)+ 一个销售员 Alice。 */
export async function seedBasics(db: Db): Promise<Basics> {
  const orgId = crypto.randomUUID();
  await db.insert(orgs).values({ id: orgId, name: 'Test Agency' });
  const adminEmail = 'admin@test.dev';
  const adminPassword = 'secret123';
  await db.insert(users).values({
    id: crypto.randomUUID(), orgId, email: adminEmail,
    passwordHash: 'placeholder-hash', name: 'Admin',
  });
  const agentId = crypto.randomUUID();
  await db.insert(agents).values({ id: agentId, orgId, name: 'Alice Ng' });
  return { orgId, adminEmail, adminPassword, agentId };
}
```

- [ ] **Step 8: 全量测试与类型检查通过后提交**

```bash
npx vitest run
npx tsc --noEmit
```

预期:vitest 显示 `tests/db.test.ts` 与 `tests/ws/hub.test.ts` 两个文件全部 passed、无 failed;tsc 无输出、退出码 0。然后提交:

```bash
git add src/lib/types.ts src/lib/ws/protocol.ts src/lib/ws/hub.ts tests/ws/hub.test.ts tests/helpers/db.ts
git commit -m "feat: add shared types, ws protocol and screen hub"
```

### Task 4: 榜单周期计算

**Files:**
- Create: `src/lib/domain/periods.ts`
- Test: `tests/domain/periods.test.ts`

纯函数:给定周期类型与当前时间,算出 `[start, end)` 区间(本地时区、end 排他、周从周一 00:00 起)与展示标签。参考日期:2026-08-17 是周一,2026-01-01 是周四。

- [ ] **Step 1: 编写失败测试**

创建 `tests/domain/periods.test.ts`(全部用 `new Date(year, monthIndex, day, ...)` 本地时间构造,断言精确到毫秒与文案):

```ts
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
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run tests/domain/periods.test.ts
```

预期 FAIL:`Failed to resolve import "@/lib/domain/periods"`,`Test Files 1 failed (1)`。

- [ ] **Step 3: 实现 src/lib/domain/periods.ts**

全部用本地时区 Date 构造(`new Date(y, m, d)` 自动处理月/年进位与负数天数回退):

```ts
import type { Period } from '../types';

const MONTH_NAMES = [
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER',
];
const MONTH_ABBR = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** Local-time period range; week starts Monday 00:00; end is exclusive (start of next period). */
export function periodRange(period: Period, now: Date): { start: Date; end: Date } {
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (period) {
    case 'week': {
      const daysSinceMonday = (now.getDay() + 6) % 7; // getDay(): 0=Sunday
      const start = new Date(y, m, now.getDate() - daysSinceMonday);
      const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
      return { start, end };
    }
    case 'month':
      return { start: new Date(y, m, 1), end: new Date(y, m + 1, 1) };
    case 'quarter': {
      const qStartMonth = Math.floor(m / 3) * 3;
      return { start: new Date(y, qStartMonth, 1), end: new Date(y, qStartMonth + 3, 1) };
    }
    case 'year':
      return { start: new Date(y, 0, 1), end: new Date(y + 1, 0, 1) };
  }
}

export function periodLabel(period: Period, now: Date): string {
  switch (period) {
    case 'month':
      return `${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}`;
    case 'week': {
      const { start } = periodRange('week', now);
      return `WEEK OF ${start.getDate()} ${MONTH_ABBR[start.getMonth()]}`;
    }
    case 'quarter':
      return `Q${Math.floor(now.getMonth() / 3) + 1} ${now.getFullYear()}`;
    case 'year':
      return String(now.getFullYear());
  }
}
```

- [ ] **Step 4: 运行测试确认通过后提交**

```bash
npx vitest run tests/domain/periods.test.ts
```

预期 PASS:`Test Files 1 passed (1)`,`Tests 12 passed (12)`。然后:

```bash
git add src/lib/domain/periods.ts tests/domain/periods.test.ts
git commit -m "feat: add period range and label calculation"
```

### Task 5: 榜单计算与金额格式化

**Files:**
- Create: `src/lib/domain/leaderboard.ts`
- Create: `src/lib/format.ts`
- Test: `tests/domain/leaderboard.test.ts`

纯函数榜单引擎。规则(契约 §8):sales 按 `saleDate`、listings 按 `listedDate` 落在 `[start, end)`(date 字符串按本地时区解析为当日 00:00);仅统计 active agent;`value > 0` 才上榜;取前 10;排序为主指标 desc → 周期内 GCI desc → 最早一笔成交 `createdAt` asc → name asc;`rank = 数组序 + 1`。`computeMetricTotal` 不筛 active。format 测试文件树中无独立文件,并入本测试文件。

- [ ] **Step 1: 编写失败测试**

创建 `tests/domain/leaderboard.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeLeaderboard, computeMetricTotal, type LeaderboardInputs } from '@/lib/domain/leaderboard';
import { formatMoney, formatValue } from '@/lib/format';

// August 2026, end exclusive
const AUG = { start: new Date(2026, 7, 1), end: new Date(2026, 8, 1) };

const agent = (id: string, name: string, active = true, photoUrl: string | null = null) =>
  ({ id, name, photoUrl, active });
const sale = (agentId: string, gciCents: number, saleDate: string, createdAt = `${saleDate}T10:00:00`) =>
  ({ agentId, gciCents, saleDate, createdAt: new Date(createdAt) });
const listing = (agentId: string, listedDate: string) => ({ agentId, listedDate });

describe('computeLeaderboard', () => {
  it('sales_count: counts in-period sales, ranks desc, passes photoUrl through', () => {
    const inputs: LeaderboardInputs = {
      agents: [agent('a', 'Alice', true, '/p/alice.jpg'), agent('b', 'Bob')],
      sales: [
        sale('a', 100_000, '2026-08-05'),
        sale('a', 200_000, '2026-08-10'),
        sale('b', 900_000, '2026-08-12'),
      ],
      listings: [],
    };
    const rows = computeLeaderboard(inputs, 'sales_count', AUG);
    expect(rows).toEqual([
      { agentId: 'a', name: 'Alice', photoUrl: '/p/alice.jpg', value: 2, rank: 1 },
      { agentId: 'b', name: 'Bob', photoUrl: null, value: 1, rank: 2 },
    ]);
  });

  it('gci: sums gciCents per agent within the period', () => {
    const inputs: LeaderboardInputs = {
      agents: [agent('a', 'Alice'), agent('b', 'Bob')],
      sales: [
        sale('a', 100_000, '2026-08-05'),
        sale('a', 200_000, '2026-08-10'),
        sale('b', 250_000, '2026-08-12'),
        sale('b', 999_999, '2026-07-30'), // out of period
      ],
      listings: [],
    };
    const rows = computeLeaderboard(inputs, 'gci', AUG);
    expect(rows[0]).toMatchObject({ agentId: 'a', value: 300_000, rank: 1 });
    expect(rows[1]).toMatchObject({ agentId: 'b', value: 250_000, rank: 2 });
  });

  it('listings: counts listings by listedDate within the period', () => {
    const inputs: LeaderboardInputs = {
      agents: [agent('a', 'Alice'), agent('b', 'Bob')],
      sales: [],
      listings: [
        listing('a', '2026-08-03'),
        listing('a', '2026-08-20'),
        listing('b', '2026-08-15'),
        listing('b', '2026-07-01'), // out of period
      ],
    };
    const rows = computeLeaderboard(inputs, 'listings', AUG);
    expect(rows[0]).toMatchObject({ agentId: 'a', value: 2, rank: 1 });
    expect(rows[1]).toMatchObject({ agentId: 'b', value: 1, rank: 2 });
  });

  it('tie on primary metric → higher period GCI wins', () => {
    const inputs: LeaderboardInputs = {
      agents: [agent('a', 'Alice'), agent('b', 'Bob')],
      sales: [
        sale('a', 100_000, '2026-08-05'),
        sale('b', 500_000, '2026-08-06'),
      ],
      listings: [],
    };
    const rows = computeLeaderboard(inputs, 'sales_count', AUG);
    expect(rows.map((r) => r.agentId)).toEqual(['b', 'a']);
    expect(rows.map((r) => r.rank)).toEqual([1, 2]);
  });

  it('tie on metric and GCI → earliest sale createdAt wins', () => {
    const inputs: LeaderboardInputs = {
      agents: [agent('a', 'Alice'), agent('b', 'Bob')],
      sales: [
        sale('a', 100_000, '2026-08-05', '2026-08-05T15:00:00'),
        sale('b', 100_000, '2026-08-05', '2026-08-05T09:00:00'),
      ],
      listings: [],
    };
    const rows = computeLeaderboard(inputs, 'sales_count', AUG);
    expect(rows.map((r) => r.agentId)).toEqual(['b', 'a']);
  });

  it('full tie → name asc', () => {
    const inputs: LeaderboardInputs = {
      agents: [agent('z', 'Zoe'), agent('ad', 'Adam')],
      sales: [
        sale('z', 100_000, '2026-08-05', '2026-08-05T09:00:00'),
        sale('ad', 100_000, '2026-08-05', '2026-08-05T09:00:00'),
      ],
      listings: [],
    };
    const rows = computeLeaderboard(inputs, 'sales_count', AUG);
    expect(rows.map((r) => r.name)).toEqual(['Adam', 'Zoe']);
  });

  it('inactive agents are excluded even with sales in period', () => {
    const inputs: LeaderboardInputs = {
      agents: [agent('a', 'Alice'), agent('b', 'Bob', false)],
      sales: [
        sale('a', 100_000, '2026-08-05'),
        sale('b', 900_000, '2026-08-06'),
      ],
      listings: [],
    };
    const rows = computeLeaderboard(inputs, 'sales_count', AUG);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.agentId).toBe('a');
  });

  it('agents with value 0 are excluded', () => {
    const inputs: LeaderboardInputs = {
      agents: [agent('a', 'Alice'), agent('b', 'Bob')],
      sales: [sale('a', 100_000, '2026-08-05')],
      listings: [],
    };
    expect(computeLeaderboard(inputs, 'sales_count', AUG)).toHaveLength(1);
    expect(computeLeaderboard(inputs, 'listings', AUG)).toHaveLength(0);
  });

  it('period boundaries: start day counts, end day does not', () => {
    const inputs: LeaderboardInputs = {
      agents: [agent('a', 'Alice')],
      sales: [
        sale('a', 100_000, '2026-08-01'), // exactly start → in
        sale('a', 100_000, '2026-09-01'), // exactly end → out
        sale('a', 100_000, '2026-07-31'), // before start → out
      ],
      listings: [],
    };
    const rows = computeLeaderboard(inputs, 'sales_count', AUG);
    expect(rows[0]!.value).toBe(1);
  });

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
});

describe('computeMetricTotal', () => {
  it('includes inactive agents, filters by period, for all three metrics', () => {
    const inputs: LeaderboardInputs = {
      agents: [agent('a', 'Alice'), agent('b', 'Bob', false)],
      sales: [
        sale('a', 100_000, '2026-08-05'),
        sale('b', 200_000, '2026-08-06'), // inactive agent still counts
        sale('a', 900_000, '2026-07-01'), // out of period
      ],
      listings: [
        listing('b', '2026-08-10'),
        listing('a', '2026-06-01'), // out of period
      ],
    };
    expect(computeMetricTotal(inputs, 'sales_count', AUG)).toBe(2);
    expect(computeMetricTotal(inputs, 'gci', AUG)).toBe(300_000);
    expect(computeMetricTotal(inputs, 'listings', AUG)).toBe(1);
  });
});

describe('format', () => {
  it('formatMoney: three tiers', () => {
    expect(formatMoney(0)).toBe('$0');
    expect(formatMoney(850_000)).toBe('$8,500');       // < $10k → full with thousands separator
    expect(formatMoney(1_000_000)).toBe('$10K');       // ≥ $10k → K, rounded
    expect(formatMoney(8_500_000)).toBe('$85K');
    expect(formatMoney(100_000_000)).toBe('$1M');      // ≥ $1M → M, trailing zeros trimmed
    expect(formatMoney(150_000_000)).toBe('$1.5M');
    expect(formatMoney(142_000_000)).toBe('$1.42M');
  });

  it('formatValue: gci uses formatMoney, counts use String', () => {
    expect(formatValue('gci', 850_000)).toBe('$8,500');
    expect(formatValue('sales_count', 7)).toBe('7');
    expect(formatValue('listings', 3)).toBe('3');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run tests/domain/leaderboard.test.ts
```

预期 FAIL:`Failed to resolve import "@/lib/domain/leaderboard"`,`Test Files 1 failed (1)`。

- [ ] **Step 3: 实现 src/lib/format.ts**

```ts
import type { Metric } from './types';

export function formatMoney(cents: number): string {
  const dollars = cents / 100;
  if (dollars >= 1_000_000) {
    const millions = (dollars / 1_000_000).toFixed(2).replace(/\.?0+$/, '');
    return `$${millions}M`;
  }
  if (dollars >= 10_000) {
    return `$${Math.round(dollars / 1000)}K`;
  }
  return `$${Math.round(dollars).toLocaleString('en-US')}`;
}

export function formatValue(metric: Metric, value: number): string {
  return metric === 'gci' ? formatMoney(value) : String(value);
}
```

- [ ] **Step 4: 实现 src/lib/domain/leaderboard.ts**

一次遍历 sales/listings 聚合出每个 agent 的周期内统计(套数、GCI、最早成交 createdAt、房源数),再按指标取值、过滤、四级排序、截断:

```ts
import type { LeaderboardEntry, Metric } from '../types';

export type LeaderboardInputs = {
  agents: { id: string; name: string; photoUrl: string | null; active: boolean }[];
  sales: { agentId: string; gciCents: number; saleDate: string; createdAt: Date }[];      // saleDate 'YYYY-MM-DD'
  listings: { agentId: string; listedDate: string }[];
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

type AgentStats = {
  salesCount: number;
  gciCents: number;
  listingsCount: number;
  earliestSaleCreatedAt: number; // ms epoch; +Infinity when no sales in period
};

function newStats(): AgentStats {
  return { salesCount: 0, gciCents: 0, listingsCount: 0, earliestSaleCreatedAt: Number.POSITIVE_INFINITY };
}

function collectStats(inputs: LeaderboardInputs, range: Range): Map<string, AgentStats> {
  const stats = new Map<string, AgentStats>();
  const get = (agentId: string): AgentStats => {
    let s = stats.get(agentId);
    if (!s) {
      s = newStats();
      stats.set(agentId, s);
    }
    return s;
  };
  for (const row of inputs.sales) {
    if (!inRange(row.saleDate, range)) continue;
    const s = get(row.agentId);
    s.salesCount += 1;
    s.gciCents += row.gciCents;
    s.earliestSaleCreatedAt = Math.min(s.earliestSaleCreatedAt, row.createdAt.getTime());
  }
  for (const row of inputs.listings) {
    if (!inRange(row.listedDate, range)) continue;
    get(row.agentId).listingsCount += 1;
  }
  return stats;
}

function metricValue(stats: AgentStats, metric: Metric): number {
  if (metric === 'sales_count') return stats.salesCount;
  if (metric === 'gci') return stats.gciCents;
  return stats.listingsCount;
}

/** Safe numeric compare (handles Infinity vs Infinity without NaN). */
function cmp(a: number, b: number): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function computeLeaderboard(inputs: LeaderboardInputs, metric: Metric, range: Range): LeaderboardEntry[] {
  const stats = collectStats(inputs, range);
  const rows = inputs.agents
    .filter((a) => a.active)
    .map((a) => {
      const s = stats.get(a.id) ?? newStats();
      return { agent: a, value: metricValue(s, metric), gci: s.gciCents, earliest: s.earliestSaleCreatedAt };
    })
    .filter((r) => r.value > 0);

  rows.sort((x, y) =>
    cmp(y.value, x.value)                          // primary metric desc
    || cmp(y.gci, x.gci)                           // period GCI desc
    || cmp(x.earliest, y.earliest)                 // earliest sale createdAt asc
    || (x.agent.name < y.agent.name ? -1 : x.agent.name > y.agent.name ? 1 : 0), // name asc
  );

  return rows.slice(0, 10).map((r, i) => ({
    agentId: r.agent.id,
    name: r.agent.name,
    photoUrl: r.agent.photoUrl,
    value: r.value,
    rank: i + 1,
  }));
}

/** Team-wide total for goal progress. Includes ALL agents (active filter not applied). */
export function computeMetricTotal(inputs: LeaderboardInputs, metric: Metric, range: Range): number {
  if (metric === 'listings') {
    return inputs.listings.filter((l) => inRange(l.listedDate, range)).length;
  }
  const inPeriod = inputs.sales.filter((s) => inRange(s.saleDate, range));
  if (metric === 'sales_count') return inPeriod.length;
  return inPeriod.reduce((sum, s) => sum + s.gciCents, 0);
}
```

- [ ] **Step 5: 运行测试确认通过后提交**

```bash
npx vitest run tests/domain/leaderboard.test.ts
```

预期 PASS:`Test Files 1 passed (1)`,`Tests 13 passed (13)`。然后:

```bash
git add src/lib/domain/leaderboard.ts src/lib/format.ts tests/domain/leaderboard.test.ts
git commit -m "feat: add leaderboard computation and money formatting"
```

### Task 6: 配对助手

**Files:**
- Create: `src/lib/domain/pairing.ts`
- Test: `tests/domain/pairing.test.ts`

配对码(6 位、去易混淆字符、15 分钟过期)与设备令牌(64 位 hex + sha256 哈希)的纯函数。`generatePairCode` 接受可注入的 `rand` 便于确定性测试。过期判定:`now >= expiresAt` 即过期(恰好等于也算过期)。

- [ ] **Step 1: 编写失败测试**

创建 `tests/domain/pairing.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  PAIR_CODE_ALPHABET,
  PAIR_CODE_TTL_MS,
  generatePairCode,
  pairCodeExpiry,
  isPairCodeExpired,
  generateDeviceToken,
  hashToken,
} from '@/lib/domain/pairing';

describe('generatePairCode', () => {
  it('is 6 chars, all from the confusion-free alphabet', () => {
    for (let i = 0; i < 200; i++) {
      const code = generatePairCode();
      expect(code).toHaveLength(6);
      for (const ch of code) expect(PAIR_CODE_ALPHABET).toContain(ch);
    }
  });

  it('is deterministic with an injected rand', () => {
    expect(generatePairCode(() => 0)).toBe('222222');
    // alphabet has 31 chars: floor(0*31)=0→'2', floor(0.5*31)=15→'H', floor(0.999*31)=30→'Z'
    const values = [0, 0.5, 0.999, 0, 0.5, 0.999];
    let i = 0;
    expect(generatePairCode(() => values[i++])).toBe('2HZ2HZ');
  });
});

describe('pairCodeExpiry', () => {
  it('adds exactly 15 minutes', () => {
    expect(PAIR_CODE_TTL_MS).toBe(15 * 60 * 1000);
    const now = new Date(2026, 7, 17, 10, 0, 0);
    expect(pairCodeExpiry(now).getTime()).toBe(now.getTime() + 15 * 60 * 1000);
  });
});

describe('isPairCodeExpired', () => {
  const expiresAt = new Date(2026, 7, 17, 10, 15, 0);

  it('false strictly before expiry', () => {
    expect(isPairCodeExpired(expiresAt, new Date(2026, 7, 17, 10, 14, 59, 999))).toBe(false);
  });

  it('true exactly at expiresAt', () => {
    expect(isPairCodeExpired(expiresAt, new Date(expiresAt.getTime()))).toBe(true);
  });

  it('true after expiry', () => {
    expect(isPairCodeExpired(expiresAt, new Date(2026, 7, 17, 10, 15, 1))).toBe(true);
  });
});

describe('device tokens', () => {
  it('generateDeviceToken returns 64 lowercase hex chars, unique per call', () => {
    const t1 = generateDeviceToken();
    const t2 = generateDeviceToken();
    expect(t1).toMatch(/^[0-9a-f]{64}$/);
    expect(t2).toMatch(/^[0-9a-f]{64}$/);
    expect(t1).not.toBe(t2);
  });

  it('hashToken is stable sha256 hex, different inputs differ', () => {
    // well-known sha256 test vector for 'abc'
    expect(hashToken('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(hashToken('abc')).toBe(hashToken('abc'));
    expect(hashToken('abd')).not.toBe(hashToken('abc'));
    expect(hashToken('abd')).toMatch(/^[0-9a-f]{64}$/);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run tests/domain/pairing.test.ts
```

预期 FAIL:`Failed to resolve import "@/lib/domain/pairing"`,`Test Files 1 failed (1)`。

- [ ] **Step 3: 实现 src/lib/domain/pairing.ts**

```ts
import { createHash, randomBytes } from 'node:crypto';

export const PAIR_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; // 无易混淆字符
export const PAIR_CODE_TTL_MS = 15 * 60 * 1000;

/** 6-char pairing code. `rand` is injectable for deterministic tests (defaults to Math.random). */
export function generatePairCode(rand: () => number = Math.random): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += PAIR_CODE_ALPHABET[Math.floor(rand() * PAIR_CODE_ALPHABET.length)];
  }
  return code;
}

export function pairCodeExpiry(now: Date): Date {
  return new Date(now.getTime() + PAIR_CODE_TTL_MS);
}

/** Expired when now is at or past expiresAt (equality counts as expired). */
export function isPairCodeExpired(expiresAt: Date, now: Date): boolean {
  return now.getTime() >= expiresAt.getTime();
}

export function generateDeviceToken(): string {
  return randomBytes(32).toString('hex');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
```

- [ ] **Step 4: 运行测试确认通过后提交**

```bash
npx vitest run tests/domain/pairing.test.ts
```

预期 PASS:`Test Files 1 passed (1)`,`Tests 8 passed (8)`。然后:

```bash
git add src/lib/domain/pairing.ts tests/domain/pairing.test.ts
git commit -m "feat: add pairing code and device token helpers"
```
### Task 7: 认证(密码哈希、会话 Cookie、登录/登出/健康检查路由)

**Files:**
- Create: `src/lib/auth/password.ts`
- Create: `src/lib/auth/session.ts`
- Create: `src/app/api/auth/login/route.ts`
- Create: `src/app/api/auth/logout/route.ts`
- Create: `src/app/api/health/route.ts`
- Create: `tests/helpers/request.ts`
- Modify: `tests/helpers/db.ts`(seedBasics 改用真 hashPassword,Task 2 留下的衔接点)
- Test: `tests/auth.test.ts`

- [ ] **Step 1: 创建测试请求助手 tests/helpers/request.ts(契约 §4 权威原文)**

契约要求在文件顶部设置测试用 `SESSION_SECRET`(ESM import 会先执行,但 `session.ts` 是在调用时才读 env,所以顺序安全)。写入以下完整内容:

```ts
// Tests need a session secret before any seal/unseal happens.
process.env.SESSION_SECRET ||= 'test-secret-test-secret-test-secret!!';

import { sealSession, SESSION_COOKIE } from '@/lib/auth/session';

export function jsonRequest(url: string, opts: { method?: string; body?: unknown; headers?: Record<string, string> } = {}): Request {
  return new Request(`http://test.local${url}`, {
    method: opts.method ?? 'GET',
    headers: { 'content-type': 'application/json', ...(opts.headers ?? {}) },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
}

/** 已登录管理员的请求(自制会话 cookie)。 */
export async function authedRequest(url: string, opts: { method?: string; body?: unknown; headers?: Record<string, string> } = {}): Promise<Request> {
  const seal = await sealSession({ userId: 'test-admin', email: 'admin@test.dev' });
  return jsonRequest(url, { ...opts, headers: { ...(opts.headers ?? {}), cookie: `${SESSION_COOKIE}=${seal}` } });
}
```

- [ ] **Step 2: 编写失败测试 tests/auth.test.ts(完整用例)**

覆盖:hash/verify 往返与错密码;login 200+Set-Cookie / 401 / 400;requireAdmin 无 cookie 返回 401 Response、有效 cookie 返回 SessionData;logout 清 cookie;health 形状。写入完整内容:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { freshDb, seedBasics } from './helpers/db';
import { jsonRequest, authedRequest } from './helpers/request';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { requireAdmin, SESSION_COOKIE } from '@/lib/auth/session';
import { POST as loginPost } from '@/app/api/auth/login/route';
import { POST as logoutPost } from '@/app/api/auth/logout/route';
import { GET as healthGet } from '@/app/api/health/route';

describe('password hashing', () => {
  it('hashes and verifies a round-trip', async () => {
    const hash = await hashPassword('secret123');
    expect(hash).not.toBe('secret123');
    expect(await verifyPassword('secret123', hash)).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('secret123');
    expect(await verifyPassword('wrong-password', hash)).toBe(false);
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    const db = await freshDb();
    await seedBasics(db);
  });

  it('returns 200 with { data: { email } } and sets the session cookie', async () => {
    const res = await loginPost(jsonRequest('/api/auth/login', {
      method: 'POST',
      body: { email: 'admin@test.dev', password: 'secret123' },
    }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.email).toBe('admin@test.dev');
    const setCookie = res.headers.get('set-cookie');
    expect(setCookie).toContain(`${SESSION_COOKIE}=`);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('Max-Age=1209600');
  });

  it('returns 401 for a wrong password', async () => {
    const res = await loginPost(jsonRequest('/api/auth/login', {
      method: 'POST',
      body: { email: 'admin@test.dev', password: 'nope' },
    }));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBeTypeOf('string');
  });

  it('returns 401 for an unknown email', async () => {
    const res = await loginPost(jsonRequest('/api/auth/login', {
      method: 'POST',
      body: { email: 'ghost@test.dev', password: 'secret123' },
    }));
    expect(res.status).toBe(401);
  });

  it('returns 400 when fields are missing', async () => {
    const res = await loginPost(jsonRequest('/api/auth/login', {
      method: 'POST',
      body: { email: 'admin@test.dev' },
    }));
    expect(res.status).toBe(400);
  });
});

describe('requireAdmin', () => {
  it('returns a 401 Response when no cookie is present', async () => {
    const result = await requireAdmin(jsonRequest('/api/anything'));
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(401);
    expect(await (result as Response).json()).toEqual({ error: 'Unauthorized' });
  });

  it('returns SessionData for a valid session cookie', async () => {
    const req = await authedRequest('/api/anything');
    const result = await requireAdmin(req);
    expect(result).not.toBeInstanceOf(Response);
    if (result instanceof Response) throw new Error('unreachable');
    expect(result).toEqual({ userId: 'test-admin', email: 'admin@test.dev' });
  });

  it('returns a 401 Response for a garbage cookie', async () => {
    const req = jsonRequest('/api/anything', { headers: { cookie: `${SESSION_COOKIE}=garbage-seal` } });
    const result = await requireAdmin(req);
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(401);
  });
});

describe('POST /api/auth/logout', () => {
  it('clears the session cookie', async () => {
    const res = await logoutPost();
    expect(res.status).toBe(200);
    expect((await res.json()).data.ok).toBe(true);
    const setCookie = res.headers.get('set-cookie');
    expect(setCookie).toContain(`${SESSION_COOKIE}=`);
    expect(setCookie).toContain('Max-Age=0');
  });
});

describe('GET /api/health', () => {
  it('returns { ok: true } without a data wrapper', async () => {
    const res = await healthGet();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
```

- [ ] **Step 3: 运行测试,确认因模块缺失而失败**

```bash
npx vitest run tests/auth.test.ts
```

预期:FAIL — vitest 报 `Failed to resolve import "@/lib/auth/password"`(或 `"@/lib/auth/session"`)from `tests/auth.test.ts`,因为实现文件尚未创建。

- [ ] **Step 4: 实现 src/lib/auth/password.ts(bcryptjs,cost 10)**

```ts
import bcrypt from 'bcryptjs';

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
```

- [ ] **Step 5: 实现 src/lib/auth/session.ts(iron-session sealData/unsealData,不依赖 next/headers)**

Cookie 解析手写:对 cookie header 按 `'; '` split 后找 `SESSION_COOKIE=` 前缀。secret 缺失时 throw。写入完整内容:

```ts
import { sealData, unsealData } from 'iron-session';

export const SESSION_COOKIE = 'tvsaas_session';
export type SessionData = { userId: string; email: string };

const TTL_SECONDS = 14 * 24 * 60 * 60; // 14 days

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET environment variable is required');
  return secret;
}

export async function sealSession(data: SessionData): Promise<string> {
  return sealData(data, { password: getSecret(), ttl: TTL_SECONDS });
}

export async function readSessionFromRequest(req: Request): Promise<SessionData | null> {
  const cookieHeader = req.headers.get('cookie');
  if (!cookieHeader) return null;
  const pair = cookieHeader.split('; ').find((p) => p.startsWith(`${SESSION_COOKIE}=`));
  if (!pair) return null;
  const seal = pair.slice(SESSION_COOKIE.length + 1);
  if (!seal) return null;
  try {
    const data = await unsealData<SessionData>(seal, { password: getSecret(), ttl: TTL_SECONDS });
    if (typeof data?.userId !== 'string' || typeof data?.email !== 'string') return null;
    return { userId: data.userId, email: data.email };
  } catch {
    return null;
  }
}

export function sessionSetCookie(seal: string): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${seal}; Path=/; HttpOnly; SameSite=Lax; Max-Age=1209600${secure}`;
}

export function sessionClearCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export async function requireAdmin(req: Request): Promise<SessionData | Response> {
  const session = await readSessionFromRequest(req);
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  return session;
}
```

- [ ] **Step 6: 实现登录路由 src/app/api/auth/login/route.ts**

```ts
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { verifyPassword } from '@/lib/auth/password';
import { sealSession, sessionSetCookie } from '@/lib/auth/session';

const loginSchema = z.object({ email: z.string().min(1), password: z.string().min(1) });

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: 'email and password are required' }, { status: 400 });
  }
  const { email, password } = parsed.data;
  const db = await getDb();
  const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const user = rows[0];
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return Response.json({ error: 'Invalid email or password' }, { status: 401 });
  }
  const seal = await sealSession({ userId: user.id, email: user.email });
  return Response.json(
    { data: { email: user.email } },
    { status: 200, headers: { 'set-cookie': sessionSetCookie(seal) } },
  );
}
```

- [ ] **Step 7: 实现登出与健康检查路由**

`src/app/api/auth/logout/route.ts`:

```ts
import { sessionClearCookie } from '@/lib/auth/session';

export async function POST() {
  return Response.json(
    { data: { ok: true } },
    { headers: { 'set-cookie': sessionClearCookie() } },
  );
}
```

`src/app/api/health/route.ts`(注意:契约规定此路由直接返回 `{ ok: true }`,**无** data 包装):

```ts
export async function GET() {
  return Response.json({ ok: true });
}
```

- [ ] **Step 8: 修改 tests/helpers/db.ts — seedBasics 改用真 hashPassword**

Task 2 交付的 `seedBasics` 中 `passwordHash` 是占位值(当时 `password.ts` 尚不存在)。现在直接用 Write 将整个文件覆盖为契约 §4 权威全文(与旧内容的唯一实质差异是导入并调用 `hashPassword`):

```ts
import { getDb, resetDb, type Db } from '@/lib/db';
import { resetOrgCache } from '@/lib/db/org';
import { resetHub } from '@/lib/ws/hub';
import { orgs, users, agents } from '@/lib/db/schema';
import { hashPassword } from '@/lib/auth/password';

/** Fresh in-memory database (and clean hub/org caches) for each test file/case. */
export async function freshDb(): Promise<Db> {
  process.env.PGLITE_MEMORY = '1';
  delete process.env.DATABASE_URL;
  await resetDb();
  resetOrgCache();
  resetHub();
  return getDb();
}

export type Basics = { orgId: string; adminEmail: string; adminPassword: string; agentId: string };

/** org + admin(admin@test.dev / secret123)+ 一个销售员 Alice。 */
export async function seedBasics(db: Db): Promise<Basics> {
  const orgId = crypto.randomUUID();
  await db.insert(orgs).values({ id: orgId, name: 'Test Agency' });
  const adminEmail = 'admin@test.dev';
  const adminPassword = 'secret123';
  await db.insert(users).values({
    id: crypto.randomUUID(), orgId, email: adminEmail,
    passwordHash: await hashPassword(adminPassword), name: 'Admin',
  });
  const agentId = crypto.randomUUID();
  await db.insert(agents).values({ id: agentId, orgId, name: 'Alice Ng' });
  return { orgId, adminEmail, adminPassword, agentId };
}
```

- [ ] **Step 9: 运行测试确认全绿 + 类型检查**

```bash
npx vitest run tests/auth.test.ts
```

预期:PASS,auth.test.ts 全部用例通过。再跑全量确认 helpers/db.ts 的改动没有破坏既有测试(db.test.ts 等):

```bash
npx vitest run
npx tsc --noEmit
```

预期:全部测试通过;tsc 无输出、退出码 0。

- [ ] **Step 10: 提交**

```bash
git add src/lib/auth/password.ts src/lib/auth/session.ts src/app/api/auth/login/route.ts src/app/api/auth/logout/route.ts src/app/api/health/route.ts tests/helpers/request.ts tests/helpers/db.ts tests/auth.test.ts
git commit -m "feat: admin auth with bcrypt passwords and iron-session cookies"
```

---

### Task 8: 存储与上传(local/S3 驱动、uploads、files 路由)

**Files:**
- Create: `src/lib/storage/index.ts`
- Create: `src/lib/storage/local.ts`
- Create: `src/lib/storage/s3.ts`
- Create: `src/app/api/uploads/route.ts`
- Create: `src/app/api/files/[...path]/route.ts`
- Test: `tests/storage.test.ts`

- [ ] **Step 1: 编写失败测试 tests/storage.test.ts(完整用例)**

覆盖:local driver 落盘 + url 形状;uploads 路由 401 / 扩展名白名单拒绝 / 超 10MB 拒绝 / 成功;files 路由按扩展名给 content-type、404、`..` 穿越防护。测试结束后清理 `<cwd>/storage` 目录。上传测试不需要数据库(requireAdmin 的会话是自包含的 seal)。写入完整内容:

```ts
import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { jsonRequest } from './helpers/request';
import { sealSession, SESSION_COOKIE } from '@/lib/auth/session';
import { getStorage } from '@/lib/storage';
import { POST as uploadsPost } from '@/app/api/uploads/route';
import { GET as filesGet } from '@/app/api/files/[...path]/route';

const STORAGE_DIR = path.join(process.cwd(), 'storage');

afterAll(async () => {
  await fs.rm(STORAGE_DIR, { recursive: true, force: true });
});

function multipart(filename: string, bytes: Uint8Array, headers: Record<string, string> = {}): Request {
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: 'application/octet-stream' }), filename);
  // 不手动设置 content-type,让 undici 自动带上 multipart boundary。
  return new Request('http://test.local/api/uploads', { method: 'POST', body: form, headers });
}

async function adminCookie(): Promise<Record<string, string>> {
  const seal = await sealSession({ userId: 'test-admin', email: 'admin@test.dev' });
  return { cookie: `${SESSION_COOKIE}=${seal}` };
}

describe('LocalStorage.save', () => {
  it('writes the file under <cwd>/storage and returns a /api/files url', async () => {
    const stored = await getStorage().save(Buffer.from('fake-png-bytes'), 'photo.png', 'image/png');
    expect(stored.url).toMatch(/^\/api\/files\/[0-9a-f-]{36}\.png$/);
    const basename = stored.url.slice('/api/files/'.length);
    const onDisk = await fs.readFile(path.join(STORAGE_DIR, basename), 'utf8');
    expect(onDisk).toBe('fake-png-bytes');
  });
});

describe('POST /api/uploads', () => {
  it('returns 401 without an admin session', async () => {
    const res = await uploadsPost(multipart('photo.png', new Uint8Array([1, 2, 3])));
    expect(res.status).toBe(401);
  });

  it('rejects extensions outside the whitelist', async () => {
    const res = await uploadsPost(multipart('malware.exe', new Uint8Array([1]), await adminCookie()));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('.exe');
  });

  it('rejects files over 10MB', async () => {
    const big = new Uint8Array(10 * 1024 * 1024 + 1);
    const res = await uploadsPost(multipart('big.png', big, await adminCookie()));
    expect(res.status).toBe(400);
  });

  it('stores an allowed file and returns { data: { url } }', async () => {
    const res = await uploadsPost(multipart('anthem.mp3', new Uint8Array([7, 7, 7]), await adminCookie()));
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.url).toMatch(/^\/api\/files\/[0-9a-f-]{36}\.mp3$/);
    const basename = data.url.slice('/api/files/'.length);
    await expect(fs.stat(path.join(STORAGE_DIR, basename))).resolves.toBeTruthy();
  });
});

describe('GET /api/files/[...path]', () => {
  it('serves an uploaded file with the mapped content-type', async () => {
    const stored = await getStorage().save(Buffer.from('imgdata'), 'pic.webp', 'image/webp');
    const basename = stored.url.slice('/api/files/'.length);
    const res = await filesGet(jsonRequest(`/api/files/${basename}`), {
      params: Promise.resolve({ path: [basename] }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/webp');
    expect(await res.text()).toBe('imgdata');
  });

  it('returns 404 for a missing file', async () => {
    const res = await filesGet(jsonRequest('/api/files/nope.png'), {
      params: Promise.resolve({ path: ['nope.png'] }),
    });
    expect(res.status).toBe(404);
  });

  it('does not allow path traversal out of the storage dir', async () => {
    // 若实现直接 join 各段,这会命中项目根目录真实存在的 package.json;
    // 正确实现取 basename 后只会在 storage/ 下找 package.json → 404。
    const res = await filesGet(jsonRequest('/api/files/../../package.json'), {
      params: Promise.resolve({ path: ['..', '..', 'package.json'] }),
    });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: 运行测试,确认因模块缺失而失败**

```bash
npx vitest run tests/storage.test.ts
```

预期:FAIL — `Failed to resolve import "@/lib/storage"`(实现文件尚未创建)。

- [ ] **Step 3: 实现 src/lib/storage/local.ts 与 src/lib/storage/index.ts**

`src/lib/storage/local.ts`(存 `<cwd>/storage/<uuid><ext>`,url 为 `/api/files/<basename>`,目录不存在则 mkdir;对 index.ts 只有 type-only 依赖,无运行时循环):

```ts
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Storage, StoredFile } from './index';

export class LocalStorage implements Storage {
  private dir = path.join(process.cwd(), 'storage');

  async save(buf: Buffer, filename: string, _contentType: string): Promise<StoredFile> {
    await fs.mkdir(this.dir, { recursive: true });
    const ext = path.extname(filename).toLowerCase();
    const basename = `${crypto.randomUUID()}${ext}`;
    await fs.writeFile(path.join(this.dir, basename), buf);
    return { url: `/api/files/${basename}` };
  }
}
```

`src/lib/storage/index.ts`(契约 §10 签名):

```ts
import { LocalStorage } from './local';
import { S3Storage } from './s3';

export type StoredFile = { url: string };

export interface Storage {
  save(buf: Buffer, filename: string, contentType: string): Promise<StoredFile>;
}

export function getStorage(): Storage {
  return process.env.STORAGE_DRIVER === 's3' ? new S3Storage() : new LocalStorage();
}
```

- [ ] **Step 4: 实现 src/lib/storage/s3.ts(R2 的 S3 兼容 API,env 缺失即 throw)**

```ts
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import path from 'node:path';
import type { Storage, StoredFile } from './index';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name} (required when STORAGE_DRIVER=s3)`);
  return value;
}

export class S3Storage implements Storage {
  private client: S3Client;
  private bucket: string;
  private publicBaseUrl: string;

  constructor() {
    const endpoint = requireEnv('R2_ENDPOINT');
    this.bucket = requireEnv('R2_BUCKET');
    this.publicBaseUrl = requireEnv('R2_PUBLIC_BASE_URL').replace(/\/$/, '');
    this.client = new S3Client({
      region: 'auto',
      endpoint,
      credentials: {
        accessKeyId: requireEnv('R2_ACCESS_KEY_ID'),
        secretAccessKey: requireEnv('R2_SECRET_ACCESS_KEY'),
      },
    });
  }

  async save(buf: Buffer, filename: string, contentType: string): Promise<StoredFile> {
    const ext = path.extname(filename).toLowerCase();
    const key = `${crypto.randomUUID()}${ext}`;
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: buf,
      ContentType: contentType,
    }));
    return { url: `${this.publicBaseUrl}/${key}` };
  }
}
```

- [ ] **Step 5: 实现上传路由 src/app/api/uploads/route.ts(requireAdmin + 白名单 + 10MB 限制)**

```ts
import path from 'node:path';
import { requireAdmin } from '@/lib/auth/session';
import { getStorage } from '@/lib/storage';

const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.mp3', '.m4a', '.ogg'];
const MAX_SIZE_BYTES = 10 * 1024 * 1024;

export async function POST(req: Request) {
  const session = await requireAdmin(req);
  if (session instanceof Response) return session;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: 'Expected multipart form data' }, { status: 400 });
  }
  const file = form.get('file');
  if (!(file instanceof File)) {
    return Response.json({ error: 'Missing file field' }, { status: 400 });
  }
  const ext = path.extname(file.name).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return Response.json({ error: `File type not allowed: ${ext || '(none)'}` }, { status: 400 });
  }
  if (file.size > MAX_SIZE_BYTES) {
    return Response.json({ error: 'File too large (max 10MB)' }, { status: 400 });
  }
  const buf = Buffer.from(await file.arrayBuffer());
  const stored = await getStorage().save(buf, file.name, file.type || 'application/octet-stream');
  return Response.json({ data: { url: stored.url } });
}
```

- [ ] **Step 6: 实现文件服务路由 src/app/api/files/[...path]/route.ts(basename 防穿越 + content-type 映射)**

Next.js 15 的动态参数是 Promise,必须 `await ctx.params`:

```ts
import fs from 'node:fs/promises';
import path from 'node:path';

const CONTENT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg',
};

export async function GET(_req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path: segments } = await ctx.params;
  // basename 丢弃一切目录部分('..' 等),只允许命中 storage/ 下的直接子文件。
  const basename = path.basename(segments.join('/'));
  const filePath = path.join(process.cwd(), 'storage', basename);
  let buf: Buffer;
  try {
    buf = await fs.readFile(filePath);
  } catch {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }
  const contentType = CONTENT_TYPES[path.extname(basename).toLowerCase()] ?? 'application/octet-stream';
  return new Response(new Uint8Array(buf), { headers: { 'content-type': contentType } });
}
```

- [ ] **Step 7: 运行测试确认通过 + 类型检查**

```bash
npx vitest run tests/storage.test.ts
npx tsc --noEmit
```

预期:storage.test.ts 全部用例 PASS;tsc 无输出、退出码 0。

- [ ] **Step 8: 提交**

`[...path]` 含方括号,bash 下必须加引号防止 glob 展开:

```bash
git add src/lib/storage/index.ts src/lib/storage/local.ts src/lib/storage/s3.ts src/app/api/uploads/route.ts "src/app/api/files/[...path]/route.ts" tests/storage.test.ts
git commit -m "feat: file storage drivers with upload and file-serving routes"
```

---

### Task 9: 设置(settings 存取 + settings API + config.updated 广播)

**Files:**
- Create: `src/lib/settings.ts`
- Create: `src/app/api/settings/route.ts`
- Test: `tests/settings.test.ts`

- [ ] **Step 1: 编写失败测试 tests/settings.test.ts(完整用例)**

覆盖:无行时返回 DEFAULT_SETTINGS;保存后读回(含 upsert 二次更新);PUT 越界值(celebrationDurationSec: 40)400;PUT 成功后 hub 中已注册的 paired fake socket 收到 `{ type: 'config.updated' }`。写入完整内容:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { freshDb, seedBasics } from './helpers/db';
import { jsonRequest, authedRequest } from './helpers/request';
import { getSettings, saveSettings, DEFAULT_SETTINGS, type SettingsData } from '@/lib/settings';
import { getHub } from '@/lib/ws/hub';
import { GET as settingsGet, PUT as settingsPut } from '@/app/api/settings/route';
import type { Db } from '@/lib/db';

let db: Db;
let orgId: string;

beforeEach(async () => {
  db = await freshDb();
  const basics = await seedBasics(db);
  orgId = basics.orgId;
});

describe('getSettings / saveSettings', () => {
  it('returns DEFAULT_SETTINGS when no row exists', async () => {
    expect(await getSettings(db, orgId)).toEqual(DEFAULT_SETTINGS);
  });

  it('reads back saved settings, including a second upsert', async () => {
    const custom: SettingsData = { ...DEFAULT_SETTINGS, leaderboardPeriod: 'quarter', celebrationDurationSec: 25 };
    await saveSettings(db, orgId, custom);
    expect(await getSettings(db, orgId)).toEqual(custom);

    const again: SettingsData = { ...custom, volume: 0.5 };
    await saveSettings(db, orgId, again); // 走 onConflictDoUpdate 的 update 分支
    expect(await getSettings(db, orgId)).toEqual(again);
  });
});

describe('/api/settings', () => {
  it('GET returns 401 without an admin session', async () => {
    const res = await settingsGet(jsonRequest('/api/settings'));
    expect(res.status).toBe(401);
  });

  it('GET returns defaults when nothing is saved', async () => {
    const res = await settingsGet(await authedRequest('/api/settings'));
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual(DEFAULT_SETTINGS);
  });

  it('PUT rejects out-of-range celebrationDurationSec', async () => {
    const bad = { ...DEFAULT_SETTINGS, celebrationDurationSec: 40 };
    const res = await settingsPut(await authedRequest('/api/settings', { method: 'PUT', body: bad }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBeTypeOf('string');
  });

  it('PUT saves settings and broadcasts config.updated to paired sockets', async () => {
    const sent: string[] = [];
    getHub().register('screen-1', { send: (d: string) => { sent.push(d); }, close() {} }, true);

    const next: SettingsData = { ...DEFAULT_SETTINGS, leaderboardPeriod: 'week' };
    const res = await settingsPut(await authedRequest('/api/settings', { method: 'PUT', body: next }));
    expect(res.status).toBe(200);
    expect((await res.json()).data.leaderboardPeriod).toBe('week');
    expect(await getSettings(db, orgId)).toEqual(next);
    expect(sent.map((s) => JSON.parse(s))).toContainEqual({ type: 'config.updated' });
  });
});
```

- [ ] **Step 2: 运行测试,确认因模块缺失而失败**

```bash
npx vitest run tests/settings.test.ts
```

预期:FAIL — `Failed to resolve import "@/lib/settings"`(实现文件尚未创建)。

- [ ] **Step 3: 实现 src/lib/settings.ts(契约 §6:常量与 schema 原样照抄,补 getSettings/saveSettings 实现)**

```ts
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import type { Db } from './db';
import { settings } from './db/schema';
import type { Period } from './types';

export const SLIDE_KEYS = [
  'leaderboard_sales_count', 'leaderboard_gci', 'leaderboard_listings',
  'goal_progress', 'listings', 'announcements',
] as const;
export type SlideKey = (typeof SLIDE_KEYS)[number];

export type SlideConfig = { key: SlideKey; enabled: boolean; durationSec: number };

export type SettingsData = {
  slides: SlideConfig[];             // 有序
  leaderboardPeriod: Period;         // 默认 'month'
  celebrationDurationSec: number;    // 10–30, 默认 18
  volume: number;                    // 0–1, 默认 0.8
  defaultAnthemUrl: string | null;   // 默认 'builtin:victory'
};

export const settingsSchema: z.ZodType<SettingsData> = z.object({
  slides: z.array(z.object({
    key: z.enum(SLIDE_KEYS),
    enabled: z.boolean(),
    durationSec: z.number().int().min(5).max(120),
  })),
  leaderboardPeriod: z.enum(['week', 'month', 'quarter', 'year']),
  celebrationDurationSec: z.number().int().min(10).max(30),
  volume: z.number().min(0).max(1),
  defaultAnthemUrl: z.string().nullable(),
});

export const DEFAULT_SETTINGS: SettingsData = {
  slides: [
    { key: 'leaderboard_sales_count', enabled: true, durationSec: 15 },
    { key: 'leaderboard_gci', enabled: true, durationSec: 15 },
    { key: 'leaderboard_listings', enabled: true, durationSec: 15 },
    { key: 'goal_progress', enabled: true, durationSec: 10 },
    { key: 'listings', enabled: true, durationSec: 12 },
    { key: 'announcements', enabled: true, durationSec: 10 },
  ],
  leaderboardPeriod: 'month',
  celebrationDurationSec: 18,
  volume: 0.8,
  defaultAnthemUrl: 'builtin:victory',
};

export async function getSettings(db: Db, orgId: string): Promise<SettingsData> {
  const rows = await db.select().from(settings).where(eq(settings.orgId, orgId)).limit(1);
  if (!rows[0]) return DEFAULT_SETTINGS;
  return rows[0].data as SettingsData;
}

export async function saveSettings(db: Db, orgId: string, data: SettingsData): Promise<void> {
  await db
    .insert(settings)
    .values({ orgId, data, updatedAt: new Date() })
    .onConflictDoUpdate({ target: settings.orgId, set: { data, updatedAt: new Date() } });
}
```

- [ ] **Step 4: 实现 src/app/api/settings/route.ts(GET/PUT,PUT 成功后广播 config.updated)**

```ts
import { requireAdmin } from '@/lib/auth/session';
import { getDb } from '@/lib/db';
import { getOrgId } from '@/lib/db/org';
import { getSettings, saveSettings, settingsSchema } from '@/lib/settings';
import { getHub } from '@/lib/ws/hub';

export async function GET(req: Request) {
  const session = await requireAdmin(req);
  if (session instanceof Response) return session;
  const db = await getDb();
  const orgId = await getOrgId(db);
  const data = await getSettings(db, orgId);
  return Response.json({ data });
}

export async function PUT(req: Request) {
  const session = await requireAdmin(req);
  if (session instanceof Response) return session;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = settingsSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? 'Invalid settings' }, { status: 400 });
  }
  const db = await getDb();
  const orgId = await getOrgId(db);
  await saveSettings(db, orgId, parsed.data);
  getHub().broadcast({ type: 'config.updated' });
  return Response.json({ data: parsed.data });
}
```

- [ ] **Step 5: 运行测试确认通过 + 类型检查**

```bash
npx vitest run tests/settings.test.ts
npx tsc --noEmit
```

预期:settings.test.ts 全部用例 PASS;tsc 无输出、退出码 0。

- [ ] **Step 6: 提交**

```bash
git add src/lib/settings.ts src/app/api/settings/route.ts tests/settings.test.ts
git commit -m "feat: org settings storage and API with config.updated broadcast"
```
### Task 10: Agents API(销售员 CRUD 路由)

**Files:**
- Create: `src/app/api/agents/route.ts`
- Create: `src/app/api/agents/[id]/route.ts`
- Test: `tests/api/agents.test.ts`

- [ ] **Step 1: 编写失败的集成测试**

  本任务依赖 Task 2(`getDb`/`getOrgId`/测试助手)、Task 3(hub/protocol)、Task 7(`requireAdmin`/`authedRequest`)已完成。测试直接 import route handler 函数,用 `new Request(...)` 调用;广播断言方式:向 hub 注册一个 fake 的 paired socket,把收到的 JSON 收集进数组。

  创建 `tests/api/agents.test.ts`,内容如下:

  ```ts
  import { describe, it, expect, beforeEach } from 'vitest';
  import { freshDb, seedBasics, type Basics } from '../helpers/db';
  import { jsonRequest, authedRequest } from '../helpers/request';
  import { getHub } from '@/lib/ws/hub';
  import type { ServerEvent } from '@/lib/ws/protocol';
  import { GET, POST } from '@/app/api/agents/route';
  import { PATCH, DELETE } from '@/app/api/agents/[id]/route';

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

  describe('auth', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const res = await GET(jsonRequest('/api/agents'));
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: 'Unauthorized' });
    });
  });

  describe('POST /api/agents', () => {
    it('creates an agent and broadcasts data.updated agents', async () => {
      const res = await POST(
        await authedRequest('/api/agents', {
          method: 'POST',
          body: { name: 'Carol Wu', anthemUrl: 'builtin:champion' },
        }),
      );
      expect(res.status).toBe(200);
      const { data } = await res.json();
      expect(data.name).toBe('Carol Wu');
      expect(data.anthemUrl).toBe('builtin:champion');
      expect(data.photoUrl).toBeNull();
      expect(data.active).toBe(true);
      expect(events).toEqual([{ type: 'data.updated', domain: 'agents' }]);
    });

    it('rejects a body without name with 400', async () => {
      const res = await POST(await authedRequest('/api/agents', { method: 'POST', body: {} }));
      expect(res.status).toBe(400);
      expect(events).toEqual([]);
    });
  });

  describe('GET /api/agents', () => {
    it('lists all agents sorted by name asc', async () => {
      for (const name of ['Zoe Park', 'Bob Tran']) {
        const res = await POST(await authedRequest('/api/agents', { method: 'POST', body: { name } }));
        expect(res.status).toBe(200);
      }
      const res = await GET(await authedRequest('/api/agents'));
      expect(res.status).toBe(200);
      const { data } = await res.json();
      expect(data.map((a: { name: string }) => a.name)).toEqual(['Alice Ng', 'Bob Tran', 'Zoe Park']);
    });
  });

  describe('PATCH /api/agents/[id]', () => {
    it('renames an agent and broadcasts', async () => {
      const res = await PATCH(
        await authedRequest(`/api/agents/${basics.agentId}`, {
          method: 'PATCH',
          body: { name: 'Alice Nguyen' },
        }),
        { params: Promise.resolve({ id: basics.agentId }) },
      );
      expect(res.status).toBe(200);
      const { data } = await res.json();
      expect(data.name).toBe('Alice Nguyen');
      expect(events).toEqual([{ type: 'data.updated', domain: 'agents' }]);
    });

    it('can toggle active via PATCH', async () => {
      const res = await PATCH(
        await authedRequest(`/api/agents/${basics.agentId}`, { method: 'PATCH', body: { active: false } }),
        { params: Promise.resolve({ id: basics.agentId }) },
      );
      const { data } = await res.json();
      expect(data.active).toBe(false);
    });

    it('returns 404 for an unknown id and does not broadcast', async () => {
      const res = await PATCH(
        await authedRequest('/api/agents/ghost', { method: 'PATCH', body: { name: 'X' } }),
        { params: Promise.resolve({ id: 'ghost' }) },
      );
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: 'Not found' });
      expect(events).toEqual([]);
    });
  });

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

- [ ] **Step 2: 运行测试确认失败**

  ```bash
  npx vitest run tests/api/agents.test.ts
  ```

  预期 FAIL:报错含 `Failed to resolve import "@/app/api/agents/route"`(实现文件尚不存在)。

- [ ] **Step 3: 实现 GET/POST 路由**

  创建 `src/app/api/agents/route.ts`:

  ```ts
  import { z } from 'zod';
  import { asc, eq } from 'drizzle-orm';
  import { getDb } from '@/lib/db';
  import { getOrgId } from '@/lib/db/org';
  import { agents } from '@/lib/db/schema';
  import { requireAdmin } from '@/lib/auth/session';
  import { getHub } from '@/lib/ws/hub';

  const createSchema = z.object({
    name: z.string().min(1),
    photoUrl: z.string().optional(),
    anthemUrl: z.string().optional(),
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
      })
      .returning();
    getHub().broadcast({ type: 'data.updated', domain: 'agents' });
    return Response.json({ data: agent });
  }
  ```

- [ ] **Step 4: 实现 PATCH/DELETE 路由(软删)**

  创建 `src/app/api/agents/[id]/route.ts`(注意 Next.js 15 的 `params` 是 Promise):

  ```ts
  import { z } from 'zod';
  import { and, eq } from 'drizzle-orm';
  import { getDb } from '@/lib/db';
  import { getOrgId } from '@/lib/db/org';
  import { agents } from '@/lib/db/schema';
  import { requireAdmin } from '@/lib/auth/session';
  import { getHub } from '@/lib/ws/hub';

  const patchSchema = z.object({
    name: z.string().min(1).optional(),
    photoUrl: z.string().nullable().optional(),
    anthemUrl: z.string().nullable().optional(),
    active: z.boolean().optional(),
  });

  export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
    const session = await requireAdmin(req);
    if (session instanceof Response) return session;
    const { id } = await ctx.params;
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues.map((i) => i.message).join('; ') },
        { status: 400 },
      );
    }
    const db = await getDb();
    const orgId = await getOrgId(db);
    const [existing] = await db
      .select()
      .from(agents)
      .where(and(eq(agents.id, id), eq(agents.orgId, orgId)));
    if (!existing) return Response.json({ error: 'Not found' }, { status: 404 });
    if (Object.keys(parsed.data).length === 0) return Response.json({ data: existing });
    const [agent] = await db
      .update(agents)
      .set(parsed.data)
      .where(and(eq(agents.id, id), eq(agents.orgId, orgId)))
      .returning();
    getHub().broadcast({ type: 'data.updated', domain: 'agents' });
    return Response.json({ data: agent });
  }

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

- [ ] **Step 5: 运行测试确认通过 + 类型检查**

  ```bash
  npx vitest run tests/api/agents.test.ts
  npx tsc --noEmit
  ```

  预期:测试全部 PASS;tsc 无报错。

- [ ] **Step 6: 提交**

  ```bash
  git add src/app/api/agents tests/api/agents.test.ts
  git commit -m "feat: add agents CRUD API with soft delete"
  ```

### Task 11: Sales API 与成交庆祝广播

**Files:**
- Create: `src/lib/domain/celebration.ts`
- Create: `src/app/api/sales/route.ts`
- Create: `src/app/api/sales/[id]/route.ts`
- Create: `src/app/api/sales/[id]/replay/route.ts`
- Test: `tests/api/sales.test.ts`

- [ ] **Step 1: 编写失败的集成测试**

  本任务依赖 Task 9 的 `getSettings`/`DEFAULT_SETTINGS`(settings 行不存在时返回默认值,`defaultAnthemUrl='builtin:victory'`、`celebrationDurationSec=18`)。核心断言:创建成交后 fake paired socket **依次**收到 `celebration.play`(payload 内容完整)和 `data.updated sales`;编辑不触发庆祝;replay 重播一次。

  创建 `tests/api/sales.test.ts`:

  ```ts
  import { describe, it, expect, beforeEach } from 'vitest';
  import { freshDb, seedBasics, type Basics } from '../helpers/db';
  import { jsonRequest, authedRequest } from '../helpers/request';
  import { getHub } from '@/lib/ws/hub';
  import type { ServerEvent } from '@/lib/ws/protocol';
  import { DEFAULT_SETTINGS } from '@/lib/settings';
  import { GET, POST } from '@/app/api/sales/route';
  import { PATCH, DELETE } from '@/app/api/sales/[id]/route';
  import { POST as REPLAY } from '@/app/api/sales/[id]/replay/route';

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

  const saleBody = () => ({
    agentId: basics.agentId,
    address: '12 Ocean View Dr',
    salePriceCents: 85000000,
    gciCents: 2100000,
    saleDate: '2026-08-15',
  });

  describe('POST /api/sales', () => {
    it('requires admin session', async () => {
      const res = await POST(jsonRequest('/api/sales', { method: 'POST', body: saleBody() }));
      expect(res.status).toBe(401);
    });

    it('creates a sale then broadcasts celebration.play followed by data.updated sales', async () => {
      const res = await POST(await authedRequest('/api/sales', { method: 'POST', body: saleBody() }));
      expect(res.status).toBe(200);
      const { data } = await res.json();
      expect(data.address).toBe('12 Ocean View Dr');
      expect(data.salePriceCents).toBe(85000000);

      expect(events).toHaveLength(2);
      const first = events[0];
      if (first.type !== 'celebration.play') throw new Error('expected celebration.play first');
      const c = first.celebration;
      expect(c.saleId).toBe(data.id);
      expect(c.agentName).toBe('Alice Ng');
      expect(c.agentPhotoUrl).toBeNull();
      expect(c.address).toBe('12 Ocean View Dr');
      expect(c.salePriceCents).toBe(85000000);
      // Alice has no anthem of her own — server must fall back to settings.defaultAnthemUrl
      expect(c.anthemUrl).toBe(DEFAULT_SETTINGS.defaultAnthemUrl);
      expect(c.anthemUrl).toBe('builtin:victory');
      expect(c.durationSec).toBe(18);
      expect(events[1]).toEqual({ type: 'data.updated', domain: 'sales' });
    });

    it('rejects negative amounts with 400', async () => {
      const res = await POST(
        await authedRequest('/api/sales', {
          method: 'POST',
          body: { ...saleBody(), salePriceCents: -5 },
        }),
      );
      expect(res.status).toBe(400);
      expect(events).toEqual([]);
    });

    it('rejects an unknown agentId with 400 Unknown agent', async () => {
      const res = await POST(
        await authedRequest('/api/sales', {
          method: 'POST',
          body: { ...saleBody(), agentId: 'ghost' },
        }),
      );
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Unknown agent' });
      expect(events).toEqual([]);
    });
  });

  describe('GET /api/sales', () => {
    it('lists sales with agentName', async () => {
      await POST(await authedRequest('/api/sales', { method: 'POST', body: saleBody() }));
      const res = await GET(await authedRequest('/api/sales'));
      expect(res.status).toBe(200);
      const { data } = await res.json();
      expect(data).toHaveLength(1);
      expect(data[0].agentName).toBe('Alice Ng');
    });
  });

  describe('PATCH /api/sales/[id]', () => {
    it('updates, refreshes updatedAt, and does NOT broadcast a celebration', async () => {
      const created = await (
        await POST(await authedRequest('/api/sales', { method: 'POST', body: saleBody() }))
      ).json();
      events.length = 0;
      await new Promise((r) => setTimeout(r, 10)); // ensure updatedAt strictly increases

      const res = await PATCH(
        await authedRequest(`/api/sales/${created.data.id}`, {
          method: 'PATCH',
          body: { address: '99 Sunset Blvd' },
        }),
        { params: Promise.resolve({ id: created.data.id }) },
      );
      expect(res.status).toBe(200);
      const { data } = await res.json();
      expect(data.address).toBe('99 Sunset Blvd');
      expect(new Date(data.updatedAt).getTime()).toBeGreaterThan(
        new Date(created.data.updatedAt).getTime(),
      );
      expect(events).toEqual([{ type: 'data.updated', domain: 'sales' }]);
    });

    it('returns 404 for an unknown id', async () => {
      const res = await PATCH(
        await authedRequest('/api/sales/ghost', { method: 'PATCH', body: { address: 'X' } }),
        { params: Promise.resolve({ id: 'ghost' }) },
      );
      expect(res.status).toBe(404);
      expect(events).toEqual([]);
    });
  });

  describe('POST /api/sales/[id]/replay', () => {
    it('re-broadcasts celebration.play for an existing sale', async () => {
      const created = await (
        await POST(await authedRequest('/api/sales', { method: 'POST', body: saleBody() }))
      ).json();
      events.length = 0;

      const res = await REPLAY(
        await authedRequest(`/api/sales/${created.data.id}/replay`, { method: 'POST' }),
        { params: Promise.resolve({ id: created.data.id }) },
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ data: { ok: true } });

      expect(events).toHaveLength(1);
      const first = events[0];
      if (first.type !== 'celebration.play') throw new Error('expected celebration.play');
      expect(first.celebration.saleId).toBe(created.data.id);
      expect(first.celebration.agentName).toBe('Alice Ng');
      expect(first.celebration.durationSec).toBe(18);
    });

    it('returns 404 when the sale does not exist', async () => {
      const res = await REPLAY(
        await authedRequest('/api/sales/ghost/replay', { method: 'POST' }),
        { params: Promise.resolve({ id: 'ghost' }) },
      );
      expect(res.status).toBe(404);
      expect(events).toEqual([]);
    });
  });

  describe('DELETE /api/sales/[id]', () => {
    it('hard-deletes and broadcasts data.updated sales', async () => {
      const created = await (
        await POST(await authedRequest('/api/sales', { method: 'POST', body: saleBody() }))
      ).json();
      events.length = 0;

      const res = await DELETE(
        await authedRequest(`/api/sales/${created.data.id}`, { method: 'DELETE' }),
        { params: Promise.resolve({ id: created.data.id }) },
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ data: { id: created.data.id } });

      const list = await (await GET(await authedRequest('/api/sales'))).json();
      expect(list.data).toHaveLength(0);
      expect(events).toEqual([{ type: 'data.updated', domain: 'sales' }]);
    });
  });
  ```

- [ ] **Step 2: 运行测试确认失败**

  ```bash
  npx vitest run tests/api/sales.test.ts
  ```

  预期 FAIL:报错含 `Failed to resolve import "@/app/api/sales/route"`(实现文件尚不存在)。

- [ ] **Step 3: 实现 buildCelebrationPayload**

  创建 `src/lib/domain/celebration.ts`(签名照契约§8):

  ```ts
  import type { CelebrationPayload } from '../ws/protocol';
  import type { SettingsData } from '../settings';

  export function buildCelebrationPayload(
    sale: { id: string; address: string; salePriceCents: number },
    agent: { name: string; photoUrl: string | null; anthemUrl: string | null },
    settings: SettingsData,
  ): CelebrationPayload {
    return {
      saleId: sale.id,
      agentName: agent.name,
      agentPhotoUrl: agent.photoUrl,
      address: sale.address,
      salePriceCents: sale.salePriceCents,
      anthemUrl: agent.anthemUrl ?? settings.defaultAnthemUrl,
      durationSec: settings.celebrationDurationSec,
    };
  }
  ```

- [ ] **Step 4: 实现 GET/POST 路由(POST 触发庆祝广播)**

  创建 `src/app/api/sales/route.ts`。要点:POST 在插入前先查 agent(避免裸外键报错),不存在返回 400 `{ error: 'Unknown agent' }`;成功后**先** broadcast `celebration.play` **再** broadcast `data.updated sales`:

  ```ts
  import { z } from 'zod';
  import { and, desc, eq } from 'drizzle-orm';
  import { getDb } from '@/lib/db';
  import { getOrgId } from '@/lib/db/org';
  import { agents, sales } from '@/lib/db/schema';
  import { requireAdmin } from '@/lib/auth/session';
  import { getHub } from '@/lib/ws/hub';
  import { getSettings } from '@/lib/settings';
  import { buildCelebrationPayload } from '@/lib/domain/celebration';

  const createSchema = z.object({
    agentId: z.string().min(1),
    address: z.string().min(1),
    salePriceCents: z.number().int().min(0),
    gciCents: z.number().int().min(0),
    saleDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'saleDate must be YYYY-MM-DD'),
  });

  export async function GET(req: Request) {
    const session = await requireAdmin(req);
    if (session instanceof Response) return session;
    const db = await getDb();
    const orgId = await getOrgId(db);
    const rows = await db
      .select({
        id: sales.id,
        orgId: sales.orgId,
        agentId: sales.agentId,
        address: sales.address,
        salePriceCents: sales.salePriceCents,
        gciCents: sales.gciCents,
        saleDate: sales.saleDate,
        createdAt: sales.createdAt,
        updatedAt: sales.updatedAt,
        agentName: agents.name,
      })
      .from(sales)
      .innerJoin(agents, eq(sales.agentId, agents.id))
      .where(eq(sales.orgId, orgId))
      .orderBy(desc(sales.createdAt))
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
    const [agent] = await db
      .select()
      .from(agents)
      .where(and(eq(agents.id, parsed.data.agentId), eq(agents.orgId, orgId)));
    if (!agent) return Response.json({ error: 'Unknown agent' }, { status: 400 });

    const [sale] = await db
      .insert(sales)
      .values({
        id: crypto.randomUUID(),
        orgId,
        agentId: parsed.data.agentId,
        address: parsed.data.address,
        salePriceCents: parsed.data.salePriceCents,
        gciCents: parsed.data.gciCents,
        saleDate: parsed.data.saleDate,
      })
      .returning();

    const settings = await getSettings(db, orgId);
    const celebration = buildCelebrationPayload(
      { id: sale.id, address: sale.address, salePriceCents: sale.salePriceCents },
      { name: agent.name, photoUrl: agent.photoUrl, anthemUrl: agent.anthemUrl },
      settings,
    );
    const hub = getHub();
    hub.broadcast({ type: 'celebration.play', celebration });
    hub.broadcast({ type: 'data.updated', domain: 'sales' });
    return Response.json({ data: sale });
  }
  ```

- [ ] **Step 5: 实现 PATCH/DELETE 路由(编辑不庆祝、刷新 updatedAt)**

  创建 `src/app/api/sales/[id]/route.ts`:

  ```ts
  import { z } from 'zod';
  import { and, eq } from 'drizzle-orm';
  import { getDb } from '@/lib/db';
  import { getOrgId } from '@/lib/db/org';
  import { agents, sales } from '@/lib/db/schema';
  import { requireAdmin } from '@/lib/auth/session';
  import { getHub } from '@/lib/ws/hub';

  const patchSchema = z.object({
    agentId: z.string().min(1).optional(),
    address: z.string().min(1).optional(),
    salePriceCents: z.number().int().min(0).optional(),
    gciCents: z.number().int().min(0).optional(),
    saleDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'saleDate must be YYYY-MM-DD').optional(),
  });

  export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
    const session = await requireAdmin(req);
    if (session instanceof Response) return session;
    const { id } = await ctx.params;
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues.map((i) => i.message).join('; ') },
        { status: 400 },
      );
    }
    const db = await getDb();
    const orgId = await getOrgId(db);
    const [existing] = await db
      .select()
      .from(sales)
      .where(and(eq(sales.id, id), eq(sales.orgId, orgId)));
    if (!existing) return Response.json({ error: 'Not found' }, { status: 404 });
    if (parsed.data.agentId !== undefined) {
      const [agent] = await db
        .select()
        .from(agents)
        .where(and(eq(agents.id, parsed.data.agentId), eq(agents.orgId, orgId)));
      if (!agent) return Response.json({ error: 'Unknown agent' }, { status: 400 });
    }
    const [sale] = await db
      .update(sales)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(and(eq(sales.id, id), eq(sales.orgId, orgId)))
      .returning();
    getHub().broadcast({ type: 'data.updated', domain: 'sales' });
    return Response.json({ data: sale });
  }

  export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
    const session = await requireAdmin(req);
    if (session instanceof Response) return session;
    const { id } = await ctx.params;
    const db = await getDb();
    const orgId = await getOrgId(db);
    const [existing] = await db
      .select()
      .from(sales)
      .where(and(eq(sales.id, id), eq(sales.orgId, orgId)));
    if (!existing) return Response.json({ error: 'Not found' }, { status: 404 });
    await db.delete(sales).where(and(eq(sales.id, id), eq(sales.orgId, orgId)));
    getHub().broadcast({ type: 'data.updated', domain: 'sales' });
    return Response.json({ data: { id } });
  }
  ```

- [ ] **Step 6: 实现 replay 路由**

  创建 `src/app/api/sales/[id]/replay/route.ts`。重查 sale + agent 重建 payload 再广播;sale 不存在 404:

  ```ts
  import { and, eq } from 'drizzle-orm';
  import { getDb } from '@/lib/db';
  import { getOrgId } from '@/lib/db/org';
  import { agents, sales } from '@/lib/db/schema';
  import { requireAdmin } from '@/lib/auth/session';
  import { getHub } from '@/lib/ws/hub';
  import { getSettings } from '@/lib/settings';
  import { buildCelebrationPayload } from '@/lib/domain/celebration';

  export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
    const session = await requireAdmin(req);
    if (session instanceof Response) return session;
    const { id } = await ctx.params;
    const db = await getDb();
    const orgId = await getOrgId(db);
    const [sale] = await db
      .select()
      .from(sales)
      .where(and(eq(sales.id, id), eq(sales.orgId, orgId)));
    if (!sale) return Response.json({ error: 'Not found' }, { status: 404 });
    const [agent] = await db
      .select()
      .from(agents)
      .where(and(eq(agents.id, sale.agentId), eq(agents.orgId, orgId)));
    if (!agent) return Response.json({ error: 'Unknown agent' }, { status: 400 });
    const settings = await getSettings(db, orgId);
    const celebration = buildCelebrationPayload(
      { id: sale.id, address: sale.address, salePriceCents: sale.salePriceCents },
      { name: agent.name, photoUrl: agent.photoUrl, anthemUrl: agent.anthemUrl },
      settings,
    );
    getHub().broadcast({ type: 'celebration.play', celebration });
    return Response.json({ data: { ok: true } });
  }
  ```

- [ ] **Step 7: 运行测试确认通过 + 类型检查**

  ```bash
  npx vitest run tests/api/sales.test.ts
  npx tsc --noEmit
  ```

  预期:测试全部 PASS;tsc 无报错。

- [ ] **Step 8: 提交**

  ```bash
  git add src/lib/domain/celebration.ts src/app/api/sales tests/api/sales.test.ts
  git commit -m "feat: add sales API with celebration broadcast and replay"
  ```

### Task 12: Listings / Announcements / Goals API

**Files:**
- Create: `src/app/api/listings/route.ts`
- Create: `src/app/api/listings/[id]/route.ts`
- Create: `src/app/api/announcements/route.ts`
- Create: `src/app/api/announcements/[id]/route.ts`
- Create: `src/app/api/goals/route.ts`
- Create: `src/app/api/goals/[id]/route.ts`
- Test: `tests/api/listings.test.ts`
- Test: `tests/api/announcements-goals.test.ts`

- [ ] **Step 1: 编写 listings 的失败测试**

  创建 `tests/api/listings.test.ts`:

  ```ts
  import { describe, it, expect, beforeEach } from 'vitest';
  import { freshDb, seedBasics, type Basics } from '../helpers/db';
  import { jsonRequest, authedRequest } from '../helpers/request';
  import { getHub } from '@/lib/ws/hub';
  import type { ServerEvent } from '@/lib/ws/protocol';
  import { GET, POST } from '@/app/api/listings/route';
  import { PATCH, DELETE } from '@/app/api/listings/[id]/route';

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

  const listingBody = () => ({
    agentId: basics.agentId,
    address: '7 Harbour St',
    listPriceCents: 120000000,
    listedDate: '2026-08-10',
  });

  describe('POST /api/listings', () => {
    it('requires admin session', async () => {
      const res = await POST(jsonRequest('/api/listings', { method: 'POST', body: listingBody() }));
      expect(res.status).toBe(401);
    });

    it('creates a listing (default status active) and broadcasts data.updated listings', async () => {
      const res = await POST(await authedRequest('/api/listings', { method: 'POST', body: listingBody() }));
      expect(res.status).toBe(200);
      const { data } = await res.json();
      expect(data.address).toBe('7 Harbour St');
      expect(data.status).toBe('active');
      expect(events).toEqual([{ type: 'data.updated', domain: 'listings' }]);
    });

    it('rejects an unknown agentId with 400 Unknown agent', async () => {
      const res = await POST(
        await authedRequest('/api/listings', {
          method: 'POST',
          body: { ...listingBody(), agentId: 'ghost' },
        }),
      );
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Unknown agent' });
      expect(events).toEqual([]);
    });
  });

  describe('GET /api/listings', () => {
    it('lists listings with agentName', async () => {
      await POST(await authedRequest('/api/listings', { method: 'POST', body: listingBody() }));
      const res = await GET(await authedRequest('/api/listings'));
      const { data } = await res.json();
      expect(data).toHaveLength(1);
      expect(data[0].agentName).toBe('Alice Ng');
    });
  });

  describe('PATCH /api/listings/[id]', () => {
    it('updates status to sold and broadcasts', async () => {
      const created = await (
        await POST(await authedRequest('/api/listings', { method: 'POST', body: listingBody() }))
      ).json();
      events.length = 0;

      const res = await PATCH(
        await authedRequest(`/api/listings/${created.data.id}`, {
          method: 'PATCH',
          body: { status: 'sold' },
        }),
        { params: Promise.resolve({ id: created.data.id }) },
      );
      expect(res.status).toBe(200);
      const { data } = await res.json();
      expect(data.status).toBe('sold');
      expect(events).toEqual([{ type: 'data.updated', domain: 'listings' }]);
    });

    it('rejects an invalid status enum value with 400', async () => {
      const created = await (
        await POST(await authedRequest('/api/listings', { method: 'POST', body: listingBody() }))
      ).json();
      events.length = 0;

      const res = await PATCH(
        await authedRequest(`/api/listings/${created.data.id}`, {
          method: 'PATCH',
          body: { status: 'archived' },
        }),
        { params: Promise.resolve({ id: created.data.id }) },
      );
      expect(res.status).toBe(400);
      expect(events).toEqual([]);
    });

    it('returns 404 for an unknown id', async () => {
      const res = await PATCH(
        await authedRequest('/api/listings/ghost', { method: 'PATCH', body: { status: 'sold' } }),
        { params: Promise.resolve({ id: 'ghost' }) },
      );
      expect(res.status).toBe(404);
      expect(events).toEqual([]);
    });
  });

  describe('DELETE /api/listings/[id]', () => {
    it('hard-deletes and broadcasts', async () => {
      const created = await (
        await POST(await authedRequest('/api/listings', { method: 'POST', body: listingBody() }))
      ).json();
      events.length = 0;

      const res = await DELETE(
        await authedRequest(`/api/listings/${created.data.id}`, { method: 'DELETE' }),
        { params: Promise.resolve({ id: created.data.id }) },
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ data: { id: created.data.id } });

      const list = await (await GET(await authedRequest('/api/listings'))).json();
      expect(list.data).toHaveLength(0);
      expect(events).toEqual([{ type: 'data.updated', domain: 'listings' }]);
    });
  });
  ```

- [ ] **Step 2: 运行 listings 测试确认失败**

  ```bash
  npx vitest run tests/api/listings.test.ts
  ```

  预期 FAIL:报错含 `Failed to resolve import "@/app/api/listings/route"`。

- [ ] **Step 3: 实现 listings GET/POST 路由**

  创建 `src/app/api/listings/route.ts`:

  ```ts
  import { z } from 'zod';
  import { and, desc, eq } from 'drizzle-orm';
  import { getDb } from '@/lib/db';
  import { getOrgId } from '@/lib/db/org';
  import { agents, listings } from '@/lib/db/schema';
  import { requireAdmin } from '@/lib/auth/session';
  import { getHub } from '@/lib/ws/hub';

  const createSchema = z.object({
    agentId: z.string().min(1),
    address: z.string().min(1),
    listPriceCents: z.number().int().min(0),
    photoUrl: z.string().optional(),
    listedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'listedDate must be YYYY-MM-DD'),
  });

  export async function GET(req: Request) {
    const session = await requireAdmin(req);
    if (session instanceof Response) return session;
    const db = await getDb();
    const orgId = await getOrgId(db);
    const rows = await db
      .select({
        id: listings.id,
        orgId: listings.orgId,
        agentId: listings.agentId,
        address: listings.address,
        listPriceCents: listings.listPriceCents,
        photoUrl: listings.photoUrl,
        listedDate: listings.listedDate,
        status: listings.status,
        createdAt: listings.createdAt,
        agentName: agents.name,
      })
      .from(listings)
      .innerJoin(agents, eq(listings.agentId, agents.id))
      .where(eq(listings.orgId, orgId))
      .orderBy(desc(listings.createdAt));
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
      .select()
      .from(agents)
      .where(and(eq(agents.id, parsed.data.agentId), eq(agents.orgId, orgId)));
    if (!agent) return Response.json({ error: 'Unknown agent' }, { status: 400 });
    const [listing] = await db
      .insert(listings)
      .values({
        id: crypto.randomUUID(),
        orgId,
        agentId: parsed.data.agentId,
        address: parsed.data.address,
        listPriceCents: parsed.data.listPriceCents,
        photoUrl: parsed.data.photoUrl ?? null,
        listedDate: parsed.data.listedDate,
      })
      .returning();
    getHub().broadcast({ type: 'data.updated', domain: 'listings' });
    return Response.json({ data: listing });
  }
  ```

- [ ] **Step 4: 实现 listings PATCH/DELETE 路由(status 枚举校验)**

  创建 `src/app/api/listings/[id]/route.ts`:

  ```ts
  import { z } from 'zod';
  import { and, eq } from 'drizzle-orm';
  import { getDb } from '@/lib/db';
  import { getOrgId } from '@/lib/db/org';
  import { agents, listings } from '@/lib/db/schema';
  import { requireAdmin } from '@/lib/auth/session';
  import { getHub } from '@/lib/ws/hub';

  const patchSchema = z.object({
    agentId: z.string().min(1).optional(),
    address: z.string().min(1).optional(),
    listPriceCents: z.number().int().min(0).optional(),
    photoUrl: z.string().nullable().optional(),
    listedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'listedDate must be YYYY-MM-DD').optional(),
    status: z.enum(['active', 'sold', 'withdrawn']).optional(),
  });

  export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
    const session = await requireAdmin(req);
    if (session instanceof Response) return session;
    const { id } = await ctx.params;
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues.map((i) => i.message).join('; ') },
        { status: 400 },
      );
    }
    const db = await getDb();
    const orgId = await getOrgId(db);
    const [existing] = await db
      .select()
      .from(listings)
      .where(and(eq(listings.id, id), eq(listings.orgId, orgId)));
    if (!existing) return Response.json({ error: 'Not found' }, { status: 404 });
    if (parsed.data.agentId !== undefined) {
      const [agent] = await db
        .select()
        .from(agents)
        .where(and(eq(agents.id, parsed.data.agentId), eq(agents.orgId, orgId)));
      if (!agent) return Response.json({ error: 'Unknown agent' }, { status: 400 });
    }
    if (Object.keys(parsed.data).length === 0) return Response.json({ data: existing });
    const [listing] = await db
      .update(listings)
      .set(parsed.data)
      .where(and(eq(listings.id, id), eq(listings.orgId, orgId)))
      .returning();
    getHub().broadcast({ type: 'data.updated', domain: 'listings' });
    return Response.json({ data: listing });
  }

  export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
    const session = await requireAdmin(req);
    if (session instanceof Response) return session;
    const { id } = await ctx.params;
    const db = await getDb();
    const orgId = await getOrgId(db);
    const [existing] = await db
      .select()
      .from(listings)
      .where(and(eq(listings.id, id), eq(listings.orgId, orgId)));
    if (!existing) return Response.json({ error: 'Not found' }, { status: 404 });
    await db.delete(listings).where(and(eq(listings.id, id), eq(listings.orgId, orgId)));
    getHub().broadcast({ type: 'data.updated', domain: 'listings' });
    return Response.json({ data: { id } });
  }
  ```

- [ ] **Step 5: 运行 listings 测试确认通过并提交**

  ```bash
  npx vitest run tests/api/listings.test.ts
  ```

  预期:全部 PASS。然后提交:

  ```bash
  git add src/app/api/listings tests/api/listings.test.ts
  git commit -m "feat: add listings CRUD API"
  ```

- [ ] **Step 6: 编写 announcements + goals 的失败测试**

  创建 `tests/api/announcements-goals.test.ts`。重点:announcements 按 `sortOrder` asc 排序;goals 的 `period` 仅允许 `month|quarter`(传 `'week'` 必须 400,虽然榜单周期允许 week,goal 不允许):

  ```ts
  import { describe, it, expect, beforeEach } from 'vitest';
  import { freshDb, seedBasics } from '../helpers/db';
  import { jsonRequest, authedRequest } from '../helpers/request';
  import { getHub } from '@/lib/ws/hub';
  import type { ServerEvent } from '@/lib/ws/protocol';
  import { GET as listAnnouncements, POST as createAnnouncement } from '@/app/api/announcements/route';
  import {
    PATCH as patchAnnouncement,
    DELETE as deleteAnnouncement,
  } from '@/app/api/announcements/[id]/route';
  import { GET as listGoals, POST as createGoal } from '@/app/api/goals/route';
  import { PATCH as patchGoal, DELETE as deleteGoal } from '@/app/api/goals/[id]/route';

  let events: ServerEvent[];

  beforeEach(async () => {
    const db = await freshDb();
    await seedBasics(db);
    events = [];
    getHub().register(
      'screen-test',
      { send: (data: string) => events.push(JSON.parse(data) as ServerEvent), close: () => {} },
      true,
    );
  });

  describe('announcements', () => {
    it('requires admin session', async () => {
      const res = await listAnnouncements(jsonRequest('/api/announcements'));
      expect(res.status).toBe(401);
    });

    it('creates, broadcasts, and lists sorted by sortOrder asc', async () => {
      const a = await createAnnouncement(
        await authedRequest('/api/announcements', {
          method: 'POST',
          body: { title: 'Later news', sortOrder: 5 },
        }),
      );
      expect(a.status).toBe(200);
      expect(events).toEqual([{ type: 'data.updated', domain: 'announcements' }]);

      await createAnnouncement(
        await authedRequest('/api/announcements', {
          method: 'POST',
          body: { title: 'First news', body: 'Hello team', sortOrder: 1 },
        }),
      );

      const res = await listAnnouncements(await authedRequest('/api/announcements'));
      const { data } = await res.json();
      expect(data.map((x: { title: string }) => x.title)).toEqual(['First news', 'Later news']);
      expect(data[0].body).toBe('Hello team');
      expect(data[0].enabled).toBe(true);
    });

    it('rejects a missing title with 400', async () => {
      const res = await createAnnouncement(
        await authedRequest('/api/announcements', { method: 'POST', body: { sortOrder: 1 } }),
      );
      expect(res.status).toBe(400);
      expect(events).toEqual([]);
    });

    it('PATCH toggles enabled and broadcasts; DELETE removes and broadcasts', async () => {
      const created = await (
        await createAnnouncement(
          await authedRequest('/api/announcements', { method: 'POST', body: { title: 'Toggle me' } }),
        )
      ).json();
      events.length = 0;

      const patched = await patchAnnouncement(
        await authedRequest(`/api/announcements/${created.data.id}`, {
          method: 'PATCH',
          body: { enabled: false },
        }),
        { params: Promise.resolve({ id: created.data.id }) },
      );
      expect(patched.status).toBe(200);
      expect((await patched.json()).data.enabled).toBe(false);
      expect(events).toEqual([{ type: 'data.updated', domain: 'announcements' }]);
      events.length = 0;

      const deleted = await deleteAnnouncement(
        await authedRequest(`/api/announcements/${created.data.id}`, { method: 'DELETE' }),
        { params: Promise.resolve({ id: created.data.id }) },
      );
      expect(deleted.status).toBe(200);
      expect(await deleted.json()).toEqual({ data: { id: created.data.id } });
      const list = await (await listAnnouncements(await authedRequest('/api/announcements'))).json();
      expect(list.data).toHaveLength(0);
      expect(events).toEqual([{ type: 'data.updated', domain: 'announcements' }]);
    });

    it('returns 404 for an unknown announcement id', async () => {
      const res = await patchAnnouncement(
        await authedRequest('/api/announcements/ghost', { method: 'PATCH', body: { enabled: false } }),
        { params: Promise.resolve({ id: 'ghost' }) },
      );
      expect(res.status).toBe(404);
    });
  });

  describe('goals', () => {
    it('creates a goal and broadcasts data.updated goals', async () => {
      const res = await createGoal(
        await authedRequest('/api/goals', {
          method: 'POST',
          body: { metric: 'gci', targetValue: 500000000, period: 'month' },
        }),
      );
      expect(res.status).toBe(200);
      const { data } = await res.json();
      expect(data.metric).toBe('gci');
      expect(data.targetValue).toBe(500000000);
      expect(data.period).toBe('month');
      expect(data.active).toBe(true);
      expect(events).toEqual([{ type: 'data.updated', domain: 'goals' }]);
    });

    it("rejects period 'week' with 400 (goals only allow month|quarter)", async () => {
      const res = await createGoal(
        await authedRequest('/api/goals', {
          method: 'POST',
          body: { metric: 'sales_count', targetValue: 10, period: 'week' },
        }),
      );
      expect(res.status).toBe(400);
      expect(events).toEqual([]);
    });

    it('rejects an invalid metric with 400', async () => {
      const res = await createGoal(
        await authedRequest('/api/goals', {
          method: 'POST',
          body: { metric: 'revenue', targetValue: 10, period: 'month' },
        }),
      );
      expect(res.status).toBe(400);
    });

    it('PATCH toggles active and broadcasts; DELETE removes and broadcasts', async () => {
      const created = await (
        await createGoal(
          await authedRequest('/api/goals', {
            method: 'POST',
            body: { metric: 'sales_count', targetValue: 25, period: 'quarter' },
          }),
        )
      ).json();
      events.length = 0;

      const patched = await patchGoal(
        await authedRequest(`/api/goals/${created.data.id}`, {
          method: 'PATCH',
          body: { active: false },
        }),
        { params: Promise.resolve({ id: created.data.id }) },
      );
      expect(patched.status).toBe(200);
      expect((await patched.json()).data.active).toBe(false);
      expect(events).toEqual([{ type: 'data.updated', domain: 'goals' }]);
      events.length = 0;

      const deleted = await deleteGoal(
        await authedRequest(`/api/goals/${created.data.id}`, { method: 'DELETE' }),
        { params: Promise.resolve({ id: created.data.id }) },
      );
      expect(deleted.status).toBe(200);
      const list = await (await listGoals(await authedRequest('/api/goals'))).json();
      expect(list.data).toHaveLength(0);
      expect(events).toEqual([{ type: 'data.updated', domain: 'goals' }]);
    });

    it('returns 404 for an unknown goal id', async () => {
      const res = await deleteGoal(
        await authedRequest('/api/goals/ghost', { method: 'DELETE' }),
        { params: Promise.resolve({ id: 'ghost' }) },
      );
      expect(res.status).toBe(404);
    });
  });
  ```

- [ ] **Step 7: 运行 announcements-goals 测试确认失败**

  ```bash
  npx vitest run tests/api/announcements-goals.test.ts
  ```

  预期 FAIL:报错含 `Failed to resolve import "@/app/api/announcements/route"`。

- [ ] **Step 8: 实现 announcements 两个路由文件**

  创建 `src/app/api/announcements/route.ts`:

  ```ts
  import { z } from 'zod';
  import { asc, eq } from 'drizzle-orm';
  import { getDb } from '@/lib/db';
  import { getOrgId } from '@/lib/db/org';
  import { announcements } from '@/lib/db/schema';
  import { requireAdmin } from '@/lib/auth/session';
  import { getHub } from '@/lib/ws/hub';

  const createSchema = z.object({
    title: z.string().min(1),
    body: z.string().optional(),
    imageUrl: z.string().optional(),
    sortOrder: z.number().int().optional(),
  });

  export async function GET(req: Request) {
    const session = await requireAdmin(req);
    if (session instanceof Response) return session;
    const db = await getDb();
    const orgId = await getOrgId(db);
    const rows = await db
      .select()
      .from(announcements)
      .where(eq(announcements.orgId, orgId))
      .orderBy(asc(announcements.sortOrder), asc(announcements.createdAt));
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
    const [announcement] = await db
      .insert(announcements)
      .values({
        id: crypto.randomUUID(),
        orgId,
        title: parsed.data.title,
        body: parsed.data.body ?? null,
        imageUrl: parsed.data.imageUrl ?? null,
        sortOrder: parsed.data.sortOrder ?? 0,
      })
      .returning();
    getHub().broadcast({ type: 'data.updated', domain: 'announcements' });
    return Response.json({ data: announcement });
  }
  ```

  创建 `src/app/api/announcements/[id]/route.ts`:

  ```ts
  import { z } from 'zod';
  import { and, eq } from 'drizzle-orm';
  import { getDb } from '@/lib/db';
  import { getOrgId } from '@/lib/db/org';
  import { announcements } from '@/lib/db/schema';
  import { requireAdmin } from '@/lib/auth/session';
  import { getHub } from '@/lib/ws/hub';

  const patchSchema = z.object({
    title: z.string().min(1).optional(),
    body: z.string().nullable().optional(),
    imageUrl: z.string().nullable().optional(),
    sortOrder: z.number().int().optional(),
    enabled: z.boolean().optional(),
  });

  export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
    const session = await requireAdmin(req);
    if (session instanceof Response) return session;
    const { id } = await ctx.params;
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues.map((i) => i.message).join('; ') },
        { status: 400 },
      );
    }
    const db = await getDb();
    const orgId = await getOrgId(db);
    const [existing] = await db
      .select()
      .from(announcements)
      .where(and(eq(announcements.id, id), eq(announcements.orgId, orgId)));
    if (!existing) return Response.json({ error: 'Not found' }, { status: 404 });
    if (Object.keys(parsed.data).length === 0) return Response.json({ data: existing });
    const [announcement] = await db
      .update(announcements)
      .set(parsed.data)
      .where(and(eq(announcements.id, id), eq(announcements.orgId, orgId)))
      .returning();
    getHub().broadcast({ type: 'data.updated', domain: 'announcements' });
    return Response.json({ data: announcement });
  }

  export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
    const session = await requireAdmin(req);
    if (session instanceof Response) return session;
    const { id } = await ctx.params;
    const db = await getDb();
    const orgId = await getOrgId(db);
    const [existing] = await db
      .select()
      .from(announcements)
      .where(and(eq(announcements.id, id), eq(announcements.orgId, orgId)));
    if (!existing) return Response.json({ error: 'Not found' }, { status: 404 });
    await db
      .delete(announcements)
      .where(and(eq(announcements.id, id), eq(announcements.orgId, orgId)));
    getHub().broadcast({ type: 'data.updated', domain: 'announcements' });
    return Response.json({ data: { id } });
  }
  ```

- [ ] **Step 9: 实现 goals 两个路由文件(metric/period 枚举)**

  创建 `src/app/api/goals/route.ts`(metric 枚举复用 `METRICS`,period 仅 `month|quarter`):

  ```ts
  import { z } from 'zod';
  import { desc, eq } from 'drizzle-orm';
  import { getDb } from '@/lib/db';
  import { getOrgId } from '@/lib/db/org';
  import { goals } from '@/lib/db/schema';
  import { requireAdmin } from '@/lib/auth/session';
  import { getHub } from '@/lib/ws/hub';
  import { METRICS } from '@/lib/types';

  const createSchema = z.object({
    metric: z.enum(METRICS),
    targetValue: z.number().int().positive(),
    period: z.enum(['month', 'quarter']),
  });

  export async function GET(req: Request) {
    const session = await requireAdmin(req);
    if (session instanceof Response) return session;
    const db = await getDb();
    const orgId = await getOrgId(db);
    const rows = await db
      .select()
      .from(goals)
      .where(eq(goals.orgId, orgId))
      .orderBy(desc(goals.createdAt));
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
    const [goal] = await db
      .insert(goals)
      .values({
        id: crypto.randomUUID(),
        orgId,
        metric: parsed.data.metric,
        targetValue: parsed.data.targetValue,
        period: parsed.data.period,
      })
      .returning();
    getHub().broadcast({ type: 'data.updated', domain: 'goals' });
    return Response.json({ data: goal });
  }
  ```

  创建 `src/app/api/goals/[id]/route.ts`:

  ```ts
  import { z } from 'zod';
  import { and, eq } from 'drizzle-orm';
  import { getDb } from '@/lib/db';
  import { getOrgId } from '@/lib/db/org';
  import { goals } from '@/lib/db/schema';
  import { requireAdmin } from '@/lib/auth/session';
  import { getHub } from '@/lib/ws/hub';
  import { METRICS } from '@/lib/types';

  const patchSchema = z.object({
    metric: z.enum(METRICS).optional(),
    targetValue: z.number().int().positive().optional(),
    period: z.enum(['month', 'quarter']).optional(),
    active: z.boolean().optional(),
  });

  export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
    const session = await requireAdmin(req);
    if (session instanceof Response) return session;
    const { id } = await ctx.params;
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues.map((i) => i.message).join('; ') },
        { status: 400 },
      );
    }
    const db = await getDb();
    const orgId = await getOrgId(db);
    const [existing] = await db
      .select()
      .from(goals)
      .where(and(eq(goals.id, id), eq(goals.orgId, orgId)));
    if (!existing) return Response.json({ error: 'Not found' }, { status: 404 });
    if (Object.keys(parsed.data).length === 0) return Response.json({ data: existing });
    const [goal] = await db
      .update(goals)
      .set(parsed.data)
      .where(and(eq(goals.id, id), eq(goals.orgId, orgId)))
      .returning();
    getHub().broadcast({ type: 'data.updated', domain: 'goals' });
    return Response.json({ data: goal });
  }

  export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
    const session = await requireAdmin(req);
    if (session instanceof Response) return session;
    const { id } = await ctx.params;
    const db = await getDb();
    const orgId = await getOrgId(db);
    const [existing] = await db
      .select()
      .from(goals)
      .where(and(eq(goals.id, id), eq(goals.orgId, orgId)));
    if (!existing) return Response.json({ error: 'Not found' }, { status: 404 });
    await db.delete(goals).where(and(eq(goals.id, id), eq(goals.orgId, orgId)));
    getHub().broadcast({ type: 'data.updated', domain: 'goals' });
    return Response.json({ data: { id } });
  }
  ```

- [ ] **Step 10: 运行测试确认通过 + 类型检查**

  ```bash
  npx vitest run tests/api/announcements-goals.test.ts
  npx vitest run tests/api/listings.test.ts tests/api/agents.test.ts tests/api/sales.test.ts
  npx tsc --noEmit
  ```

  预期:全部 PASS;tsc 无报错。

- [ ] **Step 11: 提交**

  ```bash
  git add src/app/api/announcements src/app/api/goals tests/api/announcements-goals.test.ts
  git commit -m "feat: add announcements and goals CRUD APIs"
  ```
### Task 13: Screens 管理与 TV 注册 API

电视端无令牌时调用 `POST /api/tv/register` 领取 6 位配对码;管理员通过 `POST /api/screens/pair` 认领配对码并签发设备令牌(经 hub 推送 `paired` 事件给电视);`GET /api/screens` 列出屏幕及在线状态;`PATCH/DELETE /api/screens/[id]` 改名与解绑。依赖已完成的 Task 3(hub/protocol)、Task 6(pairing 助手)、Task 7(requireAdmin 与测试 helpers)。

**Files:**
- Create: `src/app/api/tv/register/route.ts`
- Create: `src/app/api/screens/route.ts`
- Create: `src/app/api/screens/pair/route.ts`
- Create: `src/app/api/screens/[id]/route.ts`
- Test: `tests/api/screens.test.ts`

- [ ] **Step 1: 编写失败测试 tests/api/screens.test.ts**

  测试直接 import 各 route handler 并用 `new Request(...)` 调用(契约测试约定)。fake socket 实现 `HubSocket` 接口并记录收到的消息,先以 pending 状态 register 到 hub,验证 pair 成功后 `paired` 事件送达且事件里的裸 token 哈希后等于库中 `device_token_hash`。完整文件内容:

  ```ts
  import { beforeEach, describe, expect, it } from 'vitest';
  import { eq } from 'drizzle-orm';
  import { freshDb, seedBasics, type Basics } from '../helpers/db';
  import { authedRequest, jsonRequest } from '../helpers/request';
  import type { Db } from '@/lib/db';
  import { screens } from '@/lib/db/schema';
  import { getHub, type HubSocket } from '@/lib/ws/hub';
  import { PAIR_CODE_ALPHABET, hashToken } from '@/lib/domain/pairing';
  import { POST as registerPost } from '@/app/api/tv/register/route';
  import { GET as screensGet } from '@/app/api/screens/route';
  import { POST as pairPost } from '@/app/api/screens/pair/route';
  import { DELETE as screenDelete, PATCH as screenPatch } from '@/app/api/screens/[id]/route';

  type FakeSocket = HubSocket & { sent: string[]; closed: boolean };

  function fakeSocket(): FakeSocket {
    const s: FakeSocket = {
      sent: [],
      closed: false,
      send(data: string) { s.sent.push(data); },
      close() { s.closed = true; },
    };
    return s;
  }

  function eventsOf(s: FakeSocket): any[] {
    return s.sent.map((m) => JSON.parse(m));
  }

  describe('screens & tv register API', () => {
    let db: Db;
    let basics: Basics;

    beforeEach(async () => {
      db = await freshDb();
      basics = await seedBasics(db);
    });

    it('POST /api/tv/register creates a pending screen with a 6-char uppercase code', async () => {
      const res = await registerPost();
      expect(res.status).toBe(200);
      const { data } = await res.json();
      expect(data.pairCode).toHaveLength(6);
      for (const ch of data.pairCode as string) {
        expect(PAIR_CODE_ALPHABET).toContain(ch);
      }
      expect(new Date(data.expiresAt).getTime()).toBeGreaterThan(Date.now());
      const rows = await db.select().from(screens).where(eq(screens.id, data.screenId));
      expect(rows[0]?.status).toBe('pending');
      expect(rows[0]?.pairCode).toBe(data.pairCode);
      expect(rows[0]?.pairCode).toBe(String(data.pairCode).toUpperCase());
    });

    it('POST /api/tv/register purges expired pending rows', async () => {
      const staleId = crypto.randomUUID();
      await db.insert(screens).values({
        id: staleId,
        orgId: basics.orgId,
        pairCode: 'AAAAAA',
        pairCodeExpiresAt: new Date(Date.now() - 60_000),
        status: 'pending',
      });
      const res = await registerPost();
      expect(res.status).toBe(200);
      const stale = await db.select().from(screens).where(eq(screens.id, staleId));
      expect(stale).toHaveLength(0);
    });

    it('POST /api/screens/pair accepts a lowercase code and pushes paired event with the raw token', async () => {
      const reg = await (await registerPost()).json();
      const screenId = reg.data.screenId as string;
      const code = reg.data.pairCode as string;

      const sock = fakeSocket();
      getHub().register(screenId, sock, false); // TV is connected, still pending

      const res = await pairPost(await authedRequest('/api/screens/pair', {
        method: 'POST',
        body: { pairCode: code.toLowerCase(), name: 'Lobby TV' },
      }));
      expect(res.status).toBe(200);
      const { data } = await res.json();
      expect(data).toEqual({ id: screenId, name: 'Lobby TV' });

      const paired = eventsOf(sock).find((e) => e.type === 'paired');
      expect(paired).toBeDefined();
      expect(paired.screen).toEqual({ id: screenId, name: 'Lobby TV' });
      expect(typeof paired.deviceToken).toBe('string');

      const row = (await db.select().from(screens).where(eq(screens.id, screenId)))[0]!;
      expect(row.status).toBe('paired');
      expect(row.pairCode).toBeNull();
      expect(row.pairCodeExpiresAt).toBeNull();
      expect(row.deviceTokenHash).toBe(hashToken(paired.deviceToken));
    });

    it('pairing an expired code returns 400 Invalid or expired code', async () => {
      const id = crypto.randomUUID();
      await db.insert(screens).values({
        id,
        orgId: basics.orgId,
        pairCode: 'BBBBBB',
        pairCodeExpiresAt: new Date(Date.now() - 1000),
        status: 'pending',
      });
      const res = await pairPost(await authedRequest('/api/screens/pair', {
        method: 'POST',
        body: { pairCode: 'BBBBBB', name: 'X' },
      }));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('Invalid or expired code');
    });

    it('pairing an unknown code returns 400 Invalid or expired code', async () => {
      const res = await pairPost(await authedRequest('/api/screens/pair', {
        method: 'POST',
        body: { pairCode: 'ZZZZZZ', name: 'X' },
      }));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('Invalid or expired code');
    });

    it('GET /api/screens reports hub online status', async () => {
      const reg = await (await registerPost()).json();
      const screenId = reg.data.screenId as string;
      getHub().register(screenId, fakeSocket(), false);

      const res = await screensGet(await authedRequest('/api/screens'));
      expect(res.status).toBe(200);
      const { data } = await res.json();
      const row = data.find((s: any) => s.id === screenId);
      expect(row).toMatchObject({ id: screenId, status: 'pending', online: true });
      expect(row).toHaveProperty('name');
      expect(row).toHaveProperty('lastSeenAt');
    });

    it('GET /api/screens without session returns 401', async () => {
      const res = await screensGet(jsonRequest('/api/screens'));
      expect(res.status).toBe(401);
    });

    it('PATCH /api/screens/[id] renames and pushes screen.updated', async () => {
      const id = crypto.randomUUID();
      await db.insert(screens).values({
        id, orgId: basics.orgId, name: 'Old Name',
        deviceTokenHash: hashToken('tok-1'), status: 'paired',
      });
      const sock = fakeSocket();
      getHub().register(id, sock, true);

      const res = await screenPatch(
        await authedRequest(`/api/screens/${id}`, { method: 'PATCH', body: { name: 'Front Desk' } }),
        { params: Promise.resolve({ id }) },
      );
      expect(res.status).toBe(200);
      expect((await res.json()).data).toEqual({ id, name: 'Front Desk' });

      const evt = eventsOf(sock).find((e) => e.type === 'screen.updated');
      expect(evt).toBeDefined();
      expect(evt.screen).toEqual({ id, name: 'Front Desk' });
    });

    it('DELETE /api/screens/[id] deletes the row and pushes screen.unpaired', async () => {
      const id = crypto.randomUUID();
      await db.insert(screens).values({
        id, orgId: basics.orgId, name: 'Doomed TV',
        deviceTokenHash: hashToken('tok-2'), status: 'paired',
      });
      const sock = fakeSocket();
      getHub().register(id, sock, true);

      const res = await screenDelete(
        await authedRequest(`/api/screens/${id}`, { method: 'DELETE' }),
        { params: Promise.resolve({ id }) },
      );
      expect(res.status).toBe(200);
      expect((await res.json()).data).toEqual({ id });
      expect(eventsOf(sock).some((e) => e.type === 'screen.unpaired')).toBe(true);
      expect(await db.select().from(screens).where(eq(screens.id, id))).toHaveLength(0);
    });

    it('PATCH /api/screens/[id] with unknown id returns 404', async () => {
      const res = await screenPatch(
        await authedRequest('/api/screens/nope', { method: 'PATCH', body: { name: 'X' } }),
        { params: Promise.resolve({ id: 'nope' }) },
      );
      expect(res.status).toBe(404);
      expect((await res.json()).error).toBe('Not found');
    });
  });
  ```

- [ ] **Step 2: 运行测试确认失败**

  ```bash
  npx vitest run tests/api/screens.test.ts
  ```

  预期 FAIL:`Error: Failed to resolve import "@/app/api/tv/register/route" from "tests/api/screens.test.ts". Does the file exist?`(四个 route 文件尚不存在)。

- [ ] **Step 3: 实现 src/app/api/tv/register/route.ts**

  无需认证。先删除已过期的 pending 行(避免僵尸记录堆积),再创建新 pending 行。`generatePairCode()` 产出的码本身就来自大写字母表,`.toUpperCase()` 是对"大写存储"约定的显式保证。完整文件内容:

  ```ts
  import { and, eq, lte } from 'drizzle-orm';
  import { getDb } from '@/lib/db';
  import { getOrgId } from '@/lib/db/org';
  import { screens } from '@/lib/db/schema';
  import { generatePairCode, pairCodeExpiry } from '@/lib/domain/pairing';

  export async function POST(): Promise<Response> {
    const db = await getDb();
    const orgId = await getOrgId(db);
    const now = new Date();

    // Purge expired pending rows so abandoned codes do not pile up.
    // lte matches isPairCodeExpired (now >= expiresAt counts as expired).
    await db.delete(screens).where(
      and(eq(screens.status, 'pending'), lte(screens.pairCodeExpiresAt, now)),
    );

    const id = crypto.randomUUID();
    const pairCode = generatePairCode().toUpperCase();
    const expiresAt = pairCodeExpiry(now);
    await db.insert(screens).values({
      id,
      orgId,
      pairCode,
      pairCodeExpiresAt: expiresAt,
      status: 'pending',
    });

    return Response.json({
      data: { screenId: id, pairCode, expiresAt: expiresAt.toISOString() },
    });
  }
  ```

- [ ] **Step 4: 实现 src/app/api/screens/route.ts(GET)**

  `online` 字段来自 `getHub().isOnline(id)`。完整文件内容:

  ```ts
  import { asc, eq } from 'drizzle-orm';
  import { getDb } from '@/lib/db';
  import { getOrgId } from '@/lib/db/org';
  import { screens } from '@/lib/db/schema';
  import { requireAdmin } from '@/lib/auth/session';
  import { getHub } from '@/lib/ws/hub';

  export async function GET(req: Request): Promise<Response> {
    const session = await requireAdmin(req);
    if (session instanceof Response) return session;

    const db = await getDb();
    const orgId = await getOrgId(db);
    const hub = getHub();

    const rows = await db.select().from(screens)
      .where(eq(screens.orgId, orgId))
      .orderBy(asc(screens.createdAt));

    const data = rows.map((s) => ({
      id: s.id,
      name: s.name,
      status: s.status,
      online: hub.isOnline(s.id),
      lastSeenAt: s.lastSeenAt ? s.lastSeenAt.toISOString() : null,
    }));
    return Response.json({ data });
  }
  ```

- [ ] **Step 5: 实现 src/app/api/screens/pair/route.ts(POST)**

  大小写不敏感:比对前 `toUpperCase()`(库中存的是大写)。找不到或已过期一律 400 `Invalid or expired code`,不区分两种失败(避免暴露码是否存在)。成功后:生成裸 token → 存哈希 → 置 paired 并清空配对码 → 先 `sendToScreen` 推 `paired` 事件(此时连接在 hub 中仍是 pending,`sendToScreen` 不论 paired 与否都会送达)→ 再 `markPaired`。完整文件内容:

  ```ts
  import { z } from 'zod';
  import { and, eq } from 'drizzle-orm';
  import { getDb } from '@/lib/db';
  import { screens } from '@/lib/db/schema';
  import { requireAdmin } from '@/lib/auth/session';
  import { getHub } from '@/lib/ws/hub';
  import { generateDeviceToken, hashToken, isPairCodeExpired } from '@/lib/domain/pairing';

  const bodySchema = z.object({
    pairCode: z.string().min(1),
    name: z.string().min(1),
  });

  export async function POST(req: Request): Promise<Response> {
    const session = await requireAdmin(req);
    if (session instanceof Response) return session;

    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return Response.json({ error: 'Invalid body' }, { status: 400 });
    }
    const { pairCode, name } = parsed.data;

    const db = await getDb();
    const code = pairCode.toUpperCase();
    const rows = await db.select().from(screens)
      .where(and(eq(screens.pairCode, code), eq(screens.status, 'pending')))
      .limit(1);
    const row = rows[0];
    if (!row || !row.pairCodeExpiresAt || isPairCodeExpired(row.pairCodeExpiresAt, new Date())) {
      return Response.json({ error: 'Invalid or expired code' }, { status: 400 });
    }

    const token = generateDeviceToken();
    await db.update(screens).set({
      name,
      deviceTokenHash: hashToken(token),
      status: 'paired',
      pairCode: null,
      pairCodeExpiresAt: null,
    }).where(eq(screens.id, row.id));

    const hub = getHub();
    hub.sendToScreen(row.id, {
      type: 'paired',
      deviceToken: token,
      screen: { id: row.id, name },
    });
    hub.markPaired(row.id);

    return Response.json({ data: { id: row.id, name } });
  }
  ```

- [ ] **Step 6: 实现 src/app/api/screens/[id]/route.ts(PATCH + DELETE)**

  Next.js 15 的动态参数是 Promise,必须 `await ctx.params`。完整文件内容:

  ```ts
  import { z } from 'zod';
  import { eq } from 'drizzle-orm';
  import { getDb } from '@/lib/db';
  import { screens } from '@/lib/db/schema';
  import { requireAdmin } from '@/lib/auth/session';
  import { getHub } from '@/lib/ws/hub';

  const patchSchema = z.object({ name: z.string().min(1) });

  export async function PATCH(
    req: Request,
    ctx: { params: Promise<{ id: string }> },
  ): Promise<Response> {
    const session = await requireAdmin(req);
    if (session instanceof Response) return session;
    const { id } = await ctx.params;

    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return Response.json({ error: 'Invalid body' }, { status: 400 });
    }

    const db = await getDb();
    const rows = await db.update(screens)
      .set({ name: parsed.data.name })
      .where(eq(screens.id, id))
      .returning();
    const row = rows[0];
    if (!row) return Response.json({ error: 'Not found' }, { status: 404 });

    getHub().sendToScreen(id, { type: 'screen.updated', screen: { id, name: row.name } });
    return Response.json({ data: { id, name: row.name } });
  }

  export async function DELETE(
    req: Request,
    ctx: { params: Promise<{ id: string }> },
  ): Promise<Response> {
    const session = await requireAdmin(req);
    if (session instanceof Response) return session;
    const { id } = await ctx.params;

    const db = await getDb();
    const rows = await db.delete(screens).where(eq(screens.id, id)).returning();
    if (!rows[0]) return Response.json({ error: 'Not found' }, { status: 404 });

    getHub().sendToScreen(id, { type: 'screen.unpaired' });
    return Response.json({ data: { id } });
  }
  ```

- [ ] **Step 7: 运行测试确认通过**

  ```bash
  npx vitest run tests/api/screens.test.ts
  ```

  预期输出:`Test Files  1 passed`、`Tests  10 passed`。

- [ ] **Step 8: 提交**

  ```bash
  git add src/app/api/tv/register/route.ts src/app/api/screens/route.ts src/app/api/screens/pair/route.ts "src/app/api/screens/[id]/route.ts" tests/api/screens.test.ts
  git commit -m "feat: screens management and tv pairing api routes"
  ```

---

### Task 14: 服务器装配(bootstrap + server.ts)

自定义 Node 服务器:同端口承载 Next handler 与 `/ws` WebSocket 升级。`withNext:false` 模式专供集成测试(不加载 Next,普通 HTTP 一律 404,仅 `/ws` 可用)。集成测试用真实 `ws` 客户端跑通三条链路:pending 配对流、paired 令牌重连+广播、无效令牌被拒。依赖 Task 3(hub/protocol)、Task 6(pairing)、Task 13(pair route)。

**Files:**
- Create: `src/server/bootstrap.ts`
- Create: `server.ts`
- Test: `tests/server/ws-integration.test.ts`

- [ ] **Step 1: 编写失败集成测试 tests/server/ws-integration.test.ts**

  `startServer(0, { withNext: false })` 用端口 0 让系统分配随机端口,再从 `server.address()` 取实际端口。服务器、route handler、hub、内存库全部在同一 vitest 进程内,共享 globalThis 单例。hello 处理是异步的,用 `waitFor(() => getHub().isOnline(id))` 等注册完成后再触发事件。完整文件内容:

  ```ts
  import { afterAll, beforeAll, describe, expect, it } from 'vitest';
  import type { Server } from 'node:http';
  import type { AddressInfo } from 'node:net';
  import WebSocket from 'ws';
  import { eq } from 'drizzle-orm';
  import { freshDb, seedBasics, type Basics } from '../helpers/db';
  import { authedRequest } from '../helpers/request';
  import type { Db } from '@/lib/db';
  import { screens } from '@/lib/db/schema';
  import { getHub } from '@/lib/ws/hub';
  import { generateDeviceToken, hashToken, pairCodeExpiry } from '@/lib/domain/pairing';
  import { startServer } from '@/server/bootstrap';
  import { POST as pairPost } from '@/app/api/screens/pair/route';

  let db: Db;
  let basics: Basics;
  let server: Server;
  let port: number;

  function connect(): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      ws.on('open', () => resolve(ws));
      ws.on('error', reject);
    });
  }

  /** Start collecting parsed JSON messages from a socket. */
  function collectMessages(ws: WebSocket): any[] {
    const messages: any[] = [];
    ws.on('message', (raw) => messages.push(JSON.parse(raw.toString())));
    return messages;
  }

  async function waitFor(cond: () => boolean, timeoutMs = 5000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!cond()) {
      if (Date.now() > deadline) throw new Error('waitFor timed out');
      await new Promise((r) => setTimeout(r, 25));
    }
  }

  beforeAll(async () => {
    db = await freshDb();
    basics = await seedBasics(db);
    server = await startServer(0, { withNext: false }); // port 0 → random free port
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  });

  describe('ws integration (real server, real sockets)', () => {
    it('scenario 1: pending hello then admin pair pushes paired event to the socket', async () => {
      const screenId = crypto.randomUUID();
      await db.insert(screens).values({
        id: screenId,
        orgId: basics.orgId,
        pairCode: 'ABC234',
        pairCodeExpiresAt: pairCodeExpiry(new Date()),
        status: 'pending',
      });

      const ws = await connect();
      const messages = collectMessages(ws);
      ws.send(JSON.stringify({ type: 'hello', screenId, pairCode: 'ABC234' }));
      await waitFor(() => getHub().isOnline(screenId));

      const res = await pairPost(await authedRequest('/api/screens/pair', {
        method: 'POST',
        body: { pairCode: 'abc234', name: 'Reception TV' },
      }));
      expect(res.status).toBe(200);

      await waitFor(() => messages.some((m) => m.type === 'paired'));
      const paired = messages.find((m) => m.type === 'paired');
      expect(paired.screen).toEqual({ id: screenId, name: 'Reception TV' });
      const row = (await db.select().from(screens).where(eq(screens.id, screenId)))[0]!;
      expect(hashToken(paired.deviceToken)).toBe(row.deviceTokenHash);
      ws.close();
    });

    it('scenario 2: paired reconnect via deviceToken receives broadcasts', async () => {
      const token = generateDeviceToken();
      const screenId = crypto.randomUUID();
      await db.insert(screens).values({
        id: screenId,
        orgId: basics.orgId,
        name: 'Kitchen TV',
        deviceTokenHash: hashToken(token),
        status: 'paired',
      });

      const ws = await connect();
      const messages = collectMessages(ws);
      ws.send(JSON.stringify({ type: 'hello', deviceToken: token }));
      await waitFor(() => getHub().isOnline(screenId));

      getHub().broadcast({ type: 'config.updated' });
      await waitFor(() => messages.some((m) => m.type === 'config.updated'));
      ws.close();
    });

    it('scenario 3: invalid token gets screen.unpaired then the connection closes', async () => {
      const ws = await connect();
      const messages = collectMessages(ws);
      const closed = new Promise<void>((resolve) => ws.on('close', () => resolve()));
      ws.send(JSON.stringify({ type: 'hello', deviceToken: 'not-a-real-token' }));
      await closed;
      expect(messages.some((m) => m.type === 'screen.unpaired')).toBe(true);
    });

    it('malformed frames are ignored and ping gets pong', async () => {
      const token = generateDeviceToken();
      const screenId = crypto.randomUUID();
      await db.insert(screens).values({
        id: screenId,
        orgId: basics.orgId,
        name: 'Bar TV',
        deviceTokenHash: hashToken(token),
        status: 'paired',
      });

      const ws = await connect();
      const messages = collectMessages(ws);
      ws.send('this is not json'); // must be silently ignored
      ws.send(JSON.stringify({ type: 'hello', deviceToken: token }));
      await waitFor(() => getHub().isOnline(screenId));

      ws.send(JSON.stringify({ type: 'ping' }));
      await waitFor(() => messages.some((m) => m.type === 'pong'));
      ws.close();
    });
  });
  ```

- [ ] **Step 2: 运行测试确认失败**

  ```bash
  npx vitest run tests/server/ws-integration.test.ts
  ```

  预期 FAIL:`Error: Failed to resolve import "@/server/bootstrap" from "tests/server/ws-integration.test.ts". Does the file exist?`。

- [ ] **Step 3: 实现 src/server/bootstrap.ts**

  要点:`next` 用动态 import,只在 `withNext` 时加载(集成测试不碰 Next);hello 5 秒超时用 `setTimeout` + `clearTimeout`;`JSON.parse` 包 try/catch,非法消息直接忽略;zod `clientEventSchema.safeParse` 过滤不合规事件;ping 的 lastSeenAt 更新 fire-and-forget(drizzle 查询是 thenable,必须调 `.then` 才会执行)。**顶部必须先加载 `.env`**:`getDb()` 在 `await import('next')` 之前执行,若靠 Next 加载 .env,建库时 `DATABASE_URL` 尚未进入 `process.env`,会静默回落到 PGlite。完整文件内容:

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

  // Env-dependent code below reads process.env lazily (inside functions), so the
  // hoisted imports above finishing before loadEnvConfig runs is safe.

  const HELLO_TIMEOUT_MS = 5000;

  export async function startServer(
    port: number,
    opts: { withNext?: boolean } = {},
  ): Promise<http.Server> {
    const withNext = opts.withNext ?? true;
    const db = await getDb(); // runs migrations on first boot
    const hub = getHub();

    let nextHandle:
      | ((req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>)
      | null = null;
    let nextUpgrade:
      | ((req: http.IncomingMessage, socket: Duplex, head: Buffer) => Promise<void>)
      | null = null;

    if (withNext) {
      const { default: next } = await import('next');
      const app = next({ dev: process.env.NODE_ENV !== 'production' });
      await app.prepare();
      nextHandle = app.getRequestHandler();
      nextUpgrade = app.getUpgradeHandler();
    }

    const server = http.createServer((req, res) => {
      if (nextHandle) {
        void nextHandle(req, res);
      } else {
        res.statusCode = 404;
        res.end('Not found');
      }
    });

    const wss = new WebSocketServer({ noServer: true });

    wss.on('connection', (ws: WebSocket) => {
      let screenId: string | null = null;
      const helloTimer = setTimeout(() => ws.close(), HELLO_TIMEOUT_MS);

      const handleHello = async (event: Extract<ClientEvent, { type: 'hello' }>) => {
        clearTimeout(helloTimer);

        if (event.deviceToken) {
          const rows = await db.select().from(screens)
            .where(and(
              eq(screens.deviceTokenHash, hashToken(event.deviceToken)),
              eq(screens.status, 'paired'),
            ))
            .limit(1);
          const row = rows[0];
          if (!row) {
            try { ws.send(JSON.stringify({ type: 'screen.unpaired' })); } catch { /* ignore */ }
            ws.close();
            return;
          }
          screenId = row.id;
          hub.register(row.id, ws, true);
          await db.update(screens).set({ lastSeenAt: new Date() })
            .where(eq(screens.id, row.id));
          return;
        }

        if (event.screenId && event.pairCode) {
          const rows = await db.select().from(screens)
            .where(eq(screens.id, event.screenId)).limit(1);
          const row = rows[0];
          if (
            !row ||
            row.status !== 'pending' ||
            !row.pairCode ||
            !row.pairCodeExpiresAt ||
            row.pairCode !== event.pairCode.toUpperCase() ||
            isPairCodeExpired(row.pairCodeExpiresAt, new Date())
          ) {
            ws.close();
            return;
          }
          screenId = row.id;
          hub.register(row.id, ws, false);
          return;
        }

        ws.close();
      };

      ws.on('message', (raw) => {
        let json: unknown;
        try {
          json = JSON.parse(raw.toString());
        } catch {
          return; // ignore malformed frames
        }
        const parsed = clientEventSchema.safeParse(json);
        if (!parsed.success) return;
        const event = parsed.data;

        if (event.type === 'hello') {
          void handleHello(event);
        } else if (event.type === 'ping') {
          try { ws.send(JSON.stringify({ type: 'pong' })); } catch { /* ignore */ }
          if (screenId) {
            const id = screenId;
            // fire-and-forget heartbeat persistence
            db.update(screens).set({ lastSeenAt: new Date() })
              .where(eq(screens.id, id))
              .then(() => undefined, () => undefined);
          }
        }
      });

      ws.on('close', () => {
        clearTimeout(helloTimer);
        hub.unregister(ws);
      });
    });

    server.on('upgrade', (req, socket, head) => {
      const { pathname } = new URL(req.url ?? '/', 'http://localhost');
      if (pathname === '/ws') {
        wss.handleUpgrade(req, socket, head, (client) => {
          wss.emit('connection', client, req);
        });
      } else if (nextUpgrade) {
        void nextUpgrade(req, socket, head); // dev HMR websocket
      } else {
        socket.destroy();
      }
    });

    await new Promise<void>((resolve) => server.listen(port, resolve));
    return server;
  }
  ```

- [ ] **Step 4: 创建根目录 server.ts(契约权威全文,原样照抄)**

  根目录文件用相对路径 import。完整文件内容:

  ```ts
  import { startServer } from './src/server/bootstrap';
  const port = Number(process.env.PORT) || 3000;
  startServer(port).then(() => console.log(`> Ready on http://localhost:${port}`));
  ```

- [ ] **Step 5: 运行测试确认通过**

  ```bash
  npx vitest run tests/server/ws-integration.test.ts
  ```

  预期输出:`Test Files  1 passed`、`Tests  4 passed`。

- [ ] **Step 6: 全量类型检查**

  ```bash
  npx tsc --noEmit
  ```

  预期:无输出、退出码 0(server.ts 与 bootstrap.ts 均纳入 tsconfig include)。

- [ ] **Step 7: 提交**

  ```bash
  git add src/server/bootstrap.ts server.ts tests/server/ws-integration.test.ts
  git commit -m "feat: custom server bootstrap with websocket wiring"
  ```

---

### Task 15: TV state API

电视端的全量数据拉取端点:`GET /api/tv/state`,以 `x-device-token` 头认证(hashToken 后查 paired screen,无效 401),组装 `TvStateResponse`:三个榜单、goal 进度、active 房源(联销售员名)、enabled 公告、周期标签。依赖 Task 5(leaderboard/periods)、Task 9(settings)、Task 13(screens 行)。

**Files:**
- Modify: `src/lib/types.ts`(追加 `TvStateResponse`)
- Create: `src/app/api/tv/state/route.ts`
- Test: `tests/api/tv-state.test.ts`

- [ ] **Step 1: 编写失败测试 tests/api/tv-state.test.ts**

  种子:seedBasics 提供 Alice,再插入 Bob;Alice 两笔本月成交(GCI 各 100000 分)、Bob 一笔(GCI 500000 分)→ sales_count 榜 Alice value=2 rank=1,gci 榜 Bob rank=1;goal(sales_count,target 10)→ currentValue=3、percent=30;房源一 active 一 sold → 只返回 active 且带 agentName;公告两条 enabled(按 sortOrder)一条 disabled。日期用本地时区字符串(不能用 `toISOString().slice(0,10)`,UTC 偏移会在换日边界翻车)。periodLabel 断言直接调用同一个 `periodLabel('month', new Date())`,避免硬编码日期。完整文件内容:

  ```ts
  import { beforeEach, describe, expect, it } from 'vitest';
  import { freshDb, seedBasics, type Basics } from '../helpers/db';
  import { jsonRequest } from '../helpers/request';
  import type { Db } from '@/lib/db';
  import { agents, announcements, goals, listings, sales, screens } from '@/lib/db/schema';
  import { generateDeviceToken, hashToken } from '@/lib/domain/pairing';
  import { periodLabel } from '@/lib/domain/periods';
  import { GET as tvStateGet } from '@/app/api/tv/state/route';

  function localDateStr(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  describe('GET /api/tv/state', () => {
    let db: Db;
    let basics: Basics;
    let token: string;
    let screenId: string;

    beforeEach(async () => {
      db = await freshDb();
      basics = await seedBasics(db);
      token = generateDeviceToken();
      screenId = crypto.randomUUID();
      await db.insert(screens).values({
        id: screenId,
        orgId: basics.orgId,
        name: 'Lobby TV',
        deviceTokenHash: hashToken(token),
        status: 'paired',
      });
    });

    function stateRequest(t?: string): Request {
      return jsonRequest('/api/tv/state', { headers: t ? { 'x-device-token': t } : {} });
    }

    it('rejects missing or invalid token with 401', async () => {
      expect((await tvStateGet(stateRequest())).status).toBe(401);
      expect((await tvStateGet(stateRequest('wrong-token'))).status).toBe(401);
    });

    it('returns computed leaderboards, goals, listings, announcements and period label', async () => {
      const today = localDateStr(new Date());
      const bobId = crypto.randomUUID();
      await db.insert(agents).values({ id: bobId, orgId: basics.orgId, name: 'Bob Ray' });

      // Alice: two sales; Bob: one sale with a bigger GCI.
      await db.insert(sales).values([
        { id: crypto.randomUUID(), orgId: basics.orgId, agentId: basics.agentId, address: '1 Main St', salePriceCents: 50000000, gciCents: 100000, saleDate: today },
        { id: crypto.randomUUID(), orgId: basics.orgId, agentId: basics.agentId, address: '2 Main St', salePriceCents: 60000000, gciCents: 100000, saleDate: today },
        { id: crypto.randomUUID(), orgId: basics.orgId, agentId: bobId, address: '3 High St', salePriceCents: 90000000, gciCents: 500000, saleDate: today },
      ]);
      await db.insert(listings).values([
        { id: crypto.randomUUID(), orgId: basics.orgId, agentId: basics.agentId, address: '10 Beach Rd', listPriceCents: 80000000, listedDate: today, status: 'active' },
        { id: crypto.randomUUID(), orgId: basics.orgId, agentId: bobId, address: '11 Beach Rd', listPriceCents: 90000000, listedDate: today, status: 'sold' },
      ]);
      await db.insert(goals).values({
        id: crypto.randomUUID(), orgId: basics.orgId, metric: 'sales_count', targetValue: 10, period: 'month', active: true,
      });
      await db.insert(announcements).values([
        { id: crypto.randomUUID(), orgId: basics.orgId, title: 'Enabled news', sortOrder: 2, enabled: true },
        { id: crypto.randomUUID(), orgId: basics.orgId, title: 'First news', sortOrder: 1, enabled: true },
        { id: crypto.randomUUID(), orgId: basics.orgId, title: 'Hidden news', sortOrder: 0, enabled: false },
      ]);

      const res = await tvStateGet(stateRequest(token));
      expect(res.status).toBe(200);
      const { data } = await res.json();

      expect(data.screen).toEqual({ id: screenId, name: 'Lobby TV' });
      expect(data.settings.leaderboardPeriod).toBe('month');
      expect(data.periodLabel).toBe(periodLabel('month', new Date()));

      // sales_count board: Alice (2 sales) first, Bob (1 sale) second.
      const sc = data.leaderboards.sales_count;
      expect(sc[0]).toMatchObject({ agentId: basics.agentId, value: 2, rank: 1 });
      expect(sc[1]).toMatchObject({ agentId: bobId, value: 1, rank: 2 });

      // gci board: Bob's 500000 cents beats Alice's 200000.
      const gci = data.leaderboards.gci;
      expect(gci[0]).toMatchObject({ agentId: bobId, value: 500000, rank: 1 });
      expect(gci[1]).toMatchObject({ agentId: basics.agentId, value: 200000, rank: 2 });

      // listings board: 1 each; tie broken by higher in-period GCI → Bob first.
      const lb = data.leaderboards.listings;
      expect(lb).toHaveLength(2);
      expect(lb[0]).toMatchObject({ agentId: bobId, value: 1, rank: 1 });

      // goal progress: 3 of 10 sales → 30%.
      expect(data.goals).toHaveLength(1);
      expect(data.goals[0]).toMatchObject({
        metric: 'sales_count', period: 'month', targetValue: 10, currentValue: 3, percent: 30,
      });

      // tv listings: active only, joined agent name.
      expect(data.listings).toHaveLength(1);
      expect(data.listings[0]).toMatchObject({
        address: '10 Beach Rd', listPriceCents: 80000000, agentName: 'Alice Ng',
      });

      // announcements: enabled only, sortOrder asc.
      expect(data.announcements.map((a: any) => a.title)).toEqual(['First news', 'Enabled news']);
    });

    it('caps goal percent at 100', async () => {
      const today = localDateStr(new Date());
      await db.insert(sales).values([
        { id: crypto.randomUUID(), orgId: basics.orgId, agentId: basics.agentId, address: '4 Low St', salePriceCents: 10000000, gciCents: 50000, saleDate: today },
        { id: crypto.randomUUID(), orgId: basics.orgId, agentId: basics.agentId, address: '5 Low St', salePriceCents: 10000000, gciCents: 50000, saleDate: today },
        { id: crypto.randomUUID(), orgId: basics.orgId, agentId: basics.agentId, address: '6 Low St', salePriceCents: 10000000, gciCents: 50000, saleDate: today },
      ]);
      await db.insert(goals).values({
        id: crypto.randomUUID(), orgId: basics.orgId, metric: 'sales_count', targetValue: 2, period: 'month', active: true,
      });

      const res = await tvStateGet(stateRequest(token));
      const { data } = await res.json();
      expect(data.goals[0].currentValue).toBe(3);
      expect(data.goals[0].percent).toBe(100); // 150% capped
    });
  });
  ```

- [ ] **Step 2: 运行测试确认失败**

  ```bash
  npx vitest run tests/api/tv-state.test.ts
  ```

  预期 FAIL:`Error: Failed to resolve import "@/app/api/tv/state/route" from "tests/api/tv-state.test.ts". Does the file exist?`。

- [ ] **Step 3: 在 src/lib/types.ts 追加 TvStateResponse**

  先确认该类型尚未存在(存在则跳过本步):

  ```bash
  grep -n "TvStateResponse" src/lib/types.ts || echo "not present"
  ```

  在文件**顶部**添加 type-only import(与 settings.ts 形成的循环仅是类型级,编译后擦除,无运行时问题):

  ```ts
  import type { SettingsData } from './settings';
  ```

  在文件**末尾**追加:

  ```ts
  export type TvStateResponse = {
    screen: TvScreenInfo;
    settings: SettingsData;
    leaderboards: Record<Metric, LeaderboardEntry[]>;  // all three metrics
    goals: GoalProgress[];                              // active only
    listings: TvListing[];                              // status='active', listedDate desc, limit 8
    announcements: TvAnnouncement[];                    // enabled only, sortOrder asc
    periodLabel: string;                                // periodLabel(settings.leaderboardPeriod, now)
  };
  ```

- [ ] **Step 4: 实现 src/app/api/tv/state/route.ts**

  认证:`x-device-token` 头 → `hashToken` → 查 `status='paired'` 的 screen 行,查不到 401。org 直接取 screen 行上的 `orgId`(与 getOrgId 单租户等价,且天然多租户正确)。榜单输入喂该 org 全量 agents/sales/listings 行,周期过滤由 `computeLeaderboard` 内部完成;goal 各自按 `periodRange(goal.period)` 用 `computeMetricTotal` 算 currentValue,percent 四舍五入且 cap 100。完整文件内容:

  ```ts
  import { and, asc, desc, eq } from 'drizzle-orm';
  import { getDb } from '@/lib/db';
  import { agents, announcements, goals, listings, sales, screens } from '@/lib/db/schema';
  import { hashToken } from '@/lib/domain/pairing';
  import { computeLeaderboard, computeMetricTotal, type LeaderboardInputs } from '@/lib/domain/leaderboard';
  import { periodLabel, periodRange } from '@/lib/domain/periods';
  import { getSettings } from '@/lib/settings';
  import type { GoalProgress, Metric, TvAnnouncement, TvListing, TvStateResponse } from '@/lib/types';

  export async function GET(req: Request): Promise<Response> {
    const token = req.headers.get('x-device-token');
    if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const db = await getDb();
    const screenRows = await db.select().from(screens)
      .where(and(
        eq(screens.deviceTokenHash, hashToken(token)),
        eq(screens.status, 'paired'),
      ))
      .limit(1);
    const screen = screenRows[0];
    if (!screen) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const orgId = screen.orgId;
    const now = new Date();
    const settings = await getSettings(db, orgId);

    const agentRows = await db.select().from(agents).where(eq(agents.orgId, orgId));
    const saleRows = await db.select().from(sales).where(eq(sales.orgId, orgId));
    const listingRows = await db.select().from(listings).where(eq(listings.orgId, orgId));

    const inputs: LeaderboardInputs = {
      agents: agentRows.map((a) => ({
        id: a.id, name: a.name, photoUrl: a.photoUrl, active: a.active,
      })),
      sales: saleRows.map((s) => ({
        agentId: s.agentId, gciCents: s.gciCents, saleDate: s.saleDate, createdAt: s.createdAt,
      })),
      listings: listingRows.map((l) => ({ agentId: l.agentId, listedDate: l.listedDate })),
    };

    const range = periodRange(settings.leaderboardPeriod, now);
    const leaderboards: TvStateResponse['leaderboards'] = {
      sales_count: computeLeaderboard(inputs, 'sales_count', range),
      gci: computeLeaderboard(inputs, 'gci', range),
      listings: computeLeaderboard(inputs, 'listings', range),
    };

    const goalRows = await db.select().from(goals)
      .where(and(eq(goals.orgId, orgId), eq(goals.active, true)));
    const goalProgress: GoalProgress[] = goalRows.map((g) => {
      const metric = g.metric as Metric;
      const period = g.period as 'month' | 'quarter';
      const currentValue = computeMetricTotal(inputs, metric, periodRange(period, now));
      const percent = g.targetValue > 0
        ? Math.min(100, Math.round((currentValue / g.targetValue) * 100))
        : 100;
      return { id: g.id, metric, period, targetValue: g.targetValue, currentValue, percent };
    });

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
      .limit(8);

    const annRows = await db.select().from(announcements)
      .where(and(eq(announcements.orgId, orgId), eq(announcements.enabled, true)))
      .orderBy(asc(announcements.sortOrder));
    const tvAnnouncements: TvAnnouncement[] = annRows.map((a) => ({
      id: a.id, title: a.title, body: a.body, imageUrl: a.imageUrl,
    }));

    const data: TvStateResponse = {
      screen: { id: screen.id, name: screen.name },
      settings,
      leaderboards,
      goals: goalProgress,
      listings: tvListings,
      announcements: tvAnnouncements,
      periodLabel: periodLabel(settings.leaderboardPeriod, now),
    };
    return Response.json({ data });
  }
  ```

- [ ] **Step 5: 运行测试确认通过,并做全量类型检查**

  ```bash
  npx vitest run tests/api/tv-state.test.ts
  npx tsc --noEmit
  ```

  预期:`Test Files  1 passed`、`Tests  3 passed`;tsc 无输出、退出码 0。

- [ ] **Step 6: 提交**

  ```bash
  git add src/lib/types.ts src/app/api/tv/state/route.ts tests/api/tv-state.test.ts
  git commit -m "feat: tv state api endpoint"
  ```
### Task 16: TV Socket Hook 与配对/启动/离线界面

本任务交付电视端的 WebSocket 连接 hook(注册→配对流、token 重连流、指数退避、心跳、解绑与配对码过期处理)以及三个纯 UI 组件。按契约任务表,hook 无单元测试——其纯逻辑部分由 Task 17 的 reducer 测试覆盖,连接行为由 Task 26 的 E2E 覆盖,因此本任务用"实现 → `npx tsc --noEmit` 验证 → commit"的顺序。

**Files:**
- Create: `src/hooks/useTvSocket.ts`
- Create: `src/components/tv/PairingScreen.tsx`
- Create: `src/components/tv/StartOverlay.tsx`
- Create: `src/components/tv/OfflineBadge.tsx`
- Test: 无单测(契约任务表安排:界面由 E2E 覆盖);验证命令为 `npx tsc --noEmit`

- [ ] **Step 1: 创建 `src/hooks/useTvSocket.ts`(完整实现)**

  行为要点(与契约 §13 一致):localStorage key 为 `tv_device_token` / `tv_screen_name`;无 token 时 `POST /api/tv/register` 拿 `{ data: { screenId, pairCode, expiresAt } }` 后连 WS 发 `hello {screenId, pairCode}`(phase='pairing'),收到 `paired` 事件存 token 转 phase='paired';有 token 时直接 `hello {deviceToken}`(phase='paired')。断线且 token 存在 → phase='offline' 并指数退避重连(1s、2s、4s…30s 封顶,加 0–30% 抖动);断线且无 token → 同样退避后重新 register。收 `screen.unpaired` → 清 localStorage → 立即重新 register。pairCode 到 `expiresAt` 仍未配对 → `setTimeout` 触发重新 register 换新码。每 30 秒发 `{type:'ping'}`。handlers 存在 `useRef` 中,避免重连闭包捕获过期回调。WS 地址:`location.protocol === 'https:' ? 'wss' : 'ws'` + `location.host` + `/ws`。

  ```ts
  'use client';

  import { useEffect, useRef, useState } from 'react';
  import type { CelebrationPayload, DataDomain, ServerEvent } from '@/lib/ws/protocol';
  import type { TvScreenInfo } from '@/lib/types';

  export type TvPhase = 'connecting' | 'pairing' | 'paired' | 'offline';

  export type TvSocketHandlers = {
    onCelebration(p: CelebrationPayload): void;
    onDataUpdated(domain: DataDomain): void;
    onConfigUpdated(): void;
    onPaired(screen: TvScreenInfo): void;
    onUnpaired(): void;
  };

  export type TvSocketState = { phase: TvPhase; pairCode: string | null; screen: TvScreenInfo | null };

  const TOKEN_KEY = 'tv_device_token';
  const NAME_KEY = 'tv_screen_name';
  const PING_INTERVAL_MS = 30_000;
  const BACKOFF_BASE_MS = 1_000;
  const BACKOFF_MAX_MS = 30_000;

  type RegisterResponse = { data: { screenId: string; pairCode: string; expiresAt: string } };

  export function useTvSocket(handlers: TvSocketHandlers): TvSocketState {
    const [state, setState] = useState<TvSocketState>({ phase: 'connecting', pairCode: null, screen: null });

    // Keep the latest handlers in a ref so reconnect closures never call stale callbacks.
    const handlersRef = useRef(handlers);
    handlersRef.current = handlers;

    useEffect(() => {
      let stopped = false;
      let ws: WebSocket | null = null;
      let attempts = 0;
      let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
      let pingTimer: ReturnType<typeof setInterval> | null = null;
      let expiryTimer: ReturnType<typeof setTimeout> | null = null;

      const wsUrl = () => `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;

      const stopPing = () => {
        if (pingTimer !== null) { clearInterval(pingTimer); pingTimer = null; }
      };

      const clearExpiry = () => {
        if (expiryTimer !== null) { clearTimeout(expiryTimer); expiryTimer = null; }
      };

      /** Close the current socket without triggering its onclose reconnect logic. */
      const dropSocket = () => {
        if (ws) {
          ws.onclose = null;
          ws.onmessage = null;
          ws.onerror = null;
          try { ws.close(); } catch { /* ignore */ }
          ws = null;
        }
        stopPing();
      };

      /** Exponential backoff: 1s, 2s, 4s ... capped at 30s, plus 0-30% jitter. */
      const scheduleRetry = (fn: () => void) => {
        const base = Math.min(BACKOFF_BASE_MS * 2 ** attempts, BACKOFF_MAX_MS);
        const jitter = Math.random() * 0.3 * base;
        attempts += 1;
        reconnectTimer = setTimeout(fn, base + jitter);
      };

      const handleEvent = (event: ServerEvent) => {
        switch (event.type) {
          case 'paired':
            localStorage.setItem(TOKEN_KEY, event.deviceToken);
            localStorage.setItem(NAME_KEY, event.screen.name);
            clearExpiry();
            setState({ phase: 'paired', pairCode: null, screen: event.screen });
            handlersRef.current.onPaired(event.screen);
            break;
          case 'celebration.play':
            handlersRef.current.onCelebration(event.celebration);
            break;
          case 'data.updated':
            handlersRef.current.onDataUpdated(event.domain);
            break;
          case 'config.updated':
            handlersRef.current.onConfigUpdated();
            break;
          case 'screen.updated':
            localStorage.setItem(NAME_KEY, event.screen.name);
            setState((s) => ({ ...s, screen: event.screen }));
            break;
          case 'screen.unpaired':
            // Admin unpaired this TV: forget the token and go get a fresh pair code.
            localStorage.removeItem(TOKEN_KEY);
            localStorage.removeItem(NAME_KEY);
            handlersRef.current.onUnpaired();
            dropSocket();
            clearExpiry();
            attempts = 0;
            setState({ phase: 'connecting', pairCode: null, screen: null });
            void register();
            break;
          case 'pong':
            break;
        }
      };

      const openSocket = (hello: Record<string, unknown>, phaseOnOpen: TvPhase) => {
        dropSocket();
        const socket = new WebSocket(wsUrl());
        ws = socket;
        socket.onopen = () => {
          if (stopped) return;
          attempts = 0;
          socket.send(JSON.stringify({ type: 'hello', ...hello }));
          setState((s) => ({ ...s, phase: phaseOnOpen }));
          pingTimer = setInterval(() => {
            if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'ping' }));
          }, PING_INTERVAL_MS);
        };
        socket.onmessage = (ev) => {
          if (stopped) return;
          try {
            handleEvent(JSON.parse(String(ev.data)) as ServerEvent);
          } catch (err) {
            console.warn('tv socket: bad message', err);
          }
        };
        socket.onerror = () => {
          try { socket.close(); } catch { /* ignore */ }
        };
        socket.onclose = () => {
          if (stopped || ws !== socket) return;
          ws = null;
          stopPing();
          const token = localStorage.getItem(TOKEN_KEY);
          if (token) {
            setState((s) => ({ ...s, phase: 'offline' }));
            scheduleRetry(connect);
          } else {
            clearExpiry();
            setState({ phase: 'connecting', pairCode: null, screen: null });
            scheduleRetry(() => void register());
          }
        };
      };

      async function register(): Promise<void> {
        if (stopped) return;
        try {
          const res = await fetch('/api/tv/register', { method: 'POST' });
          if (!res.ok) throw new Error(`register failed: ${res.status}`);
          const json = (await res.json()) as RegisterResponse;
          if (stopped) return;
          const { screenId, pairCode, expiresAt } = json.data;
          setState({ phase: 'connecting', pairCode, screen: null });
          clearExpiry();
          const untilExpiry = new Date(expiresAt).getTime() - Date.now();
          expiryTimer = setTimeout(() => {
            // Pair code expired unclaimed: drop this registration and fetch a fresh code.
            dropSocket();
            attempts = 0;
            void register();
          }, Math.max(untilExpiry, 1_000));
          openSocket({ screenId, pairCode }, 'pairing');
        } catch {
          if (stopped) return;
          scheduleRetry(() => void register());
        }
      }

      function connect(): void {
        if (stopped) return;
        const token = localStorage.getItem(TOKEN_KEY);
        if (!token) {
          void register();
          return;
        }
        openSocket({ deviceToken: token }, 'paired');
      }

      connect();

      return () => {
        stopped = true;
        if (reconnectTimer !== null) clearTimeout(reconnectTimer);
        clearExpiry();
        dropSocket();
      };
    }, []);

    return state;
  }
  ```

- [ ] **Step 2: 创建 `src/components/tv/PairingScreen.tsx`**

  全屏居中:大标题 "PAIR THIS SCREEN";6 位配对码用超大 `font-display` + `neon-text` 逐字符盒子展示;副文案 "Enter this code in the admin panel → Screens";`pairCode` 为 null 时显示 "CONNECTING…"。

  ```tsx
  'use client';

  export function PairingScreen({ pairCode }: { pairCode: string | null }) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-12 bg-bg">
        <h1 className="font-display text-5xl tracking-[0.3em] text-neon neon-text">
          PAIR THIS SCREEN
        </h1>
        {pairCode ? (
          <div className="flex gap-4">
            {pairCode.split('').map((ch, i) => (
              <div
                key={i}
                className="neon-border flex h-40 w-32 items-center justify-center rounded-xl bg-panel font-display text-8xl text-neon neon-text"
              >
                {ch}
              </div>
            ))}
          </div>
        ) : (
          <div className="font-display text-6xl text-muted">CONNECTING…</div>
        )}
        <p className="font-heading text-2xl text-muted">
          Enter this code in the admin panel → Screens
        </p>
      </div>
    );
  }

  export default PairingScreen;
  ```

- [ ] **Step 3: 创建 `src/components/tv/StartOverlay.tsx`**

  全屏黑底居中霓虹按钮 "CLICK TO START";点击后请求全屏(失败静默忽略)再回调 `onStart`(用于解锁音频)。

  ```tsx
  'use client';

  export function StartOverlay({ onStart }: { onStart: () => void }) {
    const handleClick = () => {
      document.documentElement.requestFullscreen().catch(() => {});
      onStart();
    };
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black">
        <button
          onClick={handleClick}
          className="neon-border rounded-2xl border-2 border-neon bg-panel px-16 py-8 font-display text-5xl tracking-[0.2em] text-neon neon-text"
        >
          CLICK TO START
        </button>
      </div>
    );
  }

  export default StartOverlay;
  ```

- [ ] **Step 4: 创建 `src/components/tv/OfflineBadge.tsx`**

  固定在右下角的半透明小徽章:琥珀色圆点 + "OFFLINE"。

  ```tsx
  'use client';

  export function OfflineBadge() {
    return (
      <div className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-panel/70 px-4 py-2">
        <span className="h-3 w-3 rounded-full bg-amber-400" />
        <span className="font-heading text-sm tracking-widest text-amber-400">OFFLINE</span>
      </div>
    );
  }

  export default OfflineBadge;
  ```

- [ ] **Step 5: 类型检查验证**

  ```bash
  npx tsc --noEmit
  ```

  预期:无任何输出,退出码 0(`echo $?` 输出 `0`)。若报错,按报错文件行号修正后重跑,直至通过。

- [ ] **Step 6: 提交**

  ```bash
  git add src/hooks/useTvSocket.ts src/components/tv/PairingScreen.tsx src/components/tv/StartOverlay.tsx src/components/tv/OfflineBadge.tsx
  git commit -m "feat: add tv socket hook and pairing/start/offline components"
  ```

---

### Task 17: 轮播 Reducer(carousel.ts)

纯函数轮播状态机,契约 §12 权威签名。规则:`tick` 仅 rotate 模式生效,倒计时归零翻页(取模 wrap);`celebration` 打断 rotate(保留被打断页剩余毫秒),celebrate 中再来则 FIFO 入队;`celebrationDone` 出队下一个,队列空则回 rotate 且剩余时间不足 3000ms 时抬到 3000ms(避免瞬间翻页);`setSlides` 替换页面列表、index 取模夹紧、剩余时间重置为当前页时长、不打断 celebrate;空 slides 数组全程安全。TDD:先写失败测试再实现。

**Files:**
- Create: `src/lib/carousel.ts`
- Test: `tests/carousel.test.ts`

- [ ] **Step 1: 写失败测试 `tests/carousel.test.ts`(完整代码)**

  ```ts
  import { describe, it, expect } from 'vitest';
  import { initCarousel, carouselReducer, type CarouselSlide, type CarouselState } from '@/lib/carousel';
  import type { CelebrationPayload } from '@/lib/ws/protocol';

  const slides: CarouselSlide[] = [
    { key: 'leaderboard_sales_count', durationSec: 10 },
    { key: 'leaderboard_gci', durationSec: 15 },
    { key: 'goal_progress', durationSec: 5 },
  ];

  const altSlides: CarouselSlide[] = [
    { key: 'listings', durationSec: 12 },
    { key: 'announcements', durationSec: 8 },
  ];

  function payload(id: string): CelebrationPayload {
    return {
      saleId: id,
      agentName: 'Alice Ng',
      agentPhotoUrl: null,
      address: '1 Test St, Sydney',
      salePriceCents: 100_000_000,
      anthemUrl: null,
      durationSec: 18,
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
      expect(s.current?.saleId).toBe('sale-1');
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
      expect(s.current?.saleId).toBe('sale-1');
      expect(s.queue.map((p) => p.saleId)).toEqual(['sale-2', 'sale-3']);
    });
  });

  describe('celebrationDone', () => {
    it('dequeues the next celebration when the queue is non-empty', () => {
      let s = carouselReducer(initCarousel(slides), { type: 'celebration', payload: payload('sale-1') });
      s = carouselReducer(s, { type: 'celebration', payload: payload('sale-2') });
      s = carouselReducer(s, { type: 'celebrationDone' });
      expect(s.mode).toBe('celebrate');
      expect(s.current?.saleId).toBe('sale-2');
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
      expect(s.current?.saleId).toBe('sale-2');
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
      expect(s.current?.saleId).toBe('sale-1');
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
  ```

- [ ] **Step 2: 运行测试,确认按预期失败**

  ```bash
  npx vitest run tests/carousel.test.ts
  ```

  预期:FAIL。失败原因为模块解析错误——`Failed to resolve import "@/lib/carousel" from "tests/carousel.test.ts"`(`src/lib/carousel.ts` 尚不存在)。

- [ ] **Step 3: 实现 `src/lib/carousel.ts`(完整代码)**

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
    | { type: 'setSlides'; slides: CarouselSlide[] };

  const MIN_RESUME_MS = 3_000;

  export function initCarousel(slides: CarouselSlide[]): CarouselState {
    return {
      slides,
      index: 0,
      remainingMs: slides.length > 0 ? slides[0].durationSec * 1000 : 0,
      mode: 'rotate',
      current: null,
      queue: [],
    };
  }

  export function carouselReducer(state: CarouselState, event: CarouselEvent): CarouselState {
    switch (event.type) {
      case 'tick': {
        if (state.mode !== 'rotate' || state.slides.length === 0) return state;
        const remaining = state.remainingMs - event.dtMs;
        if (remaining > 0) return { ...state, remainingMs: remaining };
        const index = (state.index + 1) % state.slides.length;
        return { ...state, index, remainingMs: state.slides[index].durationSec * 1000 };
      }
      case 'celebration': {
        if (state.mode === 'celebrate') {
          return { ...state, queue: [...state.queue, event.payload] };
        }
        // Interrupt rotate; remainingMs of the interrupted slide is preserved untouched.
        return { ...state, mode: 'celebrate', current: event.payload };
      }
      case 'celebrationDone': {
        if (state.queue.length > 0) {
          const [next, ...rest] = state.queue;
          return { ...state, current: next, queue: rest };
        }
        return {
          ...state,
          mode: 'rotate',
          current: null,
          remainingMs: state.remainingMs < MIN_RESUME_MS ? MIN_RESUME_MS : state.remainingMs,
        };
      }
      case 'setSlides': {
        const slides = event.slides;
        if (slides.length === 0) {
          return { ...state, slides, index: 0, remainingMs: 0 };
        }
        const index = state.index % slides.length;
        return { ...state, slides, index, remainingMs: slides[index].durationSec * 1000 };
      }
    }
  }
  ```

- [ ] **Step 4: 运行测试与类型检查,确认全部通过**

  ```bash
  npx vitest run tests/carousel.test.ts
  npx tsc --noEmit
  ```

  预期:vitest 输出 `Test Files  1 passed (1)`、`Tests  17 passed (17)`;tsc 无输出、退出码 0。

- [ ] **Step 5: 提交**

  ```bash
  git add src/lib/carousel.ts tests/carousel.test.ts
  git commit -m "feat: add carousel reducer with celebration queue"
  ```
### Task 18: TV 四种轮播页(榜单 / 目标 / 房源 / 公告)

依赖:Task 3(types)、Task 5(format)、Task 16/17(仅顺序依赖,无 import 依赖)。本任务为纯 UI 组件(契约任务表标注 E2E 覆盖),按"实现 → 类型检查 → commit"顺序,不写单元测试。所有组件为 `'use client'`,props 严格按契约 §13,视觉按契约 §3 的 tailwind tokens(深底 `bg-bg`、`neon-text` 发光、金/银/铜高亮)。字号按 1080p 电视观看距离设计(榜单行名字与数值均为 `text-4xl` 级别)。

**Files:**
- Create: `src/components/tv/slides/LeaderboardSlide.tsx`
- Create: `src/components/tv/slides/GoalSlide.tsx`
- Create: `src/components/tv/slides/ListingsSlide.tsx`
- Create: `src/components/tv/slides/AnnouncementSlide.tsx`
- Test: 无(E2E 覆盖,见 Task 26)

- [ ] **Step 1: 创建 LeaderboardSlide 组件**

创建 `src/components/tv/slides/LeaderboardSlide.tsx`。标题行左侧为 `title`(font-display + 霓虹青发光),右侧为 `periodLabel`;每行:名次徽章(1/2/3 金银铜发光,其余 muted)、圆形头像(无照片时取 name 首字母,`bg-panel-2` + `border-neon` 圆盘)、姓名、`formatValue(metric, value)` 金额绿发光。前三名整行 `border-l-4` 金/银/铜高亮。行用 framer-motion `layout` 属性(数据更新时位置平滑过渡)+ 逐行 staggered 入场。数据为空显示居中 muted 的 "No data yet"。

```tsx
'use client';

import { motion } from 'framer-motion';
import type { LeaderboardEntry, Metric } from '@/lib/types';
import { formatValue } from '@/lib/format';

function rowBorderClass(rank: number): string {
  if (rank === 1) return 'border-gold';
  if (rank === 2) return 'border-silver';
  if (rank === 3) return 'border-bronze';
  return 'border-panel-2';
}

function rankBadgeClass(rank: number): string {
  if (rank === 1) return 'text-gold neon-text';
  if (rank === 2) return 'text-silver neon-text';
  if (rank === 3) return 'text-bronze neon-text';
  return 'text-muted';
}

function Avatar({ name, photoUrl }: { name: string; photoUrl: string | null }) {
  if (photoUrl) {
    return <img src={photoUrl} alt={name} className="h-14 w-14 rounded-full object-cover" />;
  }
  return (
    <span className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-neon bg-panel-2 font-display text-2xl text-neon">
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

export default function LeaderboardSlide({
  title,
  metric,
  entries,
  periodLabel,
}: {
  title: string;
  metric: Metric;
  entries: LeaderboardEntry[];
  periodLabel: string;
}) {
  return (
    <div className="flex h-full w-full flex-col px-24 py-12">
      <div className="flex items-baseline justify-between">
        <h1 className="font-display text-6xl text-neon neon-text">{title}</h1>
        <span className="font-heading text-3xl text-muted">{periodLabel}</span>
      </div>
      {entries.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-4xl text-muted">No data yet</p>
        </div>
      ) : (
        <div className="mt-10 flex flex-1 flex-col justify-start gap-3">
          {entries.map((entry, i) => (
            <motion.div
              key={entry.agentId}
              layout
              initial={{ opacity: 0, x: -40 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.06, duration: 0.35 }}
              className={`flex items-center gap-8 rounded-lg border-l-4 bg-panel px-8 py-2 ${rowBorderClass(entry.rank)}`}
            >
              <span className={`w-16 text-center font-display text-4xl ${rankBadgeClass(entry.rank)}`}>
                {entry.rank}
              </span>
              <Avatar name={entry.name} photoUrl={entry.photoUrl} />
              <span className="flex-1 truncate font-heading text-4xl text-ink">{entry.name}</span>
              <span className="font-display text-4xl text-money neon-text">
                {formatValue(metric, entry.value)}
              </span>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 创建 GoalSlide 组件**

创建 `src/components/tv/slides/GoalSlide.tsx`。标题固定为 "TEAM GOALS"(契约 §13 slide 标题文案)。每个 goal 一张 panel 卡:指标名大写标题(SALES / GCI / LISTINGS)+ 周期副标题(THIS MONTH / THIS QUARTER)、`currentValue / targetValue` 用 `formatValue` 展示、大进度条(`bg-panel-2` 底、neon→neon-purple 渐变填充、宽度 `percent%`、发光)、右侧 `percent%` 大数字。进度条用 framer-motion 从 0 动画到目标宽度。

```tsx
'use client';

import { motion } from 'framer-motion';
import type { GoalProgress } from '@/lib/types';
import { formatValue } from '@/lib/format';

const METRIC_LABELS: Record<GoalProgress['metric'], string> = {
  sales_count: 'SALES',
  gci: 'GCI',
  listings: 'LISTINGS',
};

const PERIOD_LABELS: Record<GoalProgress['period'], string> = {
  month: 'THIS MONTH',
  quarter: 'THIS QUARTER',
};

export default function GoalSlide({ goals }: { goals: GoalProgress[] }) {
  return (
    <div className="flex h-full w-full flex-col px-24 py-12">
      <h1 className="font-display text-6xl text-neon neon-text">TEAM GOALS</h1>
      {goals.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-4xl text-muted">No data yet</p>
        </div>
      ) : (
        <div className="mt-12 flex flex-1 flex-col justify-center gap-10">
          {goals.map((goal, i) => (
            <motion.div
              key={goal.id}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.12, duration: 0.4 }}
              className="rounded-xl bg-panel p-10"
            >
              <div className="flex items-baseline justify-between">
                <h2 className="font-heading text-4xl text-ink">
                  {METRIC_LABELS[goal.metric]}{' '}
                  <span className="text-2xl text-muted">{PERIOD_LABELS[goal.period]}</span>
                </h2>
                <span className="font-display text-3xl text-ink">
                  {formatValue(goal.metric, goal.currentValue)}{' '}
                  <span className="text-muted">/ {formatValue(goal.metric, goal.targetValue)}</span>
                </span>
              </div>
              <div className="mt-6 flex items-center gap-8">
                <div className="h-10 flex-1 overflow-hidden rounded-full bg-panel-2">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-neon to-neon-purple"
                    style={{ boxShadow: '0 0 16px rgba(0, 229, 255, 0.8)' }}
                    initial={{ width: 0 }}
                    animate={{ width: `${goal.percent}%` }}
                    transition={{ delay: 0.3 + i * 0.12, duration: 0.8, ease: 'easeOut' }}
                  />
                </div>
                <span className="w-40 text-right font-display text-5xl text-neon neon-text">
                  {goal.percent}%
                </span>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: 创建 ListingsSlide 组件**

创建 `src/components/tv/slides/ListingsSlide.tsx`。标题固定 "HOT LISTINGS"。2×4 网格卡片(API 最多返回 8 条,slice 兜底):房源照片或占位块(`bg-panel-2` + 🏠 emoji)、地址、`formatMoney(listPriceCents)` 霓虹青发光、agentName muted。

```tsx
'use client';

import { motion } from 'framer-motion';
import type { TvListing } from '@/lib/types';
import { formatMoney } from '@/lib/format';

export default function ListingsSlide({ listings }: { listings: TvListing[] }) {
  return (
    <div className="flex h-full w-full flex-col px-16 py-12">
      <h1 className="font-display text-6xl text-neon neon-text">HOT LISTINGS</h1>
      {listings.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-4xl text-muted">No data yet</p>
        </div>
      ) : (
        <div className="mt-10 grid flex-1 grid-cols-4 grid-rows-2 gap-6">
          {listings.slice(0, 8).map((listing, i) => (
            <motion.div
              key={listing.id}
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.07, duration: 0.35 }}
              className="flex flex-col overflow-hidden rounded-xl bg-panel"
            >
              {listing.photoUrl ? (
                <img src={listing.photoUrl} alt={listing.address} className="h-48 w-full object-cover" />
              ) : (
                <div className="flex h-48 w-full items-center justify-center bg-panel-2 text-6xl">🏠</div>
              )}
              <div className="flex flex-1 flex-col justify-between p-5">
                <p className="font-heading text-2xl leading-tight text-ink">{listing.address}</p>
                <div className="mt-3">
                  <p className="font-display text-3xl text-neon neon-text">
                    {formatMoney(listing.listPriceCents)}
                  </p>
                  <p className="mt-1 text-xl text-muted">{listing.agentName}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: 创建 AnnouncementSlide 组件**

创建 `src/components/tv/slides/AnnouncementSlide.tsx`。标题固定 "TEAM NEWS"。垂直列表卡:title(font-heading)、body(muted 正文)、imageUrl 存在时右侧缩略图。

```tsx
'use client';

import { motion } from 'framer-motion';
import type { TvAnnouncement } from '@/lib/types';

export default function AnnouncementSlide({ announcements }: { announcements: TvAnnouncement[] }) {
  return (
    <div className="flex h-full w-full flex-col px-24 py-12">
      <h1 className="font-display text-6xl text-neon neon-text">TEAM NEWS</h1>
      {announcements.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-4xl text-muted">No data yet</p>
        </div>
      ) : (
        <div className="mt-10 flex flex-1 flex-col gap-6 overflow-hidden">
          {announcements.map((a, i) => (
            <motion.div
              key={a.id}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1, duration: 0.35 }}
              className="flex items-start gap-8 rounded-xl bg-panel p-8"
            >
              <div className="flex-1">
                <h2 className="font-heading text-4xl text-ink">{a.title}</h2>
                {a.body ? <p className="mt-3 text-2xl leading-relaxed text-muted">{a.body}</p> : null}
              </div>
              {a.imageUrl ? (
                <img src={a.imageUrl} alt={a.title} className="h-40 w-64 rounded-lg object-cover" />
              ) : null}
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: 类型检查验证**

```bash
npx tsc --noEmit
```

预期:无任何错误输出,退出码 0。若报 "Cannot find module '@/lib/format'" 之类错误,说明 Task 5 未完成或路径拼错,先修复再继续。

- [ ] **Step 6: 提交**

```bash
git add src/components/tv/slides/LeaderboardSlide.tsx src/components/tv/slides/GoalSlide.tsx src/components/tv/slides/ListingsSlide.tsx src/components/tv/slides/AnnouncementSlide.tsx
git commit -m "feat: add TV carousel slides (leaderboard, goals, listings, announcements)"
```

---

### Task 19: 庆祝弹屏与音频播放

依赖:Task 3(protocol 的 `CelebrationPayload`)、Task 5(format)。本任务为纯客户端 UI/音频(契约任务表标注 E2E 覆盖),按"实现 → 类型检查 → commit"顺序。产出:内置曲库清单(契约 §11)、`playAnthem()` 音频播放器(Web Audio 合成 + 文件播放两种路径)、全屏庆祝弹屏组件。

**Files:**
- Create: `src/lib/audio/anthems.ts`
- Create: `src/components/tv/audio.ts`
- Create: `src/components/tv/CelebrationOverlay.tsx`
- Test: 无(E2E 覆盖,见 Task 26)

- [ ] **Step 1: 创建内置曲库清单 anthems.ts**

创建 `src/lib/audio/anthems.ts`,内容按契约 §11 原样(`BUILTIN_ANTHEMS` 三首 + `isBuiltinAnthem`):

```ts
export type BuiltinAnthem = { id: string; name: string }; // id 形如 'builtin:victory'

export const BUILTIN_ANTHEMS: BuiltinAnthem[] = [
  { id: 'builtin:victory', name: 'Victory Fanfare' },
  { id: 'builtin:neon-rush', name: 'Neon Rush' },
  { id: 'builtin:champion', name: 'Champion Rise' },
];

export function isBuiltinAnthem(url: string | null): boolean {
  return url !== null && url.startsWith('builtin:');
}
```

- [ ] **Step 2: 创建音频播放器 audio.ts**

创建 `src/components/tv/audio.ts`。签名按契约 §11:`playAnthem(anthemUrl: string | null, volume: number): { stop(): void }`。行为:
- `anthemUrl` 为 null → 播 `'builtin:victory'`;
- `builtin:*` → Web Audio 合成:AudioContext 模块级单例;每个 id 一段硬编码旋律(8–12 音符 `{freq, dur}` 数组);每个音符用方波 + 锯齿波(低八度)双振荡器;gain envelope:0.01s attack 到峰值 → 衰减到 0.7 → 音符末释放到 0;整段旋律播完后循环重排(庆祝时长 10–30 秒远长于单遍旋律);
- 非 builtin URL → `new Audio(url)`,`audio.volume = volume`,`play().catch(console.warn)`;
- 一切失败静默(console.warn),不抛错;`stop()` 停掉所有振荡器/暂停 Audio。

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
  let loopTimer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const schedulePass = () => {
    if (stopped) return;
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
    const passMs = melody.reduce((sum, n) => sum + n.dur, 0) * 1000;
    loopTimer = setTimeout(schedulePass, passMs + 300);
  };

  try {
    schedulePass();
  } catch (err) {
    console.warn('Anthem synthesis failed', err);
  }

  return {
    stop() {
      stopped = true;
      if (loopTimer) clearTimeout(loopTimer);
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

- [ ] **Step 3: 创建 CelebrationOverlay 组件**

创建 `src/components/tv/CelebrationOverlay.tsx`。props 按契约 §13:`{ payload: CelebrationPayload; volume: number; onDone(): void }`。结构:`fixed inset-0 z-50`,径向渐变深底 + 霓虹光晕背景;20 个 CSS 粒子(绝对定位小方块,`@keyframes` 上飘旋转,neon 青 / gold 金两色交替,参数用确定性公式避免随机);内容自上而下:"🎉 SOLD! 🎉"(font-display 金色发光超大)、头像或首字母大圆盘(border-neon 发光)、agentName 特大霓虹青发光、address(text-ink)、`formatMoney(salePriceCents)` 金额绿特大发光。framer-motion scale+opacity 进出场(exit 依赖 TvApp 的 AnimatePresence 包裹)。`useEffect`:mount 时 `playAnthem(payload.anthemUrl ?? 'builtin:victory', volume)`,`setTimeout(durationSec * 1000)` 到时 `stop()` + `onDone()`;cleanup 时清 timer 并 `stop()`。

```tsx
'use client';

import { useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import type { CelebrationPayload } from '@/lib/ws/protocol';
import { formatMoney } from '@/lib/format';
import { playAnthem } from '@/components/tv/audio';

type Particle = { left: number; size: number; duration: number; delay: number; color: string };

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
    const player = playAnthem(payload.anthemUrl ?? 'builtin:victory', volume);
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

  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden"
      style={{ background: 'radial-gradient(circle at 50% 40%, rgba(0, 229, 255, 0.18), #0a0e1a 70%)' }}
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
      <p className="font-display text-8xl text-gold neon-text">🎉 SOLD! 🎉</p>
      <div className="mt-12">
        {payload.agentPhotoUrl ? (
          <img
            src={payload.agentPhotoUrl}
            alt={payload.agentName}
            className="h-48 w-48 rounded-full border-4 border-neon object-cover"
            style={{ boxShadow: '0 0 32px rgba(0, 229, 255, 0.8)' }}
          />
        ) : (
          <span
            className="flex h-48 w-48 items-center justify-center rounded-full border-4 border-neon bg-panel-2 font-display text-7xl text-neon"
            style={{ boxShadow: '0 0 32px rgba(0, 229, 255, 0.8)' }}
          >
            {payload.agentName.charAt(0).toUpperCase()}
          </span>
        )}
      </div>
      <p className="mt-8 font-display text-7xl text-neon neon-text">{payload.agentName}</p>
      <p className="mt-6 font-heading text-4xl text-ink">{payload.address}</p>
      <p className="mt-6 font-display text-8xl text-money neon-text">{formatMoney(payload.salePriceCents)}</p>
    </motion.div>
  );
}
```

- [ ] **Step 4: 类型检查验证**

```bash
npx tsc --noEmit
```

预期:无任何错误输出,退出码 0。

- [ ] **Step 5: 提交**

```bash
git add src/lib/audio/anthems.ts src/components/tv/audio.ts src/components/tv/CelebrationOverlay.tsx
git commit -m "feat: add celebration overlay with synthesized anthem playback"
```

---

### Task 20: TV 页装配(TvApp + /tv 路由)

依赖:Task 15(/api/tv/state)、Task 16(useTvSocket、PairingScreen、StartOverlay、OfflineBadge)、Task 17(carousel reducer)、Task 18(slides)、Task 19(CelebrationOverlay)。契约任务表标注 E2E 覆盖,按"实现 → 类型检查 → build → commit"顺序。数据流严格按契约 §13:phase 变 paired / onDataUpdated / onConfigUpdated → 带 `x-device-token` header 拉取 `/api/tv/state` 全量刷新;settings.slides(enabled 过滤)→ `dispatch setSlides`;celebration 事件 → `dispatch celebration`,`mode === 'celebrate'` 时叠加 CelebrationOverlay;首次渲染显示 StartOverlay,点击后才开始轮播 tick(此前 WS 已可连接、数据已可加载)。

**Files:**
- Create: `src/components/tv/TvApp.tsx`
- Create: `src/app/tv/page.tsx`
- Test: 无(E2E 覆盖,见 Task 26)

- [ ] **Step 1: 创建 TvApp 装配组件**

创建 `src/components/tv/TvApp.tsx`。要点:
- `useTvSocket` handlers 全部转成 dispatch / refreshState 调用(hook 内部用 ref 保存 handlers,可直接传内联函数);
- `refreshState`:从 localStorage 取 `tv_device_token`(契约 §13 的 key),带 `x-device-token` header fetch `/api/tv/state`,成功后 `setTvState` 并 dispatch `setSlides`(enabled 过滤后映射成 `{ key, durationSec }`);
- 250ms `setInterval` dispatch `{ type: 'tick', dtMs: 250 }`,仅在 `audioUnlocked && phase === 'paired'` 时运行;
- slide 渲染 switch:`leaderboard_sales_count` → LeaderboardSlide "SALES CHAMPIONS"、`leaderboard_gci` → "TOP EARNERS"、`leaderboard_listings` → "LISTING LEGENDS"(标题文案契约 §13),`goal_progress`/`listings`/`announcements` 对应组件;
- 当前 slide 用 `AnimatePresence mode="wait"` + key 淡入淡出切换;slides 为空或尚无数据显示居中 idle 文案;
- `phase === 'connecting' | 'pairing'` → PairingScreen;paired/offline 且未解锁 → StartOverlay 叠加;`mode === 'celebrate'` → CelebrationOverlay 叠加(音量取 `settings.volume`,无数据时兜底 0.8);`phase === 'offline'` → OfflineBadge 叠加(缓存数据继续轮播)。

```tsx
'use client';

import { useCallback, useEffect, useReducer, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTvSocket } from '@/hooks/useTvSocket';
import { carouselReducer, initCarousel } from '@/lib/carousel';
import type { TvStateResponse } from '@/lib/types';
import PairingScreen from '@/components/tv/PairingScreen';
import StartOverlay from '@/components/tv/StartOverlay';
import OfflineBadge from '@/components/tv/OfflineBadge';
import CelebrationOverlay from '@/components/tv/CelebrationOverlay';
import LeaderboardSlide from '@/components/tv/slides/LeaderboardSlide';
import GoalSlide from '@/components/tv/slides/GoalSlide';
import ListingsSlide from '@/components/tv/slides/ListingsSlide';
import AnnouncementSlide from '@/components/tv/slides/AnnouncementSlide';

export default function TvApp() {
  const [tvState, setTvState] = useState<TvStateResponse | null>(null);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [carousel, dispatch] = useReducer(carouselReducer, [], initCarousel);

  const refreshState = useCallback(async () => {
    const token = localStorage.getItem('tv_device_token');
    if (!token) return;
    try {
      const res = await fetch('/api/tv/state', { headers: { 'x-device-token': token } });
      if (!res.ok) return;
      const json = (await res.json()) as { data: TvStateResponse };
      setTvState(json.data);
      dispatch({
        type: 'setSlides',
        slides: json.data.settings.slides
          .filter((s) => s.enabled)
          .map((s) => ({ key: s.key, durationSec: s.durationSec })),
      });
    } catch (err) {
      console.warn('Failed to fetch TV state', err);
    }
  }, []);

  const socket = useTvSocket({
    onCelebration: (payload) => dispatch({ type: 'celebration', payload }),
    onDataUpdated: () => {
      void refreshState();
    },
    onConfigUpdated: () => {
      void refreshState();
    },
    onPaired: () => {
      void refreshState();
    },
    onUnpaired: () => setTvState(null),
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

  const handleCelebrationDone = useCallback(() => dispatch({ type: 'celebrationDone' }), []);

  if (socket.phase === 'connecting' || socket.phase === 'pairing') {
    return <PairingScreen pairCode={socket.pairCode} />;
  }

  const currentSlide = carousel.slides.length > 0 ? carousel.slides[carousel.index] : null;

  let slideContent: ReactNode = null;
  if (!tvState || !currentSlide) {
    slideContent = (
      <div className="flex h-full items-center justify-center">
        <p className="font-display text-5xl text-muted">SALES CHAMPIONS TV</p>
      </div>
    );
  } else {
    switch (currentSlide.key) {
      case 'leaderboard_sales_count':
        slideContent = (
          <LeaderboardSlide
            title="SALES CHAMPIONS"
            metric="sales_count"
            entries={tvState.leaderboards.sales_count}
            periodLabel={tvState.periodLabel}
          />
        );
        break;
      case 'leaderboard_gci':
        slideContent = (
          <LeaderboardSlide
            title="TOP EARNERS"
            metric="gci"
            entries={tvState.leaderboards.gci}
            periodLabel={tvState.periodLabel}
          />
        );
        break;
      case 'leaderboard_listings':
        slideContent = (
          <LeaderboardSlide
            title="LISTING LEGENDS"
            metric="listings"
            entries={tvState.leaderboards.listings}
            periodLabel={tvState.periodLabel}
          />
        );
        break;
      case 'goal_progress':
        slideContent = <GoalSlide goals={tvState.goals} />;
        break;
      case 'listings':
        slideContent = <ListingsSlide listings={tvState.listings} />;
        break;
      case 'announcements':
        slideContent = <AnnouncementSlide announcements={tvState.announcements} />;
        break;
    }
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

      <AnimatePresence>
        {carousel.mode === 'celebrate' && carousel.current ? (
          <CelebrationOverlay
            key={carousel.current.saleId}
            payload={carousel.current}
            volume={tvState ? tvState.settings.volume : 0.8}
            onDone={handleCelebrationDone}
          />
        ) : null}
      </AnimatePresence>

      {!audioUnlocked ? <StartOverlay onStart={() => setAudioUnlocked(true)} /> : null}
      {socket.phase === 'offline' ? <OfflineBadge /> : null}
    </div>
  );
}
```

- [ ] **Step 2: 创建 /tv 路由页面**

创建 `src/app/tv/page.tsx`。服务端组件外壳,文件顶部无 `'use client'`(TvApp 自带):

```tsx
import TvApp from '@/components/tv/TvApp';

export default function TvPage() {
  return <TvApp />;
}
```

- [ ] **Step 3: 类型检查验证**

```bash
npx tsc --noEmit
```

预期:无任何错误输出,退出码 0。常见错误排查:若报 PairingScreen/StartOverlay/OfflineBadge 无 default export,检查 Task 16 组件的导出方式(本计划全部 TV 组件统一 `export default`)。

- [ ] **Step 4: 生产构建验证**

```bash
npm run build
```

预期:输出含 `✓ Compiled successfully`,路由列表中出现 `/tv`,无类型或构建错误。

- [ ] **Step 5: 提交**

```bash
git add src/components/tv/TvApp.tsx src/app/tv/page.tsx
git commit -m "feat: assemble TV app page with carousel, celebration and pairing flow"
```
### Task 21: Admin 基础+仪表盘

**Files:**
- Create: `src/components/admin/ui.tsx`
- Create: `src/app/admin/login/page.tsx`
- Create: `src/app/admin/(dashboard)/layout.tsx`
- Create: `src/app/admin/(dashboard)/page.tsx`

前置:Task 7(auth 路由)、Task 10(agents API)、Task 11(sales API + replay)已完成。本任务是纯 UI 任务(契约任务表:E2E 覆盖登录),按「实现 → 类型检查/构建 → commit」顺序进行,不写单元测试。

- [ ] **Step 1: 创建共享 UI 组件库 `src/components/admin/ui.tsx`**

  契约 §18 规定的六个组件:`Field(label)`、`TextInput`、`Select`、`Button(variant: 'primary'|'danger'|'ghost')`、`Table`、`Modal(open, onClose, title)`。深色低饱和主题,纯 Tailwind,无第三方 UI 库。后续 Task 22–24 的所有后台页面都从这里取组件,导出名不得增减。

  ```tsx
  'use client';

  import type {
    ButtonHTMLAttributes,
    InputHTMLAttributes,
    ReactNode,
    SelectHTMLAttributes,
  } from 'react';

  export function Field({ label, children }: { label: string; children: ReactNode }) {
    return (
      <label className="block">
        <span className="mb-1 block text-sm text-muted">{label}</span>
        {children}
      </label>
    );
  }

  export function TextInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
    return (
      <input
        {...rest}
        className={`w-full rounded border border-panel-2 bg-bg px-3 py-2 text-sm text-ink outline-none focus:border-neon ${className ?? ''}`}
      />
    );
  }

  export function Select({ className, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
    return (
      <select
        {...rest}
        className={`w-full rounded border border-panel-2 bg-bg px-3 py-2 text-sm text-ink outline-none focus:border-neon ${className ?? ''}`}
      />
    );
  }

  const BUTTON_VARIANTS = {
    primary: 'border border-neon bg-neon/10 text-neon hover:bg-neon/20',
    danger: 'border border-red-500 bg-red-500/10 text-red-400 hover:bg-red-500/20',
    ghost: 'border border-panel-2 bg-transparent text-muted hover:border-muted hover:text-ink',
  } as const;

  export function Button({
    variant = 'primary',
    className,
    ...rest
  }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'danger' | 'ghost' }) {
    return (
      <button
        type="button"
        {...rest}
        className={`rounded px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${BUTTON_VARIANTS[variant]} ${className ?? ''}`}
      />
    );
  }

  export function Table({ headers, children }: { headers: string[]; children: ReactNode }) {
    return (
      <div className="overflow-x-auto rounded-lg border border-panel-2">
        <table className="w-full text-left text-sm">
          <thead className="bg-panel-2/60 text-muted">
            <tr>
              {headers.map((h) => (
                <th key={h} className="px-3 py-2 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-panel-2">{children}</tbody>
        </table>
      </div>
    );
  }

  export function Modal({
    open,
    onClose,
    title,
    children,
  }: {
    open: boolean;
    onClose(): void;
    title: string;
    children: ReactNode;
  }) {
    if (!open) return null;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
        <div
          className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-panel-2 bg-panel p-6"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-heading text-lg font-bold text-ink">{title}</h2>
            <button type="button" className="text-muted hover:text-ink" onClick={onClose} aria-label="Close">
              ✕
            </button>
          </div>
          {children}
        </div>
      </div>
    );
  }
  ```

  说明:`Button` 把 `type="button"` 放在 `{...rest}` 之前,调用方传 `type="submit"` 时会覆盖默认值;不传则不会意外触发表单提交。

- [ ] **Step 2: 创建登录页 `src/app/admin/login/page.tsx`**

  表单 POST `/api/auth/login`(body `{ email, password }`,契约 §14),成功后 `router.push('/admin')`(并 `router.refresh()` 让服务端布局重新读取新 cookie),失败显示响应里的 `error` 文本。

  ```tsx
  'use client';

  import { useState, type FormEvent } from 'react';
  import { useRouter } from 'next/navigation';
  import { Button, Field, TextInput } from '@/components/admin/ui';

  export default function LoginPage() {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    async function onSubmit(e: FormEvent) {
      e.preventDefault();
      setBusy(true);
      setError(null);
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      setBusy(false);
      if (res.ok) {
        router.push('/admin');
        router.refresh();
        return;
      }
      const body = (await res.json().catch(() => ({ error: 'Login failed' }))) as { error?: string };
      setError(body.error ?? 'Login failed');
    }

    return (
      <main className="flex min-h-screen items-center justify-center bg-bg p-4">
        <form
          onSubmit={onSubmit}
          className="w-full max-w-sm space-y-4 rounded-lg border border-panel-2 bg-panel p-8"
        >
          <h1 className="neon-text font-display text-xl text-neon">SALES CHAMPIONS</h1>
          <p className="text-sm text-muted">Admin sign in</p>
          <Field label="Email">
            <TextInput
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </Field>
          <Field label="Password">
            <TextInput
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </main>
    );
  }
  ```

- [ ] **Step 3: 创建会话守卫布局 `src/app/admin/(dashboard)/layout.tsx`**

  服务端组件。守卫逻辑内联实现(不给 `session.ts` 新增导出):Next.js 15 中 `cookies()` 返回 Promise,须 `await`;取 `SESSION_COOKIE` 的 seal 值后用 iron-session 的 `unsealData` 解封,任何异常或形状不对都视为未登录 → `redirect('/admin/login')`。左侧导航 7 项 + Logout。Logout 用内联 server action(form POST):清除会话 cookie(与契约 `sessionClearCookie()` 的属性一致:`Path=/; HttpOnly; SameSite=Lax; Max-Age=0`)后 `redirect('/admin/login')`——布局是服务端组件,无法内联客户端 onClick,而契约文件树不允许新增客户端组件文件,server action 本身就是 POST 请求,满足「POST logout 后跳 login」的语义。

  ```tsx
  import { cookies } from 'next/headers';
  import { redirect } from 'next/navigation';
  import Link from 'next/link';
  import { unsealData } from 'iron-session';
  import type { ReactNode } from 'react';
  import { SESSION_COOKIE, type SessionData } from '@/lib/auth/session';

  const NAV = [
    { href: '/admin', label: 'Dashboard' },
    { href: '/admin/agents', label: 'Agents' },
    { href: '/admin/listings', label: 'Listings' },
    { href: '/admin/announcements', label: 'Announcements' },
    { href: '/admin/goals', label: 'Goals' },
    { href: '/admin/screens', label: 'Screens' },
    { href: '/admin/settings', label: 'Settings' },
  ];

  async function getSession(): Promise<SessionData | null> {
    const seal = (await cookies()).get(SESSION_COOKIE)?.value;
    if (!seal) return null;
    try {
      const data = await unsealData<SessionData>(seal, {
        password: process.env.SESSION_SECRET!,
      });
      if (!data || typeof data.userId !== 'string' || data.userId.length === 0) return null;
      return data;
    } catch {
      return null;
    }
  }

  async function logout() {
    'use server';
    (await cookies()).set(SESSION_COOKIE, '', {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 0,
    });
    redirect('/admin/login');
  }

  export default async function DashboardLayout({ children }: { children: ReactNode }) {
    const session = await getSession();
    if (!session) redirect('/admin/login');

    return (
      <div className="flex min-h-screen bg-bg">
        <aside className="flex w-52 shrink-0 flex-col border-r border-panel-2 bg-panel p-4">
          <div className="neon-text mb-6 font-display text-sm text-neon">SALES CHAMPIONS</div>
          <nav className="flex flex-col gap-1">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded px-3 py-2 text-sm text-muted hover:bg-panel-2 hover:text-ink"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <form action={logout} className="mt-auto">
            <button
              type="submit"
              className="w-full rounded border border-panel-2 px-3 py-2 text-sm text-muted hover:border-muted hover:text-ink"
            >
              Logout
            </button>
          </form>
        </aside>
        <main className="flex-1 p-6">{children}</main>
      </div>
    );
  }
  ```

- [ ] **Step 4: 创建仪表盘页 `src/app/admin/(dashboard)/page.tsx`**

  快速录入成交表单(Agent 下拉仅 active、Address、Sale price ($)、GCI ($)、Sale date 默认今天)+ 最近成交表(GET `/api/sales`,服务端已限 50 条)。行操作:Edit(Modal,PATCH)、Delete(`window.confirm` 后 DELETE)、Replay 🎉(POST `/api/sales/[id]/replay`,成功后行内显示 'Replayed!' 2 秒消失)。金额输入为美元小数,提交时 `Math.round(parseFloat(x) * 100)` 转 cents;回填时 `(cents / 100).toFixed(2)`。

  ```tsx
  'use client';

  import { useCallback, useEffect, useState, type FormEvent } from 'react';
  import { Button, Field, Modal, Select, Table, TextInput } from '@/components/admin/ui';
  import { formatMoney } from '@/lib/format';

  type AgentRow = { id: string; name: string; active: boolean };

  type SaleRow = {
    id: string;
    agentId: string;
    agentName: string;
    address: string;
    salePriceCents: number;
    gciCents: number;
    saleDate: string;
  };

  function todayLocal(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function toCents(dollars: string): number {
    return Math.round(parseFloat(dollars) * 100);
  }

  function emptyForm() {
    return { agentId: '', address: '', salePrice: '', gci: '', saleDate: todayLocal() };
  }

  export default function DashboardPage() {
    const [agents, setAgents] = useState<AgentRow[]>([]);
    const [sales, setSales] = useState<SaleRow[]>([]);
    const [form, setForm] = useState(emptyForm);
    const [editing, setEditing] = useState<SaleRow | null>(null);
    const [editForm, setEditForm] = useState(emptyForm);
    const [replayedId, setReplayedId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
      const [agentsRes, salesRes] = await Promise.all([fetch('/api/agents'), fetch('/api/sales')]);
      if (agentsRes.ok) {
        const body = (await agentsRes.json()) as { data: AgentRow[] };
        setAgents(body.data.filter((a) => a.active));
      }
      if (salesRes.ok) {
        const body = (await salesRes.json()) as { data: SaleRow[] };
        setSales(body.data);
      }
    }, []);

    useEffect(() => {
      void load();
    }, [load]);

    async function createSale(e: FormEvent) {
      e.preventDefault();
      setError(null);
      const res = await fetch('/api/sales', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          agentId: form.agentId,
          address: form.address,
          salePriceCents: toCents(form.salePrice),
          gciCents: toCents(form.gci),
          saleDate: form.saleDate,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({ error: 'Failed to save sale' }))) as { error?: string };
        setError(body.error ?? 'Failed to save sale');
        return;
      }
      setForm(emptyForm());
      await load();
    }

    function openEdit(sale: SaleRow) {
      setEditing(sale);
      setEditForm({
        agentId: sale.agentId,
        address: sale.address,
        salePrice: (sale.salePriceCents / 100).toFixed(2),
        gci: (sale.gciCents / 100).toFixed(2),
        saleDate: sale.saleDate,
      });
    }

    async function saveEdit(e: FormEvent) {
      e.preventDefault();
      if (!editing) return;
      const res = await fetch(`/api/sales/${editing.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          agentId: editForm.agentId,
          address: editForm.address,
          salePriceCents: toCents(editForm.salePrice),
          gciCents: toCents(editForm.gci),
          saleDate: editForm.saleDate,
        }),
      });
      if (res.ok) {
        setEditing(null);
        await load();
      }
    }

    async function deleteSale(id: string) {
      if (!window.confirm('Delete this sale? Leaderboards will recalculate.')) return;
      const res = await fetch(`/api/sales/${id}`, { method: 'DELETE' });
      if (res.ok) await load();
    }

    async function replay(id: string) {
      const res = await fetch(`/api/sales/${id}/replay`, { method: 'POST' });
      if (res.ok) {
        setReplayedId(id);
        setTimeout(() => setReplayedId((cur) => (cur === id ? null : cur)), 2000);
      }
    }

    return (
      <div>
        <h1 className="mb-6 font-heading text-2xl font-bold text-ink">Dashboard</h1>

        <form onSubmit={createSale} className="mb-8 rounded-lg border border-panel-2 bg-panel p-6">
          <h2 className="mb-4 font-heading text-lg font-bold text-ink">Record a sale</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
            <Field label="Agent">
              <Select
                value={form.agentId}
                onChange={(e) => setForm({ ...form, agentId: e.target.value })}
                required
              >
                <option value="">Select agent…</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Address">
              <TextInput
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="12 Ocean St, Bondi"
                required
              />
            </Field>
            <Field label="Sale price ($)">
              <TextInput
                type="number"
                step="0.01"
                min="0"
                value={form.salePrice}
                onChange={(e) => setForm({ ...form, salePrice: e.target.value })}
                required
              />
            </Field>
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
              <TextInput
                type="date"
                value={form.saleDate}
                onChange={(e) => setForm({ ...form, saleDate: e.target.value })}
                required
              />
            </Field>
          </div>
          {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
          <div className="mt-4">
            <Button type="submit">Save sale 🎉</Button>
          </div>
        </form>

        <h2 className="mb-3 font-heading text-lg font-bold text-ink">Recent sales</h2>
        <Table headers={['Date', 'Agent', 'Address', 'Price', 'GCI', 'Actions']}>
          {sales.map((s) => (
            <tr key={s.id} className="text-ink">
              <td className="px-3 py-2">{s.saleDate}</td>
              <td className="px-3 py-2">{s.agentName}</td>
              <td className="px-3 py-2">{s.address}</td>
              <td className="px-3 py-2 text-money">{formatMoney(s.salePriceCents)}</td>
              <td className="px-3 py-2 text-money">{formatMoney(s.gciCents)}</td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-2">
                  <Button variant="ghost" onClick={() => openEdit(s)}>
                    Edit
                  </Button>
                  <Button variant="danger" onClick={() => deleteSale(s.id)}>
                    Delete
                  </Button>
                  <Button variant="ghost" onClick={() => replay(s.id)}>
                    Replay 🎉
                  </Button>
                  {replayedId === s.id && <span className="text-sm text-neon">Replayed!</span>}
                </div>
              </td>
            </tr>
          ))}
          {sales.length === 0 && (
            <tr>
              <td colSpan={6} className="px-3 py-6 text-center text-muted">
                No sales yet — record the first one above.
              </td>
            </tr>
          )}
        </Table>

        <Modal open={editing !== null} onClose={() => setEditing(null)} title="Edit sale">
          <form onSubmit={saveEdit} className="space-y-4">
            <Field label="Agent">
              <Select
                value={editForm.agentId}
                onChange={(e) => setEditForm({ ...editForm, agentId: e.target.value })}
                required
              >
                <option value="">Select agent…</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Address">
              <TextInput
                value={editForm.address}
                onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                required
              />
            </Field>
            <Field label="Sale price ($)">
              <TextInput
                type="number"
                step="0.01"
                min="0"
                value={editForm.salePrice}
                onChange={(e) => setEditForm({ ...editForm, salePrice: e.target.value })}
                required
              />
            </Field>
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
              <TextInput
                type="date"
                value={editForm.saleDate}
                onChange={(e) => setEditForm({ ...editForm, saleDate: e.target.value })}
                required
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="submit">Save changes</Button>
            </div>
          </form>
        </Modal>
      </div>
    );
  }
  ```

- [ ] **Step 5: 类型检查与构建验证**

  项目根目录运行:

  ```bash
  npx tsc --noEmit
  npm run build
  ```

  预期:`tsc` 无输出、退出码 0;`next build` 输出 `Compiled successfully`,路由清单中出现 `/admin` 与 `/admin/login`。若报错,先修复再进入下一步。

- [ ] **Step 6: 提交**

  ```bash
  git add src/components/admin/ui.tsx src/app/admin/login/page.tsx "src/app/admin/(dashboard)/layout.tsx" "src/app/admin/(dashboard)/page.tsx"
  git commit -m "feat: admin UI kit, login page, session-guarded shell, and sales dashboard"
  ```

  (路径中的括号在 Git Bash 里必须用引号包住,否则是语法错误。)

### Task 22: Admin Agents 页

**Files:**
- Create: `src/app/admin/(dashboard)/agents/page.tsx`

前置:Task 21(UI 组件与布局)、Task 10(agents API)、Task 8(uploads API)已完成。纯 UI 任务(契约任务表:手动 + E2E 间接覆盖)。

- [ ] **Step 1: 创建 `src/app/admin/(dashboard)/agents/page.tsx`**

  列表:头像缩略(无照片显示首字母圆形占位)、名字、anthem 名(内置曲目显示曲名,自定义显示 'Custom upload',空显示 'Default')、active 开关(checkbox,勾选即 PATCH)。新建/编辑 Modal:name;photo 上传(`<input type=file>` → `FormData` POST `/api/uploads` → 回填 `photoUrl` 并显示缩略);anthem `Select`(`BUILTIN_ANTHEMS` 三项 + 'Upload custom…'——选中后立即触发隐藏文件选择,上传成功把返回 url 存为 anthemUrl;因是受控组件,select 显示值会自动回落到当前 anthemUrl)。创建 POST 省略空字段;编辑 PATCH 显式发 `null` 以支持清除照片/主题曲。

  ```tsx
  'use client';

  import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
  import { Button, Field, Modal, Select, Table, TextInput } from '@/components/admin/ui';
  import { BUILTIN_ANTHEMS, isBuiltinAnthem } from '@/lib/audio/anthems';

  type AgentRow = {
    id: string;
    name: string;
    photoUrl: string | null;
    anthemUrl: string | null;
    active: boolean;
  };

  const UPLOAD_OPTION = 'upload-custom';

  function anthemLabel(anthemUrl: string | null): string {
    if (!anthemUrl) return 'Default';
    const builtin = BUILTIN_ANTHEMS.find((a) => a.id === anthemUrl);
    return builtin ? builtin.name : 'Custom upload';
  }

  async function uploadFile(file: File): Promise<string | null> {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch('/api/uploads', { method: 'POST', body: fd });
    if (!res.ok) return null;
    const body = (await res.json()) as { data: { url: string } };
    return body.data.url;
  }

  export default function AgentsPage() {
    const [agents, setAgents] = useState<AgentRow[]>([]);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [name, setName] = useState('');
    const [photoUrl, setPhotoUrl] = useState('');
    const [anthemUrl, setAnthemUrl] = useState('');
    const [error, setError] = useState<string | null>(null);
    const anthemFileRef = useRef<HTMLInputElement>(null);

    const load = useCallback(async () => {
      const res = await fetch('/api/agents');
      if (res.ok) {
        const body = (await res.json()) as { data: AgentRow[] };
        setAgents(body.data);
      }
    }, []);

    useEffect(() => {
      void load();
    }, [load]);

    function openCreate() {
      setEditingId(null);
      setName('');
      setPhotoUrl('');
      setAnthemUrl('');
      setError(null);
      setModalOpen(true);
    }

    function openEdit(agent: AgentRow) {
      setEditingId(agent.id);
      setName(agent.name);
      setPhotoUrl(agent.photoUrl ?? '');
      setAnthemUrl(agent.anthemUrl ?? '');
      setError(null);
      setModalOpen(true);
    }

    async function onPhotoChange(e: ChangeEvent<HTMLInputElement>) {
      const file = e.target.files?.[0];
      if (!file) return;
      const url = await uploadFile(file);
      if (url) setPhotoUrl(url);
      else setError('Photo upload failed');
      e.target.value = '';
    }

    function onAnthemSelect(value: string) {
      if (value === UPLOAD_OPTION) {
        anthemFileRef.current?.click();
        return;
      }
      setAnthemUrl(value);
    }

    async function onAnthemFileChange(e: ChangeEvent<HTMLInputElement>) {
      const file = e.target.files?.[0];
      if (!file) return;
      const url = await uploadFile(file);
      if (url) setAnthemUrl(url);
      else setError('Anthem upload failed');
      e.target.value = '';
    }

    async function save(e: FormEvent) {
      e.preventDefault();
      setError(null);
      const res = editingId
        ? await fetch(`/api/agents/${editingId}`, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ name, photoUrl: photoUrl || null, anthemUrl: anthemUrl || null }),
          })
        : await fetch('/api/agents', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              name,
              ...(photoUrl ? { photoUrl } : {}),
              ...(anthemUrl ? { anthemUrl } : {}),
            }),
          });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({ error: 'Failed to save agent' }))) as { error?: string };
        setError(body.error ?? 'Failed to save agent');
        return;
      }
      setModalOpen(false);
      await load();
    }

    async function toggleActive(agent: AgentRow) {
      const res = await fetch(`/api/agents/${agent.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ active: !agent.active }),
      });
      if (res.ok) await load();
    }

    const isCustomAnthem = anthemUrl !== '' && !isBuiltinAnthem(anthemUrl);

    return (
      <div>
        <div className="mb-6 flex items-center justify-between">
          <h1 className="font-heading text-2xl font-bold text-ink">Agents</h1>
          <Button onClick={openCreate}>New agent</Button>
        </div>

        <Table headers={['Photo', 'Name', 'Anthem', 'Active', 'Actions']}>
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
              <td className="px-3 py-2 text-muted">{anthemLabel(a.anthemUrl)}</td>
              <td className="px-3 py-2">
                <input
                  type="checkbox"
                  checked={a.active}
                  onChange={() => toggleActive(a)}
                  className="h-4 w-4 accent-neon"
                />
              </td>
              <td className="px-3 py-2">
                <Button variant="ghost" onClick={() => openEdit(a)}>
                  Edit
                </Button>
              </td>
            </tr>
          ))}
          {agents.length === 0 && (
            <tr>
              <td colSpan={5} className="px-3 py-6 text-center text-muted">
                No agents yet.
              </td>
            </tr>
          )}
        </Table>

        <Modal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          title={editingId ? 'Edit agent' : 'New agent'}
        >
          <form onSubmit={save} className="space-y-4">
            <Field label="Name">
              <TextInput value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
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
                  className="text-sm text-muted"
                />
              </div>
            </Field>
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
              className="hidden"
            />
            {error && <p className="text-sm text-red-400">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">{editingId ? 'Save changes' : 'Create agent'}</Button>
            </div>
          </form>
        </Modal>
      </div>
    );
  }
  ```

- [ ] **Step 2: 类型检查与构建验证**

  ```bash
  npx tsc --noEmit
  npm run build
  ```

  预期:`tsc` 无输出、退出码 0;`next build` 路由清单出现 `/admin/agents`。

- [ ] **Step 3: 提交**

  ```bash
  git add "src/app/admin/(dashboard)/agents/page.tsx"
  git commit -m "feat: admin agents page with photo and anthem uploads"
  ```

### Task 23: Admin Listings/Announcements/Goals 页

**Files:**
- Create: `src/app/admin/(dashboard)/listings/page.tsx`
- Create: `src/app/admin/(dashboard)/announcements/page.tsx`
- Create: `src/app/admin/(dashboard)/goals/page.tsx`

前置:Task 21、Task 12(listings/announcements/goals API)、Task 8(uploads)已完成。纯 UI 任务(契约任务表:手动覆盖)。三页共用同一 CRUD 模式:列表 + 新建/编辑 Modal + Delete confirm。

- [ ] **Step 1: 创建 `src/app/admin/(dashboard)/listings/page.tsx`**

  列表列:照片缩略、地址、agent、价格、上架日期、status 下拉(`active/sold/withdrawn`,行内改动即 PATCH)、Edit/Delete。Modal 字段:Agent(active only)、Address、List price ($)、Listed date(默认今天)、可选照片上传。

  ```tsx
  'use client';

  import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
  import { Button, Field, Modal, Select, Table, TextInput } from '@/components/admin/ui';
  import { formatMoney } from '@/lib/format';

  type AgentRow = { id: string; name: string; active: boolean };

  type ListingRow = {
    id: string;
    agentId: string;
    agentName: string;
    address: string;
    listPriceCents: number;
    photoUrl: string | null;
    listedDate: string;
    status: string;
  };

  const STATUS_OPTIONS = ['active', 'sold', 'withdrawn'] as const;

  function todayLocal(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  async function uploadFile(file: File): Promise<string | null> {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch('/api/uploads', { method: 'POST', body: fd });
    if (!res.ok) return null;
    const body = (await res.json()) as { data: { url: string } };
    return body.data.url;
  }

  function emptyForm() {
    return { agentId: '', address: '', listPrice: '', listedDate: todayLocal(), photoUrl: '' };
  }

  export default function ListingsPage() {
    const [listings, setListings] = useState<ListingRow[]>([]);
    const [agents, setAgents] = useState<AgentRow[]>([]);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState(emptyForm);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
      const [listingsRes, agentsRes] = await Promise.all([fetch('/api/listings'), fetch('/api/agents')]);
      if (listingsRes.ok) {
        const body = (await listingsRes.json()) as { data: ListingRow[] };
        setListings(body.data);
      }
      if (agentsRes.ok) {
        const body = (await agentsRes.json()) as { data: AgentRow[] };
        setAgents(body.data.filter((a) => a.active));
      }
    }, []);

    useEffect(() => {
      void load();
    }, [load]);

    function openCreate() {
      setEditingId(null);
      setForm(emptyForm());
      setError(null);
      setModalOpen(true);
    }

    function openEdit(l: ListingRow) {
      setEditingId(l.id);
      setForm({
        agentId: l.agentId,
        address: l.address,
        listPrice: (l.listPriceCents / 100).toFixed(2),
        listedDate: l.listedDate,
        photoUrl: l.photoUrl ?? '',
      });
      setError(null);
      setModalOpen(true);
    }

    async function onPhotoChange(e: ChangeEvent<HTMLInputElement>) {
      const file = e.target.files?.[0];
      if (!file) return;
      const url = await uploadFile(file);
      if (url) setForm((f) => ({ ...f, photoUrl: url }));
      else setError('Photo upload failed');
      e.target.value = '';
    }

    async function save(e: FormEvent) {
      e.preventDefault();
      setError(null);
      const listPriceCents = Math.round(parseFloat(form.listPrice) * 100);
      const payload = editingId
        ? {
            agentId: form.agentId,
            address: form.address,
            listPriceCents,
            listedDate: form.listedDate,
            photoUrl: form.photoUrl || null,
          }
        : {
            agentId: form.agentId,
            address: form.address,
            listPriceCents,
            listedDate: form.listedDate,
            ...(form.photoUrl ? { photoUrl: form.photoUrl } : {}),
          };
      const res = await fetch(editingId ? `/api/listings/${editingId}` : '/api/listings', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({ error: 'Failed to save listing' }))) as { error?: string };
        setError(body.error ?? 'Failed to save listing');
        return;
      }
      setModalOpen(false);
      await load();
    }

    async function changeStatus(id: string, status: string) {
      const res = await fetch(`/api/listings/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (res.ok) await load();
    }

    async function remove(id: string) {
      if (!window.confirm('Delete this listing?')) return;
      const res = await fetch(`/api/listings/${id}`, { method: 'DELETE' });
      if (res.ok) await load();
    }

    return (
      <div>
        <div className="mb-6 flex items-center justify-between">
          <h1 className="font-heading text-2xl font-bold text-ink">Listings</h1>
          <Button onClick={openCreate}>New listing</Button>
        </div>

        <Table headers={['Photo', 'Address', 'Agent', 'Price', 'Listed', 'Status', 'Actions']}>
          {listings.map((l) => (
            <tr key={l.id} className="text-ink">
              <td className="px-3 py-2">
                {l.photoUrl ? (
                  <img src={l.photoUrl} alt={l.address} className="h-10 w-14 rounded object-cover" />
                ) : (
                  <span className="flex h-10 w-14 items-center justify-center rounded bg-panel-2 text-xs text-muted">
                    No photo
                  </span>
                )}
              </td>
              <td className="px-3 py-2">{l.address}</td>
              <td className="px-3 py-2">{l.agentName}</td>
              <td className="px-3 py-2 text-money">{formatMoney(l.listPriceCents)}</td>
              <td className="px-3 py-2">{l.listedDate}</td>
              <td className="px-3 py-2">
                <div className="w-32">
                  <Select value={l.status} onChange={(e) => changeStatus(l.id, e.target.value)}>
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </Select>
                </div>
              </td>
              <td className="px-3 py-2">
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={() => openEdit(l)}>
                    Edit
                  </Button>
                  <Button variant="danger" onClick={() => remove(l.id)}>
                    Delete
                  </Button>
                </div>
              </td>
            </tr>
          ))}
          {listings.length === 0 && (
            <tr>
              <td colSpan={7} className="px-3 py-6 text-center text-muted">
                No listings yet.
              </td>
            </tr>
          )}
        </Table>

        <Modal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          title={editingId ? 'Edit listing' : 'New listing'}
        >
          <form onSubmit={save} className="space-y-4">
            <Field label="Agent">
              <Select
                value={form.agentId}
                onChange={(e) => setForm({ ...form, agentId: e.target.value })}
                required
              >
                <option value="">Select agent…</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Address">
              <TextInput
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                required
              />
            </Field>
            <Field label="List price ($)">
              <TextInput
                type="number"
                step="0.01"
                min="0"
                value={form.listPrice}
                onChange={(e) => setForm({ ...form, listPrice: e.target.value })}
                required
              />
            </Field>
            <Field label="Listed date">
              <TextInput
                type="date"
                value={form.listedDate}
                onChange={(e) => setForm({ ...form, listedDate: e.target.value })}
                required
              />
            </Field>
            <Field label="Photo">
              <div className="flex items-center gap-3">
                {form.photoUrl ? (
                  <img src={form.photoUrl} alt="Listing" className="h-12 w-16 rounded object-cover" />
                ) : (
                  <span className="flex h-12 w-16 items-center justify-center rounded bg-panel-2 text-xs text-muted">
                    No photo
                  </span>
                )}
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp"
                  onChange={onPhotoChange}
                  className="text-sm text-muted"
                />
              </div>
            </Field>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">{editingId ? 'Save changes' : 'Create listing'}</Button>
            </div>
          </form>
        </Modal>
      </div>
    );
  }
  ```

- [ ] **Step 2: 创建 `src/app/admin/(dashboard)/announcements/page.tsx`**

  列表列:标题、sortOrder、enabled 开关(checkbox 行内 PATCH)、Edit/Delete。Modal 字段:Title、Body(可选)、Image 上传(可选)、Sort order 数字输入。

  ```tsx
  'use client';

  import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
  import { Button, Field, Modal, Table, TextInput } from '@/components/admin/ui';

  type AnnouncementRow = {
    id: string;
    title: string;
    body: string | null;
    imageUrl: string | null;
    enabled: boolean;
    sortOrder: number;
  };

  async function uploadFile(file: File): Promise<string | null> {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch('/api/uploads', { method: 'POST', body: fd });
    if (!res.ok) return null;
    const body = (await res.json()) as { data: { url: string } };
    return body.data.url;
  }

  export default function AnnouncementsPage() {
    const [rows, setRows] = useState<AnnouncementRow[]>([]);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState({ title: '', body: '', imageUrl: '', sortOrder: '0' });
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
      const res = await fetch('/api/announcements');
      if (res.ok) {
        const body = (await res.json()) as { data: AnnouncementRow[] };
        setRows(body.data);
      }
    }, []);

    useEffect(() => {
      void load();
    }, [load]);

    function openCreate() {
      setEditingId(null);
      setForm({ title: '', body: '', imageUrl: '', sortOrder: String(rows.length) });
      setError(null);
      setModalOpen(true);
    }

    function openEdit(a: AnnouncementRow) {
      setEditingId(a.id);
      setForm({
        title: a.title,
        body: a.body ?? '',
        imageUrl: a.imageUrl ?? '',
        sortOrder: String(a.sortOrder),
      });
      setError(null);
      setModalOpen(true);
    }

    async function onImageChange(e: ChangeEvent<HTMLInputElement>) {
      const file = e.target.files?.[0];
      if (!file) return;
      const url = await uploadFile(file);
      if (url) setForm((f) => ({ ...f, imageUrl: url }));
      else setError('Image upload failed');
      e.target.value = '';
    }

    async function save(e: FormEvent) {
      e.preventDefault();
      setError(null);
      const parsed = parseInt(form.sortOrder, 10);
      const sortOrder = Number.isNaN(parsed) ? 0 : parsed;
      const payload = editingId
        ? { title: form.title, body: form.body || null, imageUrl: form.imageUrl || null, sortOrder }
        : {
            title: form.title,
            ...(form.body ? { body: form.body } : {}),
            ...(form.imageUrl ? { imageUrl: form.imageUrl } : {}),
            sortOrder,
          };
      const res = await fetch(editingId ? `/api/announcements/${editingId}` : '/api/announcements', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({ error: 'Failed to save announcement' }))) as {
          error?: string;
        };
        setError(body.error ?? 'Failed to save announcement');
        return;
      }
      setModalOpen(false);
      await load();
    }

    async function toggleEnabled(a: AnnouncementRow) {
      const res = await fetch(`/api/announcements/${a.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enabled: !a.enabled }),
      });
      if (res.ok) await load();
    }

    async function remove(id: string) {
      if (!window.confirm('Delete this announcement?')) return;
      const res = await fetch(`/api/announcements/${id}`, { method: 'DELETE' });
      if (res.ok) await load();
    }

    return (
      <div>
        <div className="mb-6 flex items-center justify-between">
          <h1 className="font-heading text-2xl font-bold text-ink">Announcements</h1>
          <Button onClick={openCreate}>New announcement</Button>
        </div>

        <Table headers={['Title', 'Order', 'Enabled', 'Actions']}>
          {rows.map((a) => (
            <tr key={a.id} className="text-ink">
              <td className="px-3 py-2">{a.title}</td>
              <td className="px-3 py-2 text-muted">{a.sortOrder}</td>
              <td className="px-3 py-2">
                <input
                  type="checkbox"
                  checked={a.enabled}
                  onChange={() => toggleEnabled(a)}
                  className="h-4 w-4 accent-neon"
                />
              </td>
              <td className="px-3 py-2">
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={() => openEdit(a)}>
                    Edit
                  </Button>
                  <Button variant="danger" onClick={() => remove(a.id)}>
                    Delete
                  </Button>
                </div>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={4} className="px-3 py-6 text-center text-muted">
                No announcements yet.
              </td>
            </tr>
          )}
        </Table>

        <Modal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          title={editingId ? 'Edit announcement' : 'New announcement'}
        >
          <form onSubmit={save} className="space-y-4">
            <Field label="Title">
              <TextInput
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
                autoFocus
              />
            </Field>
            <Field label="Body (optional)">
              <TextInput
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
              />
            </Field>
            <Field label="Image (optional)">
              <div className="flex items-center gap-3">
                {form.imageUrl ? (
                  <img src={form.imageUrl} alt="Announcement" className="h-12 w-16 rounded object-cover" />
                ) : (
                  <span className="flex h-12 w-16 items-center justify-center rounded bg-panel-2 text-xs text-muted">
                    No image
                  </span>
                )}
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp"
                  onChange={onImageChange}
                  className="text-sm text-muted"
                />
              </div>
            </Field>
            <Field label="Sort order">
              <TextInput
                type="number"
                step="1"
                value={form.sortOrder}
                onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
                required
              />
            </Field>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">{editingId ? 'Save changes' : 'Create announcement'}</Button>
            </div>
          </form>
        </Modal>
      </div>
    );
  }
  ```

- [ ] **Step 3: 创建 `src/app/admin/(dashboard)/goals/page.tsx`**

  列表列:metric 名、period、target(gci 用 `formatMoney` 显示,其他显示整数)、active 开关(行内 PATCH)、Edit/Delete。Modal:metric 下拉(`sales_count/gci/listings`)、period 下拉(`month/quarter`)、target 输入——metric 为 gci 时标签为 'Target GCI ($)',提交按 `Math.round(parseFloat(x) * 100)` 转 cents;其他 metric 为整数个数。

  ```tsx
  'use client';

  import { useCallback, useEffect, useState, type FormEvent } from 'react';
  import { Button, Field, Modal, Select, Table, TextInput } from '@/components/admin/ui';
  import { formatMoney } from '@/lib/format';
  import { METRICS, type Metric } from '@/lib/types';

  type GoalRow = {
    id: string;
    metric: Metric;
    targetValue: number;
    period: 'month' | 'quarter';
    active: boolean;
  };

  const METRIC_LABELS: Record<Metric, string> = {
    sales_count: 'Sales count',
    gci: 'GCI',
    listings: 'New listings',
  };

  export default function GoalsPage() {
    const [goals, setGoals] = useState<GoalRow[]>([]);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState<{ metric: Metric; period: 'month' | 'quarter'; target: string }>({
      metric: 'sales_count',
      period: 'month',
      target: '',
    });
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
      const res = await fetch('/api/goals');
      if (res.ok) {
        const body = (await res.json()) as { data: GoalRow[] };
        setGoals(body.data);
      }
    }, []);

    useEffect(() => {
      void load();
    }, [load]);

    function openCreate() {
      setEditingId(null);
      setForm({ metric: 'sales_count', period: 'month', target: '' });
      setError(null);
      setModalOpen(true);
    }

    function openEdit(g: GoalRow) {
      setEditingId(g.id);
      setForm({
        metric: g.metric,
        period: g.period,
        target: g.metric === 'gci' ? (g.targetValue / 100).toFixed(2) : String(g.targetValue),
      });
      setError(null);
      setModalOpen(true);
    }

    async function save(e: FormEvent) {
      e.preventDefault();
      setError(null);
      const targetValue =
        form.metric === 'gci' ? Math.round(parseFloat(form.target) * 100) : parseInt(form.target, 10);
      if (Number.isNaN(targetValue) || targetValue <= 0) {
        setError('Target must be a positive number');
        return;
      }
      const payload = { metric: form.metric, targetValue, period: form.period };
      const res = await fetch(editingId ? `/api/goals/${editingId}` : '/api/goals', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({ error: 'Failed to save goal' }))) as { error?: string };
        setError(body.error ?? 'Failed to save goal');
        return;
      }
      setModalOpen(false);
      await load();
    }

    async function toggleActive(g: GoalRow) {
      const res = await fetch(`/api/goals/${g.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ active: !g.active }),
      });
      if (res.ok) await load();
    }

    async function remove(id: string) {
      if (!window.confirm('Delete this goal?')) return;
      const res = await fetch(`/api/goals/${id}`, { method: 'DELETE' });
      if (res.ok) await load();
    }

    return (
      <div>
        <div className="mb-6 flex items-center justify-between">
          <h1 className="font-heading text-2xl font-bold text-ink">Goals</h1>
          <Button onClick={openCreate}>New goal</Button>
        </div>

        <Table headers={['Metric', 'Period', 'Target', 'Active', 'Actions']}>
          {goals.map((g) => (
            <tr key={g.id} className="text-ink">
              <td className="px-3 py-2">{METRIC_LABELS[g.metric]}</td>
              <td className="px-3 py-2 text-muted">{g.period}</td>
              <td className="px-3 py-2 text-money">
                {g.metric === 'gci' ? formatMoney(g.targetValue) : String(g.targetValue)}
              </td>
              <td className="px-3 py-2">
                <input
                  type="checkbox"
                  checked={g.active}
                  onChange={() => toggleActive(g)}
                  className="h-4 w-4 accent-neon"
                />
              </td>
              <td className="px-3 py-2">
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={() => openEdit(g)}>
                    Edit
                  </Button>
                  <Button variant="danger" onClick={() => remove(g.id)}>
                    Delete
                  </Button>
                </div>
              </td>
            </tr>
          ))}
          {goals.length === 0 && (
            <tr>
              <td colSpan={5} className="px-3 py-6 text-center text-muted">
                No goals yet.
              </td>
            </tr>
          )}
        </Table>

        <Modal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          title={editingId ? 'Edit goal' : 'New goal'}
        >
          <form onSubmit={save} className="space-y-4">
            <Field label="Metric">
              <Select
                value={form.metric}
                onChange={(e) => setForm({ ...form, metric: e.target.value as Metric })}
              >
                {METRICS.map((m) => (
                  <option key={m} value={m}>
                    {METRIC_LABELS[m]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Period">
              <Select
                value={form.period}
                onChange={(e) => setForm({ ...form, period: e.target.value as 'month' | 'quarter' })}
              >
                <option value="month">month</option>
                <option value="quarter">quarter</option>
              </Select>
            </Field>
            <Field label={form.metric === 'gci' ? 'Target GCI ($)' : 'Target count'}>
              <TextInput
                type="number"
                step={form.metric === 'gci' ? '0.01' : '1'}
                min="0"
                value={form.target}
                onChange={(e) => setForm({ ...form, target: e.target.value })}
                required
              />
            </Field>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">{editingId ? 'Save changes' : 'Create goal'}</Button>
            </div>
          </form>
        </Modal>
      </div>
    );
  }
  ```

- [ ] **Step 4: 类型检查与构建验证**

  ```bash
  npx tsc --noEmit
  npm run build
  ```

  预期:`tsc` 无输出、退出码 0;`next build` 路由清单出现 `/admin/listings`、`/admin/announcements`、`/admin/goals`。

- [ ] **Step 5: 提交**

  ```bash
  git add "src/app/admin/(dashboard)/listings/page.tsx" "src/app/admin/(dashboard)/announcements/page.tsx" "src/app/admin/(dashboard)/goals/page.tsx"
  git commit -m "feat: admin listings, announcements, and goals pages"
  ```

### Task 24: Admin Screens+Settings 页

**Files:**
- Create: `src/app/admin/(dashboard)/screens/page.tsx`
- Create: `src/app/admin/(dashboard)/settings/page.tsx`

前置:Task 21、Task 13(screens API)、Task 9(settings API)已完成。纯 UI 任务(契约任务表:手动 + E2E 间接覆盖)。

- [ ] **Step 1: 创建 `src/app/admin/(dashboard)/screens/page.tsx`**

  列表每 5 秒轮询 GET `/api/screens`(响应行:`{ id, name, status, online, lastSeenAt }`),显示在线绿点/离线灰点与 lastSeen。"Pair a TV" 表单(code + name)POST `/api/screens/pair`,失败(如 `Invalid or expired code`)显示错误。行内操作:Rename(`window.prompt` → PATCH `{ name }`)、Unpair(`window.confirm` → DELETE)。

  ```tsx
  'use client';

  import { useCallback, useEffect, useState, type FormEvent } from 'react';
  import { Button, Field, Table, TextInput } from '@/components/admin/ui';

  type ScreenRow = {
    id: string;
    name: string;
    status: string;
    online: boolean;
    lastSeenAt: string | null;
  };

  export default function ScreensPage() {
    const [screens, setScreens] = useState<ScreenRow[]>([]);
    const [pairCode, setPairCode] = useState('');
    const [pairName, setPairName] = useState('');
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
      const res = await fetch('/api/screens');
      if (res.ok) {
        const body = (await res.json()) as { data: ScreenRow[] };
        setScreens(body.data);
      }
    }, []);

    useEffect(() => {
      void load();
      const timer = setInterval(() => {
        void load();
      }, 5000);
      return () => clearInterval(timer);
    }, [load]);

    async function pair(e: FormEvent) {
      e.preventDefault();
      setError(null);
      const res = await fetch('/api/screens/pair', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pairCode: pairCode.trim(), name: pairName.trim() }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({ error: 'Pairing failed' }))) as { error?: string };
        setError(body.error ?? 'Pairing failed');
        return;
      }
      setPairCode('');
      setPairName('');
      await load();
    }

    async function rename(screen: ScreenRow) {
      const name = window.prompt('New name for this TV', screen.name);
      if (!name || name.trim() === '') return;
      const res = await fetch(`/api/screens/${screen.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (res.ok) await load();
    }

    async function unpair(screen: ScreenRow) {
      if (!window.confirm(`Unpair "${screen.name}"? The TV will return to the pairing screen.`)) return;
      const res = await fetch(`/api/screens/${screen.id}`, { method: 'DELETE' });
      if (res.ok) await load();
    }

    return (
      <div>
        <h1 className="mb-6 font-heading text-2xl font-bold text-ink">Screens</h1>

        <form onSubmit={pair} className="mb-8 rounded-lg border border-panel-2 bg-panel p-6">
          <h2 className="mb-4 font-heading text-lg font-bold text-ink">Pair a TV</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Field label="Pairing code (shown on the TV)">
              <TextInput
                value={pairCode}
                onChange={(e) => setPairCode(e.target.value.toUpperCase())}
                placeholder="ABC123"
                maxLength={6}
                required
              />
            </Field>
            <Field label="TV name">
              <TextInput
                value={pairName}
                onChange={(e) => setPairName(e.target.value)}
                placeholder="Front office TV"
                required
              />
            </Field>
            <div className="flex items-end">
              <Button type="submit">Pair TV</Button>
            </div>
          </div>
          {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
        </form>

        <Table headers={['Name', 'Status', 'Online', 'Last seen', 'Actions']}>
          {screens.map((s) => (
            <tr key={s.id} className="text-ink">
              <td className="px-3 py-2">{s.name}</td>
              <td className="px-3 py-2">
                <span className={s.status === 'paired' ? 'text-neon' : 'text-muted'}>{s.status}</span>
              </td>
              <td className="px-3 py-2">
                <span className="flex items-center gap-2">
                  <span
                    className={`inline-block h-2.5 w-2.5 rounded-full ${s.online ? 'bg-money' : 'bg-muted/40'}`}
                  />
                  <span className={s.online ? 'text-money' : 'text-muted'}>
                    {s.online ? 'Online' : 'Offline'}
                  </span>
                </span>
              </td>
              <td className="px-3 py-2 text-muted">
                {s.lastSeenAt ? new Date(s.lastSeenAt).toLocaleString() : '—'}
              </td>
              <td className="px-3 py-2">
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={() => rename(s)}>
                    Rename
                  </Button>
                  <Button variant="danger" onClick={() => unpair(s)}>
                    Unpair
                  </Button>
                </div>
              </td>
            </tr>
          ))}
          {screens.length === 0 && (
            <tr>
              <td colSpan={5} className="px-3 py-6 text-center text-muted">
                No screens yet — open /tv on the TV browser to get a pairing code.
              </td>
            </tr>
          )}
        </Table>
      </div>
    );
  }
  ```

- [ ] **Step 2: 创建 `src/app/admin/(dashboard)/settings/page.tsx`**

  加载 GET `/api/settings` 得完整 `SettingsData`;slides 列表:enabled checkbox、durationSec 数字输入(zod 限 5–120)、↑↓ 按钮交换排序;leaderboardPeriod 下拉(`week/month/quarter/year`);default anthem 下拉(内置三首 + 'None';当前值为自定义 URL 时附加 'Custom upload' 项);celebration duration(range 10–30)与 volume(range 0–1,步进 0.05)滑条;Save → PUT `/api/settings`(整个 `SettingsData` 作为 body),成功后显示 'Saved' 2 秒。注意从 `@/lib/settings` 只做 **type-only import**(`import type`),避免把服务端 db 代码打进客户端 bundle。

  ```tsx
  'use client';

  import { useEffect, useState } from 'react';
  import { Button, Field, Select } from '@/components/admin/ui';
  import { BUILTIN_ANTHEMS, isBuiltinAnthem } from '@/lib/audio/anthems';
  import type { SettingsData, SlideKey } from '@/lib/settings';
  import { PERIODS, type Period } from '@/lib/types';

  const SLIDE_LABELS: Record<SlideKey, string> = {
    leaderboard_sales_count: 'Sales Champions (sales count)',
    leaderboard_gci: 'Top Earners (GCI)',
    leaderboard_listings: 'Listing Legends (new listings)',
    goal_progress: 'Team Goals',
    listings: 'Hot Listings',
    announcements: 'Team News',
  };

  export default function SettingsPage() {
    const [settings, setSettings] = useState<SettingsData | null>(null);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
      void (async () => {
        const res = await fetch('/api/settings');
        if (res.ok) {
          const body = (await res.json()) as { data: SettingsData };
          setSettings(body.data);
        }
      })();
    }, []);

    if (!settings) return <p className="text-muted">Loading…</p>;

    function update(patch: Partial<SettingsData>) {
      setSettings((cur) => (cur ? { ...cur, ...patch } : cur));
    }

    function updateSlide(index: number, patch: Partial<SettingsData['slides'][number]>) {
      const slides = settings.slides.map((s, i) => (i === index ? { ...s, ...patch } : s));
      update({ slides });
    }

    function moveSlide(index: number, dir: -1 | 1) {
      const target = index + dir;
      if (target < 0 || target >= settings.slides.length) return;
      const slides = [...settings.slides];
      [slides[index], slides[target]] = [slides[target], slides[index]];
      update({ slides });
    }

    async function save() {
      setError(null);
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({ error: 'Failed to save settings' }))) as {
          error?: string;
        };
        setError(body.error ?? 'Failed to save settings');
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }

    return (
      <div className="max-w-3xl">
        <h1 className="mb-6 font-heading text-2xl font-bold text-ink">Settings</h1>

        <section className="mb-6 rounded-lg border border-panel-2 bg-panel p-6">
          <h2 className="mb-4 font-heading text-lg font-bold text-ink">Carousel slides</h2>
          <div className="space-y-2">
            {settings.slides.map((slide, i) => (
              <div
                key={slide.key}
                className="flex items-center gap-3 rounded border border-panel-2 bg-bg px-3 py-2"
              >
                <input
                  type="checkbox"
                  checked={slide.enabled}
                  onChange={(e) => updateSlide(i, { enabled: e.target.checked })}
                  className="h-4 w-4 accent-neon"
                />
                <span className="flex-1 text-sm text-ink">{SLIDE_LABELS[slide.key]}</span>
                <label className="flex items-center gap-1 text-sm text-muted">
                  <input
                    type="number"
                    min={5}
                    max={120}
                    value={slide.durationSec}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      updateSlide(i, { durationSec: Number.isNaN(v) ? 5 : v });
                    }}
                    className="w-16 rounded border border-panel-2 bg-panel px-2 py-1 text-ink outline-none focus:border-neon"
                  />
                  sec
                </label>
                <Button variant="ghost" onClick={() => moveSlide(i, -1)} disabled={i === 0}>
                  ↑
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => moveSlide(i, 1)}
                  disabled={i === settings.slides.length - 1}
                >
                  ↓
                </Button>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-6 grid grid-cols-1 gap-4 rounded-lg border border-panel-2 bg-panel p-6 md:grid-cols-2">
          <Field label="Leaderboard period">
            <Select
              value={settings.leaderboardPeriod}
              onChange={(e) => update({ leaderboardPeriod: e.target.value as Period })}
            >
              {PERIODS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Default anthem">
            <Select
              value={settings.defaultAnthemUrl ?? ''}
              onChange={(e) => update({ defaultAnthemUrl: e.target.value === '' ? null : e.target.value })}
            >
              <option value="">None</option>
              {BUILTIN_ANTHEMS.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
              {settings.defaultAnthemUrl && !isBuiltinAnthem(settings.defaultAnthemUrl) && (
                <option value={settings.defaultAnthemUrl}>Custom upload</option>
              )}
            </Select>
          </Field>
          <Field label={`Celebration duration: ${settings.celebrationDurationSec}s`}>
            <input
              type="range"
              min={10}
              max={30}
              step={1}
              value={settings.celebrationDurationSec}
              onChange={(e) => update({ celebrationDurationSec: parseInt(e.target.value, 10) })}
              className="w-full accent-neon"
            />
          </Field>
          <Field label={`Volume: ${Math.round(settings.volume * 100)}%`}>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={settings.volume}
              onChange={(e) => update({ volume: parseFloat(e.target.value) })}
              className="w-full accent-neon"
            />
          </Field>
        </section>

        {error && <p className="mb-3 text-sm text-red-400">{error}</p>}
        <div className="flex items-center gap-3">
          <Button onClick={() => void save()}>Save settings</Button>
          {saved && <span className="text-sm text-money">Saved</span>}
        </div>
      </div>
    );
  }
  ```

  说明:`settings` 是 `useState` 解构出的 `const`,早退 `if (!settings) return …` 之后 TypeScript 会在其后定义的闭包(`updateSlide`/`moveSlide`/`save`)内保留非空收窄,strict 下可编译。

- [ ] **Step 3: 类型检查与构建验证**

  ```bash
  npx tsc --noEmit
  npm run build
  ```

  预期:`tsc` 无输出、退出码 0;`next build` 路由清单出现 `/admin/screens`、`/admin/settings`。

- [ ] **Step 4: 手动冒烟(可选但推荐,约 3 分钟)**

  先确保 `.env` 存在(否则 `SESSION_SECRET` 缺失,登录路由会 500):

  ```bash
  [ -f .env ] || cp .env.example .env
  npm run db:seed -- --demo
  npm run dev
  ```

  浏览器打开 `http://localhost:3000/admin/login`,用 `.env` 里的 `ADMIN_EMAIL`/`ADMIN_PASSWORD` 登录(默认 `admin@example.com` / `admin1234`);依次检查:Screens 页 5 秒轮询不报错、Settings 页改动 slides 顺序后 Save 出现 'Saved'。结束后 Ctrl+C 停掉 dev 服务器。

- [ ] **Step 5: 提交**

  ```bash
  git add "src/app/admin/(dashboard)/screens/page.tsx" "src/app/admin/(dashboard)/settings/page.tsx"
  git commit -m "feat: admin screens pairing and settings pages"
  ```
### Task 25: CRM 适配器接口(预留)

契约 §16。本任务只交付接口定义与文档注释,**不写任何实现**(Agentbox 适配器明确列为非目标)。无外部依赖,验收标准是 TypeScript 编译通过。

**Files:**
- Create: `src/lib/crm/adapter.ts`

- [ ] **Step 1: 创建 src/lib/crm/adapter.ts(契约 §16 原文,一字不改)**

```ts
// 未来同步器的统一接口。MVP 只定义接口与文档注释,不做实现。
export type CrmAgent = { externalId: string; name: string; email: string | null };
export type CrmSale = { externalId: string; agentExternalId: string; address: string; salePriceCents: number; gciCents: number; saleDate: string };
export type CrmListing = { externalId: string; agentExternalId: string; address: string; listPriceCents: number; listedDate: string };
export interface CrmAdapter {
  fetchAgents(): Promise<CrmAgent[]>;
  fetchSales(since: Date): Promise<CrmSale[]>;
  fetchListings(since: Date): Promise<CrmListing[]>;
}
// 首个实现计划为 Agentbox(https://www.agentboxcrm.com.au API);同步器将按 externalId 幂等 upsert 并触发与手动录入相同的广播逻辑。
```

- [ ] **Step 2: 类型检查验证**

在项目根目录运行:

```bash
npx tsc --noEmit
```

预期:无任何输出,退出码 0。

- [ ] **Step 3: 提交**

```bash
git add src/lib/crm/adapter.ts
git commit -m "feat: add CrmAdapter interface for future CRM sync"
```

---

### Task 26: 端到端测试(Playwright)

契约 §17。E2E 三个用例:(1) 电视显示配对码;(2) 完整链路——管理员登录并认领配对 → 电视点击进入轮播 → 管理员录入成交 → 电视被庆祝弹屏打断 → 庆祝结束回轮播;(3) 断线重连——断网后 OFFLINE 角标出现、缓存数据继续轮播,恢复后角标消失(规格 §8/§10)。依赖 Task 1–24 全部完成。

Playwright 的 `webServer` 以 **production 模式**跑 `tsx e2e/start-server.ts`(`NODE_ENV=production` → Next 走 `.next` 产物),所以每次跑 E2E 前必须先 `npm run build`;否则服务器启动即报 `Could not find a production build in the '.next' directory`。数据库用内存 PGlite(`PGLITE_MEMORY=1`),每次全新种子,`--demo` 会插入 4 个销售员与演示数据。

本 spec 依赖以下已实现 UI 的 DOM 约定(前面任务已按契约实现;逐条列出便于失败时定位):
- PairingScreen(Task 16)把 6 位配对码渲染为一个文本内容恰为该码的元素(可被锚定正则 `^...$` 命中);
- StartOverlay(Task 16)文案为 `CLICK TO START`(契约 §13 钉死);
- sales_count 榜标题为 `SALES CHAMPIONS`,其余 slide 标题为 `TOP EARNERS` / `LISTING LEGENDS` / `TEAM GOALS` / `HOT LISTINGS` / `TEAM NEWS`(契约 §13 钉死);
- CelebrationOverlay(Task 19)渲染文案 `SOLD!` 与房源地址——契约未钉死 `SOLD!`,但本 E2E 以它为验收断言:若 Task 19 的实现没有该文案,在 CelebrationOverlay 的标题行加上 `SOLD!` 再重跑;
- 登录页(Task 21)的 Email/Password 输入框可被 `getByLabel(/email/i)`、`getByLabel(/password/i)` 定位,提交按钮文案匹配 `/log ?in|sign ?in/i`;
- 仪表盘成交表单(Task 21)label 为 `Agent` / `Address` / `Sale price ($)` / `GCI ($)` / `Sale date`(契约 §18),Agent 下拉的 option `value` 为 agent id,提交按钮文案匹配 `/add|save|record|submit/i`;
- Screens 页(Task 24)"Pair a TV" 表单两个输入框 label 分别为 `Pairing code (shown on the TV)` 与 `TV name`(spec 用非锚定的 `/code/i`、`/tv name/i` 定位),提交按钮文案恰为 `Pair TV` —— spec 必须用**整名匹配** `getByRole('button', { name: 'Pair TV' })`,不能用 `/pair/i`(屏幕列表每行有 `Unpair` 按钮,模糊正则会命中多个元素触发 strict mode violation);
- OfflineBadge(Task 16)文案为 `OFFLINE`;
- `@/components/admin/ui` 的 `Field` 用 `<label>` 包裹控件(或 htmlFor 关联),否则 `getByLabel` 无法命中。

若某个定位在运行时失败(timeout 或 strict mode violation),对照报错与对应页面组件的实际文案,修改 **spec 中的正则**使其匹配实际 UI(契约 §13 钉死的文案除外——那种情况改组件)。调试可加 `npx playwright test --headed --workers=1` 观察浏览器。

**Files:**
- Create: `playwright.config.ts`
- Create: `e2e/start-server.ts`
- Create: `e2e/tv-flow.spec.ts`(Test)

- [ ] **Step 1: 安装 Playwright 浏览器**

```bash
npx playwright install chromium
```

首次运行会下载 Chromium(约 150MB),已安装则直接退出。预期退出码 0。

- [ ] **Step 2: 创建 playwright.config.ts(契约 §17 原文,一字不改)**

```ts
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  timeout: 60000,
  use: { baseURL: 'http://localhost:3344' },
  webServer: {
    command: 'tsx e2e/start-server.ts',
    url: 'http://localhost:3344/api/health',
    reuseExistingServer: false,
    timeout: 120000,
    env: { PORT: '3344', NODE_ENV: 'production' },
  },
});
```

- [ ] **Step 3: 创建 e2e/start-server.ts**

```ts
process.env.PGLITE_MEMORY = '1';
// bootstrap.ts loads .env via @next/env — a developer .env may carry DATABASE_URL,
// which must never leak into an E2E run against the in-memory database.
delete process.env.DATABASE_URL;
process.env.SESSION_SECRET ||= 'e2e-secret-e2e-secret-e2e-secret-!!';
process.env.ADMIN_EMAIL = 'admin@e2e.dev';
process.env.ADMIN_PASSWORD = 'e2e-password';
import { getDb } from '../src/lib/db';
import { seed } from '../src/lib/db/seed';
import { startServer } from '../src/server/bootstrap';
const port = Number(process.env.PORT) || 3344;
(async () => {
  const db = await getDb();
  await seed(db, { demo: true });
  await startServer(port);
  console.log('E2E server ready');
})();
```

说明一:ESM 的 import 会提升到 env 赋值之前执行,但所有 env(`PGLITE_MEMORY`、`DATABASE_URL`、`SESSION_SECRET`、`ADMIN_EMAIL`/`ADMIN_PASSWORD`)都是在函数调用时才惰性读取的,顺序不影响正确性——原样照抄即可。
说明二:`bootstrap.ts` 顶部的 `loadEnvConfig` 不覆盖已存在的 env,且本文件先 `delete process.env.DATABASE_URL` 后才调用 `getDb()`,但 `loadEnvConfig` 在 import 提升阶段就会把 `.env` 里的 `DATABASE_URL` 写回 `process.env`——所以这里的 `delete` 顺序(模块体语句在所有 import 之后执行)恰好保证了删除发生在 `loadEnvConfig` 之后、`getDb()` 之前,是正确的。

- [ ] **Step 4: 创建 e2e/tv-flow.spec.ts(完整用例)**

两个用例的标题必须与下方完全一致(`pairing code shows on tv` / `sale entry triggers celebration on tv`)。配对码断言用锚定正则 `^[23456789A-HJ-NP-Z]{6}$`——排除易混淆字符 I/O(注意该字符类是契约配对字母表的超集,断言必然成立),锚定 `^...$` 避免误命中页面上其他连续大写单词(如 `SCREEN`)。庆祝时长为 demo 种子里的默认 18 秒,所以"回轮播"断言给了 30 秒等待窗口;整个用例约 45 秒,在 60 秒 timeout 之内。

```ts
import { test, expect } from '@playwright/test';

const PAIR_CODE_RE = /^[23456789A-HJ-NP-Z]{6}$/;
const SLIDE_TITLE_RE =
  /SALES CHAMPIONS|TOP EARNERS|LISTING LEGENDS|TEAM GOALS|HOT LISTINGS|TEAM NEWS/;

test('pairing code shows on tv', async ({ browser }) => {
  const tvPage = await browser.newPage();
  await tvPage.goto('/tv');
  // Unpaired TV registers itself and shows a 6-char pairing code.
  await expect(tvPage.getByText(PAIR_CODE_RE)).toBeVisible({ timeout: 20000 });
  await tvPage.close();
});

/**
 * Shared flow: sign the admin in, pair a fresh TV page, click through the
 * audio-unlock overlay and wait for the carousel. Returns both pages.
 */
async function pairTv(browser: import('@playwright/test').Browser, screenName: string) {
  // Two isolated browser contexts: one admin, one TV.
  const adminPage = await browser.newPage();
  const tvPage = await browser.newPage();

  // 1. Admin signs in.
  await adminPage.goto('/admin/login');
  await adminPage.getByLabel(/email/i).fill('admin@e2e.dev');
  await adminPage.getByLabel(/password/i).fill('e2e-password');
  await adminPage.getByRole('button', { name: /log ?in|sign ?in/i }).click();
  // Dashboard layout nav proves the session is live.
  await expect(adminPage.getByRole('link', { name: 'Screens' })).toBeVisible({
    timeout: 15000,
  });

  // 2. TV requests a pairing code.
  await tvPage.goto('/tv');
  const codeEl = tvPage.getByText(PAIR_CODE_RE);
  await expect(codeEl).toBeVisible({ timeout: 20000 });
  const pairCode = (await codeEl.textContent())!.trim();

  // 3. Admin claims the code and names the screen.
  await adminPage.goto('/admin/screens');
  await adminPage.getByLabel(/code/i).fill(pairCode);
  await adminPage.getByLabel(/tv name/i).fill(screenName);
  await adminPage.getByRole('button', { name: 'Pair TV' }).click();
  await expect(adminPage.getByText(screenName)).toBeVisible({ timeout: 10000 });

  // 4. TV shows the audio-unlock overlay; click it to enter the carousel.
  const startBtn = tvPage.getByText('CLICK TO START');
  await expect(startBtn).toBeVisible({ timeout: 20000 });
  await startBtn.click();
  await expect(tvPage.getByText(SLIDE_TITLE_RE).first()).toBeVisible({
    timeout: 20000,
  });

  return { adminPage, tvPage };
}

test('sale entry triggers celebration on tv', async ({ browser }) => {
  test.setTimeout(120_000); // login+pair+18s celebration leaves little room in the default 60s
  const { adminPage, tvPage } = await pairTv(browser, 'E2E TV');

  // 5. Admin records a sale from the dashboard quick-entry form.
  await adminPage.goto('/admin');
  const agentSelect = adminPage.getByLabel(/^agent/i);
  await expect(agentSelect).toBeVisible({ timeout: 10000 });
  const firstAgentId = await agentSelect
    .locator('option:not([value=""])')
    .first()
    .getAttribute('value');
  await agentSelect.selectOption(firstAgentId!);
  await adminPage.getByLabel(/^address/i).fill('E2E House 1');
  await adminPage.getByLabel(/sale price/i).fill('1000000'); // $1,000,000
  await adminPage.getByLabel(/gci/i).fill('25000'); // $25,000
  // Sale date defaults to today — leave it.
  await adminPage
    .getByRole('button', { name: /add|save|record|submit/i })
    .click();

  // 6. TV interrupts the carousel with the celebration (< 15s end-to-end).
  await expect(tvPage.getByText('SOLD!')).toBeVisible({ timeout: 15000 });
  await expect(tvPage.getByText('E2E House 1')).toBeVisible({ timeout: 5000 });

  // 7. Celebration (default 18s) finishes and the carousel resumes.
  await expect(tvPage.getByText('SOLD!')).toBeHidden({ timeout: 30000 });
  await expect(tvPage.getByText(SLIDE_TITLE_RE).first()).toBeVisible({
    timeout: 10000,
  });

  await adminPage.close();
  await tvPage.close();
});

test('tv shows offline badge and keeps rotating while disconnected', async ({ browser }) => {
  test.setTimeout(120_000);
  const { adminPage, tvPage } = await pairTv(browser, 'E2E TV 2');

  // Sever the TV's network (WebSocket dies, fetches fail) — spec §8/§10.
  await tvPage.context().setOffline(true);
  await expect(tvPage.getByText('OFFLINE')).toBeVisible({ timeout: 30000 });
  // Carousel keeps rotating on cached data while offline.
  await expect(tvPage.getByText(SLIDE_TITLE_RE).first()).toBeVisible();

  // Restore the network: the socket reconnects (exponential backoff, so the
  // next attempt can be up to ~30s away) and the badge disappears.
  await tvPage.context().setOffline(false);
  await expect(tvPage.getByText('OFFLINE')).toBeHidden({ timeout: 45000 });
  await expect(tvPage.getByText(SLIDE_TITLE_RE).first()).toBeVisible();

  await adminPage.close();
  await tvPage.close();
});
```

说明:庆祝结束后轮播回到**被打断的那一页**(剩余时间续播),录入成交期间轮播可能已从 `SALES CHAMPIONS` 翻到别页,所以第 7 步用 `SLIDE_TITLE_RE` 断言"回到任意一个轮播页"而不是固定某页。

- [ ] **Step 5: 类型检查**

```bash
npx tsc --noEmit
```

预期:无输出,退出码 0(tsconfig 的 `**/*.ts` 覆盖 e2e 目录)。

- [ ] **Step 6: 构建并运行 E2E**

```bash
npm run build && npm run test:e2e
```

预期输出(耗时约 2–4 分钟,含服务器启动与离线用例的重连等待):

```
Running 3 tests using 1 worker

  ✓  e2e/tv-flow.spec.ts › pairing code shows on tv
  ✓  e2e/tv-flow.spec.ts › sale entry triggers celebration on tv
  ✓  e2e/tv-flow.spec.ts › tv shows offline badge and keeps rotating while disconnected

  3 passed
```

若失败:先看报错属于哪类——(a) `Could not find a production build` → 忘了 build;(b) 端口 3344 被占用(`reuseExistingServer: false` 会拒绝启动)→ 结束占用进程后重跑;(c) 定位器 timeout / strict mode violation → 按本任务开头的 DOM 约定清单核对实际组件文案并修正 spec 正则。失败后 `npx playwright show-report` 可查看带截图的报告。

- [ ] **Step 7: 提交**

```bash
git add playwright.config.ts e2e/start-server.ts e2e/tv-flow.spec.ts
git commit -m "test: add Playwright e2e for TV pairing and celebration flow"
```

---

### Task 27: 部署配置与文档

契约 §17 的 Dockerfile 与 railway.json 原文照抄;README 为英文交付物;最后核对 `.env.example` 与契约/README 一致,并做一次本地 production 冒烟(构建 → 启动 → 探活 `/api/health`)。依赖 Task 26(全部功能与测试就绪)。

**Files:**
- Create: `Dockerfile`
- Create: `railway.json`
- Create: `README.md`
- Verify(如有差异则 Modify): `.env.example`

- [ ] **Step 1: 创建 Dockerfile(契约 §17 原文,一字不改)**

```dockerfile
FROM node:22-slim AS base
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
ENV NODE_ENV=production
EXPOSE 3000
CMD ["npx", "tsx", "server.ts"]
```

- [ ] **Step 2: 创建 railway.json(契约 §17 原文,一字不改)**

```json
{ "$schema": "https://railway.app/railway.schema.json", "build": { "builder": "DOCKERFILE" }, "deploy": { "healthcheckPath": "/api/health", "restartPolicyType": "ON_FAILURE" } }
```

- [ ] **Step 3: 提交部署配置**

```bash
git add Dockerfile railway.json
git commit -m "chore: add Dockerfile and Railway deployment config"
```

- [ ] **Step 4: 创建 README.md(完整内容如下)**

````markdown
# Sales Champions TV

A Spinify-style sales leaderboard for real-estate offices. An office TV runs a
full-screen, esports-styled carousel of sales leaderboards, team goal progress,
hot listings and announcements — and the moment a sale is recorded in the admin
console, every TV interrupts its carousel to play a full-screen celebration
with the agent's personal anthem.

Built as a single Next.js (App Router) application served by a custom Node
server that hosts a WebSocket hub on the same port. PostgreSQL via Drizzle ORM
(embedded PGlite in development), Tailwind CSS, Framer Motion, Vitest and
Playwright.

## Quickstart (local development)

Requirements: Node.js >= 20.

```bash
npm install
cp .env.example .env          # defaults are fine for local dev
npm run db:seed -- --demo     # creates org, admin user and demo data
npm run dev                   # http://localhost:3000
```

- Admin console: http://localhost:3000/admin — log in with `ADMIN_EMAIL` /
  `ADMIN_PASSWORD` from your `.env` (defaults: `admin@example.com` /
  `admin1234`).
- TV display: http://localhost:3000/tv
- Without `DATABASE_URL` the app uses an embedded PGlite database stored in
  `.data/pglite` — no local PostgreSQL needed.

## Pairing a TV

1. On the TV, open `https://<your-host>/tv` in a browser (kiosk / full-screen
   mode recommended). The screen shows a 6-character pairing code (valid for
   15 minutes; it refreshes automatically).
2. In the admin console go to **Screens**, enter the code under **Pair a TV**
   and give the screen a name.
3. The TV switches to a **CLICK TO START** overlay. Click once — this unlocks
   audio (a browser requirement) and enters the full-screen carousel.
4. The device token is stored in the TV browser's localStorage, so the TV
   reconnects automatically after a power cut or server restart — no
   re-pairing needed. Use **Unpair** on the Screens page to reset a TV.

## Environment variables

See `.env.example` for the authoritative list:

| Variable | Purpose |
|---|---|
| `PORT` | HTTP port (default `3000`) |
| `TZ` | Server timezone used for leaderboard periods, e.g. `Australia/Sydney` |
| `SESSION_SECRET` | Secret for admin session cookies — random, at least 32 chars |
| `DATABASE_URL` | PostgreSQL connection string; leave unset to use embedded PGlite (dev) |
| `PGLITE_MEMORY` | `1` = in-memory database (tests only) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | First admin account, created by `npm run db:seed` |
| `STORAGE_DRIVER` | `local` (disk, dev) or `s3` (Cloudflare R2, production) |
| `R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_PUBLIC_BASE_URL` | Cloudflare R2 credentials, required when `STORAGE_DRIVER=s3` |

## Deploying to Railway

1. Create a new Railway project from this repository. `railway.json` tells
   Railway to build with the `Dockerfile` and to health-check `/api/health`.
2. Add the **PostgreSQL** plugin to the project.
3. On the app service, set the variables:
   - `DATABASE_URL` — reference the plugin: `${{Postgres.DATABASE_URL}}`
   - `SESSION_SECRET` — a long random string (32+ chars)
   - `TZ` — e.g. `Australia/Sydney`
   - `STORAGE_DRIVER` — `s3`, plus `R2_ENDPOINT`, `R2_BUCKET`,
     `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_PUBLIC_BASE_URL`
     (with `local`, uploads are written to the container disk and are lost on
     every redeploy — use R2 in production)
   - `ADMIN_EMAIL`, `ADMIN_PASSWORD` — credentials for the first admin
4. Deploy (push to the connected branch). Database migrations run
   automatically on server start.
5. Run the seed once against the deployed service:
   `railway run npm run db:seed` (append `-- --demo` for demo data).

## Architecture

One Next.js application served by a custom Node server (`server.ts` →
`src/server/bootstrap.ts`) that hosts both the HTTP app and a `ws`
WebSocketServer on `/ws` on the same port. Admin CRUD API routes write to
PostgreSQL through Drizzle ORM and broadcast events (`celebration.play`,
`data.updated`, `config.updated`) through an in-process hub to every paired
TV, so a recorded sale reaches all TVs in under two seconds without any
message queue. TVs are plain browser clients paired with 6-character codes;
they cache their state locally and render the carousel without per-slide
requests. Money is stored as integer cents; every table carries an `org_id`
so the schema is ready for multi-tenancy. Uploaded files (agent photos,
anthems, listing photos) go to local disk in development and Cloudflare R2
(S3 API) in production. A `CrmAdapter` interface (`src/lib/crm/adapter.ts`)
reserves the integration point for future CRM sync (Agentbox first).

```
server.ts               # entry point — custom Node server (Next + WebSocket, one port)
src/
  server/bootstrap.ts   # server assembly: Next handler + /ws upgrade + WS hub wiring
  lib/                  # domain logic: db (Drizzle), auth, leaderboards, pairing,
                        # carousel reducer, settings, storage drivers, WS hub, CRM adapter
  app/                  # Next.js App Router: / (landing), /tv, /admin, /api/*
  components/           # tv/ (slides, celebration overlay, audio) and admin/ UI kit
  hooks/                # useTvSocket — TV WebSocket lifecycle
tests/                  # Vitest unit + integration tests (in-memory PGlite)
e2e/                    # Playwright end-to-end tests
drizzle/                # generated SQL migrations
```

## Testing

```bash
npm test                            # unit + integration tests (Vitest)
npx playwright install chromium     # once, before the first e2e run
npm run build && npm run test:e2e   # end-to-end tests (Playwright)
```
````

- [ ] **Step 5: 核对 .env.example 与契约、README 一致**

`.env.example` 由 Task 1 创建,权威内容(契约 §3)如下。先 diff 确认逐字一致:

```bash
diff .env.example - <<'EOF'
# Server
PORT=3000
TZ=Australia/Sydney
SESSION_SECRET=change-me-to-a-random-string-at-least-32-chars

# Database — leave DATABASE_URL unset to use embedded PGlite (dev). Set for PostgreSQL (prod).
# DATABASE_URL=postgres://user:pass@host:5432/dbname
# PGLITE_MEMORY=1   # tests only: in-memory db

# First admin (created by `npm run db:seed`)
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=admin1234

# Storage: local | s3
STORAGE_DRIVER=local
# R2_ENDPOINT=https://<account>.r2.cloudflarestorage.com
# R2_BUCKET=tv-saas
# R2_ACCESS_KEY_ID=
# R2_SECRET_ACCESS_KEY=
# R2_PUBLIC_BASE_URL=https://files.example.com
EOF
```

预期:无输出,退出码 0。若有差异,用上方 heredoc 中的内容整体覆盖 `.env.example`(契约版本为准)。

再交叉核对每个变量在 README 与 `.env.example` 中都出现:

```bash
for v in PORT TZ SESSION_SECRET DATABASE_URL PGLITE_MEMORY ADMIN_EMAIL ADMIN_PASSWORD STORAGE_DRIVER R2_ENDPOINT R2_BUCKET R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_PUBLIC_BASE_URL; do
  grep -q "$v" README.md || echo "MISSING IN README: $v"
  grep -q "$v" .env.example || echo "MISSING IN .env.example: $v"
done
```

预期:无任何输出。若有 `MISSING` 行,把缺失变量补进 README 的 Environment variables 表格后重跑。

- [ ] **Step 6: 本地 production 冒烟**

构建后以 production 模式启动(`NODE_ENV=production npx tsx server.ts` 即 `npm start` 脚本的展开形式,后台运行便于 Git Bash 下按 PID 结束),探活 health 端点:

```bash
npm run build
[ -f .env ] || cp .env.example .env
(NODE_ENV=production npx tsx server.ts > /tmp/prod-smoke.log 2>&1 & echo $! > /tmp/prod-smoke.pid)
sleep 12
curl -s http://localhost:3000/api/health
```

预期 curl 输出:

```
{"ok":true}
```

同时 `/tmp/prod-smoke.log` 中应有一行 `> Ready on http://localhost:3000`。收尾停掉冒烟进程:

```bash
kill "$(cat /tmp/prod-smoke.pid)" 2>/dev/null || true
```

若之后 3000 端口仍被占用(Windows 下 npx 的子进程可能残留),定位并强杀:

```bash
netstat -ano | grep ':3000' | grep LISTENING
taskkill //F //PID <上一命令末列的 PID>
```

- [ ] **Step 7: 提交文档**

```bash
git add README.md .env.example
git commit -m "docs: add project README"
```
