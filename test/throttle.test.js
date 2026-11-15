// © 2026 김용현
import test from 'node:test';
import assert from 'node:assert/strict';
import { throttleLatest } from '../src/net/throttle.js';

test('first call goes now, the burst collapses to the last value', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const sent = [];
  const send = throttleLatest((v) => sent.push(v), 500);
  send(1);
  send(2);
  send(3);
  assert.deepEqual(sent, [1]);
  t.mock.timers.tick(499);
  assert.deepEqual(sent, [1]);
  t.mock.timers.tick(1);
  assert.deepEqual(sent, [1, 3]);
  t.mock.timers.tick(1000);
  send(4);
  assert.deepEqual(sent, [1, 3, 4]);
});

test('cancel drops a pending value', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const sent = [];
  const send = throttleLatest((v) => sent.push(v), 500);
  send(1);
  send(2);
  send.cancel();
  t.mock.timers.tick(600);
  assert.deepEqual(sent, [1]);
});
