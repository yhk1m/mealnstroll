// © 2026 김용현
const LAT = 37.53, LON = 126.87, rad = Math.PI / 180;

export function kindOfCode(c) {
  if (c <= 1) return 'clear';
  if (c <= 3) return 'cloudy';
  if (c === 45 || c === 48) return 'fog';
  if ((c >= 71 && c <= 77) || c === 85 || c === 86) return 'snow';
  return 'rain';
}

export function seoulParts(ms) {
  const d = new Date(ms + 9 * 3600 * 1000);
  const day = Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(d.getUTCFullYear(), 0, 0)) / 86400000);
  return { m: d.getUTCMonth() + 1, d: d.getUTCDate(), day, minute: d.getUTCHours() * 60 + d.getUTCMinutes() };
}

export function sunTimes(dayOfYear) {
  const B = ((dayOfYear - 81) * 360 / 365) * rad;
  const eqTime = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
  const decl = 23.44 * rad * Math.sin(B);
  const cosH = (Math.sin(-0.833 * rad) - Math.sin(LAT * rad) * Math.sin(decl)) / (Math.cos(LAT * rad) * Math.cos(decl));
  const halfDay = (Math.acos(cosH) / rad) * 4;
  const noon = 720 - 4 * (LON - 135) - eqTime;
  return { rise: noon - halfDay, set: noon + halfDay };
}

export function skyAt(minute, sunT) {
  if (minute >= sunT.set - 70 && minute <= sunT.set + 25) return 'sunset';
  if (minute >= sunT.rise - 25 && minute <= sunT.rise + 35) return 'dawn';
  return minute > sunT.rise && minute < sunT.set ? 'day' : 'night';
}

// The sky for the real Seoul time. Dawn uses the sunset sky, flagged so lights can differ.
export function skyNow(ms) {
  const p = seoulParts(ms);
  const sky = skyAt(p.minute, sunTimes(p.day));
  return { time: sky === 'dawn' ? 'sunset' : sky, dawn: sky === 'dawn' };
}

export function resolveWorld({ ms, live, wxMode = 'live', seasonMode = 'date' }) {
  const now = seoulParts(ms);
  const dateSeason = now.m >= 3 && now.m <= 5 ? 'spring' : now.m >= 6 && now.m <= 9 ? 'summer' : now.m >= 10 && now.m <= 11 ? 'autumn' : 'winter';
  const dateXmas = now.m === 12 && (now.d === 24 || now.d === 25);
  let kind, cover, wind = 10;
  if (wxMode === 'live') {
    kind = live ? kindOfCode(live.code) : 'clear';
    cover = kind === 'snow' || (live && live.depth >= 0.005) ? 1 : 0;
    if (live) wind = live.wind;
  } else if (wxMode === 'xmas') { kind = 'snow'; cover = 1; } else { kind = wxMode; cover = wxMode === 'snow' ? 1 : 0; }
  const season = seasonMode !== 'date' ? seasonMode : wxMode === 'xmas' ? 'winter' : dateSeason;
  return { kind, cover, wind, season, xmas: dateXmas || wxMode === 'xmas' };
}

export const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast?latitude=37.53&longitude=126.87&current=temperature_2m,weather_code,wind_speed_10m,snow_depth&timezone=Asia%2FSeoul&forecast_days=1';

export async function fetchLiveWeather(fetchFn = fetch) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 7000);
  try {
    const res = await fetchFn(WEATHER_URL, { signal: ctl.signal });
    if (!res.ok) throw new Error('status ' + res.status);
    const c = (await res.json()).current;
    return { code: c.weather_code, temp: c.temperature_2m, wind: c.wind_speed_10m, depth: c.snow_depth || 0 };
  } finally {
    clearTimeout(timer);
  }
}
