// © 2026 김용현
// The big-headed school staff of the approved draft (reference/sian.html): body, face, outfits,
// what they carry and the walk with planted feet. Moved, not redesigned. makeFarPerson is new:
// a two-mesh stand-in for people far from the camera.
import * as THREE from 'three';

// A big-headed character, about 2.5 heads tall. The legs have knees and ankles,
// and the body height comes from the planted foot, so feet never float or sink.
export const toonRamp = (() => {
  const data = new Uint8Array([120, 120, 120, 255, 185, 185, 185, 255, 235, 235, 235, 255, 255, 255, 255, 255]);
  const t = new THREE.DataTexture(data, 4, 1, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
})();
export const toon = (color) => new THREE.MeshToonMaterial({ color, gradientMap: toonRamp });
const THIGH = 0.185, SHIN = 0.175, ANKLE = 0.07;
const STEP_CYCLE = 0.64; // metres walked per full two-step cycle at scale 1

export function capsule(mat, r, len) {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 5, 12), mat);
  m.position.y = -len / 2;
  return m;
}
export function makePerson(look, scale) {
  const root = new THREE.Group();
  const rig = new THREE.Group();
  root.add(rig);
  const skin = toon(look.skin), hairM = toon(look.hair), cloth = toon(look.top);
  const pants = toon(look.pants), shoe = toon(look.shoe), shirt = toon(look.shirt || '#fbfaf5');
  const dark = new THREE.MeshBasicMaterial({ color: '#2b2230' });
  const white = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const pelvisY = THIGH + SHIN + ANKLE;
  const part = (geo, mat, x, y, z, parent) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };

  // Torso: a soft pear shape
  const torso = new THREE.Group();
  torso.position.y = pelvisY;
  rig.add(torso);
  const profile = [[0.001, -0.05], [0.15, -0.04], [0.205, 0.05], [0.2, 0.16], [0.165, 0.29], [0.1, 0.36], [0.001, 0.38]].map(([x, y]) => new THREE.Vector2(x, y));
  const body = new THREE.Mesh(new THREE.LatheGeometry(new THREE.SplineCurve(profile).getPoints(16), 18), cloth);
  body.scale.z = 0.86;
  torso.add(body);

  // Long coat skirt for the lab coat
  if (look.outfit === 'labcoat') {
    const hem = [[0.205, 0.06], [0.215, -0.08], [0.23, -0.17]].map(([x, y]) => new THREE.Vector2(x, y));
    const skirt = new THREE.Mesh(new THREE.LatheGeometry(hem, 18), cloth);
    cloth.side = THREE.DoubleSide;
    skirt.scale.z = 0.86;
    torso.add(skirt);
  }
  // Shirt opening, collar and tie
  const open = ['cardigan', 'blazer', 'labcoat'].includes(look.outfit);
  if (open) {
    const v = new THREE.BufferGeometry();
    v.setAttribute('position', new THREE.Float32BufferAttribute([-0.09, 0.335, 0.105, 0.09, 0.335, 0.105, 0, 0.1, 0.183], 3));
    v.computeVertexNormals();
    shirt.side = THREE.DoubleSide;
    torso.add(new THREE.Mesh(v, shirt));
  }
  if (look.outfit !== 'track') {
    [-1, 1].forEach((side) => {
      const c = part(new THREE.BoxGeometry(0.095, 0.05, 0.02), look.outfit === 'shirt' ? shirt : toon('#ffffff'), side * 0.06, 0.335, 0.105, torso);
      c.rotation.set(0.45, side * 0.35, side * -0.55);
    });
  }
  let tieGroup = null;
  if (look.tie) {
    const tieMat = toon(look.tie);
    tieGroup = new THREE.Group();
    tieGroup.position.set(0, 0.325, 0.122);
    tieGroup.rotation.x = -0.26;
    part(new THREE.SphereGeometry(0.024, 10, 8), tieMat, 0, -0.008, 0.008, tieGroup);
    part(new THREE.BoxGeometry(0.044, 0.19, 0.008), tieMat, 0, -0.11, 0.006, tieGroup);
    torso.add(tieGroup);
  }
  // Buttons on the jacket or cardigan
  if (look.outfit === 'cardigan' || look.outfit === 'blazer') {
    const btn = toon('#3a2f2c');
    part(new THREE.SphereGeometry(0.013, 8, 6), btn, 0, 0.072, 0.178, torso);
    part(new THREE.SphereGeometry(0.013, 8, 6), btn, 0, 0.012, 0.176, torso);
  }
  // Chest pocket with the red marking pen
  if (look.outfit !== 'track') {
    part(new THREE.BoxGeometry(0.075, 0.07, 0.008), look.outfit === 'labcoat' ? toon('#e3e6e6') : toon(look.pocket || look.top), 0.105, 0.2, 0.139, torso).rotation.x = -0.2;
    const pen = part(new THREE.CylinderGeometry(0.008, 0.008, 0.085, 7), toon('#e04a3f'), 0.122, 0.245, 0.14, torso);
    pen.rotation.x = -0.2;
  }
  // Tracksuit details and whistle
  if (look.outfit === 'track') {
    part(new THREE.BoxGeometry(0.012, 0.3, 0.008), new THREE.MeshBasicMaterial({ color: '#f4f4ef' }), 0, 0.15, 0.178, torso).rotation.x = -0.1;
    const whistle = part(new THREE.CapsuleGeometry(0.018, 0.028, 4, 8), toon('#d8dde0'), 0.03, 0.17, 0.182, torso);
    whistle.rotation.z = 1.4;
  }
  // Lanyard and ID card
  if (look.strap) {
    const strap = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.009, 6, 24), new THREE.MeshBasicMaterial({ color: look.strap }));
    strap.position.set(0, 0.25, 0.05);
    strap.rotation.x = 1.05;
    torso.add(strap);
    if (look.outfit !== 'track') {
      const card = part(new THREE.BoxGeometry(0.08, 0.1, 0.012), white, -0.045, 0.1, 0.178, torso);
      card.rotation.x = -0.05;
    }
  }

  // Head, slightly smaller so they read as grown-ups
  const head = new THREE.Group();
  head.position.y = 0.38;
  head.scale.setScalar(0.94);
  torso.add(head);
  const R = 0.285;
  const skull = new THREE.Mesh(new THREE.SphereGeometry(R, 24, 18), skin);
  skull.position.y = R * 0.9;
  skull.scale.set(1.04, 0.96, 0.98);
  head.add(skull);
  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(R * 1.08, 24, 16, 0, 6.2832, 0, 1.75), hairM);
  hairCap.position.set(0, R * 0.95, -0.02);
  hairCap.rotation.x = -0.42;
  head.add(hairCap);
  const hat = new THREE.Group();
  hat.position.set(0, R * 1.66, -0.015);
  hat.rotation.set(-0.12, 0, -0.2);
  hat.visible = false;
  const hatRed = new THREE.MeshLambertMaterial({ color: 0xc7322f }), hatWhite = new THREE.MeshLambertMaterial({ color: 0xfbf6ec });
  const hatCone = new THREE.Mesh(new THREE.ConeGeometry(R * 0.92, R * 1.3, 20), hatRed);
  hatCone.position.y = R * 0.68;
  const hatRim = new THREE.Mesh(new THREE.TorusGeometry(R * 0.93, R * 0.17, 10, 26), hatWhite);
  hatRim.rotation.x = Math.PI / 2;
  const hatTip = new THREE.Mesh(new THREE.SphereGeometry(R * 0.2, 12, 10), hatWhite);
  hatTip.position.y = R * 1.36;
  hat.add(hatCone, hatRim, hatTip);
  head.add(hat);
  const fringe = (x, y, z, s) => part(new THREE.SphereGeometry(s, 12, 10), hairM, x, y, z, head);
  if (look.style === 'part') { fringe(-0.13, R * 1.56, 0.17, 0.115); fringe(0.06, R * 1.62, 0.2, 0.085); fringe(0.17, R * 1.45, 0.17, 0.07); }
  else { fringe(-0.14, R * 1.5, 0.19, 0.09); fringe(0, R * 1.58, 0.21, 0.1); fringe(0.14, R * 1.5, 0.19, 0.09); }
  if (look.style === 'bob') { fringe(-0.26, R * 0.72, -0.02, 0.14); fringe(0.26, R * 0.72, -0.02, 0.14); fringe(0, R * 0.7, -0.2, 0.2); }
  if (look.style === 'bun') { fringe(0, R * 2.05, -0.1, 0.11); }
  const eyes = [-1, 1].map((side) => {
    const e = new THREE.Group();
    e.position.set(side * 0.115, R * 0.84, R * 0.91);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.044, 14, 12), dark);
    ball.scale.set(0.86, 1.14, 0.45);
    const shine = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 8), white);
    shine.position.set(0.012, 0.018, 0.02);
    e.add(ball, shine);
    head.add(e);
    const brow = part(new THREE.CapsuleGeometry(0.008, 0.05, 3, 6), hairM, side * 0.118, R * 1.13, R * 0.9, head);
    brow.rotation.z = Math.PI / 2 + side * 0.12;
    const blush = new THREE.Mesh(new THREE.CircleGeometry(0.046, 18), new THREE.MeshBasicMaterial({ color: '#ff8f8f', transparent: true, opacity: 0.42, depthWrite: false }));
    blush.position.set(side * 0.178, R * 0.64, R * 0.885);
    blush.rotation.y = side * 0.55;
    blush.scale.y = 0.62;
    head.add(blush);
    return e;
  });
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.0075, 6, 14, 3.14), dark);
  mouth.position.set(0, R * 0.66, R * 0.965);
  mouth.rotation.z = Math.PI;
  head.add(mouth);
  if (look.glasses) {
    const frame = new THREE.MeshBasicMaterial({ color: look.glasses === true ? '#2b2230' : look.glasses });
    [-1, 1].forEach((side) => {
      const g = new THREE.Mesh(new THREE.TorusGeometry(0.066, 0.007, 6, 20), frame);
      g.position.set(side * 0.115, R * 0.84, R * 0.97);
      head.add(g);
    });
    const bridge = part(new THREE.CapsuleGeometry(0.005, 0.04, 3, 6), frame, 0, R * 0.87, R * 1.0, head);
    bridge.rotation.z = Math.PI / 2;
  }

  // Limbs
  const limb = (mat, r, len, x, y, parent) => {
    const piv = new THREE.Group();
    piv.position.set(x, y, 0);
    piv.add(capsule(mat, r, len));
    parent.add(piv);
    return piv;
  };
  const arm = (side) => {
    const upper = limb(cloth, 0.055, 0.15, side * 0.205, 0.3, torso);
    const lower = limb(cloth, 0.05, 0.11, 0, -0.17, upper);
    if (look.outfit === 'blazer' || look.outfit === 'cardigan') part(new THREE.CylinderGeometry(0.052, 0.052, 0.022, 12), shirt, 0, -0.112, 0, lower);
    if (look.outfit === 'track') part(new THREE.BoxGeometry(0.012, 0.25, 0.012), new THREE.MeshBasicMaterial({ color: '#f4f4ef' }), side * 0.052, -0.03, 0, upper);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.062, 12, 10), skin);
    hand.position.y = -0.15;
    lower.add(hand);
    return { upper, lower, carry: false };
  };
  const leg = (side) => {
    const thigh = limb(pants, 0.07, THIGH - 0.04, side * 0.095, pelvisY, rig);
    const shin = limb(pants, 0.06, SHIN - 0.04, 0, -THIGH, thigh);
    const foot = new THREE.Group();
    foot.position.y = -SHIN;
    shin.add(foot);
    const sole = new THREE.Mesh(new THREE.SphereGeometry(0.085, 14, 10), shoe);
    sole.scale.set(0.82, 0.56, 1.5);
    sole.position.set(0, -ANKLE + 0.048, 0.045);
    foot.add(sole);
    return { thigh, shin, foot };
  };
  const armL = arm(-1), armR = arm(1), legL = leg(-1), legR = leg(1);

  // What they carry. On the raised forearm, local +z points up and -y points forward.
  if (look.item) {
    const a = armL;
    a.carry = true;
    if (look.item === 'book' || look.item === 'folder') {
      const b = part(new THREE.BoxGeometry(0.2, 0.035, 0.26), toon(look.itemColor || '#2d4a7c'), 0.055, -0.165, 0.03, a.lower);
      part(new THREE.BoxGeometry(0.11, 0.004, 0.07), white, 0, -0.019, 0.05, b);
    } else if (look.item === 'mug') {
      const m = toon('#fbf7ee');
      const cup = part(new THREE.CylinderGeometry(0.054, 0.048, 0.115, 14), m, 0.015, -0.2, 0.04, a.lower);
      cup.rotation.x = Math.PI / 2;
      const handle = part(new THREE.TorusGeometry(0.03, 0.009, 6, 12), m, -0.05, -0.2, 0.04, a.lower);
      handle.rotation.x = Math.PI / 2;
    }
  }
  root.traverse((o) => { if (o.isMesh && o.material !== dark && o.material !== white && !o.material.transparent) o.castShadow = true; });
  root.scale.setScalar(scale);
  root.userData = {
    rig, torso, head, hat, eyes, armL, armR, legL, legR, scale, tieGroup,
    phase: Math.random() * 6.28, blend: 0, clock: Math.random() * 20, blinkAt: 1 + Math.random() * 4, lookYaw: 0, lookGoal: 0
  };
  return root;
}

export function poseLeg(l, phi, w) {
  const s = Math.sin(phi), c = Math.cos(phi);
  const swing = Math.max(0, c);                   // positive while the leg travels forward
  const thigh = (-0.47 * s - 0.05) * w;           // negative x rotation swings the leg forward
  const knee = (0.1 + 0.98 * swing * swing + 0.1 * Math.max(0, s)) * w;
  // The sole stays nearly flat through stance, heel-first at strike, toe-last at push-off.
  const footWorld = (-0.3 * Math.max(0, s) * (1 - swing) + 0.62 * Math.max(0, -s)) * w;
  l.thigh.rotation.x = thigh;
  l.shin.rotation.x = knee;
  l.foot.rotation.x = footWorld - thigh - knee;
  // Height of the ankle below the hip
  return THIGH * Math.cos(thigh) + SHIN * Math.cos(thigh + knee);
}

// speed is the real ground speed, so the cycle always matches the distance walked.
export function animatePerson(p, dt, speed) {
  const u = p.userData;
  u.clock += dt;
  u.blend += ((speed > 0.05 ? 1 : 0) - u.blend) * (1 - Math.exp(-dt * 7));
  const w = u.blend;
  u.phase += ((speed * dt) / (STEP_CYCLE * u.scale)) * 6.2832;
  const phi = u.phase;

  const dropL = poseLeg(u.legL, phi, w);
  const dropR = poseLeg(u.legR, phi + Math.PI, w);
  // Hips ride on whichever leg is planted.
  const hipToSole = Math.max(dropL, dropR) + ANKLE;
  const breathe = Math.sin(u.clock * 1.9);
  u.rig.position.y = hipToSole - (THIGH + SHIN + ANKLE);

  const s = Math.sin(phi);
  // Weight shifts over the planted foot; shoulders turn against the hips.
  u.rig.rotation.z = 0.05 * s * w;
  u.rig.rotation.y = -0.09 * s * w;
  u.rig.position.x = 0.018 * s * w;
  u.torso.rotation.x = 0.07 * w;
  u.torso.rotation.y = 0.2 * s * w;
  u.torso.scale.set(1 + 0.008 * breathe * (1 - w), 1 + 0.012 * breathe * (1 - w), 1);

  // Arms swing opposite the legs and stay softly bent.
  [[u.armL, s], [u.armR, -s]].forEach(([a, v], i) => {
    if (a.carry) {
      // Holding something to the chest: the arm stays bent and barely swings.
      a.upper.rotation.x = -0.34 + 0.05 * v * w;
      a.lower.rotation.x = -1.35;
      a.lower.rotation.y = 0.35;
    } else {
      a.upper.rotation.x = 0.5 * v * w;
      a.lower.rotation.x = -(0.2 + 0.3 * Math.max(0, -v)) * w - 0.06;
    }
    a.upper.rotation.z = (i ? -1 : 1) * -(0.12 + 0.02 * breathe);
  });

  // The head stays level, as a walking person's does, with a small nod.
  if (u.clock > u.blinkAt + 2) { u.lookGoal = (Math.random() - 0.5) * (w > 0.5 ? 0.5 : 1.0); u.blinkAt = u.clock + 1.2 + Math.random() * 4; }
  u.lookYaw += (u.lookGoal - u.lookYaw) * (1 - Math.exp(-dt * 1.6));
  if (u.tieGroup) u.tieGroup.rotation.x = -0.26 - 0.05 * Math.abs(s) * w;
  u.head.rotation.z = -0.05 * s * w * 0.9;
  u.head.rotation.y = -0.2 * s * w + u.lookYaw;
  u.head.rotation.x = -0.05 * w + 0.018 * Math.cos(2 * phi) * w + 0.012 * breathe * (1 - w);

  const blink = u.clock > u.blinkAt && u.clock < u.blinkAt + 0.13;
  u.eyes.forEach((e) => { e.scale.y += ((blink ? 0.08 : 1) - e.scale.y) * (1 - Math.exp(-dt * 40)); });
  if (u.clock > u.blinkAt + 0.13 && u.clock < u.blinkAt + 2 && u.blinkDone !== u.blinkAt) { u.blinkDone = u.blinkAt; }
}

// Ordinary school staff, each with something from their working day.
export const LOOKS = [
  { skin: '#ffdcc2', hair: '#3b2a26', top: '#dc9d4c', pocket: '#cf9044', shirt: '#fdfcf6', tie: '#34548a', pants: '#474c60', shoe: '#5b3b2b', strap: '#e0574f', style: 'part', glasses: true, outfit: 'cardigan', item: 'book', itemColor: '#2d4a7c' },
  { skin: '#ffdcc2', hair: '#23232b', top: '#2f3f63', pocket: '#2a3958', shirt: '#fbfaf5', tie: '#c4483f', pants: '#2f3f63', shoe: '#2b211e', style: 'part', outfit: 'blazer', item: 'folder', itemColor: '#e8e2d2' },
  { skin: '#f7d2b4', hair: '#2e2a33', top: '#f7f8f4', shirt: '#a9cbe6', pants: '#3f4658', shoe: '#4a3a33', strap: '#3f6fb5', style: 'bob', glasses: true, outfit: 'labcoat' },
  { skin: '#efc6a4', hair: '#191a20', top: '#2f6f8f', pants: '#2f6f8f', shoe: '#fbfbf7', strap: '#f4f4ef', style: 'short', outfit: 'track' },
  { skin: '#f3cdae', hair: '#8b8886', top: '#55524f', pocket: '#4b4845', shirt: '#fbfaf5', tie: '#6b4b78', pants: '#55524f', shoe: '#2b211e', style: 'part', glasses: '#6b5a4a', outfit: 'blazer', item: 'mug' },
  { skin: '#fbd6bb', hair: '#5b3a2c', top: '#d98a97', pocket: '#cc7f8c', shirt: '#fff8ef', pants: '#4b4a5e', shoe: '#7a4a3c', strap: '#8a5a9e', style: 'bun', outfit: 'cardigan', item: 'book', itemColor: '#7a3f4e' },
  { skin: '#ffe0cc', hair: '#2a2a33', top: '#a6c9e4', shirt: '#a6c9e4', tie: '#37507c', pants: '#3e4658', shoe: '#33282a', strap: '#37507c', style: 'short', glasses: true, outfit: 'shirt', item: 'mug' },
  { skin: '#f7d2b4', hair: '#42281f', top: '#7ea87c', pocket: '#739c71', shirt: '#fdfbf2', pants: '#4b5248', shoe: '#5a4232', strap: '#b57d2c', style: 'bob', outfit: 'cardigan' }
];
export const PERSON_SCALE = 1.12;

export function angLerp(a, b, k) {
  let d = ((b - a + Math.PI) % 6.2831853);
  if (d < 0) d += 6.2831853;
  return a + (d - Math.PI) * k;
}

// Far away (over 25 m) a person is only a coloured body and a head: cheap to draw, no shadow.
export function makeFarPerson(look, scale = PERSON_SCALE) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.45, 4, 8), toon(look.top));
  body.position.y = 0.42;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), toon(look.skin));
  head.position.y = 0.95;
  g.add(body, head);
  g.scale.setScalar(scale);
  return g;
}
