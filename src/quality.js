// © 2026 김용현
export const QUALITY = {
  high: { shadows: true, treeShare: 1, maxDpr: 2 },
  low: { shadows: false, treeShare: 0.5, maxDpr: 1 }
};
const KEY = 'mealnstroll.quality';

export function decideQuality({ saved, fps, mobile }) {
  if (saved === 'high' || saved === 'low') return saved;
  return fps < (mobile ? 30 : 50) ? 'low' : 'high';
}

export function loadSavedQuality() {
  try { return localStorage.getItem(KEY); } catch { return null; }
}
export function saveQuality(v) {
  try { localStorage.setItem(KEY, v); } catch { /* fine without it */ }
}

// Counts frames for `ms` and resolves to the average fps.
export function measureFps(ms = 3000) {
  return new Promise((resolve) => {
    let frames = 0;
    const start = performance.now();
    const tick = (t) => {
      frames++;
      if (t - start < ms) requestAnimationFrame(tick);
      else resolve((frames * 1000) / (t - start));
    };
    requestAnimationFrame(tick);
  });
}

export const isMobile = () => matchMedia('(pointer: coarse)').matches;
