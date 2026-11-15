// © 2026 김용현
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession } from '../src/net/session.js';
import { createValidator } from '../src/net/validate.js';

// Minimal stand-in for supabase-js realtime channels.
function fakeClient(occupants = {}) {
  const channels = [];
  return {
    channels,
    channel(name, opts) {
      const handlers = [];
      const ch = {
        name, opts, tracked: [], sent: [], removed: false,
        on(type, filter, cb) { handlers.push({ type, filter, cb }); return ch; },
        subscribe(cb) { setTimeout(() => { cb('SUBSCRIBED'); ch.emitSync(); }, 0); return ch; },
        presenceState() {
          const n = Number((name.match(/room-(\d+)/) || [])[1]);
          const state = {};
          for (let i = 0; i < (occupants[n] || 0); i++) state['p' + i] = [{ name: 'p' + i, outfit: 1, joinedAt: 1, motion: { kind: 'idle', at: [0, 0], face: 0 } }];
          return state;
        },
        emitSync() { handlers.filter((h) => h.type === 'presence' && h.filter.event === 'sync').forEach((h) => h.cb()); },
        emitBroadcast(event, payload) { handlers.filter((h) => h.type === 'broadcast' && h.filter.event === event).forEach((h) => h.cb({ payload })); },
        async track(v) { ch.tracked.push(v); },
        async send(m) { ch.sent.push(m); },
        async unsubscribe() { ch.removed = true; }
      };
      channels.push(ch);
      return ch;
    },
    removeChannel(ch) { ch.removed = true; }
  };
}

const validator = createValidator({ bounds: { minX: -500, maxX: 500, minZ: -500, maxZ: 500 }, courses: ['track'] });
const base = (client, extra = {}) => createSession({
  client, selfId: 'me', profile: { name: '나', outfit: 0, joinedAt: 1 },
  motion: { kind: 'idle', at: [0, 0], face: 0 }, startRoom: 1, cap: 3, validator, on: {}, ...extra
});

test('joins the first room with space and listens to the notice channel', async () => {
  const client = fakeClient({ 1: 3, 2: 1 });
  const s = base(client);
  const r = await s.ready;
  assert.equal(r.room, 2);
  const names = client.channels.map((c) => c.name);
  assert.ok(names.includes('mealnstroll-notice'));
  assert.equal(client.channels.find((c) => c.name === 'mealnstroll-room-1').removed, true);
  s.leave();
});

test('peers exclude me and pass through the validator', async () => {
  const client = fakeClient({ 1: 2 });
  let got = null;
  const s = base(client, { on: { peers: (l) => { got = l; } } });
  await s.ready;
  assert.equal(got.length, 2);
  assert.deepEqual(Object.keys(got[0]).sort(), ['id', 'joinedAt', 'motion', 'name', 'outfit']);
  s.leave();
});

test('setMotion tracks profile plus motion', async () => {
  const client = fakeClient({});
  const s = base(client);
  await s.ready;
  const room = client.channels.find((c) => c.name === 'mealnstroll-room-1');
  s.setMotion({ kind: 'idle', at: [3, 3], face: 0 });
  const last = room.tracked[room.tracked.length - 1];
  assert.deepEqual(last.motion.at, [3, 3]);
  assert.equal(last.name, '나');
  s.leave();
});

test('notice broadcast reaches on.notice', async () => {
  const client = fakeClient({});
  let n = null;
  const s = base(client, { on: { notice: (p) => { n = p; } } });
  await s.ready;
  client.channels.find((c) => c.name === 'mealnstroll-notice').emitBroadcast('notice', { body: 'x', sig: 'y' });
  assert.deepEqual(n, { body: 'x', sig: 'y' });
  s.leave();
});

test('no client means solo mode', async () => {
  const statuses = [];
  const s = base(null, { on: { status: (x) => statuses.push(x) } });
  const r = await s.ready;
  assert.equal(r.room, 0);
  assert.deepEqual(statuses, ['solo']);
});
