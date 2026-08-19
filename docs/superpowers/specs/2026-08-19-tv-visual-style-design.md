# TV 视觉风格升级:液态玻璃 + 翻牌板标题 + 渐变 3D 数值 + 黄金荣耀标题 — 设计文档

- **日期**:2026-08-19
- **状态**:已与需求方确认(逐项展示后"没错,全部开始开发设计制作")
- **基线**:main @ ac5b1cd(天际线背景合并后)之上的增量,分支 feature/tv-visual-style

## 1. 液态玻璃面板(Liquid Glass)

**需求**:TV 端全部卡片与榜单行改液态玻璃设计,玻璃**微微扭曲折射**背后的天际线背景。

### 1.1 玻璃基底(全浏览器)

- globals.css 新增共享 `.glass` 类:半透明层叠渐变底(135° 白色高光 ~0.06 → 面板深色调 rgba)、1px 半透明白描边(`border`,box-border 内含不动定高)、内侧顶部高光 + 底部暗边(两条 inset box-shadow 模拟玻璃厚度)、外部柔和投影、`rounded-2xl`(行类元素 `rounded-xl` 以贴近现状)、backdrop-filter 至少 `blur(6px) saturate(1.5)`。
- 替换现有 `bg-panel/70 backdrop-blur-sm` 系写法(上轮 K3 的 8 处锚点同一套)。

### 1.2 折射扭曲(Chromium 渐进增强)

- TvApp 根部渲染隐藏 SVG(width/height 0):`<filter id="liquid-glass">` = `feTurbulence`(fractalNoise,baseFrequency ~0.008 0.012,numOctaves 2,固定 seed)→ `feDisplacementMap`(scale ~12–14,轻微)。
- JS 检测 `CSS.supports('backdrop-filter', 'url(#liquid-glass)')` → 支持则根元素挂 `glass-refract` class;`.glass-refract .glass { backdrop-filter: url(#liquid-glass) blur(6px) saturate(1.5); }`。不支持自动停留在 §1.1 效果,零破损。
- 检测逻辑放小 hook 或 TvApp 内一次性 effect(SSR 安全:仅客户端执行)。

### 1.3 应用范围(8 处,与既有半透明锚点一致)

记分卡 4 汇总块、记分卡表格容器、榜单每行、目标卡、公告卡、配对码数字格、页码角标、OFFLINE 徽标。**只换背景/边框/圆角/阴影/滤镜类,不动任何定高与分页像素预算**(border 在 border-box 内)。管理后台不改。

## 2. 记分卡翻牌板标题(Split-Flap)

**需求**:仅记分卡 MTD/YTD 两页的主标题 `SALES SCORECARD` 换成机场翻牌板风格 + 翻动动画。

- 新组件 `src/components/tv/SplitFlapTitle.tsx`:每字母一块翻牌(近黑渐变牌面、圆角、中央横向拆分线、白色粗体字母),空格为间隙;**整行高度钉死 60px**(现标题行高度),`SCORECARD_RESERVED_PX=388` 不变。
- **翻入**:组件挂载时(轮播切到该页)各牌从随机 A–Z 字符开始,按字母序错峰(~80ms)翻转 3–6 次(每次 ~90ms 的 rotateX 3D 翻转)后停到目标字母。
- **偶发抖动**:停留期间每 6–10 秒随机取 1–2 块牌快速翻两轮回原字母;setInterval 卸载清理。
- **E2E 兼容(关键)**:字母拆 span 后 getByText 匹配不到——组件内含 sr-only 完整标题文本节点 + 容器 `aria-label`,使 `SLIDE_TITLE_RE`/'SALES SCORECARD' 断言继续命中;若个别断言需微调在计划中写明。
- 副标题(periodLabel · MONTH TO DATE 等)不变;图中的皇冠/奖杯图标不做(非目标)。

## 3. 数值渐变 3D 字效

**需求**:现霓虹绿数值改为青→蓝→深紫水平渐变 + 轻微 3D 立体 + 微发光。

- 共享实现:`value-3d` 类 + `data-text` 伪元素方案或小组件 `GradientValue`(计划阶段二选一并统一):前景层水平渐变(#2EE6C9 → #3B7BC8 → #4A2B8C 系,精确色值计划定稿)`background-clip: text`;`::before`(attr(data-text))深色同文本副本向下错位 1–2px ×2 层做立体挤出;`filter: drop-shadow` 柔和青色微发光(强度低于现霓虹)。
- 文本保持真实 DOM 文本,E2E 数值断言($204K、2/2 等)不受影响。
- **应用**:记分卡 4 汇总块数值与 Gross Comm 列、三个榜单页数值列、目标页进度数字、庆祝弹屏金额。**不改**:配对码、白色正文、Conversion 语义色块、排名序号。

## 4. 黄金荣耀标题字效

**需求**:除记分卡外其余五页大标题(SALES CHAMPIONS、TOP LISTERS、GCI LEADERS、TEAM GOALS、ANNOUNCEMENTS)用冠军金奖杯风格。

- 共享 `gold-title` 类:纵向金属金渐变(浅金 #F9E7A0 → 正金 #F5C445 → 深金铜 #A8741A 系)`background-clip: text`;layered text/drop-shadow 轻微浮雕;柔和金色光晕;**shine sweep**——背景加一道斜向高光带,`background-size 200%` + keyframes 每 ~5 秒扫过一次。
- 标题文本为真实 DOM 文本,SLIDE_TITLE_RE 断言不受影响。庆祝/生日弹屏标题不改(非目标)。

## 5. 测试与验证

- 无新增单元测试(纯视觉 CSS/组件动画);SplitFlapTitle 若含纯逻辑(随机翻转序列生成)可选择性抽为纯函数配 1–2 个单测,计划阶段定。
- 门禁:`npx tsc --noEmit` 零输出、`npx vitest run` 全绿(基线 331)、`npm run build` 成功、全量 E2E 6 条全绿(标题/数值断言经 §2/§3/§4 的 DOM 兼容设计应零改动;如需微调以真实 DOM 为准写明)。
- 审查阶段照例起 e2e harness 截图目验:玻璃折射(Chromium)、翻牌动画停定后的标题、渐变数值、金色标题各一张;文字可读性不降。

## 6. 非目标

管理后台任何样式;配对码/副标题/正文风格;Conversion 色块;庆祝与生日弹屏(保持现状);皇冠奖杯图标;Firefox/Safari 的折射效果(回落即可);声音。

## 7. 成功标准

- Chromium 上玻璃面板可见背景微扭曲折射,其余浏览器回落毛玻璃且无视觉破损。
- 记分卡标题以翻牌板翻入、偶发抖动;其余五页标题金色荣耀带高光扫过;数值全部青蓝紫渐变 3D 微发光。
- 331 vitest / 6 E2E / build 全绿;分页像素预算与所有文字断言不受影响。
