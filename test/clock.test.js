// © 2026 김용현
import test from 'node:test';
import assert from 'node:assert/strict';
import { pickOffset, syncServerClock } from '../src/net/clock.js';
import handler from '../api/time.js';

test('pickOffset uses the sample with the shortest round trip', () => {
  // sent, received (local ms), server ms
  const off = pickOffset([
    { sent: 0, recv: 400, server: 1300 },  // rtt 400
    { sent: 1000, recv: 1100, server: 2050 } // rtt 100 -> server - (sent + rtt/2) = 2050 - 1050 = 1000
  ]);
  assert.equal(off, 1000);
});

test('pickOffset of nothing is 0', () => {
  assert.equal(pickOffset([]), 0);
});

test('syncServerClock asks three times and survives failures', async () => {
  let n = 0, local = 0;
  const now = () => (local += 10);
  const fetchFn = async () => {
    n++;
    if (n === 2) throw new Error('offline');
    return { ok: true, json: async () => ({ now: 5000 }) };
  };
  const off = await syncServerClock({ fetchFn, now, url: '/api/time' });
  assert.equal(n, 3);
  assert.ok(Number.isFinite(off));
});

test('api/time returns a number', () => {
  let body;
  handler({ method: 'GET' }, { setHeader() {}, status() { return this; }, json(b) { body = b; } });
  assert.equal(typeof body.now, 'number');
});
