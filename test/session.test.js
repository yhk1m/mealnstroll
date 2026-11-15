// © 2026 김용현
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession } from '../src/net/session.js';
import { createValidator } from '../src/net/validate.js';

// Minimal stand-in for supabase-js realtime channels.
function fakeClient(occupants = {}, opts = {}) {
  const channels = [];
  return {
    channels,
    channel(name, chOpts) {
      // like realtime-js: the existing instance is returned until it is removed
      const existing = channels.find((c) => c.name === name && !c.removed);
      if (existing) return existing;
      const handlers = [];
      const ch = {
        name, opts: chOpts, tracked: [], sent: [], removed: false,
        on(type, filter, cb) { handlers.push({ type, filter, cb }); return ch; },
        subscribe(cb) {
          ch.statusCb = cb;
          if (opts.never && opts.never.test(name)) return ch;
          setTimeout(() => { cb('SUBSCRIBED'); ch.emitSync(); }, 0);
          return ch;
        },
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
    removeChannel(ch) { ch.removed = true; return Promise.resolve('ok'); }
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

const tick = () => new Promise((r) => setTimeout(r, 5));

test('channel error then auto rejoin: status follows, no new channel', async () => {
  const client = fakeClient({});
  const statuses = [];
  const s = base(client, { on: { status: (x) => statuses.push(x) } });
  await s.ready;
  const room = client.channels.find((c) => c.name === 'mealnstroll-room-1');
  const before = client.channels.length;
  room.statusCb('CHANNEL_ERROR');
  room.statusCb('SUBSCRIBED');
  assert.deepEqual(statuses, ['connecting', 'online', 'reconnecting', 'online']);
  assert.equal(client.channels.length, before);
  assert.equal(room.tracked.length, 2);
  s.leave();
});

test('fake client returns the existing instance for the same topic', () => {
  const client = fakeClient({});
  assert.equal(client.channel('a'), client.channel('a'));
});

test('never subscribed join is reconnecting, not online', async () => {
  const client = fakeClient({}, { never: /room-/ });
  const statuses = [];
  const s = base(client, { on: { status: (x) => statuses.push(x) } });
  await s.ready;
  assert.deepEqual(statuses, ['connecting', 'reconnecting']);
  s.leave();
});

test('leave during chooseRoom never goes online or opens more rooms', async () => {
  const client = fakeClient({ 1: 3 });
  const statuses = [];
  const s = base(client, { on: { status: (x) => statuses.push(x) } });
  s.leave();
  await s.ready;
  await tick();
  assert.deepEqual(statuses, ['connecting']);
  assert.ok(!client.channels.some((c) => c.name === 'mealnstroll-room-2'));
});

test('chat is validated: name cut, bad at dropped', async () => {
  const client = fakeClient({});
  const got = [];
  const s = base(client, { on: { chat: (m) => got.push(m) } });
  await s.ready;
  const room = client.channels.find((c) => c.name === 'mealnstroll-room-1');
  room.emitBroadcast('chat', { id: 'x', name: 7, text: 'hi', at: 5 });
  room.emitBroadcast('chat', { id: 'x', name: 'a', text: 'hi', at: 'now' });
  assert.equal(got.length, 1);
  assert.equal(got[0].name, '산책자');
  assert.equal(got[0].at, 5);
  s.leave();
});

test('unexpected CLOSED recreates the room after removing the old channel', async () => {
  const client = fakeClient({});
  const s = base(client);
  await s.ready;
  const room = client.channels.find((c) => c.name === 'mealnstroll-room-1');
  room.statusCb('CLOSED');
  await new Promise((r) => setTimeout(r, 2100));
  const rooms = client.channels.filter((c) => c.name === 'mealnstroll-room-1');
  assert.equal(rooms.length, 2);
  assert.equal(rooms[0].removed, true);
  s.leave();
});
