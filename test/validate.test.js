// © 2026 김용현
import test from 'node:test';
import assert from 'node:assert/strict';
import { createValidator } from '../src/net/validate.js';

const v = createValidator({ bounds: { minX: -10, maxX: 10, minZ: -10, maxZ: 10 }, courses: ['track', 'campus'] });

test('accepts good motions', () => {
  assert.ok(v.motion({ kind: 'idle', at: [1, 2], face: 0.5 }));
  assert.ok(v.motion({ kind: 'go', pts: [[0, 0], [5, 5]], speed: 1, t0: 1 }));
  assert.ok(v.motion({ kind: 'go', pts: [[0, 0], [5, 5]], speed: 1, t0: 1, then: { course: 'track', offset: 3 } }));
  assert.ok(v.motion({ kind: 'course', course: 'campus', speed: 1.4, t0: 1, offset: 0 }));
});

test('rejects bad motions', () => {
  const bad = [
    null, 'x', { kind: 'fly' },
    { kind: 'idle', at: [99, 0] },
    { kind: 'idle', at: [NaN, 0] },
    { kind: 'go', pts: [[0, 0]], speed: 1, t0: 1 },
    { kind: 'go', pts: Array.from({ length: 33 }, () => [0, 0]), speed: 1, t0: 1 },
    { kind: 'go', pts: [[0, 0], [5, 5]], speed: 9, t0: 1 },
    { kind: 'go', pts: [[0, 0], [5, 5]], speed: 1, t0: 'now' },
    { kind: 'go', pts: [[0, 0], [5, 5]], speed: 1, t0: 1, then: { course: 'moon' } },
    { kind: 'course', course: 'moon', speed: 1, t0: 1, offset: 0 },
    { kind: 'course', course: 'track', speed: 0.1, t0: 1, offset: 0 },
    { kind: 'course', course: 'track', speed: 1, t0: 1, offset: 'far' }
  ];
  for (const m of bad) assert.equal(v.motion(m), null, JSON.stringify(m));
});

test('motion is copied with only known fields', () => {
  const out = v.motion({ kind: 'idle', at: [1, 2], face: 0, evil: '<script>' });
  assert.deepEqual(Object.keys(out).sort(), ['at', 'face', 'kind']);
});

test('profile trims name and fixes outfit', () => {
  assert.deepEqual(v.profile({ name: '아주아주아주아주긴이름입니다', outfit: 3, joinedAt: 5 }), { name: '아주아주아주아주긴이름입', outfit: 3, joinedAt: 5 });
  assert.deepEqual(v.profile({ name: 7, outfit: 99, joinedAt: 'x' }), { name: '산책자', outfit: 0, joinedAt: 0 });
});

test('name is cut by code points, not UTF-16 units', () => {
  const name = '😀'.repeat(13);
  assert.equal(Array.from(v.profile({ name }).name).length, 12);
});
