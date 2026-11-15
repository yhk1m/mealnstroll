// © 2026 김용현
import { dist, headingOf } from './geom.js';

export const PACES = { slow: 0.7, normal: 1, fast: 1.4 };

function pathLength(pts) {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += dist(pts[i - 1], pts[i]);
  return l;
}

export function goDuration(m) {
  return (pathLength(m.pts) / m.speed) * 1000;
}

export function createMotionMath(courses) {
  function along(pts, s) {
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], l = dist(a, b);
      if (s <= l || i === pts.length - 1) {
        const t = l ? Math.min(1, s / l) : 1;
        return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, heading: headingOf(b[0] - a[0], b[1] - a[1]) };
      }
      s -= l;
    }
  }

  function onCourse(course, offset, speed, elapsedMs) {
    const p = courses.pointOnCourse(course, offset + (speed * Math.max(0, elapsedMs)) / 1000);
    return { x: p.x, z: p.z, heading: p.heading, moving: true, speed };
  }

  function positionAt(m, t) {
    if (m.kind === 'idle') return { x: m.at[0], z: m.at[1], heading: m.face || 0, moving: false, speed: 0 };
    if (m.kind === 'course') return onCourse(m.course, m.offset || 0, m.speed, t - m.t0);
    // go
    const pts = m.pts;
    if (pts.length < 2) return { x: pts[0][0], z: pts[0][1], heading: 0, moving: false, speed: 0 };
    const total = pathLength(pts);
    const s = (m.speed * (t - m.t0)) / 1000;
    if (s <= 0) {
      const p = along(pts, 0);
      return { ...p, moving: false, speed: 0 };
    }
    if (s >= total) {
      if (m.then) return onCourse(m.then.course, m.then.offset || 0, m.speed, t - m.t0 - (total / m.speed) * 1000);
      const p = along(pts, total);
      return { ...p, moving: false, speed: 0 };
    }
    return { ...along(pts, s), moving: true, speed: m.speed };
  }

  return { positionAt, goDuration };
}
