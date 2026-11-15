// © 2026 김용현
import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchLiveWeather, kindOfCode, sunTimes, skyAt, seoulParts, skyNow, resolveWorld } from '../src/world/sky-clock.js';

test('weather codes', () => {
  assert.equal(kindOfCode(0), 'clear');
  assert.equal(kindOfCode(3), 'cloudy');
  assert.equal(kindOfCode(45), 'fog');
  assert.equal(kindOfCode(73), 'snow');
  assert.equal(kindOfCode(61), 'rain');
});

test('sun rises before it sets, near 6-7 am in June', () => {
  const t = sunTimes(172);
  assert.ok(t.rise > 4.5 * 60 && t.rise < 6 * 60, String(t.rise));
  assert.ok(t.set > 19 * 60 && t.set < 20.5 * 60, String(t.set));
});

test('skyAt picks day, sunset, night', () => {
  const t = { rise: 360, set: 1140 };
  assert.equal(skyAt(720, t), 'day');
  assert.equal(skyAt(1100, t), 'sunset');
  assert.equal(skyAt(60, t), 'night');
  assert.equal(skyAt(370, t), 'dawn');
});

test('seoulParts shifts UTC by 9 hours', () => {
  const p = seoulParts(Date.UTC(2026, 11, 24, 15, 30)); // 00:30 on the 25th in Seoul
  assert.deepEqual([p.m, p.d, p.minute], [12, 25, 30]);
});

test('skyNow maps dawn to sunset sky with a dawn flag', () => {
  const r = skyNow(Date.UTC(2026, 5, 21, 20, 20)); // 05:20 KST, around sunrise in June
  assert.equal(r.time, 'sunset');
  assert.equal(r.dawn, true);
});

test('resolveWorld: live snow, winter, christmas', () => {
  const w = resolveWorld({ ms: Date.UTC(2026, 11, 24, 3), live: { code: 73, wind: 5, depth: 0 } });
  assert.deepEqual(w, { kind: 'snow', cover: 1, wind: 5, season: 'winter', xmas: true });
});

test('resolveWorld: lying snow from depth only', () => {
  const w = resolveWorld({ ms: Date.UTC(2026, 0, 10, 3), live: { code: 0, wind: 3, depth: 0.006 } });
  assert.equal(w.cover, 1);
  assert.equal(w.kind, 'clear');
});

test('resolveWorld: no live data is clear and season by date', () => {
  const w = resolveWorld({ ms: Date.UTC(2026, 9, 15, 3), live: null });
  assert.deepEqual(w, { kind: 'clear', cover: 0, wind: 10, season: 'autumn', xmas: false });
});

test('resolveWorld: preview overrides from #wx and #season', () => {
  const w = resolveWorld({ ms: Date.UTC(2026, 6, 1, 3), live: null, wxMode: 'snow', seasonMode: 'winter' });
  assert.deepEqual([w.kind, w.cover, w.season], ['snow', 1, 'winter']);
});

test('fetchLiveWeather rejects data without finite code or wind', async () => {
  const mk = (current) => async () => ({ ok: true, json: async () => ({ current }) });
  const good = await fetchLiveWeather(mk({ weather_code: 3, temperature_2m: 5, wind_speed_10m: 4 }));
  assert.equal(good.code, 3);
  await assert.rejects(() => fetchLiveWeather(mk({ weather_code: null, wind_speed_10m: 4 })));
  await assert.rejects(() => fetchLiveWeather(mk({ weather_code: 3 })));
});
