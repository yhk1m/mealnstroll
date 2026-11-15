// © 2026 김용현
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeCourses } from '../src/move/courses.js';
import { createMotionMath } from '../src/move/motion.js';

const C = makeCourses({ sq: [[0, 0], [10, 0], [10, 10], [0, 10]] });
const { positionAt, goDuration } = createMotionMath(C);
const near = (a, b) => Math.abs(a - b) < 1e-6;

test('idle stays put and faces its direction', () => {
  const p = positionAt({ kind: 'idle', at: [3, 4], face: 1 }, 99999);
  assert.deepEqual([p.x, p.z, p.heading, p.moving, p.speed], [3, 4, 1, false, 0]);
});

test('go is at the start before t0', () => {
  const m = { kind: 'go', pts: [[0, 0], [10, 0]], speed: 1, t0: 1000 };
  const p = positionAt(m, 0);
  assert.deepEqual([p.x, p.z, p.moving], [0, 0, false]);
});

test('go walks along its points', () => {
  const m = { kind: 'go', pts: [[0, 0], [10, 0], [10, 10]], speed: 2, t0: 0 };
  const p = positionAt(m, 7000); // 14 m
  assert.ok(near(p.x, 10) && near(p.z, 4));
  assert.equal(p.moving, true);
  assert.ok(near(p.heading, 0)); // walking +z
  assert.equal(p.speed, 2);
});

test('go stops at the last point', () => {
  const m = { kind: 'go', pts: [[0, 0], [10, 0]], speed: 1, t0: 0 };
  const p = positionAt(m, 60000);
  assert.deepEqual([p.x, p.z, p.moving], [10, 0, false]);
  assert.ok(near(p.heading, Math.PI / 2));
});

test('goDuration is length over speed in ms', () => {
  assert.equal(goDuration({ pts: [[0, 0], [10, 0]], speed: 2 }), 5000);
});

test('course keeps looping from offset', () => {
  const m = { kind: 'course', course: 'sq', speed: 1, t0: 0, offset: 5 };
  const p = positionAt(m, 40000); // 5 + 40 = 45 m on a 40 m loop wraps to 5 m
  assert.ok(near(p.x, 5) && near(p.z, 0));
  assert.equal(p.moving, true);
});

test('go with then joins the course on arrival', () => {
  const m = { kind: 'go', pts: [[0, -4], [0, 0]], speed: 1, t0: 0, then: { course: 'sq', offset: 0 } };
  const p = positionAt(m, 4000 + 3000); // arrive at 4 s, then 3 m along the ring
  assert.ok(near(p.x, 3) && near(p.z, 0));
  assert.equal(p.moving, true);
});

test('single-point go is treated as standing', () => {
  const p = positionAt({ kind: 'go', pts: [[2, 2]], speed: 1, t0: 0 }, 5);
  assert.deepEqual([p.x, p.z, p.moving], [2, 2, false]);
});
