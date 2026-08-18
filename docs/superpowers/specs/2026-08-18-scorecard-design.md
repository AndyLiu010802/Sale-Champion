# 记分卡(Scorecard)与真实数据模型对齐 — 设计文档

- **日期**:2026-08-18
- **状态**:已与需求方确认(基于真实 SOUTH. SALES SCORECARD 表格)
- **基线**:main @ 384b2a1 之上的增量功能

## 1. 需求与决策

| 决策点 | 结论 |
|---|---|
| 团队建模 | **团队即成员**:Team Cowley / Hill & Co / Team Brudenell 直接作为名单一行,零结构改动 |
| 展示 | **新增 Scorecard 整页轮播 slide**(默认启用、后台可关);现有三榜/目标/房源/公告页保留 |
| 成交拆分 | `sales.split`(小数,默认 1.0);共享成交每位参与者各一行(各自 split 与佣金份额) |
| 成交口径 | "Sales" = 参与笔数(行数);"Split"/总成交 = split 之和(表格 TOTAL SALES 8 = Σsplit) |
| 估价 | 新表 `appraisals`(成员/日期/数量),后台极简录入(支持一次 +N 批量) |
| 转化率 | Listing Conversion = 周期内 listings 数 ÷ appraisals 数;无估价显示 — |
| 数据导入 | 幂等 SQL 文件(Railway Postgres **Data 标签**粘贴运行)+ 本地 runner 脚本;按逐行数值导入(见 §7 的 36 vs 29 说明) |

## 2. 数据模型

- `sales` 新增 `split: double precision NOT NULL DEFAULT 1`(0 < split ≤ 1,zod 校验;编辑表单可改)。
- 新表 `appraisals`:`id, org_id, agent_id(→agents), date(YYYY-MM-DD 字符串), count integer NOT NULL DEFAULT 1(≥1), created_at`。仅 `role='agent'` 且 `active=true` 的成员可录(与 sales/listings 同口径)。
- 新迁移(0002)。

## 3. 指标口径变更

- `sales_count` 指标(榜单/目标/团队总量)从"行数"改为 **Σsplit**(显示保留 1 位小数、`.0` 去尾:`8`、`1.8`)。
- `gci` 不变(每行 gciCents 已是该成员份额);`listings` 不变。
- goal 进度中 `sales_count` 目标与 Σsplit 比较(文档化)。

## 4. Scorecard 轮播页

- **新 SlideKey `'scorecard'`**(SLIDE_KEYS 变 7 键,settings refine 同步 7 键置换;DEFAULT_SETTINGS 首位插入 `{ key:'scorecard', enabled:true, durationSec:20 }`)。
  - ⚠️ 兼容说明:已存的 settings 行(6 键)读取时 safeParse 失败 → 回落新 DEFAULT_SETTINGS(既有自定义丢失一次,接受;控制台有 warn)。
- **布局**:顶部 4 个汇总块(TOTAL APPRAISALS / TOTAL LISTINGS / TOTAL SALES[Σsplit] / TOTAL GROSS COMM)+ 明细表:Rank、Name、Appraisals、Listings、Sales、Split、Gross Comm、Conversion。按 Gross Comm 降序;行定高,复用现有按屏分页机制(页码角标同款;汇总块算入头部预留)。
- **Conversion 色块**:≥50% 绿、20–49.9% 黄、<20% 红、无估价灰(—)。与样表一致(75 绿/25 黄/50 绿/15.4 红/0 红)。
- 样表中的"各指标前三"小表与柱状图为**非目标**(现有三榜已承担)。

## 5. 服务端(/api/tv/state 扩展)

`TvStateResponse` 新增 `scorecard`:

```ts
scorecard: {
  totals: { appraisals: number; listings: number; salesSplit: number; gciCents: number };
  rows: Array<{ agentId: string; name: string; appraisals: number; listings: number;
                sales: number; split: number; gciCents: number; conversionPct: number | null }>;
}
```

- 周期 = `settings.leaderboardPeriod`(默认 month = month-to-date,与样表口径一致);仅 `role='agent'` 且 active 成员成行;**全指标为 0 的成员不成行**;rows 按 gciCents 降序。
- appraisals 周期过滤按 `date`;实现为纯函数 `computeScorecard(inputs, range)` 放 domain 层,可单测。

## 6. 管理后台

- **成交表单**(录入+编辑):新增 `Split` 数字输入(默认 1,步进 0.05,0<x≤1);diff-only 照旧。
- **新增 Appraisals 页**(导航新项):录入表单(成员下拉[仅 active agent]、日期[默认今天]、数量[默认 1])+ 近期记录表(成员/日期/数量/删除);API:`GET/POST /api/appraisals`、`DELETE /api/appraisals/[id]`(requireAdmin、org 过滤、广播 data.updated 新 domain `'appraisals'`)。

## 7. 八月真实数据导入

- 文件 `docs/import/2026-08-south-scorecard.sql`(提交入库)+ 本地 runner `scripts/run-sql.ts`(读 SQL 用 db 执行,供本地 PGlite;云端直接在 Railway Postgres → Data 标签粘贴 SQL)。
- **幂等**:成员按 name 判重;业绩行地址/标记形如 `Imported Aug sale #n (Name)` 并 NOT EXISTS 守卫,重复跑零副作用。
- 还原规则:成交行 salePriceCents=0(仅佣金参与统计,导入不触发庆祝——SQL 直写不经 API);佣金按人头均摊到各行(余数进首行);split 按表格精确还原(如 John 两行 1.0+0.8、Kathy 一行 0.2、双人团队行 0.5+0.5);房源行 `status='sold'`(计入 listings 指标与转化率,但**不出现在 TV 在售房源页**,避免 $0 占位价上屏);日期散布在 2026-08-01~17。
- 导入名单与数值(7 行,逐行以表格为准):Chris Joyce A4/L3/S3(1+1+1)/$37,998;John Loveluck A4/L1/S2(1.0+0.8)/$28,970;Team Cowley A8/L4/S2(0.5+0.5)/$13,148;Michael Hatzinicolaou A2/L1/S2(0.5+0.5)/$13,148;Hill & Co A13/L2/S2(0.5+0.5)/$11,000;Kathy Roberts A1/L0/S1(0.2)/$4,080;Team Brudenell A4/L0/S0/$0。
- **已知差异**:逐行 Appraisals 之和为 36,样表表头 TOTAL 为 29(逐行转化率与逐行数值自洽,表头疑为另一口径);按逐行导入,系统总数显示 36。

## 7b. 增量修订(2026-08-18,基于 Year to Date 表确认)

- **记分卡拆两个 section**:SlideKey `'scorecard'`(Month to Date,副标题 periodLabel + MONTH TO DATE)与 `'scorecard_ytd'`(Year to Date,副标题 FY 标签 + YEAR TO DATE),各自开关/时长(默认都启用、20s),SLIDE_KEYS 变 **8 键**(顺序:scorecard, scorecard_ytd, 三榜, goal, listings, announcements)。
- **YTD 周期 = 澳洲财年**:新纯函数 `fyToDateRange(now)`(7 月 1 日 00:00 起至明日 00:00 排他)与 `fyLabel(now)`(如 `FY 2026–27`);榜单既有 PERIODS 不动。
- **房源拆分**:`listings.split`(doublePrecision 默认 1,0<x≤1,create/patch zod,后台房源表单加 Split 输入);listings 指标(榜单/goal/scorecard Listings 列)与 **转化率分子** 全部改 **Σsplit**(round1 同款防尘)。
- tv/state:`scorecard`(按 leaderboardPeriod)与 `scorecardYtd`(按财年)两份 + `fyLabel`;TvStateResponse 相应扩展。
- **E2E 钉死**:MTD 页标题 `SALES SCORECARD` + 文案 `MONTH TO DATE`;YTD 页文案 `YEAR TO DATE`。
- **导入含 7 月补录**(YTD−8 月差额,逐行核算已对平总额:补录后 YTD 应为 Σsplit 15、Listings 46.65、GCI $214,822±1、Appraisals 141[表头 120 与逐行 141 同 MTD 类不一致,按逐行]):
  | 成员 | 7月 Appraisals | 7月 Listings(Σsplit) | 7月成交(参与/Σsplit) | 7月 GCI |
  |---|---|---|---|---|
  | Team Brudenell | 22 | 7.66(7×1+0.66) | 6 行 ×0.5 | $49,753 |
  | Team Cowley | 17 | 17.33(17×1+0.33) | 1.0+0.5+0.5 | $26,125 |
  | Chris Joyce | 6 | 5 | — | $0 |
  | John Loveluck | 3 | 1 | — | $0 |
  | Michael Hatzinicolaou | 5 | 2 | 0.8 | $13,700 |
  | Kathy Roberts | 0 | 1 | 0.3×4 | $16,900 |
  | Hill & Co | 52 | 1.66(1+0.66) | — | $0 |
  日期散布 2026-07-01~31;其余规则(status='sold' 房源、salePriceCents 0、佣金均摊、幂等守卫)同 §7。
- 老 settings 行(6/7 键)读取回落 8 键新默认,机制同前。

## 8. 测试

- 单元:computeScorecard(周期过滤/排序/conversion 含 0 与 null/全零成员剔除/totals);Σsplit 口径(computeLeaderboard/computeMetricTotal 的 sales_count 改动 + 既有用例更新);split zod 边界;appraisals API CRUD 与广播;settings 7 键 refine。
- 集成:tv/state.scorecard 形状与数值;导入 SQL 在测试库执行两遍幂等断言(runner 路径)。
- E2E:Scorecard slide 出现(标题 SALES SCORECARD 钉死文案)。

## 9. 非目标

- 各指标前三小表、柱状图;真团队模型(成员归属/自动汇总);appraisals 独立榜单指标;导入数据的后台编辑界面(导入后可在现有页面正常增删);sales split >1 或多于每行 100% 的复核。

## 10. 成功标准

- 电视出现记分卡整页:4 汇总块 + 色块明细表,与样表口径一致(Σsplit=8、GCI 总额 $108,343±舍入、逐行 conversion 颜色匹配)。
- 后台可录 split 与 appraisals;三榜 sales 口径变 Σsplit 无回归。
- SQL 在 Railway Data 标签一次粘贴导入成功、重复运行无副作用。
