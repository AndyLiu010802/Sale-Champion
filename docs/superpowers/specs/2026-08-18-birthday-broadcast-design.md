# Birthday Broadcast 与 Team 类型 — 设计文档

- **日期**:2026-08-18
- **状态**:已与需求方确认
- **基线**:TV Sales Leaderboard MVP(main @ a072ce7)之上的增量功能

## 1. 需求概述

| 需求 | 结论 |
|---|---|
| 庆祝音乐播放次数 | 成交庆祝主题曲**只播一遍**不再循环;画面持续到庆祝时长结束 |
| 员工模型 | 与销售员同一名单,按 `role` 分类型:`agent`(销售员,上榜/可录成交)与 `staff`(普通员工,不上榜/不可录成交);两类都可设照片与生日 |
| 生日数据 | 存 `MM-DD`(月-日),不存年份 |
| 生日播报形式 | 全屏庆祝式打断轮播:🎂 HAPPY BIRTHDAY + 寿星照片/首字母头像 + 姓名 + 内置合成生日旋律(只播一遍);时长复用 `celebrationDurationSec` |
| 自动播报 | 服务器本地时区(TZ)每分钟检查,11:00 当天有在职者生日且当天未自动播过 → 依次广播;**错过不补播** |
| 手动播报 | Team 页每行 🎂 按钮,任意时间可播 |
| 调度机制 | 进程内定时器(方案 A);防重复标记落库,重启不重播 |

## 2. 数据模型变更

`agents` 表新增两列(生成新迁移):

- `role: text NOT NULL DEFAULT 'agent'` — `'agent' | 'staff'`;既有行默认销售员,零迁移成本
- `birthday: text`(可空)— 格式 `MM-DD`(如 `'08-18'`),zod 校验 `^\d{2}-\d{2}$` 且月日合法(01-12 / 01-31)

`orgs` 表新增一列:

- `last_birthday_broadcast_date: date`(可空)— 当天自动播报的防重复标记(存 `YYYY-MM-DD`)

## 3. WS 协议扩展

`CelebrationPayload` 拆为 discriminated union(`kind` 判别):

```ts
type SaleCelebration = { kind: 'sale'; saleId; agentName; agentPhotoUrl; address; salePriceCents; anthemUrl; durationSec };
type BirthdayCelebration = { kind: 'birthday'; agentId; name; photoUrl: string | null; durationSec: number };
export type CelebrationPayload = SaleCelebration | BirthdayCelebration;
```

`celebration.play` 事件与电视端队列/打断/恢复机制**原样复用**;既有 sale payload 增加 `kind: 'sale'` 字段。TV 端 `CelebrationOverlay` 按 `kind` 分支渲染;`key` 从 `saleId` 改为 union-safe 的稳定键(sale 用 saleId,birthday 用 `birthday:{agentId}:{触发序号}` 以支持同人同日多次手动播报重挂载)。

## 4. 音频变更

- `src/components/tv/audio.ts`:合成曲**移除循环重排**——旋律播完一遍即止(stop 语义不变);文件 URL 播放本就不循环,不动。
- 新增内置合成旋律 `builtin:birthday`("生日快乐"旋律,双振荡器同款风格),生日播报固定使用;不进入销售员主题曲下拉(`BUILTIN_ANTHEMS` 不收录,单独常量)。

## 5. 调度器(进程内)

`src/server/bootstrap.ts` 启动时挂一个每分钟 interval:

1. 取服务器本地时间(部署时区 `TZ`);仅当 `HH:mm === '11:00'` 继续。
2. 查 org 的 `last_birthday_broadcast_date`,等于今天(本地 `YYYY-MM-DD`)则跳过(防重复,含进程重启场景)。
3. 查 `agents` 中 `active = true` 且 `birthday = 今天的 MM-DD`(agent 与 staff 都算)。
4. 命中则:先写防重复标记(先写后播,宁可极端情况少播不重播),再对每位寿星 `broadcast celebration.play`(kind birthday);电视端队列自然依次播放。
5. 判定逻辑抽成纯函数(`shouldBroadcastBirthdays(now, lastDate)` 与 `birthdaysOn(mmdd, agents)`)便于单测;interval 在 server close 时清理。

## 6. API 变更

- `agents` 的 create/patch schema 增加 `role`(枚举,可选)与 `birthday`(格式校验,patch 可 `null` 清空)。
- **role 强约束**:sales 与 listings 的 agentId 校验在现有 `active=true` 之上增加 `role='agent'`(staff 录成交/房源 → 400 'Unknown agent',与现有文案一致不泄漏)。
- 榜单:`/api/tv/state` 组装 `LeaderboardInputs.agents` 时过滤 `role='agent'`(staff 永不入榜,含 computeMetricTotal 的团队口径——目标进度只统计销售员业绩,与"staff 不产生业绩"一致)。
- 新增 `POST /api/agents/[id]/birthday-broadcast`(admin):任意时间手动播报该成员生日(不看日期、不动防重复标记);目标不存在或 inactive → 404。

## 7. 管理后台变更(Team 页)

- 导航与页面标题 Agents → **Team**(路由路径 `/admin/agents` 不变,避免无谓迁移)。
- 列表列增加:类型(Agent/Staff 标签)、生日(`MM-DD` 或 —);行内新增 🎂 播报按钮(交互同 Replay:挂起 disabled、失败 setError)。
- 新建/编辑 Modal 增加:类型下拉(Agent/Staff)、生日(月/日两个下拉,可清空);类型为 Staff 时隐藏主题曲字段(数据保留不清除)。
- 沿用既有约定:diff-only PATCH、挂起 disabled、错误透传。

## 8. TV 端变更

- `CelebrationOverlay` 按 `kind` 分支:birthday 渲染 🎂 HAPPY BIRTHDAY(金/粉霓虹)+ 照片/首字母 + 姓名,播 `builtin:birthday`;sale 分支维持现状(音乐不循环由 audio.ts 统一生效)。
- `TvApp`/carousel reducer 无结构性改动(payload 类型更新随 union 传播)。

## 9. 测试策略

- 单元:调度判定纯函数(11:00 命中/非 11:00 跳过/当天已播跳过/无生日空集/agent+staff 都命中/inactive 排除);birthday 格式校验;audio 不循环(合成调度不再自我重排——以纯逻辑可测部分为准)。
- 集成:agents API 的 role/birthday 读写;staff 录成交/房源被拒;tv/state 榜单与目标进度排除 staff;手动播报端点广播 payload 形状与 404。
- E2E:沿用现有模式加一条"Team 页手动播报 → 电视出现 HAPPY BIRTHDAY → 回轮播"用例。

## 10. 非目标

- 生日补播(离线电视错过不补)、按屏幕定向播报、生日提前提醒、年龄/年份存储、11:00 时刻可配置(写死,要改再说)、staff 的主题曲语义。
- `02-29` 生日在平年不自动触发(精确 MM-DD 匹配;平年可用手动按钮播报)——接受此边界。

## 11. 成功标准

- 成交庆祝音乐只响一遍,画面时长不变。
- Team 页可标记类型与生日;staff 不出现在任何榜单/下拉/目标口径中。
- 生日当天 11:00(服务器时区)在线电视自动播报一次,重启进程不重播;手动按钮任意时间可播。
