// © 2026 김용현
const ADJECTIVES = [
  '산책하는', '배부른', '느긋한', '햇살좋은', '룰루랄라', '사뿐한',
  '해맑은', '걷기왕', '점심후의', '나른한', '흥얼대는', '운동장의',
  '소풍온', '봄맞이', '커피든', '간식찾는', '출근길', '5교시앞둔',
  '수업끝낸', '회의빠진', '종쳐서나온', '업무폭탄의'
];

// Noun ↔ emoji pairs so the label and face always match.
const CHARACTERS = [
  { noun: '선생님', emoji: '👨‍🏫' },
  { noun: '담임', emoji: '👩‍🏫' },
  { noun: '교사', emoji: '🧑‍🏫' },
  { noun: '교감', emoji: '👔' },
  { noun: '교장', emoji: '🎓' },
  { noun: '부장', emoji: '📋' },
  { noun: '보직교사', emoji: '🧑‍💼' },
  { noun: '수업계', emoji: '📅' },
  { noun: '일과계', emoji: '🗓️' },
  { noun: '평가계', emoji: '📊' },
  { noun: '교무부장', emoji: '🗂️' },
  { noun: '생활부장', emoji: '🚨' },
  { noun: '연구부장', emoji: '🔬' },
  { noun: '학년부장', emoji: '📈' },
  { noun: '체육부장', emoji: '⚽' },
  { noun: '분필', emoji: '✏️' },
  { noun: '칠판', emoji: '📝' },
  { noun: '책상', emoji: '🪑' },
  { noun: '의자', emoji: '💺' },
  { noun: '사물함', emoji: '🗄️' },
  { noun: '교과서', emoji: '📚' },
  { noun: '출석부', emoji: '📖' },
  { noun: '교무수첩', emoji: '📔' },
  { noun: '지우개', emoji: '🧽' },
  { noun: '필통', emoji: '🖊️' },
  { noun: '공책', emoji: '📓' },
  { noun: '가방', emoji: '🎒' },
  { noun: '급식', emoji: '🍚' },
  { noun: '우유', emoji: '🥛' },
  { noun: '종소리', emoji: '🔔' },
  { noun: '시간표', emoji: '📆' },
  { noun: '교무실', emoji: '🏫' },
  { noun: '매점', emoji: '🥤' },
  { noun: '운동장', emoji: '🏃' },
  { noun: '도서관', emoji: '📚' },
  { noun: '과학실', emoji: '🧪' },
  { noun: '컴퓨터실', emoji: '💻' },
  { noun: '지구본', emoji: '🌏' },
  { noun: '돋보기', emoji: '🔍' },
  { noun: '자', emoji: '📏' },
  { noun: '가위', emoji: '✂️' },
  { noun: '풀', emoji: '🖇️' }
];

export const PALETTE = [
  '#FF8A80', '#FF80AB', '#EA80FC', '#B388FF', '#8C9EFF',
  '#82B1FF', '#80D8FF', '#84FFFF', '#A7FFEB', '#B9F6CA',
  '#CCFF90', '#F4FF81', '#FFFF8D', '#FFE57F', '#FFD180', '#FF9E80'
];

export function randomInt(min, maxExclusive) {
  return Math.floor(Math.random() * (maxExclusive - min)) + min;
}

export function pick(arr) {
  return arr[randomInt(0, arr.length)];
}

export function randomProfile() {
  const ch = pick(CHARACTERS);
  return {
    name: `${pick(ADJECTIVES)} ${ch.noun}`,
    emoji: ch.emoji,
    color: pick(PALETTE),
    headBg: pick(HEAD_BG_CHOICES)
  };
}

// Unique emoji list for the manual picker. Includes all CHARACTERS emojis
// plus a few seasonal/fun extras.
export const EMOJI_CHOICES = Array.from(new Set([
  ...CHARACTERS.map(c => c.emoji),
  '🍎', '🥨', '🍙', '🍰', '☕', '🫖', '🌳', '🌸', '🍁', '❄️',
  '🎨', '🎵', '⭐', '🌈', '☀️', '🌙', '🦋', '🐦', '🧸', '💡'
]));

// Head background circle color choices. A mix of skin-like and pastel tones.
export const HEAD_BG_CHOICES = [
  '#fff7e8', '#ffe2c2', '#f4cba6', '#d9a37a', '#a8734d',
  '#ffd6e8', '#ffc4d3', '#d0e8ff', '#b8f0d4', '#fff2a6',
  '#e4d4ff', '#ffffff', '#2a2a2a'
];

export const DEFAULT_HEAD_BG = HEAD_BG_CHOICES[0];

// Direction by date: odd day → counterclockwise (negative speed),
// even day → clockwise (positive speed). In our angle system, increasing
// angle traverses right→bottom→left→top on screen, which visually reads as
// clockwise.
export function directionForToday(date = new Date()) {
  return date.getDate() % 2 === 0 ? 1 : -1;
}

export function randomMotion() {
  const speed = 0.07 + Math.random() * 0.06; // rad/sec
  return {
    speed: speed * directionForToday(),
    startedAt: Date.now()
  };
}

const PROFILE_KEY = 'mealnstroll.profile.v2';

export function loadProfile() {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

export function saveProfile(profile) {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  } catch {}
}

export function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'u-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

const BEST_SCORE_KEY = 'mealnstroll.dino.best';

export function loadBestScore() {
  const n = Number(localStorage.getItem(BEST_SCORE_KEY) || 0);
  return Number.isFinite(n) ? n : 0;
}

export function saveBestScore(score) {
  try {
    localStorage.setItem(BEST_SCORE_KEY, String(score));
  } catch {}
}

export function formatTime(ts) {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}
