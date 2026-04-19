// © 2026 김용현
const THEMES = {
  spring: {
    sky: '#d9efff',
    ground: '#b8e3a8',
    track: '#e8c38a',
    schoolWall: '#fff5d6',
    schoolRoof: '#d76b5d',
    decor: 'petals',
    label: '봄'
  },
  summer: {
    sky: '#b9e3ff',
    ground: '#8fd47a',
    track: '#d8a860',
    schoolWall: '#fff5d6',
    schoolRoof: '#c24c3e',
    decor: 'sun',
    label: '여름'
  },
  autumn: {
    sky: '#fbe4c2',
    ground: '#c9b46a',
    track: '#c4925a',
    schoolWall: '#fde9c2',
    schoolRoof: '#a34836',
    decor: 'leaves',
    label: '가을'
  },
  winter: {
    sky: '#e6f0fa',
    ground: '#e9f0ec',
    track: '#cfd7de',
    schoolWall: '#fff',
    schoolRoof: '#6b7a89',
    decor: 'snow',
    label: '겨울'
  }
};

export function currentTheme(date = new Date()) {
  const m = date.getMonth() + 1;
  if (m >= 3 && m <= 5) return { key: 'spring', ...THEMES.spring };
  if (m >= 6 && m <= 8) return { key: 'summer', ...THEMES.summer };
  if (m >= 9 && m <= 11) return { key: 'autumn', ...THEMES.autumn };
  return { key: 'winter', ...THEMES.winter };
}

export function applyThemeToCss(theme) {
  const r = document.documentElement.style;
  r.setProperty('--bg-sky', theme.sky);
  r.setProperty('--bg-ground', theme.ground);
  r.setProperty('--bg-track', theme.track);
  r.setProperty('--school-wall', theme.schoolWall);
  r.setProperty('--school-roof', theme.schoolRoof);
}
