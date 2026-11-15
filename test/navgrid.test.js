// © 2026 김용현
import test from 'node:test';
import assert from 'node:assert/strict';
import { createNavGrid } from '../src/move/navgrid.js';
import { inPoly } from '../src/move/geom.js';

// 40 x 40 m field with a wall block in the middle (x 15..25, z 0..30).
const wall = [[15, 0], [25, 0], [25, 30], [15, 30]];
const grid = createNavGrid({ bounds: { minX: 0, minZ: 0, maxX: 40, maxZ: 40 }, blocked: [wall], cell: 1 });

const crossesWall = (pts) => {
  for (let i = 1; i < pts.length; i++) {
    const [a, b] = [pts[i - 1], pts[i]];
    for (let k = 0; k <= 50; k++) {
      const x = a[0] + ((b[0] - a[0]) * k) / 50, z = a[1] + ((b[1] - a[1]) * k) / 50;
      if (inPoly(x, z, wall)) return true;
    }
  }
  return false;
};

test('walkable reports open and blocked cells', () => {
  assert.equal(grid.walkable(5, 5), true);
  assert.equal(grid.walkable(20, 10), false);
  assert.equal(grid.walkable(-3, 5), false); // outside bounds
});

test('straight path when nothing is in the way', () => {
  const p = grid.findPath([2, 35], [38, 35]);
  assert.equal(p.length, 2);
});

test('path goes around the wall', () => {
  const p = grid.findPath([5, 5], [35, 5]);
  assert.ok(p.length >= 3);
  assert.equal(crossesWall(p), false);
  const last = p[p.length - 1];
  assert.ok(Math.hypot(last[0] - 35, last[1] - 5) < 1);
});

test('target inside a building snaps to the nearest open cell', () => {
  const p = grid.findPath([5, 5], [20, 15]);
  const last = p[p.length - 1];
  assert.equal(grid.walkable(last[0], last[1]), true);
  assert.ok(Math.abs(last[0] - 20) >= 4); // left or right of the wall
});

test('never more than 32 points', () => {
  const p = grid.findPath([1, 1], [39, 1]);
  assert.ok(p.length <= 32);
});

test('returns null when no open cell is reachable', () => {
  const closed = createNavGrid({ bounds: { minX: 0, minZ: 0, maxX: 10, maxZ: 10 }, blocked: [[[0, 4], [10, 4], [10, 6], [0, 6]]], cell: 1 });
  assert.equal(closed.findPath([5, 1], [5, 9]), null);
});

import { WORLD_BOUNDS, BLOCKED } from '../src/move/world-bounds.js';
import courses from '../src/data/courses.json' with { type: 'json' };

test('real campus grid builds and finds a path quickly', () => {
  const t0 = performance.now();
  const g = createNavGrid({ bounds: WORLD_BOUNDS, blocked: BLOCKED, cell: 1 });
  const built = performance.now() - t0;
  const t1 = performance.now();
  const p = g.findPath([-17.6, 120.8], [-118.5, -30.2]); // track start to campus course start
  const searched = performance.now() - t1;
  assert.ok(p && p.length >= 2);
  assert.ok(built < 1500, `grid took ${built} ms`);
  assert.ok(searched < 150, `search took ${searched} ms`);
});

test('goal uses the exact target point when it is walkable', () => {
  const p = grid.findPath([5, 5], [35.3, 5.3]);
  assert.deepEqual(p[p.length - 1], [35.3, 5.3]);
  const q = grid.findPath([5, 5], [5.2, 5.4]);
  assert.deepEqual(q[q.length - 1], [5.2, 5.4]);
});

test('path over 32 points returns null instead of cutting through walls', () => {
  const walls = [];
  for (let k = 0; k < 20; k++) {
    const x = 3 + k * 4;
    walls.push(k % 2 === 0 ? [[x, 0], [x + 1, 0], [x + 1, 36], [x, 36]] : [[x, 4], [x + 1, 4], [x + 1, 40], [x, 40]]);
  }
  const g = createNavGrid({ bounds: { minX: 0, minZ: 0, maxX: 84, maxZ: 40 }, blocked: walls, cell: 1 });
  assert.equal(g.findPath([1, 20], [82, 20]), null);
});

test('line of sight does not slip through a diagonal pinch', () => {
  const g = createNavGrid({ bounds: { minX: 0, minZ: 0, maxX: 6, maxZ: 6 }, blocked: [], cell: 1 });
  // block cells (2,1) and (1,2) by tiny squares around their centers
  const sq = (cx, cz) => [[cx - 0.4, cz - 0.4], [cx + 0.4, cz - 0.4], [cx + 0.4, cz + 0.4], [cx - 0.4, cz + 0.4]];
  const h = createNavGrid({ bounds: { minX: 0, minZ: 0, maxX: 6, maxZ: 6 }, blocked: [sq(2.5, 1.5), sq(1.5, 2.5)], cell: 1 });
  assert.equal(h.walkable(2.5, 1.5), false);
  assert.equal(h.walkable(1.5, 2.5), false);
  assert.equal(g.findPath([0.5, 0.5], [3.5, 3.5]).length, 2);
  const p = h.findPath([0.5, 0.5], [3.5, 3.5]);
  assert.ok(p.length >= 3, 'straight line through the pinch: ' + JSON.stringify(p));
});

test('all real courses stay on walkable cells', () => {
  const g = createNavGrid({ bounds: WORLD_BOUNDS, blocked: BLOCKED, cell: 1 });
  const bad = [];
  for (const [name, pts] of Object.entries(courses)) {
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length], n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]));
      for (let k = 0; k < Math.max(1, n); k++) {
        const x = a[0] + ((b[0] - a[0]) * k) / Math.max(1, n), z = a[1] + ((b[1] - a[1]) * k) / Math.max(1, n);
        if (!g.walkable(x, z)) bad.push(name + ' ' + x.toFixed(1) + ',' + z.toFixed(1));
      }
    }
  }
  assert.deepEqual(bad.slice(0, 5), []);
});

test('off-campus buildings that overlap the world block cells', () => {
  assert.ok(BLOCKED.length > 13);
});
