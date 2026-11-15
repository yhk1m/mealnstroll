// © 2026 김용현
import test from 'node:test';
import assert from 'node:assert/strict';
import { decideQuality, QUALITY } from '../src/quality.js';

test('saved choice wins', () => {
  assert.equal(decideQuality({ saved: 'high', fps: 10, mobile: true }), 'high');
  assert.equal(decideQuality({ saved: 'low', fps: 120, mobile: false }), 'low');
});

test('desktop under 50 fps goes light', () => {
  assert.equal(decideQuality({ saved: null, fps: 49, mobile: false }), 'low');
  assert.equal(decideQuality({ saved: null, fps: 55, mobile: false }), 'high');
});

test('phone under 30 fps goes light', () => {
  assert.equal(decideQuality({ saved: null, fps: 29, mobile: true }), 'low');
  assert.equal(decideQuality({ saved: null, fps: 40, mobile: true }), 'high');
});

test('settings for each level', () => {
  assert.deepEqual(QUALITY.low, { shadows: false, treeShare: 0.5, maxDpr: 1 });
  assert.deepEqual(QUALITY.high, { shadows: true, treeShare: 1, maxDpr: 2 });
});
