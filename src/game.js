// © 2026 김용현
// Hallway runner: a teacher dodges school stuff (chairs, balls, books, paper planes).
// Press Space/Up/Tap to jump, Down to duck/fall fast.

// Ground-level obstacles (short): chair, soccer ball, basketball, backpack
const SHORT_GLYPHS = ['🪑', '⚽', '🏀', '🎒'];
// Tall obstacles (jump over): stack of books, filing cabinet
const TALL_GLYPHS = ['📚', '🗄️'];
// Flying obstacles: paper airplane (students' mischief)
const FLY_GLYPHS = ['✈️', '📄'];

const GROUND_Y_RATIO = 0.78;
const GRAVITY = 0.9;
const JUMP_V = -14.5;
const DUCK_GRAVITY = 2.4;
// Speed is constant — difficulty comes from obstacles, not tempo.
const BASE_SPEED = 5;
const SPEED_GROWTH = 0; // no acceleration over time
const MAX_SPEED = 5;
const SCORE_PER_FRAME = 0.12;
const FLY_UNLOCK_SCORE = 100;
// Difficulty steps up every 50 points (tier = floor(score/50)).
// 8 tiers in total → reaches max at 400 points.
const DIFFICULTY_STEP_POINTS = 50;
const DIFFICULTY_TIERS = 8;

const STATE = { READY: 'ready', RUNNING: 'running', OVER: 'over' };

export function createGame(canvas, { onGameOver, onTick } = {}) {
  const ctx = canvas.getContext('2d');
  let dpr = Math.max(1, window.devicePixelRatio || 1);
  let W = 0, H = 0, groundY = 0;

  let state = STATE.READY;
  let speed = BASE_SPEED;
  let score = 0;
  let frame = 0;
  let obstacles = [];
  let clouds = [];
  let groundOffset = 0;
  let rafId = null;

  const dino = {
    x: 0, y: 0, w: 34, h: 34,
    vy: 0,
    onGround: true,
    ducking: false,
    legTick: 0
  };

  function resize() {
    const rect = canvas.getBoundingClientRect();
    W = rect.width;
    H = rect.height;
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    groundY = Math.floor(H * GROUND_Y_RATIO);
    dino.x = Math.floor(W * 0.12);
    if (dino.onGround) dino.y = groundY - dino.h;
  }

  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  function reset() {
    state = STATE.READY;
    speed = BASE_SPEED;
    score = 0;
    frame = 0;
    obstacles = [];
    clouds = seedClouds();
    groundOffset = 0;
    dino.vy = 0;
    dino.onGround = true;
    dino.ducking = false;
    dino.y = groundY - dino.h;
    draw();
  }

  function seedClouds() {
    const arr = [];
    for (let i = 0; i < 4; i++) {
      arr.push({ x: (W / 4) * i + Math.random() * 80, y: 20 + Math.random() * 40, speed: 0.5 + Math.random() * 0.5 });
    }
    return arr;
  }

  function start() {
    if (state === STATE.RUNNING) return;
    reset();
    state = STATE.RUNNING;
    loop();
  }

  function jump() {
    if (state === STATE.READY) { start(); return; }
    if (state === STATE.OVER) { start(); return; }
    if (dino.onGround) {
      dino.vy = JUMP_V;
      dino.onGround = false;
    }
  }

  function setDucking(v) {
    dino.ducking = v;
  }

  function spawnObstacle() {
    // Difficulty steps up every 50 points, clamped to [0, 1].
    const tier = Math.floor(score / DIFFICULTY_STEP_POINTS);
    const d = Math.min(1, tier / DIFFICULTY_TIERS);
    // Start roomy (like the original Chrome runner), tighten as d rises.
    const minGap = Math.max(150, 380 - d * 230);   // 380 → 150
    const maxGap = minGap + Math.max(80, 240 - d * 160); // +240 → +80
    if (obstacles.length && obstacles[obstacles.length - 1].x > W - minGap) return;
    if (obstacles.length && obstacles[obstacles.length - 1].x > W - (minGap + Math.random() * (maxGap - minGap))) return;

    const canFly = score >= FLY_UNLOCK_SCORE;
    const flyProb = 0.18 + d * 0.22; // 18% → 40% airborne as difficulty rises
    const roll = Math.random();
    if (canFly && roll < flyProb) {
      // Paper airplane at random height (duckable low / jumpable high)
      const lowY = groundY - 18;
      const highY = groundY - 54;
      const by = Math.random() < 0.5 ? lowY : highY;
      const glyph = FLY_GLYPHS[Math.floor(Math.random() * FLY_GLYPHS.length)];
      obstacles.push({ type: 'fly', x: W + 10, y: by, w: 28, h: 20, wingTick: 0, glyph });
    } else {
      // Cluster size biases toward larger with difficulty.
      const r = Math.random();
      let count;
      if (d < 0.35) count = r < 0.7 ? 1 : r < 0.9 ? 2 : 3;
      else if (d < 0.7) count = r < 0.4 ? 1 : r < 0.75 ? 2 : r < 0.95 ? 3 : 4;
      else count = r < 0.2 ? 1 : r < 0.5 ? 2 : r < 0.8 ? 3 : 4;
      const baseW = 18;
      const gap = 4;
      const tall = Math.random() < (0.25 + d * 0.15); // 25% → 40% tall
      const w = baseW * count + gap * (count - 1);
      const h = tall ? 42 : 30;
      const pool = tall ? TALL_GLYPHS : SHORT_GLYPHS;
      const glyph = pool[Math.floor(Math.random() * pool.length)];
      obstacles.push({ type: 'ground', x: W + 10, y: groundY - h, w, h, count, tall, glyph });
    }
  }

  function step() {
    frame++;
    score += SCORE_PER_FRAME;
    speed = Math.min(MAX_SPEED, BASE_SPEED + frame * SPEED_GROWTH);

    // dino physics
    const g = dino.ducking && !dino.onGround ? DUCK_GRAVITY : GRAVITY;
    dino.vy += g;
    dino.y += dino.vy;
    if (dino.y + dino.h >= groundY) {
      dino.y = groundY - dino.h;
      dino.vy = 0;
      dino.onGround = true;
    }
    dino.legTick = (dino.legTick + 1) % 12;

    // obstacles
    for (const o of obstacles) o.x -= speed;
    obstacles = obstacles.filter(o => o.x + o.w > -20);
    if (frame % 6 === 0) spawnObstacle();

    // clouds
    for (const c of clouds) {
      c.x -= c.speed;
      if (c.x < -60) { c.x = W + 20; c.y = 20 + Math.random() * 40; }
    }

    groundOffset = (groundOffset + speed) % 24;

    // collision
    const dinoBox = hitboxForDino();
    for (const o of obstacles) {
      if (rectsOverlap(dinoBox, hitboxForObstacle(o))) {
        gameOver();
        return;
      }
    }

    onTick?.(Math.floor(score));
  }

  function hitboxForDino() {
    // Slightly inset for friendlier collisions.
    const inset = 4;
    return { x: dino.x + inset, y: dino.y + inset, w: dino.w - inset * 2, h: dino.h - inset * 2 };
  }

  function hitboxForObstacle(o) {
    const inset = o.type === 'bird' ? 3 : 2;
    return { x: o.x + inset, y: o.y + inset, w: o.w - inset * 2, h: o.h - inset * 2 };
  }

  function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function gameOver() {
    state = STATE.OVER;
    cancelAnimationFrame(rafId);
    rafId = null;
    draw();
    onGameOver?.(Math.floor(score));
  }

  function loop() {
    if (state !== STATE.RUNNING) return;
    step();
    draw();
    rafId = requestAnimationFrame(loop);
  }

  // ---------- drawing ----------
  function draw() {
    // sky
    ctx.fillStyle = '#f6f1e4';
    ctx.fillRect(0, 0, W, H);

    drawClouds();
    drawGround();
    drawObstacles();
    drawDino();
    drawHUD();

    if (state === STATE.READY) drawCenterText('Space / 탭으로 점프하기 👨‍🏫');
    else if (state === STATE.OVER) drawCenterText(`게임 오버 · ${Math.floor(score)}점 · 다시하려면 Space`);
  }

  function drawClouds() {
    ctx.fillStyle = 'rgba(120,110,95,0.35)';
    for (const c of clouds) {
      ctx.beginPath();
      ctx.arc(c.x, c.y, 8, 0, Math.PI * 2);
      ctx.arc(c.x + 10, c.y - 2, 10, 0, Math.PI * 2);
      ctx.arc(c.x + 22, c.y, 8, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawGround() {
    ctx.strokeStyle = '#4a3d28';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    ctx.lineTo(W, groundY);
    ctx.stroke();

    // dashed pebbles
    ctx.strokeStyle = 'rgba(74,61,40,0.5)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 7]);
    ctx.lineDashOffset = -groundOffset;
    ctx.beginPath();
    ctx.moveTo(0, groundY + 4);
    ctx.lineTo(W, groundY + 4);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawDino() {
    ctx.save();
    ctx.font = '32px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",serif';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    // small bob while running, squish when ducking
    const runningBob = dino.onGround && state === STATE.RUNNING
      ? (Math.floor(dino.legTick / 6) === 0 ? 0 : 1)
      : 0;
    const y = dino.y + runningBob;
    ctx.fillText('👨‍🏫', dino.x, y);
    ctx.restore();
  }

  function drawObstacles() {
    ctx.save();
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    for (const o of obstacles) {
      if (o.type === 'ground') {
        const size = o.tall ? 38 : 28;
        ctx.font = `${size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",serif`;
        for (let i = 0; i < o.count; i++) {
          ctx.fillText(o.glyph, o.x + i * 20, o.y);
        }
      } else if (o.type === 'fly') {
        o.wingTick = (o.wingTick + 1) % 16;
        // Subtle vertical flutter for the flying paper
        const flutter = Math.floor(o.wingTick / 8) === 0 ? 0 : 2;
        ctx.font = '26px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",serif';
        ctx.fillText(o.glyph, o.x, o.y + flutter);
      }
    }
    ctx.restore();
  }

  function drawHUD() {
    ctx.fillStyle = '#4a3d28';
    ctx.font = 'bold 16px "DungGeunMo", system-ui, sans-serif';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.floor(score).toString().padStart(5, '0')}`, W - 12, 12);
  }

  function drawCenterText(text) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, H * 0.35, W, 42);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px "DungGeunMo", system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText(text, W / 2, H * 0.35 + 21);
    ctx.restore();
  }

  function destroy() {
    if (rafId) cancelAnimationFrame(rafId);
    ro.disconnect();
  }

  reset();

  return {
    start,
    jump,
    setDucking,
    reset,
    destroy,
    getScore: () => Math.floor(score),
    getState: () => state
  };
}
