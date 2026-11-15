// © 2026 김용현
// Usage: node scripts/shot.mjs <url> <out.png> [width] [height] [frames]
// Serves nothing itself: start `npx vite preview --port 4173` (after a build) first.
// Drives headless Chrome over the DevTools protocol: --virtual-time-budget never settles while a
// WebGL animation loop runs, so this waits until `window.__frames` reaches [frames] instead.
// Always software GL (--disable-gpu): this PC has a GPU bluescreen history.
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [url, out, w = '1280', h = '800', need = '20'] = process.argv.slice(2);
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const profile = mkdtempSync(join(tmpdir(), 'mns-shot-')); // fresh profile: no stale cache
const port = 9300 + Math.floor(Math.random() * 500);
const proc = spawn(chrome, [
  '--headless=new', '--disable-gpu', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--hide-scrollbars', '--disk-cache-size=1', `--user-data-dir=${profile}`, `--window-size=${w},${h}`,
  `--remote-debugging-port=${port}`, 'about:blank'
], { stdio: 'ignore' });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const done = (code) => { try { proc.kill(); } catch { /* gone */ } process.exit(code); };
setTimeout(() => { console.error('timeout'); done(1); }, 240000);

let target;
for (let i = 0; i < 50 && !target; i++) {
  await wait(300);
  try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); } catch { /* not up yet */ }
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0;
const pending = new Map();
const errors = [];
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result || m); pending.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((a) => a.value ?? a.description).join(' '));
});
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Runtime.enable');
await send('Page.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Page.navigate', { url });
let frames = 0;
for (let i = 0; i < 400 && frames < Number(need); i++) {
  await wait(400);
  frames = (await send('Runtime.evaluate', { expression: 'window.__frames || 0', returnByValue: true })).result?.value || 0;
}
const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(out, Buffer.from(shot.data, 'base64'));
console.log('saved', out, 'frames', frames, errors.length ? 'ERRORS: ' + errors.join(' | ') : 'no errors');
ws.close();
done(errors.length ? 2 : 0);
