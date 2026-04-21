// © 2026 김용현
// Fortune engine: deterministic daily picks from FORTUNES pool based on
// profile + date. Same profile + same day → same result.

import { FORTUNES, fakeIljin } from './fortunes.js';

const PROFILE_KEY = 'teacherFortune_profile';

export function loadFortuneProfile() {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveFortuneProfile(profile) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

export function clearFortuneProfile() {
  localStorage.removeItem(PROFILE_KEY);
}

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function matchesSchool(itemTag, schoolLevel) {
  if (itemTag === undefined || itemTag === 'any') return true;
  if (Array.isArray(itemTag)) return itemTag.includes(schoolLevel);
  return itemTag === schoolLevel;
}

function matchesHomeroom(itemTag, profile) {
  if (itemTag === undefined || itemTag === 'any') return true;
  const isHomeroom = (profile.homeroom || 0) > 0;
  if (itemTag === 'homeroom') return isHomeroom;
  if (itemTag === 'non-homeroom') return !isHomeroom;
  if (Array.isArray(itemTag)) return isHomeroom && itemTag.includes(profile.homeroom);
  return false;
}

function matchesSubject(itemTag, subject) {
  if (itemTag === undefined || itemTag === 'any') return true;
  if (Array.isArray(itemTag)) return itemTag.includes(subject);
  return itemTag === subject;
}

function filterPool(pool, profile) {
  return pool.filter(item =>
    matchesSchool(item.school, profile.schoolLevel) &&
    matchesHomeroom(item.homeroom, profile) &&
    matchesSubject(item.subject, profile.subject)
  );
}

function pickFrom(pool, profile, seed) {
  const filtered = filterPool(pool, profile);
  const usable = filtered.length ? filtered : pool;
  const rng = mulberry32(seed);
  return usable[Math.floor(rng() * usable.length)];
}

function pickStars(rng) {
  const r = rng();
  if (r < 0.05) return 1;
  if (r < 0.20) return 2;
  if (r < 0.60) return 3;
  if (r < 0.90) return 4;
  return 5;
}

function generateSeed(profile, date) {
  const dateStr = date.toISOString().slice(0, 10);
  const raw = [
    profile.birthYear,
    profile.birthMonth,
    profile.birthDay,
    profile.birthHour ?? 'X',
    profile.gender,
    dateStr
  ].join('-');
  return hashString(raw);
}

export function buildFortune(profile, date = new Date()) {
  const baseSeed = generateSeed(profile, date);
  const starCats = ['class', 'student', 'office', 'work', 'money', 'romance'];

  const out = {};
  const starsList = [];

  for (const cat of starCats) {
    const pickSeed = hashString(baseSeed + cat + 'pick');
    const starSeed = hashString(baseSeed + cat + 'star');
    const item = pickFrom(FORTUNES[cat], profile, pickSeed);
    const stars = pickStars(mulberry32(starSeed));
    out[cat] = { ...item, stars };
    starsList.push(stars);
  }

  out.item = pickFrom(FORTUNES.item, profile, hashString(baseSeed + 'item'));
  out.quote = pickFrom(FORTUNES.quote, profile, hashString(baseSeed + 'quote'));
  out.tip = pickFrom(FORTUNES.tip, profile, hashString(baseSeed + 'tip'));

  const totalStars = Math.round(starsList.reduce((a, b) => a + b, 0) / starsList.length);
  const totalItem = pickFrom(FORTUNES.total, profile, hashString(baseSeed + 'total'));
  out.total = { ...totalItem, stars: totalStars };

  return {
    date,
    iljin: fakeIljin(date),
    ...out
  };
}

// Format: "2026년 4월 21일 (화요일)"
export function formatKoreanDate(date) {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const days = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
  return `${y}년 ${m}월 ${d}일 (${days[date.getDay()]})`;
}

export function renderStars(count) {
  const filled = '⭐'.repeat(count);
  const empty = '☆'.repeat(5 - count);
  return filled + empty;
}

// --- Profile validation ---
export function validateProfile(p) {
  const errors = {};
  const now = new Date();
  const maxYear = now.getFullYear() - 20;

  if (!p.birthYear || p.birthYear < 1940 || p.birthYear > maxYear) {
    errors.birthYear = '연도를 확인해주세요';
  }
  if (!p.birthMonth || p.birthMonth < 1 || p.birthMonth > 12) {
    errors.birthMonth = '월을 선택해주세요';
  }
  if (!p.birthDay || p.birthDay < 1 || p.birthDay > 31) {
    errors.birthDay = '일을 선택해주세요';
  }
  if (p.birthYear && p.birthMonth && p.birthDay) {
    const d = new Date(p.birthYear, p.birthMonth - 1, p.birthDay);
    if (d.getMonth() !== p.birthMonth - 1 || d.getDate() !== p.birthDay) {
      errors.birthDay = '존재하지 않는 날짜입니다';
    }
    if (d > now) errors.birthDay = '미래 날짜는 입력할 수 없어요';
  }
  if (p.gender !== 'M' && p.gender !== 'F') errors.gender = '성별을 선택해주세요';
  if (!['E', 'M', 'H'].includes(p.schoolLevel)) errors.schoolLevel = '학교급을 선택해주세요';
  if (typeof p.homeroom !== 'number' || p.homeroom < 0) errors.homeroom = '담임 여부를 선택해주세요';
  const subjects = ['korean', 'math', 'english', 'social', 'science', 'pe', 'arts', 'tech', 'language', 'special'];
  if (!subjects.includes(p.subject)) errors.subject = '담당 교과군을 선택해주세요';

  return { ok: Object.keys(errors).length === 0, errors };
}
