// © 2026 김용현
import { supabase, hasSupabase } from './supabase.js';

const CHANNEL = 'mealnstroll-lobby';

export function createRealtime({ selfId, initialState, onSync, onChat, onSystem, onLeave, onNotice, onNoticeRequest, onProfileUpdate }) {
  if (!hasSupabase) {
    onSystem?.('Supabase 설정이 없어 나 혼자 산책 중입니다. .env 설정 후 재시작하세요.');
    return {
      updateSelf() {},
      sendChat(text) { onChat?.({ id: selfId, text, at: Date.now(), self: true }); },
      sendNotice() {},
      clearNotice() {},
      requestNotice() {},
      leave() {}
    };
  }

  const channel = supabase.channel(CHANNEL, {
    config: {
      presence: { key: selfId },
      broadcast: { self: false, ack: false }
    }
  });

  let currentSelf = initialState;

  channel
    .on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState();
      const list = [];
      for (const key of Object.keys(state)) {
        const entries = state[key];
        if (entries && entries.length) {
          list.push({ ...entries[0], id: key });
        }
      }
      onSync?.(list);
    })
    .on('presence', { event: 'join' }, ({ key, newPresences }) => {
      const p = newPresences?.[0];
      if (p?.name && key !== selfId) onSystem?.(`${p.name} 님이 산책을 시작했어요`);
    })
    .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
      const p = leftPresences?.[0];
      if (p?.name && key !== selfId) onSystem?.(`${p.name} 님이 산책을 마쳤어요`);
      if (key !== selfId && p) onLeave?.({ ...p, id: key });
    })
    .on('broadcast', { event: 'chat' }, ({ payload }) => {
      if (payload && payload.id !== selfId) onChat?.(payload);
    })
    .on('broadcast', { event: 'notice' }, ({ payload }) => {
      onNotice?.(payload || null);
    })
    .on('broadcast', { event: 'notice-request' }, ({ payload }) => {
      if (payload && payload.id !== selfId) onNoticeRequest?.(payload);
    })
    .on('broadcast', { event: 'profile-update' }, ({ payload }) => {
      if (payload && payload.id !== selfId) onProfileUpdate?.(payload);
    });

  channel.subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      await channel.track(currentSelf);
    }
  });

  return {
    async updateSelf(patch) {
      currentSelf = { ...currentSelf, ...patch };
      await channel.track(currentSelf);
      // Extra broadcast so peers reflect the change instantly without
      // waiting for a presence sync round-trip.
      channel.send({
        type: 'broadcast',
        event: 'profile-update',
        payload: { id: selfId, patch }
      });
    },
    sendChat(text) {
      const payload = { id: selfId, name: currentSelf.name, text, at: Date.now() };
      channel.send({ type: 'broadcast', event: 'chat', payload });
      onChat?.({ ...payload, self: true });
    },
    sendNotice(text, expiresAt = null) {
      const payload = { text, at: Date.now(), by: currentSelf.name || '관리자', expiresAt };
      channel.send({ type: 'broadcast', event: 'notice', payload });
      onNotice?.(payload);
    },
    clearNotice() {
      channel.send({ type: 'broadcast', event: 'notice', payload: null });
      onNotice?.(null);
    },
    requestNotice() {
      channel.send({ type: 'broadcast', event: 'notice-request', payload: { id: selfId } });
    },
    leave() {
      channel.untrack();
      supabase.removeChannel(channel);
    }
  };
}
