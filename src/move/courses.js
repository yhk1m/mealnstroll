// © 2026 김용현
import { dist, headingOf } from './geom.js';

export const COURSE_NAMES = { track: '운동장 트랙', campus: '건물 주변', outside: '학교 밖', road: '학교 안 길' };

// Builds cumulative lengths for closed rings and lookup helpers.
export function makeCourses(rings) {
  const info = {};
  for (const key of Object.keys(rings)) {
    const pts = rings[key], len = [0];
    for (let i = 0; i < pts.length; i++) len.push(len[i] + dist(pts[i], pts[(i + 1) % pts.length]));
    info[key] = { pts, len, loop: len[pts.length] };
  }
  const get = (key) => {
    const c = info[key];
    if (!c) throw new Error('unknown course: ' + key);
    return c;
  };
  function pointOnCourse(key, s) {
    const c = get(key);
    s = ((s % c.loop) + c.loop) % c.loop;
    let lo = 0, hi = c.pts.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (c.len[m] <= s) lo = m; else hi = m - 1; }
    const a = c.pts[lo], b = c.pts[(lo + 1) % c.pts.length];
    const t = (s - c.len[lo]) / (c.len[lo + 1] - c.len[lo] || 1);
    return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, heading: headingOf(b[0] - a[0], b[1] - a[1]) };
  }
  function nearestOnCourse(key, x, z) {
    const c = get(key);
    let best = 0, bd = Infinity;
    for (let i = 0; i < c.pts.length; i++) {
      const a = c.pts[i], b = c.pts[(i + 1) % c.pts.length];
      const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2));
      const px = a[0] + dx * t, pz = a[1] + dz * t, d = Math.hypot(px - x, pz - z);
      if (d < bd) { bd = d; best = c.len[i] + Math.sqrt(l2) * t; }
    }
    return best;
  }
  return { ...info, keys: Object.keys(info), pointOnCourse, nearestOnCourse };
}
