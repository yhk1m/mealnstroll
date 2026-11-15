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
