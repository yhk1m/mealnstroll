// © 2026 김용현
import test from 'node:test';
import assert from 'node:assert/strict';
import { inPoly } from '../src/move/geom.js';
import { makeCourses } from '../src/move/courses.js';

const square = [[0, 0], [10, 0], [10, 10], [0, 10]];
const C = makeCourses({ sq: square });

test('inPoly: inside and outside', () => {
  assert.equal(inPoly(5, 5, square), true);
  assert.equal(inPoly(15, 5, square), false);
});

test('course loop length closes the ring', () => {
  assert.equal(C.sq.loop, 40);
});

test('pointOnCourse walks the ring and wraps', () => {
  const p = C.pointOnCourse('sq', 15);
  assert.deepEqual([p.x, p.z], [10, 5]);
  const q = C.pointOnCourse('sq', 45);
  assert.deepEqual([q.x, q.z], [5, 0]);
  const r = C.pointOnCourse('sq', -5);
  assert.deepEqual([r.x, r.z], [0, 5]);
});

test('pointOnCourse gives heading along the segment', () => {
  const p = C.pointOnCourse('sq', 5); // moving +x
  assert.ok(Math.abs(p.heading - Math.PI / 2) < 1e-9);
});

test('nearestOnCourse returns distance along the ring', () => {
  assert.equal(C.nearestOnCourse('sq', 10.5, 6), 16);
});

test('unknown course throws', () => {
  assert.throws(() => C.pointOnCourse('nope', 0));
});
