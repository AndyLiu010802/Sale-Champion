# 真团队模型(Teams)— 设计文档

- **日期**:2026-08-19
- **状态**:已与需求方确认(四问四答:榜单只显示 Team 行;**业绩只能录给 Team**;存量三团队行就地转 Team;庆祝展示 Team 名 + 全体成员照片)
- **基线**:main @ 57a7ea7 之上的增量,分支 feature/teams

## 1. 需求

Type 下拉新增 **Team**;Team 行可挂若干现有 agent 为成员(如 Hill & Co = Marnie Hill + Martin Waldhoff)。榜单/记分卡只显示 Team 行;归队成员不单独上榜、也**不可再被录入业绩**(录入下拉只出现 Team 与未归队 agent);Team 成交庆祝时展示 Team 名 + 全体成员照片并排。成员个人保留生日播报与照片管理。

## 2. 数据模型

- `agents.role` 取值扩为 `'agent' | 'staff' | 'team'`(列本为 text,zod 层扩枚举);新增 `agents.team_id`(text,可空,FK → agents.id,0004 迁移只加列)。
- 约束(应用层校验,非 DB 约束):`team_id` 只能指向 `role='team'` 的行;`role='team'` 的行自身 `team_id` 恒为 null(不嵌套);成员必须 `role='agent'`(staff 不可入队);团队行无生日(birthday 字段置 null,UI 隐藏)。

## 3. 业绩与榜单口径

- **录入资格**(sales/listings/appraisals 的 POST/PATCH agent 校验,统一改为):`active=true` 且(`role='team'` 或(`role='agent'` 且 `team_id IS NULL`));归队成员与 staff 一律 400 'Unknown agent'。admin 三处录入下拉同口径过滤。
- **榜单/记分卡成行资格**(computeLeaderboard / computeScorecard 的 inputs.agents 过滤,tv/state 组装处):`active` 且(`role='agent'` 或 `role='team'`)且 `team_id IS NULL`——归队成员天然不成行;未归队 agent 照常。goal 总量 computeMetricTotal 无 agent 过滤维度,不受影响。
- 历史数据零迁移:业绩本就挂在团队行上(团队即成员时代),转 Team 后原地有效。

## 4. 庆祝弹屏

- `SaleCelebration` payload 新增 `members?: Array<{ name: string; photoUrl: string | null }>`:成交 agent 为 `role='team'` 时,服务端按 `team_id` 查成员(active,按 name 排序)组装;个人成交不带该字段,行为不变。
- `CelebrationOverlay`:有 `members` 时照片区渲染成员照片**并排**(2–4 张圆形,同现有单照样式缩小;无照片者首字母头像;标题仍为 Team 名);无则现状。主题曲沿用现有回退链(team 行自己的 anthem → org 默认)。
- 生日播报不涉及 team(团队行无生日)。

## 5. 管理后台(Team 页)

- **Type 下拉**加 `Team`(Agent/Staff/Team);选 Team 时:隐藏 Birthday 字段;显示 **Members 复选区**——列出全部 `role='agent'` 且 active 的成员(含已属其他队的,勾选即改隶属;每项旁注当前所属队名)。
- 保存:团队 POST/PATCH 携带 `memberIds: string[]`(可空数组),服务端**事务内** diff 处理:勾选者 `team_id=该队`,原属该队但未勾选者 `team_id=null`;校验成员资格(role='agent',非 team,非自身),违规 400。
- 列表:Team 行 Type 徽标显示 `Team`;归队成员行加小字所属队名(如 `· Hill & Co`)。
- **删除语义**:硬删 Team 行 → 事务内先置其成员 `team_id=null`(成员保留),再走现有级联(该队名下 sales/listings/appraisals + 行本身);usage 端点不变。删除归队成员 → 现有级联(其名下历史业绩,若有归队前记录)。
- 生日相关:团队行创建/编辑不发生日;既有生日调度器天然跳过(字段 null)。

## 6. 存量迁移 SQL

`docs/import/2026-08-teams.sql`(幂等,Railway Data 标签粘贴 / 本地 runner):
1. 三个团队行就地转 Team:`UPDATE agents SET role='team', birthday_month=null, birthday_day=null WHERE name IN ('Hill & Co','Team Cowley','Team Brudenell') AND role='agent'`(带 org 单一前置说明,同上次导入)。
2. 建成员 agent(固定字面量 id,NOT EXISTS 按 name 判重,`team_id` 用 `(SELECT id FROM agents WHERE name='…' LIMIT 1)`):Hill & Co ← Marnie Hill、Martin Waldhoff;Team Cowley ← Nick Cowley、Haylee Abbott;Team Brudenell ← Alex Muller、Mark Brudenell、Eloise。照片留空(后台补传)。
3. `tests/import-teams.test.ts`:先跑既有 2026-08 导入再跑本文件两遍,断言幂等、三行转 team、7 成员挂队正确、榜单成行资格(成员不成行)。

## 7. 测试

- 单元/集成:agents API(role 枚举扩、memberIds 事务 diff、成员资格校验 400、team 删除释放成员、嵌套/staff 入队拒绝);sales/listings/appraisals 录入资格门(团队可录、归队成员 400、未归队 agent 可录);tv/state 榜单/记分卡成行过滤;庆祝 payload members 组装(team 成交带成员、个人成交不带);既有测试适配。
- E2E:现有 6 条应全绿(demo seed 无 team,行为不变);不加新 E2E 用例(庆祝成员照片以单测 + 截图目验为准)。

## 8. 非目标

团队嵌套;成员业绩自动汇总(录入即录队);团队独立页面;photo 拼贴合成;按队过滤的报表;生日播报 for team;Agentbox 同步。

## 9. 成功标准

后台可建 Team 并勾选成员;录入下拉不出现归队成员;榜单/记分卡只见 Team 行与未归队个人;Team 成交庆祝并排显示成员照片;迁移 SQL 幂等跑通后 Hill & Co 等三队带真实成员;全量 vitest / build / E2E 6 条全绿。
