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
