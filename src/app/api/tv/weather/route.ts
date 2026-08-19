import { getWeather } from '@/lib/scene/weatherCache';

// GET /api/tv/weather(天际线设计 §3):无鉴权——公开气象数据,与 TV 配对状态无关。
// 上游失败回上次成功缓存(顶层 stale: true),从未成功过 503
// (TV 端据此按"晴"+ 回落日出日落渲染,任何故障不影响数据展示)。
export async function GET(): Promise<Response> {
  const result = await getWeather();
  if (!result) return Response.json({ error: 'Weather unavailable' }, { status: 503 });
  return Response.json(result.stale ? { data: result.payload, stale: true } : { data: result.payload });
}
