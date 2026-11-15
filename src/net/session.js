// © 2026 김용현
// The only module that talks to Supabase. Swap this file to move to another backend.
// supabase-js allows one subscribe() per channel, so drops are routed through `dropHandler`.
import { chooseRoom, ROOM_CAP, ROOM_MAX } from './rooms.js';
import { throttleLatest } from './throttle.js';

const ROOM = (n) => `mealnstroll-room-${n}`;
const NOTICE = 'mealnstroll-notice';
const SYNC_WAIT = 3000;
const RETRY_MS = 2000;
const DROPPED = new Set(['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED']);

export function createSession({ client, selfId, profile, motion, startRoom = 1, cap = ROOM_CAP, validator, on = {} }) {
  let me = { ...profile, motion };
  let roomCh = null, noticeCh = null, room = 0, closed = false, retrying = false;
  let dropHandler = () => {};
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

  function openRoom(n, onFirstSync) {
    const ch = client.channel(ROOM(n), { config: { presence: { key: selfId }, broadcast: { self: false, ack: false } } });
    let synced = false;
    ch.on('presence', { event: 'sync' }, () => {
      const list = peersFrom(ch);
      if (!synced) { synced = true; onFirstSync?.(list); }
      on.peers?.(list);
    });
    ch.on('broadcast', { event: 'chat' }, ({ payload }) => {
      if (payload && payload.id !== selfId && typeof payload.text === 'string') on.chat?.({ ...payload, text: payload.text.slice(0, 200) });
    });
    ch.subscribe((s) => {
      if (s === 'SUBSCRIBED') ch.track(me);
      else if (DROPPED.has(s) && ch === roomCh) dropHandler();
    });
    return ch;
  }

  function tryJoin(n) {
    return new Promise((resolve) => {
      let done = false, timer = null;
      function finish(list) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve({ others: list.length, leave: async () => { client.removeChannel(ch); } });
      }
      const ch = openRoom(n, finish);
      roomCh = ch;
      timer = setTimeout(() => finish(peersFrom(ch)), SYNC_WAIT);
    });
  }

  function reconnect() {
    if (closed || retrying) return;
    retrying = true;
    status('reconnecting');
    setTimeout(() => {
      retrying = false;
      if (closed) return;
      const old = roomCh;
      roomCh = null;              // so the old channel's CLOSED does not loop back here
      if (old) client.removeChannel(old);
      roomCh = openRoom(room, () => status('online'));
    }, RETRY_MS);
  }

  status('connecting');
  noticeCh = client.channel(NOTICE, { config: { broadcast: { self: false, ack: false } } });
  noticeCh.on('broadcast', { event: 'notice' }, ({ payload }) => on.notice?.(payload || null));
  noticeCh.on('broadcast', { event: 'notice-request' }, ({ payload }) => { if (payload?.id !== selfId) on.noticeRequest?.(payload); });
  noticeCh.subscribe(() => {});

  const ready = chooseRoom({ start: startRoom, cap, max: ROOM_MAX, tryJoin }).then((r) => {
    room = r.room;
    dropHandler = reconnect;
    status('online');
    return { room: r.room, moved: r.moved, wanted: r.wanted };
  });

  const pushMotion = throttleLatest(() => roomCh?.track(me), 500);

  return {
    ready,
    setMotion(m) { me = { ...me, motion: m }; pushMotion(); },
    setProfile(p) { me = { ...me, ...p }; roomCh?.track(me); },
    sendChat(text) {
      const payload = { id: selfId, name: me.name, text: String(text).slice(0, 200), at: Date.now() };
      roomCh?.send({ type: 'broadcast', event: 'chat', payload });
      on.chat?.({ ...payload, self: true });
    },
    sendNotice(envelope) { noticeCh.send({ type: 'broadcast', event: 'notice', payload: envelope }); },
    requestNotice() { noticeCh.send({ type: 'broadcast', event: 'notice-request', payload: { id: selfId } }); },
    leave() {
      closed = true;
      dropHandler = () => {};
      pushMotion.cancel();
      if (roomCh) client.removeChannel(roomCh);
      if (noticeCh) client.removeChannel(noticeCh);
    }
  };
}
