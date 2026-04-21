// © 2026 김용현
// 학생 깨우기 (mole-whack variant) with a fever-time reward instead of an item.
//
// Rules:
// - 4×4 grid of students. Each is awake / dozing / asleep.
// - Click a dozing/asleep student → wake (+1), streak +1.
// - Click an awake student → -1, streak = 0, student briefly glares 😡 ("왜깨워요?!").
// - 5-streak → 🔥 FEVER TIME (5 s). During fever a single click wakes the whole
//   2×2 block around it (awake students are ignored, no penalty). Streak resets.
// - Time: 20 s + 10 s each time the score reaches a new multiple of 10.
// - Difficulty ramp: spawn interval shrinks and dozing→asleep transition
//   shortens as the score climbs; double-spawn kicks in at score ≥ 30.

const GRID = 4;
const CELLS = GRID * GRID;
const FEVER_DURATION_MS = 5000;

export function createSleepersGame(container, { onTick, onGameOver } = {}) {
  // --- state ---
  let running = false;
  let score = 0;
  let streak = 0;
  let timeLeft = 20;
  let feverUntil = 0;
  const bonusTiersUsed = new Set();
  let spawnAccumulator = 0;
  let rafId = null;
  let lastTs = 0;
  const students = []; // { state, dozedAt, angryUntil }

  for (let i = 0; i < CELLS; i++) students.push({ state: 'awake', dozedAt: 0, angryUntil: 0 });

  // --- DOM ---
  container.innerHTML = '';
  container.classList.add('sleepers-container');

  const hud = document.createElement('div');
  hud.className = 'sleepers-hud';
  hud.innerHTML = `
    <span class="sl-hud-item">⏰ <b class="sl-time-val">20.0</b>s</span>
    <span class="sl-hud-item">점수 <b class="sl-score-val">0</b></span>
    <span class="sl-hud-item">연속 <b class="sl-streak-val">0</b>/5</span>
    <span class="sl-fever" data-active="false">🔥 피버 <b class="sl-fever-val">0.0</b>s</span>
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
    const seat = document.createElement('span');
    seat.className = 'seat';
    const face = document.createElement('span');
    face.className = 'face';
    face.textContent = '😀';
    seat.appendChild(face);
    const desk = document.createElement('span');
    desk.className = 'desk';
    cell.append(seat, desk);
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

  // --- helpers ---
  function faceFor(state) {
    return state === 'asleep' ? '💤' : state === 'dozing' ? '😪' : '😀';
  }

  function renderCell(i) {
    const s = students[i];
    const now = performance.now();
    const angry = s.angryUntil && now < s.angryUntil;
    cells[i].className = `student ${s.state}${angry ? ' angry' : ''}`;
    cells[i].querySelector('.face').textContent = angry ? '😡' : faceFor(s.state);
  }

  function renderAll() {
    for (let i = 0; i < CELLS; i++) renderCell(i);
  }

  function isFever(now) {
    return now < feverUntil;
  }

  function updateHud(now = performance.now()) {
    hud.querySelector('.sl-time-val').textContent = timeLeft.toFixed(1);
    hud.querySelector('.sl-score-val').textContent = String(score);
    hud.querySelector('.sl-streak-val').textContent = String(streak);
    const feverSpan = hud.querySelector('.sl-fever');
    if (isFever(now)) {
      const remaining = (feverUntil - now) / 1000;
      feverSpan.dataset.active = 'true';
      feverSpan.querySelector('.sl-fever-val').textContent = remaining.toFixed(1);
      container.classList.add('fever');
    } else {
      feverSpan.dataset.active = 'false';
      container.classList.remove('fever');
    }
  }

  function flashCell(i, text, cls) {
    const bubble = document.createElement('span');
    bubble.className = `sl-bubble ${cls}`;
    bubble.textContent = text;
    cells[i].appendChild(bubble);
    setTimeout(() => bubble.remove(), 700);
  }

  function flashHud(text) {
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
    const r = Math.min(GRID - 2, Math.floor(i / GRID));
    const c = Math.min(GRID - 2, i % GRID);
    return r * GRID + c;
  }

  function blockFrom(anchor) {
    return [anchor, anchor + 1, anchor + GRID, anchor + GRID + 1];
  }

  function highlightBlock(anchor) {
    for (const idx of blockFrom(anchor)) cells[idx]?.classList.add('block-hover');
  }

  function clearHover() {
    for (const cell of cells) cell.classList.remove('block-hover');
  }

  function onCellHover(i) {
    if (!isFever(performance.now())) return;
    clearHover();
    highlightBlock(anchorForHover(i));
  }

  function checkTimeBonus() {
    const tier = Math.floor(score / 10);
    if (tier > 0 && !bonusTiersUsed.has(tier)) {
      bonusTiersUsed.add(tier);
      timeLeft += 10;
      flashHud('+10초!');
    }
  }

  // --- input ---
  function onCellClick(i) {
    if (!running) return;
    const now = performance.now();

    if (isFever(now)) return feverClick(i, now);

    const s = students[i];
    if (s.state === 'awake') {
      s.angryUntil = now + 900;
      renderCell(i);
      setTimeout(() => renderCell(i), 950);
      score -= 1;
      streak = 0;
      flashCell(i, '왜깨워요?!', 'bad');
      updateHud(now);
      return;
    }
    // wake success
    s.state = 'awake';
    s.dozedAt = 0;
    s.angryUntil = 0;
    score += 1;
    streak += 1;
    flashCell(i, '+1', 'good');
    renderCell(i);
    checkTimeBonus();
    if (streak >= 5) {
      streak = 0;
      feverUntil = now + FEVER_DURATION_MS;
      flashHud('🔥 피버타임!');
    }
    updateHud(now);
  }

  function feverClick(i, now) {
    const anchor = anchorForHover(i);
    const block = blockFrom(anchor);
    const targets = block.filter((idx) => students[idx].state !== 'awake');
    if (targets.length === 0) return; // 전원 깨어있음: 무반응 (친화적)
    for (const idx of targets) {
      students[idx].state = 'awake';
      students[idx].dozedAt = 0;
      students[idx].angryUntil = 0;
      renderCell(idx);
    }
    score += targets.length;
    flashCell(anchor, `🔥 +${targets.length}`, 'good');
    checkTimeBonus();
    updateHud(now);
  }

  // --- loop ---
  function currentInterval() {
    // spawn interval shrinks faster than before
    return Math.max(0.3, 1.25 - score * 0.025);
  }

  function currentDozeToAsleep() {
    // dozing → asleep transition shortens from 2000 ms down to 700 ms
    return Math.max(700, 2000 - score * 30);
  }

  function loop(ts) {
    if (!running) return;
    const dt = Math.min(0.1, (ts - lastTs) / 1000);
    lastTs = ts;
    timeLeft -= dt;
    if (timeLeft <= 0) {
      timeLeft = 0;
      updateHud(ts);
      gameOver();
      return;
    }

    // spawn
    spawnAccumulator += dt;
    const interval = currentInterval();
    if (spawnAccumulator >= interval) {
      spawnAccumulator = 0;
      const idx = pickSleepableCandidate();
      if (idx >= 0) {
        students[idx].state = 'dozing';
        students[idx].dozedAt = ts;
        renderCell(idx);
      }
      // bonus double-spawn once the game heats up
      if (score >= 30 && Math.random() < 0.45) {
        const idx2 = pickSleepableCandidate();
        if (idx2 >= 0) {
          students[idx2].state = 'dozing';
          students[idx2].dozedAt = ts;
          renderCell(idx2);
        }
      }
    }

    // dozing → asleep
    const dozeLimit = currentDozeToAsleep();
    for (let i = 0; i < CELLS; i++) {
      const s = students[i];
      if (s.state === 'dozing' && ts - s.dozedAt > dozeLimit) {
        s.state = 'asleep';
        renderCell(i);
      }
      // Clear expired angry flag so faces snap back even if no click re-renders.
      if (s.angryUntil && ts >= s.angryUntil) {
        s.angryUntil = 0;
        renderCell(i);
      }
    }

    updateHud(ts);
    onTick?.(score);
    rafId = requestAnimationFrame(loop);
  }

  // --- lifecycle ---
  function start() {
    reset(/*keepOverlay*/ false);
    overlay.style.display = 'none';
    running = true;
    lastTs = performance.now();
    rafId = requestAnimationFrame(loop);
  }

  function reset(keepOverlay = true) {
    running = false;
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    score = 0;
    streak = 0;
    timeLeft = 20;
    feverUntil = 0;
    bonusTiersUsed.clear();
    spawnAccumulator = 0;
    for (const s of students) { s.state = 'awake'; s.dozedAt = 0; s.angryUntil = 0; }
    clearHover();
    renderAll();
    updateHud(performance.now());
    if (keepOverlay) {
      overlay.style.display = '';
      overlay.querySelector('.sl-overlay-text').textContent = '수업 시작! (클릭하면 시작돼요)';
    }
  }

  function gameOver() {
    running = false;
    feverUntil = 0;
    clearHover();
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    const final = Math.max(0, score);
    overlay.style.display = '';
    overlay.querySelector('.sl-overlay-text').textContent = `종례! ${final}점 · 다시 하려면 클릭`;
    updateHud(performance.now());
    onGameOver?.(final);
  }

  function stop() {
    running = false;
    feverUntil = 0;
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  }

  // initial paint
  updateHud(performance.now());
  renderAll();

  return {
    start,
    reset: () => reset(true),
    stop,
    getScore: () => score
  };
}
