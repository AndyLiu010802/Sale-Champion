# TV 动画天际线背景(实时时间 + 真实天气)— 设计文档

- **日期**:2026-08-19
- **状态**:已与需求方确认(四问四答:TV 全部页面;城市天际线;背景压暗+面板半透;天气城市 Hobart)
- **基线**:main @ cc9436e 之上的增量,分支 feature/skyline-background

## 1. 需求

TV 端现有纯色暗底太单调。改为动画城市天际线背景:配色与光照随**真实系统时间**推移(清晨/上午/正午/黄金时刻/日落/夜晚),并按 **Hobart 当前真实天气**叠加特效(雨、风、雷、雪、阴/雾、晴夜星空)。应用于 TV 全部页面(轮播、配对码屏、离线态);数据可读性优先,背景压暗、面板半透。管理后台不变。

## 2. 场景渲染(SkylineBackground 组件)

- 新组件 `src/components/tv/SkylineBackground.tsx`(client,`<canvas>` 固定 inset-0 最底层 z-0,`pointer-events-none`;TV 内容层 z-10+)。
- 场景元素:天空线性渐变(顶→地平线)、太阳/月亮圆盘+径向光晕、星星(夜间,亮度随 star 系数)、慢速流云(2–5 朵椭圆簇)、两至三层进深的**城市楼群剪影**(伪随机固定种子生成楼宽/楼高/天线,层间颜色按深度插值)、**窗灯**(夜间渐次点亮、低频闪烁,日间熄灭)、地平线雾霭层、整体 vignette。
- 配色系统沿用需求方提供的参考实现思路:`KEYS` 关键帧数组(每帧含 skyTop/skyHor/sun/glow/楼层色×3/window/star/haze 等 rgb 与系数)+ 线性插值 `getPalette(t)`。关键帧:DAWN → MORNING → MIDDAY → GOLDEN HOUR → SUNSET → NIGHT。
- **时间驱动(无滑杆,纯自动)**:纯函数 `phaseFromClock(now, sunrise, sunset): number`(返回 0..1 的调色 t)。以当日日出/日落(来自天气接口)锚定:日出前后 ±45 分钟为 DAWN 段,正午区间 MIDDAY,日落前 ~1.5h 进 GOLDEN,日落 ±40 分钟 SUNSET,其余为 NIGHT;段内平滑插值,跨午夜连续。无日出日落数据时回落固定 06:30/19:00。太阳/月亮高度与水平位置由 t 推导(太阳白天弧线,月亮夜间弧线)。
- **性能约束**(电视浏览器):楼群剪影+窗灯底图绘制到**离屏 canvas 缓存**,仅在 resize 或调色阶段显著变化(t 步进阈值)时重绘;每帧只画天空/日月/星/云/粒子/闪电+贴底图;DPR 封顶 1.5;rAF 隔帧渲染(目标 ~30fps);粒子数封顶(雨 ≤300、雪 ≤150、星 ≤140);**庆祝/生日全屏播放期间暂停渲染循环**(TvApp 传 `paused` prop),恢复后继续。

## 3. 天气数据链路

- **新接口 `GET /api/tv/weather`**(无需鉴权——公开气象数据,与 TV 屏幕配对状态无关):服务端 fetch Open-Meteo(免费无密钥):
  `https://api.open-meteo.com/v1/forecast?latitude={LAT}&longitude={LON}&current=weather_code,wind_speed_10m,is_day&daily=sunrise,sunset&forecast_days=1&timezone=auto`
  坐标默认 **Hobart(-42.8794, 147.3294)**,可用环境变量 `WEATHER_LAT`/`WEATHER_LON` 覆盖(README 记录)。
- **服务端内存缓存 10 分钟**(globalThis 单例模式,与 db/hub 同款;多台 TV 只打一次上游);上游失败时返回上次成功缓存(带 `stale: true`),从未成功过则 503。
- 响应形状:`{ weatherCode: number, windSpeedKmh: number, isDay: boolean, sunrise: string, sunset: string }`(sunrise/sunset 为 ISO 本地时间字符串)。
- **TV 端每 10 分钟轮询**(TvApp 内 setInterval,与既有 refreshState 独立);失败沿用上次结果;从未成功过则按"晴"渲染并用回落日出日落——**天气链路任何故障都不影响数据展示**。

## 4. 天气 → 特效映射(纯函数)

`src/lib/scene/weather.ts`:`effectsFromWeather(code, windKmh): SceneEffects`,输出 `{ rain: 0|1|2|3, snow: 0|1, thunder: boolean, wind: 0|1|2, cloudiness: 0..1, fog: boolean }`。WMO 码映射:

| WMO 码 | 效果 |
|---|---|
| 0 | 晴(cloudiness 0.1;夜间星空全显) |
| 1–2 | 少云/多云(0.35 / 0.6) |
| 3 | 阴(0.9,配色去饱和压灰) |
| 45, 48 | 雾(fog=true,雾霭层加厚、能见度雾幕) |
| 51–57 | 毛毛雨(rain 1) |
| 61, 80 | 小雨(rain 1);63, 81 中雨(rain 2);65, 67, 82 大雨(rain 3) |
| 71–77, 85, 86 | 雪(snow 1,慢速雪花) |
| 95, 96, 99 | 雷暴(rain 3 + thunder=true) |

- **风**:`windKmh ≥ 30` → wind 1(云速 ×2、雨丝倾斜 ~12°);`≥ 50` → wind 2(云速 ×3.5、倾斜 ~22°)。
- **雷暴闪电**:随机间隔 6–18s 触发一次闪电序列(2–3 帧天空整体打亮 + 楼群边缘高亮 + 随机分叉闪电线),不发声。
- 雨/雪为全屏粒子(雨为短线段、雪为小圆点),强度决定数量与速度;rain>0 时云量强制 ≥0.7 且配色压灰。

## 5. 可读性(压暗 + 面板半透)

- 场景绘完后整体叠一层深色幕:`rgba(6,8,15,α)`,α 白天 0.45 / 夜间 0.35(随 t 插值),保证任何时段前景文字对比度。
- 各 TV 界面容器底色由纯色改**半透明深色 + backdrop-blur**:榜单行、记分卡汇总块与表格、目标卡、公告卡、配对码面板、页码角标、OFFLINE 徽标(具体类名以现状为准,计划阶段逐一列出)。霓虹描边/标题风格保留。
- 庆祝/生日全屏 overlay 不透明度不变(本就全屏覆盖)。

## 6. 结构

- `src/lib/scene/palette.ts`:KEYS 关键帧、`getPalette(t)`、`phaseFromClock(now, sunrise, sunset)`、`sunPosition(t)`——全部纯函数。
- `src/lib/scene/weather.ts`:`effectsFromWeather(code, windKmh)` 纯函数 + `SceneEffects` 类型。
- `src/app/api/tv/weather/route.ts`:上游 fetch + 10 分钟缓存 + stale 回落。
- `src/components/tv/SkylineBackground.tsx`:canvas 渲染器(消费 palette/effects,自带 rAF 循环与离屏缓存)。
- `TvApp.tsx`:挂载背景组件(所有分支:配对屏、轮播、离线)、天气轮询 state、celebration 期间 `paused`。
- README:功能说明 + `WEATHER_LAT`/`WEATHER_LON`。

## 7. 测试

- 单元:`phaseFromClock`(日出前/后、正午、日落前后、深夜跨午夜、无日出日落回落)、`getPalette` 边界(0/1/中段插值)、`effectsFromWeather` 全映射表 + 风阈值;weather 路由(mock global fetch:响应形状、二次调用命中缓存不再上游、上游失败返回 stale、从未成功 503)。
- canvas 绘制不做单测;`npm run build`;E2E 现有 6 条应全绿(canvas 在底层 pointer-events-none,文字断言不受影响)。

## 8. 非目标

屏幕上的天气图标/温度/时间显示;手动时间滑杆或调试面板;admin 页背景;按 TV 差异化配置;声音;多城市/按 org 配置天气(单坐标 env 级);历史天气。

## 9. 成功标准

- TV 全部页面呈现随真实时间变化的天际线背景;Hobart 实际下雨/大风/雷暴时对应特效出现;天气接口断网不影响任何数据展示。
- 数据面板半透明后文字对比度不降级(目视);vitest 全绿、build 成功、E2E 6/6。
