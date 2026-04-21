// © 2026 김용현
// Canvas rendering: school in the center, oval running track, orbiting avatars, speech bubbles.

const BUBBLE_LIFETIME = 6000;
// Gate sits on the right→bottom edge, near the top (closer to the right vertex).
// Quarter 0 spans angle [0, π/2] along right→bottom; t=0.13 of it ≈ 0.204 rad.
export const GATE_ANGLE = (Math.PI / 2) * 0.13;

// Tenure leveling: one level every 20 minutes, capped at 15 (5 hours).
const LEVEL_STEP_SEC = 20 * 60;
const MAX_LEVEL = 15;

export function tenureLevel(avatar, now) {
  const t = Math.max(0, (now - avatar.startedAt) / 1000);
  return Math.min(MAX_LEVEL, Math.floor(t / LEVEL_STEP_SEC));
}

// Speed multiplier per level: 1.0 at lvl 0, ~2.05 at lvl 15.
function levelMultiplier(level) {
  return 1 + Math.min(MAX_LEVEL, level) * 0.07;
}

// Integrate the piecewise-constant speed multiplier from 0 to tenureSec.
// Used to get the accumulated angular distance multiplier since join.
function integratedMultiplier(tenureSec) {
  if (tenureSec <= 0) return 0;
  let total = 0;
  let remaining = tenureSec;
  let lvl = 0;
  while (remaining > 0) {
    const stepLen = lvl >= MAX_LEVEL ? remaining : Math.min(remaining, LEVEL_STEP_SEC);
    total += stepLen * levelMultiplier(lvl);
    remaining -= stepLen;
    if (lvl < MAX_LEVEL) lvl++;
  }
  return total;
}

export function effectiveAngle(avatar, now) {
  const tenureSec = Math.max(0, (now - avatar.startedAt) / 1000);
  return avatar.angle0 + avatar.speed * integratedMultiplier(tenureSec);
}

// Given current time, find the next time the avatar crosses GATE_ANGLE in its
// current direction. Accounts for the stepped-speed schedule.
export function nextGateCrossingTime(avatar, now) {
  const twoPi = Math.PI * 2;
  const tenureSec = Math.max(0, (now - avatar.startedAt) / 1000);
  const currentAngle = avatar.angle0 + avatar.speed * integratedMultiplier(tenureSec);
  const dirPositive = avatar.speed >= 0;

  let d;
  if (dirPositive) {
    d = ((GATE_ANGLE - currentAngle) % twoPi + twoPi) % twoPi;
  } else {
    d = ((currentAngle - GATE_ANGLE) % twoPi + twoPi) % twoPi;
  }
  if (d < 0.08) d += twoPi;

  const absSpd = Math.abs(avatar.speed);
  if (absSpd === 0) return now + 1000;

  let lvl = Math.min(MAX_LEVEL, Math.floor(tenureSec / LEVEL_STEP_SEC));
  let timeInLvl = tenureSec - lvl * LEVEL_STEP_SEC;
  let remaining = d;
  let deltaSec = 0;

  while (remaining > 0) {
    const spd = absSpd * levelMultiplier(lvl);
    const timeLeftInLvl = lvl >= MAX_LEVEL ? Infinity : (LEVEL_STEP_SEC - timeInLvl);
    const angleCap = spd * timeLeftInLvl;
    if (angleCap >= remaining) {
      deltaSec += remaining / spd;
      remaining = 0;
    } else {
      deltaSec += timeLeftInLvl;
      remaining -= angleCap;
      lvl = Math.min(MAX_LEVEL, lvl + 1);
      timeInLvl = 0;
    }
  }

  return now + deltaSec * 1000;
}

function hexToRgba(hex, a) {
  const h = (hex || '#ffffff').replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) || 255;
  const g = parseInt(h.slice(2, 4), 16) || 255;
  const b = parseInt(h.slice(4, 6), 16) || 255;
  return `rgba(${r},${g},${b},${a})`;
}

export function createScene(canvas, theme) {
  const ctx = canvas.getContext('2d');
  let dpr = Math.max(1, window.devicePixelRatio || 1);
  let width = 0, height = 0;
  let cx = 0, cy = 0;
  let rx = 0, ry = 0; // orbit radii
  const decorSeed = Math.random();

  // Optional SVG school image. Drop a file at /public/school.svg to use it.
  const schoolImg = new Image();
  let schoolImgReady = false;
  schoolImg.onload = () => { schoolImgReady = true; };
  schoolImg.onerror = () => { schoolImgReady = false; };
  schoolImg.src = '/school.svg';

  // Optional full-canvas background. Drop a file at /public/background.svg.
  // When present, it replaces the green rhombus ground; track still drawn on top.
  const bgImg = new Image();
  let bgImgReady = false;
  bgImg.onload = () => { bgImgReady = true; };
  bgImg.onerror = () => { bgImgReady = false; };
  bgImg.src = '/background.svg';

  function resize() {
    const rect = canvas.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cx = width / 2;
    cy = height / 2;
    // 2:1 aspect rhombus (rx : ry = 2 : 1), fit within canvas with margins
    const maxRx = width * 0.42;
    const maxRy = height * 0.38;
    rx = Math.min(maxRx, maxRy * 2);
    ry = rx / 2;
  }

  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  function rhombusPath(radiusX, radiusY) {
    ctx.beginPath();
    ctx.moveTo(cx + radiusX, cy);
    ctx.lineTo(cx, cy + radiusY);
    ctx.lineTo(cx - radiusX, cy);
    ctx.lineTo(cx, cy - radiusY);
    ctx.closePath();
  }

  function drawBackgroundImage() {
    // cover-fit (fill canvas, crop overflow)
    const natW = bgImg.naturalWidth || 1;
    const natH = bgImg.naturalHeight || 1;
    const s = Math.max(width / natW, height / natH);
    const w = natW * s;
    const h = natH * s;
    const x = (width - w) / 2;
    const y = (height - h) / 2;
    ctx.drawImage(bgImg, x, y, w, h);
  }

  function drawGround(t) {
    // Base sky always drawn so any transparent SVG area has a fallback.
    ctx.fillStyle = t.sky;
    ctx.fillRect(0, 0, width, height);

    if (bgImgReady) {
      drawBackgroundImage();
    } else {
      // default green rhombus ground
      ctx.fillStyle = t.ground;
      rhombusPath(rx + 80, ry + 80);
      ctx.fill();
    }

    // running track (thick rhombus outline) — always on top so character path stays visible
    ctx.strokeStyle = t.track;
    ctx.lineWidth = 36;
    ctx.lineJoin = 'round';
    rhombusPath(rx, ry);
    ctx.stroke();

    // track lane lines (dashed rhombus)
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 6]);
    rhombusPath(rx, ry);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawSchoolImage() {
    const natW = schoolImg.naturalWidth || schoolImg.width || 400;
    const natH = schoolImg.naturalHeight || schoolImg.height || 260;
    // Fit inside the rhombus inner space (leave padding around center).
    const maxW = rx * 1.2;
    const maxH = ry * 1.3;
    const s = Math.min(maxW / natW, maxH / natH);
    const w = natW * s;
    const h = natH * s;
    const x = cx - w / 2;
    const y = cy - h / 2;

    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.beginPath();
    ctx.ellipse(cx, y + h + 4, w * 0.45, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.drawImage(schoolImg, x, y, w, h);
  }

  function drawSchool(t) {
    if (schoolImgReady) { drawSchoolImage(); return; }
    const w = Math.min(width, height) * 0.28;
    const h = w * 0.55;
    const x = cx - w / 2;
    const y = cy - h / 2 + 10;

    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    ctx.beginPath();
    ctx.ellipse(cx, y + h + 6, w / 2, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    // body
    ctx.fillStyle = t.schoolWall;
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);

    // roof
    ctx.fillStyle = t.schoolRoof;
    ctx.beginPath();
    ctx.moveTo(x - 8, y);
    ctx.lineTo(cx, y - h * 0.45);
    ctx.lineTo(x + w + 8, y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // windows
    const cols = 4, rows = 2;
    const pad = w * 0.08;
    const winW = (w - pad * (cols + 1)) / cols;
    const winH = (h - pad * (rows + 2)) / rows;
    ctx.fillStyle = '#b8d6ff';
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1.5;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const wx = x + pad + c * (winW + pad);
        const wy = y + pad + r * (winH + pad);
        ctx.fillRect(wx, wy, winW, winH);
        ctx.strokeRect(wx, wy, winW, winH);
        // cross
        ctx.beginPath();
        ctx.moveTo(wx + winW / 2, wy);
        ctx.lineTo(wx + winW / 2, wy + winH);
        ctx.moveTo(wx, wy + winH / 2);
        ctx.lineTo(wx + winW, wy + winH / 2);
        ctx.stroke();
      }
    }

    // door
    const dw = w * 0.14;
    const dh = h * 0.38;
    ctx.fillStyle = '#8b5a2b';
    ctx.fillRect(cx - dw / 2, y + h - dh, dw, dh);
    ctx.strokeRect(cx - dw / 2, y + h - dh, dw, dh);

    // flag
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, y - h * 0.45);
    ctx.lineTo(cx, y - h * 0.75);
    ctx.stroke();
    ctx.fillStyle = '#ff5a5a';
    ctx.beginPath();
    ctx.moveTo(cx, y - h * 0.72);
    ctx.lineTo(cx + 22, y - h * 0.66);
    ctx.lineTo(cx, y - h * 0.58);
    ctx.closePath();
    ctx.fill();
  }

  function drawDecor(t, now) {
    const decor = t.decor;
    if (!decor) return;

    if (decor === 'snow') {
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      for (let i = 0; i < 50; i++) {
        const x = ((i * 97 + now * 0.03 + decorSeed * 300) % width);
        const y = ((i * 53 + now * 0.05) % height);
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (decor === 'leaves') {
      for (let i = 0; i < 22; i++) {
        const x = ((i * 131 + now * 0.05) % (width + 40)) - 20;
        const y = ((i * 71 + now * 0.06) % height);
        const rot = now / 1200 + i;
        ctx.fillStyle = i % 3 === 0 ? 'rgba(220,140,60,0.85)' : (i % 3 === 1 ? 'rgba(190,85,45,0.85)' : 'rgba(230,180,70,0.85)');
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rot);
        ctx.beginPath();
        ctx.ellipse(0, 0, 4, 7, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    } else if (decor === 'sun') {
      const sx = width - 90;
      const sy = 70;
      ctx.save();
      ctx.fillStyle = 'rgba(255,220,80,0.75)';
      ctx.beginPath();
      ctx.arc(sx, sy, 30, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,220,80,0.55)';
      ctx.lineWidth = 3;
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 + now / 3000;
        const r1 = 38, r2 = 50;
        ctx.beginPath();
        ctx.moveTo(sx + Math.cos(a) * r1, sy + Math.sin(a) * r1);
        ctx.lineTo(sx + Math.cos(a) * r2, sy + Math.sin(a) * r2);
        ctx.stroke();
      }
      ctx.restore();
    } else if (decor === 'clouds') {
      ctx.fillStyle = 'rgba(255,255,255,0.78)';
      for (let i = 0; i < 5; i++) {
        const speed = 12 + (i % 3) * 6;
        const x = ((i * 260 + now / speed) % (width + 260)) - 130;
        const y = 50 + (i % 3) * 35;
        drawFluffyCloud(x, y, 42);
      }
    } else if (decor === 'fog') {
      ctx.save();
      for (let i = 0; i < 5; i++) {
        const drift = Math.sin(now / 1800 + i) * 12;
        const y = (i * height / 5) + drift;
        const grad = ctx.createLinearGradient(0, y, 0, y + height / 5);
        grad.addColorStop(0, 'rgba(230,230,230,0.0)');
        grad.addColorStop(0.5, 'rgba(230,230,230,0.35)');
        grad.addColorStop(1, 'rgba(230,230,230,0.0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, y, width, height / 5);
      }
      ctx.restore();
    } else if (decor === 'rain') {
      ctx.strokeStyle = 'rgba(100,150,220,0.7)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 90; i++) {
        const x = ((i * 97 + now * 0.35) % (width + 40)) - 20;
        const y = ((i * 53 + now * 0.9) % height);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - 5, y + 14);
        ctx.stroke();
      }
    } else if (decor === 'typhoon') {
      ctx.save();
      ctx.strokeStyle = 'rgba(100,140,200,0.72)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 160; i++) {
        const x = ((i * 91 + now * 0.7) % (width + 60)) - 30;
        const y = ((i * 47 + now * 1.6) % height);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - 18, y + 22);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 3;
      for (let i = 0; i < 8; i++) {
        const y = (i * height / 8 + (now / 8) % (height / 8));
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.bezierCurveTo(width / 3, y - 18, width * 2 / 3, y + 14, width, y);
        ctx.stroke();
      }
      ctx.restore();
    } else if (decor === 'thunder') {
      // base rain
      ctx.strokeStyle = 'rgba(120,150,200,0.7)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 110; i++) {
        const x = ((i * 97 + now * 0.5) % (width + 40)) - 20;
        const y = ((i * 53 + now * 1.2) % height);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - 6, y + 18);
        ctx.stroke();
      }
      // flash every ~4s for ~120ms
      const cycleMs = 4200;
      const phase = now % cycleMs;
      if (phase < 120) {
        const flashSeed = Math.floor(now / cycleMs);
        const bx = ((flashSeed * 9301 + 49297) % 233280) / 233280 * width;
        ctx.save();
        ctx.fillStyle = `rgba(255,255,255,${0.5 * (1 - phase / 120)})`;
        ctx.fillRect(0, 0, width, height);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(bx, 0);
        ctx.lineTo(bx - 18, height * 0.35);
        ctx.lineTo(bx + 8, height * 0.55);
        ctx.lineTo(bx - 10, height * 0.8);
        ctx.stroke();
        ctx.restore();
      }
    } else if (decor === 'dust') {
      ctx.save();
      ctx.fillStyle = 'rgba(180,150,80,0.18)';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = 'rgba(160,130,70,0.6)';
      for (let i = 0; i < 80; i++) {
        const x = ((i * 113 + now * 0.2) % width);
        const y = ((i * 67 + now * 0.04) % height);
        ctx.beginPath();
        ctx.arc(x, y, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawFluffyCloud(x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.arc(x + r * 0.8, y - r * 0.3, r * 0.9, 0, Math.PI * 2);
    ctx.arc(x + r * 1.6, y, r * 0.85, 0, Math.PI * 2);
    ctx.arc(x + r * 0.7, y + r * 0.3, r * 0.8, 0, Math.PI * 2);
    ctx.fill();
  }

  // Map a continuous angle (rad) to a point on the rhombus perimeter.
  // Each quarter-turn of angle traverses one edge: right→bottom→left→top→right.
  function rhombusPoint(angle) {
    const twoPi = Math.PI * 2;
    const a = ((angle % twoPi) + twoPi) % twoPi;
    const quarter = Math.floor(a / (Math.PI / 2));
    const t = (a - quarter * (Math.PI / 2)) / (Math.PI / 2);
    const V = [
      [rx, 0],   // right
      [0, ry],   // bottom
      [-rx, 0],  // left
      [0, -ry]   // top
    ];
    const p0 = V[quarter];
    const p1 = V[(quarter + 1) % 4];
    return {
      x: p0[0] + (p1[0] - p0[0]) * t,
      y: p0[1] + (p1[1] - p0[1]) * t
    };
  }

  function positionFor(avatar, now) {
    const angle = effectiveAngle(avatar, now);
    const pt = rhombusPoint(angle);
    return { x: cx + pt.x, y: cy + pt.y, angle };
  }

  function screenPos(avatar, nowOverride) {
    return positionFor(avatar, nowOverride ?? Date.now());
  }

  function drawAvatar(avatar, now) {
    const p = positionFor(avatar, now);
    const alpha = avatar.alpha ?? 1;
    if (alpha <= 0) return p;
    ctx.save();
    ctx.globalAlpha = alpha;

    const level = tenureLevel(avatar, now);

    // Aura glow BEHIND the character
    drawAuraBehind(p, avatar, level);

    const cycle = (now / 140) + p.angle * 4;
    const legSwing = Math.sin(cycle) * 3.5;
    const armSwing = Math.sin(cycle) * 2.8;
    const bodyBob = Math.abs(Math.sin(cycle)) * -1.4;

    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 25, 15, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // legs (pants) with outline
    ctx.fillStyle = '#3a3a3a';
    ctx.strokeStyle = '#1d1d1d';
    ctx.lineWidth = 1;
    ctx.fillRect(p.x - 6, p.y + 14 + legSwing, 4, 9);
    ctx.strokeRect(p.x - 6, p.y + 14 + legSwing, 4, 9);
    ctx.fillRect(p.x + 2, p.y + 14 - legSwing, 4, 9);
    ctx.strokeRect(p.x + 2, p.y + 14 - legSwing, 4, 9);

    // shoes (pill)
    ctx.fillStyle = '#1a1a1a';
    roundRect(ctx, p.x - 7.5, p.y + 22 + legSwing, 7, 3.5, 1.5);
    ctx.fill();
    roundRect(ctx, p.x + 0.5, p.y + 22 - legSwing, 7, 3.5, 1.5);
    ctx.fill();
    // shoe highlight
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(p.x - 7, p.y + 22.5 + legSwing, 5, 0.8);
    ctx.fillRect(p.x + 1, p.y + 22.5 - legSwing, 5, 0.8);

    const bodyY = p.y + 2 + bodyBob;

    // BACK arm + hand (drawn before body)
    ctx.fillStyle = avatar.color;
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 1.5;
    roundRect(ctx, p.x - 13, bodyY + 1 + armSwing, 4, 10, 2);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffe2c2';
    ctx.beginPath();
    ctx.arc(p.x - 11, bodyY + 12 + armSwing, 2.4, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();

    // body (torso)
    ctx.fillStyle = avatar.color;
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 2;
    roundRect(ctx, p.x - 10, bodyY, 20, 15, 5);
    ctx.fill(); ctx.stroke();

    // torso shading (darker bottom half)
    ctx.save();
    ctx.beginPath();
    roundRect(ctx, p.x - 10, bodyY, 20, 15, 5);
    ctx.clip();
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(p.x - 10, bodyY + 8, 20, 7);
    ctx.restore();

    // V-collar (small dark wedge at top)
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.moveTo(p.x - 4, bodyY + 1);
    ctx.lineTo(p.x, bodyY + 5);
    ctx.lineTo(p.x + 4, bodyY + 1);
    ctx.closePath();
    ctx.fill();

    // button strip (light vertical line + two buttons)
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(p.x, bodyY + 5);
    ctx.lineTo(p.x, bodyY + 14);
    ctx.stroke();
    ctx.fillStyle = '#222';
    ctx.beginPath(); ctx.arc(p.x, bodyY + 8, 1, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(p.x, bodyY + 12, 1, 0, Math.PI * 2); ctx.fill();

    // FRONT arm + hand (drawn over body)
    ctx.fillStyle = avatar.color;
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 1.5;
    roundRect(ctx, p.x + 9, bodyY + 1 - armSwing, 4, 10, 2);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffe2c2';
    ctx.beginPath();
    ctx.arc(p.x + 11, bodyY + 12 - armSwing, 2.4, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();

    // head background circle (badge) so emoji reads as a proper head
    const headY = bodyY - 9;
    const headR = 13;
    ctx.fillStyle = avatar.headBg || '#fff7e8';
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, headY, headR, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // subtle inner highlight
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(p.x - 2, headY - 2, headR - 3, Math.PI * 1.1, Math.PI * 1.6);
    ctx.stroke();

    // cheek blushes on the head circle
    ctx.fillStyle = 'rgba(255,130,130,0.32)';
    ctx.beginPath(); ctx.arc(p.x - 7, headY + 4, 2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(p.x + 7, headY + 4, 2, 0, Math.PI * 2); ctx.fill();

    // head emoji — reset fillStyle to fully opaque so color-emoji glyphs
    // aren't tinted/faded by the cheek blush's rgba alpha.
    ctx.fillStyle = '#000';
    ctx.font = '18px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(avatar.emoji || '🙂', p.x, headY);

    // effects in FRONT of character
    drawFrontEffects(p, headY, level, now);

    // name label (bold + white outline for legibility)
    ctx.font = 'bold 14px "Jua", system-ui, sans-serif';
    ctx.textBaseline = 'top';
    const label = (avatar.you ? '나 · ' : '') + (avatar.name || '');
    ctx.lineWidth = 4;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#fff';
    ctx.strokeText(label, p.x, p.y + 32);
    ctx.fillStyle = '#222';
    ctx.fillText(label, p.x, p.y + 32);

    // speech bubble
    if (avatar.bubble) {
      const age = now - avatar.bubble.at;
      if (age < BUBBLE_LIFETIME) {
        const bAlpha = age > BUBBLE_LIFETIME - 800
          ? Math.max(0, (BUBBLE_LIFETIME - age) / 800)
          : 1;
        drawBubble(p.x, headY - 14, avatar.bubble.text, bAlpha);
      } else {
        avatar.bubble = null;
      }
    }

    ctx.restore();
    return p;
  }

  function drawAuraBehind(p, avatar, level) {
    if (level < 1) return;
    const auraAlpha = Math.min(0.55, 0.1 + level * 0.03);
    const auraR = 22 + level * 1.2;
    const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, auraR);
    grad.addColorStop(0, hexToRgba(avatar.color, auraAlpha));
    grad.addColorStop(1, hexToRgba(avatar.color, 0));
    ctx.save();
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(p.x, p.y, auraR, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawFrontEffects(p, headY, level, now) {
    if (level < 3) return;
    ctx.save();

    // orbiting sparkles (level >= 3)
    const sparkCount = Math.min(8, Math.max(0, level - 2));
    const orbitR = 22;
    for (let i = 0; i < sparkCount; i++) {
      const a = (now / 650) + (i * Math.PI * 2) / sparkCount;
      const sx = p.x + Math.cos(a) * orbitR;
      const sy = p.y + Math.sin(a) * orbitR * 0.55;
      ctx.fillStyle = `hsla(${((now / 10) + i * 40) % 360}, 92%, 68%, 0.9)`;
      ctx.beginPath();
      ctx.arc(sx, sy, 2 + (level >= 10 ? 1 : 0), 0, Math.PI * 2);
      ctx.fill();
    }

    // rainbow pulsing halo (level >= 7)
    if (level >= 7) {
      const pulse = 0.5 + 0.5 * Math.sin(now / 350);
      ctx.strokeStyle = `hsla(${(now / 18) % 360}, 95%, 62%, ${0.35 + pulse * 0.35})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 26 + pulse * 2, 0, Math.PI * 2);
      ctx.stroke();
    }

    // crown above head (level >= 11)
    if (level >= 11) {
      const bob = Math.sin(now / 300) * 1.5;
      ctx.fillStyle = '#000';
      ctx.font = '14px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('👑', p.x, headY - 14 + bob);
    }

    // star burst rays (level >= 14)
    if (level >= 14) {
      const rays = 8;
      ctx.strokeStyle = 'rgba(255, 235, 100, 0.85)';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < rays; i++) {
        const a = (now / 900) + (i * Math.PI * 2) / rays;
        const r1 = 32, r2 = 40;
        ctx.beginPath();
        ctx.moveTo(p.x + Math.cos(a) * r1, p.y + Math.sin(a) * r1 * 0.6);
        ctx.lineTo(p.x + Math.cos(a) * r2, p.y + Math.sin(a) * r2 * 0.6);
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  function drawBubble(x, y, text, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = '14px "Jua", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const maxWidth = 220;
    const lines = wrapText(ctx, text, maxWidth);
    const padX = 10, padY = 7, lineH = 17;
    const textW = Math.min(maxWidth, Math.max(...lines.map(l => ctx.measureText(l).width)));
    const w = textW + padX * 2;
    const h = lines.length * lineH + padY * 2;
    const bx = x - w / 2;
    const by = y - h - 10;

    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 1.5;
    roundRect(ctx, bx, by, w, h, 8);
    ctx.fill();
    ctx.stroke();

    // tail
    ctx.beginPath();
    ctx.moveTo(x - 6, by + h);
    ctx.lineTo(x, by + h + 8);
    ctx.lineTo(x + 6, by + h);
    ctx.closePath();
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#222';
    lines.forEach((line, i) => {
      ctx.fillText(line, x, by + padY + lineH / 2 + i * lineH);
    });
    ctx.restore();
  }

  function render(theme, avatars, nowOverride) {
    const now = nowOverride ?? Date.now();
    drawGround(theme);
    drawDecor(theme, now);
    drawSchool(theme);

    // sort avatars by y so ones in front overlap correctly
    const withPos = avatars.map(a => ({ a, p: positionFor(a, now) }));
    withPos.sort((x, y) => x.p.y - y.p.y);
    for (const { a } of withPos) drawAvatar(a, now);
  }

  return { render, resize, screenPos };
}

function wrapText(ctx, text, maxWidth, maxLines = 5) {
  const lines = [];
  let line = '';
  let truncated = false;

  // Word-first wrapping; fall back to char-level when a token exceeds maxWidth
  // (typical for whitespace-free Korean input).
  const tokens = text.split(/(\s+)/);
  outer: for (const token of tokens) {
    if (!token) continue;
    const tokenWide = ctx.measureText(token).width > maxWidth;
    if (tokenWide) {
      for (const ch of token) {
        const test = line + ch;
        if (ctx.measureText(test).width > maxWidth && line.length) {
          if (lines.length >= maxLines - 1) { truncated = true; break outer; }
          lines.push(line);
          line = ch;
        } else {
          line = test;
        }
      }
    } else {
      const test = line + token;
      if (ctx.measureText(test).width > maxWidth && line.length) {
        if (lines.length >= maxLines - 1) { truncated = true; break outer; }
        lines.push(line);
        line = token.trimStart();
      } else {
        line = test;
      }
    }
  }

  if (line) {
    if (lines.length < maxLines) lines.push(line);
    else truncated = true;
  }

  if (truncated) {
    let last = lines[lines.length - 1] || '';
    while (last.length > 0 && ctx.measureText(last + '…').width > maxWidth) {
      last = last.slice(0, -1);
    }
    lines[lines.length - 1] = last + '…';
  }

  return lines;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
