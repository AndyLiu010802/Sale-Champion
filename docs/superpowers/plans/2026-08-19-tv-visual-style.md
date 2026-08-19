# TV 视觉风格升级(液态玻璃 + 翻牌板标题 + 渐变 3D 数值 + 黄金荣耀标题)Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在天际线背景(main @ ac5b1cd)之上做四项纯视觉升级:① TV 全部卡片/榜单行改**液态玻璃**(共享 `.glass` 类;Chromium 检测通过后叠加 SVG `feTurbulence + feDisplacementMap` 折射扭曲,其余浏览器回落毛玻璃零破损);② 记分卡 MTD/YTD 主标题 `SALES SCORECARD` 换**机场翻牌板** `SplitFlapTitle`(翻入错峰动画 + 偶发抖动,行高钉死 60px,sr-only + aria-label 保 E2E);③ 数值改**青→蓝→深紫渐变 + 3D 挤出 + 微青光**(`GradientValue` 组件 + `.value-3d` 类,真实 DOM 文本);④ 非记分卡五页大标题改**黄金荣耀**(`.gold-title`:金属金渐变 + 浮雕 + 每 5s shine sweep)。分页像素预算与全部 E2E 文字断言不受影响;管理后台不改。

**Architecture:** 全部落在现有结构内,零新依赖、零 schema/settings 迁移:样式集中 `src/app/globals.css`(`.glass`/`.glass-refract .glass` 进 `@layer components`,`value-3d`/`gold-title`/keyframes 跟 `.neon-text` 同段落无层写法);两个新组件 `src/components/tv/SplitFlapTitle.tsx`(动画,配纯逻辑 `splitFlap.ts` + 3 个单测)与 `src/components/tv/GradientValue.tsx`(3 行包装,保证真实 DOM 文本与 `data-text` 永不脱节);TvApp 根部加隐藏 SVG filter + 一次性 `CSS.supports` 检测 effect。**tailwind.config.ts 不动**(已读现状核对:所需颜色全为写死 CSS 值,动画走 globals.css/组件内联 keyframes,无需扩展 token)。

**Tech Stack:** 与主项目一致(Next.js 15 / React 19 / Tailwind 3.4 / framer-motion 已装但本计划不新用 / Vitest / Playwright)。

**执行约定:**
- 基线:分支 `feature/tv-visual-style`(**已存在且已检出**,HEAD `52cb539` = 规格提交,落在 main 合并提交 `ac5b1cd` 之上)。开工前确认:
  ```bash
  git rev-parse --abbrev-ref HEAD
  git status
  ```
  预期:输出 `feature/tv-visual-style`;工作区干净(本计划文档已提交)。
- 基线测试数(**2026-08-19 已实测**):`npx vitest run` → **25 files / 331 tests 全绿**(约 114s);E2E `npm run test:e2e` → 6 条(约 8–10 分钟,offline 用例自身 3–4 分钟)。**E2E 全量只在 Task 3 收尾跑一次**;Task 2 有一条可选单条 smoke。
- **Playwright sr-only 语义(已实测,Task 2 的 E2E 结论依据)**:用本仓 `@playwright/test` 的 Chromium 对 Tailwind `sr-only` 元素(1×1px + clip)实测:`getByText('SALES SCORECARD')` 与 `getByText(SLIDE_TITLE_RE)` 都**只命中 sr-only 节点**(Playwright 取"包含该文本的最小元素",拆字母 tile 的容器拼接文本不含空格、也不参与最小匹配),`isVisible()` 返回 **true**(判定标准 = bounding box 非空 且无 `visibility:hidden`,1×1 即非空),`expect(...).toBeVisible()` **通过**(string 与 regex、strict 单匹配均过)。⇒ **现有 6 条 E2E 断言零改动**(逐条核对见 Task 2 Step 5 / Task 3 Step 8)。
- 按 Task 1→2→3 顺序执行,每个 Task 结束时 `npx tsc --noEmit` 零输出、全量 vitest 全绿、`npm run build` 成功、独立 commit。
- 规格(权威需求):`docs/superpowers/specs/2026-08-19-tv-visual-style-design.md`。
- 所有命令在项目根 `C:\Users\andyl\Desktop\工作文档\TV SaaS` 执行(均为跨平台 `npx`/`npm` 形式)。
- **色值全部定稿写死**(无"自行调整"项):数值渐变 `#2EE6C9 → #3B7BC8(55%) → #4A2B8C`,挤出层 `#0E2233` + `#081521`,青光 `rgba(46,230,201,0.35)`;金色 `#F9E7A0 → #F5C445(45%) → #A8741A`,高光带 `rgba(255,255,255,0.85)`,浮雕影 `rgba(62,36,2,0.6)`,金晕 `rgba(245,196,69,0.30)`;玻璃四层 rgba 与翻牌牌面渐变见各任务 CSS 原文。
- **定高承诺(总表,逐任务核对)**:榜单行 `h-[72px]`、记分卡表行 `h-[56px]`(本计划不触碰该行)、表头 `h-[48px]`、汇总块行 `h-[120px]`、公告卡 `h-[224px]`、SplitFlapTitle 行 `h-[60px]`(= 原 `text-6xl` 标题 60px)、`SCORECARD_RESERVED_PX=388` / `LEADERBOARD_ITEM_PX=84` / `ANNOUNCEMENT_ITEM_PX=248` 全部不变。所有玻璃替换只动背景/边框/圆角/阴影/滤镜类;Tailwind preflight 全局 `box-sizing: border-box`,`.glass` 的 1px 描边内含于既有定高。唯一的 2px 余量分析(记分卡表格容器)见 Task 1 Step 3-②。
- **`.glass` 放 `@layer components`**(Tailwind v3 编译期把它重排到 utilities 之前):这样元素级工具类(`rounded-full`/`rounded-2xl`/`border-l-4`/`border-l-gold`)能按需覆盖玻璃基底的边框与圆角。`.glass` 类内**不含 border-radius**——spec §1.1 的 rounded-2xl(行类 rounded-xl)改为元素级工具类落实(圆角写进类会把 OfflineBadge 的 `rounded-full` 压掉破形,globals.css 自定义段落在 utilities 之后)。`glass`/`glass-refract` 两个 token 均出现在被扫描源码里(className 字符串 / TvApp 的 `classList.add('glass-refract')` 字面量),Tailwind content 扫描不会摇掉。
- **榜单行 rank 彩边配套改法**:`rowBorderClass` 从 `border-gold` 系(设四边 border-color)改 `border-l-gold` 系(只设左边),否则 `.glass` 新增的 1px 四边白描边会被染成金/银/铜。
- **value-3d 定稿组件方案**:`GradientValue`(内部 `.value-3d` 类 + `data-text` 伪元素副本)。弃裸类直贴的原因:每处数值都是表达式(`formatMoney(...)` 等),裸类要把表达式写两遍(children + data-text),组件保证二者永不脱节。全计划统一用组件。
- **金色标题文案以真实 DOM 为准**:SALES CHAMPIONS / TOP EARNERS / LISTING LEGENDS / TEAM GOALS / TEAM NEWS(spec §4 中 TOP LISTERS / GCI LEADERS / ANNOUNCEMENTS 为示意名;页面集合就是这非记分卡五页,`SLIDE_TITLE_RE` 与实际文案一致,已核对 `e2e/tv-flow.spec.ts`)。
- README 不改(本轮纯视觉,无新 env/功能面);管理后台任何样式不改(spec §6)。

---
### Task 1: 液态玻璃面板 + Chromium 折射增强(设计 §1)

**Files:**
- Modify: `src/app/globals.css`(`.glass` 基底 + `.glass-refract .glass` 增强)
- Modify: `src/components/tv/TvApp.tsx`(隐藏 SVG filter 组件 ×2 分支挂载、`CSS.supports` 检测 effect、页码角标玻璃化)
- Modify: `src/components/tv/slides/ScorecardSlide.tsx`(汇总块 + 表格容器)
- Modify: `src/components/tv/slides/LeaderboardSlide.tsx`(榜单行 + `rowBorderClass` 改左边色)
- Modify: `src/components/tv/slides/GoalSlide.tsx`(目标卡)
- Modify: `src/components/tv/slides/AnnouncementSlide.tsx`(公告卡)
- Modify: `src/components/tv/PairingScreen.tsx`(配对码数字格)
- Modify: `src/components/tv/OfflineBadge.tsx`(OFFLINE 徽标)

纯视觉无单测(spec §5);门禁 = `npx tsc --noEmit` 零输出 + 全量 vitest 不回退(25 files / 331)+ `npm run build` 成功。

- [ ] **Step 1: globals.css 加玻璃两级**

  找到(当前文件末尾两行,逐字):

  ```css
  .neon-text { text-shadow: 0 0 8px currentColor, 0 0 24px currentColor; }
  .neon-border { box-shadow: 0 0 8px rgba(0, 229, 255, 0.6), inset 0 0 8px rgba(0, 229, 255, 0.15); }
  ```

  替换为(原样保留 + 追加):

  ```css
  .neon-text { text-shadow: 0 0 8px currentColor, 0 0 24px currentColor; }
  .neon-border { box-shadow: 0 0 8px rgba(0, 229, 255, 0.6), inset 0 0 8px rgba(0, 229, 255, 0.15); }

  /* —— 液态玻璃面板(视觉设计 §1)——
     基底(全浏览器):135° 层叠渐变(白高光 0.06 → panel-2 → panel 半透)+ 1px 半透明
     白描边(border-box 内含,不动任何定高)+ 内侧上高光/下暗边两条 inset 阴影模拟玻璃
     厚度 + 外部柔投影 + backdrop-filter 毛玻璃。放 @layer components:让元素级工具类
     (rounded-full / rounded-2xl / border-l-4 / border-l-gold 等)能覆盖边框与圆角——
     圆角因此不进本类,由各元素自带 rounded-* 决定。 */
  @layer components {
    .glass {
      background: linear-gradient(
        135deg,
        rgba(255, 255, 255, 0.06) 0%,
        rgba(22, 32, 58, 0.55) 40%,
        rgba(16, 24, 40, 0.68) 100%
      );
      border: 1px solid rgba(255, 255, 255, 0.14);
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.12),
        inset 0 -1px 0 rgba(0, 0, 0, 0.35),
        0 8px 24px rgba(0, 0, 0, 0.35);
      backdrop-filter: blur(6px) saturate(1.5);
      -webkit-backdrop-filter: blur(6px) saturate(1.5);
    }
  }

  /* 折射增强(视觉设计 §1.2):TvApp 检测 CSS.supports('backdrop-filter','url(#liquid-glass)')
     通过后在 <html> 挂 glass-refract;SVG filter(feTurbulence 固定 seed=7 +
     feDisplacementMap scale=13)由 TvApp 根部渲染。不支持的浏览器停留在上面的毛玻璃
     基底,零破损。选择器特异性 0-2-0 > .glass 的 0-1-0,无论层序必胜。 */
  .glass-refract .glass {
    backdrop-filter: url(#liquid-glass) blur(6px) saturate(1.5);
    -webkit-backdrop-filter: url(#liquid-glass) blur(6px) saturate(1.5);
  }
  ```

- [ ] **Step 2: TvApp——SVG filter + 检测 effect + 两分支挂载 + 页码角标(四处修改)**

  ① 找到(唯一):

  ```ts
  export default function TvApp() {
  ```

  替换为(前插组件定义):

  ```tsx
  /** 液态玻璃折射用的隐藏 SVG filter(视觉设计 §1.2):feTurbulence fractalNoise
   *  baseFrequency 0.008 0.012、numOctaves 2、固定 seed=7(布局稳定不闪变),
   *  feDisplacementMap scale=13(轻微扭曲,spec 给的 12–14 区间取中)。
   *  配对/主界面两个渲染分支都要挂,故抽成小组件;width/height 0 不占布局。 */
  function LiquidGlassFilter() {
    return (
      <svg aria-hidden="true" width="0" height="0" style={{ position: 'absolute' }}>
        <filter id="liquid-glass" x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.008 0.012" numOctaves="2" seed="7" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="13" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>
    );
  }

  export default function TvApp() {
  ```

  ② 找到(carousel tick effect 的注释头,唯一):

  ```ts
    // Keep rotating while offline too — cached data + OfflineBadge (spec §8);
    // only connecting/pairing (no data yet) and locked audio stop the carousel.
  ```

  替换为(前插检测 effect):

  ```ts
    // 液态玻璃折射检测(视觉设计 §1.2):仅客户端一次性执行,SSR 安全。Chromium 系
    // 支持 backdrop-filter: url(#…) 时在 <html> 挂 glass-refract,.glass 升级为折射
    // 扭曲;不支持(Firefox/Safari)停留在毛玻璃基底。挂 <html> 而非组件根:
    // 配对/主界面两个分支共用一次检测结果。
    useEffect(() => {
      if (typeof CSS !== 'undefined' && CSS.supports('backdrop-filter', 'url(#liquid-glass)')) {
        document.documentElement.classList.add('glass-refract');
      }
    }, []);

    // Keep rotating while offline too — cached data + OfflineBadge (spec §8);
    // only connecting/pairing (no data yet) and locked audio stop the carousel.
  ```

  ③ 找到(配对分支):

  ```tsx
        <div className="relative h-screen w-screen overflow-hidden bg-bg">
          <SkylineBackground weather={weather} paused={false} />
          <PairingScreen pairCode={socket.pairCode} />
        </div>
  ```

  替换为:

  ```tsx
        <div className="relative h-screen w-screen overflow-hidden bg-bg">
          <LiquidGlassFilter />
          <SkylineBackground weather={weather} paused={false} />
          <PairingScreen pairCode={socket.pairCode} />
        </div>
  ```

  ④ 找到(主分支根部):

  ```tsx
      <div className="relative h-screen w-screen overflow-hidden bg-bg">
        {/* 天际线背景(设计 §2):z-0 垫底;庆祝/生日全屏播放期间暂停渲染循环。 */}
        <SkylineBackground weather={weather} paused={carousel.mode === 'celebrate'} />
  ```

  替换为:

  ```tsx
      <div className="relative h-screen w-screen overflow-hidden bg-bg">
        <LiquidGlassFilter />
        {/* 天际线背景(设计 §2):z-0 垫底;庆祝/生日全屏播放期间暂停渲染循环。 */}
        <SkylineBackground weather={weather} paused={carousel.mode === 'celebrate'} />
  ```

  ⑤ 找到(页码角标;含 style 行保证唯一):

  ```tsx
            className="fixed right-8 top-8 z-40 rounded-lg bg-panel/60 px-4 py-1 font-heading text-3xl text-muted backdrop-blur-sm"
            style={{ textShadow: '0 0 12px rgba(0, 229, 255, 0.35)' }}
  ```

  替换为(玻璃化 + 圆角升 rounded-xl;文字 `1/2` 不变,E2E exact 断言不受影响;
  浮动角标无像素预算,1px 描边只影响自身内容盒):

  ```tsx
            className="glass fixed right-8 top-8 z-40 rounded-xl px-4 py-1 font-heading text-3xl text-muted"
            style={{ textShadow: '0 0 12px rgba(0, 229, 255, 0.35)' }}
  ```

- [ ] **Step 3: 六个组件的玻璃替换(8 处锚点,逐字)**

  ① 修改 `src/components/tv/slides/ScorecardSlide.tsx`(TotalBlock 汇总块)。找到:

  ```tsx
      <div className="flex flex-col justify-center rounded-xl bg-panel/70 px-8 backdrop-blur-sm">
  ```

  替换为(外高由父 grid 行 `h-[120px]` 钉死,border-box 内含描边,定高不变):

  ```tsx
      <div className="glass flex flex-col justify-center rounded-2xl px-8">
  ```

  ② 同文件(表格容器)。找到:

  ```tsx
            <div className="mt-8 flex-1 overflow-hidden rounded-xl bg-panel/60 px-6 backdrop-blur-sm">
  ```

  替换为:

  ```tsx
            <div className="glass mt-8 flex-1 overflow-hidden rounded-2xl px-6">
  ```

  **2px 余量分析(唯一一处 border 吃进内容盒的容器)**:容量公式 `floor((H-388)/56)` 留给
  容器的 overflow 余量 = `(H-388) mod 56` px,新描边占用其中 2px。1080p:`692 mod 56 = 20px`
  ✓;E2E 分页视口 520px:容器内高 178−2 = 176 ≥ 表头 48 + 2 行 112 = 160 ✓。仅当
  `(H-388) mod 56 ∈ {0,1}` 的极端高度会裁掉末行底部 ≤2px 行内边距(行内容垂直居中,
  文字上下各 ~13px 空白,不可见)。分页容量常量与计算不动。

  ③ 修改 `src/components/tv/slides/LeaderboardSlide.tsx`(rank 彩边改左边色,配套 `.glass` 四边描边)。找到:

  ```ts
  function rowBorderClass(rank: number): string {
    if (rank === 1) return 'border-gold';
    if (rank === 2) return 'border-silver';
    if (rank === 3) return 'border-bronze';
    return 'border-panel-2';
  }
  ```

  替换为:

  ```ts
  /** rank 彩色左边:只染 border-left(.glass 会给四边 1px 白描边,四边色类会把它整圈染金)。 */
  function rowBorderClass(rank: number): string {
    if (rank === 1) return 'border-l-gold';
    if (rank === 2) return 'border-l-silver';
    if (rank === 3) return 'border-l-bronze';
    return 'border-l-panel-2';
  }
  ```

  ④ 同文件(榜单行)。找到:

  ```tsx
                className={`flex h-[72px] shrink-0 items-center gap-8 rounded-lg border-l-4 bg-panel/70 px-8 backdrop-blur-sm ${rowBorderClass(entry.rank)}`}
  ```

  替换为(h-[72px] 定高与 `LEADERBOARD_ITEM_PX=84` 不变;行类圆角按 spec 升 rounded-xl;
  `border-l-4` 在 utilities 层覆盖 `.glass` 的左边 1px):

  ```tsx
                className={`glass flex h-[72px] shrink-0 items-center gap-8 rounded-xl border-l-4 px-8 ${rowBorderClass(entry.rank)}`}
  ```

  ⑤ 修改 `src/components/tv/slides/GoalSlide.tsx`(目标卡)。找到:

  ```tsx
                className="rounded-xl bg-panel/70 p-10 backdrop-blur-sm"
  ```

  替换为(目标页恒 1 页无分页预算,卡片内容撑高 +2px 描边无影响):

  ```tsx
                className="glass rounded-2xl p-10"
  ```

  ⑥ 修改 `src/components/tv/slides/AnnouncementSlide.tsx`(公告卡)。找到:

  ```tsx
                className="flex h-[224px] shrink-0 items-start gap-8 rounded-xl bg-panel/70 p-8 backdrop-blur-sm"
  ```

  替换为(h-[224px] 定高与 `ANNOUNCEMENT_ITEM_PX=248` 不变):

  ```tsx
                className="glass flex h-[224px] shrink-0 items-start gap-8 rounded-2xl p-8"
  ```

  ⑦ 修改 `src/components/tv/PairingScreen.tsx`(配对码数字格)。找到:

  ```tsx
                className="neon-border flex h-40 w-32 items-center justify-center rounded-xl bg-panel/70 font-display text-8xl text-neon neon-text backdrop-blur-sm"
  ```

  替换为(保留 neon-border/neon-text 霓虹风:`.neon-border` 在 globals 无层段落、位于
  components 层之后,box-shadow 覆盖 `.glass` 的 inset 阴影——数字格拿玻璃底/描边/blur、
  保霓虹光晕,这是有意取舍):

  ```tsx
                className="glass neon-border flex h-40 w-32 items-center justify-center rounded-2xl font-display text-8xl text-neon neon-text"
  ```

  ⑧ 修改 `src/components/tv/OfflineBadge.tsx`(OFFLINE 徽标)。找到:

  ```tsx
      <div className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-panel/70 px-4 py-2 backdrop-blur-sm">
  ```

  替换为(`rounded-full` 在 utilities 层,覆盖无圆角的 `.glass`,药丸形保持):

  ```tsx
      <div className="glass fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full px-4 py-2">
  ```

- [ ] **Step 4: 全仓校验**

  ```bash
  npx tsc --noEmit
  npx vitest run
  npm run build
  ```

  预期:tsc 零输出;全量 **25 files / 331 tests** 全绿(本任务无新增单测);build exit 0。

- [ ] **Step 5: Commit**

  ```bash
  git add src/app/globals.css src/components/tv/TvApp.tsx src/components/tv/slides/ScorecardSlide.tsx src/components/tv/slides/LeaderboardSlide.tsx src/components/tv/slides/GoalSlide.tsx src/components/tv/slides/AnnouncementSlide.tsx src/components/tv/PairingScreen.tsx src/components/tv/OfflineBadge.tsx
  git commit -m "feat: liquid glass panels with chromium refraction enhancement"
  ```

---
### Task 2: SplitFlapTitle 翻牌板标题 + ScorecardSlide 接线(设计 §2)

**Files:**
- Create: `src/components/tv/splitFlap.ts`(纯逻辑:`FLAP_CHARS`/`randomFlapChar`/`flapSequence`)
- Create: `src/components/tv/SplitFlapTitle.tsx`(翻牌组件,整文件)
- Modify: `src/components/tv/slides/ScorecardSlide.tsx`(heading 换组件;MTD/YTD 共用同一处)
- Modify: `src/components/tv/TvApp.tsx`(仅 SCORECARD_RESERVED_PX 注释措辞同步)
- Test: `tests/components/split-flap.test.ts`(新建,3 用例;vitest include `tests/**/*.test.ts` 已覆盖,environment node 纯函数无 DOM)

门禁 = `npx tsc --noEmit` 零输出 + 全量 vitest 全绿(**26 files / 334 tests** = 331+3)+ `npm run build` 成功。

- [ ] **Step 1: 写失败测试(完整内容)**

  创建 `tests/components/split-flap.test.ts`:

  ```ts
  import { describe, expect, it } from 'vitest';
  import { FLAP_CHARS, flapSequence, randomFlapChar } from '@/components/tv/splitFlap';

  /** 固定种子伪随机(mulberry32):与 SkylineBackground 同款,序列可复现。 */
  function mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), a | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  describe('flapSequence', () => {
    it('ends on the target with 3-6 intermediates, all from FLAP_CHARS', () => {
      for (let seed = 1; seed <= 50; seed++) {
        const seq = flapSequence('S', mulberry32(seed));
        expect(seq[seq.length - 1]).toBe('S');
        expect(seq.length).toBeGreaterThanOrEqual(4); // 3 中间 + 1 目标
        expect(seq.length).toBeLessThanOrEqual(7);    // 6 中间 + 1 目标
        for (const ch of seq) expect(FLAP_CHARS).toContain(ch);
      }
    });

    it('never repeats adjacent chars and never shows the target early', () => {
      for (let seed = 1; seed <= 50; seed++) {
        const seq = flapSequence('D', mulberry32(seed));
        for (let i = 0; i < seq.length - 1; i++) {
          expect(seq[i]).not.toBe(seq[i + 1]);
          expect(seq[i]).not.toBe('D'); // 目标只在末位出现
        }
      }
    });

    it('is deterministic for a fixed rng seed', () => {
      expect(flapSequence('R', mulberry32(42))).toEqual(flapSequence('R', mulberry32(42)));
      expect(randomFlapChar(mulberry32(7))).toBe(randomFlapChar(mulberry32(7)));
    });
  });
  ```

  运行确认失败:

  ```bash
  npx vitest run tests/components/split-flap.test.ts
  ```

  预期:整文件加载失败(`Failed to resolve import "@/components/tv/splitFlap"`——模块尚不存在)。

- [ ] **Step 2: 实现纯逻辑(整文件)并转绿**

  创建 `src/components/tv/splitFlap.ts`:

  ```ts
  // SplitFlapTitle 的纯逻辑(视觉设计 §2):翻转序列生成,组件与单测共用。
  // rng 显式注入([0,1) 均匀随机):组件传 Math.random,单测传固定种子伪随机钉死输出。

  export const FLAP_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  export type Rng = () => number;

  /** FLAP_CHARS 里均匀取一个字符。 */
  export function randomFlapChar(rng: Rng): string {
    return FLAP_CHARS[Math.floor(rng() * FLAP_CHARS.length) % FLAP_CHARS.length];
  }

  /** 顺延到下一个字母(Z 回绕 A):确定性避开禁用字符,不额外消耗 rng。 */
  function nextChar(ch: string): string {
    return FLAP_CHARS[(FLAP_CHARS.indexOf(ch) + 1) % FLAP_CHARS.length];
  }

  /**
   * 一块翻牌的完整翻转序列:3–6 个随机中间字母 + 末位 targetChar(视觉设计 §2)。
   * 约束:相邻两格不同、中间字母不等于 targetChar(避免"停定又翻走"的观感)。
   * targetChar 不在 A–Z 时(理论上不会发生)序列只含 targetChar。
   */
  export function flapSequence(targetChar: string, rng: Rng): string[] {
    if (!FLAP_CHARS.includes(targetChar)) return [targetChar];
    const spins = 3 + Math.floor(rng() * 4); // 3..6
    const seq: string[] = [];
    let prev = '';
    for (let i = 0; i < spins; i++) {
      let ch = randomFlapChar(rng);
      while (ch === prev || ch === targetChar) ch = nextChar(ch);
      seq.push(ch);
      prev = ch;
    }
    seq.push(targetChar);
    return seq;
  }
  ```

  转绿:

  ```bash
  npx vitest run tests/components/split-flap.test.ts
  ```

  预期:**3 passed**。

- [ ] **Step 3: 创建 `src/components/tv/SplitFlapTitle.tsx`(整文件,一字不省)**

  ```tsx
  'use client';

  import { useEffect, useState } from 'react';
  import { flapSequence, randomFlapChar } from '@/components/tv/splitFlap';

  const STAGGER_MS = 80;      // 各牌按字母序错峰翻入(视觉设计 §2)
  const FLIP_MS = 90;         // 单次翻转时长
  const JITTER_MIN_MS = 6000; // 偶发抖动:6–10s 随机间隔
  const JITTER_SPAN_MS = 4000;

  type Tile = { char: string; flips: number };

  /**
   * 机场翻牌板标题(视觉设计 §2):每字母一块翻牌,空格为间隙;整行钉死 h-[60px]
   * (原 text-6xl 标题行的高度——TvApp SCORECARD_RESERVED_PX=388 依赖它,不可改)。
   * - 挂载(轮播切到本页/翻页重挂)时:各牌从随机字母起,错峰 80ms,翻 3–6 次
   *   (每次 90ms rotateX)后停到目标字母;
   * - 停定期间每 6–10s 随机取 1–2 块牌快翻两轮回原字母;定时器卸载全清;
   * - E2E/可访问性:sr-only 完整标题文本 + 容器 aria-label,翻牌 tile 全部
   *   aria-hidden。Playwright 实测(计划头部):getByText 命中 sr-only 节点且
   *   toBeVisible 通过(1×1 bounding box 非空),现有断言零改动。
   * SSR 安全:初始 state 即目标字母(服务端与客户端首帧一致,无 hydration
   * mismatch),全部动画在 mount effect 里启动。
   */
  export default function SplitFlapTitle({ text }: { text: string }) {
    const letters = Array.from(text);
    const [tiles, setTiles] = useState<Tile[]>(() => letters.map((ch) => ({ char: ch, flips: 0 })));

    useEffect(() => {
      const chars = Array.from(text);
      setTiles(chars.map((ch) => ({ char: ch, flips: 0 })));

      const timers: ReturnType<typeof setTimeout>[] = [];
      const later = (fn: () => void, ms: number) => timers.push(setTimeout(fn, ms));
      const setTile = (idx: number, char: string) =>
        setTiles((prev) => prev.map((t, i) => (i === idx ? { char, flips: t.flips + 1 } : t)));
      const playSequence = (idx: number, seq: string[], startMs: number) =>
        seq.forEach((ch, s) => later(() => setTile(idx, ch), startMs + s * FLIP_MS));

      // 翻入:随机起始字母 + 3–6 次随机翻转 + 目标字母。
      chars.forEach((ch, idx) => {
        if (ch === ' ') return;
        playSequence(idx, [randomFlapChar(Math.random), ...flapSequence(ch, Math.random)], idx * STAGGER_MS);
      });

      // 偶发抖动:6–10s 取 1–2 块牌快翻两轮回原字母(链式 setTimeout,卸载随 timers 清)。
      const letterIdx = chars.map((ch, i) => (ch === ' ' ? -1 : i)).filter((i) => i >= 0);
      const scheduleJitter = () => {
        later(() => {
          const picks = Math.random() < 0.5 ? 1 : 2;
          for (let n = 0; n < picks; n++) {
            const idx = letterIdx[Math.floor(Math.random() * letterIdx.length)];
            playSequence(idx, [randomFlapChar(Math.random), chars[idx]], 0);
          }
          scheduleJitter();
        }, JITTER_MIN_MS + Math.random() * JITTER_SPAN_MS);
      };
      scheduleJitter();

      return () => timers.forEach(clearTimeout);
    }, [text]);

    return (
      <h1 aria-label={text} className="flex h-[60px] items-center gap-2">
        <style>{`
          @keyframes flap-flip {
            from { transform: rotateX(-88deg); }
            to { transform: rotateX(0deg); }
          }
        `}</style>
        <span className="sr-only">{text}</span>
        {letters.map((ch, idx) =>
          ch === ' ' ? (
            <span key={idx} aria-hidden="true" className="w-5 shrink-0" />
          ) : (
            <span
              key={idx}
              aria-hidden="true"
              className="relative flex h-[60px] w-[46px] shrink-0 items-center justify-center overflow-hidden rounded-md"
              style={{
                background: 'linear-gradient(180deg, #2a2f3a 0%, #16191f 46%, #0a0c11 54%, #14171d 100%)',
                boxShadow:
                  'inset 0 1px 0 rgba(255,255,255,0.09), inset 0 -1px 0 rgba(0,0,0,0.6), 0 2px 6px rgba(0,0,0,0.5)',
                perspective: '300px',
              }}
            >
              <span
                key={tiles[idx] ? tiles[idx].flips : 0}
                className="font-display text-4xl font-bold text-white"
                style={{
                  animation: tiles[idx] && tiles[idx].flips > 0 ? `flap-flip ${FLIP_MS}ms ease-out` : undefined,
                  backfaceVisibility: 'hidden',
                }}
              >
                {tiles[idx] ? tiles[idx].char : ch}
              </span>
              <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-black/70" />
            </span>
          ),
        )}
      </h1>
    );
  }
  ```

  实现说明(定稿,不留调整项):
  - **翻转动画机制**:牌面字符每步变化时给内层 span 换 `key`(=累计 flips)强制 remount,
    90ms 的 `rotateX(-88deg)→0` CSS 动画随 remount 重启;`perspective: 300px` 挂在 tile 上
    使子元素获得 3D 透视。keyframes 走组件内 `<style>`(CelebrationOverlay 的
    celebration-float 同款先例),globals.css 本任务零改动。
  - **定高**:tile 与容器都 `h-[60px]`,`shrink-0` 防压缩;宽度 14 牌 ×46 + 空格 20 +
    gap-2×14 ≈ 776px,1920/1280 视口都放得下(1280 视口:776 + 副标题 ~360 < 1152 可用)。
  - **初始帧 = 目标字母**:SSR/水合一致;挂载后立即被随机字母覆盖开始翻入,静态观感
    是"标题闪现→翻牌翻入",符合翻牌板"上一班次残留→翻新"的机械观感。

- [ ] **Step 4: ScorecardSlide 接线 + TvApp 注释同步**

  ① 修改 `src/components/tv/slides/ScorecardSlide.tsx`。找到:

  ```ts
  import { formatCount, formatMoney } from '@/lib/format';
  ```

  替换为:

  ```ts
  import { formatCount, formatMoney } from '@/lib/format';
  import SplitFlapTitle from '@/components/tv/SplitFlapTitle';
  ```

  ② 同文件找到(标题行;MTD/YTD 两页共用本组件,一处替换双页生效):

  ```tsx
        <div className="flex items-baseline justify-between">
          <h1 className="font-display text-6xl text-neon neon-text">{heading}</h1>
          <span className="font-heading text-3xl text-muted">{subheading}</span>
        </div>
  ```

  替换为(items-baseline→items-center:翻牌行没有文字基线可对齐;行高仍由 60px 标题
  主导,副标题 30px 行改垂直居中,预算不变):

  ```tsx
        <div className="flex items-center justify-between">
          <SplitFlapTitle text={heading} />
          <span className="font-heading text-3xl text-muted">{subheading}</span>
        </div>
  ```

  ③ 修改 `src/components/tv/TvApp.tsx`(仅注释,与新实现措辞同步)。找到:

  ```ts
  // Scorecard 头部预留:py-12 上 48 + 标题 text-6xl 60 + mt-8 32 + 汇总块 h-[120px] 120
  // + mt-8 32 + 表头 h-[48px] 48 + py-12 下 48 = 388(与 ScorecardSlide 定高 CSS 同步)。
  ```

  替换为:

  ```ts
  // Scorecard 头部预留:py-12 上 48 + 标题行(SplitFlapTitle 定高 h-[60px])60 + mt-8 32
  // + 汇总块 h-[120px] 120 + mt-8 32 + 表头 h-[48px] 48 + py-12 下 48 = 388
  // (与 ScorecardSlide/SplitFlapTitle 定高 CSS 同步)。
  ```

- [ ] **Step 5: E2E 断言逐条核对(已完成,结论固化于此;本步无代码改动)**

  `e2e/tv-flow.spec.ts` 中所有可能被"标题拆 span"影响的断言,与实测语义(计划头部
  sr-only probe)对照:

  | 位置 | 断言 | 匹配机制(改造后) | 结论 |
  |---|---|---|---|
  | pairTv L58 | `getByText(SLIDE_TITLE_RE).first()` + `toBeVisible` | 首屏为 MTD 记分卡 → 命中 sr-only 节点(最小匹配);sr-only 1×1 box 判 visible | **零改动通过** |
  | 庆祝 L92 / 离线 L119、L125 / 生日 L149 | 同上(轮到非记分卡页时命中真实 DOM 金色标题;`gold-title` 是 background-clip 文字着色,DOM 文本不变,Playwright 可见性不看颜色) | 同上 | **零改动通过** |
  | 分页 L168、L170 | `getByText('1/2'/'2/2', { exact: true })` + `toBeVisible` | 页码角标只在 Task 1 换了容器样式类,文本节点未动 | **零改动通过** |
  | 记分卡 L181 | `getByText('SALES SCORECARD')`(strict)+ `toBeVisible` | 唯一匹配 = sr-only 节点(tile 容器拼接文本 `SALESSCORECARD` 无空格不含目标串,且 getByText 只取最小元素——实测 count=1 无 strict violation) | **零改动通过** |
  | 记分卡 L182/L183/L186 | `MONTH TO DATE` / `TOTAL GROSS COMM` / `YEAR TO DATE` | 副标题与汇总块 label 本计划不触碰 | **零改动通过** |

  ⇒ **`e2e/tv-flow.spec.ts` 零修改**。无需把任何断言改成 aria-label 定位(组件仍带
  `aria-label` 供将来需要时用 `getByLabel('SALES SCORECARD')` 定位,实测同样命中)。

- [ ] **Step 6: 全仓校验(+ 可选单条 E2E smoke)**

  ```bash
  npx tsc --noEmit
  npx vitest run
  npm run build
  ```

  预期:tsc 零输出;全量 **26 files / 334 tests** 全绿(331 + 3);build exit 0。

  可选(推荐,~2 分钟提前验证标题断言;需上面 build 已跑、端口 3344 空闲):

  ```bash
  npx playwright test -g "scorecard slides show month-to-date then year-to-date"
  ```

  预期:1 passed。

- [ ] **Step 7: Commit**

  ```bash
  git add src/components/tv/splitFlap.ts src/components/tv/SplitFlapTitle.tsx src/components/tv/slides/ScorecardSlide.tsx src/components/tv/TvApp.tsx tests/components/split-flap.test.ts
  git commit -m "feat: split-flap scorecard title with flap sequence tests"
  ```

---
### Task 3: 数值渐变 3D + 黄金荣耀标题 + 收尾回归(设计 §3/§4/§5)

**Files:**
- Modify: `src/app/globals.css`(`.value-3d` + `.gold-title` + `gold-shine` keyframes)
- Create: `src/components/tv/GradientValue.tsx`(渐变数值包装组件)
- Modify: `src/components/tv/slides/ScorecardSlide.tsx`(4 汇总块数值 + Gross Comm 列)
- Modify: `src/components/tv/slides/LeaderboardSlide.tsx`(数值列 + 金色标题,覆盖三个榜单页)
- Modify: `src/components/tv/slides/GoalSlide.tsx`(进度百分比 + 金色标题)
- Modify: `src/components/tv/slides/AnnouncementSlide.tsx`(金色标题)
- Modify: `src/components/tv/CelebrationOverlay.tsx`(庆祝弹屏金额)

**不改**(spec §3/§6):配对码、白色正文、Conversion 语义色块、排名序号、目标页
当前值/目标值、庆祝与生日弹屏标题及人名、副标题、README、管理后台。
门禁 = tsc + 全量 vitest(26/334)+ build + **全量 E2E 6 条**。

- [ ] **Step 1: globals.css 加 value-3d 与 gold-title**

  找到(Task 1 追加的末尾块,逐字):

  ```css
  .glass-refract .glass {
    backdrop-filter: url(#liquid-glass) blur(6px) saturate(1.5);
    -webkit-backdrop-filter: url(#liquid-glass) blur(6px) saturate(1.5);
  }
  ```

  替换为(原样保留 + 追加;两类是纯文字效果、无工具类覆盖需求,跟 .neon-text 同段落
  无层写法):

  ```css
  .glass-refract .glass {
    backdrop-filter: url(#liquid-glass) blur(6px) saturate(1.5);
    -webkit-backdrop-filter: url(#liquid-glass) blur(6px) saturate(1.5);
  }

  /* —— 数值渐变 3D 字效(视觉设计 §3)——
     前景:青→蓝→深紫水平渐变 clip 到字形;::before 用 attr(data-text) 画深色副本
     下移 1px、再叠 1px text-shadow(共两层挤出);drop-shadow 微青光(弱于原霓虹
     neon-text)。z-index:0 自建堆叠上下文,把 -1 的副本圈在组件内。真实 DOM 文本由
     GradientValue 组件保证(E2E 数值断言不受影响)。 */
  .value-3d {
    position: relative;
    display: inline-block;
    z-index: 0;
    background: linear-gradient(90deg, #2ee6c9 0%, #3b7bc8 55%, #4a2b8c 100%);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    -webkit-text-fill-color: transparent;
    filter: drop-shadow(0 0 6px rgba(46, 230, 201, 0.35));
  }
  .value-3d::before {
    content: attr(data-text);
    position: absolute;
    inset: 0;
    z-index: -1;
    transform: translateY(1px);
    color: #0e2233;
    -webkit-text-fill-color: #0e2233; /* text-fill 可继承,必须显式压掉父级 transparent */
    text-shadow: 0 1px 0 #081521;
  }

  /* —— 黄金荣耀标题(视觉设计 §4)——
     双层背景 clip 到字形:上层 115° 高光带(shine sweep,background-size 250% 横向,
     keyframes 前 35% 扫过、余 65% 停在画外 → 每 5s 一次),下层纵向金属金渐变;
     drop-shadow 轻浮雕 + 柔和金晕。真实 DOM 文本,SLIDE_TITLE_RE 断言不受影响。 */
  .gold-title {
    background-image:
      linear-gradient(115deg, rgba(255, 255, 255, 0) 42%, rgba(255, 255, 255, 0.85) 50%, rgba(255, 255, 255, 0) 58%),
      linear-gradient(180deg, #f9e7a0 0%, #f5c445 45%, #a8741a 100%);
    background-size: 250% 100%, 100% 100%;
    background-repeat: no-repeat;
    background-position: 100% 0, 0 0;
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    -webkit-text-fill-color: transparent;
    filter: drop-shadow(0 2px 2px rgba(62, 36, 2, 0.6)) drop-shadow(0 0 16px rgba(245, 196, 69, 0.3));
    animation: gold-shine 5s ease-in-out infinite;
  }

  /* 100%→0%:超宽背景图从左向右掠过字面(background-position 百分比在图宽 > 容器时
     反向映射),0%/100% 两端高光带都停在字面之外。 */
  @keyframes gold-shine {
    0% { background-position: 100% 0, 0 0; }
    35% { background-position: 0% 0, 0 0; }
    100% { background-position: 0% 0, 0 0; }
  }
  ```

- [ ] **Step 2: 创建 `src/components/tv/GradientValue.tsx`(整文件)**

  ```tsx
  // 渐变 3D 数值(视觉设计 §3):真实 DOM 文本(E2E getByText 不受影响)+ data-text
  // 供 .value-3d::before 画深色挤出副本。计划定稿组件方案而非裸类:数值都是格式化
  // 表达式,组件让 children 与 data-text 只写一遍、永不脱节。无 hooks,无需 'use client'。
  export default function GradientValue({ value }: { value: string }) {
    return (
      <span className="value-3d" data-text={value}>
        {value}
      </span>
    );
  }
  ```

- [ ] **Step 3: ScorecardSlide——汇总块数值 + Gross Comm 列**

  ① 找到(Task 2 落地后的 import 行):

  ```ts
  import SplitFlapTitle from '@/components/tv/SplitFlapTitle';
  ```

  替换为:

  ```ts
  import GradientValue from '@/components/tv/GradientValue';
  import SplitFlapTitle from '@/components/tv/SplitFlapTitle';
  ```

  ② 找到(Task 1 落地后的整个 TotalBlock;4 汇总块数值全部改渐变 → money 分支消失,
  连 prop 一起删,`tsconfig strict` 下不留死参):

  ```tsx
  function TotalBlock({ label, value, money }: { label: string; value: string; money?: boolean }) {
    return (
      <div className="glass flex flex-col justify-center rounded-2xl px-8">
        <p className="text-2xl text-muted">{label}</p>
        <p className={`mt-1 font-display text-5xl ${money ? 'text-money neon-text' : 'text-ink'}`}>
          {value}
        </p>
      </div>
    );
  }
  ```

  替换为:

  ```tsx
  function TotalBlock({ label, value }: { label: string; value: string }) {
    return (
      <div className="glass flex flex-col justify-center rounded-2xl px-8">
        <p className="text-2xl text-muted">{label}</p>
        <p className="mt-1 font-display text-5xl">
          <GradientValue value={value} />
        </p>
      </div>
    );
  }
  ```

  ③ 找到(money 调用点):

  ```tsx
              <TotalBlock label="TOTAL GROSS COMM" value={formatMoney(data.totals.gciCents)} money />
  ```

  替换为:

  ```tsx
              <TotalBlock label="TOTAL GROSS COMM" value={formatMoney(data.totals.gciCents)} />
  ```

  ④ 找到(Gross Comm 列;表行 h-[56px] 不动,inline-block span 行高继承不撑高):

  ```tsx
                      <td className="font-display text-money">{formatMoney(row.gciCents)}</td>
  ```

  替换为:

  ```tsx
                      <td className="font-display"><GradientValue value={formatMoney(row.gciCents)} /></td>
  ```

- [ ] **Step 4: LeaderboardSlide——数值列 + 金色标题(覆盖三个榜单页)**

  ① 找到:

  ```ts
  import { formatValue } from '@/lib/format';
  ```

  替换为:

  ```ts
  import { formatValue } from '@/lib/format';
  import GradientValue from '@/components/tv/GradientValue';
  ```

  ② 找到(标题;SALES CHAMPIONS / TOP EARNERS / LISTING LEGENDS 三页同一处):

  ```tsx
          <h1 className="font-display text-6xl text-neon neon-text">{title}</h1>
  ```

  替换为(h1 是 flex item 被块化,`.gold-title` 无 display 声明、行高 60px 不变):

  ```tsx
          <h1 className="gold-title font-display text-6xl">{title}</h1>
  ```

  ③ 找到(数值列;行 h-[72px] 不动):

  ```tsx
                <span className="font-display text-4xl text-money neon-text">
                  {formatValue(metric, entry.value)}
                </span>
  ```

  替换为:

  ```tsx
                <span className="font-display text-4xl">
                  <GradientValue value={formatValue(metric, entry.value)} />
                </span>
  ```

- [ ] **Step 5: GoalSlide——进度百分比 + 金色标题**

  ① 找到:

  ```ts
  import { formatValue } from '@/lib/format';
  ```

  替换为:

  ```ts
  import { formatValue } from '@/lib/format';
  import GradientValue from '@/components/tv/GradientValue';
  ```

  ② 找到(标题):

  ```tsx
        <h1 className="font-display text-6xl text-neon neon-text">TEAM GOALS</h1>
  ```

  替换为:

  ```tsx
        <h1 className="gold-title font-display text-6xl">TEAM GOALS</h1>
  ```

  ③ 找到(进度数字;当前值/目标值行保持白色不动——spec §3 只点名进度数字):

  ```tsx
                  <span className="w-40 text-right font-display text-5xl text-neon neon-text">
                    {goal.percent}%
                  </span>
  ```

  替换为:

  ```tsx
                  <span className="w-40 text-right font-display text-5xl">
                    <GradientValue value={`${goal.percent}%`} />
                  </span>
  ```

- [ ] **Step 6: AnnouncementSlide——金色标题**

  找到:

  ```tsx
        <h1 className="font-display text-6xl text-neon neon-text">TEAM NEWS</h1>
  ```

  替换为:

  ```tsx
        <h1 className="gold-title font-display text-6xl">TEAM NEWS</h1>
  ```

- [ ] **Step 7: CelebrationOverlay——庆祝弹屏金额(标题/人名/地址不动)**

  ① 找到:

  ```ts
  import { playAnthem } from '@/components/tv/audio';
  ```

  替换为:

  ```ts
  import { playAnthem } from '@/components/tv/audio';
  import GradientValue from '@/components/tv/GradientValue';
  ```

  ② 找到(金额行):

  ```tsx
            <p className="mt-6 font-display text-8xl text-money neon-text">{formatMoney(payload.salePriceCents)}</p>
  ```

  替换为:

  ```tsx
            <p className="mt-6 font-display text-8xl"><GradientValue value={formatMoney(payload.salePriceCents)} /></p>
  ```

- [ ] **Step 8: 收尾回归——全仓校验 + 全量 E2E(一次性)**

  E2E 影响预判(本任务改动的文本断言核对):`SOLD!`/`HAPPY BIRTHDAY`/`E2E House 1`
  (标题、地址不动);金额与数值均保持真实 DOM 文本(GradientValue children);金色
  五页标题 DOM 文本不变(background-clip 只改着色,Playwright 可见性不看颜色/透明
  文字)。加上 Task 2 的结论表 ⇒ **6 条断言零改动**。

  ```bash
  npx tsc --noEmit
  npx vitest run
  npm run build
  npm run test:e2e
  ```

  预期:tsc 零输出;全量 **26 files / 334 tests** 全绿;build exit 0;Playwright
  **6 passed**(约 8–10 分钟;offline 用例自身 3–4 分钟,勿提前中断)。

  E2E 已知现象与环境注意(照旧,历史实证):
  - playwright 自起 e2e server(`reuseExistingServer: false`),**勿手动占用 3344 端口**;
    起跑前若上轮残留 node 进程占着 3344(Windows Bash timeout 不级联杀 node 子进程树),
    用 `netstat -ano | findstr :3344` 找 PID 后 `taskkill /PID <pid> /T /F` 清掉再跑。
  - 本机多 agent 并发时 Chromium 会 OOM 闪败(**用例 41ms 失败、报 Target crashed /
    browser has disconnected 即是**):先 `npx playwright test -g "<用例名>"` 单条隔离
    重跑排除环境问题,再判定是否真回归;尽量避开与其他重负载任务并发。
  - 真回归时按 superpowers:systematic-debugging 定位;确需代码修复则修复 + 全量
    vitest/E2E 重验后独立 commit(例:`fix: e2e regression after tv visual style`)。
  - 审查阶段的 e2e harness 截图目验(玻璃折射/翻牌停定/渐变数值/金色标题各一张,
    spec §5)由审查者执行,不在本任务门禁内。

- [ ] **Step 9: Commit**

  ```bash
  git add src/app/globals.css src/components/tv/GradientValue.tsx src/components/tv/slides/ScorecardSlide.tsx src/components/tv/slides/LeaderboardSlide.tsx src/components/tv/slides/GoalSlide.tsx src/components/tv/slides/AnnouncementSlide.tsx src/components/tv/CelebrationOverlay.tsx
  git commit -m "feat: gradient 3d values and gold glory titles"
  ```

---
## Self-Review(计划完成后自查,已执行)

1. **Spec 覆盖**:§1.1 玻璃基底(层叠渐变/1px 描边 border-box/双 inset 厚度/外投影/blur(6px) saturate(1.5))→ Task 1 Step 1,圆角以元素级工具类落实(rounded-2xl 卡类、rounded-xl 行类,偏差原因已在执行约定写明);§1.2 折射(feTurbulence 0.008 0.012 / octaves 2 / seed 7 固定、feDisplacementMap scale 13 ∈ 12–14、CSS.supports 检测挂 glass-refract、SSR 安全一次性 effect)→ Task 1 Step 2;§1.3 八处应用(汇总块/表格容器/榜单行/目标卡/公告卡/配对码格/页码角标/OFFLINE 徽标,管理后台不改)→ Task 1 Step 2-⑤ + Step 3-①…⑧,全部只动背景/边框/圆角/阴影/滤镜类;§2 翻牌板(每字母一牌/近黑渐变牌面/圆角/中央拆分线/白粗字母/空格间隙/60px 定高/RESERVED_PX 388 不变/错峰 80ms 翻 3–6 次每次 90ms rotateX/6–10s 抖 1–2 牌两轮回原/interval-timeout 卸载清理/sr-only + aria-label/副标题不动/不做图标)→ Task 2;§3 数值(#2EE6C9→#3B7BC8→#4A2B8C 定稿/clip text/attr(data-text) 副本两层挤出 1+1px/drop-shadow 弱于霓虹/真实 DOM 文本/应用 5 类锚点/不改配对码、正文、Conversion、序号)→ Task 3 Step 1–5、7;§4 金色(#F9E7A0→#F5C445→#A8741A 定稿/浮雕/金晕/shine sweep 250% 每 5s/五页标题真实文案/弹屏标题不改)→ Task 3 Step 1、4–6;§5 测试(可选纯函数单测 → flapSequence 3 个;门禁 tsc/vitest/build/E2E 全量;截图目验归审查阶段)→ 各任务 gate + Task 3 Step 8;§6 非目标全部未引入;§7 成功标准由 Task 3 Step 8 收口。
2. **实测支撑**:vitest 基线 25/331(2026-08-19 实测 114s);Playwright sr-only 语义用本仓 Chromium 实测(getByText 命中 sr-only、count=1、toBeVisible 通过),E2E 逐条核对表落在 Task 2 Step 5 / Task 3 Step 8,结论零改动。
3. **占位符扫描**:无 TBD/TODO/"自行调整"/"类似地";所有色值、seed、scale、时长、尺寸写死;三个新文件(splitFlap.ts / SplitFlapTitle.tsx / GradientValue.tsx)与两段 CSS 均为完整可粘贴内容;所有 Modify 锚点逐字取自当前工作区(Task 2-①、Task 3 的 ScorecardSlide/globals.css 锚点为 Task 1/2 落地后的既定文本,已在各步注明)。
4. **命名/类型一致性**:`SplitFlapTitle({ text })` 与 ScorecardSlide `<SplitFlapTitle text={heading} />` 一致;`flapSequence(targetChar, rng)`/`randomFlapChar(rng)`/`FLAP_CHARS` 在 splitFlap.ts、组件、测试三处一致;`GradientValue({ value })` 七个使用点一致;CSS 类名 glass/glass-refract/value-3d/gold-title 与 className 引用一致;`rowBorderClass` 返回值改 border-l-* 后仍与既有 `border-l-4` 组合;TotalBlock 删 money 后定义与全部调用点(4 处中仅 1 处带 money)同步。
5. **定高逐处核对**:榜单行 72、表行 56(未触碰)、表头 48、汇总块 120、公告卡 224、标题行 60、RESERVED/ITEM 常量全部原值;唯一 2px 余量吃进 overflow 的表格容器有量化分析(1080p 余 20px、E2E 520px 余 16px);border-box 由 Tailwind preflight 保证。
6. **E2E/单测账目**:Task 1 无新增(25/331)、Task 2 +3(26/334)、Task 3 无新增(26/334);E2E 全程零改动、只在 Task 3 全量跑一次,已知现象(3344 残留端口 taskkill、多 agent 并发 Chromium OOM 41ms Target crashed 先单条隔离)照旧写明。
