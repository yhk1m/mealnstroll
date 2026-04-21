// © 2026 김용현
// 학생 깨우기 (mole-whack variant).
//
// Rules (as agreed with the user):
// - 4×4 grid of students. Each student is awake / dozing / asleep.
// - Clicking a dozing or asleep student wakes them: +1 point, streak +1.
// - Clicking an awake student: -1, streak = 0, "왜깨워요?!" bubble.
// - 5-streak earns one 📋 출석부 (max hold: 1 at a time). Streak resets to 0.
// - 출석부 mode: click a 2×2 anchor. If the block has at least one
//   dozing/asleep student, wake all of them (+N, ignore the awake ones).
//   If all four are awake: -4 and the 출석부 is cancelled (streak still 0).
// - Initial time: 20 s. Each new multiple of 10 points → +10 s (once each).
// - Difficulty ramps: doze spawn interval shrinks as score rises.

const GRID = 4;
const CELLS = GRID * GRID;
const DOZE_TO_ASLEEP_MS = 2000;

export function createSleepersGame(container, { onTick, onGameOver } = {}) {
  // --- state ---
  let running = false;
  let score = 0;
  let streak = 0;
  let timeLeft = 20;
  let attendance = 0; // 0 or 1 (max hold)
  let attendanceMode = false;
  const bonusTiersUsed = new Set();
  let spawnAccumulator = 0;
  let rafId = null;
  let lastTs = 0;
  const students = []; // { state, dozedAt }

  for (let i = 0; i < CELLS; i++) students.push({ state: 'awake', dozedAt: 0 });

  // --- build DOM ---
  container.innerHTML = '';
  container.classList.add('sleepers-container');

  const hud = document.createElement('div');
  hud.className = 'sleepers-hud';
  hud.innerHTML = `
    <span class="sl-hud-item">⏰ <b class="sl-time-val">20.0</b>s</span>
    <span class="sl-hud-item">점수 <b class="sl-score-val">0</b></span>
    <span class="sl-hud-item">연속 <b class="sl-streak-val">0</b>/5</span>
    <button class="sl-attendance" type="button" disabled title="2×2 범위의 조는/자는 학생을 한 번에 깨워요">📋 출석부 <b class="sl-attendance-val">0</b></button>
  `;
  container.appendChild(hud);

  const grid = document.createElement('div');
  grid.className = 'sleepers-grid';
  const cells = [];
  for (let i = 0; i < CELLS; i++) {
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'student awake';
    cell.dataset.idx = String(i);
    const face = document.createElement('span');
    face.className = 'face';
    face.textContent = '😀';
    cell.appendChild(face);
    cell.addEventListener('click', () => onCellClick(i));
    cell.addEventListener('mouseenter', () => onCellHover(i));
    cell.addEventListener('mouseleave', clearHover);
    grid.appendChild(cell);
    cells.push(cell);
  }
  container.appendChild(grid);

  const overlay = document.createElement('div');
  overlay.className = 'sleepers-overlay';
  overlay.innerHTML = '<p class="sl-overlay-text">수업 시작! (클릭하면 시작돼요)</p>';
  overlay.addEventListener('click', () => start());
  container.appendChild(overlay);

  const attBtn = hud.querySelector('.sl-attendance');
  attBtn.addEventListener('click', () => {
    if (attendance === 0) return;
    attendanceMode = !attendanceMode;
    updateHud();
    if (!attendanceMode) clearHover();
  });

  // --- helpers ---
  function faceFor(state) {
    return state === 'asleep' ? '💤' : state === 'dozing' ? '😪' : '😀';
  }

  function renderCell(i) {
    const s = students[i];
    cells[i].className = `student ${s.state}`;
    cells[i].querySelector('.face').textContent = faceFor(s.state);
  }

  function renderAll() {
    for (let i = 0; i < CELLS; i++) renderCell(i);
  }

  function updateHud() {
    hud.querySelector('.sl-time-val').textContent = timeLeft.toFixed(1);
    hud.querySelector('.sl-score-val').textContent = String(score);
    hud.querySelector('.sl-streak-val').textContent = String(streak);
    hud.querySelector('.sl-attendance-val').textContent = String(attendance);
    attBtn.disabled = attendance === 0;
    attBtn.classList.toggle('active', attendanceMode);
    container.classList.toggle('attendance-mode', attendanceMode);
  }

  function flashCell(i, text, cls) {
    const bubble = document.createElement('span');
    bubble.className = `sl-bubble ${cls}`;
    bubble.textContent = text;
    cells[i].appendChild(bubble);
    setTimeout(() => bubble.remove(), 700);
  }

  function flashTime(text) {
    const bubble = document.createElement('span');
    bubble.className = 'sl-time-bonus';
    bubble.textContent = text;
    hud.appendChild(bubble);
    setTimeout(() => bubble.remove(), 1200);
  }

  function pickSleepableCandidate() {
    const candidates = [];
    for (let i = 0; i < CELLS; i++) if (students[i].state === 'awake') candidates.push(i);
    if (!candidates.length) return -1;
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  function anchorForHover(i) {
    // 2×2 block anchor clamped so it always fits in the grid.
    const r = Math.min(GRID - 2, Math.floor(i / GRID));
    const c = Math.min(GRID - 2, i % GRID);
    return r * GRID + c;
  }

  function blockFrom(anchorIdx) {
    return [anchorIdx, anchorIdx + 1, anchorIdx + GRID, anchorIdx + GRID + 1];
  }

  function highlightBlock(anchor) {
    for (const idx of blockFrom(anchor)) cells[idx]?.classList.add('block-hover');
  }

  function clearHover() {
    for (const cell of cells) cell.classList.remove('block-hover');
  }

  function onCellHover(i) {
    if (!attendanceMode) return;
    clearHover();
    highlightBlock(anchorForHover(i));
  }

  function checkTimeBonus() {
    const tier = Math.floor(score / 10);
    if (tier > 0 && !bonusTiersUsed.has(tier)) {
      bonusTiersUsed.add(tier);
      timeLeft += 10;
      flashTime('+10초!');
    }
  }

  function earnAttendanceMaybe() {
    // Called after a successful wake. When streak hits 5, reset streak
    // and grant one 출석부 (if we don't already hold one).
    if (streak >= 5) {
      streak = 0;
      if (attendance === 0) {
        attendance = 1;
        flashTime('📋 출석부 획득!');
      }
    }
  }

  // --- input ---
  function onCellClick(i) {
    if (!running) return;
    if (attendanceMode) return attendanceClick(i);

    const s = students[i];
    if (s.state === 'awake') {
      score -= 1;
      streak = 0;
      flashCell(i, '왜깨워요?!', 'bad');
      updateHud();
      return;
    }
    // wake success
    s.state = 'awake';
    s.dozedAt = 0;
    score += 1;
    streak += 1;
    flashCell(i, '+1', 'good');
    renderCell(i);
    checkTimeBonus();
    earnAttendanceMaybe();
    updateHud();
  }

  function attendanceClick(clickedIdx) {
    const anchor = anchorForHover(clickedIdx);
    const block = blockFrom(anchor);
    const targets = block.filter((i) => students[i].state !== 'awake');

    if (targets.length === 0) {
      // All four are awake → penalty + 출석부 purge.
      score -= 4;
      attendance = 0;
      attendanceMode = false;
      streak = 0;
      flashCell(anchor, '-4 전원 깨있음!', 'bad');
      clearHover();
      updateHud();
      return;
    }

    // At least one sleeper → wake them, mixed-awake cells do nothing.
    for (const i of targets) {
      students[i].state = 'awake';
      students[i].dozedAt = 0;
      renderCell(i);
    }
    score += targets.length;
    attendance = 0;
    attendanceMode = false;
    streak = 0; // agreed: reset
    flashCell(anchor, `📋 +${targets.length}`, 'good');
    clearHover();
    checkTimeBonus();
    updateHud();
  }

  // --- loop ---
  function loop(ts) {
    if (!running) return;
    const dt = Math.min(0.1, (ts - lastTs) / 1000);
    lastTs = ts;
    timeLeft -= dt;
    if (timeLeft <= 0) {
      timeLeft = 0;
      updateHud();
      gameOver();
      return;
    }

    // Spawn interval shrinks with score for pressure.
    const interval = Math.max(0.45, 1.3 - score * 0.02);
    spawnAccumulator += dt;
    if (spawnAccumulator >= interval) {
      spawnAccumulator = 0;
      const idx = pickSleepableCandidate();
      if (idx >= 0) {
        students[idx].state = 'dozing';
        students[idx].dozedAt = ts;
        renderCell(idx);
      }
    }

    // dozing → asleep after DOZE_TO_ASLEEP_MS.
    for (let i = 0; i < CELLS; i++) {
      const s = students[i];
      if (s.state === 'dozing' && ts - s.dozedAt > DOZE_TO_ASLEEP_MS) {
        s.state = 'asleep';
        renderCell(i);
      }
    }

    updateHud();
    onTick?.(score);
    rafId = requestAnimationFrame(loop);
  }

  // --- lifecycle ---
  function start() {
    reset();
    overlay.style.display = 'none';
    running = true;
    lastTs = performance.now();
    rafId = requestAnimationFrame(loop);
  }

  function reset() {
    running = false;
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    score = 0;
    streak = 0;
    timeLeft = 20;
    attendance = 0;
    attendanceMode = false;
    bonusTiersUsed.clear();
    spawnAccumulator = 0;
    for (const s of students) { s.state = 'awake'; s.dozedAt = 0; }
    clearHover();
    renderAll();
    updateHud();
    overlay.style.display = '';
    overlay.querySelector('.sl-overlay-text').textContent = '수업 시작! (클릭하면 시작돼요)';
  }

  function gameOver() {
    running = false;
    attendanceMode = false;
    clearHover();
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    const final = Math.max(0, score);
    overlay.style.display = '';
    overlay.querySelector('.sl-overlay-text').textContent = `종례! ${final}점 · 다시 하려면 클릭`;
    updateHud();
    onGameOver?.(final);
  }

  function stop() {
    running = false;
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  }

  // initial paint
  updateHud();
  renderAll();

  return {
    start,
    reset,
    stop,
    getScore: () => score
  };
}
