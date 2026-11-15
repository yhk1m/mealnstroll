// © 2026 김용현
// The only module that talks to Supabase. Swap this file to move to another backend.
// realtime-js rejoins errored channels itself; we only mirror its state into `status`.
import { chooseRoom, ROOM_CAP, ROOM_MAX } from './rooms.js';
import { throttleLatest } from './throttle.js';

const ROOM = (n) => `mealnstroll-room-${n}`;
const NOTICE = 'mealnstroll-notice';
const SYNC_WAIT = 3000;
const RETRY_MS = 2000;

export function createSession({ client, selfId, profile, motion, startRoom = 1, cap = ROOM_CAP, validator, on = {} }) {
  let me = { ...profile, motion };
  let roomCh = null, noticeCh = null, room = 0, closed = false, retrying = false, settled = false;
  const status = (s) => on.status?.(s);

  if (!client) {
    status('solo');
    return {
      ready: Promise.resolve({ room: 0, moved: false, wanted: startRoom }),
      setMotion(m) { me.motion = m; }, setProfile(p) { me = { ...me, ...p }; },
      sendChat(text) { on.chat?.({ id: selfId, name: me.name, text, at: Date.now(), self: true }); },
      sendNotice() {}, requestNotice() {}, leave() {}
    };
  }

  function peersFrom(ch) {
    const state = ch.presenceState(), list = [];
    for (const id of Object.keys(state)) {
      if (id === selfId || !state[id]?.length) continue;
      const raw = state[id][0];
      list.push({ id, ...validator.profile(raw), motion: validator.motion(raw.motion) });
    }
    return list;
  }

  const track = (ch) => { try { Promise.resolve(ch?.track(me)).catch(() => {}); } catch { /* ignore */ } };

  // phoenix rejoins errored channels by itself and calls this callback with SUBSCRIBED again,
  // so CHANNEL_ERROR / TIMED_OUT only change the status. Only an unexpected CLOSED recreates.
  function openRoom(n, { onFirstSync, onSubscribed } = {}) {
    const ch = client.channel(ROOM(n), { config: { presence: { key: selfId }, broadcast: { self: false, ack: false } } });
    let synced = false;
    ch.on('presence', { event: 'sync' }, () => {
      if (closed || ch !== roomCh) return;
      const list = peersFrom(ch);
      if (!synced) { synced = true; onFirstSync?.(list); }
      on.peers?.(list);
    });
    ch.on('broadcast', { event: 'chat' }, ({ payload }) => {
      if (closed || ch !== roomCh || !payload || payload.id === selfId || typeof payload.text !== 'string') return;
      const at = Number(payload.at);
      if (!Number.isFinite(at)) return;
      on.chat?.({ id: String(payload.id), name: validator.profile(payload).name, text: payload.text.slice(0, 200), at });
    });
    ch.subscribe((s) => {
      if (closed || ch !== roomCh) return;
      if (s === 'SUBSCRIBED') {
        track(ch);
        onSubscribed?.();
        if (settled) status('online');
      } else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') {
        if (settled) status('reconnecting');
      } else if (s === 'CLOSED') {
        if (settled) recreate();
      }
    });
    return ch;
  }

  function tryJoin(n) {
    return new Promise((resolve) => {
      if (closed) { resolve({ others: 0, subscribed: false, leave: async () => {} }); return; }
      let done = false, timer = null, subscribed = false;
      function finish(list) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve({ others: list.length, subscribed, leave: async () => { await client.removeChannel(ch); } });
      }
      const ch = openRoom(n, { onFirstSync: finish, onSubscribed: () => { subscribed = true; } });
      roomCh = ch;
      timer = setTimeout(() => finish(peersFrom(ch)), SYNC_WAIT);
    });
  }

  function recreate() {
    if (closed || retrying) return;
    retrying = true;
    status('reconnecting');
    setTimeout(async () => {
      const old = roomCh;
      roomCh = null;              // so the old channel's callbacks are ignored
      try { if (old) await client.removeChannel(old); } catch { /* ignore */ }
      retrying = false;
      if (closed) return;
      roomCh = openRoom(room);
    }, RETRY_MS);
  }

  status('connecting');
  noticeCh = client.channel(NOTICE, { config: { broadcast: { self: false, ack: false } } });
  noticeCh.on('broadcast', { event: 'notice' }, ({ payload }) => on.notice?.(payload || null));
  noticeCh.on('broadcast', { event: 'notice-request' }, ({ payload }) => { if (payload?.id !== selfId) on.noticeRequest?.(payload); });
  noticeCh.subscribe(() => {});

  const ready = chooseRoom({ start: startRoom, cap, max: ROOM_MAX, tryJoin }).then((r) => {
    room = r.room;
    if (!closed) {
      settled = true;
      status(r.subscribed ? 'online' : 'reconnecting');
    }
    return { room: r.room, moved: r.moved, wanted: r.wanted };
  });

  const pushMotion = throttleLatest(() => track(roomCh), 500);

  return {
    ready,
    setMotion(m) { me = { ...me, motion: m }; pushMotion(); },
    setProfile(p) { me = { ...me, ...p }; track(roomCh); },
    sendChat(text) {
      const payload = { id: selfId, name: me.name, text: String(text).slice(0, 200), at: Date.now() };
      roomCh?.send({ type: 'broadcast', event: 'chat', payload });
      on.chat?.({ ...payload, self: true });
    },
    sendNotice(envelope) { noticeCh.send({ type: 'broadcast', event: 'notice', payload: envelope }); },
    requestNotice() { noticeCh.send({ type: 'broadcast', event: 'notice-request', payload: { id: selfId } }); },
    leave() {
      closed = true;
      pushMotion.cancel();
      if (roomCh) client.removeChannel(roomCh);
      if (noticeCh) client.removeChannel(noticeCh);
    }
  };
}
