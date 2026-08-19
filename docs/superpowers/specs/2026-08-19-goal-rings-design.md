# 目标页圆环仪表盘重设计 — 设计文档

- **日期**:2026-08-19
- **状态**:已与需求方确认(嫌原横条卡丑与布局空;选定"圆环仪表盘网格")
- **基线**:main @ 1917a11 之上的增量,分支 feature/hobart-scene(与霍巴特背景同分支,不同文件)

## 1. 布局

金色 TEAM GOALS 标题(不变)下按目标数自适应居中:1 个 = 英雄式大环卡(环径 ~420px);2 个 = 并排两卡;3–4 个 = 2×2 网格(环径 ~260px)。goals 数据仍 slice(0,4),页面不参与分页机制(现状)。

## 2. 单卡(液态玻璃 .glass)

- 顶部:指标名 + 周期(如 `GCI · THIS MONTH`),加粗、字距拉开、白色。
- 中央:SVG 圆环 —— 深色半透轨道圆 + 品牌渐变描边(svg linearGradient,#5CF7DE→#6FA8FF→#B06CFF,stroke-linecap round,起点 12 点方向);**挂载时 strokeDasharray 从 0 动画到实际百分比**(~1.2s ease-out,轮播每次切入都有入场);环心 GradientValue 大号百分比。
- 下方:`$204K / $250K` 当前/目标(money 用 formatMoney,数量用 formatCount;现有格式逻辑复用)。
- **≥100% 达成态**:圆环描边与百分比换金色渐变(gold 系,呼应冠军主题),环外圈柔和金色光晕。
- 超 100% 时环封顶画满(不绕第二圈),百分比如实显示(如 128%)。

## 3. 实现与约束

- 新组件 `ProgressRing`(src/components/tv/ProgressRing.tsx,props { pct, size, reached }),GoalSlide.tsx 重写布局与卡结构;百分比计算逻辑不动(纯视觉重排)。
- 入场动画一次性(CSS transition/keyframes on mount),无持续动画;电视性能无忧。
- E2E:TEAM GOALS 标题文本不变;现有用例对目标页无内部断言,预期零改动。
- 无新增单测(纯视觉);全量 vitest/build/E2E 保持绿;视觉评审截图含 1 目标与 4 目标两种(demo seed 数据按需临时造)。

## 4. 非目标

目标 CRUD/后台改动;>4 目标分页;里程碑刻度;声效。
