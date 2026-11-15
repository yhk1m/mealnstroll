// © 2026 김용현
export const ROOM_CAP = 30;
export const ROOM_MAX = 20;

export function roomFromHash(hash, max = ROOM_MAX) {
  const m = /(?:^#|&)room=(\d+)/.exec(hash || '');
  const n = m ? Number(m[1]) : 1;
  return n >= 1 && n <= max ? n : 1;
}

// Tries rooms in order from `start`, wrapping once. Stays in the last room tried if all are full.
export async function chooseRoom({ start, cap = ROOM_CAP, max = ROOM_MAX, tryJoin }) {
  let joined = null;
  for (let k = 0; k < max; k++) {
    const n = ((start - 1 + k) % max) + 1;
    joined = await tryJoin(n);
    if (joined.others < cap || k === max - 1) {
      return { ...joined, room: n, moved: n !== start, wanted: start };
    }
    await joined.leave();
  }
  return null; // unreachable when max >= 1
}
