// © 2026 김용현
const THEMES = {
  // Seasons only set palette — `decor` is overridden by real weather at runtime.
  spring: {
    sky: '#d9efff',
    ground: '#b8e3a8',
    track: '#e8c38a',
    schoolWall: '#fff5d6',
    schoolRoof: '#d76b5d',
    decor: null,
    label: '봄'
  },
  summer: {
    sky: '#b9e3ff',
    ground: '#8fd47a',
    track: '#d8a860',
    schoolWall: '#fff5d6',
    schoolRoof: '#c24c3e',
    decor: null,
    label: '여름'
  },
  autumn: {
    sky: '#fbe4c2',
    ground: '#c9b46a',
    track: '#c4925a',
    schoolWall: '#fde9c2',
    schoolRoof: '#a34836',
    decor: null,
    label: '가을'
  },
  winter: {
    sky: '#e6f0fa',
    ground: '#e9f0ec',
    track: '#cfd7de',
    schoolWall: '#fff',
    schoolRoof: '#6b7a89',
    decor: null,
    label: '겨울'
  }
};

export function currentTheme(date = new Date()) {
  const m = date.getMonth() + 1;
  let base;
  if (m >= 3 && m <= 5) base = { key: 'spring', ...THEMES.spring };
  else if (m >= 6 && m <= 8) base = { key: 'summer', ...THEMES.summer };
  else if (m >= 9 && m <= 11) base = { key: 'autumn', ...THEMES.autumn };
  else base = { key: 'winter', ...THEMES.winter };
  return applyTimeOfDay(base, date);
}

// 0 = normal (day), 1..n = dusk/night overrides.
function darken(hex, factor) {
  const h = (hex || '#888').replace('#', '');
  const r = Math.min(255, Math.max(0, Math.floor(parseInt(h.slice(0, 2), 16) * factor)));
  const g = Math.min(255, Math.max(0, Math.floor(parseInt(h.slice(2, 4), 16) * factor)));
  const b = Math.min(255, Math.max(0, Math.floor(parseInt(h.slice(4, 6), 16) * factor)));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

export function timeOfDay(date = new Date()) {
  const h = date.getHours();
  if (h >= 20 || h < 5) return 'night';
  if (h >= 18) return 'dusk';
  if (h < 7) return 'dawn';
  return 'day';
}

export function applyTimeOfDay(base, date = new Date()) {
  const tod = timeOfDay(date);
  if (tod === 'night') {
    return {
      ...base,
      sky: '#1a2545',
      ground: darken(base.ground, 0.55),
      track: darken(base.track, 0.6),
      schoolWall: darken(base.schoolWall, 0.55),
      schoolRoof: darken(base.schoolRoof, 0.55),
      label: `${base.label} · 밤`,
      timeOfDay: 'night'
    };
  }
  if (tod === 'dusk') {
    return {
      ...base,
      sky: '#f3a770',
      ground: darken(base.ground, 0.82),
      track: darken(base.track, 0.85),
      schoolWall: darken(base.schoolWall, 0.9),
      schoolRoof: darken(base.schoolRoof, 0.9),
      label: `${base.label} · 저녁`,
      timeOfDay: 'dusk'
    };
  }
  if (tod === 'dawn') {
    return {
      ...base,
      sky: '#ffd3b5',
      ground: darken(base.ground, 0.92),
      track: darken(base.track, 0.95),
      label: `${base.label} · 새벽`,
      timeOfDay: 'dawn'
    };
  }
  return { ...base, timeOfDay: 'day' };
}

export function applyThemeToCss(theme) {
  const r = document.documentElement.style;
  r.setProperty('--bg-sky', theme.sky);
  r.setProperty('--bg-ground', theme.ground);
  r.setProperty('--bg-track', theme.track);
  r.setProperty('--school-wall', theme.schoolWall);
  r.setProperty('--school-roof', theme.schoolRoof);
}
