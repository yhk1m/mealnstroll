// © 2026 김용현
const OUTFITS = 8;
const fin = (n) => typeof n === 'number' && Number.isFinite(n);

export function createValidator({ bounds, courses }) {
  const known = new Set(courses);
  const inB = (p) => Array.isArray(p) && p.length === 2 && fin(p[0]) && fin(p[1]) &&
    p[0] >= bounds.minX && p[0] <= bounds.maxX && p[1] >= bounds.minZ && p[1] <= bounds.maxZ;
  const okSpeed = (s) => fin(s) && s >= 0.3 && s <= 3;
  const okThen = (t) => t === undefined || (t && known.has(t.course) && (t.offset === undefined || fin(t.offset)));

  function motion(m) {
    if (!m || typeof m !== 'object') return null;
    if (m.kind === 'idle') {
      if (!inB(m.at)) return null;
      return { kind: 'idle', at: [m.at[0], m.at[1]], face: fin(m.face) ? m.face : 0 };
    }
    if (m.kind === 'go') {
      if (!Array.isArray(m.pts) || m.pts.length < 2 || m.pts.length > 32 || !m.pts.every(inB)) return null;
      if (!okSpeed(m.speed) || !fin(m.t0) || !okThen(m.then)) return null;
      const out = { kind: 'go', pts: m.pts.map((p) => [p[0], p[1]]), speed: m.speed, t0: m.t0 };
      if (m.then) out.then = { course: m.then.course, offset: fin(m.then.offset) ? m.then.offset : 0 };
      return out;
    }
    if (m.kind === 'course') {
      if (!known.has(m.course) || !okSpeed(m.speed) || !fin(m.t0)) return null;
      return { kind: 'course', course: m.course, speed: m.speed, t0: m.t0, offset: fin(m.offset) ? m.offset : 0 };
    }
    return null;
  }

  function profile(p) {
    const name = typeof p?.name === 'string' && p.name.trim() ? p.name.trim().slice(0, 12) : '산책자';
    const outfit = Number.isInteger(p?.outfit) && p.outfit >= 0 && p.outfit < OUTFITS ? p.outfit : 0;
    const joinedAt = fin(p?.joinedAt) ? p.joinedAt : 0;
    return { name, outfit, joinedAt };
  }

  return { motion, profile };
}
