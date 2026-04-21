// © 2026 김용현
// Chrome dino-style runner: press Space/Up/Tap to jump, Down to duck/fall fast.

const GROUND_Y_RATIO = 0.78;
const GRAVITY = 0.9;
const JUMP_V = -14.5;
const DUCK_GRAVITY = 2.4;
const BASE_SPEED = 6;
const SPEED_GROWTH = 0.0018; // px/frame per frame
const MAX_SPEED = 13;
const SCORE_PER_FRAME = 0.12;
const BIRD_UNLOCK_SCORE = 200;

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
    // Interval grows with speed so early game isn't overwhelming.
    const minGap = Math.max(260, 460 - speed * 18);
    const maxGap = minGap + 260;
    if (obstacles.length && obstacles[obstacles.length - 1].x > W - minGap) return;
    if (obstacles.length && obstacles[obstacles.length - 1].x > W - (minGap + Math.random() * (maxGap - minGap))) return;

    const canBird = score >= BIRD_UNLOCK_SCORE;
    const roll = Math.random();
    if (canBird && roll < 0.25) {
      // bird at random height (duckable low / jumpable high)
      const lowY = groundY - 18;
      const highY = groundY - 54;
      const by = Math.random() < 0.5 ? lowY : highY;
      obstacles.push({ type: 'bird', x: W + 10, y: by, w: 28, h: 20, wingTick: 0 });
    } else {
      // cactus cluster: 1~3
      const count = roll < 0.5 ? 1 : roll < 0.85 ? 2 : 3;
      const baseW = 16;
      const gap = 4;
      const tall = Math.random() < 0.35;
      const w = baseW * count + gap * (count - 1);
      const h = tall ? 42 : 30;
      obstacles.push({ type: 'cactus', x: W + 10, y: groundY - h, w, h, count, tall });
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

    if (state === STATE.READY) drawCenterText('Space / 탭으로 점프하기 🦖');
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
    ctx.fillText('🦖', dino.x, y);
    ctx.restore();
  }

  function drawObstacles() {
    ctx.save();
    ctx.font = '28px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",serif';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    for (const o of obstacles) {
      if (o.type === 'cactus') {
        const glyph = o.tall ? '🌵' : '🌱';
        for (let i = 0; i < o.count; i++) {
          const size = o.tall ? 38 : 28;
          ctx.font = `${size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",serif`;
          ctx.fillText(glyph, o.x + i * 20, o.y);
        }
      } else if (o.type === 'bird') {
        o.wingTick = (o.wingTick + 1) % 16;
        const flap = Math.floor(o.wingTick / 8) === 0 ? '🐦' : '🦅';
        ctx.fillText(flap, o.x, o.y);
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
