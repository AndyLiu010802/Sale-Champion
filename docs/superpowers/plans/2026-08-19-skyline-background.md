# TV 动画天际线背景(实时时间 + 真实天气)Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** TV 全部页面(轮播、配对码屏、离线态)渲染一个 `<canvas>` 动画城市天际线背景:配色随**真实系统时间**推移(DAWN → MORNING → MIDDAY → GOLDEN → SUNSET → NIGHT,以当日日出/日落锚定),并按 **Hobart 实时天气**(Open-Meteo,免费无密钥)叠加雨/雪/雷暴闪电/风/雾/云/星空特效;数据可读性优先——背景整体压暗、各数据面板改半透明深色 + backdrop-blur。管理后台不变。

**Architecture:** 三层结构,依赖单向:①**纯函数层** `src/lib/scene/`——`palette.ts`(六关键帧 KEYS + `getPalette(t)` 线性插值 + `phaseFromClock` 时钟→调色相位 + `sunPosition`/`nightProgress` 日月弧线)与 `weather.ts`(WMO 码→`SceneEffects` 映射),零 DOM、全部单测;②**数据链路**——`GET /api/tv/weather`(无鉴权,服务端 fetch Open-Meteo + globalThis 10 分钟内存缓存 + 失败 stale 回落 + 从未成功 503;缓存逻辑放 `src/lib/scene/weatherCache.ts`,因为 Next 15 route 文件禁止导出 handler 以外的符号,`resetWeatherCache` 测试助手进不了 route.ts),TvApp 每 10 分钟轮询、失败沿用上次、与既有 refreshState/WS 完全独立;③**渲染层** `SkylineBackground.tsx`(client 组件,fixed inset-0 z-0 pointer-events-none,自带 rAF 循环:DPR 封顶 1.5、隔帧 ~30fps、楼群+窗灯离屏 canvas 缓存仅在 resize/调色相位跨步进/闪烁纪元变化时重绘、粒子封顶雨 300/雪 150/星 140、庆祝全屏播放期间 `paused` 停循环)。TV 内容层统一提 z-10;天气链路任何故障都不影响数据展示(null → 按"晴"+ 回落日出日落 06:30/19:00 渲染)。

**Tech Stack:** 与主项目一致(Next.js 15 / React 19 / Canvas 2D / Tailwind 3.4 / Vitest / Playwright),零新依赖、零迁移(不动 schema、不动 settings)。

**执行约定:**
- 基线:分支 `feature/skyline-background`(**已存在且已检出**,HEAD `03e510d` = 规格提交,落在 main 合并提交 `cc9436e` 之上)。开工前确认:
  ```bash
  git rev-parse --abbrev-ref HEAD
  git status
  ```
  预期:输出 `feature/skyline-background`;工作区干净(本计划文档已提交)。
- 基线测试数(已实测):`npx vitest run` → **22 files / 297 tests 全绿**(约 98s);E2E `npm run test:e2e` → **6 passed**(约 8–10 分钟,offline 用例自身要 3–4 分钟)。**E2E 全量只在 Task 3 收尾跑一次**(canvas 在最底层且 pointer-events-none,六条用例全部是文字/角色断言,无截图、无背景色断言——已逐条核对 `e2e/tv-flow.spec.ts`,预期零改动通过)。
- 按 Task 1→2→3 顺序执行,每个 Task 结束时 `npx tsc --noEmit` 零输出、全量 vitest 全绿、有独立 commit;Task 2/3 另加 `npm run build` 门禁(canvas 组件无单测,build 是它的编译级门禁)。
- 规格(权威需求):`docs/superpowers/specs/2026-08-19-skyline-background-design.md`。
- 所有命令在项目根 `C:\Users\andyl\Desktop\工作文档\TV SaaS` 执行(均为跨平台 `npx`/`npm` 形式,PowerShell 可直接用;git add 时含 `[id]`/`(dashboard)` 等特殊字符的路径**必须加双引号**——本计划涉及的路径没有,但 e2e/回归修复若碰到须遵守)。
- `phaseFromClock` 契约(锚点全部精确定义,测试钉死):输入 `(now: Date, sunrise?: string, sunset?: string)`,sunrise/sunset 为 Open-Meteo `timezone=auto` 返回的 ISO 本地时间字符串;输出 0..1。锚点:日出−45m → t=0(DAWN),日出+45m → t=0.28(MORNING 起点),日照中点 (sunrise+sunset)/2 → t=0.5(MIDDAY),日落−90m → t=0.68(GOLDEN),日落 → t=0.84(SUNSET),日落+40m → t=1.0 进夜;锚点间线性插值;夜间(含跨午夜到次日日出−45m)恒 1.0。无参/解析失败回落 06:30/19:00。夜间月亮位置不由 t 推(t 恒 1),由 `nightProgress(now, sunrise, sunset)`(0..1,日落+40m → 次日日出−45m)另推——这是 spec §6 四个导出之外的必要补充。
- KEYS 六关键帧的 rgb 数值在 Task 1 里**全部写死**(以需求方参考实现(海洋版)的天空/太阳/光晕值为起点改造为城市版:楼层色三档、窗灯暖黄 [255,196,120]),不留"自行调整"。
- 天气路由**无鉴权**(spec §3 明确:公开气象数据);上游 URL 逐字取自 spec §3;响应沿用本仓 `{ data }` 包裹约定,stale 时顶层加 `stale: true`。
- TvApp 层级现状(已读清):页码角标 `fixed … z-40`、OfflineBadge `fixed … z-40`、StartOverlay `fixed inset-0 z-50`、CelebrationOverlay `fixed inset-0 z-50`、PairingScreen `fixed inset-0`(无 z,Task 2 提 z-10 并去掉不透明 `bg-bg`)、轮播内容 motion.div(无 z,Task 2 提 `relative z-10`)。背景 canvas z-0 垫底后所有既有层都在其上。

---
### Task 1: 场景纯函数层 + 天气接口(设计 §3/§4/§6)

**Files:**
- Create: `src/lib/scene/palette.ts`(KEYS 六关键帧、`getPalette`、`phaseFromClock`、`nightProgress`、`sunPosition`——全部纯函数)
- Create: `src/lib/scene/weather.ts`(`effectsFromWeather` + `SceneEffects`)
- Create: `src/lib/scene/weatherCache.ts`(上游 fetch + globalThis 10 分钟缓存 + stale 回落 + `resetWeatherCache` 测试助手)
- Create: `src/app/api/tv/weather/route.ts`(GET,无鉴权,只包装 weatherCache)
- Modify: `src/lib/types.ts`(新增 `TvWeather` 响应类型)
- Test: `tests/scene/palette.test.ts`(新建,14 用例)
- Test: `tests/scene/weather.test.ts`(新建,11 用例)
- Test: `tests/api/weather.test.ts`(新建,7 用例)

- [ ] **Step 1: 写失败测试(三个新文件,完整内容)**

  ① 创建 `tests/scene/palette.test.ts`:

  ```ts
  import { describe, expect, it } from 'vitest';
  import { KEYS, getPalette, nightProgress, phaseFromClock, sunPosition } from '@/lib/scene/palette';

  /** 本地时间构造:phaseFromClock/nightProgress 只读 now 的本地时分秒。 */
  function at(hours: number, minutes: number): Date {
    return new Date(2026, 7, 19, hours, minutes, 0);
  }

  describe('KEYS / getPalette', () => {
    it('has six keyframes DAWN→NIGHT at fixed t stops', () => {
      expect(KEYS.map((k) => k.name)).toEqual(['DAWN', 'MORNING', 'MIDDAY', 'GOLDEN', 'SUNSET', 'NIGHT']);
      expect(KEYS.map((k) => k.t)).toEqual([0, 0.28, 0.5, 0.68, 0.84, 1]);
    });

    it('t=0 returns the DAWN frame verbatim', () => {
      expect(getPalette(0)).toEqual(KEYS[0].p);
    });

    it('t=1 returns the NIGHT frame verbatim', () => {
      expect(getPalette(1)).toEqual(KEYS[5].p);
    });

    it('clamps t outside 0..1', () => {
      expect(getPalette(-0.7)).toEqual(KEYS[0].p);
      expect(getPalette(1.7)).toEqual(KEYS[5].p);
    });

    it('midway between two frames every channel is the arithmetic mean', () => {
      const mid = getPalette(0.14); // DAWN(t=0)与 MORNING(t=0.28)的中点
      const a = KEYS[0].p;
      const b = KEYS[1].p;
      for (let c = 0; c < 3; c++) {
        expect(mid.skyTop[c]).toBeCloseTo((a.skyTop[c] + b.skyTop[c]) / 2, 6);
        expect(mid.buildingNear[c]).toBeCloseTo((a.buildingNear[c] + b.buildingNear[c]) / 2, 6);
      }
      expect(mid.windowLit).toBeCloseTo((a.windowLit + b.windowLit) / 2, 6);
      expect(mid.star).toBeCloseTo((a.star + b.star) / 2, 6);
      expect(mid.dim).toBeCloseTo((a.dim + b.dim) / 2, 6);
    });
  });

  describe('phaseFromClock', () => {
    // 回落锚点(无日出日落,设计 §2:06:30/19:00)→
    // DAWN 05:45(t=0)→ MORNING 07:15(0.28)→ 日照中点 12:45(0.5)
    // → GOLDEN 17:30(0.68)→ SUNSET 19:00(0.84)→ NIGHT 19:40(1.0)
    it('falls back to 06:30/19:00 anchors without sunrise/sunset', () => {
      expect(phaseFromClock(at(5, 45))).toBeCloseTo(0, 6);
      expect(phaseFromClock(at(7, 15))).toBeCloseTo(0.28, 6);
      expect(phaseFromClock(at(12, 45))).toBeCloseTo(0.5, 6);
      expect(phaseFromClock(at(17, 30))).toBeCloseTo(0.68, 6);
      expect(phaseFromClock(at(19, 0))).toBeCloseTo(0.84, 6);
      expect(phaseFromClock(at(19, 40))).toBeCloseTo(1, 6);
    });

    it('interpolates inside a segment (sunrise 06:30 sits mid-DAWN)', () => {
      expect(phaseFromClock(at(6, 30))).toBeCloseTo(0.14, 6);
    });

    it('holds t=1 through the whole night, across midnight', () => {
      expect(phaseFromClock(at(23, 0))).toBe(1);
      expect(phaseFromClock(at(0, 0))).toBe(1);
      expect(phaseFromClock(at(3, 0))).toBe(1);
      expect(phaseFromClock(at(5, 0))).toBe(1); // 日出前(锚点 05:45 之前)仍是夜
    });

    it('anchors on real sunrise/sunset ISO strings (Hobart winter-ish)', () => {
      const sunrise = '2026-08-19T07:10';
      const sunset = '2026-08-19T17:20';
      expect(phaseFromClock(at(6, 25), sunrise, sunset)).toBeCloseTo(0, 6); // 07:10−45m
      expect(phaseFromClock(at(7, 55), sunrise, sunset)).toBeCloseTo(0.28, 6); // 07:10+45m
      expect(phaseFromClock(at(12, 15), sunrise, sunset)).toBeCloseTo(0.5, 6); // 日照中点
      expect(phaseFromClock(at(15, 50), sunrise, sunset)).toBeCloseTo(0.68, 6); // 17:20−90m
      expect(phaseFromClock(at(17, 20), sunrise, sunset)).toBeCloseTo(0.84, 6);
      expect(phaseFromClock(at(18, 0), sunrise, sunset)).toBeCloseTo(1, 6); // 17:20+40m 进夜
      expect(phaseFromClock(at(21, 0), sunrise, sunset)).toBe(1);
    });

    it('falls back to defaults on unparseable ISO strings', () => {
      expect(phaseFromClock(at(12, 45), 'not-a-date', 'garbage')).toBeCloseTo(0.5, 6);
    });
  });

  describe('sunPosition / nightProgress', () => {
    it('daytime returns the sun on an arc (high near t=0.5)', () => {
      const noon = sunPosition(0.5);
      expect(noon.kind).toBe('sun');
      expect(noon.y).toBeLessThan(0.2);
      expect(noon.x).toBeGreaterThan(0.4);
      expect(noon.x).toBeLessThan(0.65);
    });

    it('the sun sits below the horizon at the very start of DAWN', () => {
      expect(sunPosition(0).y).toBeGreaterThan(1);
    });

    it('night returns the moon, positioned by nightT', () => {
      const mid = sunPosition(1, 0.5);
      expect(mid.kind).toBe('moon');
      expect(mid.x).toBeCloseTo(0.5, 6);
      expect(mid.y).toBeCloseTo(0.25, 6);
      expect(sunPosition(1, 0).y).toBeCloseTo(1, 6);
    });

    it('nightProgress walks 0→1 from sunset+40m to sunrise−45m across midnight', () => {
      // 回落锚点:夜 = 19:40 → 次日 05:45(时长 605 分钟)
      expect(nightProgress(at(19, 40))).toBeCloseTo(0, 6);
      expect(nightProgress(at(0, 0))).toBeCloseTo(260 / 605, 6);
      expect(nightProgress(at(5, 45))).toBeCloseTo(1, 6);
    });
  });
  ```

  ② 创建 `tests/scene/weather.test.ts`:

  ```ts
  import { describe, expect, it } from 'vitest';
  import { effectsFromWeather } from '@/lib/scene/weather';

  describe('effectsFromWeather', () => {
    it('clear sky (0): faint clouds, nothing else', () => {
      expect(effectsFromWeather(0, 0)).toEqual({
        rain: 0, snow: 0, thunder: false, wind: 0, cloudiness: 0.1, fog: false,
      });
    });

    it('partly cloudy (1/2): 0.35 / 0.6', () => {
      expect(effectsFromWeather(1, 0).cloudiness).toBe(0.35);
      expect(effectsFromWeather(2, 0).cloudiness).toBe(0.6);
    });

    it('overcast (3): 0.9', () => {
      expect(effectsFromWeather(3, 0).cloudiness).toBe(0.9);
    });

    it('fog (45/48): fog flag, no rain', () => {
      for (const code of [45, 48]) {
        const fx = effectsFromWeather(code, 0);
        expect(fx.fog).toBe(true);
        expect(fx.rain).toBe(0);
        expect(fx.cloudiness).toBe(0.85);
      }
    });

    it('drizzle (51–57): rain 1', () => {
      for (const code of [51, 53, 55, 56, 57]) {
        expect(effectsFromWeather(code, 0).rain).toBe(1);
      }
    });

    it('rain tiers: 61/80 → 1, 63/81 → 2, 65/67/82 → 3', () => {
      for (const code of [61, 80]) expect(effectsFromWeather(code, 0).rain).toBe(1);
      for (const code of [63, 81]) expect(effectsFromWeather(code, 0).rain).toBe(2);
      for (const code of [65, 67, 82]) expect(effectsFromWeather(code, 0).rain).toBe(3);
    });

    it('any rain forces cloudiness ≥ 0.7 (设计 §4)', () => {
      for (const code of [51, 61, 63, 65, 80, 81, 82, 95]) {
        expect(effectsFromWeather(code, 0).cloudiness).toBeGreaterThanOrEqual(0.7);
      }
    });

    it('snow (71–77, 85, 86): snow 1, no rain', () => {
      for (const code of [71, 73, 75, 77, 85, 86]) {
        const fx = effectsFromWeather(code, 0);
        expect(fx.snow).toBe(1);
        expect(fx.rain).toBe(0);
      }
    });

    it('thunderstorm (95/96/99): rain 3 + thunder', () => {
      for (const code of [95, 96, 99]) {
        const fx = effectsFromWeather(code, 0);
        expect(fx.rain).toBe(3);
        expect(fx.thunder).toBe(true);
      }
    });

    it('wind thresholds: <30 → 0, 30–49.9 → 1, ≥50 → 2 (km/h)', () => {
      expect(effectsFromWeather(0, 0).wind).toBe(0);
      expect(effectsFromWeather(0, 29.9).wind).toBe(0);
      expect(effectsFromWeather(0, 30).wind).toBe(1);
      expect(effectsFromWeather(0, 49.9).wind).toBe(1);
      expect(effectsFromWeather(0, 50).wind).toBe(2);
      expect(effectsFromWeather(0, 90).wind).toBe(2);
    });

    it('unlisted codes fall back to neutral clouds only', () => {
      expect(effectsFromWeather(40, 0)).toEqual({
        rain: 0, snow: 0, thunder: false, wind: 0, cloudiness: 0.5, fog: false,
      });
    });
  });
  ```

  ③ 创建 `tests/api/weather.test.ts`(`vi.stubGlobal` mock 全局 fetch;时间注入走 `getWeather(nowMs)` 参数,缓存清理走 `resetWeatherCache`——globalThis 单例与 db/hub 的 `resetDb`/`resetHub` 同款):

  ```ts
  import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
  import { GET } from '@/app/api/tv/weather/route';
  import { WEATHER_TTL_MS, getWeather, resetWeatherCache } from '@/lib/scene/weatherCache';

  const upstreamJson = {
    current: { weather_code: 61, wind_speed_10m: 31.4, is_day: 1 },
    daily: { sunrise: ['2026-08-19T07:10'], sunset: ['2026-08-19T17:20'] },
  };

  const expectedPayload = {
    weatherCode: 61,
    windSpeedKmh: 31.4,
    isDay: true,
    sunrise: '2026-08-19T07:10',
    sunset: '2026-08-19T17:20',
  };

  function okUpstream() {
    return Promise.resolve({ ok: true, json: () => Promise.resolve(upstreamJson) } as Response);
  }

  describe('GET /api/tv/weather', () => {
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      resetWeatherCache();
      fetchMock = vi.fn(okUpstream);
      vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
      vi.unstubAllGlobals();
      resetWeatherCache();
    });

    it('maps the Open-Meteo response to the TvWeather shape', async () => {
      const res = await GET();
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ data: expectedPayload });
      // 上游 URL 逐字(设计 §3;默认 Hobart 坐标)。
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.open-meteo.com/v1/forecast?latitude=-42.8794&longitude=147.3294&current=weather_code,wind_speed_10m,is_day&daily=sunrise,sunset&forecast_days=1&timezone=auto',
      );
    });

    it('honours WEATHER_LAT/WEATHER_LON overrides', async () => {
      process.env.WEATHER_LAT = '-33.8688';
      process.env.WEATHER_LON = '151.2093';
      try {
        await GET();
        expect(fetchMock).toHaveBeenCalledWith(
          'https://api.open-meteo.com/v1/forecast?latitude=-33.8688&longitude=151.2093&current=weather_code,wind_speed_10m,is_day&daily=sunrise,sunset&forecast_days=1&timezone=auto',
        );
      } finally {
        delete process.env.WEATHER_LAT;
        delete process.env.WEATHER_LON;
      }
    });

    it('serves the second request within 10 minutes from cache (single upstream hit)', async () => {
      await GET();
      const res = await GET();
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ data: expectedPayload });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('refetches after the TTL expires (time injected at the lib level)', async () => {
      expect(await getWeather(0)).toEqual({ payload: expectedPayload, stale: false });
      expect(await getWeather(WEATHER_TTL_MS - 1)).toEqual({ payload: expectedPayload, stale: false });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(await getWeather(WEATHER_TTL_MS)).toEqual({ payload: expectedPayload, stale: false });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('falls back to the last good payload with stale: true when upstream fails', async () => {
      // 先成功一次(fetchedAt=0,相对路由内的真实 Date.now() 必然已过期)……
      expect(await getWeather(0)).toEqual({ payload: expectedPayload, stale: false });
      // ……再让上游挂掉:路由必须回上次成功值并打 stale 标(设计 §3)。
      fetchMock.mockRejectedValue(new Error('network down'));
      const res = await GET();
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ data: expectedPayload, stale: true });
    });

    it('returns 503 when upstream has never succeeded', async () => {
      fetchMock.mockRejectedValue(new Error('network down'));
      const res = await GET();
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({ error: 'Weather unavailable' });
    });

    it('treats a non-2xx upstream as failure (503 without cache)', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 500 } as Response);
      const res = await GET();
      expect(res.status).toBe(503);
    });
  });
  ```

- [ ] **Step 2: 运行确认失败**

  ```bash
  npx vitest run tests/scene/palette.test.ts tests/scene/weather.test.ts tests/api/weather.test.ts
  ```

  预期:三个文件**整文件加载失败**(`Failed to resolve import "@/lib/scene/palette"` / `"@/lib/scene/weather"` / `"@/lib/scene/weatherCache"`——模块尚不存在)。

- [ ] **Step 3: 实现(五个文件,完整内容)**

  ① 修改 `src/lib/types.ts`。找到(文件末尾的整个类型):

  ```ts
  export type TvStateResponse = {
    screen: TvScreenInfo;
    settings: SettingsData;
    leaderboards: Record<Metric, LeaderboardEntry[]>;  // all three metrics
    goals: GoalProgress[];                              // active only
    announcements: TvAnnouncement[];                    // enabled only, sortOrder asc
    scorecard: ScorecardData;                           // 设计 §5:全指标 0 不成行,gciCents desc
    scorecardYtd: ScorecardData;                        // 设计 §7b:澳洲财年 to-date,同一形状
    periodLabel: string;                                // periodLabel(settings.leaderboardPeriod, now)
    fyLabel: string;                                    // fyLabel(now),如 'FY 2026–27'
  };
  ```

  替换为(原样保留 + 追加 TvWeather):

  ```ts
  export type TvStateResponse = {
    screen: TvScreenInfo;
    settings: SettingsData;
    leaderboards: Record<Metric, LeaderboardEntry[]>;  // all three metrics
    goals: GoalProgress[];                              // active only
    announcements: TvAnnouncement[];                    // enabled only, sortOrder asc
    scorecard: ScorecardData;                           // 设计 §5:全指标 0 不成行,gciCents desc
    scorecardYtd: ScorecardData;                        // 设计 §7b:澳洲财年 to-date,同一形状
    periodLabel: string;                                // periodLabel(settings.leaderboardPeriod, now)
    fyLabel: string;                                    // fyLabel(now),如 'FY 2026–27'
  };

  /** GET /api/tv/weather 的响应形状(天际线背景设计 §3)。
   *  sunrise/sunset 为 Open-Meteo `timezone=auto` 返回的 ISO 本地时间字符串。 */
  export type TvWeather = {
    weatherCode: number;   // WMO 天气码
    windSpeedKmh: number;  // 10m 风速,km/h
    isDay: boolean;
    sunrise: string;       // 如 '2026-08-19T07:10'
    sunset: string;
  };
  ```

  ② 创建 `src/lib/scene/palette.ts`(整文件):

  ```ts
  // TV 天际线背景的配色系统(天际线设计 §2):KEYS 关键帧 + 线性插值。全部纯函数,零 DOM。
  //
  // t(0..1)是"一天的调色相位",由 phaseFromClock 从真实时钟与日出日落推出:
  //   0    DAWN    日出前 45 分钟(黎明前深蓝;与 NIGHT 相近,夜→晨切换不跳变)
  //   0.28 MORNING 日出后 45 分钟(清晨蓝天)
  //   0.5  MIDDAY  日照中点(正午高蓝)
  //   0.68 GOLDEN  日落前 90 分钟(金色时刻)
  //   0.84 SUNSET  日落时刻(橙红)
  //   1    NIGHT   日落后 40 分钟起整夜恒定(月亮位置由 nightProgress 另推)

  export type Rgb = [number, number, number];

  export type Palette = {
    skyTop: Rgb;       // 天空渐变顶色
    skyHor: Rgb;       // 天空渐变地平线色
    sun: Rgb;          // 太阳圆盘色(NIGHT 帧 = 月亮色)
    glow: Rgb;         // 日/月径向光晕色
    buildingFar: Rgb;  // 楼群三档:远(最浅,进深感)
    buildingMid: Rgb;  //           中
    buildingNear: Rgb; //           近(最深,前景剪影)
    window: Rgb;       // 窗灯暖黄(全帧同色,亮度由 windowLit 控)
    windowLit: number; // 0..1 点亮窗户比例(夜间渐次点亮、日间熄灭)
    star: number;      // 0..1 星星亮度系数
    haze: Rgb;         // 地平线雾霭色
    hazeAlpha: number; // 雾霭不透明度
    dim: number;       // 整体压暗幕 rgba(6,8,15,dim)(设计 §5:白天 0.45 → 夜 0.35)
  };

  export type PaletteKey = { t: number; name: string; p: Palette };

  // 六关键帧(城市版,自海洋版参考实现的天空/太阳/光晕值改造;数值写死,不留调参项)。
  export const KEYS: PaletteKey[] = [
    {
      t: 0,
      name: 'DAWN',
      p: {
        skyTop: [18, 24, 58], skyHor: [96, 62, 78],
        sun: [255, 178, 128], glow: [255, 140, 100],
        buildingFar: [36, 38, 60], buildingMid: [26, 28, 46], buildingNear: [16, 17, 30],
        window: [255, 196, 120], windowLit: 0.5,
        star: 0.35,
        haze: [70, 60, 90], hazeAlpha: 0.35,
        dim: 0.38,
      },
    },
    {
      t: 0.28,
      name: 'MORNING',
      p: {
        skyTop: [92, 148, 210], skyHor: [178, 208, 232],
        sun: [255, 238, 200], glow: [255, 220, 160],
        buildingFar: [88, 108, 138], buildingMid: [62, 78, 106], buildingNear: [38, 48, 70],
        window: [255, 196, 120], windowLit: 0.06,
        star: 0,
        haze: [170, 195, 220], hazeAlpha: 0.22,
        dim: 0.45,
      },
    },
    {
      t: 0.5,
      name: 'MIDDAY',
      p: {
        skyTop: [58, 128, 214], skyHor: [150, 200, 240],
        sun: [255, 250, 235], glow: [255, 244, 214],
        buildingFar: [96, 118, 148], buildingMid: [66, 84, 112], buildingNear: [40, 52, 74],
        window: [255, 196, 120], windowLit: 0.03,
        star: 0,
        haze: [160, 190, 220], hazeAlpha: 0.16,
        dim: 0.45,
      },
    },
    {
      t: 0.68,
      name: 'GOLDEN',
      p: {
        skyTop: [80, 110, 178], skyHor: [244, 176, 96],
        sun: [255, 214, 130], glow: [255, 176, 90],
        buildingFar: [96, 92, 120], buildingMid: [64, 62, 90], buildingNear: [38, 38, 58],
        window: [255, 196, 120], windowLit: 0.15,
        star: 0,
        haze: [220, 160, 110], hazeAlpha: 0.24,
        dim: 0.44,
      },
    },
    {
      t: 0.84,
      name: 'SUNSET',
      p: {
        skyTop: [46, 46, 100], skyHor: [246, 118, 74],
        sun: [255, 132, 74], glow: [255, 96, 60],
        buildingFar: [58, 48, 84], buildingMid: [40, 33, 60], buildingNear: [24, 20, 40],
        window: [255, 196, 120], windowLit: 0.55,
        star: 0.08,
        haze: [150, 90, 100], hazeAlpha: 0.3,
        dim: 0.4,
      },
    },
    {
      t: 1,
      name: 'NIGHT',
      p: {
        skyTop: [8, 12, 32], skyHor: [30, 38, 72],
        sun: [230, 236, 250], glow: [180, 200, 235],
        buildingFar: [24, 28, 50], buildingMid: [16, 19, 36], buildingNear: [9, 11, 22],
        window: [255, 196, 120], windowLit: 0.85,
        star: 1,
        haze: [40, 50, 85], hazeAlpha: 0.28,
        dim: 0.35,
      },
    },
  ];

  export function clamp01(v: number): number {
    return Math.min(1, Math.max(0, v));
  }

  function lerp(a: number, b: number, u: number): number {
    return a + (b - a) * u;
  }

  function lerpRgb(a: Rgb, b: Rgb, u: number): Rgb {
    return [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)];
  }

  /** 关键帧线性插值;t 越界钳制到 0..1。 */
  export function getPalette(t: number): Palette {
    const tc = clamp01(t);
    let i = 0;
    while (i < KEYS.length - 2 && tc > KEYS[i + 1].t) i++;
    const a = KEYS[i];
    const b = KEYS[i + 1];
    const u = b.t === a.t ? 0 : clamp01((tc - a.t) / (b.t - a.t));
    const pa = a.p;
    const pb = b.p;
    return {
      skyTop: lerpRgb(pa.skyTop, pb.skyTop, u),
      skyHor: lerpRgb(pa.skyHor, pb.skyHor, u),
      sun: lerpRgb(pa.sun, pb.sun, u),
      glow: lerpRgb(pa.glow, pb.glow, u),
      buildingFar: lerpRgb(pa.buildingFar, pb.buildingFar, u),
      buildingMid: lerpRgb(pa.buildingMid, pb.buildingMid, u),
      buildingNear: lerpRgb(pa.buildingNear, pb.buildingNear, u),
      window: lerpRgb(pa.window, pb.window, u),
      windowLit: lerp(pa.windowLit, pb.windowLit, u),
      star: lerp(pa.star, pb.star, u),
      haze: lerpRgb(pa.haze, pb.haze, u),
      hazeAlpha: lerp(pa.hazeAlpha, pb.hazeAlpha, u),
      dim: lerp(pa.dim, pb.dim, u),
    };
  }

  const MIN_PER_DAY = 1440;
  const DEFAULT_SUNRISE_MIN = 6 * 60 + 30; // 06:30(设计 §2 回落)
  const DEFAULT_SUNSET_MIN = 19 * 60;      // 19:00

  /** ISO 本地时间字符串 → 当日分钟数;缺失/解析失败回落。 */
  function parseMinutes(iso: string | undefined, fallback: number): number {
    if (!iso) return fallback;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return fallback;
    return d.getHours() * 60 + d.getMinutes();
  }

  /**
   * 真实时钟 → 调色相位 t(0..1)。锚点(契约,测试钉死):
   * 日出−45m → 0;日出+45m → 0.28;日照中点 (sr+ss)/2 → 0.5;
   * 日落−90m → 0.68;日落 → 0.84;日落+40m → 1;其余(整夜,跨午夜)恒 1。
   * 锚点间线性插值;无参/解析失败回落 06:30/19:00。
   */
  export function phaseFromClock(now: Date, sunrise?: string, sunset?: string): number {
    const sr = parseMinutes(sunrise, DEFAULT_SUNRISE_MIN);
    const ss = parseMinutes(sunset, DEFAULT_SUNSET_MIN);
    const m = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
    const anchors: [number, number][] = [
      [sr - 45, 0],
      [sr + 45, 0.28],
      [(sr + ss) / 2, 0.5],
      [ss - 90, 0.68],
      [ss, 0.84],
      [ss + 40, 1],
    ];
    // 锚点必须严格递增(Hobart 全年日照远超所需最短白昼);异常数据当夜处理。
    for (let i = 1; i < anchors.length; i++) {
      if (anchors[i][0] <= anchors[i - 1][0]) return 1;
    }
    if (m < anchors[0][0] || m >= anchors[anchors.length - 1][0]) return 1;
    for (let i = 1; i < anchors.length; i++) {
      const [m0, t0] = anchors[i - 1];
      const [m1, t1] = anchors[i];
      if (m <= m1) return t0 + ((m - m0) / (m1 - m0)) * (t1 - t0);
    }
    return 1;
  }

  /**
   * 夜间进度 0..1(月亮弧线用):日落+40m(=0)→ 次日日出−45m(=1),跨午夜连续。
   * 夜间 t 恒 1,月亮位置无法由 t 推,这里由时钟另推(设计 §2)。白天调用无意义(钳制)。
   */
  export function nightProgress(now: Date, sunrise?: string, sunset?: string): number {
    const sr = parseMinutes(sunrise, DEFAULT_SUNRISE_MIN);
    const ss = parseMinutes(sunset, DEFAULT_SUNSET_MIN);
    const nightStart = ss + 40;
    const duration = sr - 45 + MIN_PER_DAY - nightStart;
    if (duration <= 0) return 0;
    const m = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
    const sinceStart = (m - nightStart + MIN_PER_DAY) % MIN_PER_DAY;
    return clamp01(sinceStart / duration);
  }

  export type CelestialBody = {
    kind: 'sun' | 'moon';
    x: number; // 水平位置 0(左)..1(右)
    y: number; // 高度 0(天顶附近)..1(地平线);>1 = 地平线下(不绘制)
  };

  /** t ≥ NIGHT_T 时按月亮弧线(由 nightT 推进),否则太阳弧线。 */
  export const NIGHT_T = 0.92;

  export function sunPosition(t: number, nightT = 0): CelestialBody {
    if (t >= NIGHT_T) {
      const u = clamp01(nightT);
      return { kind: 'moon', x: 0.15 + 0.7 * u, y: 1 - Math.sin(Math.PI * u) * 0.75 };
    }
    // 太阳:t=0(DAWN 起点)在地平线下,清晨升起,t≈0.5 最高,SUNSET 段落回地平线。
    const u = clamp01(t / NIGHT_T);
    return { kind: 'sun', x: 0.08 + 0.84 * u, y: 1.08 - Math.sin(Math.PI * u) };
  }
  ```

  ③ 创建 `src/lib/scene/weather.ts`(整文件):

  ```ts
  // 天气 → 场景特效映射(天际线设计 §4)。纯函数:WMO 天气码 + 风速(km/h)。

  export type SceneEffects = {
    rain: 0 | 1 | 2 | 3;   // 0 无 / 1 毛毛雨、小雨 / 2 中雨 / 3 大雨、雷暴雨
    snow: 0 | 1;
    thunder: boolean;
    wind: 0 | 1 | 2;       // ≥30 km/h → 1(云速 ×2、雨丝 ~12°);≥50 → 2(×3.5、~22°)
    cloudiness: number;    // 0..1
    fog: boolean;
  };

  export function effectsFromWeather(code: number, windKmh: number): SceneEffects {
    const wind: 0 | 1 | 2 = windKmh >= 50 ? 2 : windKmh >= 30 ? 1 : 0;
    let rain: 0 | 1 | 2 | 3 = 0;
    let snow: 0 | 1 = 0;
    let thunder = false;
    let fog = false;
    let cloudiness = 0.5; // 未列出的 WMO 码:中性云量兜底,其余全关

    if (code === 0) cloudiness = 0.1;
    else if (code === 1) cloudiness = 0.35;
    else if (code === 2) cloudiness = 0.6;
    else if (code === 3) cloudiness = 0.9;
    else if (code === 45 || code === 48) { fog = true; cloudiness = 0.85; }
    else if (code >= 51 && code <= 57) { rain = 1; cloudiness = 0.7; }
    else if (code === 61 || code === 80) { rain = 1; cloudiness = 0.75; }
    else if (code === 63 || code === 81) { rain = 2; cloudiness = 0.85; }
    else if (code === 65 || code === 67 || code === 82) { rain = 3; cloudiness = 0.95; }
    else if ((code >= 71 && code <= 77) || code === 85 || code === 86) { snow = 1; cloudiness = 0.85; }
    else if (code === 95 || code === 96 || code === 99) { rain = 3; thunder = true; cloudiness = 1; }

    // 设计 §4:rain>0 时云量强制 ≥0.7(上表已满足,双保险钉住不因改档回退)。
    if (rain > 0 && cloudiness < 0.7) cloudiness = 0.7;
    return { rain, snow, thunder, wind, cloudiness, fog };
  }
  ```

  ④ 创建 `src/lib/scene/weatherCache.ts`(整文件;缓存逻辑不放 route.ts 的原因:Next 15 对 app route 文件做导出白名单类型检查,`resetWeatherCache`/`getWeather` 额外导出会让 `npm run build` 报 invalid export):

  ```ts
  import type { TvWeather } from '@/lib/types';

  // /api/tv/weather 的服务端内存缓存(天际线设计 §3):globalThis 单例,与 db/hub 同款——
  // custom server(tsx)与 Next 打包的 route handler 在同一进程内是两个模块注册表,
  // 模块级变量各存一份,globalThis 才是共享点。多台 TV 每 10 分钟只打一次上游。
  type WeatherGlobal = typeof globalThis & {
    __tvWeather?: { payload: TvWeather; fetchedAt: number };
  };

  export const WEATHER_TTL_MS = 10 * 60 * 1000;

  type OpenMeteo = {
    current: { weather_code: number; wind_speed_10m: number; is_day: number };
    daily: { sunrise: string[]; sunset: string[] };
  };

  export type WeatherResult = { payload: TvWeather; stale: boolean };

  /** 取当前天气:TTL 内直接回缓存;过期打上游,失败回上次成功值(stale: true),
   *  从未成功过返回 null(路由据此回 503)。nowMs 仅测试注入。 */
  export async function getWeather(nowMs = Date.now()): Promise<WeatherResult | null> {
    const g = globalThis as WeatherGlobal;
    const cached = g.__tvWeather;
    if (cached && nowMs - cached.fetchedAt < WEATHER_TTL_MS) {
      return { payload: cached.payload, stale: false };
    }
    const lat = process.env.WEATHER_LAT ?? '-42.8794'; // Hobart(设计 §3)
    const lon = process.env.WEATHER_LON ?? '147.3294';
    try {
      const res = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=weather_code,wind_speed_10m,is_day&daily=sunrise,sunset&forecast_days=1&timezone=auto`,
      );
      if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
      const json = (await res.json()) as OpenMeteo;
      const payload: TvWeather = {
        weatherCode: json.current.weather_code,
        windSpeedKmh: json.current.wind_speed_10m,
        isDay: json.current.is_day === 1,
        sunrise: json.daily.sunrise[0],
        sunset: json.daily.sunset[0],
      };
      g.__tvWeather = { payload, fetchedAt: nowMs };
      return { payload, stale: false };
    } catch {
      if (cached) return { payload: cached.payload, stale: true };
      return null;
    }
  }

  /** Tests only. */
  export function resetWeatherCache(): void {
    delete (globalThis as WeatherGlobal).__tvWeather;
  }
  ```

  ⑤ 创建 `src/app/api/tv/weather/route.ts`(整文件):

  ```ts
  import { getWeather } from '@/lib/scene/weatherCache';

  // GET /api/tv/weather(天际线设计 §3):无鉴权——公开气象数据,与 TV 配对状态无关。
  // 上游失败回上次成功缓存(顶层 stale: true),从未成功过 503
  // (TV 端据此按"晴"+ 回落日出日落渲染,任何故障不影响数据展示)。
  export async function GET(): Promise<Response> {
    const result = await getWeather();
    if (!result) return Response.json({ error: 'Weather unavailable' }, { status: 503 });
    return Response.json(result.stale ? { data: result.payload, stale: true } : { data: result.payload });
  }
  ```

- [ ] **Step 4: 转绿 + 全仓校验**

  ```bash
  npx vitest run tests/scene/palette.test.ts tests/scene/weather.test.ts tests/api/weather.test.ts
  npx tsc --noEmit
  npx vitest run
  ```

  预期:palette **14 个**、weather **11 个**、api/weather **7 个**全部通过;tsc 零输出;全量 **25 files / 329 tests** 全绿(297 + 32)。

- [ ] **Step 5: Commit**

  ```bash
  git add src/lib/scene/palette.ts src/lib/scene/weather.ts src/lib/scene/weatherCache.ts src/app/api/tv/weather/route.ts src/lib/types.ts tests/scene/palette.test.ts tests/scene/weather.test.ts tests/api/weather.test.ts
  git commit -m "feat: scene palette, weather effects mapping and tv weather api"
  ```

---
### Task 2: SkylineBackground 组件 + TvApp 集成(设计 §2/§5)

**Files:**
- Create: `src/components/tv/SkylineBackground.tsx`(canvas 渲染器,整文件)
- Modify: `src/components/tv/TvApp.tsx`(天气轮询 state、三分支挂背景、内容层提 z-10、celebration 时 paused)
- Modify: `src/components/tv/PairingScreen.tsx`(去不透明 `bg-bg`、提 z-10——否则配对屏整屏盖住背景)

canvas 绘制不做单测(设计 §7);本任务门禁 = `npx tsc --noEmit` 零输出 + 全量 vitest 不回退 + `npm run build` 成功。

- [ ] **Step 1: 创建 `src/components/tv/SkylineBackground.tsx`(整文件,一字不省)**

  ```tsx
  'use client';

  import { useEffect, useRef } from 'react';
  import { getPalette, nightProgress, phaseFromClock, sunPosition, type Palette, type Rgb } from '@/lib/scene/palette';
  import { effectsFromWeather } from '@/lib/scene/weather';
  import type { TvWeather } from '@/lib/types';

  // —— 性能约束(天际线设计 §2)——
  const MAX_DPR = 1.5;            // 电视浏览器:DPR 封顶
  const FRAME_MIN_MS = 30;        // rAF 隔帧 → ~30fps
  const MAX_RAIN = 300;
  const MAX_SNOW = 150;
  const STAR_COUNT = 140;
  const CLOUD_COUNT = 5;          // 生成 5 朵,按云量显示 2–5 朵
  const HORIZON = 0.82;           // 地平线在画布高度的位置
  const CACHE_T_STEP = 0.015;     // 调色相位跨过该步进才重绘楼群底图
  const FLICKER_EPOCH_MS = 4000;  // 窗灯低频闪烁纪元(也是底图重绘频率上限:每 4s 一次)

  // 伪随机(固定种子,mulberry32):楼群/星星/云/窗灯布局在每次挂载与重建间完全一致。
  function mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), a | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function rgba(c: Rgb, a: number): string {
    return `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;
  }

  function mix(a: Rgb, b: Rgb, u: number): Rgb {
    return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
  }

  /** 阴/雨天压灰(设计 §4):向自身灰度值混合 amount(0..1)。 */
  function grayMix(c: Rgb, amount: number): Rgb {
    const g = 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
    return mix(c, [g, g, g], Math.min(1, amount));
  }

  type WindowCell = { wx: number; wy: number; litRand: number; flickerRand: number };
  type Building = { x: number; w: number; h: number; antenna: number; windows: WindowCell[] };
  type Star = { x: number; y: number; r: number; phase: number };
  type Cloud = { x: number; y: number; scale: number; speed: number; blobs: [number, number, number, number][] };
  type Drop = { x: number; y: number; v: number };
  type Flake = { x: number; y: number; v: number; drift: number; r: number };

  type Scene = {
    stars: Star[];
    clouds: Cloud[];
    layers: Building[][];         // 远 → 近(三层进深)
    outline: [number, number][];  // 近层楼顶折线(闪电时描边高亮)
    rain: Drop[];
    snow: Flake[];
  };

  // 三层楼群:远层高瘦浅色(城市核心天际线)、近层矮宽深色(前景剪影)。
  const LAYER_CONFIGS = [
    { seed: 101, minH: 0.26, maxH: 0.5, minW: 40, maxW: 80, gap: 5, antennaP: 0.3, windows: false },
    { seed: 202, minH: 0.18, maxH: 0.34, minW: 50, maxW: 100, gap: 8, antennaP: 0.2, windows: true },
    { seed: 303, minH: 0.1, maxH: 0.24, minW: 70, maxW: 140, gap: 12, antennaP: 0.12, windows: true },
  ] as const;

  function buildLayer(cfg: (typeof LAYER_CONFIGS)[number], w: number, h: number): Building[] {
    const rand = mulberry32(cfg.seed);
    const buildings: Building[] = [];
    let x = -30;
    while (x < w + 30) {
      const bw = cfg.minW + rand() * (cfg.maxW - cfg.minW);
      const bh = (cfg.minH + rand() * (cfg.maxH - cfg.minH)) * h;
      const antenna = rand() < cfg.antennaP ? 12 + rand() * 28 : 0;
      const windows: WindowCell[] = [];
      if (cfg.windows) {
        const cols = Math.floor((bw - 12) / 18);
        const rows = Math.floor((bh - 20) / 26);
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            windows.push({ wx: 8 + c * 18, wy: 10 + r * 26, litRand: rand(), flickerRand: rand() });
          }
        }
      }
      buildings.push({ x, w: bw, h: bh, antenna, windows });
      x += bw + cfg.gap;
    }
    return buildings;
  }

  function buildScene(w: number, h: number): Scene {
    const rand = mulberry32(777);
    const stars: Star[] = Array.from({ length: STAR_COUNT }, () => ({
      x: rand(), y: rand() * 0.7, r: 0.6 + rand() * 1.2, phase: rand() * Math.PI * 2,
    }));
    const clouds: Cloud[] = Array.from({ length: CLOUD_COUNT }, (_, i) => ({
      x: rand() * 1.4 - 0.2,
      y: 0.08 + rand() * 0.32,
      scale: 0.7 + rand() * 0.9,
      speed: 0.004 + rand() * 0.006, // 屏宽比例/秒 → 慢速流云
      blobs: Array.from({ length: 4 + (i % 3) }, (): [number, number, number, number] => [
        (rand() - 0.5) * 180, (rand() - 0.5) * 34, 55 + rand() * 55, 16 + rand() * 12,
      ]),
    }));
    const layers = LAYER_CONFIGS.map((cfg) => buildLayer(cfg, w, h));
    const outline: [number, number][] = [];
    for (const b of layers[2]) {
      outline.push([b.x, h - b.h], [b.x + b.w, h - b.h]);
    }
    const rainRand = mulberry32(555);
    const rain: Drop[] = Array.from({ length: MAX_RAIN }, () => ({
      x: rainRand() * w, y: rainRand() * h, v: 900 + rainRand() * 500,
    }));
    const snowRand = mulberry32(666);
    const snow: Flake[] = Array.from({ length: MAX_SNOW }, () => ({
      x: snowRand() * w, y: snowRand() * h, v: 45 + snowRand() * 55,
      drift: snowRand() * Math.PI * 2, r: 1.2 + snowRand() * 1.8,
    }));
    return { stars, clouds, layers, outline, rain, snow };
  }

  /**
   * TV 动画天际线背景(天际线设计 §2):最底层 fixed z-0 canvas,pointer-events-none。
   * 时间驱动纯自动(phaseFromClock),天气特效由 props.weather 推导;
   * weather=null(从未成功)→ 按"晴"+ 回落日出日落渲染(设计 §3)。
   * paused=true(庆祝/生日全屏播放)期间整个 rAF 循环停止(设计 §2)。
   */
  export default function SkylineBackground({
    weather,
    paused,
  }: {
    weather: TvWeather | null;
    paused: boolean;
  }) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    // 天气经 ref 透传:10 分钟轮询只换数据,不重启渲染循环。
    const weatherRef = useRef<TvWeather | null>(weather);
    useEffect(() => {
      weatherRef.current = weather;
    }, [weather]);

    useEffect(() => {
      if (paused) return; // 覆盖层不透明,画面停在最后一帧即可;恢复时 effect 重启循环
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      let W = 0;
      let H = 0;
      let dpr = 1;
      let scene: Scene = buildScene(1, 1);
      const cache = document.createElement('canvas'); // 楼群+窗灯离屏底图(设计 §2)
      const cacheCtx = cache.getContext('2d');
      let cacheKey = '';
      let raf = 0;
      let lastFrame = 0;
      let lastTick = 0;
      // 雷暴闪电状态(设计 §4:6–18s 随机一次,2–3 帧序列)
      let nextStrikeAt = 0;
      let flashLeft = 0;
      let bolt: [number, number][] = [];
      let forks: [number, number][][] = [];
      const boltRand = mulberry32(Date.now() >>> 0); // 唯一非固定种子:闪电形态每次不同

      const resize = () => {
        W = window.innerWidth;
        H = window.innerHeight;
        dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
        cache.width = canvas.width;
        cache.height = canvas.height;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        scene = buildScene(W, H);
        cacheKey = ''; // 强制底图重绘
      };
      resize();
      window.addEventListener('resize', resize);

      const drawCache = (p: Palette, epoch: number, gray: number) => {
        if (!cacheCtx) return;
        cacheCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        cacheCtx.clearRect(0, 0, W, H);
        const layerColors = [p.buildingFar, p.buildingMid, p.buildingNear].map((c) => grayMix(c, gray));
        scene.layers.forEach((buildings, li) => {
          cacheCtx.fillStyle = rgba(layerColors[li], 1);
          for (const b of buildings) {
            const top = H - b.h;
            cacheCtx.fillRect(b.x, top, b.w, b.h);
            if (b.antenna > 0) cacheCtx.fillRect(b.x + b.w / 2 - 1.5, top - b.antenna, 3, b.antenna);
          }
          if (li === 0) return; // 远层免窗(雾霭距离感)
          for (const b of buildings) {
            const top = H - b.h;
            for (const win of b.windows) {
              const lit = win.litRand < p.windowLit
                && !(win.flickerRand > 0.92 && (epoch + Math.floor(win.flickerRand * 1000)) % 3 === 0);
              cacheCtx.fillStyle = lit ? rgba(p.window, li === 2 ? 0.85 : 0.55) : 'rgba(0,0,0,0.18)';
              cacheCtx.fillRect(b.x + win.wx, top + win.wy, li === 2 ? 8 : 6, li === 2 ? 12 : 9);
            }
          }
        });
      };

      const render = (nowMs: number) => {
        raf = requestAnimationFrame(render);
        if (nowMs - lastFrame < FRAME_MIN_MS) return; // 隔帧 ~30fps
        const dt = Math.min((nowMs - lastTick) / 1000, 0.1);
        lastFrame = nowMs;
        lastTick = nowMs;

        const weatherNow = weatherRef.current;
        // weather=null → code 0(晴)+ 风 0;sunrise/sunset undefined → 06:30/19:00 回落。
        const fx = effectsFromWeather(weatherNow?.weatherCode ?? 0, weatherNow?.windSpeedKmh ?? 0);
        const now = new Date();
        const t = phaseFromClock(now, weatherNow?.sunrise, weatherNow?.sunset);
        const nightT = nightProgress(now, weatherNow?.sunrise, weatherNow?.sunset);
        const p = getPalette(t);
        const gray = Math.min(1, fx.cloudiness * 0.45 + fx.rain * 0.08); // 阴/雨压灰
        const windMul = fx.wind === 2 ? 3.5 : fx.wind === 1 ? 2 : 1;

        // 楼群底图:resize / 调色跨步进 / 闪烁纪元 / 云量档 变化才重绘(设计 §2)。
        const epoch = Math.floor(nowMs / FLICKER_EPOCH_MS);
        const key = `${W}x${H}|${Math.round(t / CACHE_T_STEP)}|${epoch}|${Math.round(fx.cloudiness * 10)}`;
        if (key !== cacheKey) {
          drawCache(p, epoch, gray);
          cacheKey = key;
        }

        // 1. 天空线性渐变(顶 → 地平线;渐变终点以下延展地平线色)
        const sky = ctx.createLinearGradient(0, 0, 0, H * HORIZON);
        sky.addColorStop(0, rgba(grayMix(p.skyTop, gray), 1));
        sky.addColorStop(1, rgba(grayMix(p.skyHor, gray), 1));
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, W, H);

        // 2. 星星(夜间;云多则遮蔽)
        const starAlpha = p.star * (1 - fx.cloudiness * 0.85);
        if (starAlpha > 0.02) {
          for (const s of scene.stars) {
            const tw = 0.55 + 0.45 * Math.sin(nowMs * 0.0012 + s.phase);
            ctx.fillStyle = `rgba(210,225,255,${(starAlpha * tw).toFixed(3)})`;
            ctx.fillRect(s.x * W, s.y * H, s.r, s.r);
          }
        }

        // 3. 太阳/月亮 + 径向光晕
        const body = sunPosition(t, nightT);
        if (body.y < 1.04) {
          const bx = body.x * W;
          const by = body.y * H * HORIZON;
          const radius = body.kind === 'sun' ? H * 0.05 : H * 0.038;
          const glowR = radius * 5;
          const glow = ctx.createRadialGradient(bx, by, radius * 0.4, bx, by, glowR);
          glow.addColorStop(0, rgba(p.glow, 0.4 * (1 - fx.cloudiness * 0.7)));
          glow.addColorStop(1, rgba(p.glow, 0));
          ctx.fillStyle = glow;
          ctx.fillRect(bx - glowR, by - glowR, glowR * 2, glowR * 2);
          ctx.fillStyle = rgba(p.sun, 1 - fx.cloudiness * 0.5);
          ctx.beginPath();
          ctx.arc(bx, by, radius, 0, Math.PI * 2);
          ctx.fill();
        }

        // 4. 慢速流云(云量定朵数/浓度,风加速 ×2/×3.5)
        const cloudCount = Math.min(CLOUD_COUNT, 2 + Math.round(fx.cloudiness * 3));
        const cloudColor = grayMix(mix(p.skyHor, [255, 255, 255], 0.22 * (1 - p.star)), gray + fx.rain * 0.1);
        for (let i = 0; i < cloudCount; i++) {
          const c = scene.clouds[i];
          c.x += c.speed * windMul * dt;
          if (c.x > 1.25) c.x = -0.25;
          ctx.fillStyle = rgba(cloudColor, 0.28 + fx.cloudiness * 0.4);
          for (const [bdx, bdy, brx, bry] of c.blobs) {
            ctx.beginPath();
            ctx.ellipse(c.x * W + bdx * c.scale, c.y * H + bdy * c.scale, brx * c.scale, bry * c.scale, 0, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // 5. 地平线雾霭层(雾天加厚)
        const hazeTop = H * (HORIZON - 0.16);
        const haze = ctx.createLinearGradient(0, hazeTop, 0, H * HORIZON);
        haze.addColorStop(0, rgba(p.haze, 0));
        haze.addColorStop(1, rgba(p.haze, Math.min(0.85, p.hazeAlpha + (fx.fog ? 0.3 : 0))));
        ctx.fillStyle = haze;
        ctx.fillRect(0, hazeTop, W, H - hazeTop);

        // 6. 楼群底图(含窗灯)
        ctx.drawImage(cache, 0, 0, W, H);

        // 7. 雾天:楼群之上再罩一层能见度雾幕(设计 §4)
        if (fx.fog) {
          const fog = ctx.createLinearGradient(0, H * 0.4, 0, H);
          fog.addColorStop(0, rgba(p.haze, 0.06));
          fog.addColorStop(1, rgba(p.haze, 0.42));
          ctx.fillStyle = fog;
          ctx.fillRect(0, 0, W, H);
        }

        // 8. 雨:短线段粒子,强度定数量/速度,风定倾角 ~12°/~22°(设计 §4)
        if (fx.rain > 0) {
          const count = Math.min(MAX_RAIN, fx.rain * 100);
          const tilt = Math.tan(((fx.wind === 2 ? 22 : fx.wind === 1 ? 12 : 4) * Math.PI) / 180);
          const len = 8 + fx.rain * 5;
          ctx.strokeStyle = 'rgba(170,195,230,0.38)';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          for (let i = 0; i < count; i++) {
            const d = scene.rain[i];
            d.y += d.v * (0.6 + fx.rain * 0.2) * dt;
            d.x += d.v * tilt * dt;
            if (d.y > H) d.y -= H + len;
            if (d.x > W) d.x -= W;
            ctx.moveTo(d.x, d.y);
            ctx.lineTo(d.x - tilt * len, d.y - len);
          }
          ctx.stroke();
        }

        // 9. 雪:慢速圆点,轻微左右摆(设计 §4)
        if (fx.snow > 0) {
          ctx.fillStyle = 'rgba(235,240,250,0.8)';
          for (const f of scene.snow) {
            f.y += f.v * dt;
            f.x += (Math.sin(nowMs * 0.0008 + f.drift) * 12 + fx.wind * 18) * dt;
            if (f.y > H) f.y -= H + 4;
            if (f.x > W) f.x -= W;
            if (f.x < 0) f.x += W;
            ctx.beginPath();
            ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // 10. 雷暴闪电:随机 6–18s 一次,2–3 帧打亮 + 分叉闪电线 + 楼群边缘高亮(设计 §4)
        if (fx.thunder) {
          if (nextStrikeAt === 0) nextStrikeAt = nowMs + 2000 + boltRand() * 6000;
          if (nowMs >= nextStrikeAt && flashLeft === 0) {
            flashLeft = 2 + (boltRand() < 0.5 ? 1 : 0);
            nextStrikeAt = nowMs + 6000 + boltRand() * 12000;
            bolt = [];
            forks = [];
            let px = W * (0.15 + boltRand() * 0.7);
            let py = H * 0.05;
            bolt.push([px, py]);
            while (py < H * (HORIZON - 0.08)) {
              px += (boltRand() - 0.5) * 90;
              py += 30 + boltRand() * 55;
              bolt.push([px, py]);
              if (boltRand() < 0.3 && forks.length < 2) {
                const fork: [number, number][] = [[px, py]];
                let fkx = px;
                let fky = py;
                const dir = boltRand() < 0.5 ? -1 : 1;
                const segs = 2 + Math.round(boltRand());
                for (let s = 0; s < segs; s++) {
                  fkx += dir * (30 + boltRand() * 60);
                  fky += 25 + boltRand() * 40;
                  fork.push([fkx, fky]);
                }
                forks.push(fork);
              }
            }
          }
          if (flashLeft > 0) {
            ctx.fillStyle = `rgba(225,235,255,${flashLeft >= 2 ? 0.22 : 0.1})`;
            ctx.fillRect(0, 0, W, H); // 天空整体打亮
            const strokePath = (pts: [number, number][]) => {
              ctx.beginPath();
              ctx.moveTo(pts[0][0], pts[0][1]);
              for (const [qx, qy] of pts.slice(1)) ctx.lineTo(qx, qy);
              ctx.stroke();
            };
            ctx.strokeStyle = 'rgba(240,246,255,0.95)';
            ctx.lineWidth = 2.5;
            strokePath(bolt);
            ctx.lineWidth = 1.5;
            for (const fork of forks) strokePath(fork);
            // 楼群边缘高亮:近层楼顶折线描边
            ctx.strokeStyle = 'rgba(200,220,255,0.55)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(0, H);
            for (const [qx, qy] of scene.outline) ctx.lineTo(qx, qy);
            ctx.lineTo(W, H);
            ctx.stroke();
            flashLeft--;
          }
        } else {
          nextStrikeAt = 0;
          flashLeft = 0;
        }

        // 11. vignette
        const vig = ctx.createRadialGradient(
          W / 2, H * 0.45, Math.min(W, H) * 0.45,
          W / 2, H * 0.45, Math.max(W, H) * 0.75,
        );
        vig.addColorStop(0, 'rgba(0,0,0,0)');
        vig.addColorStop(1, 'rgba(0,0,0,0.38)');
        ctx.fillStyle = vig;
        ctx.fillRect(0, 0, W, H);

        // 12. 整体压暗幕(设计 §5:白天 0.45 → 夜 0.35,随 t 插值,保前景文字对比度)
        ctx.fillStyle = `rgba(6,8,15,${p.dim.toFixed(3)})`;
        ctx.fillRect(0, 0, W, H);
      };

      raf = requestAnimationFrame(render);
      return () => {
        cancelAnimationFrame(raf);
        window.removeEventListener('resize', resize);
      };
    }, [paused]);

    return (
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 h-full w-full"
      />
    );
  }
  ```

- [ ] **Step 2: TvApp 集成(五处修改)**

  ① 修改 `src/components/tv/TvApp.tsx`。找到(逐字):

  ```ts
  import type { SlideKey } from '@/lib/settings';
  import type { TvStateResponse } from '@/lib/types';
  ```

  替换为:

  ```ts
  import type { SlideKey } from '@/lib/settings';
  import type { TvStateResponse, TvWeather } from '@/lib/types';
  ```

  ② 找到:

  ```ts
  import PairingScreen from '@/components/tv/PairingScreen';
  import StartOverlay from '@/components/tv/StartOverlay';
  ```

  替换为:

  ```ts
  import SkylineBackground from '@/components/tv/SkylineBackground';
  import PairingScreen from '@/components/tv/PairingScreen';
  import StartOverlay from '@/components/tv/StartOverlay';
  ```

  ③ 找到:

  ```ts
    const [tvState, setTvState] = useState<TvStateResponse | null>(null);
    const [audioUnlocked, setAudioUnlocked] = useState(false);
  ```

  替换为:

  ```ts
    const [tvState, setTvState] = useState<TvStateResponse | null>(null);
    // 天气(天际线设计 §3):null = 从未成功(背景按"晴"+ 回落日出日落渲染)。
    const [weather, setWeather] = useState<TvWeather | null>(null);
    const [audioUnlocked, setAudioUnlocked] = useState(false);
  ```

  ④ 找到(整个 hourly effect):

  ```ts
    // Hourly fallback refresh: keeps leaderboard period rollover (new week/month/
    // quarter) and periodLabel current even when no data events arrive (spec §5/§12).
    useEffect(() => {
      if (socket.phase !== 'paired') return;
      const timer = setInterval(() => void refreshState(), 60 * 60 * 1000);
      return () => clearInterval(timer);
    }, [socket.phase, refreshState]);
  ```

  替换为(原样保留 + 追加天气轮询 effect):

  ```ts
    // Hourly fallback refresh: keeps leaderboard period rollover (new week/month/
    // quarter) and periodLabel current even when no data events arrive (spec §5/§12).
    useEffect(() => {
      if (socket.phase !== 'paired') return;
      const timer = setInterval(() => void refreshState(), 60 * 60 * 1000);
      return () => clearInterval(timer);
    }, [socket.phase, refreshState]);

    // 天气轮询(天际线设计 §3):挂载即拉取,此后每 10 分钟一次;配对/轮播/离线三分支
    // 共用,不依赖 socket.phase,与 refreshState/WS 互不干扰。失败沿用上次结果,
    // 从未成功保持 null——天气链路任何故障都不影响数据展示。
    useEffect(() => {
      let cancelled = false;
      const fetchWeather = async () => {
        try {
          const res = await fetch('/api/tv/weather');
          if (!res.ok) return; // 503 等:沿用上次结果
          const json = (await res.json()) as { data: TvWeather };
          if (!cancelled) setWeather(json.data);
        } catch {
          // 网络失败:沿用上次结果(设计 §3)
        }
      };
      void fetchWeather();
      const timer = setInterval(() => void fetchWeather(), 10 * 60 * 1000);
      return () => {
        cancelled = true;
        clearInterval(timer);
      };
    }, []);
  ```

  ⑤ 找到(配对分支):

  ```tsx
    if (socket.phase === 'connecting' || socket.phase === 'pairing') {
      return <PairingScreen pairCode={socket.pairCode} />;
    }
  ```

  替换为:

  ```tsx
    if (socket.phase === 'connecting' || socket.phase === 'pairing') {
      return (
        <div className="relative h-screen w-screen overflow-hidden bg-bg">
          <SkylineBackground weather={weather} paused={false} />
          <PairingScreen pairCode={socket.pairCode} />
        </div>
      );
    }
  ```

  ⑥ 找到(主分支 return 开头;`<AnimatePresence` 一并入锚点保证唯一):

  ```tsx
    return (
      <div className="relative h-screen w-screen overflow-hidden bg-bg">
        <AnimatePresence mode="wait">
  ```

  替换为:

  ```tsx
    return (
      <div className="relative h-screen w-screen overflow-hidden bg-bg">
        {/* 天际线背景(设计 §2):z-0 垫底;庆祝/生日全屏播放期间暂停渲染循环。 */}
        <SkylineBackground weather={weather} paused={carousel.mode === 'celebrate'} />
        <AnimatePresence mode="wait">
  ```

  ⑦ 找到(轮播内容 motion.div;内容层提 z-10):

  ```tsx
          <motion.div
            key={currentSlide ? `${currentSlide.key}-${carousel.index}` : 'idle'}
            className="h-full w-full"
  ```

  替换为:

  ```tsx
          <motion.div
            key={currentSlide ? `${currentSlide.key}-${carousel.index}` : 'idle'}
            className="relative z-10 h-full w-full"
  ```

  (页码角标 z-40、OfflineBadge z-40、StartOverlay z-50、CelebrationOverlay z-50 均已在 z-0 之上,不动。)

  ⑧ 修改 `src/components/tv/PairingScreen.tsx`。找到:

  ```tsx
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-12 bg-bg">
  ```

  替换为(去不透明底色让背景透出,提 z-10 压住 canvas):

  ```tsx
      <div className="fixed inset-0 z-10 flex flex-col items-center justify-center gap-12">
  ```

- [ ] **Step 3: 全仓校验(tsc + vitest + build)**

  ```bash
  npx tsc --noEmit
  npx vitest run
  npm run build
  ```

  预期:tsc 零输出;全量 **25 files / 329 tests** 全绿(本任务无新增单测);build 成功结束(exit 0,路由清单含 `ƒ /api/tv/weather`)。

- [ ] **Step 4: Commit**

  ```bash
  git add src/components/tv/SkylineBackground.tsx src/components/tv/TvApp.tsx src/components/tv/PairingScreen.tsx
  git commit -m "feat: animated skyline background on all tv pages"
  ```

---
### Task 3: 面板半透明可读性改造 + README/env + 收尾回归(设计 §5/§6)

**Files:**
- Modify: `src/components/tv/slides/LeaderboardSlide.tsx`(榜单行)
- Modify: `src/components/tv/slides/ScorecardSlide.tsx`(汇总块 + 表格容器)
- Modify: `src/components/tv/slides/GoalSlide.tsx`(目标卡)
- Modify: `src/components/tv/slides/AnnouncementSlide.tsx`(公告卡)
- Modify: `src/components/tv/PairingScreen.tsx`(配对码面板格)
- Modify: `src/components/tv/TvApp.tsx`(页码角标)
- Modify: `src/components/tv/OfflineBadge.tsx`(OFFLINE 徽标)
- Modify: `README.md`(功能段 + WEATHER_LAT/WEATHER_LON)
- Modify: `.env.example`(注释形式记录两个变量)

统一做法:`bg-panel` → `bg-panel/70`(或表格容器 `bg-panel/60`)+ `backdrop-blur-sm`;霓虹描边/标题风格(`neon-border`/`neon-text`/`text-neon`)全部保留;庆祝/生日全屏 overlay 与 StartOverlay(z-50 不透明,本就全屏覆盖)不动。所有锚点逐字取自当前工作区。无单测改动——纯样式;门禁 = tsc + 全量 vitest + build + **全量 E2E 6 条**。

**E2E 影响预判(已逐条核对 `e2e/tv-flow.spec.ts`)**:六条用例全部是文字/角色断言(`PAIR_CODE_RE`、`SLIDE_TITLE_RE`、`CLICK TO START`、`SOLD!`、`HAPPY BIRTHDAY`、`OFFLINE`、`1/2`/`2/2` exact、`MONTH TO DATE`/`YEAR TO DATE`/`TOTAL GROSS COMM`),无截图、无背景色/样式断言;canvas 在 z-0 且 `pointer-events-none`,StartOverlay 按钮点击不受影响;页码角标只加了包裹样式、文字不变。**预期零改动通过。**

- [ ] **Step 1: 六个组件的类名改造(逐字锚点)**

  ① 修改 `src/components/tv/slides/LeaderboardSlide.tsx`。找到:

  ```tsx
                className={`flex h-[72px] shrink-0 items-center gap-8 rounded-lg border-l-4 bg-panel px-8 ${rowBorderClass(entry.rank)}`}
  ```

  替换为:

  ```tsx
                className={`flex h-[72px] shrink-0 items-center gap-8 rounded-lg border-l-4 bg-panel/70 px-8 backdrop-blur-sm ${rowBorderClass(entry.rank)}`}
  ```

  ② 修改 `src/components/tv/slides/ScorecardSlide.tsx`。找到(TotalBlock 汇总块):

  ```tsx
      <div className="flex flex-col justify-center rounded-xl bg-panel px-8">
  ```

  替换为:

  ```tsx
      <div className="flex flex-col justify-center rounded-xl bg-panel/70 px-8 backdrop-blur-sm">
  ```

  再找到(表格容器;**只加水平 padding**——垂直方向任何增减都会破坏 TvApp 的
  SCORECARD_RESERVED_PX(388)/SCORECARD_ITEM_PX(56)分页容量计算):

  ```tsx
            <div className="mt-8 flex-1 overflow-hidden">
  ```

  替换为:

  ```tsx
            <div className="mt-8 flex-1 overflow-hidden rounded-xl bg-panel/60 px-6 backdrop-blur-sm">
  ```

  ③ 修改 `src/components/tv/slides/GoalSlide.tsx`。找到:

  ```tsx
                className="rounded-xl bg-panel p-10"
  ```

  替换为:

  ```tsx
                className="rounded-xl bg-panel/70 p-10 backdrop-blur-sm"
  ```

  ④ 修改 `src/components/tv/slides/AnnouncementSlide.tsx`。找到:

  ```tsx
                className="flex h-[224px] shrink-0 items-start gap-8 rounded-xl bg-panel p-8"
  ```

  替换为:

  ```tsx
                className="flex h-[224px] shrink-0 items-start gap-8 rounded-xl bg-panel/70 p-8 backdrop-blur-sm"
  ```

  ⑤ 修改 `src/components/tv/PairingScreen.tsx`(配对码面板格;外层容器已在 Task 2 改为透明)。找到:

  ```tsx
                className="neon-border flex h-40 w-32 items-center justify-center rounded-xl bg-panel font-display text-8xl text-neon neon-text"
  ```

  替换为:

  ```tsx
                className="neon-border flex h-40 w-32 items-center justify-center rounded-xl bg-panel/70 font-display text-8xl text-neon neon-text backdrop-blur-sm"
  ```

  ⑥ 修改 `src/components/tv/TvApp.tsx`(页码角标补半透明底;文字 `1/2` 不变,E2E exact 断言不受影响)。找到:

  ```tsx
          <div
            className="fixed right-8 top-8 z-40 font-heading text-3xl text-muted"
            style={{ textShadow: '0 0 12px rgba(0, 229, 255, 0.35)' }}
          >
  ```

  替换为:

  ```tsx
          <div
            className="fixed right-8 top-8 z-40 rounded-lg bg-panel/60 px-4 py-1 font-heading text-3xl text-muted backdrop-blur-sm"
            style={{ textShadow: '0 0 12px rgba(0, 229, 255, 0.35)' }}
          >
  ```

  ⑦ 修改 `src/components/tv/OfflineBadge.tsx`(已是 `bg-panel/70`,补 blur)。找到:

  ```tsx
      <div className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-panel/70 px-4 py-2">
  ```

  替换为:

  ```tsx
      <div className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-panel/70 px-4 py-2 backdrop-blur-sm">
  ```

- [ ] **Step 2: README + .env.example**

  ① 修改 `README.md`。找到(开头功能段):

  ```
  A Spinify-style sales leaderboard for real-estate offices. An office TV runs a
  full-screen, esports-styled carousel of sales scorecards, leaderboards, team
  goal progress and announcements — and the moment a sale is recorded in the admin
  console, every TV interrupts its carousel to play a full-screen celebration
  with the agent's personal anthem.
  ```

  替换为(原样保留 + 追加背景功能段):

  ```
  A Spinify-style sales leaderboard for real-estate offices. An office TV runs a
  full-screen, esports-styled carousel of sales scorecards, leaderboards, team
  goal progress and announcements — and the moment a sale is recorded in the admin
  console, every TV interrupts its carousel to play a full-screen celebration
  with the agent's personal anthem.

  Every TV page (carousel, pairing screen and the offline state) renders on an
  animated city-skyline background: the palette follows the real local time of
  day (dawn → morning → midday → golden hour → sunset → night, anchored on the
  day's actual sunrise/sunset) and layers live weather effects — rain, wind-blown
  clouds, lightning, snow, fog and clear night stars — from Open-Meteo, defaulting
  to Hobart (`WEATHER_LAT` / `WEATHER_LON` to change the location). A failing
  weather link never affects the data display: the TV falls back to a clear sky
  with fixed 06:30/19:00 sunrise/sunset.
  ```

  ② 再找到(环境变量表最后一行):

  ```
  | `R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_PUBLIC_BASE_URL` | Cloudflare R2 credentials, required when `STORAGE_DRIVER=s3` |
  ```

  替换为:

  ```
  | `R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_PUBLIC_BASE_URL` | Cloudflare R2 credentials, required when `STORAGE_DRIVER=s3` |
  | `WEATHER_LAT` / `WEATHER_LON` | Coordinates for the TV background's live weather (default Hobart `-42.8794` / `147.3294`) |
  ```

  ③ 修改 `.env.example`。找到(文件末尾):

  ```
  # Storage: local | s3
  STORAGE_DRIVER=local
  # R2_ENDPOINT=https://<account>.r2.cloudflarestorage.com
  # R2_BUCKET=tv-saas
  # R2_ACCESS_KEY_ID=
  # R2_SECRET_ACCESS_KEY=
  # R2_PUBLIC_BASE_URL=https://files.example.com
  ```

  替换为(原样保留 + 追加):

  ```
  # Storage: local | s3
  STORAGE_DRIVER=local
  # R2_ENDPOINT=https://<account>.r2.cloudflarestorage.com
  # R2_BUCKET=tv-saas
  # R2_ACCESS_KEY_ID=
  # R2_SECRET_ACCESS_KEY=
  # R2_PUBLIC_BASE_URL=https://files.example.com

  # TV skyline background weather (Open-Meteo, keyless). Defaults to Hobart.
  # WEATHER_LAT=-42.8794
  # WEATHER_LON=147.3294
  ```

- [ ] **Step 3: 全仓校验 + 全量 E2E(一次性)**

  ```bash
  npx tsc --noEmit
  npx vitest run
  npm run build
  npm run test:e2e
  ```

  预期:tsc 零输出;全量 **25 files / 329 tests** 全绿;build exit 0;Playwright **6 passed**(约 8–10 分钟;offline 用例自身要 3–4 分钟,勿提前中断)。
  若有红:按 superpowers:systematic-debugging 定位(先重跑单条 `npx playwright test -g "<用例名>"` 排除环境/超时抖动);确需代码修复时,修复 + 全量 vitest/E2E 重验后以独立 commit 提交(例:`fix: e2e regression after skyline background`)。

- [ ] **Step 4: Commit**

  ```bash
  git add src/components/tv/slides/LeaderboardSlide.tsx src/components/tv/slides/ScorecardSlide.tsx src/components/tv/slides/GoalSlide.tsx src/components/tv/slides/AnnouncementSlide.tsx src/components/tv/PairingScreen.tsx src/components/tv/TvApp.tsx src/components/tv/OfflineBadge.tsx README.md .env.example
  git commit -m "feat: translucent tv panels over skyline background + weather env docs"
  ```

---
## Self-Review(计划完成后自查,已执行)

1. **Spec 覆盖**:§1 需求(全部 TV 页面/时间推移/Hobart 天气/后台不变)→ Task 2 三分支挂载 + 纯自动时间驱动,admin 零改动;§2 场景渲染 → SkylineBackground 全要素(天空渐变/日月+光晕/星/2–5 朵椭圆簇流云/三层固定种子楼群+天线/窗灯渐次点亮+低频闪烁/地平线雾霭/vignette)与全部性能约束(离屏缓存重绘条件 = resize/t 跨 0.015 步进/闪烁纪元/云量档、DPR≤1.5、隔帧 30fps、粒子 300/150/140 封顶、paused);§3 数据链路 → Task 1 route+cache(URL 逐字、Hobart 默认+env 覆盖、globalThis 10 分钟、stale、503)+ Task 2 TvApp 10 分钟轮询(独立 effect,失败沿用/null 按晴);§4 映射表 → weather.ts 全表 + 风阈值 + 雷暴 6–18s/2–3 帧/分叉/楼缘高亮 + 雨强制云量 + 压灰(grayMix);§5 可读性 → 压暗幕 rgba(6,8,15,dim) 白天 0.45/夜 0.35 随 t 插值(dim 进 KEYS)+ Task 3 八处面板半透(榜单行/汇总块/表格/目标卡/公告卡/配对码格/角标/OFFLINE)+ 庆祝 overlay 不动;§6 结构 → 文件一一对应(weatherCache.ts 为 Next 15 route 导出白名单所迫的既定偏差,已在 Architecture 说明);§7 测试 → 32 个新单测覆盖列出的全部边界,canvas 无单测但有 build 门禁,E2E 6 条零改动预期;§8 非目标(图标/滑杆/admin 背景/多城市/声音)未引入;§9 成功标准 → Task 3 Step 3 全量门禁。
2. **占位符扫描**:无 TBD/TODO/"自行调整"/"similar to";KEYS 六帧数值全部写死;SkylineBackground/palette/weather/weatherCache/route/三个测试文件均为完整可粘贴代码;所有 Modify 锚点逐字取自当前工作区。
3. **类型/命名一致性**:`TvWeather` 在 types.ts 定义,weatherCache/TvApp/SkylineBackground 三处 import 同名;`SceneEffects` 字段(rain/snow/thunder/wind/cloudiness/fog)在 weather.ts 与组件用法一致;`getWeather(nowMs)`/`resetWeatherCache`/`WEATHER_TTL_MS` 在 lib 与测试一致;`phaseFromClock(now, sunrise?, sunset?)`/`nightProgress`/`sunPosition(t, nightT?)`/`getPalette(t)`/`KEYS` 在 palette.ts、测试与组件一致;Palette 字段名(skyTop/skyHor/sun/glow/buildingFar/Mid/Near/window/windowLit/star/haze/hazeAlpha/dim)三处一致;Task 2 的 `className="h-full w-full"` 锚点在 TvApp 唯一(slide 组件内的 `h-full w-full` 均带 `flex … flex-col` 前缀,不冲突);Task 3 的角标锚点含 style 行保证唯一。
