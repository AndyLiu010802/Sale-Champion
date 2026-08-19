# 霍巴特剪影场景 + 目标页圆环 + UI 提亮 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to
> execute this plan —— 本计划为**并行编排**设计:H1 串行先行,7 个画师任务与 (G1→U1) lane
> 并行,H3 串行收尾。每个任务的完整工作指令(整文件代码/几何数字/自验)在 scratchpad
> 任务文件里(见"执行约定");本文件是权威记录与调度依据。Steps use checkbox (`- [ ]`)
> syntax for tracking.
>
> **2026-08-19 修订**(specs 提交 `4ce3259`):①hobart spec §3 改为**单色剪影画风**——
> 每层单色扁平剪影靠轮廓传特征,禁多色阶/细节/描线,窗灯为发光点阵;ScenePaint 契约与
> 画师任务已相应简化重写。②goal-rings spec 新 §4 **全局 UI 提亮** → 新增 Task U1。

**Goal:** 把 TV 背景从抽象楼群剪影升级为**霍巴特全景剪影**(单色分层剪影,靠轮廓形状
传达特征):威灵顿山双脊线+山顶发射塔桅杆、塔斯曼桥墩列缓拱(主航道门形墩)、CBD 高低
塔群天际线(圆顶/钟楼尖顶/砂岩山墙锯齿)、码头连排山墙齿线+桅杆线、港湾水面(扁平色带/
剪影倒影/波纹/波光/2–3 船剪影轻摇)、前景屋顶烟囱齿廓+树冠;**完整保留**时间引擎(真实
日出日落驱动)与天气引擎(雨/雪/雷/风/雾/云,Open-Meteo);程序化优势兑现:夜晚窗灯
发光点阵逐扇点亮、桥灯串、船位灯、水面灯影。同分支交付**目标页圆环仪表盘**(GoalSlide
重设计)与**全局 UI 提亮**(.glass/muted,不同文件零冲突)。

**Architecture:** ①**契约层** `src/lib/scene/hobart/geometry.ts` —— 归一化几何(BAND 分层
区间、跨画师对齐锚点 BRIDGE/CITY_TOWERS/WAREHOUSES/TERRACE_ROW/BOATS、山脊折线——剪影
可辨识性全部来自这些轮廓锚点)、`ScenePaint` 剪影色组类型、`LayerFn`/`WaterDynamicFn`/
`CloudFn` 绘制契约、mulberry32 唯一权威副本;②**调色层** `src/lib/scene/hobart/paint.ts`
—— `scenePaint(t, fx, flickerEpoch)`:六关键帧(与 palette.KEYS 同停靠点)插值出进深五档
剪影色(远浅近深,亮度递减逐帧验算、测试钉死)+ 阴/雨去饱和并入(灯光组豁免),
日/月/星/windowLit/dim 沿用 `getPalette`(palette.ts/weather.ts **零改动**);③**画师层**
7 个文件各导出纯函数(sky/mountain/bridge/city/waterfront/water/foreground),互不 import,
只依赖 geometry+ScenePaint → 7 路并行;④**装配器** `SkylineBackground.tsx` —— 静态层
[mountain→bridge→city→waterStatic→waterfront→foreground] 一次画入离屏缓存(失效键沿用
`尺寸×t步进0.015×云量档×4s纪元`),每帧:天空渐变→星→日/月(贴缓存前画,沉入山后)→平涂
流云→贴缓存→水面动态(波光/船摇)→天气粒子/闪电→vignette→压暗幕;对外 API
`{ weather, paused }` 不变,TvApp 零改动。⑤**目标页** `ProgressRing.tsx` + `GoalSlide.tsx`
重写(纯视觉重排)。⑥**UI 提亮** globals.css `.glass` + tailwind `muted`(背景场景不动)。

**Tech Stack:** 与主项目一致(Next.js 15 / React 19 / Canvas 2D / SVG / Tailwind 3.4 /
Vitest / Playwright),零新依赖、零迁移、零 schema/设置改动。

**执行约定:**
- 基线:分支 `feature/hobart-scene`(**已检出**,HEAD = specs 修订提交 `4ce3259`,落在
  main `1917a11` 之上)。开工前确认:
  ```bash
  git rev-parse --abbrev-ref HEAD   # feature/hobart-scene
  git status                        # 干净(本计划文档已提交)
  ```
- **基线测试数(2026-08-19 实测)**:`npx vitest run` → **26 files / 335 tests 全绿**
  (106.2s)。H1 落地后应为 **27 files / 348**。E2E 6 条用例本轮未重跑(H3 收尾全量跑;
  已逐条核对 `e2e/tv-flow.spec.ts` 全部是文字/角色断言,canvas 仍 z-0 pointer-events-none,
  预期零改动)。
- 规格(权威):`docs/superpowers/specs/2026-08-19-hobart-scene-design.md`(§3 剪影修订版)
  与 `2026-08-19-goal-rings-design.md`(含新 §4 UI 提亮)。
- **任务文件**(每个任务的完整工作指令,含整文件代码与轮廓构造数字):
  `C:\Users\andyl\AppData\Local\Temp\claude\c--Users-andyl-Desktop------TV-SaaS\147a3ba4-1ed4-49c2-ac3c-aa652be00350\scratchpad\hb-tasks\`
  —— `header.md`(所有 worker 必读公共头部)+ `task-H1.md`、7× `task-P-*.md`、
  `task-G1.md`、`task-U1.md`、`task-H3.md`。scratchpad 是会话级目录;若跨会话执行本计划,
  先确认该目录仍在,不在则按本文件的任务摘要与 specs 重新生成(H1/G1/U1 的整文件代码与
  数值以任务文件为准)。
- **任务 DAG**:`H1 → { P-sky ∥ P-mountain ∥ P-bridge ∥ P-city ∥ P-waterfront ∥ P-water ∥ P-foreground ∥ (G1 → U1) } → H3`。
  画师之间、画师与 G1/U1 之间**互不碰文件**(所有权矩阵见 header.md),可安全并行;
  G1 与 U1 同 lane 串行(可同一执行者)。
- **Git 编排**(避免并行写 index):H1 收尾自提交;**画师任务零 git 操作**;并行阶段 git
  只发生在 G1→U1 lane(各自收尾提交自己文件);H3 入场把 7 个画师文件一笔提交
  (`feat: hobart layer painters`),修图轮次逐笔 `fix:` 提交。
- 门禁:每个任务 `npx tsc --noEmit`(并行阶段以"输出不含自己文件"为准,repo 级由 H3 兜底)
  + `npx vitest run tests/scene/hobart.test.ts`(13 用例);H1/H3 另加全量 vitest 与
  `npm run build`;U1 加 build(Tailwind 重新生成);H3 最后跑 `npm run test:e2e`(6 passed)。
- 所有命令在项目根 `C:\Users\andyl\Desktop\工作文档\TV SaaS` 执行(`npx`/`npm` 跨平台形式)。

**契约摘要(权威定义在 task-H1.md 的整文件代码里,此处为速查):**

- 分层区间 `BAND`(y 屏高比例,spec §2 表格逐字):sky 0–0.40 / mountain 0.08–0.42 /
  bridge 0.34–0.42(x 0.02–0.38)/ city 0.38–0.58 / waterfront 0.54–0.70 / water 0.60–0.80 /
  foreground 0.74–1.0;`SKY_HORIZON_Y=0.40`、`WATERLINE=0.60`、`WHARF_EDGE_Y=0.635`。
- `ScenePaint` 剪影色组(§3 修订后的收敛版):
  - `sky`: top, horizon, cloud, cloudShade, sun, glow, star
  - `far`: ridgeFar, ridgeNear, mist, mistAlpha
  - `mid`: silhouette(CBD 天际线,含底带/树冠/砂岩齿线), bridge(略浅,居 city 后)
  - `near`: silhouette(前景,全场最深), wharf(码头带,含岸壁/栈桥/桅杆线)
  - `water`: base(扁平色带,不渐变), ripple(+Alpha), reflection(+Alpha),
    glitter(+Alpha), hull(船体+帆同色剪影)
  - `light`(不变): window, windowLit, bridgeLamp(+Alpha), boatLamp(+Alpha),
    waterGlow(+Alpha), flickerEpoch
  - 顶层:`dim`
- **进深五档亮度契约**(测试钉死,六帧逐帧验算、线性插值保序):
  `far.ridgeFar > far.ridgeNear > mid.bridge > mid.silhouette > near.wharf > near.silhouette`。
- 绘制契约:`LayerFn = (ctx, w, h, sp, rng) => void`;水层拆 `drawWaterStatic`(入缓存)+
  `drawWaterDynamic(ctx, w, h, sp, timeSec, bodyX, bodyVisible)`(每帧);sky 层拆
  `drawSkyBase`(每帧渐变打底)+ `drawCloudFlat(ctx, w, h, sp, cx, cy, scale, alpha, rng)`。
- 跨画师对齐锚点(geometry 定死):`CITY_TOWERS` 8 座(kind 只分轮廓:block/dome/clock;
  city 起轮廓 = water 拉倒影)、`BRIDGE`(墩位/拱顶/灯距)、`WAREHOUSES` 4 座 +
  `TERRACE_ROW` 齿段、`BOATS` 3 艘 + `BOAT_BOB_AMPL`、`MOUNTAIN` 双脊折线 + 塔位。
- 层种子 `LAYER_SEEDS`:sky 877 / mountain 811 / bridge 822 / city 833 / waterfront 844 /
  water 855 / foreground 866;装配器每次调用画师前以固定种子新建 rng。

**契约级决定(spec 之外/之上,执行时以此为准):**
1. spec §4 的"每帧:贴缓存底图→日/月/星→云"会让低角度日月盖在山前 —— 实际管线改为
  **天空渐变+星+日月+云先画,再贴静态缓存**(日月沉入山后);天空渐变因此不入缓存
  (单次 fillRect 成本可忽略)。
2. spec §4 把分层色组写在"palette.ts 扩展"名下 —— 实际落在 `hobart/paint.ts`
  (palette.ts 零 diff,"现导出 API 保持兼容"以更强形式满足;phaseFromClock/fyLabel 等不动)。
3. 静态缓存内 `drawWaterStatic` 画在 waterfront **之前**(spec 表格顺序是纵深描述而非
  绘制序):码头岸壁/栈桥/船桅剪影必须压住水面上沿,倒影仍在岸线以下不受影响。
4. 窗灯低频闪烁需要纪元熵:`scenePaint` 第三参 `flickerEpoch`(默认 0),装配器注入
  4s 纪元,city 画师沿用旧闪烁公式;缓存失效键机制原样保留。
5. 阴天去饱和在 scenePaint 内统一完成(画师拿到即压灰);**灯光组与波光色豁免**(雨夜
  灯更显暖),波光强度按云量衰减。
6. 目标页百分比:API `percent` 封顶 100 不动,GoalSlide 用 `currentValue/targetValue`
  客户端派生显示值(goal-rings spec §2"如实显示 128%"与 §3"计算逻辑不动"同时满足)。
7. **(剪影修订)日间基准色的锚定**:修订版 §3 删去了逐色 hex 清单,但 MIDDAY 帧的
  天空/山体/水面仍沿用原参考基准(#3E7BD0/#BBD9EF、#8B7A8D/#6B5D75、#5C8CC4)作为
  钉死常量(测试逐字断言),其余剪影档色为本计划定稿。
8. **(剪影修订)"山脚亮色碎点房"的取舍**:与单色剪影冲突,改为**夜间发光点阵**
  (suburbBand 内 30 个候选点按 windowLit×0.4 点亮),日间不画 —— 与"窗灯是剪影上的
  发光点阵"同一机制。
9. **(U1)实测参数校正**:.glass 描边现值是 0.14(spec"0.16"为约数),提亮目标 0.26;
  `muted` 定义在 tailwind.config.ts(#8fa3c8 → #a6b8da),故 U1 改两个文件。

---
### Task H1: 契约与脚手架(串行先行)——`hb-tasks/task-H1.md`

**Files:**
- Create: `src/lib/scene/hobart/geometry.ts`(BAND/锚点/ScenePaint/LayerFn/mulberry32/rgba)
- Create: `src/lib/scene/hobart/paint.ts`(scenePaint 六关键帧剪影插值,数值全部定稿写死)
- Create: `src/lib/scene/hobart/{sky,mountain,bridge,city,waterfront,water,foreground}.ts`(可编译占位画师)
- Modify: `src/components/tv/SkylineBackground.tsx`(424 行整文件替换为装配器;星/云/雨/雪/闪电/风原样迁移,闪电描边改走山脊折线)
- Test: `tests/scene/hobart.test.ts`(13 用例:钉死日间基准色、**进深五档亮度递减**、夜间 light 组非零、灯色不压灰、阴天去饱和、波光抑制、插值中点、clamp、flickerEpoch;geometry 区间/锚点自洽;mulberry32 确定性)

- [ ] Step 1: 按任务文件写测试(整文件)→ 确认加载失败
- [ ] Step 2: 按任务文件落地 geometry/paint/7 占位/装配器(整文件,零占位符)
- [ ] Step 3: 门禁 —— 定向 vitest 13 绿;`npx tsc --noEmit` 零输出;全量 `npx vitest run`
      **27 files / 348** 全绿;`npm run build` 成功;占位场景冒烟截图(剪影色带亮度
      自上而下递减可见即可)
- [ ] Step 4: `git add src/lib/scene/hobart tests/scene/hobart.test.ts src/components/tv/SkylineBackground.tsx && git commit -m "feat: hobart silhouette scene contract, layered paint and assembler scaffold"`

---
### Task P-sky / P-mountain / P-bridge / P-city / P-waterfront / P-water / P-foreground(7 路并行)——`hb-tasks/task-P-*.md`

每个画师:只改自己那**一个**文件,整文件重写占位实现为**单色剪影**;几何锚点/轮廓走向/
齿状细节的 rng 规则/夜灯点阵在各自任务文件里(硬约束),轮廓风格细节有创作自由。要点:

- [ ] **P-sky**:drawCloudFlat 重写为 3–5 瓣平涂积云簇 + 底部暗带(唯一非剪影层,与修订前一致)
- [ ] **P-mountain**:双脊折线剪影(段中点 ±0.004 rng 起伏)+ 发射塔桅杆并入轮廓 + 雾霭带 + 夜间山脚灯点阵
- [ ] **P-bridge**:单色剪影 —— 缓拱桥面(crest 0.17)+ 镂空护栏带 + 7 组墩(主航道双柱门架)+ 夜灯串(lampStep 0.022)
- [ ] **P-city**:单色剪影 —— 0.42–0.58 全宽底带 + 上缘齿线 + 左岸低带 + CITY_TOWERS 8 座轮廓(block 女儿墙缺口/天线、dome 半圆、clock 尖顶)+ 砂岩山墙锯齿 + 树冠圆弧 + **夜间窗灯点阵**(windowLit/flickerEpoch 公式,不画未点亮态)
- [ ] **P-waterfront**:单色剪影 —— 岸壁带 + WAREHOUSES 4 座山墙齿 + TERRACE_ROW 连排锯齿 + 2 栈桥 + 10–12 桅杆线 + 夜灯点
- [ ] **P-water**:静态(扁平色带**不渐变**/塔楼剪影倒影垂拉+亮缝/静态波纹/夜灯影竖拉)+ 动态(波纹漂移/日月波光竖列/BOATS 单色船剪影+帆同色+夜航灯)
- [ ] **P-foreground**:全场最深单色剪影 —— 屋顶山墙/烟囱/老虎窗连续齿廓闭合到底边 + 两侧树冠圆弧 + 夜间 2–4 窗点

门禁(每个画师):tsc 无本文件错误 + `npx vitest run tests/scene/hobart.test.ts` 13 绿;
**零 git 操作**;整体视觉留待 H3。

---
### Task G1: 目标页圆环仪表盘(与画师并行,lane 首位)——`hb-tasks/task-G1.md`

**Files:**
- Create: `src/components/tv/ProgressRing.tsx`(SVG 轨道圆+渐变描边,12 点起针,mount 时 dashoffset 1.2s ease-out 入场,≥100% 金渐变+金晕,环封顶不绕圈)
- Rewrite: `src/components/tv/slides/GoalSlide.tsx`(1=420 英雄环 / 2=340 并排 / 3–4=260 2×2;`GCI · THIS MONTH` 头 + 环心真实 DOM 百分比 + `$204K / $250K` 行 formatValue 复用;displayPct 客户端派生)

- [ ] Step 1–2: 按任务文件整文件落地两组件
- [ ] Step 3: tsc(无本任务文件错误)+ 全量 vitest 不回退(无新增单测,spec §3)+ build
      (被并行画师 WIP 阻塞时注明跳过,H3 兜底)
- [ ] Step 4: `git add src/components/tv/ProgressRing.tsx src/components/tv/slides/GoalSlide.tsx && git commit -m "feat: goal ring dashboard on tv goals slide"`
- E2E 零改动依据:标题文本不变,现有用例对目标页无内部断言(已核对 tv-flow.spec.ts)。

---
### Task U1: 全局 UI 提亮(G1 之后串行,同 lane)——`hb-tasks/task-U1.md`

**Files:**
- Modify: `src/app/globals.css`(仅 `.glass` 基底块:高光 0.06→0.10、描边 0.14→0.26、
  玻璃底色减暗且微提色、内上高光 0.12→0.18;注释同步;±0.04 内可按截图微调,方向不得变)
- Modify: `tailwind.config.ts`(`muted: '#8fa3c8'` → `'#a6b8da'`)

- [ ] Step 0: 改前基线截图(e2e harness,数据 slide + TEAM GOALS 各一张)
- [ ] Step 1–2: 按任务文件改两处
- [ ] Step 3: 改后同场景对比截图,目验"明显更亮但不刺眼、可读性提升"(spec §4 验收)
- [ ] Step 4: tsc + 全量 vitest + `npm run build`;
      `git add src/app/globals.css tailwind.config.ts && git commit -m "feat: brighten glass panels and secondary text"`

---
### Task H3: 集成联调 + 视觉评审门禁(串行收尾)——`hb-tasks/task-H3.md`

- [ ] Step 0: 画师文件一笔入库 `git commit -m "feat: hobart layer painters"`(先 tsc+vitest)
- [ ] Step 1: 截图矩阵 —— e2e harness(`npx tsx e2e/start-server.ts`)+ Playwright 脚本
      (addInitScript 平移 Date + route mock `/api/tv/weather`):正午/黄金/夜晚 ×
      晴/雨(63)/雷(95)= 9 张(≥ spec 最低 6);另拍轮播可读性 2 张 + 目标页 1/4 目标
      各 1 张
- [ ] Step 2: **剪影版评审清单**逐张目验:剪影轮廓五要素可辨识(山脊线+塔桅/桥墩拱/
      塔群天际线/山墙齿线+桅杆线/屋顶齿廓)/ 进深五档层次分明 / **无细节刻画残留** /
      夜晚窗灯+桥灯+船灯+水面灯影 / 天气特效 / 文字可读性(含 U1 提亮后玻璃观感)/
      四处层接缝
- [ ] Step 3: 修图迭代 ≤3 轮(轮廓问题改画师文件,色感/进深问题改 paint.ts 关键帧;
      锚点动则先跑契约测试),逐轮 `fix:` 提交
- [ ] Step 4: 性能自查 —— 180 帧 rAF 间隔采样(p95 ≤ 50ms;4s 对齐尖峰=缓存重绘,正常),
      临时 console.count 确认缓存 ≤1 次/4s 后移除
- [ ] Step 5: 全量门禁 `npx tsc --noEmit` + `npx vitest run`(27/348)+ `npm run build` +
      `npm run test:e2e`(6 passed)

---
## Spec 自查矩阵

| Spec 节 | 覆盖处 |
|---|---|
| hobart §1 需求(保留双引擎/程序化优势) | H1 装配器沿用 phaseFromClock/effectsFromWeather;P-city 窗灯点阵、P-water 波光/船摇、P-bridge 灯串 |
| hobart §2 构图表格 + 固定种子 | geometry.BAND/锚点(测试钉死)+ LAYER_SEEDS/mulberry32;各 P-* 轮廓构造指令 |
| hobart §3(修订)剪影层次/进深色/时段分层/天气去饱和 | header.md 剪影规则;paint.ts 进深五档(亮度递减测试钉死)+ 六帧插值 + 去饱和并入;画师任务"禁止"清单 |
| hobart §4 离屏缓存/代码结构/性能常量 | H1 装配器(失效键沿用、DPR/隔帧/粒子/paused 原值);契约级决定 1–4 |
| hobart §5 验证(单测+截图矩阵硬门禁+全量) | tests/scene/hobart.test.ts;H3 Step 1–5(剪影版清单) |
| hobart §6 非目标 | 无图片资源/视差/行人车辆/季节/按 org 换城市;仅程序化再创作 |
| hobart §7 成功标准 | H3 评审清单即验收清单 |
| goal-rings §1 布局 | G1 ringSize + 1/2/2×2 分支 |
| goal-rings §2 单卡/动画/金色态/封顶 | ProgressRing + displayPct(契约级决定 6) |
| goal-rings §3 实现约束(props/一次性动画/E2E 零改动/无新增单测) | G1 组件 props { pct, size, reached };mount 一次性 transition;E2E 依据已核对 |
| goal-rings §4(新)全局 UI 提亮 | Task U1(.glass + muted,前后对比截图验收;契约级决定 9) |
| goal-rings §5 非目标 | 无 CRUD/分页/刻度/声效;1/4 目标截图并入 H3 |
