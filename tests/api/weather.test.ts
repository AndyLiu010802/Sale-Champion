import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/tv/weather/route';
import { WEATHER_FETCH_TIMEOUT_MS, WEATHER_TTL_MS, getWeather, resetWeatherCache } from '@/lib/scene/weatherCache';

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
    // 上游 URL 逐字(设计 §3;默认 Hobart 坐标)。第二参是超时用的 AbortSignal(见下方超时用例)。
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.open-meteo.com/v1/forecast?latitude=-42.8794&longitude=147.3294&current=weather_code,wind_speed_10m,is_day&daily=sunrise,sunset&forecast_days=1&timezone=auto',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('honours WEATHER_LAT/WEATHER_LON overrides', async () => {
    process.env.WEATHER_LAT = '-33.8688';
    process.env.WEATHER_LON = '151.2093';
    try {
      await GET();
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.open-meteo.com/v1/forecast?latitude=-33.8688&longitude=151.2093&current=weather_code,wind_speed_10m,is_day&daily=sunrise,sunset&forecast_days=1&timezone=auto',
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
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

  it('falls back to the last good payload with stale: true when the upstream request hangs past the 5s timeout', async () => {
    expect(await getWeather(0)).toEqual({ payload: expectedPayload, stale: false });

    // 上游这次挂起不响应,只有收到 abort 信号才 reject——模拟真实网络卡死(而非快速失败)。
    fetchMock.mockImplementation(
      (_url: string, init?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );

    vi.useFakeTimers();
    try {
      const pending = getWeather(WEATHER_TTL_MS); // 缓存过期,触发上游请求(挂起)
      await vi.advanceTimersByTimeAsync(WEATHER_FETCH_TIMEOUT_MS);
      expect(await pending).toEqual({ payload: expectedPayload, stale: true });
    } finally {
      vi.useRealTimers();
    }
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
