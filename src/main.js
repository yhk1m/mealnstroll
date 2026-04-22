// © 2026 김용현
import { createScene, GATE_ANGLE, avatarLaps } from './scene.js';
import { createChatUI } from './chat.js';
import { createRealtime } from './realtime.js';
import { currentTheme, applyThemeToCss } from './theme.js';
import { loadProfile, saveProfile, randomProfile, randomMotion, uuid, EMOJI_CHOICES, HEAD_BG_CHOICES, DEFAULT_HEAD_BG, PALETTE, loadBestScore, saveBestScore, loadBestScoreSleepers, saveBestScoreSleepers } from './utils.js';
import { createGame } from './game.js';
import { createSleepersGame } from './sleepers.js';
import {
  loadFortuneProfile,
  saveFortuneProfile,
  buildFortune,
  validateProfile,
  formatKoreanDate,
  renderStars
} from './fortune.js';
import { getLocation, fetchWeather, decorFromWeather } from './weather.js';

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

let myBestScore = loadBestScore();
let myBestScoreSleepers = loadBestScoreSleepers();
const me = { id: selfId, you: true, ...profile, ...motion, bestScore: myBestScore, bestScoreSleepers: myBestScoreSleepers };
const others = new Map(); // id -> avatar state

// ---------- DOM ----------
const canvas = document.getElementById('scene');
const theme = currentTheme();
applyThemeToCss(theme);

const scene = createScene(canvas, theme);

const nameInput = document.getElementById('me-name');
const avatarDot = document.getElementById('me-avatar');
const refreshBtn = document.getElementById('me-refresh');
const onlineCount = document.getElementById('online-count');
const lapTotalEl = document.getElementById('lap-total');
const seenTotalEl = document.getElementById('seen-total');

function renderLapTotal() {
  lapTotalEl.textContent = avatarLaps(me, Date.now());
}
renderLapTotal();
setInterval(renderLapTotal, 1000);

// Cumulative distinct walkers ever seen by this browser.
const SEEN_IDS_KEY = 'mealnstroll.seen.ids';
const seenIds = new Set();
try {
  const raw = localStorage.getItem(SEEN_IDS_KEY);
  if (raw) for (const id of JSON.parse(raw)) seenIds.add(id);
} catch {}
seenIds.add(selfId);

function recordSeen(ids) {
  let changed = false;
  for (const id of ids) {
    if (id && !seenIds.has(id)) { seenIds.add(id); changed = true; }
  }
  if (changed) {
    try { localStorage.setItem(SEEN_IDS_KEY, JSON.stringify([...seenIds])); } catch {}
  }
  seenTotalEl.textContent = seenIds.size;
}
recordSeen([]);

nameInput.value = profile.name;
renderMeAvatar();

const chat = createChatUI({
  listEl: document.getElementById('chat-log'),
  formEl: document.getElementById('chat-form'),
  inputEl: document.getElementById('chat-input'),
  onSubmit: (text) => {
    me.bubble = { text, at: Date.now() };
    rt.sendChat(text);
  },
  getUsers: () => {
    const users = [{ name: me.name, emoji: me.emoji, self: true }];
    for (const o of others.values()) users.push({ name: o.name, emoji: o.emoji });
    return users;
  },
  getMyName: () => me.name
});

chat.append({ system: true, text: `${theme.label}의 산책을 시작합니다 🍃` });

// --- live weather → decor ---
(async function applyWeatherDecor() {
  try {
    const loc = await getLocation();
    const w = await fetchWeather(loc.lat, loc.lon);
    const { decor, label } = decorFromWeather(w);
    theme.decor = decor;
    const placeHint = loc.fallback ? ' (서울 기준)' : '';
    chat.append({ system: true, text: `🌤 오늘 날씨: ${label}${placeHint}` });
  } catch {
    theme.decor = 'sun';
  }
})();

// --- keep the time-of-day palette fresh (day → dusk → night transitions) ---
setInterval(() => {
  const fresh = currentTheme();
  if (fresh.timeOfDay !== theme.timeOfDay) {
    const preservedDecor = theme.decor;
    Object.assign(theme, fresh, { decor: preservedDecor });
    applyThemeToCss(theme);
    chat.append({ system: true, text: `🌇 ${theme.label}` });
  }
}, 5 * 60 * 1000);

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
    }
    onlineCount.textContent = nextIds.size;
    recordSeen(list.map(p => p.id));
    if (gameOpen) renderRanking();
    if (sleepersOpen) renderSleepersRanking();
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
  onSystem: (text) => {
    // Suppress join/leave notices while any focused minigame modal is open
    // so the session stays quiet.
    if (gameOpen || sleepersOpen) return;
    chat.append({ system: true, text });
  },
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
  // No exit animation: a user who closes the tab disappears immediately
  // (presence 'leave' + next onSync removes them from `others`).
  onLeave: () => {},
  onProfileUpdate: ({ id, patch }) => {
    const target = others.get(id);
    if (target && patch) Object.assign(target, patch);
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
const helpDismissCheckbox = document.getElementById('help-dismiss-today');
const HELP_DISMISS_KEY = 'mealnstroll.help.dismissedDate';

function todayYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Auto-open the help modal on startup unless the user dismissed it today.
if (localStorage.getItem(HELP_DISMISS_KEY) !== todayYmd()) {
  helpModal.hidden = false;
}

function closeHelpModal() {
  if (helpDismissCheckbox && helpDismissCheckbox.checked) {
    localStorage.setItem(HELP_DISMISS_KEY, todayYmd());
  }
  helpModal.hidden = true;
  document.getElementById('chat-input').focus();
}

helpBtn.addEventListener('click', () => {
  if (helpDismissCheckbox) helpDismissCheckbox.checked = false;
  helpModal.hidden = false;
});

// ---------- pause (local-only freeze of the canvas animation) ----------
let pausedAt = null;
const pauseBtn = document.getElementById('pause-btn');
pauseBtn.addEventListener('click', () => {
  if (pausedAt === null) {
    pausedAt = Date.now();
    pauseBtn.textContent = '▶';
    pauseBtn.classList.add('paused');
    pauseBtn.setAttribute('aria-label', '산책 다시 시작');
    pauseBtn.title = '산책 다시 시작';
  } else {
    pausedAt = null;
    pauseBtn.textContent = '⏸';
    pauseBtn.classList.remove('paused');
    pauseBtn.setAttribute('aria-label', '산책 멈춤');
    pauseBtn.title = '산책 멈춤 (정신없을 때)';
  }
});
helpModal.addEventListener('click', (e) => {
  if (e.target.hasAttribute('data-close')) closeHelpModal();
});

// ---------- dino game ----------
const gameBtn = document.getElementById('game-btn');
const gameModal = document.getElementById('game-modal');
const gameCanvas = document.getElementById('dino-canvas');
const gameCurrentEl = document.getElementById('game-current');
const gameBestEl = document.getElementById('game-best');
const gameRestartBtn = document.getElementById('game-restart');
const gameRankingEl = document.getElementById('game-ranking');

let game = null;
let gameOpen = false;

function renderRanking() {
  const rows = [];
  for (const av of others.values()) {
    if ((av.bestScore || 0) > 0) rows.push({ id: av.id, name: av.name || '익명', emoji: av.emoji || '🙂', score: av.bestScore, me: false });
  }
  if ((me.bestScore || 0) > 0) rows.push({ id: me.id, name: me.name || '나', emoji: me.emoji || '🙂', score: me.bestScore, me: true });
  rows.sort((a, b) => b.score - a.score);
  const top = rows.slice(0, 10);

  gameRankingEl.innerHTML = '';
  if (top.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = '아직 기록이 없어요. 첫 점수의 주인공이 되어보세요!';
    gameRankingEl.appendChild(li);
    return;
  }
  top.forEach((row, i) => {
    const li = document.createElement('li');
    if (row.me) li.classList.add('me');
    const rank = document.createElement('span');
    rank.className = 'rank';
    rank.textContent = `${i + 1}.`;
    const who = document.createElement('span');
    who.className = 'who';
    who.textContent = `${row.emoji} ${row.name}${row.me ? ' (나)' : ''}`;
    const score = document.createElement('span');
    score.className = 'score';
    score.textContent = `${row.score}점`;
    li.append(rank, who, score);
    gameRankingEl.appendChild(li);
  });
}

function openGame() {
  gameModal.hidden = false;
  gameOpen = true;
  gameBestEl.textContent = me.bestScore || 0;
  gameCurrentEl.textContent = 0;
  renderRanking();
  if (!game) {
    game = createGame(gameCanvas, {
      onTick: (s) => { gameCurrentEl.textContent = s; },
      onGameOver: (finalScore) => {
        gameCurrentEl.textContent = finalScore;
        if (finalScore > (me.bestScore || 0)) {
          me.bestScore = finalScore;
          saveBestScore(finalScore);
          gameBestEl.textContent = finalScore;
          rt.updateSelf({ bestScore: finalScore });
          rt.sendChat(`🏆 복도달리기 ${finalScore}점 신기록!`);
          renderRanking();
        }
      }
    });
  } else {
    game.reset();
  }
  // The modal pops in with a 0.18s scale animation and was display:none
  // before, so ResizeObserver may not fire and the canvas rect can read 0
  // for a few frames. Poll until it has a real size, then redraw.
  let attempts = 0;
  const ensureSize = () => {
    if (!game || gameModal.hidden) return;
    const rect = gameCanvas.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      game.redraw();
      return;
    }
    if (++attempts < 30) requestAnimationFrame(ensureSize);
  };
  requestAnimationFrame(ensureSize);
  // focus canvas so keyboard works
  setTimeout(() => gameCanvas.focus?.(), 0);
}

function closeGame() {
  gameModal.hidden = true;
  gameOpen = false;
  game?.reset();
}

gameBtn.addEventListener('click', openGame);
gameModal.addEventListener('click', (e) => {
  if (e.target.hasAttribute('data-game-close')) closeGame();
});
gameRestartBtn.addEventListener('click', () => game?.start());

// Canvas input: click/tap to jump
gameCanvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  game?.jump();
});

// Keyboard input (only when modal is open)
document.addEventListener('keydown', (e) => {
  if (!gameOpen) return;
  if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'Up') {
    e.preventDefault();
    game?.jump();
  } else if (e.key === 'ArrowDown' || e.key === 'Down') {
    e.preventDefault();
    game?.setDucking(true);
  }
});
document.addEventListener('keyup', (e) => {
  if (!gameOpen) return;
  if (e.key === 'ArrowDown' || e.key === 'Down') game?.setDucking(false);
});

// ---------- 학생 깨우기 (sleepers) ----------
const sleepersBtn = document.getElementById('sleepers-btn');
const sleepersModal = document.getElementById('sleepers-modal');
const sleepersStage = document.getElementById('sleepers-stage');
const sleepersCurrentEl = document.getElementById('sleepers-current');
const sleepersBestEl = document.getElementById('sleepers-best');
const sleepersRestartBtn = document.getElementById('sleepers-restart');
const sleepersRankingEl = document.getElementById('sleepers-ranking');

let sleepersGame = null;
let sleepersOpen = false;

function renderSleepersRanking() {
  const rows = [];
  for (const av of others.values()) {
    if ((av.bestScoreSleepers || 0) > 0) {
      rows.push({ id: av.id, name: av.name || '익명', emoji: av.emoji || '🙂', score: av.bestScoreSleepers, me: false });
    }
  }
  if ((me.bestScoreSleepers || 0) > 0) {
    rows.push({ id: me.id, name: me.name || '나', emoji: me.emoji || '🙂', score: me.bestScoreSleepers, me: true });
  }
  rows.sort((a, b) => b.score - a.score);
  const top = rows.slice(0, 10);

  sleepersRankingEl.innerHTML = '';
  if (top.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = '아직 기록이 없어요. 첫 점수의 주인공이 되어보세요!';
    sleepersRankingEl.appendChild(li);
    return;
  }
  top.forEach((row, i) => {
    const li = document.createElement('li');
    if (row.me) li.classList.add('me');
    const rank = document.createElement('span');
    rank.className = 'rank';
    rank.textContent = `${i + 1}.`;
    const who = document.createElement('span');
    who.className = 'who';
    who.textContent = `${row.emoji} ${row.name}${row.me ? ' (나)' : ''}`;
    const score = document.createElement('span');
    score.className = 'score';
    score.textContent = `${row.score}점`;
    li.append(rank, who, score);
    sleepersRankingEl.appendChild(li);
  });
}

function openSleepers() {
  sleepersModal.hidden = false;
  sleepersOpen = true;
  sleepersBestEl.textContent = me.bestScoreSleepers || 0;
  sleepersCurrentEl.textContent = 0;
  renderSleepersRanking();
  if (!sleepersGame) {
    sleepersGame = createSleepersGame(sleepersStage, {
      onTick: (s) => { sleepersCurrentEl.textContent = s; },
      onGameOver: (finalScore) => {
        sleepersCurrentEl.textContent = finalScore;
        if (finalScore > (me.bestScoreSleepers || 0)) {
          me.bestScoreSleepers = finalScore;
          saveBestScoreSleepers(finalScore);
          sleepersBestEl.textContent = finalScore;
          rt.updateSelf({ bestScoreSleepers: finalScore });
          rt.sendChat(`📋 학생깨우기 ${finalScore}점 신기록!`);
          renderSleepersRanking();
        }
      }
    });
  } else {
    sleepersGame.reset();
  }
}

function closeSleepers() {
  sleepersModal.hidden = true;
  sleepersOpen = false;
  sleepersGame?.stop();
}

sleepersBtn.addEventListener('click', openSleepers);
sleepersModal.addEventListener('click', (e) => {
  if (e.target.hasAttribute('data-sleepers-close')) closeSleepers();
});
sleepersRestartBtn.addEventListener('click', () => sleepersGame?.start());

// ---------- 도발하기 (복도달리기 / 학생깨우기 공용) ----------
const tauntBtn = document.getElementById('taunt-btn');
const sleepersTauntBtn = document.getElementById('sleepers-taunt-btn');
const tauntCapture = document.getElementById('taunt-capture');
const tauntTitleEl = document.getElementById('taunt-title');
const tauntListEl = document.getElementById('taunt-list');
const tauntSubtitle = document.getElementById('taunt-subtitle');
const tauntMsgEl = document.getElementById('taunt-message');

function getRankingRows(scoreField) {
  const rows = [];
  for (const av of others.values()) {
    const s = av[scoreField] || 0;
    if (s > 0) {
      rows.push({ id: av.id, name: av.name || '익명', emoji: av.emoji || '🙂', score: s, me: false });
    }
  }
  const myScore = me[scoreField] || 0;
  if (myScore > 0) {
    rows.push({ id: me.id, name: me.name || '나', emoji: me.emoji || '🙂', score: myScore, me: true });
  }
  rows.sort((a, b) => b.score - a.score);
  return rows;
}

function pickTauntMessage(myRank, total) {
  const pools = {
    top: [
      '이번에도 내가 1등! 따라올 테면 따라와봐 🏆',
      '지금 이 점수, 네가 깰 수 있겠어? 😎',
      '1등 자리 양보 안 해. 달려와 보시지.',
      '복도의 제왕은 나야 💨'
    ],
    high: [
      '상위권의 여유... 덤벼볼래? 😏',
      '한 칸만 더 올라가면 1등이야. 같이 해볼래?',
      '따라잡을 수 있으면 따라잡아 보시지!',
      '좀 하는데? 그런데 나한텐 안 돼 🙃'
    ],
    mid: [
      '중위권의 저력을 보여줄게 🔥',
      '네가 나보다 위라고? 오늘 뒤집는다.',
      '지금부터 진짜 시작이야 👊',
      '이 정도면 나쁘지 않지. 붙어볼래?'
    ],
    low: [
      '어허, 이건 시작일 뿐이야 🙃',
      '한 판 더 하면 너 잡는다. 두고 봐.',
      '지금 점수는 가릴 수 있어. 따라와 봐.',
      '여기서 멈출 내가 아니지. 다음 라운드 가자.'
    ]
  };
  let key;
  if (myRank === 1) key = 'top';
  else if (myRank <= 3) key = 'high';
  else if (myRank <= Math.ceil(total / 2)) key = 'mid';
  else key = 'low';
  const pool = pools[key];
  return pool[Math.floor(Math.random() * pool.length)];
}

async function buildTauntCanvas(opts) {
  const { scoreField, titleText } = opts;
  if ((me[scoreField] || 0) <= 0) {
    showToast('먼저 한 판 뛰어서 점수를 올려주세요!');
    return null;
  }
  const rows = getRankingRows(scoreField);
  const myIdx = rows.findIndex((r) => r.me);
  if (myIdx < 0) {
    showToast('랭킹에서 내 점수를 찾지 못했어요.');
    return null;
  }
  const start = Math.max(0, myIdx - 2);
  const end = Math.min(rows.length, myIdx + 3);
  const slice = rows.slice(start, end);
  const myRank = myIdx + 1;

  tauntTitleEl.textContent = titleText;
  tauntListEl.innerHTML = '';
  slice.forEach((row, i) => {
    const actualRank = start + i + 1;
    const li = document.createElement('li');
    if (row.me) li.classList.add('me');
    const rank = document.createElement('span');
    rank.className = 'rank';
    rank.textContent = `${actualRank}위`;
    const who = document.createElement('span');
    who.className = 'who';
    who.textContent = `${row.emoji} ${row.name}${row.me ? ' (나)' : ''}`;
    const score = document.createElement('span');
    score.className = 'score';
    score.textContent = `${row.score}점`;
    li.append(rank, who, score);
    tauntListEl.appendChild(li);
  });
  tauntSubtitle.textContent = `전체 ${rows.length}명 중 ${myRank}위 · ${formatKoreanDate(new Date())}`;
  tauntMsgEl.textContent = pickTauntMessage(myRank, rows.length);

  // Wait for layout + web fonts (Jua) before capture, otherwise html2canvas
  // snapshots with a fallback serif and the card looks ugly.
  await new Promise((r) => setTimeout(r, 30));
  if (document.fonts?.ready) { try { await document.fonts.ready; } catch {} }
  if (typeof window.html2canvas !== 'function') throw new Error('html2canvas not loaded');
  return await window.html2canvas(tauntCapture, { backgroundColor: null, scale: 2, useCORS: true });
}

async function handleTauntClick(opts) {
  try {
    const canvas = await buildTauntCanvas(opts);
    if (!canvas) return;
    const isMobile = /Mobi|Android/i.test(navigator.userAgent);
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
    const file = new File([blob], `${opts.fileSlug}.png`, { type: 'image/png' });
    if (isMobile && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ title: opts.titleText, text: '내 랭킹 한번 봐!', files: [file] });
        return;
      } catch { /* user cancelled → fall through */ }
    }
    const link = document.createElement('a');
    link.download = `${opts.fileSlug}_${new Date().toISOString().slice(0, 10)}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    try {
      if (navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        showToast('도발장을 저장하고 클립보드에도 복사했어요!');
        return;
      }
    } catch { /* clipboard not permitted */ }
    showToast('도발장이 저장됐어요!');
  } catch (err) {
    console.error(err);
    showToast('도발장 생성에 실패했어요');
  } finally {
    // html2canvas can blank the dino-canvas internal bitmap via its DOM clone
    // cleanup, which runs asynchronously AFTER the promise resolves. A single
    // redraw in the finally sometimes happens before that cleanup lands, so
    // redraw on the next frame and again after a short delay.
    if (game && !gameModal.hidden) {
      const redrawGame = () => { if (game && !gameModal.hidden) game.redraw(); };
      requestAnimationFrame(redrawGame);
      setTimeout(redrawGame, 120);
      setTimeout(redrawGame, 400);
    }
  }
}

tauntBtn.addEventListener('click', () => handleTauntClick({
  scoreField: 'bestScore',
  titleText: '⚔️ 복도달리기 도발장',
  fileSlug: '복도달리기_도발장'
}));

sleepersTauntBtn?.addEventListener('click', () => handleTauntClick({
  scoreField: 'bestScoreSleepers',
  titleText: '😴 학생깨우기 도발장',
  fileSlug: '학생깨우기_도발장'
}));

// ---------- fortune (오늘의 교사 운세) ----------
const fortuneBtn = document.getElementById('fortune-btn');
const fortuneFormModal = document.getElementById('fortune-form-modal');
const fortuneResultModal = document.getElementById('fortune-result-modal');
const fortuneForm = document.getElementById('fortune-form');
const fortuneFormError = document.getElementById('fortune-form-error');
const fortuneToast = document.getElementById('fortune-toast');

// Populate year/month/day/hour selects
(function initFortuneFormOptions() {
  const yearSel = document.getElementById('ff-year');
  const monthSel = document.getElementById('ff-month');
  const daySel = document.getElementById('ff-day');
  const hourSel = document.getElementById('ff-hour');

  // 최근 20년은 제외 — 교사가 될 수 있는 최소 연령 고려
  const maxYear = new Date().getFullYear() - 20;
  yearSel.innerHTML = '<option value="">연도</option>' +
    Array.from({ length: maxYear - 1940 + 1 }, (_, i) => maxYear - i)
      .map(y => `<option value="${y}">${y}년</option>`).join('');
  monthSel.innerHTML = '<option value="">월</option>' +
    Array.from({ length: 12 }, (_, i) => i + 1).map(m => `<option value="${m}">${m}월</option>`).join('');
  daySel.innerHTML = '<option value="">일</option>' +
    Array.from({ length: 31 }, (_, i) => i + 1).map(d => `<option value="${d}">${d}일</option>`).join('');
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 30]) {
      const val = h + m / 60;
      const opt = document.createElement('option');
      opt.value = String(val);
      opt.textContent = m === 0 ? `${h}시` : `${h}시 30분`;
      hourSel.appendChild(opt);
    }
  }
})();

// School → homeroom dropdown linkage
function updateHomeroomOptions(schoolLevel, selected) {
  const sel = document.getElementById('ff-homeroom');
  const max = schoolLevel === 'E' ? 6 : 3;
  if (!schoolLevel) {
    sel.innerHTML = '<option value="">먼저 학교급을 선택하세요</option>';
    return;
  }
  const opts = ['<option value="0">비담임</option>'];
  for (let g = 1; g <= max; g++) opts.push(`<option value="${g}">${g}학년 담임</option>`);
  sel.innerHTML = '<option value="">선택하세요</option>' + opts.join('');
  if (selected !== undefined && selected !== '') sel.value = String(selected);
}

fortuneForm.addEventListener('change', (e) => {
  if (e.target.name === 'ff-school') {
    updateHomeroomOptions(e.target.value);
  }
});

function readFortuneFormValues() {
  const birthYear = Number(document.getElementById('ff-year').value);
  const birthMonth = Number(document.getElementById('ff-month').value);
  const birthDay = Number(document.getElementById('ff-day').value);
  const hourVal = document.getElementById('ff-hour').value;
  const birthHour = hourVal === 'unknown' ? null : (hourVal === '' ? undefined : Number(hourVal));
  const gender = document.querySelector('input[name="ff-gender"]:checked')?.value;
  const schoolLevel = document.querySelector('input[name="ff-school"]:checked')?.value;
  const homeroomVal = document.getElementById('ff-homeroom').value;
  const homeroom = homeroomVal === '' ? undefined : Number(homeroomVal);
  const subject = document.getElementById('ff-subject').value;
  return { birthYear, birthMonth, birthDay, birthHour, gender, schoolLevel, homeroom, subject };
}

function fillFortuneFormValues(p) {
  document.getElementById('ff-year').value = p.birthYear || '';
  document.getElementById('ff-month').value = p.birthMonth || '';
  document.getElementById('ff-day').value = p.birthDay || '';
  document.getElementById('ff-hour').value = p.birthHour === null ? 'unknown' : (p.birthHour ?? '');
  if (p.gender) {
    const g = document.querySelector(`input[name="ff-gender"][value="${p.gender}"]`);
    if (g) g.checked = true;
  }
  if (p.schoolLevel) {
    const s = document.querySelector(`input[name="ff-school"][value="${p.schoolLevel}"]`);
    if (s) s.checked = true;
    updateHomeroomOptions(p.schoolLevel, p.homeroom);
  }
  if (p.subject) document.getElementById('ff-subject').value = p.subject;
}

function openFortuneForm() {
  const existing = loadFortuneProfile();
  if (existing) fillFortuneFormValues(existing);
  fortuneFormError.hidden = true;
  fortuneFormModal.hidden = false;
}

function closeFortuneForm() { fortuneFormModal.hidden = true; }

fortuneForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const p = readFortuneFormValues();
  const { ok, errors } = validateProfile(p);
  if (!ok) {
    const firstMsg = Object.values(errors)[0] || '입력값을 확인해주세요';
    fortuneFormError.textContent = firstMsg;
    fortuneFormError.hidden = false;
    return;
  }
  saveFortuneProfile(p);
  closeFortuneForm();
  showFortuneResult(p);
});

function starSpanText(n) { return renderStars(n); }

function showFortuneResult(profile) {
  const f = buildFortune(profile, new Date());
  document.getElementById('fortune-iljin').textContent = `${f.iljin.hanja} · ${f.iljin.korean}`;
  document.getElementById('fortune-date').textContent = formatKoreanDate(f.date);

  const cats = ['total', 'class', 'student', 'office', 'work', 'money', 'romance'];
  for (const c of cats) {
    document.getElementById(`fr-${c}-stars`).textContent = starSpanText(f[c].stars);
    document.getElementById(`fr-${c}-text`).textContent = f[c].text;
  }
  document.getElementById('fr-item-text').textContent = f.item.text;
  document.getElementById('fr-quote-hanja').textContent = f.quote.hanja;
  document.getElementById('fr-quote-korean').textContent = f.quote.korean;
  document.getElementById('fr-tip-text').textContent = f.tip.text;

  fortuneResultModal.hidden = false;
}

fortuneBtn.addEventListener('click', () => {
  const existing = loadFortuneProfile();
  if (existing) showFortuneResult(existing);
  else openFortuneForm();
});

fortuneFormModal.addEventListener('click', (e) => {
  if (e.target.hasAttribute('data-fortune-form-close')) closeFortuneForm();
});
fortuneResultModal.addEventListener('click', (e) => {
  if (e.target.hasAttribute('data-fortune-result-close')) fortuneResultModal.hidden = true;
});

document.getElementById('fortune-edit-btn').addEventListener('click', () => {
  fortuneResultModal.hidden = true;
  openFortuneForm();
});

let toastTimer;
function showToast(text) {
  fortuneToast.textContent = text;
  fortuneToast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { fortuneToast.hidden = true; }, 2200);
}

async function captureResultImage() {
  const el = document.getElementById('fortune-result');
  if (typeof window.html2canvas !== 'function') throw new Error('html2canvas not loaded');
  return await window.html2canvas(el, { backgroundColor: '#fffcf5', scale: 2, useCORS: true });
}

document.getElementById('fortune-save-btn').addEventListener('click', async () => {
  try {
    const canvas = await captureResultImage();
    const link = document.createElement('a');
    const today = new Date();
    const ymd = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
    link.download = `오늘의_교사운세_${ymd}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    showToast('이미지가 저장되었어요');
  } catch (err) {
    console.error(err);
    showToast('이미지 저장에 실패했어요');
  }
});

document.getElementById('fortune-share-btn').addEventListener('click', async () => {
  const url = window.location.origin + window.location.pathname;
  const shareText = '오늘의 교사 운세 확인하기';
  const isMobile = /Mobi|Android/i.test(navigator.userAgent);
  if (navigator.share && isMobile) {
    try {
      const canvas = await captureResultImage();
      const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
      const file = new File([blob], 'fortune.png', { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ title: '오늘의 교사 운세', text: shareText, url, files: [file] });
        return;
      }
      await navigator.share({ title: '오늘의 교사 운세', text: shareText, url });
      return;
    } catch {
      // fall through to clipboard
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    showToast('링크가 복사되었어요!');
  } catch {
    showToast('공유 링크 복사에 실패했어요');
  }
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
  const pos = scene.screenPos(me, pausedAt);
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
  const pos = scene.screenPos(me, pausedAt);
  const dx = cxp - pos.x;
  const dy = cyp - (pos.y - 6);
  canvas.classList.toggle('pointer-on-self', dx * dx + dy * dy < 18 * 18);
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!helpModal.hidden) closeHelpModal();
    if (!emojiModal.hidden) emojiModal.hidden = true;
    if (!gameModal.hidden) closeGame();
    if (!sleepersModal.hidden) closeSleepers();
    if (!fortuneFormModal.hidden) fortuneFormModal.hidden = true;
    if (!fortuneResultModal.hidden) fortuneResultModal.hidden = true;
  }
});

// Press Enter anywhere (when not typing in another field) to jump into the chat
// input. On first visit this also auto-dismisses the help modal so newcomers
// can start chatting immediately.
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || e.isComposing) return;
  const active = document.activeElement;
  if (active && /^(INPUT|TEXTAREA|SELECT|BUTTON)$/i.test(active.tagName)) return;
  if (active && active.isContentEditable) return;
  if (gameOpen || sleepersOpen) return;
  if (!emojiModal.hidden || !fortuneFormModal.hidden || !fortuneResultModal.hidden) return;
  if (!helpModal.hidden) closeHelpModal();
  const chatInput = document.getElementById('chat-input');
  if (chatInput) {
    e.preventDefault();
    chatInput.focus();
  }
});

// If the help modal isn't showing on load, park focus on the chat input so a
// plain Enter works from the very first keypress.
if (helpModal.hidden) {
  document.getElementById('chat-input').focus();
}

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

window.addEventListener('beforeunload', (e) => {
  rt.leave();
  // Most browsers ignore the custom message and show a generic prompt,
  // but setting returnValue is required to trigger the dialog.
  e.preventDefault();
  e.returnValue = '새로고침하면 캐릭터와 진행 상태가 초기화돼요.';
  return e.returnValue;
});

// ---------- render loop ----------
function loop() {
  const now = pausedAt ?? Date.now();

  // No fade-in / fade-out: avatars appear and disappear instantly.
  me.alpha = 1;
  for (const av of others.values()) av.alpha = 1;

  const avatars = [me, ...others.values()];
  scene.render(theme, avatars, now);
  requestAnimationFrame(loop);
}
loop();


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
    startedAt: me.startedAt,
    bestScore: me.bestScore || 0,
    bestScoreSleepers: me.bestScoreSleepers || 0
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
