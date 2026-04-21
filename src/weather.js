// © 2026 김용현
// Fetch current weather (Open-Meteo, no key required) and map to a decor type.

const DEFAULT_LAT = 37.5665; // Seoul City Hall
const DEFAULT_LON = 126.9780;

export async function getLocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({ lat: DEFAULT_LAT, lon: DEFAULT_LON, fallback: true });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => resolve({ lat: DEFAULT_LAT, lon: DEFAULT_LON, fallback: true }),
      { timeout: 4000, maximumAge: 15 * 60 * 1000 }
    );
  });
}

export async function fetchWeather(lat, lon) {
  try {
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=weather_code,wind_speed_10m,temperature_2m&timezone=auto`;
    const airUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=pm10&timezone=auto`;
    const [w, a] = await Promise.all([
      fetch(weatherUrl).then((r) => r.json()),
      fetch(airUrl).then((r) => r.json()).catch(() => null)
    ]);
    return {
      code: w?.current?.weather_code,
      windMps: w?.current?.wind_speed_10m,
      tempC: w?.current?.temperature_2m,
      pm10: a?.current?.pm10
    };
  } catch {
    return null;
  }
}

// Map weather + air quality + season to one of:
// 'sun' | 'clouds' | 'rain' | 'thunder' | 'snow' | 'fog' | 'typhoon' | 'dust' | 'leaves'
export function decorFromWeather(w, date = new Date()) {
  if (!w || w.code === undefined) return { decor: 'sun', label: '맑음' };
  const { code, windMps = 0, pm10 } = w;
  const m = date.getMonth() + 1;

  if (pm10 !== undefined && pm10 >= 150) return { decor: 'dust', label: '황사·미세먼지 심함' };
  if (code >= 95 && code <= 99) return { decor: 'thunder', label: '번개·천둥' };
  if ((code >= 71 && code <= 77) || (code === 85) || (code === 86)) return { decor: 'snow', label: '눈' };
  // Heavy rain + strong wind → typhoon feel (m/s; 14 m/s ≈ 50 km/h)
  if (((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) && windMps >= 14) {
    return { decor: 'typhoon', label: '태풍' };
  }
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return { decor: 'rain', label: '비' };
  if (code === 45 || code === 48) return { decor: 'fog', label: '안개' };
  if (code === 2 || code === 3) return { decor: 'clouds', label: '구름 많음' };
  // Clear: autumn + some wind adds fallen leaves on top; otherwise sun
  if (m >= 10 && m <= 11 && windMps >= 3) return { decor: 'leaves', label: '낙엽' };
  return { decor: 'sun', label: '맑음' };
}
