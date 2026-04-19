// © 2026 김용현
import { createScene, GATE_ANGLE, nextGateCrossingTime } from './scene.js';
import { createChatUI } from './chat.js';
import { createRealtime } from './realtime.js';
import { currentTheme, applyThemeToCss } from './theme.js';
import { loadProfile, saveProfile, randomProfile, randomMotion, uuid, EMOJI_CHOICES, HEAD_BG_CHOICES, DEFAULT_HEAD_BG, PALETTE } from './utils.js';

const FADE_MS = 1400;
const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD || 'admin';
const ADMIN_AUTH_KEY = 'mealnstroll.admin.authed';

// Detect admin mode from URL: /admin path, ?admin, or #admin
function detectAdminMode() {
  const p = window.location.pathname;
  const s = window.location.search;
  const h = window.location.hash;
  return /\/admin\/?$/.test(p) || /[?&]admin\b/.test(s) || h === '#admin';
}

let isAdmin = false;
let currentNotice = null;

function tryEnterAdmin() {
  if (!detectAdminMode()) return;
  const already = sessionStorage.getItem(ADMIN_AUTH_KEY) === '1';
  if (already) { isAdmin = true; return; }
  const input = window.prompt('관리자 비밀번호');
  if (input === null) return; // cancelled
  if (input === ADMIN_PASSWORD) {
    isAdmin = true;
    sessionStorage.setItem(ADMIN_AUTH_KEY, '1');
  } else {
    alert('비밀번호가 틀렸습니다.');
  }
}
tryEnterAdmin();

// ---------- state ----------
const selfId = (() => {
  let id = localStorage.getItem('mealnstroll.id');
  if (!id) { id = uuid(); localStorage.setItem('mealnstroll.id', id); }
  return id;
})();

let profile = loadProfile() || randomProfile();
if (!profile.headBg) profile.headBg = DEFAULT_HEAD_BG; // migrate older profiles
saveProfile(profile);
const motion = { ...randomMotion(), angle0: GATE_ANGLE, startedAt: Date.now() };

const me = { id: selfId, you: true, ...profile, ...motion };
const others = new Map(); // id -> avatar state
const leaving = new Map(); // id -> avatar with exitAt (for departure animation)

// ---------- DOM ----------
const canvas = document.getElementById('scene');
const theme = currentTheme();
applyThemeToCss(theme);

const scene = createScene(canvas, theme);

const nameInput = document.getElementById('me-name');
const avatarDot = document.getElementById('me-avatar');
const refreshBtn = document.getElementById('me-refresh');
const onlineCount = document.getElementById('online-count');

nameInput.value = profile.name;
renderMeAvatar();

const chat = createChatUI({
  listEl: document.getElementById('chat-log'),
  formEl: document.getElementById('chat-form'),
  inputEl: document.getElementById('chat-input'),
  onSubmit: (text) => {
    me.bubble = { text, at: Date.now() };
    rt.sendChat(text);
  }
});

chat.append({ system: true, text: `${theme.label}의 산책을 시작합니다 🍃` });

// ---------- realtime ----------
const rt = createRealtime({
  selfId,
  initialState: serializeMe(),
  onSync: (list) => {
    const nextIds = new Set(list.map(p => p.id));
    // Preserve bubbles across sync
    const prev = new Map(others);
    others.clear();
    for (const p of list) {
      if (p.id === selfId) continue;
      const existing = prev.get(p.id);
      others.set(p.id, {
        ...p,
        bubble: existing?.bubble || null
      });
      // If someone re-joined while in leaving, cancel the exit animation
      if (leaving.has(p.id)) leaving.delete(p.id);
    }
    onlineCount.textContent = nextIds.size;
  },
  onChat: (msg) => {
    chat.append(msg);
    if (msg.self) {
      me.bubble = { text: msg.text, at: msg.at || Date.now() };
    } else {
      const target = others.get(msg.id);
      if (target) target.bubble = { text: msg.text, at: msg.at || Date.now() };
    }
  },
  onSystem: (text) => chat.append({ system: true, text }),
  onNotice: (payload) => {
    currentNotice = payload;
    renderNotice(payload);
    if (isAdmin && payload) {
      localStorage.setItem('mealnstroll.notice', JSON.stringify(payload));
    } else if (isAdmin && !payload) {
      localStorage.removeItem('mealnstroll.notice');
    }
  },
  onNoticeRequest: () => {
    // Only admin tabs rebroadcast the current notice for newly joined clients.
    if (isAdmin && currentNotice) rt.sendNotice(currentNotice.text);
  },
  onLeave: (p) => {
    const current = others.get(p.id) || p;
    // Only animate exit if we have enough motion state to project the path.
    if (typeof current.angle0 !== 'number' || typeof current.speed !== 'number' || !current.startedAt) return;
    const exitAt = nextGateCrossingTime(current, Date.now());
    leaving.set(p.id, { ...current, exitAt, you: false });
  }
});

// ---------- UI handlers ----------
refreshBtn.addEventListener('click', () => {
  profile = randomProfile();
  saveProfile(profile);
  Object.assign(me, profile);
  nameInput.value = profile.name;
  renderMeAvatar();
  rt.updateSelf({ name: me.name, emoji: me.emoji, color: me.color, headBg: me.headBg });
});

let nameDebounce;
nameInput.addEventListener('input', () => {
  clearTimeout(nameDebounce);
  nameDebounce = setTimeout(() => {
    const n = nameInput.value.trim() || '익명';
    profile.name = n;
    me.name = n;
    saveProfile(profile);
    rt.updateSelf({ name: n });
  }, 300);
});

const helpBtn = document.getElementById('help-btn');
const helpModal = document.getElementById('help-modal');
helpBtn.addEventListener('click', () => { helpModal.hidden = false; });
helpModal.addEventListener('click', (e) => {
  if (e.target.hasAttribute('data-close')) helpModal.hidden = true;
});

// ---------- emoji picker ----------
const emojiModal = document.getElementById('emoji-picker');
const emojiGrid = document.getElementById('emoji-grid');

for (const emo of EMOJI_CHOICES) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'emoji-btn';
  btn.textContent = emo;
  btn.addEventListener('click', () => {
    profile.emoji = emo;
    me.emoji = emo;
    saveProfile(profile);
    renderMeAvatar();
    rt.updateSelf({ emoji: emo });
    emojiModal.hidden = true;
  });
  emojiGrid.appendChild(btn);
}

const bgSwatches = document.getElementById('bg-swatches');
for (const color of HEAD_BG_CHOICES) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'swatch-btn';
  btn.style.background = color;
  btn.dataset.color = color;
  btn.setAttribute('aria-label', `배경색 ${color}`);
  btn.addEventListener('click', () => {
    profile.headBg = color;
    me.headBg = color;
    saveProfile(profile);
    rt.updateSelf({ headBg: color });
    for (const s of bgSwatches.querySelectorAll('.swatch-btn')) {
      s.classList.toggle('selected', s.dataset.color === color);
    }
  });
  bgSwatches.appendChild(btn);
}

const bgCustomInput = document.getElementById('bg-custom');
let bgCustomDebounce;
bgCustomInput.addEventListener('input', (e) => {
  const color = e.target.value;
  profile.headBg = color;
  me.headBg = color;
  saveProfile(profile);
  for (const s of bgSwatches.querySelectorAll('.swatch-btn')) {
    s.classList.toggle('selected', s.dataset.color === color);
  }
  clearTimeout(bgCustomDebounce);
  bgCustomDebounce = setTimeout(() => rt.updateSelf({ headBg: color }), 150);
});

// ---------- outfit (torso) color ----------
const outfitSwatches = document.getElementById('outfit-swatches');
for (const color of PALETTE) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'swatch-btn';
  btn.style.background = color;
  btn.dataset.color = color;
  btn.setAttribute('aria-label', `옷 색 ${color}`);
  btn.addEventListener('click', () => {
    profile.color = color;
    me.color = color;
    saveProfile(profile);
    renderMeAvatar();
    rt.updateSelf({ color });
    for (const s of outfitSwatches.querySelectorAll('.swatch-btn')) {
      s.classList.toggle('selected', s.dataset.color === color);
    }
  });
  outfitSwatches.appendChild(btn);
}

const outfitCustomInput = document.getElementById('outfit-custom');
let outfitCustomDebounce;
outfitCustomInput.addEventListener('input', (e) => {
  const color = e.target.value;
  profile.color = color;
  me.color = color;
  saveProfile(profile);
  renderMeAvatar();
  for (const s of outfitSwatches.querySelectorAll('.swatch-btn')) {
    s.classList.toggle('selected', s.dataset.color.toLowerCase() === color.toLowerCase());
  }
  clearTimeout(outfitCustomDebounce);
  outfitCustomDebounce = setTimeout(() => rt.updateSelf({ color }), 150);
});

function openEmojiPicker() {
  emojiModal.hidden = false;
  for (const btn of emojiGrid.querySelectorAll('.emoji-btn')) {
    btn.classList.toggle('selected', btn.textContent === me.emoji);
  }
  for (const s of bgSwatches.querySelectorAll('.swatch-btn')) {
    s.classList.toggle('selected', s.dataset.color === me.headBg);
  }
  if (me.headBg && /^#[0-9a-fA-F]{6}$/.test(me.headBg)) bgCustomInput.value = me.headBg;

  for (const s of outfitSwatches.querySelectorAll('.swatch-btn')) {
    s.classList.toggle('selected', s.dataset.color.toLowerCase() === (me.color || '').toLowerCase());
  }
  if (me.color && /^#[0-9a-fA-F]{6}$/.test(me.color)) outfitCustomInput.value = me.color;
}

emojiModal.addEventListener('click', (e) => {
  if (e.target.hasAttribute('data-emoji-close')) emojiModal.hidden = true;
});

avatarDot.addEventListener('click', openEmojiPicker);

// Click on my character's head in canvas
canvas.addEventListener('click', (e) => {
  const rect = canvas.getBoundingClientRect();
  const cxp = e.clientX - rect.left;
  const cyp = e.clientY - rect.top;
  const pos = scene.screenPos(me);
  // head area: roughly centered at pos.y - 6, radius ~16
  const dx = cxp - pos.x;
  const dy = cyp - (pos.y - 6);
  if (dx * dx + dy * dy < 18 * 18) openEmojiPicker();
});

// Hover cue over my character's head
canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  const cxp = e.clientX - rect.left;
  const cyp = e.clientY - rect.top;
  const pos = scene.screenPos(me);
  const dx = cxp - pos.x;
  const dy = cyp - (pos.y - 6);
  canvas.classList.toggle('pointer-on-self', dx * dx + dy * dy < 18 * 18);
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!helpModal.hidden) helpModal.hidden = true;
    if (!emojiModal.hidden) emojiModal.hidden = true;
  }
});

// ---------- notice banner ----------
const noticeBanner = document.getElementById('notice-banner');
const noticeTextEl = document.getElementById('notice-text');
const noticeMetaEl = document.getElementById('notice-meta');
const noticeToggle = document.getElementById('notice-toggle');
const NOTICE_COLLAPSE_KEY = 'mealnstroll.notice.collapsed';

// Restore collapsed state
if (localStorage.getItem(NOTICE_COLLAPSE_KEY) === '1') {
  noticeBanner.classList.add('collapsed');
  noticeToggle.setAttribute('aria-expanded', 'false');
}

noticeToggle.addEventListener('click', () => {
  const collapsed = noticeBanner.classList.toggle('collapsed');
  noticeToggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  localStorage.setItem(NOTICE_COLLAPSE_KEY, collapsed ? '1' : '0');
});

let noticeExpiryTimer = null;

function formatExpiry(expiresAt) {
  if (!expiresAt) return '상시';
  const remaining = expiresAt - Date.now();
  if (remaining <= 0) return '만료';
  const mins = Math.floor(remaining / 60000);
  if (mins < 60) return `${mins}분 남음`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 남음`;
  const days = Math.floor(hours / 24);
  return `${days}일 남음`;
}

function renderNotice(payload) {
  if (noticeExpiryTimer) { clearTimeout(noticeExpiryTimer); noticeExpiryTimer = null; }
  if (!payload || !payload.text) {
    noticeBanner.hidden = true;
    noticeTextEl.textContent = '';
    noticeMetaEl.textContent = '';
    return;
  }
  // Expired before rendering
  if (payload.expiresAt && payload.expiresAt <= Date.now()) {
    noticeBanner.hidden = true;
    currentNotice = null;
    return;
  }
  noticeTextEl.innerHTML = '';
  linkifyNoticeInto(noticeTextEl, payload.text);
  noticeMetaEl.textContent = payload.expiresAt ? formatExpiry(payload.expiresAt) : '';
  noticeBanner.hidden = false;

  // Schedule auto-hide at expiry
  if (payload.expiresAt) {
    const remaining = payload.expiresAt - Date.now();
    noticeExpiryTimer = setTimeout(() => {
      currentNotice = null;
      renderNotice(null);
      if (isAdmin) localStorage.removeItem('mealnstroll.notice');
    }, Math.max(0, remaining));
  }
}

const NOTICE_URL_RE = /\b(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)/gi;
const NOTICE_TRAIL = /[.,;:!?)\]}»"']+$/;
function linkifyNoticeInto(el, text) {
  let lastIdx = 0;
  let m;
  NOTICE_URL_RE.lastIndex = 0;
  while ((m = NOTICE_URL_RE.exec(text)) !== null) {
    let url = m[0];
    const trail = url.match(NOTICE_TRAIL);
    if (trail) { url = url.slice(0, -trail[0].length); NOTICE_URL_RE.lastIndex -= trail[0].length; }
    if (m.index > lastIdx) el.appendChild(document.createTextNode(text.slice(lastIdx, m.index)));
    const a = document.createElement('a');
    a.href = url.startsWith('http') ? url : `https://${url}`;
    a.textContent = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    el.appendChild(a);
    lastIdx = m.index + url.length;
  }
  if (lastIdx < text.length) el.appendChild(document.createTextNode(text.slice(lastIdx)));
}

// Ask any admin in the channel to rebroadcast the current notice for new joiners.
setTimeout(() => rt.requestNotice(), 800);

// ---------- admin panel ----------
if (isAdmin) {
  const adminPanel = document.getElementById('admin-panel');
  const adminInput = document.getElementById('admin-notice-input');
  const durationSel = document.getElementById('admin-duration');
  const postBtn = document.getElementById('admin-post');
  const clearBtn = document.getElementById('admin-clear');
  const closeBtn = document.getElementById('admin-close');

  adminPanel.hidden = false;

  function computeExpiry(value) {
    if (!value) return null;
    if (value === 'today') {
      const d = new Date();
      d.setHours(23, 59, 59, 999);
      return d.getTime();
    }
    const ms = Number(value);
    if (!isFinite(ms) || ms <= 0) return null;
    return Date.now() + ms;
  }

  // Restore last notice this admin posted, if still valid
  const saved = localStorage.getItem('mealnstroll.notice');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (!parsed.expiresAt || parsed.expiresAt > Date.now()) {
        adminInput.value = parsed.text || '';
        currentNotice = parsed;
        renderNotice(parsed);
        // Rebroadcast so other tabs see the notice immediately on admin refresh
        setTimeout(() => rt.sendNotice(parsed.text, parsed.expiresAt || null), 500);
      } else {
        localStorage.removeItem('mealnstroll.notice');
      }
    } catch {}
  }

  postBtn.addEventListener('click', () => {
    const text = adminInput.value.trim();
    if (!text) return;
    const expiresAt = computeExpiry(durationSel.value);
    rt.sendNotice(text, expiresAt);
  });

  clearBtn.addEventListener('click', () => {
    adminInput.value = '';
    rt.clearNotice();
  });

  closeBtn.addEventListener('click', () => {
    adminPanel.hidden = true;
  });
}

window.addEventListener('beforeunload', () => rt.leave());

// ---------- render loop ----------
function loop() {
  const now = Date.now();

  // Compute fade for me (entering)
  me.alpha = fadeInAlpha(me.startedAt, now);

  // Prune leaving avatars past their exit time, set fade-out alpha
  for (const [id, av] of leaving) {
    const remaining = av.exitAt - now;
    if (remaining <= 0) { leaving.delete(id); continue; }
    av.alpha = Math.min(1, remaining / FADE_MS);
  }

  // Entering fade for others too
  for (const av of others.values()) av.alpha = fadeInAlpha(av.startedAt, now);

  const avatars = [me, ...others.values(), ...leaving.values()];
  scene.render(theme, avatars);
  requestAnimationFrame(loop);
}
loop();

function fadeInAlpha(startedAt, now) {
  if (!startedAt) return 1;
  const age = now - startedAt;
  if (age >= FADE_MS) return 1;
  return Math.max(0, age / FADE_MS);
}


// ---------- helpers ----------
function serializeMe() {
  return {
    id: me.id,
    name: me.name,
    emoji: me.emoji,
    color: me.color,
    headBg: me.headBg,
    angle0: me.angle0,
    speed: me.speed,
    startedAt: me.startedAt
  };
}

function renderMeAvatar() {
  avatarDot.style.background = profile.color;
  avatarDot.textContent = profile.emoji;
  avatarDot.style.display = 'inline-flex';
  avatarDot.style.alignItems = 'center';
  avatarDot.style.justifyContent = 'center';
  avatarDot.style.fontSize = '18px';
}
