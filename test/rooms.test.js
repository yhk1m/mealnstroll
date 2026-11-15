// © 2026 김용현
import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseRoom, roomFromHash } from '../src/net/rooms.js';

const fakeJoin = (counts) => {
  const left = [];
  const tryJoin = async (n) => ({ room: n, others: counts[n] || 0, leave: async () => left.push(n) });
  return { tryJoin, left };
};

test('joins room 1 when there is space', async () => {
  const { tryJoin, left } = fakeJoin({ 1: 5 });
  const r = await chooseRoom({ start: 1, cap: 30, max: 20, tryJoin });
  assert.equal(r.room, 1);
  assert.equal(r.moved, false);
  assert.deepEqual(left, []);
});

test('skips full rooms', async () => {
  const { tryJoin, left } = fakeJoin({ 1: 30, 2: 31, 3: 4 });
  const r = await chooseRoom({ start: 1, cap: 30, max: 20, tryJoin });
  assert.equal(r.room, 3);
  assert.deepEqual(left, [1, 2]);
});

test('link room full moves on and says so', async () => {
  const { tryJoin } = fakeJoin({ 3: 30 });
  const r = await chooseRoom({ start: 3, cap: 30, max: 20, tryJoin });
  assert.equal(r.room, 4);
  assert.equal(r.moved, true);
  assert.equal(r.wanted, 3);
});

test('wraps past max back to 1 and stops after one lap at the last tried room', async () => {
  const counts = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [i + 1, 30]));
  const { tryJoin } = fakeJoin(counts);
  const r = await chooseRoom({ start: 19, cap: 30, max: 20, tryJoin });
  assert.equal(r.room, 18); // 19, 20, 1, ..., 18: every room tried once, stays in the last
});

test('roomFromHash reads #room=N within range', () => {
  assert.equal(roomFromHash('#room=7', 20), 7);
  assert.equal(roomFromHash('#room=0', 20), 1);
  assert.equal(roomFromHash('#room=99', 20), 1);
  assert.equal(roomFromHash('#fps&room=4', 20), 4);
  assert.equal(roomFromHash('', 20), 1);
});
