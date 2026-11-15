// © 2026 김용현
export function pickOffset(samples) {
  if (!samples.length) return 0;
  const best = samples.reduce((a, b) => (b.recv - b.sent < a.recv - a.sent ? b : a));
  return Math.round(best.server - (best.sent + (best.recv - best.sent) / 2));
}

// Resolves to (server - local) in ms. Failed tries are skipped; all failing gives 0.
export async function syncServerClock({ fetchFn = fetch, now = Date.now, url = '/api/time', tries = 3 } = {}) {
  const samples = [];
  for (let i = 0; i < tries; i++) {
    const sent = now();
    try {
      const res = await fetchFn(url, { cache: 'no-store' });
      if (!res.ok) continue;
      const { now: server } = await res.json();
      if (Number.isFinite(server)) samples.push({ sent, recv: now(), server });
    } catch { /* try again */ }
  }
  return pickOffset(samples);
}
