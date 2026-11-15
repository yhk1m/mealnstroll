// © 2026 김용현
export function throttleLatest(fn, ms) {
  let last = -Infinity, timer = null, pending;
  const fire = () => { timer = null; last = Date.now(); fn(pending); };
  const call = (v) => {
    pending = v;
    const wait = last + ms - Date.now();
    if (wait <= 0 && !timer) return fire();
    if (!timer) timer = setTimeout(fire, Math.max(0, wait));
  };
  call.cancel = () => { if (timer) clearTimeout(timer); timer = null; };
  return call;
}
