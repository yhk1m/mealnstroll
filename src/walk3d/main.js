// © 2026 김용현
// Wires the world, my walker, the network session and the camera together.
import * as THREE from 'three';
import { createWorld } from '../world/world.js';
import { makePerson, makeFarPerson, animatePerson, angLerp, LOOKS, PERSON_SCALE } from '../avatar/person.js';
import courseRings from '../data/courses.json';
import { makeCourses, COURSE_NAMES } from '../move/courses.js';
import { createMotionMath, PACES, goDuration } from '../move/motion.js';
import { createNavGrid } from '../move/navgrid.js';
import { WORLD_BOUNDS, BLOCKED } from '../move/world-bounds.js';
import { createValidator } from '../net/validate.js';
import { syncServerClock } from '../net/clock.js';
import { roomFromHash } from '../net/rooms.js';
import { createSession } from '../net/session.js';
import { supabase } from '../supabase.js';
import { decideQuality, loadSavedQuality, saveQuality, measureFps, isMobile, QUALITY } from '../quality.js';
import { fetchLiveWeather } from '../world/sky-clock.js';
import { createUI } from './ui.js';

// ---------- 1. setup ----------
const courses = makeCourses(courseRings);
const { positionAt } = createMotionMath(courses);
const grid = createNavGrid({ bounds: WORLD_BOUNDS, blocked: BLOCKED, cell: 1 });
const validator = createValidator({ bounds: WORLD_BOUNDS, courses: Object.keys(COURSE_NAMES) });
const params = new URLSearchParams(location.hash.slice(1));
let clockOffset = 0;
const serverNow = () => Date.now() + clockOffset;

// ---------- 2. world (or a notice when WebGL is missing) ----------
let world, ui = null; // ui stays null until the menu is built below
let session = null, netStatus = 'connecting';
try {
  world = createWorld({
    canvas: document.getElementById('c'),
    reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
    onWeather: (w, live) => ui?.showWeather?.(w, live)
  });
} catch (e) {
  document.body.insertAdjacentHTML('beforeend', '<div class="err">이 기기에서는 3D가 열리지 않아요.</div>');
  throw e;
}
const canvas = world.renderer.domElement;
const fit = () => world.resize(innerWidth, innerHeight);
addEventListener('resize', fit);
fit();

// ---------- 3. who I am ----------
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* fine without it */ } }
};
const selfId = (() => {
  let id = store.get('mealnstroll.id');
  if (!id) { id = crypto.randomUUID(); store.set('mealnstroll.id', id); }
  return id;
})();
const askProfile = store.get('mealnstroll.name') === null; // first visit: ask for a name and outfit
let name = store.get('mealnstroll.name') || '';
let outfit = Number(store.get('mealnstroll.outfit'));
if (!Number.isInteger(outfit) || outfit < 0 || outfit >= LOOKS.length) {
  outfit = Math.floor(Math.random() * LOOKS.length);
  store.set('mealnstroll.outfit', String(outfit));
}

// ---------- 4. my motion ----------
let myMotion = { kind: 'course', course: 'track', speed: PACES.normal, t0: serverNow(), offset: Math.round(courses.track.loop * 4.2) / 10 };
let pace = 'normal';
function setMyMotion(m) {
  myMotion = m;
  session?.setMotion(m);
  ui?.syncJoin?.(m);
}
const round1 = (n) => Math.round(n * 10) / 10;
const loopOf = (key) => courses[key].loop;
const wrap = (key, s) => ((s % loopOf(key)) + loopOf(key)) % loopOf(key);
const goEnd = (m) => m.t0 + goDuration(m);
// The course I am walking (or walking to), and how far along it I am right now.
function courseNow(m, now) {
  if (m.kind === 'course') return { course: m.course, offset: wrap(m.course, m.offset + (m.speed * Math.max(0, now - m.t0)) / 1000), on: true };
  if (m.kind === 'go' && m.then) {
    const after = now - goEnd(m);
    return { course: m.then.course, offset: wrap(m.then.course, m.then.offset + (m.speed * Math.max(0, after)) / 1000), on: after >= 0 };
  }
  return null;
}

// Frees a character's own geometry and materials (the shared toon ramp texture is left alone).
function disposePerson(obj) {
  obj.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
  });
}

// ---------- my walker ----------
let me = makePerson(LOOKS[outfit], PERSON_SCALE);
me.add(world.faceLight);
world.scene.add(me);
function setProfile(p) {
  name = p.name;
  store.set('mealnstroll.name', name);
  if (p.outfit !== outfit && LOOKS[p.outfit]) {
    outfit = p.outfit;
    store.set('mealnstroll.outfit', String(outfit));
    const next = makePerson(LOOKS[outfit], PERSON_SCALE);
    next.position.copy(me.position);
    next.rotation.y = me.rotation.y;
    next.add(world.faceLight);
    world.scene.remove(me);
    me.remove(world.faceLight);
    disposePerson(me);
    world.scene.add(next);
    me = next;
  }
  session?.setProfile({ name, outfit });
}
{
  const p = positionAt(myMotion, serverNow());
  me.position.set(p.x, world.heightAt(p.x, p.z) + 0.13, p.z);
  me.rotation.y = p.heading;
}

// ---------- course line (seen from the air) ----------
let courseLine = null, lineKey = null;
function drawCourseLine(key) {
  if (key === lineKey) return;
  lineKey = key;
  if (courseLine) { world.scene.remove(courseLine); courseLine.geometry.dispose(); courseLine.material.dispose(); }
  const pts = courses[key].pts;
  courseLine = new THREE.Mesh(world.ribbonGeo([pts.concat([pts[0]])], 2.2, (x, z) => world.heightAt(x, z) + 0.3),
    new THREE.MeshBasicMaterial({ color: 0xffb340, transparent: true, opacity: 0.82, side: THREE.DoubleSide, depthWrite: false, fog: false }));
  world.scene.add(courseLine);
}
drawCourseLine('track');

// ---------- 5. walking to a clicked point ----------
function walkTo(x, z, then) {
  const now = serverNow();
  const here = positionAt(myMotion, now);
  let pts = grid.findPath([here.x, here.z], [x, z]);
  if (!pts || pts.length < 2) return false; // unreachable or too winding: stay
  // The path starts at a grid cell when I stand off the grid: start from where I really am.
  if (Math.hypot(pts[0][0] - here.x, pts[0][1] - here.z) > 0.2 && pts.length < 32) pts = [[round1(here.x), round1(here.z)], ...pts];
  setMyMotion({ kind: 'go', pts, speed: PACES[pace] * 1.25, t0: now, ...(then ? { then } : {}) });
  const end = pts[pts.length - 1];
  world.marker.visible = true;
  world.marker.position.set(end[0], world.heightAt(end[0], end[1]) + 0.24, end[1]);
  return true;
}

// ---------- 6. joining and leaving a walk ----------
function joinCourse(key) {
  const now = serverNow();
  const here = positionAt(myMotion, now);
  const offset = round1(courses.nearestOnCourse(key, here.x, here.z));
  const target = courses.pointOnCourse(key, offset);
  drawCourseLine(key);
  if (Math.hypot(target.x - here.x, target.z - here.z) < 1 || !walkTo(target.x, target.z, { course: key, offset })) {
    // Already there, or no walkable way there: step straight onto the course.
    if (Math.hypot(target.x - here.x, target.z - here.z) >= 1) camInit = false;
    world.marker.visible = false;
    setMyMotion({ kind: 'course', course: key, speed: PACES[pace], t0: now, offset });
  }
}
function leaveCourse() {
  const here = positionAt(myMotion, serverNow());
  setMyMotion({ kind: 'idle', at: [round1(here.x), round1(here.z)], face: round1(here.heading) });
  world.marker.visible = false;
}
function setPace(p) {
  if (!PACES[p] || p === pace) return;
  pace = p;
  const now = serverNow(), m = myMotion, c = courseNow(m, now);
  if (c && c.on) {
    setMyMotion({ kind: 'course', course: c.course, speed: PACES[pace], t0: now, offset: round1(c.offset) });
  } else if (m.kind === 'go') {
    // Same distance walked so far, new speed from here on.
    const speed = PACES[pace] * 1.25, walked = (m.speed * (now - m.t0)) / 1000;
    setMyMotion({ ...m, speed, t0: Math.round(now - (walked * 1000) / speed) });
  }
}
// A finished `go` is replaced once, so late joiners never replay the whole path.
function settleGo(now) {
  const m = myMotion;
  if (m.kind !== 'go' || now <= goEnd(m)) return;
  world.marker.visible = false;
  // Continue from where I am now (after a hidden tab this may be well past the arrival).
  if (m.then) { const c = courseNow(m, now); setMyMotion({ kind: 'course', course: c.course, speed: PACES[pace], t0: Math.round(now), offset: round1(c.offset) }); }
  else leaveCourse();
}

// ---------- pointer: drag turns the view, a tap walks, pinch and wheel zoom ----------
let viewMode = 'walk';
function setView(v) {
  if (!['walk', 'face', 'aerial'].includes(v)) return;
  viewMode = v;
  world.setViewMode(v);
}
setView('walk');
const orbit = { az: 0.55, polar: 1.02, r: 330, walkAz: 0, walkPitch: 0, walkR: 6.2, faceR: 3.1 };
const pointers = new Map();
let downX = 0, downY = 0, moved = 0, pinch = 0, multi = false;
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
canvas.style.touchAction = 'none';
canvas.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'mouse' && e.button !== 0) return; // only the main button walks or turns
  try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
  ui?.closePanel?.();
  pointers.set(e.pointerId, [e.clientX, e.clientY]);
  if (pointers.size === 1) { downX = e.clientX; downY = e.clientY; moved = 0; pinch = 0; multi = false; } else multi = true;
});
canvas.addEventListener('pointermove', (e) => {
  const prev = pointers.get(e.pointerId);
  if (!prev) return;
  const dx = e.clientX - prev[0], dy = e.clientY - prev[1];
  pointers.set(e.pointerId, [e.clientX, e.clientY]);
  moved = Math.max(moved, Math.hypot(e.clientX - downX, e.clientY - downY));
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
    if (pinch) zoom(pinch / d);
    pinch = d;
    moved = 99;
    return;
  }
  if (moved < 5) return;
  if (viewMode === 'aerial') {
    orbit.az -= dx * 0.005;
    orbit.polar = Math.min(1.42, Math.max(0.3, orbit.polar - dy * 0.004));
  } else {
    orbit.walkAz -= dx * 0.005;
    orbit.walkPitch = Math.min(0.5, Math.max(-0.4, orbit.walkPitch + dy * 0.003));
  }
});
function zoom(k) {
  if (viewMode === 'aerial') orbit.r = Math.min(620, Math.max(70, orbit.r * k));
  else if (viewMode === 'face') orbit.faceR = Math.min(9, Math.max(1.8, orbit.faceR * k));
  else orbit.walkR = Math.min(26, Math.max(3.5, orbit.walkR * k));
}
canvas.addEventListener('wheel', (e) => { e.preventDefault(); zoom(Math.exp(e.deltaY * 0.001)); }, { passive: false });
const release = (e) => {
  if (!pointers.has(e.pointerId)) return;
  const wasTap = pointers.size === 1 && moved < 5 && !multi;
  pointers.delete(e.pointerId);
  if (wasTap && e.type === 'pointerup') tap(e.clientX, e.clientY);
};
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);
function tap(cx, cy) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, world.camera);
  const blockers = world.blockers();
  const hit = ray.intersectObjects(world.groundMeshes().concat(blockers), false)[0];
  if (!hit || blockers.includes(hit.object)) return;
  walkTo(hit.point.x, hit.point.z);
}

// ---------- 7. other people ----------
const FAR = 25, KEEP_MS = 30000;
const peers = new Map(); // id -> { near, far, motion, last, outfit, name, joinedAt, goneAt, lane }
// People on the same course step a little to one side so they do not stand inside each other.
// Drawing only: the motion records and positionAt stay exact.
function laneOf(id) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); h ^= h >>> 16; // spread close ids apart
  return ((h >>> 0) / 4294967295 - 0.5); // -0.5..+0.5 m
}
const onCourseNow = (m, now) => m.kind === 'course' || (m.kind === 'go' && !!m.then && now >= goEnd(m));
function dropShapes(v) {
  world.scene.remove(v.near, v.far);
  disposePerson(v.near); disposePerson(v.far);
}
function removePeer(id, v) {
  dropShapes(v);
  peers.delete(id);
}
function syncPeers(list) {
  const seen = new Set();
  for (const p of list) {
    seen.add(p.id);
    let v = peers.get(p.id);
    if (!v || v.outfit !== p.outfit) {
      if (v) dropShapes(v);
      const look = LOOKS[p.outfit] || LOOKS[0];
      v = { near: makePerson(look, PERSON_SCALE), far: makeFarPerson(look), outfit: p.outfit, last: v?.last || null, motion: v?.motion || null, lane: v?.lane || 0, laneTo: laneOf(p.id) };
      v.far.visible = false;
      world.scene.add(v.near, v.far);
      peers.set(p.id, v);
    }
    v.goneAt = 0;
    v.name = p.name;
    v.joinedAt = p.joinedAt;
    if (p.motion) v.motion = p.motion;                 // a bad record keeps the last good one
    else if (v.last) v.motion = { kind: 'idle', at: [round1(v.last.x), round1(v.last.z)], face: v.last.heading };
    else if (!v.motion) v.motion = { kind: 'idle', at: [0, 0], face: 0 };
  }
  for (const [id, v] of peers) if (!seen.has(id)) leaveLater(id, v);
  ui?.setCount?.(peopleHere());
}
// People in the room now: me plus everyone not on their way out.
const peopleHere = () => 1 + [...peers.values()].filter((v) => !v.goneAt).length;
// Someone missing from the list keeps walking for 30 s; if they come back in time nothing changes.
function leaveLater(id, v) {
  if (!v.goneAt) v.goneAt = Date.now();
}
function sweepPeers() {
  if (netStatus === 'reconnecting') return; // our own link is down: the list says nothing
  const now = Date.now();
  let removed = false;
  for (const [id, v] of peers) if (v.goneAt && now - v.goneAt > KEEP_MS) { removePeer(id, v); removed = true; }
  if (removed) ui?.setCount?.(peopleHere());
}
setInterval(sweepPeers, 5000);

let frameNo = 0;
const tmpV = new THREE.Vector3();
function drawPeers(dt) {
  frameNo++;
  const now = serverNow();
  const k = 1 - Math.exp(-dt * 6);
  for (const v of peers.values()) {
    const p = positionAt(v.motion, now);
    v.last = p;
    // Ease the side step in and out, so arriving on a course or leaving it never jumps.
    v.lane += ((onCourseNow(v.motion, now) ? v.laneTo : 0) - v.lane) * (1 - Math.exp(-dt * 2));
    const x = p.x + Math.cos(p.heading) * v.lane, z = p.z - Math.sin(p.heading) * v.lane;
    const y = world.heightAt(x, z) + 0.13;
    const d = world.camera.position.distanceTo(tmpV.set(x, y, z));
    const far = d > FAR;
    v.near.visible = !far; v.far.visible = far;
    // Nobody walks through the lens.
    if (viewMode !== 'aerial' && d < 1.2) v.near.visible = v.far.visible = false;
    const obj = far ? v.far : v.near;
    if (far && frameNo % 2 === 0) v.bob = p.moving ? Math.abs(Math.sin(now / 160)) * 0.02 : 0; // far bob: every other frame
    obj.position.set(x, y + (far ? v.bob || 0 : 0), z);
    obj.rotation.y = angLerp(obj.rotation.y, p.heading, k);
    if (!far) animatePerson(v.near, dt, p.speed);
    v.near.userData.hat.visible = world.xmas;
  }
}

// ---------- 8. my walker and the camera ----------
function stepMe(dt) {
  const now = serverNow();
  settleGo(now);
  const p = positionAt(myMotion, now);
  const X = me.position;
  X.x = p.x; X.z = p.z;
  X.y += (world.heightAt(X.x, X.z) + 0.13 - X.y) * (1 - Math.exp(-dt * 8));
  if (p.moving) me.rotation.y = angLerp(me.rotation.y, p.heading, 1 - Math.exp(-dt * (myMotion.kind === 'go' ? 6 : 4)));
  me.userData.hat.visible = world.xmas;
  animatePerson(me, dt, p.speed);
}

const look = new THREE.Vector3(-50, 0, 40), camGoal = new THREE.Vector3(), lookGoal = new THREE.Vector3(), fwd = new THREE.Vector3();
let camInit = false;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
function updateCamera(dt, t) {
  const X = me.position, heading = me.rotation.y;
  if (viewMode === 'aerial') {
    if (!reduced && !pointers.size) orbit.az += dt * 0.012;
    const c = [-55, 40];
    lookGoal.set(c[0], -1, c[1]);
    camGoal.set(c[0] + Math.sin(orbit.az) * Math.sin(orbit.polar) * orbit.r, Math.cos(orbit.polar) * orbit.r, c[1] + Math.cos(orbit.az) * Math.sin(orbit.polar) * orbit.r);
  } else if (viewMode === 'face') {
    // In front and to one side, walking backwards with the character.
    const yaw = heading + 0.52 + orbit.walkAz + (reduced ? 0 : Math.sin(t * 0.12) * 0.1);
    camGoal.set(X.x + Math.sin(yaw) * orbit.faceR, X.y + 0.9 + orbit.walkPitch * 2, X.z + Math.cos(yaw) * orbit.faceR);
    lookGoal.set(X.x, X.y + 0.68, X.z);
  } else {
    // Behind the walker and a little to the side, looking past them at the scenery.
    const yaw = heading + Math.PI + orbit.walkAz + (reduced ? 0 : Math.sin(t * 0.09) * 0.09) + 0.2;
    const ground = X.y;
    const pitchH = 2.2 + orbit.walkPitch * orbit.walkR;
    camGoal.set(X.x + Math.sin(yaw) * orbit.walkR, ground + Math.max(1.1, pitchH), X.z + Math.cos(yaw) * orbit.walkR);
    fwd.set(Math.sin(yaw + Math.PI), 0, Math.cos(yaw + Math.PI));
    lookGoal.set(X.x + fwd.x * 9, ground + 2.1, X.z + fwd.z * 9);
  }
  // Keep the lens out of walls in the narrow gaps.
  if (viewMode !== 'aerial') {
    for (let i = 0; i < 7 && world.inBuilding(camGoal.x, camGoal.z); i++) camGoal.lerp(X, 0.22);
  }
  if (courseLine) courseLine.visible = viewMode === 'aerial';
  const k = camInit ? 1 - Math.exp(-dt * 1.7) : 1;
  world.camera.position.lerp(camGoal, k);
  look.lerp(lookGoal, k);
  world.camera.lookAt(look);
  camInit = true;
}

// ---------- 11. quality ----------
function setQuality(level, save) {
  if (level === 'auto') { if (save) saveQuality('auto'); pickQuality(); return; }
  if (!QUALITY[level]) return;
  world.setQuality(QUALITY[level]);
  if (save) saveQuality(level);
}
// A hidden tab draws nothing, so wait until it is seen and measure again if it gets hidden meanwhile.
async function measureVisible() {
  for (;;) {
    if (document.hidden) await new Promise((r) => document.addEventListener('visibilitychange', function on() { if (!document.hidden) { document.removeEventListener('visibilitychange', on); r(); } }));
    let hid = false;
    const mark = () => { if (document.hidden) hid = true; };
    document.addEventListener('visibilitychange', mark);
    const fps = await measureFps();
    document.removeEventListener('visibilitychange', mark);
    if (!hid && !document.hidden) return fps;
  }
}
async function pickQuality() {
  if (QUALITY[params.get('q')]) return setQuality(params.get('q')); // hidden override for checks
  const saved = loadSavedQuality();
  if (saved !== 'high' && saved !== 'low') world.setQuality(QUALITY.high); // measure from the full picture
  const fps = saved === 'high' || saved === 'low' ? 60 : await measureVisible();
  setQuality(decideQuality({ saved, fps, mobile: isMobile() }));
}

// ---------- 10. drawing loop; a hidden tab stops drawing ----------
let running = !document.hidden, last = performance.now();
document.addEventListener('visibilitychange', () => { running = !document.hidden; last = performance.now(); });
world.renderer.setAnimationLoop((now) => {
  if (!running) return;
  const raw = (now - last) / 1000, dt = Math.min(0.05, raw); last = now;
  // Walkers move by the clock; the camera follows with the real gap so slow devices do not trail far behind.
  stepMe(dt); drawPeers(dt); updateCamera(Math.min(0.5, raw), now / 1000);
  world.frame(dt, now / 1000, look);
  world.renderer.render(world.scene, world.camera);
  ui?.tickFps?.(now);
  window.__frames = (window.__frames || 0) + 1;
});

// What the menu (next task) and checks drive.
const api = { walkTo, joinCourse, leaveCourse, setPace, setView, setQuality, setProfile, courseNow: () => courseNow(myMotion, serverNow()), get motion() { return myMotion; }, get status() { return netStatus; }, get courseLine() { return courseLine; }, get me() { return me; }, get ui() { return ui; }, world, peers, syncPeers };
if (params.has('debug')) window.__walk3d = api;

// ---------- 12. screen controls ----------
const TIMES = ['now', 'day', 'sunset', 'night'];
const startTime = TIMES.includes(params.get('time')) ? params.get('time') : 'now';
if (startTime !== 'now') world.setTimeMode(startTime);
// Weather and season previews are hidden settings only (#wx=, #season=).
if (params.has('wx') || params.has('season')) world.setPreview({ wxMode: params.get('wx') || 'live', seasonMode: params.get('season') || 'date' });
const savedQ = loadSavedQuality();
let currentRoom = roomFromHash(location.hash);
ui = createUI({
  courses: Object.fromEntries(Object.keys(COURSE_NAMES).map((k) => [k, { name: COURSE_NAMES[k], loop: courses[k].loop }])),
  profile: { name, outfit, looks: LOOKS, ask: askProfile },
  state: { pace, view: viewMode, time: startTime, quality: QUALITY[params.get('q')] ? params.get('q') : savedQ === 'high' || savedQ === 'low' ? savedQ : 'auto' },
  showFps: params.has('fps'),
  onCourse: joinCourse, onLeaveCourse: leaveCourse, onPace: setPace, onView: setView,
  onTime: (t) => world.setTimeMode(t),
  onQuality: (q) => setQuality(q, true),
  onProfile: setProfile,
  getRoomLink: () => location.origin + location.pathname + '#room=' + currentRoom
});
ui.syncJoin(myMotion);
ui.showStatus(netStatus);
ui.askProfileIfNeeded();

// ---------- 9. start (es2020 build: no top-level await) ----------
async function start() {
  pickQuality();
  fetchLiveWeather().then((l) => world.setLive(l)).catch(() => world.setLive(null));
  setInterval(() => fetchLiveWeather().then((l) => world.setLive(l)).catch(() => {}), 15 * 60 * 1000);
  setInterval(() => world.tickClock(), 60 * 1000);

  // A stalled /api/time must not hold up joining: each try gives up after 2 s.
  const fetchFn = (url, opts) => fetch(url, { ...opts, signal: typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(2000) : undefined });
  const offset = await syncServerClock({ fetchFn });
  // Re-base what is already moving so nothing jumps when the clock shifts.
  if (myMotion.t0 !== undefined) myMotion = { ...myMotion, t0: myMotion.t0 + offset };
  clockOffset = offset;

  session = createSession({
    client: supabase, selfId, profile: { name, outfit, joinedAt: serverNow() }, motion: myMotion,
    startRoom: roomFromHash(location.hash), cap: Number(params.get('cap')) || undefined, validator,
    on: {
      peers: syncPeers,
      status: (s) => { netStatus = s; ui?.showStatus?.(s); },
      notice: () => {}, chat: () => {}
    }
  });
  session.ready.then((r) => { currentRoom = r.room || currentRoom; ui?.showRoom?.(r, peopleHere()); });
  addEventListener('pagehide', (e) => { if (!e.persisted) session.leave(); });
}
start();
