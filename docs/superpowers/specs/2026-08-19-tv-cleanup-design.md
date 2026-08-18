# TV 内容清理:移除 Hot Listings 轮播页 + 成员删除按钮 — 设计文档

- **日期**:2026-08-19
- **状态**:已与需求方确认(两问两答:彻底从代码移除;删除成员连带删除业绩+二次确认)
- **基线**:main @ 114cf46(scorecard 合并后)之上的增量,分支 feature/tv-cleanup

## 1. 移除 Hot Listings 轮播页

**需求**:TV 轮播不再有在售房源(Hot Listings)页,且 Settings 里也不再出现该项——彻底从代码移除,不是默认关闭。

### 1.1 移除范围

- **settings.ts**:`SLIDE_KEYS` 从 8 键减为 **7 键**(去掉 `'listings'`,顺序:scorecard, scorecard_ytd, leaderboard_sales_count, leaderboard_gci, leaderboard_listings, goal_progress, announcements);`DEFAULT_SETTINGS.slides` 同步删该项;refine 依 `SLIDE_KEYS.length` 自动适配。
- **seed.ts**:内联 `DEFAULT_SETTINGS_DATA` 同步(既有 `tests/db.test.ts` 的 deep-equal 断言自动钉住)。
- **TvApp.tsx**:删 `ListingsSlide` import 与 switch case、`LISTINGS_ROW_PX`/`LISTINGS_COLUMNS` 常量、`perPage`/`counts` 两个 Record 的 `listings` 条目(`Record<SlideKey,…>` 编译期强制穷尽,漏删会编译错)。
- **删除文件**:`src/components/tv/slides/ListingsSlide.tsx`。
- **tv/state route**:删专供该页的 `tvListings` 查询(active 房源 join agents、按 listedDate 降序、limit 40)与响应字段 `listings`;**保留** 记分卡/榜单共用的 `listingRows` 全表查询。
- **types.ts**:删 `TvStateResponse.listings` 字段与 `TvListing` 类型(唯一消费者是被删组件)。
- **pagination.ts**:删 `gridPageSize`(唯一消费者是该页容量计算)及 `tests/pagination.test.ts` 对应 describe 块。
- **settings 页**:`SLIDE_LABELS` 删 `listings` 条目。
- **E2E**:`SLIDE_TITLE_RE` 去掉 `HOT LISTINGS`;分页用例(短屏 scorecard)不依赖该页,仅核对不改行为。
- **README**:轮播内容清单由 8 页改 7 页,删去 hot listings 描述。

### 1.2 保留不动

后台房源管理页(含 Split 输入)、`listings` 表与全部数据及 API、TOP LISTERS 排行榜页(`leaderboard_listings`)、记分卡 Listings 列与转化率、房源变更的 `data.updated 'listings'` 广播(TV 仍需刷新记分卡/榜单)。

### 1.3 兼容性

已存的 8 键 settings 行读取时 safeParse 失败 → 回落 7 键新默认(轮播自定义再重置一次,机制与前两次升级相同,README 升级注意事项补一句)。

## 2. 成员删除按钮(连带删除业绩)

**需求**:Admin → Team 页可真正删除成员(agent 与 staff 均可);删错人/测试数据可以彻底清掉。停用(下架保留历史)语义已有,保持不变。

### 2.1 交互

- 每行在现有停用开关旁加红色 **Delete** 按钮。
- 点击 → 先请求该成员名下记录计数 → `window.confirm` 二次确认,文案含具体数字(如 `Delete "Chris Joyce"? This permanently removes 3 sales, 5 listings and 2 appraisals. This cannot be undone.`)→ 确认后执行 DELETE → 成功后刷新列表。
- 行内操作沿用既有序列化 busy 态(删除进行中该行按钮禁用);服务端错误透传显示。

### 2.2 API

- **`DELETE /api/agents/[id]` 语义变更**:由"置 active=false"改为**真删除**。事务内按序:删 `sales`、`listings`、`appraisals` 中 `agentId=该成员` 的行(schema 外键无级联,必须先删子行)→ 删 `agents` 行。requireAdmin、org 过滤、404;成功后广播 `{ type:'data.updated', domain:'agents' }`(TV refetch 为全量 state,一条即可)。
  - 停用不受影响:UI 停用开关走 `PATCH { active:false }`,原样保留。
- **新增 `GET /api/agents/[id]/usage`**:返回 `{ sales: number, listings: number, appraisals: number }`(org 过滤、404),供确认弹窗显示。

### 2.3 边界与接受项

- 成员照片/主题曲文件不清理(存储留孤儿文件,接受,非目标)。
- 生日存于 agents 行,随行删除;goals 为组织级不受影响;TV 端若正在播被删成员的庆祝,播完即止。
- 删除有业绩的成员会直接影响榜单/记分卡数值(这正是需求语义,确认弹窗已示警)。

## 3. 测试

- 单元/集成:settings 7 键(refine、PUT 往返、旧 8 键行回落);seed deep-equal 自动钉;tv/state 响应不再含 `listings` 字段且 scorecard/榜单不受影响;pagination 删 `gridPageSize` 用例;agents DELETE 级联(三子表计数归零、成员行消失)、404、org 隔离、广播断言、staff 与 agent 均可删;usage 计数正确与 404。
- E2E:全量回归(现有 6 条,`SLIDE_TITLE_RE` 更新后应全绿),无需新用例。

## 4. 非目标

删除的软确认对话框组件化(用原生 `window.confirm`,与全仓现状一致);删除成员的存储文件清理;回收站/恢复机制;listings 数据或后台页的任何改动。

## 5. 成功标准

- TV 轮播 7 页无 Hot Listings,Settings 无该项;`npx tsc --noEmit` 零输出、vitest 全绿、E2E 6/6。
- Team 页删除按钮:确认弹窗含真实计数,确认后成员与其业绩从榜单/记分卡消失,TV 自动刷新。
