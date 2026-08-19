# 霍巴特程序化插画背景 + 目标页圆环 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to
> execute this plan —— 本计划为**并行编排**设计:H1 串行先行,7 个画师任务与 G1 并行,
> H3 串行收尾。每个任务的完整工作指令(整文件代码/几何数字/自验)在 scratchpad 任务文件里
> (见"执行约定");本文件是权威记录与调度依据。Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 TV 背景从抽象楼群剪影升级为参考插画风格的**霍巴特全景**(平涂海报风,程序化
逐层绘制):威灵顿山双脊+发射塔、塔斯曼桥、CBD(红棕高层/白塔群/圆顶/砂岩山墙)、码头
红绿顶仓库+桅杆、港湾水面(倒影/波纹/波光/2–3 船轻摇)、前景屋顶树冠;**完整保留**时间引擎
(真实日出日落驱动)与天气引擎(雨/雪/雷/风/雾/云,Open-Meteo);程序化优势兑现:夜晚窗灯
逐扇点亮、桥灯串、船位灯、水面灯影。同分支顺带交付**目标页圆环仪表盘**(GoalSlide 重设计,
不同文件零冲突)。

**Architecture:** ①**契约层** `src/lib/scene/hobart/geometry.ts` —— 归一化几何(BAND 分层
区间、跨画师对齐锚点 BRIDGE/CITY_TOWERS/WAREHOUSES/BOATS、山脊折线)、`ScenePaint` 六分层
色组类型、`LayerFn`/`WaterDynamicFn`/`CloudFn` 绘制契约、mulberry32 唯一权威副本;
②**调色层** `src/lib/scene/hobart/paint.ts` —— `scenePaint(t, fx, flickerEpoch)`:六关键帧
(与 palette.KEYS 同停靠点)分层插值 + 阴/雨去饱和并入(灯光组豁免),日/月/星/windowLit/dim
沿用 `getPalette`(palette.ts/weather.ts **零改动**,公共 API 天然兼容);③**画师层**
7 个文件各导出纯函数(sky/mountain/bridge/city/waterfront/water/foreground),互不 import,
只依赖 geometry+ScenePaint → 可 7 路并行创作;④**装配器** `SkylineBackground.tsx` —— 静态层
[mountain→bridge→city→waterStatic→waterfront→foreground] 一次画入离屏缓存(失效键沿用
`尺寸×t步进0.015×云量档×4s纪元`),每帧:天空渐变→星→日/月(贴缓存前画,沉入山后)→平涂
流云→贴缓存→水面动态(波光/船摇)→天气粒子/闪电→vignette→压暗幕;对外 API
`{ weather, paused }` 不变,TvApp 零改动。⑤**目标页** `ProgressRing.tsx`(SVG 环 +
dasharray 入场动画 + ≥100% 金色态)+ `GoalSlide.tsx` 重写(1/2/2×2 自适应),纯视觉重排。

**Tech Stack:** 与主项目一致(Next.js 15 / React 19 / Canvas 2D / SVG / Tailwind 3.4 /
Vitest / Playwright),零新依赖、零迁移、零 schema/设置改动。

**执行约定:**
- 基线:分支 `feature/hobart-scene`(**已检出**,HEAD `851a89d` = 两份 specs 提交,落在
  main `1917a11` 之上)。开工前确认:
  ```bash
  git rev-parse --abbrev-ref HEAD   # feature/hobart-scene
  git status                        # 干净(本计划文档已提交)
  ```
- **基线测试数(2026-08-19 实测)**:`npx vitest run` → **26 files / 335 tests 全绿**
  (106.2s)。H1 落地后应为 **27 files / 347**。E2E 6 条用例本轮未重跑(H3 收尾全量跑;
  已逐条核对 `e2e/tv-flow.spec.ts` 全部是文字/角色断言,canvas 仍 z-0 pointer-events-none,
  预期零改动)。
- 规格(权威):`docs/superpowers/specs/2026-08-19-hobart-scene-design.md` 与
  `2026-08-19-goal-rings-design.md`。
- **任务文件**(每个任务的完整工作指令,含整文件代码与几何数字):
  `C:\Users\andyl\AppData\Local\Temp\claude\c--Users-andyl-Desktop------TV-SaaS\147a3ba4-1ed4-49c2-ac3c-aa652be00350\scratchpad\hb-tasks\`
  —— `header.md`(所有 worker 必读公共头部)+ `task-H1.md`、7× `task-P-*.md`、
  `task-H3.md`、`task-G1.md`。scratchpad 是会话级目录;若跨会话执行本计划,先确认该目录
  仍在,不在则按本文件的任务摘要与 specs 重新生成(H1/G1 的整文件代码以任务文件为准)。
- **任务 DAG**:`H1 → { P-sky ∥ P-mountain ∥ P-bridge ∥ P-city ∥ P-waterfront ∥ P-water ∥ P-foreground ∥ G1 } → H3`。
  画师之间、画师与 G1 之间**互不碰文件**(所有权矩阵见 header.md),可安全并行。
- **Git 编排**(避免并行写 index):H1 收尾自提交;**画师任务零 git 操作**;G1 收尾提交
  自己两个文件(并行阶段唯一 git 使用者);H3 入场把 7 个画师文件一笔提交
  (`feat: hobart layer painters`),修图轮次逐笔 `fix:` 提交。
- 门禁:每个任务 `npx tsc --noEmit`(并行阶段以"输出不含自己文件"为准,repo 级由 H3 兜底)
  + `npx vitest run tests/scene/hobart.test.ts`;H1/H3 另加全量 vitest 与 `npm run build`;
  H3 最后跑 `npm run test:e2e`(6 passed)。
- 所有命令在项目根 `C:\Users\andyl\Desktop\工作文档\TV SaaS` 执行(`npx`/`npm` 跨平台形式)。

**契约摘要(权威定义在 task-H1.md 的整文件代码里,此处为速查):**

- 分层区间 `BAND`(y 屏高比例,spec §2 表格逐字):sky 0–0.40 / mountain 0.08–0.42 /
  bridge 0.34–0.42(x 0.02–0.38)/ city 0.38–0.58 / waterfront 0.54–0.70 / water 0.60–0.80 /
  foreground 0.74–1.0;`SKY_HORIZON_Y=0.40`、`WATERLINE=0.60`、`WHARF_EDGE_Y=0.635`。
- `ScenePaint` 六分层色组(具名色槽):
  - `sky`: top, horizon, cloud, cloudShade, sun, glow, star
  - `far`: ridgeFar, ridgeNear, slope, suburb, tower, mist, mistAlpha
  - `mid`: bridge, bridgeShade, brick, brickShade, towerLight, towerShade, sandstone,
    sandstoneShade, roof, dome, tree, outline
  - `near`: roofRed, roofGreen, roofGreyBlue, wall, wallShade, wharf, mast, fgRoof, fgWall,
    chimney, fgTree, outline
  - `water`: base, deep, ripple, rippleAlpha, reflection, reflectionAlpha, glitter,
    glitterAlpha, hull, sail
  - `light`: window, windowLit, bridgeLamp, bridgeLampAlpha, boatLamp, boatLampAlpha,
    waterGlow, waterGlowAlpha, flickerEpoch
  - 顶层:`dim`
- 绘制契约:`LayerFn = (ctx, w, h, sp: ScenePaint, rng: () => number) => void`;水层拆
  `drawWaterStatic: LayerFn`(入缓存)+ `drawWaterDynamic(ctx, w, h, sp, timeSec, bodyX,
  bodyVisible)`(每帧);sky 层拆 `drawSkyBase: LayerFn`(每帧渐变打底)+
  `drawCloudFlat(ctx, w, h, sp, cx, cy, scale, alpha, rng)`(一朵平涂云,位置由装配器推进)。
- 跨画师对齐锚点(geometry 定死):`CITY_TOWERS` 8 座(city 摆楼 = water 拉倒影)、
  `BRIDGE`(墩位/拱顶/灯距)、`WAREHOUSES` 4 座 + `TERRACE_ROW`、`BOATS` 3 艘 +
  `BOAT_BOB_AMPL`、`MOUNTAIN` 双脊折线 + 塔位。
- 层种子 `LAYER_SEEDS`:sky 877 / mountain 811 / bridge 822 / city 833 / waterfront 844 /
  water 855 / foreground 866;装配器每次调用画师前以固定种子新建 rng。

**契约级决定(spec 之外/之上,执行时以此为准):**
1. spec §4 的"每帧:贴缓存底图→日/月/星→云"会让低角度日月盖在山前 —— 实际管线改为
  **天空渐变+星+日月+云先画,再贴静态缓存**(日月沉入山后,与 spec §2"日/月沿用现引擎"
  的构图意图一致);天空渐变因此不入缓存(单次 fillRect 成本可忽略)。
2. spec §4 把分层色组写在"palette.ts 扩展"名下 —— 实际落在 `hobart/paint.ts`
  (palette.ts 零 diff,"现导出 API 保持兼容"以更强形式满足;phaseFromClock/fyLabel 等不动)。
3. 静态缓存内 `drawWaterStatic` 画在 waterfront **之前**(spec 表格顺序是纵深描述而非
  绘制序):码头岸壁/栈桥/船桅必须压住水面上沿,倒影仍在岸线以下不受影响。
4. 窗灯低频闪烁需要纪元熵:`scenePaint` 第三参 `flickerEpoch`(默认 0),装配器注入
  4s 纪元,city 画师沿用旧闪烁公式;缓存失效键机制原样保留。
5. 阴天去饱和在 scenePaint 内统一完成(画师拿到即压灰);**灯光组与波光色豁免**(雨夜
  灯更显暖),波光强度按云量衰减。
6. 目标页百分比:API `percent` 封顶 100 不动,GoalSlide 用 `currentValue/targetValue`
  客户端派生显示值(goal-rings spec §2"如实显示 128%"与 §3"计算逻辑不动"同时满足)。

---
### Task H1: 契约与脚手架(串行先行)——`hb-tasks/task-H1.md`

**Files:**
- Create: `src/lib/scene/hobart/geometry.ts`(BAND/锚点/ScenePaint/LayerFn/mulberry32/rgba)
- Create: `src/lib/scene/hobart/paint.ts`(scenePaint 六关键帧分层插值,数值全部定稿写死)
- Create: `src/lib/scene/hobart/{sky,mountain,bridge,city,waterfront,water,foreground}.ts`(可编译占位画师)
- Modify: `src/components/tv/SkylineBackground.tsx`(424 行整文件替换为装配器;星/云/雨/雪/闪电/风原样迁移,闪电描边改走山脊折线)
- Test: `tests/scene/hobart.test.ts`(12 用例:scenePaint 边界 t=0/0.5/1、逐字日间基准色、阴天去饱和、夜间 light 组非零、灯色不压灰、插值中点、clamp、flickerEpoch;geometry 区间/锚点自洽;mulberry32 确定性)

- [ ] Step 1: 按任务文件写测试(整文件)→ 确认加载失败
- [ ] Step 2: 按任务文件落地 geometry/paint/7 占位/装配器(整文件,零占位符)
- [ ] Step 3: 门禁 —— 定向 vitest 12 绿;`npx tsc --noEmit` 零输出;全量 `npx vitest run`
      **27 files / 347** 全绿;`npm run build` 成功;占位场景冒烟截图(分层色带可见即可)
- [ ] Step 4: `git add src/lib/scene/hobart tests/scene/hobart.test.ts src/components/tv/SkylineBackground.tsx && git commit -m "feat: hobart scene contract, layered paint and assembler scaffold"`

---
### Task P-sky / P-mountain / P-bridge / P-city / P-waterfront / P-water / P-foreground(7 路并行)——`hb-tasks/task-P-*.md`

每个画师:只改自己那**一个**文件,整文件重写占位实现;几何数字区间/色槽用法/夜间行为/
rng 规则在各自任务文件里(硬约束),风格细节有创作自由。要点:

- [ ] **P-sky**:drawCloudFlat 重写为 3–5 瓣平涂积云簇 + 底部暗带(cloud/cloudShade)
- [ ] **P-mountain**:双脊折线填充 + 绿坡面 3–5 块 + 发射塔 + 25–45 碎点房 + 雾霭带
- [ ] **P-bridge**:缓拱桥面(crest 0.17)+ 7 组墩(主航道双柱门架)+ 护栏 1px + 夜灯串(lampStep 0.022)
- [ ] **P-city**:0.42–0.58 全宽底带 + 左岸低带 + CITY_TOWERS 8 座按 kind 造型 + 砂岩山墙连排 + 树冠团 + **逐扇窗灯**(windowLit/flickerEpoch 公式)
- [ ] **P-waterfront**:岸壁/甲板 + WAREHOUSES 4 座三色顶 + 白色连排 + 2 栈桥 + 8–12 桅杆 + 夜窗/码头灯
- [ ] **P-water**:静态(底色渐变/塔楼倒影垂拉+亮缝/静态波纹/夜灯影竖拉)+ 动态(波纹漂移/日月波光竖列/BOATS 船摇+帆+夜航灯)
- [ ] **P-foreground**:5–8 座山墙屋顶 + 烟囱 3–5 + 老虎窗 + 两侧深色树冠 + 底边收口

门禁(每个画师):tsc 无本文件错误 + `npx vitest run tests/scene/hobart.test.ts` 12 绿;
**零 git 操作**;整体视觉留待 H3。

---
### Task G1: 目标页圆环仪表盘(与画师并行)——`hb-tasks/task-G1.md`

**Files:**
- Create: `src/components/tv/ProgressRing.tsx`(SVG 轨道圆+渐变描边,12 点起针,mount 时 dashoffset 1.2s ease-out 入场,≥100% 金渐变+金晕,环封顶不绕圈)
- Rewrite: `src/components/tv/slides/GoalSlide.tsx`(1=420 英雄环 / 2=340 并排 / 3–4=260 2×2;`GCI · THIS MONTH` 头 + 环心真实 DOM 百分比 + `$204K / $250K` 行 formatValue 复用;displayPct 客户端派生)

- [ ] Step 1–2: 按任务文件整文件落地两组件
- [ ] Step 3: tsc(无本任务文件错误)+ 全量 vitest 不回退(无新增单测,spec §4)+ build
      (被并行画师 WIP 阻塞时注明跳过,H3 兜底)
- [ ] Step 4: `git add src/components/tv/ProgressRing.tsx src/components/tv/slides/GoalSlide.tsx && git commit -m "feat: goal ring dashboard on tv goals slide"`
- E2E 零改动依据:标题文本不变,现有用例对目标页无内部断言(已核对 tv-flow.spec.ts)。

---
### Task H3: 集成联调 + 视觉评审门禁(串行收尾)——`hb-tasks/task-H3.md`

- [ ] Step 0: 画师文件一笔入库 `git commit -m "feat: hobart layer painters"`(先 tsc+vitest)
- [ ] Step 1: 截图矩阵 —— e2e harness(`npx tsx e2e/start-server.ts`)+ Playwright 脚本
      (addInitScript 平移 Date + route mock `/api/tv/weather`):正午/黄金/夜晚 ×
      晴/雨(63)/雷(95)= 9 张(≥ spec 最低 6);另拍轮播可读性 2 张 + 目标页 1/4 目标
      各 1 张(goal-rings spec §4)
- [ ] Step 2: 评审清单逐张目验:构图五要素 / 平涂成立 / 夜晚窗灯+桥灯+船灯+水面灯影 /
      黄金暖金 / 天气特效 / 文字可读性 / 四处层接缝
- [ ] Step 3: 修图迭代 ≤3 轮(层问题改画师文件,色感问题改 paint.ts 关键帧;锚点动则先跑
      契约测试),逐轮 `fix:` 提交
- [ ] Step 4: 性能自查 —— 180 帧 rAF 间隔采样(p95 ≤ 50ms;4s 对齐尖峰=缓存重绘,正常),
      临时 console.count 确认缓存 ≤1 次/4s 后移除
- [ ] Step 5: 全量门禁 `npx tsc --noEmit` + `npx vitest run`(27/347)+ `npm run build` +
      `npm run test:e2e`(6 passed)

---
## Spec 自查矩阵

| Spec 节 | 覆盖处 |
|---|---|
| hobart §1 需求(保留双引擎/程序化优势) | H1 装配器沿用 phaseFromClock/effectsFromWeather;P-city 窗灯、P-water 波光/船摇、P-bridge 灯串 |
| hobart §2 构图表格 + 固定种子 | geometry.BAND/锚点(测试钉死)+ LAYER_SEEDS/mulberry32;各 P-* 几何指令 |
| hobart §3 平涂/日间基准色/时段分层/天气去饱和 | header.md 画风规则;paint.ts MIDDAY 帧逐字(测试钉死)+ 六帧分层插值 + 去饱和并入 |
| hobart §4 离屏缓存/代码结构/性能常量 | H1 装配器(失效键沿用、DPR/隔帧/粒子/paused 原值);契约级决定 1–4 |
| hobart §5 验证(单测+截图矩阵硬门禁+全量) | tests/scene/hobart.test.ts;H3 Step 1–5 |
| hobart §6 非目标 | 无图片资源/视差/行人车辆/季节/按 org 换城市;仅程序化再创作 |
| hobart §7 成功标准 | H3 评审清单即验收清单 |
| goal-rings §1 布局 | G1 ringSize + 1/2/2×2 分支 |
| goal-rings §2 单卡/动画/金色态/封顶 | ProgressRing + displayPct(契约级决定 6) |
| goal-rings §3 实现约束(props/一次性动画/E2E 零改动) | G1 组件 props { pct, size, reached };mount 一次性 transition;E2E 依据已核对 |
| goal-rings §4 非目标/验证 | 无 CRUD/分页/刻度/声效;1/4 目标截图并入 H3 |
