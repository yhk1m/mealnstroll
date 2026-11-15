// © 2026 김용현
// The screen controls: bottom menu, settings panel, room badge, connection state, name and outfit card.
// Knows nothing about three or Supabase; main.js hands it callbacks and calls it back.
const $ = (id) => document.getElementById(id);
const STATUS_TEXT = { connecting: '연결하는 중', reconnecting: '다시 연결하는 중', solo: '혼자 걷는 중이에요' };

export function createUI({
  onCourse, onLeaveCourse, onPace, onTime, onView, onQuality, onProfile, getRoomLink,
  courses, profile, state = {}, showFps = false
}) {
  // courses: { key: { name, loop } }, profile: { name, outfit, looks, ask }
  const ui = { course: 'track', pace: 'normal', time: 'now', view: 'walk', quality: 'auto', ...state };
  const hint = $('hint'), joinBtn = $('join'), panel = $('panel'), settingsBtn = $('settings-btn'), dock = document.querySelector('.dock');
  let motion = null;

  // ---------- pressed states and the hint line ----------
  function syncButtons() {
    [['seg-course', ui.course], ['seg-pace', ui.pace], ['seg-time', ui.time], ['seg-view', ui.view], ['seg-quality', ui.quality]].forEach(([id, v]) => {
      document.querySelectorAll('#' + id + ' button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === v)));
    });
    const m = motion;
    const target = m?.kind === 'course' ? m.course : m?.kind === 'go' && m.then ? m.then.course : null;
    if (target) ui.course = target;
    document.querySelectorAll('#seg-course button').forEach((b) => b.setAttribute('aria-pressed', String(!!target && b.dataset.v === target)));
    joinBtn.setAttribute('aria-pressed', String(!!target));
    joinBtn.textContent = target ? '코스에서 나오기' : '산책 참여하기';
    const c = courses[ui.course];
    if (m?.kind === 'course') {
      hint.textContent = c.name + ' 코스, ' + Math.round(c.loop / 10) * 10 + 'm, 한 바퀴 약 ' + Math.max(1, Math.round(c.loop / m.speed / 60)) + '분';
    } else if (target) {
      hint.textContent = c.name + ' 코스로 가는 중입니다';
    } else {
      hint.textContent = '바닥을 누르면 그곳으로 걸어갑니다';
    }
  }
  const pick = (id, key, fn) => document.querySelectorAll('#' + id + ' button').forEach((b) => b.addEventListener('click', () => {
    ui[key] = b.dataset.v;
    fn?.(b.dataset.v);
    syncButtons();
  }));
  pick('seg-course', 'course', onCourse);
  pick('seg-pace', 'pace', onPace);
  pick('seg-time', 'time', onTime);
  pick('seg-view', 'view', onView);
  pick('seg-quality', 'quality', onQuality);
  joinBtn.addEventListener('click', () => {
    if (joinBtn.getAttribute('aria-pressed') === 'true') onLeaveCourse?.();
    else onCourse?.(ui.course);
  });

  // ---------- settings panel; the dock height also places notes and the fps number ----------
  const fitDock = () => document.documentElement.style.setProperty('--dock-h', dock.offsetHeight + 'px');
  if (window.ResizeObserver) new ResizeObserver(fitDock).observe(dock);
  addEventListener('resize', fitDock);
  fitDock();
  function setPanel(open) {
    panel.hidden = !open;
    settingsBtn.setAttribute('aria-expanded', String(open));
  }
  settingsBtn.addEventListener('click', () => setPanel(panel.hidden));
  addEventListener('keydown', (e) => { if (e.key === 'Escape') { setPanel(false); closeProfile(); } });
  const quietBtn = $('quiet');
  quietBtn.addEventListener('click', () => {
    const on = document.body.classList.toggle('bare');
    if (on) setPanel(false);
    quietBtn.setAttribute('aria-pressed', String(on));
    quietBtn.textContent = on ? '메뉴 다시 보기' : '풍경만 보기';
  });

  // ---------- short notes ----------
  const toast = $('toast');
  let toastTimer = 0;
  function note(text, ms) {
    toast.textContent = text;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, ms);
  }

  // ---------- room badge and link copy ----------
  const badge = $('room-badge'), roomText = $('room-text');
  let room = 0, count = 1;
  const drawRoom = () => {
    badge.hidden = !room;
    roomText.innerHTML = room + '번 방 <span class="count">' + count + '명</span>';
  };
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch { /* try the old way */ }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
  $('copy-link').addEventListener('click', async () => {
    const ok = await copyText(getRoomLink());
    note(ok ? '링크를 복사했어요' : '복사하지 못했어요. 주소창의 주소를 보내 주세요', 2000);
  });

  // ---------- connection state ----------
  const net = $('net-status');
  function showStatus(s) {
    net.hidden = !STATUS_TEXT[s];
    net.dataset.s = s;
    net.querySelector('span').textContent = STATUS_TEXT[s] || '';
  }

  // ---------- name and outfit card ----------
  const card = $('profile'), nameIn = $('p-name'), looksBox = $('p-looks');
  let chosen = profile.outfit;
  profile.looks.forEach((l, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.v = String(i);
    b.setAttribute('aria-label', '복장 ' + (i + 1));
    b.innerHTML = `<i style="background:${l.top}"></i><i style="background:${l.hair}"></i>`;
    b.addEventListener('click', () => { chosen = i; syncLooks(); });
    looksBox.appendChild(b);
  });
  const syncLooks = () => looksBox.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.v) === chosen)));
  function openProfile() {
    setPanel(false);
    nameIn.value = profile.name;
    chosen = profile.outfit;
    syncLooks();
    card.hidden = false;
    nameIn.focus({ preventScroll: true });
  }
  function closeProfile() { card.hidden = true; }
  $('p-save').addEventListener('click', () => {
    profile.name = nameIn.value.trim().slice(0, 12);
    profile.outfit = chosen;
    profile.ask = false;
    onProfile?.({ name: profile.name, outfit: profile.outfit });
    closeProfile();
  });
  nameIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('p-save').click(); });
  $('p-later').addEventListener('click', closeProfile);
  $('profile-btn').addEventListener('click', openProfile);

  // ---------- fps (hidden setting #fps) ----------
  const fpsEl = $('fps');
  fpsEl.hidden = !showFps;
  let fpsFrames = 0, fpsStart = 0;
  function tickFps(now) {
    if (!showFps) return;
    if (!fpsStart) fpsStart = now;
    fpsFrames++;
    if (now - fpsStart >= 1000) {
      fpsEl.textContent = Math.round((fpsFrames * 1000) / (now - fpsStart)) + ' fps';
      fpsFrames = 0; fpsStart = now;
    }
  }

  syncButtons();
  return {
    syncJoin(m) { motion = m; syncButtons(); },
    setPressed(key, v) { ui[key] = v; syncButtons(); },
    showWeather() { /* the weather line is left out of this screen for now */ },
    showRoom({ room: r, moved, wanted }, n) {
      room = r; count = n ?? count;
      drawRoom();
      if (moved && r) note(wanted + '번 방이 가득 차서 ' + r + '번 방으로 왔어요', 5000);
    },
    setCount(n) { count = n; drawRoom(); },
    showStatus,
    askProfileIfNeeded() { if (profile.ask) openProfile(); },
    closePanel() { setPanel(false); },
    tickFps
  };
}
