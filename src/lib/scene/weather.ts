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
