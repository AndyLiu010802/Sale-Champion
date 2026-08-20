# TV 背景换用 SVG 美术稿 — 设计文档

- **日期**:2026-08-20
- **状态**:已与需求方确认(三问三答:分层重新上色 / 云与水波换成可动的 / SVG 进 DOM)
- **基线**:main @ 9775b8c 之上的增量

## 1. 需求

现有程序化绘制的天际线背景「不够好看」。改用需求方提供的 SVG 美术稿,同时**保留全部动态特效**:按真实日出日落变化的时间光效、飘动的云、流动的水波,以及天气驱动的雨雪。

## 2. 素材

`public/scene/hobart.svg`(已生成,958 元素 / 13 个可寻址分组,88 KB)。

来源是需求方给的 SVG。其中**结构部分逐字保留**:山脊三层轮廓与等高线、`mountain-contours` 的柔光/阴影渐变、城市 16 座楼体与筒仓、塔斯曼桥的桥面三线与 12 组桥墩、码头棚屋/雨棚/桅杆、帆船、地平线亮带。

原稿另有三组共约 570 个元素是程序生成的纹理——山坡房屋点、水面碎光条、倒影。这三组改由**带固定种子的生成脚本**复刻同样的分布(`scripts/gen-scene.py`,种子 20260820)。该脚本是一次性的美术生成器,只为留存出处,CI 不运行——`public/scene/hobart.svg` 本身才是素材。这样做不只是为了缩小文件:碎光与倒影从钉死的矩形变成可寻址的子层,才谈得上让水面真正流动。

分组清单(全部是着色与动画的寻址单位):

```
sky · sky-clouds · mountains(内含 mountain-contours / mountain-contour-lines)
hillside-houses · water · water-sparkles · city · tasman-bridge
reflections · sailboat · foreground-ripples
```

## 3. 渲染架构

SVG 内联进 DOM,只留一小块 canvas 给粒子。

- `src/components/tv/SceneBackground.tsx` 取代 `SkylineBackground.tsx`。SVG 字符串经 `dangerouslySetInnerHTML` 注入——React 视之为**单个节点**,958 个元素不进 reconciliation。
- 底层 `fixed z-0`、`pointer-events-none`,与现状一致。
- **canvas 只画雨和雪**。300 个雨滴作为 DOM 元素太重,粒子系统本就属于 canvas;其余(云、水、星、日月)全部是 SVG 元素 + CSS 动画,走合成器,不触发重绘。

**删除**:`src/lib/scene/hobart/` 全部 7 个画师文件与 `geometry.ts`(约 1400 行)。

**保留不动**:`palette.ts`(6 关键帧 + `phaseFromClock` + `sunPosition` + `nightProgress`)、`weather.ts`、`weatherCache.ts`、`/api/tv/weather`。这套引擎继续当大脑,只是换了被它驱动的画布。

**搬家**:`windowLitSchedule` 从 `hobart/paint.ts` 移到 `src/lib/scene/windowLights.ts`,**行为与现有 10 条测试逐字不变**(白天基线、18–19 点 smoothstep 爬升、19–22 点峰值、22–23 点回落、23–05 点全黑、纯时钟)。

## 4. 上色系统

### 4.1 构建期:色槽归并

`scripts/build-scene.ts` 读 `public/scene/hobart.svg`,产出 `src/lib/scene/sceneSvg.ts`:

1. 按 `<g id>` 归属每个元素(嵌套分组取最内层;`<defs>` 里的渐变按 id 前缀归属——`mountainSoft*` 归 `mountains`,其余归 `sky`/`water`)。
2. 每组收集其全部字面色(`fill` / `stroke` / `stop-color`),按亮度聚成 2–4 个**色槽**。
3. 把字面色改写成 `var(--sNN)`,导出槽位清单 `{ id, group, lum }[]`。

产物是纯字符串 + 清单,无运行时解析开销。

### 4.2 运行时:槽位取色

`src/lib/scene/slots.ts` 的 `slotColors(palette, windowLit, fx)` 返回 `Record<slotId, string>`。

每组有一条由 `Palette` **现有字段**导出的色带,槽位按自己记录的亮度在色带上取值——原画的明暗层次因此完整保留:

| 分组 | 色带 |
|---|---|
| `sky` | `skyTop` → `skyHor` |
| `sky-clouds` | `haze` → `haze` 与 `skyTop` 的中点(云比雾霭亮一档) |
| `mountains` 及其子组 | `buildingFar` → `buildingNear` |
| `hillside-houses` | `window`,**逐元素**按 `windowLit` 做伯努利判定(不是整组透明度——见计划 Task 4 Step 5) |
| `city` 楼体 | `buildingNear` → `buildingMid` |
| `city` 窗户(源色 `#6B7476`) | `window`,同上逐元素判定 |
| `tasman-bridge` | `buildingMid` → `buildingNear` |
| `water` | `waterDeep` → `waterLight` |
| `water-sparkles` | `waterLight` → `skyHor` |
| `reflections` | `waterDeep` → `window`(倒影是灯光落在深水上) |
| `sailboat` | `buildingNear` → `buildingMid` |
| `foreground-ripples` | `waterLight` |

`Palette` 新增两个字段 `waterDeep` / `waterLight`,6 个关键帧各填 2 个值(共 12 个新数字)。不新造 13 组 × 6 帧的色表。

### 4.3 天气对颜色的影响(沿用现有 `scenePaint` 的行为)

以下三条是既有实现里已经调好的,必须在 `slotColors` 中逐条延续,并各有测试:

1. **阴天压灰**:云量越高,颜色槽越去饱和。
2. **云量抑制水面阳光反光**:高云量时水面的日照亮带减弱。
3. **灯光不被压灰**:`window` 系槽位保持暖色,不参与去饱和。

### 4.4 更新时机

相位跨过 `CACHE_T_STEP`(0.015)或 `windowLit` 跨过 `WINDOW_LIT_STEP`(0.02)才重算,一次约 40 次 `style.setProperty`。沿用现有两个阈值常量。

## 5. 动态层

| 层 | 动法 |
|---|---|
| `sky-clouds` | 每朵独立 `translateX`,速度各异、循环回绕;显示朵数由天气云量决定(2–8) |
| `water-sparkles` | 四种起伏曲线逐条随机 + 随机周期(8–18s)与负相位,**不横移**(2026-08-21 修订) |
| `foreground-ripples` | 两种起伏曲线逐条随机 + 随机周期(16–32s),幅度更浅,**不横移**(2026-08-21 修订) |
| `reflections` | 纵向轻微伸缩(倒影随波) |
| 星星 | `#stars` 组由 `scripts/gen-scene.py` 生成进 SVG(140 颗,只撒在山脊以上天区);夜间由 `palette.star` 控整组透明度,CSS 错开 `animation-delay` 闪烁 |
| 日 / 月 | `#celestial` 组由构建脚本注入(圆盘 + 径向光晕两个元素),`cx`/`cy` 每帧由现有 `sunPosition(t, nightT)` 写入 |
| 雨 / 雪 | canvas 覆盖层,沿用现有粒子上限(雨 300 / 雪 150)与 `MAX_DPR` 1.5 |

庆祝弹屏出现时整体暂停(沿用现有 `paused` 语义),避免与庆祝动画抢合成器。

**2026-08-21 修订(需求方目验后定稿):水面不做任何横向位移,只让每条线各自明暗起伏。**

原设计让碎光与波纹整组慢速左移。上电视之后读不出流向:碎光是长 28–166、高 2–4 的横条,
沿自身长轴平移几乎不产生运动线索(端点之外没有可跟踪的特征),8.3 单位/秒的速度下看得见的
只有透明度在跳,观感是"原地闪烁抖动"。两次修复(整组漂移代替逐元素漂移、图案严格周期化)
修的都是**循环接缝**,而现象根本不在接缝上,所以都没解决问题。

改法:横移整条取消,水面只做明暗起伏。每条线的基准亮度取原画自己的 `opacity`,构建期烧成
`--o`,keyframes 写 `calc(var(--o) * k)`;周期与负相位逐条随机(固定种子,产物可重现)。

**关键坑,别再踩:CSS 动画的 `opacity` 层叠优先级高于 SVG 的 `opacity` 表现属性。**
浏览器实测:`opacity="0.2"` 的元素被一条把 `opacity` 定在 1 的动画接管后,计算值就是 1。
早先的 `scene-breathe`(`.55 → 1`)因此把原画 0.16–0.54 的明暗层次整体压平、还整体提亮成
同一个值,配上只有 4 个相位桶、全体同一个 7s 周期,整片碎光是齐闪的——这是"抖动"的另一半
原因。基准亮度必须逐元素交给动画,不能写进 keyframes。

峰值系数 1.90 是对着电视观感定的:canvas 上层还压着 vignette 与 `rgba(6,8,15,~.4)` 的压暗幕,
照原画 `opacity` 原样起伏(峰值 1.0)在电视上会闷掉。横移取消后,为无缝循环准备的"右移一个
画幅副本"一并删除,内联 SVG 从 1435 个元素降到 1100 个。

**同日第二轮(需求方目验:"闪烁的缓慢点,水波不是疯狂固定频率闪烁的"):**

第一版只随机了周期(碎光 2.4–6.4s)。不够——**每条线自己仍旧是等间隔脉动**,一条线四秒一个
来回,盯着看就是节拍器,整片读出来是频闪。两处一起改:

1. 周期整体拉长:碎光 8–18s,长波纹 16–32s。单次起伏本身要好几秒才像水。
2. **曲线形状也逐条随机**:`scene-shimmer-1..4` 与 `scene-undulate-1..2` 六条,闪法各不相同
   ——慢慢涨上去 / 先快闪一下再安静大半个周期 / 一亮一暗两次。曲线 + 周期 + 相位三样都随机
   之后,同一条线的节拍本身就不规则了。基线定在原画 `opacity` 的 .85 倍上下,亮起来到 1.9 倍。

曲线名同时出现在 `scripts/build-scene.ts`(`SPARKLE_CURVES`/`RIPPLE_CURVES`)与 `globals.css`,
**改一处漏一处不会报错**:对不上的 `animation-name` 静默不跑,元素就停在原画的 opacity 上,
画面只是"不动了"。测试里有一条逐个核对(`declares every curve the markup asks for`)。

## 6. 画幅

SVG viewBox 是 `0 0 1832 859`(2.13:1),电视多为 16:9。用 `preserveAspectRatio="xMidYMid slice"` 铺满裁切,左右各裁约 8%——左端是城市、右端是桥,两头都会少一点。

**已定(2026-08-20,需求方看过 1920×1080 实拍后确认):居中裁切 `xMidYMid slice`,不再调整。**

三档锚点的取舍(要素横向位置:城市 0–1030、筒仓 245–336、码头帆船群 30–975、塔斯曼桥 1045–1832、海上帆船 1518–1614):居中左右各切 152,损失落在左边缘几栋楼与桥最远端的桥墩上,没有标志性元素被切残;左对齐会把海上帆船切掉一半;右对齐会削掉筒仓那栋条纹楼一角。

## 7. 性能与退路

需求方未确认电视的具体设备。收尾门禁加一条**真机验证**。

若 960 个 DOM 元素叠 `backdrop-filter` 玻璃面板在目标设备上掉帧,退路是:把**静态分组**(mountains / city / tasman-bridge / sailboat)在色相跨档时预光栅化成一张离屏位图,只把动态分组(sky-clouds / water-sparkles / reflections / foreground-ripples / stars / celestial)留在 DOM。分组边界已经是现成的,退路不需要返工上色系统。

## 8. 测试

- **保留**:`windowLitSchedule` 的 10 条测试原样迁到新路径。
- **改写**:`scenePaint` 的 9 条测试改为 `slotColors` 的等价断言——关键帧取色、远近明暗次序、昼夜灯光开关、跨帧插值、t 越界钳制,以及 §4.3 的三条天气行为。
- **新增**:构建脚本的色槽归并(同组同亮度归一槽、跨组不混槽)、槽位清单与 SVG 里 `var(--sNN)` 引用一一对应、`sceneSvg.ts` 与 `public/scene/hobart.svg` 保持同步(重跑构建比对)。
- **删除**:`geometry contract` 的 3 条(几何契约随画师一起移除);`mulberry32` 因雨雪粒子仍需保留,其确定性测试一并保留。
- **截图目验**:6 个关键帧 × 晴/雨/雪,外加 16:9 裁切构图。
- E2E 现有 6 条保持全绿(TV 轮播与庆祝不受背景实现影响)。

## 9. 非目标

视差滚动;鼠标/陀螺仪交互;昼夜以外的季节变化;真实船只/车流动画;背景可配置或多套主题;把美术稿做成可视化编辑器。

## 10. 成功标准

TV 背景是这张 SVG 美术稿;一天之内颜色随真实日出日落连续变化,夜里山坡亮起灯火、城市窗户点亮、月亮升起;云在飘、水面在动;天气为雨/雪时有对应粒子;16:9 裁切构图经需求方确认;真机不掉帧;vitest 与 E2E 全绿。
