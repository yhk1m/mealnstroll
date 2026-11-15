// © 2026 김용현
import { inPoly } from './geom.js';

const MAX_PTS = 32;
const PAD = 0.5;

function nearEdge(x, z, ring, pad) {
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, az] = ring[j], [bx, bz] = ring[i];
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
    if (Math.hypot(ax + dx * t - x, az + dz * t - z) < pad) return true;
  }
  return false;
}

export function createNavGrid({ bounds, blocked, cell = 1 }) {
  const W = Math.ceil((bounds.maxX - bounds.minX) / cell);
  const H = Math.ceil((bounds.maxZ - bounds.minZ) / cell);
  const open = new Uint8Array(W * H);
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const x = bounds.minX + (i + 0.5) * cell, z = bounds.minZ + (j + 0.5) * cell;
      open[j * W + i] = blocked.some((r) => inPoly(x, z, r) || nearEdge(x, z, r, PAD)) ? 0 : 1;
    }
  }
  const ci = (x) => Math.floor((x - bounds.minX) / cell);
  const cj = (z) => Math.floor((z - bounds.minZ) / cell);
  const inside = (i, j) => i >= 0 && j >= 0 && i < W && j < H;
  const isOpen = (i, j) => inside(i, j) && open[j * W + i] === 1;
  const center = (i, j) => [bounds.minX + (i + 0.5) * cell, bounds.minZ + (j + 0.5) * cell];

  const walkable = (x, z) => isOpen(ci(x), cj(z));

  function snap(x, z) {
    let i = Math.max(0, Math.min(W - 1, ci(x))), j = Math.max(0, Math.min(H - 1, cj(z)));
    if (isOpen(i, j)) return [i, j];
    for (let r = 1; r < Math.max(W, H); r++) {
      let best = null, bd = Infinity;
      for (let dj = -r; dj <= r; dj++) {
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r || !isOpen(i + di, j + dj)) continue;
          const d = di * di + dj * dj;
          if (d < bd) { bd = d; best = [i + di, j + dj]; }
        }
      }
      if (best) return best;
    }
    return null;
  }

  function lineOpen(a, b) {
    const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (cell * 0.25)) || 1;
    for (let k = 0; k <= n; k++) {
      const x = a[0] + ((b[0] - a[0]) * k) / n, z = a[1] + ((b[1] - a[1]) * k) / n;
      if (!walkable(x, z)) return false;
    }
    return true;
  }

  function astar(s, g) {
    const N = W * H, gScore = new Float32Array(N).fill(Infinity), came = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const heap = []; // [f, idx]
    const push = (f, idx) => { heap.push([f, idx]); let c = heap.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (heap[p][0] <= heap[c][0]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let c = 0; for (;;) { const l = 2 * c + 1, r = l + 1; let m = c; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === c) break; [heap[m], heap[c]] = [heap[c], heap[m]]; c = m; } } return top; };
    const h = (i, j) => { const dx = Math.abs(i - g[0]), dj = Math.abs(j - g[1]); return Math.max(dx, dj) + (Math.SQRT2 - 1) * Math.min(dx, dj); };
    const sIdx = s[1] * W + s[0], gIdx = g[1] * W + g[0];
    gScore[sIdx] = 0; push(h(s[0], s[1]), sIdx);
    while (heap.length) {
      const [, idx] = pop();
      if (closed[idx]) continue;
      if (idx === gIdx) break;
      closed[idx] = 1;
      const i = idx % W, j = (idx / W) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = i + di, nj = j + dj;
        if (!isOpen(ni, nj)) continue;
        if (di && dj && (!isOpen(i + di, j) || !isOpen(i, j + dj))) continue;
        const nIdx = nj * W + ni, cost = gScore[idx] + (di && dj ? Math.SQRT2 : 1);
        if (cost < gScore[nIdx]) { gScore[nIdx] = cost; came[nIdx] = idx; push(cost + h(ni, nj), nIdx); }
      }
    }
    if (gScore[gIdx] === Infinity) return null;
    const cells = [];
    for (let idx = gIdx; idx !== -1; idx = came[idx]) cells.push(center(idx % W, (idx / W) | 0));
    return cells.reverse();
  }

  function simplify(pts) {
    const out = [pts[0]];
    let k = 0;
    while (k < pts.length - 1) {
      let far = k + 1;
      for (let m = pts.length - 1; m > k + 1; m--) if (lineOpen(pts[k], pts[m])) { far = m; break; }
      out.push(pts[far]);
      k = far;
    }
    if (out.length > MAX_PTS) return out.slice(0, MAX_PTS - 1).concat([out[out.length - 1]]);
    return out;
  }

  function findPath(from, to) {
    const s = snap(from[0], from[1]), g = snap(to[0], to[1]);
    if (!s || !g) return null;
    const cells = astar(s, g);
    if (!cells) return null;
    cells[0] = walkable(from[0], from[1]) ? [from[0], from[1]] : cells[0];
    const round = (p) => [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10];
    return simplify(cells).map(round);
  }

  return { walkable, findPath };
}
