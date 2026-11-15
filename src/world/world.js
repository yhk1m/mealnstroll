// © 2026 김용현
// The school scene of the approved draft (reference/sian.html): sky, light, trees, buildings,
// Christmas, falling leaves, rain and snow, and the time-of-day look. Moved, not redesigned.
import * as THREE from 'three';
import campusData from '../data/campus.json' with { type: 'json' };
import courses from '../data/courses.json' with { type: 'json' };
import { inPoly } from '../move/geom.js';
import { resolveWorld, skyNow } from './sky-clock.js';

export function createWorld({ canvas, reduced = false, onWeather } = {}) {
  const D = campusData;
  const COURSES = courses;
  const view = { style: 'illust', time: 'day', dawn: false, timeMode: 'now', mode: 'walk', world: null, fogBase: 0.001, wxMode: 'live', seasonMode: 'date', live: null };

  // Throws when WebGL is unavailable; main shows the message.
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  THREE.ColorManagement.legacyMode = false;
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(46, 1, 0.3, 7000);

  // ---------- presets ----------
  const STYLES = {
    illust: {
      flat: true, standard: false, noise: 0.05, grass: '#9cc25f', lawn: '#86b352', yard: '#d9cdb4', far: '#a7bd78',
      wall: '#c9785a', wallTrim: '#f0e2cc', roof: '#8d7f73', glass: '#3f5468', track: '#cf5f45', court: '#5f9f8a',
      road: '#8c8a88', cityWall: '#efe6d8', cityGlass: '#d3c8b8', cityRoof: '#c9bfb2', stand: '#cfc6b6', crown: 1,
      leaves: ['#f6c544', '#efa33e', '#e8743f', '#dc6050', '#a9bd55', '#f8d962']
    }
  };
  const TIMES = {
    day: {
      az: 205, el: 50, sun: '#fff1da', sunI: 1.12, hemiS: '#d4e8ff', hemiG: '#8f8a58', hemiI: 0.5,
      top: '#2c86ee', hor: '#d8eefb', fog: '#d4e6ef', fogD: 0.00105, exp: 0.78, win: 0, glow: 0.55, cloud: '#ffffff', cloudA: 0.8, leaf: 1
    },
    sunset: {
      az: 248, el: 11, sun: '#ffb070', sunI: 1.5, hemiS: '#ffd2b4', hemiG: '#80695c', hemiI: 0.74,
      top: '#5f78c4', hor: '#ffc792', fog: '#f7c49c', fogD: 0.0015, exp: 0.92, win: 0.5, glow: 1.5, cloud: '#ffd7bb', cloudA: 0.42, leaf: 1
    },
    night: {
      az: 140, el: 34, sun: '#9fb9ff', sunI: 0.42, hemiS: '#3c5183', hemiG: '#141a26', hemiI: 0.42,
      top: '#091230', hor: '#27375f', fog: '#1b2949', fogD: 0.0015, exp: 1.05, win: 1, glow: 0.35, cloud: '#3c4c74', cloudA: 0.3, leaf: 0.5, stars: true, lamps: true
    }
  };

  // ---------- geometry helpers ----------
  const seeded = (s) => () => ((s = Math.imul(s ^ (s >>> 15), 2654435761) >>> 0) % 100000) / 100000;
  const lowerRing = D.plots[1].ring;
  const groundY = (x, z) => (inPoly(x, z, lowerRing) ? -2 : 0);
  // The west drive slopes down from the school yard to the sports ground.
  function heightAt(x, z) {
    const edge = 39.63 + ((x + 130.54) * 25.39) / 150.18;
    const t = (z - edge) / (58.6 - edge);
    if (t >= 0 && t <= 1 && Math.abs(x - (-123 - 3.1 * t)) < 3.6) return -2 * t;
    return groundY(x, z);
  }
  const groundBuildings = D.buildings.filter((b) => !b.base);
  const inBuilding = (x, z) => groundBuildings.some((b) => inPoly(x, z, b.ring));
  function lineBlocked(x0, z0, x1, z1) {
    const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0));
    for (let i = 0; i <= n; i++) if (inBuilding(x0 + ((x1 - x0) * i) / (n || 1), z0 + ((z1 - z0) * i) / (n || 1))) return true;
    return false;
  }
  const area = (r) => r.reduce((a, p, i) => { const q = r[(i + 1) % r.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;

  function shapeOf(ring, holes) {
    const s = new THREE.Shape(ring.map(([x, z]) => new THREE.Vector2(x, -z)));
    (holes || []).forEach((h) => s.holes.push(new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x, -z)))));
    return s;
  }
  function flatGeo(ring, y, holes) {
    const g = new THREE.ShapeGeometry(shapeOf(ring, holes));
    g.rotateX(-Math.PI / 2);
    g.translate(0, y, 0);
    return g;
  }
  // Vertical quads around a ring. UVs count window bays and floors.
  function wallGeo(ring, y0, h, bayW, floorH, open) {
    const r = area(ring) > 0 ? ring : ring.slice().reverse();
    const pos = [], uv = [];
    let u = 0;
    for (let i = 0; i < r.length - (open ? 1 : 0); i++) {
      const a = r[i], b = r[(i + 1) % r.length];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const u2 = u + len / bayW, v = h / floorH;
      pos.push(a[0], y0, a[1], a[0], y0 + h, a[1], b[0], y0, b[1], b[0], y0, b[1], a[0], y0 + h, a[1], b[0], y0 + h, b[1]);
      uv.push(u, 0, u, v, u2, 0, u2, 0, u, v, u2, v);
      u = u2;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    return g;
  }
  function ribbonGeo(lines, width, y) {
    const pos = [];
    lines.forEach((line) => {
      for (let i = 0; i < line.length - 1; i++) {
        const a = line[i], b = line[i + 1];
        const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
        const w = (typeof width === 'function' ? width(line) : width) / 2;
        const nx = (-dz / l) * w, nz = (dx / l) * w;
        const ya = typeof y === 'function' ? y(a[0], a[1]) : y, yb = typeof y === 'function' ? y(b[0], b[1]) : y;
        pos.push(a[0] + nx, ya, a[1] + nz, b[0] + nx, yb, b[1] + nz, a[0] - nx, ya, a[1] - nz);
        pos.push(a[0] - nx, ya, a[1] - nz, b[0] + nx, yb, b[1] + nz, b[0] - nx, yb, b[1] - nz);
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return g;
  }

  // ---------- textures ----------
  function canvasTex(w, h, draw, repeat) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    t.anisotropy = 4;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); }
    return t;
  }
  function mottled(base, amount, stripes, repeat) {
    const rnd = seeded(77);
    return canvasTex(512, 512, (x, w, h) => {
      x.fillStyle = base;
      x.fillRect(0, 0, w, h);
      if (stripes) {
        for (let i = 0; i < 8; i += 2) {
          x.fillStyle = 'rgba(255,255,255,.055)';
          x.fillRect((i * w) / 8, 0, w / 8, h);
        }
      }
      for (let i = 0; i < 2600; i++) {
        const dark = rnd() > 0.5;
        x.fillStyle = dark ? `rgba(30,40,10,${amount * rnd()})` : `rgba(255,250,200,${amount * rnd()})`;
        const r = 2 + rnd() * 16;
        x.beginPath();
        x.ellipse(rnd() * w, rnd() * h, r, r * 0.6, rnd() * 3, 0, 7);
        x.fill();
      }
    }, repeat);
  }
  // A grid of 8 bays by 5 floors, so the lit windows do not repeat too soon.
  function facade(wall, trim, glass, seed, lit) {
    const rnd = seeded(seed);
    const bays = 8, floors = 5, W = 512, H = 400, bw = W / bays, fh = H / floors;
    const draw = (x, w, h) => {
      x.fillStyle = lit ? '#000' : wall;
      x.fillRect(0, 0, w, h);
      if (!lit) {
        for (let i = 0; i < 1400; i++) {
          x.fillStyle = `rgba(${rnd() > 0.5 ? '255,235,210' : '40,20,10'},${0.06 * rnd()})`;
          x.fillRect(rnd() * w, rnd() * h, 7, 3);
        }
      }
      for (let f = 0; f < floors; f++) {
        if (!lit) { x.fillStyle = trim; x.fillRect(0, f * fh, w, 3); }
        for (let b = 0; b < bays; b++) {
          const wx = b * bw + bw * 0.16, wy = f * fh + fh * 0.24, ww = bw * 0.68, wh = fh * 0.54;
          if (lit) {
            if (rnd() < 0.5) {
              x.fillStyle = rnd() > 0.5 ? '#ffd38a' : '#ffe6b5';
              x.fillRect(wx, wy, ww, wh);
            }
          } else {
            x.fillStyle = trim;
            x.fillRect(wx - 2.5, wy - 2.5, ww + 5, wh + 5);
            x.fillStyle = glass;
            x.fillRect(wx, wy, ww, wh);
            x.fillStyle = 'rgba(220,235,250,.2)';
            x.fillRect(wx, wy, ww, wh * 0.36);
            x.fillStyle = trim;
            x.fillRect(wx + ww / 2 - 1, wy, 2, wh);
          }
        }
      }
    };
    const t = canvasTex(W, H, draw);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }
  const puff = canvasTex(256, 128, (x, w, h) => {
    const rnd = seeded(11);
    for (let i = 0; i < 26; i++) {
      const px = w * (0.14 + rnd() * 0.72), py = h * (0.42 + rnd() * 0.26), r = 16 + rnd() * 30;
      const g = x.createRadialGradient(px, py, 1, px, py, r);
      g.addColorStop(0, 'rgba(255,255,255,.34)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g;
      x.fillRect(0, 0, w, h);
    }
  });
  const dot = canvasTex(64, 64, (x, w) => {
    const g = x.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,.5)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, w, w);
  });
  const leafTex = canvasTex(32, 32, (x) => {
    x.fillStyle = '#fff';
    x.beginPath();
    x.ellipse(16, 16, 13, 7, 0.6, 0, 7);
    x.fill();
  });

  // ---------- sky and light (survive style changes) ----------
  const skyU = {
    top: { value: new THREE.Color() }, hor: { value: new THREE.Color() },
    sunDir: { value: new THREE.Vector3() }, sunCol: { value: new THREE.Color() }, glow: { value: 1 }
  };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(5000, 32, 20), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: skyU,
    vertexShader: 'varying vec3 d; void main(){ d = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
    fragmentShader: `varying vec3 d; uniform vec3 top, hor, sunCol, sunDir; uniform float glow;
      void main(){ vec3 n = normalize(d);
        float h = pow(clamp(n.y, 0., 1.), .46);
        vec3 c = mix(hor, top, h);
        float s = max(dot(n, sunDir), 0.);
        c += sunCol * (pow(s, 9.) * .22 + pow(s, 90.) * .4 + smoothstep(.9994, .9997, s) * 1.6) * glow;
        gl_FragColor = vec4(c, 1.);
        #include <tonemapping_fragment>
        #include <encodings_fragment>
      }`
  }));
  sky.renderOrder = -10;
  scene.add(sky);
  scene.fog = new THREE.FogExp2(0xffffff, 0.001);
  const sun = new THREE.DirectionalLight(0xffffff, 1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -270, right: 270, top: 270, bottom: -270, near: 10, far: 1500 });
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.6;
  sun.target.position.set(-50, 0, 30);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
  scene.add(sun, sun.target, hemi);

  const stars = (() => {
    const rnd = seeded(5), p = [];
    for (let i = 0; i < 900; i++) {
      const a = rnd() * 6.283, e = 0.08 + rnd() * 1.4;
      p.push(Math.cos(a) * Math.cos(e) * 4500, Math.sin(e) * 4500, Math.sin(a) * Math.cos(e) * 4500);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    return new THREE.Points(g, new THREE.PointsMaterial({ color: 0xe8efff, size: 2.2, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.85, map: dot, depthWrite: false }));
  })();
  scene.add(stars);

  const clouds = new THREE.Group();
  const cloudMats = [];
  (() => {
    const rnd = seeded(23);
    for (let i = 0; i < 18; i++) {
      const m = new THREE.SpriteMaterial({ map: puff, transparent: true, opacity: 0.8, depthWrite: false, fog: false });
      cloudMats.push(m);
      const s = new THREE.Sprite(m);
      const a = rnd() * 6.283, r = 500 + rnd() * 2100;
      s.position.set(Math.cos(a) * r, 240 + rnd() * 300, Math.sin(a) * r);
      const w = 500 + rnd() * 800;
      s.scale.set(w, w * 0.34, 1);
      clouds.add(s);
    }
  })();
  scene.add(clouds);

  // ---------- shared weather uniforms ----------
  const WX = { uSnow: { value: 0 }, uWet: { value: 0 }, uTime: { value: 0 }, uWind: { value: 0.35 } };
  // Adds snow lying on upward faces and rain darkening. Leaf cards also sway.
  function weatherize(m, o) {
    const opt = o || {};
    const up = opt.signed ? 'vUp' : 'abs(vUp)';
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, WX);
      let v = 'uniform float uTime; uniform float uWind; varying float vUp; varying vec2 vWP;\n' + sh.vertexShader.replace(
        '#include <defaultnormal_vertex>',
        '#include <defaultnormal_vertex>\n vUp = normalize(mat3(modelMatrix) * objectNormal).y;\n vWP = (modelMatrix * vec4(position, 1.0)).xz;'
      );
      if (opt.sway) {
        v = v.replace('#include <begin_vertex>', [
          '#include <begin_vertex>',
          'vec2 swayAt = vec2(0.0);',
          '#ifdef USE_INSTANCING',
          ' swayAt = instanceMatrix[3].xz;',
          '#endif',
          'float swayH = max(position.y, 0.0);',
          'transformed.x += uWind * swayH * 0.012 * sin(uTime * 1.1 + swayAt.x + position.z * 0.7);',
          'transformed.z += uWind * swayH * 0.012 * cos(uTime * 0.9 + swayAt.y + position.x * 0.7);'
        ].join('\n'));
      }
      sh.vertexShader = v;
      sh.fragmentShader = (opt.oneNormal ? '#undef DOUBLE_SIDED\n' : '') + 'uniform float uSnow; uniform float uWet; varying float vUp; varying vec2 vWP;\n' + sh.fragmentShader.replace(
        '#include <color_fragment>',
        '#include <color_fragment>\n diffuseColor.rgb *= 1.0 - 0.2 * uWet;\n float snowPatch = 0.5 + 0.25 * sin(vWP.x * 0.34 + sin(vWP.y * 0.21) * 2.0) + 0.25 * sin(vWP.y * 0.27 + sin(vWP.x * 0.17) * 2.0);\n float snowOn = uSnow * smoothstep(' + (opt.signed ? '0.62, 0.98' : '0.3, 0.75') + ', ' + up + ') * ' + (opt.signed ? '0.8' : 'mix(0.74, 0.98, smoothstep(0.25, 0.75, snowPatch))') + ';\n diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9, 0.93, 0.98), snowOn);'
      );
    };
    m.customProgramCacheKey = () => 'wx' + (opt.sway ? 1 : 0) + (opt.signed ? 1 : 0) + (opt.oneNormal ? 1 : 0);
    return m;
  }

  // ---------- trees ----------
  // Each kind is grown from its own branching rules, so a ginkgo stays narrow and a cherry spreads.
  const SPECIES = {
    ginkgo: { leader: true, h: 13, trunk: 2.8, rad: 0.27, whorls: 12, w: 3.9, kids: [0, 3, 2], angle: [0, 0.55, 0.5], len: [0, 1.1, 0.8], up: [0, 0.1, 0.08], wob: 0.1, card: 2.1, cards: 2, bark: '#a8957f', lean: 0.02 },
    maple: { h: 6.8, trunk: 1.9, rad: 0.2, kids: [4, 3, 3], angle: [0.62, 0.6, 0.65], len: [2.5, 1.7, 1.15], up: [0.05, 0.02, 0.01], wob: 0.16, card: 1.6, cards: 3, bark: '#927a68', lean: 0.07 },
    cherry: { h: 8.5, trunk: 2.3, rad: 0.25, kids: [4, 3, 3], angle: [0.88, 0.58, 0.55], len: [3.3, 2.3, 1.45], up: [0.08, 0, -0.04], wob: 0.15, card: 1.8, cards: 3, bark: '#7c645a', lean: 0.06 },
    zelkova: { h: 14, trunk: 3, rad: 0.38, kids: [5, 3, 3], angle: [0.48, 0.55, 0.6], len: [4.8, 3.3, 2.1], up: [0.05, 0.02, 0], wob: 0.12, card: 2.2, cards: 3, bark: '#a39484', lean: 0.03 },
    pine: { h: 9.5, trunk: 4.6, rad: 0.27, kids: [4, 3, 2], angle: [1.02, 0.6, 0.5], len: [3.1, 2, 1.25], up: [0.05, 0.03, 0.07], wob: 0.2, card: 1.7, cards: 3, bark: '#b4745a', lean: 0.13, needle: true, evergreen: true },
    azalea: { bush: true, r: 0.8, card: 0.85, cards: 26 },
    box: { bush: true, r: 0.7, card: 0.8, cards: 28, evergreen: true }
  };
  const PALETTES = {
    ginkgo: {
      spring: [['#4f7f2d', '#7fae3b', '#a6cf52']], summer: [['#2c5724', '#42762b', '#5f973a']],
      autumn: [['#a98d27', '#e2b82c', '#f8d83c'], ['#90983a', '#d9b631', '#f2cf3a'], ['#b89a2a', '#eec22e', '#fbe04a']]
    },
    maple: {
      spring: [['#567f33', '#88b04a', '#b2c95d']], summer: [['#2e5a29', '#487a30', '#6a9a3e']],
      autumn: [['#a8652e', '#c9552e', '#b73d2a'], ['#b98a32', '#d8762e', '#c74c2a'], ['#a09038', '#d9a234', '#d4622c']]
    },
    cherry: {
      spring: [['#d9a6ae', '#f2c6cf', '#fde3e7']], summer: [['#2d5828', '#44742e', '#648f3a']],
      autumn: [['#7d5230', '#b56a33', '#d98f38'], ['#8a4a30', '#b95c33', '#d9a23f'], ['#946635', '#c67d36', '#e2ae44']]
    },
    zelkova: {
      spring: [['#4d7a2e', '#7aa53b', '#a1c44e']], summer: [['#2a5426', '#3f702b', '#5a8c36']],
      autumn: [['#675428', '#a3652a', '#c78633'], ['#766229', '#b47d2b', '#cf9e39'], ['#585327', '#925c29', '#b5532b']]
    },
    pine: { all: [['#1b3522', '#29492c', '#3f6539'], ['#1f3a24', '#2d5030', '#47703f'], ['#1a3320', '#27472c', '#3a5f37']] },
    azalea: {
      spring: [['#7f3a4e', '#c9537a', '#ef8ba6']], summer: [['#2a4d26', '#3d682c', '#55843a']],
      autumn: [['#7a6238', '#b0603a', '#c9553a'], ['#856c3c', '#bd7238', '#d0683a']]
    },
    box: { all: [['#3a5c2e', '#4f7a38', '#6b9a48'], ['#355429', '#487034', '#628d42']] }
  };
  const KIND_NAMES = Object.keys(SPECIES);
  const VARIANTS = 3;

  const leafCardTex = canvasTex(256, 256, (x, w, h) => {
    const r = seeded(321);
    x.clearRect(0, 0, w, h);
    for (let i = 0; i < 210; i++) {
      const a = r() * 6.283, d = Math.sqrt(r()) * 112;
      const px = 128 + Math.cos(a) * d, py = 128 + Math.sin(a) * d, l = 10 + r() * 9;
      const g = Math.round(170 + r() * 85);
      x.save();
      x.translate(px, py);
      x.rotate(r() * 6.283);
      x.fillStyle = 'rgb(' + g + ',' + g + ',' + g + ')';
      x.beginPath();
      x.moveTo(-l, 0);
      x.quadraticCurveTo(0, -l * 0.62, l, 0);
      x.quadraticCurveTo(0, l * 0.62, -l, 0);
      x.fill();
      x.restore();
    }
  });
  const needleCardTex = canvasTex(256, 256, (x, w, h) => {
    const r = seeded(654);
    x.clearRect(0, 0, w, h);
    x.lineCap = 'round';
    for (let c = 0; c < 22; c++) {
      const a0 = r() * 6.283, d0 = Math.sqrt(r()) * 72, cx = 128 + Math.cos(a0) * d0, cy = 128 + Math.sin(a0) * d0;
      for (let i = 0; i < 26; i++) {
        const a = r() * 6.283, l = 16 + r() * 30, g = Math.round(150 + r() * 105);
        x.strokeStyle = 'rgb(' + g + ',' + g + ',' + g + ')';
        x.lineWidth = 2.2;
        x.beginPath();
        x.moveTo(cx, cy);
        x.lineTo(cx + Math.cos(a) * l, cy + Math.sin(a) * l);
        x.stroke();
      }
    }
  });
  const barkTex = canvasTex(64, 128, (x, w, h) => {
    const r = seeded(88);
    x.fillStyle = '#d8d8d8';
    x.fillRect(0, 0, w, h);
    for (let i = 0; i < 130; i++) {
      const g = Math.round(135 + r() * 100);
      x.fillStyle = 'rgba(' + g + ',' + g + ',' + g + ',.6)';
      x.fillRect(r() * w, r() * h, 1 + r() * 2.5, 6 + r() * 20);
    }
  }, 1);
  [leafCardTex, needleCardTex, barkTex].forEach((t) => { t.__shared = true; });

  function buffers() { return { pos: [], nor: [], uv: [], col: [], idx: [] }; }
  function toGeo(b) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
    g.setIndex(b.idx);
    return g;
  }
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  function perpOf(d, r) {
    const u = (Math.abs(d.y) > 0.9 ? V3(1, 0, 0) : V3(0, 1, 0)).cross(d).normalize();
    const v = d.clone().cross(u);
    const a = r() * 6.283;
    return u.multiplyScalar(Math.cos(a)).add(v.multiplyScalar(Math.sin(a)));
  }
  function addTube(b, p, q, r0, r1, sides, tone, vAt) {
    const d = q.clone().sub(p).normalize();
    const u = (Math.abs(d.y) > 0.9 ? V3(1, 0, 0) : V3(0, 1, 0)).cross(d).normalize();
    const w = d.clone().cross(u);
    const base = b.pos.length / 3;
    const len = p.distanceTo(q);
    for (let j = 0; j < 2; j++) {
      const c = j ? q : p, r = j ? r1 : r0;
      for (let i = 0; i <= sides; i++) {
        const a = (i / sides) * 6.2832, nx = u.x * Math.cos(a) + w.x * Math.sin(a), ny = u.y * Math.cos(a) + w.y * Math.sin(a), nz = u.z * Math.cos(a) + w.z * Math.sin(a);
        b.pos.push(c.x + nx * r, c.y + ny * r, c.z + nz * r);
        b.nor.push(nx, ny, nz);
        b.uv.push((i / sides) * 2, vAt + (j * len) / 1.6);
        b.col.push(tone.r, tone.g, tone.b);
      }
    }
    for (let i = 0; i < sides; i++) {
      const a = base + i, c = a + sides + 1;
      b.idx.push(a, a + 1, c, a + 1, c + 1, c);
    }
  }
  function addCard(b, c, size, out, r) {
    const n = out.clone().multiplyScalar(0.7).add(V3(0, 0.62, 0)).add(V3((r() - 0.5) * 0.5, (r() - 0.5) * 0.5, (r() - 0.5) * 0.5)).normalize();
    const face = out.clone().add(V3((r() - 0.5) * 1.8, (r() - 0.5) * 1.8, (r() - 0.5) * 1.8)).normalize();
    const a = perpOf(face, r).multiplyScalar(size / 2), e = face.clone().cross(a);
    const base = b.pos.length / 3;
    [[-1, -1, 0, 0], [1, -1, 1, 0], [1, 1, 1, 1], [-1, 1, 0, 1]].forEach(([u, v, uu, vv]) => {
      b.pos.push(c.x + a.x * u + e.x * v, c.y + a.y * u + e.y * v, c.z + a.z * u + e.z * v);
      b.nor.push(n.x, n.y, n.z);
      b.uv.push(uu, vv);
      b.col.push(1, 1, 1);
    });
    b.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  function growTree(kind, variant) {
    const sp = SPECIES[kind];
    const r = seeded(1009 * (KIND_NAMES.indexOf(kind) + 1) + variant * 37 + 5);
    const wood = buffers(), tips = [];
    const tone = new THREE.Color();
    if (sp.bush) {
      for (let i = 0; i < sp.cards; i++) {
        const a = r() * 6.283, e = r() * 1.5, d = sp.r * (0.55 + r() * 0.45);
        tips.push(V3(Math.cos(a) * Math.cos(e) * d, Math.sin(e) * d * 0.95 + 0.18, Math.sin(a) * Math.cos(e) * d));
      }
    } else {
      const limb = (p, dir, len, rad, lv) => {
        const segs = lv === 0 ? 4 : 3;
        let cur = p.clone(), d = dir.clone(), v = r() * 3;
        const end = rad * (lv === 0 ? 0.68 : 0.42);
        tone.set(sp.bark).multiplyScalar(lv === 0 ? 1 : 0.9 + lv * 0.05);
        for (let i = 0; i < segs; i++) {
          d.add(V3((r() - 0.5) * sp.wob, (sp.up[lv] || 0) + (r() - 0.5) * sp.wob, (r() - 0.5) * sp.wob)).normalize();
          const q = cur.clone().addScaledVector(d, len / segs);
          const r0 = rad + ((end - rad) * i) / segs, r1 = rad + ((end - rad) * (i + 1)) / segs;
          addTube(wood, cur, q, r0, r1, lv === 0 ? 8 : lv === 1 ? 5 : 3, tone, v);
          v += len / segs / 1.6;
          cur = q;
          if (lv >= sp.kids.length || (lv === sp.kids.length - 1 && i >= 1)) tips.push(q.clone());
          // A thin side twig partway along, so bare winter branches are not bald.
          if (lv >= 1 && i < segs - 1 && r() < 0.55) {
            const tw = d.clone().multiplyScalar(0.65).add(perpOf(d, r).multiplyScalar(0.75)).normalize();
            addTube(wood, q, q.clone().addScaledVector(tw, len * 0.3), r1 * 0.55, 0.012, 3, tone, 0);
          }
        }
        if (lv < sp.kids.length) {
          const count = sp.kids[lv];
          for (let i = 0; i < count; i++) {
            const az = (i / count) * 6.283 + r() * 1.2;
            const u = (Math.abs(d.y) > 0.9 ? V3(1, 0, 0) : V3(0, 1, 0)).cross(d).normalize();
            const w = d.clone().cross(u);
            const a = (sp.angle[lv] || 0.6) * (0.8 + r() * 0.4);
            const nd = d.clone().multiplyScalar(Math.cos(a)).addScaledVector(u, Math.sin(a) * Math.cos(az)).addScaledVector(w, Math.sin(a) * Math.sin(az)).normalize();
            limb(cur, nd, sp.len[lv] * (0.8 + r() * 0.4), end * 0.86, lv + 1);
          }
        }
        return cur;
      };
      const lean = perpOf(V3(0, 1, 0), r).multiplyScalar(sp.lean);
      if (sp.leader) {
        // One straight leader with branches that shorten towards the top.
        const top = V3(lean.x * sp.h, sp.h, lean.z * sp.h);
        tone.set(sp.bark);
        const parts = 7;
        for (let i = 0; i < parts; i++) {
          const a = V3(0, 0, 0).lerp(top, i / parts), q = V3(0, 0, 0).lerp(top, (i + 1) / parts);
          addTube(wood, a, q, sp.rad * (1 - (i / parts) * 0.88), sp.rad * (1 - ((i + 1) / parts) * 0.88), 7, tone, i * 0.8);
        }
        for (let i = 0; i < sp.whorls; i++) {
          const t = i / (sp.whorls - 1), y = sp.trunk + (sp.h - sp.trunk - 0.4) * t;
          const az = i * 2.399 + r() * 0.7, el = 0.42 + t * 0.55 + r() * 0.2;
          const d = V3(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el));
          const reach = sp.w * Math.pow(1 - t, 0.72) * (0.8 + r() * 0.4) + 0.5;
          limb(V3(lean.x * y, y, lean.z * y), d, reach, sp.rad * (0.34 - t * 0.2), 1);
        }
      } else {
        limb(V3(0, 0, 0), V3(lean.x, 1, lean.z).normalize(), sp.trunk, sp.rad, 0);
      }
    }
    // Crown centre and extent, used to shade the inside darker than the sunlit shell.
    const ctr = V3(0, 0, 0);
    tips.forEach((t) => ctr.add(t));
    ctr.multiplyScalar(1 / Math.max(1, tips.length));
    let maxR = 0.001, minY = 1e9, maxY = -1e9;
    tips.forEach((t) => { maxR = Math.max(maxR, Math.hypot(t.x - ctr.x, t.z - ctr.z)); minY = Math.min(minY, t.y); maxY = Math.max(maxY, t.y); });
    const hi = buffers(), lo = buffers();
    const hiT = [], loT = [];
    const card = (b, list, c, size, step) => {
      const out = c.clone().sub(ctr);
      if (out.lengthSq() < 0.01) out.set(0, 1, 0);
      out.normalize();
      addCard(b, c, size, out, r);
      const rad = Math.hypot(c.x - ctr.x, c.z - ctr.z) / maxR, up = (c.y - minY) / Math.max(0.01, maxY - minY);
      // Autumn turns the top and the outside first, in patches rather than evenly.
      const outer = Math.min(1, rad * 0.55 + up * 0.55);
      list.push({ t: Math.min(1, Math.max(0, outer + (step - 0.5) * 0.5)), shade: 0.68 + 0.42 * outer });
    };
    tips.forEach((t, i) => {
      const patch = r();
      for (let k = 0; k < (sp.bush ? 1 : sp.cards); k++) {
        const c = t.clone().add(V3((r() - 0.5) * sp.card, (r() - 0.5) * sp.card * 0.75, (r() - 0.5) * sp.card));
        card(hi, hiT, c, sp.card * (0.78 + r() * 0.5), patch);
        if (k === 0 && i % 2 === 0) card(lo, loT, c, sp.card * (1.7 + r() * 0.7), patch);
      }
    });
    return { kind, variant, wood: sp.bush ? null : toGeo(wood), hi: toGeo(hi), lo: toGeo(lo), hiT, loT, tips, crownR: maxR + (sp.card || 1) * 0.5, height: maxY };
  }
  const grown = {};
  function treeOf(kind, v) {
    const key = kind + v;
    if (!grown[key]) grown[key] = growTree(kind, v);
    return grown[key];
  }
  const treeSet = { leaves: [], decal: null, litter: null, season: null, lights: [] };
  const seasonNow = new THREE.Color(), seasonA = new THREE.Color(), seasonB = new THREE.Color();
  function paintGeo(geo, list, pal) {
    const c = geo.attributes.color, p0 = new THREE.Color(pal[0]), p1 = new THREE.Color(pal[1]), p2 = new THREE.Color(pal[2]);
    list.forEach((e, i) => {
      if (e.t < 0.5) seasonNow.copy(p0).lerp(p1, e.t * 2); else seasonNow.copy(p1).lerp(p2, (e.t - 0.5) * 2);
      seasonNow.multiplyScalar(e.shade);
      for (let k = 0; k < 4; k++) c.setXYZ(i * 4 + k, seasonNow.r, seasonNow.g, seasonNow.b);
    });
    c.needsUpdate = true;
  }
  // Season comes from the date: new leaves, summer green, autumn colours, bare branches.
  function paintSeason(season, cover) {
    if (treeSet.season !== season) {
      KIND_NAMES.forEach((kind) => {
        for (let v = 0; v < VARIANTS; v++) {
          const t = grown[kind + v];
          if (!t) continue;
          const pals = PALETTES[kind].all || PALETTES[kind][season] || PALETTES[kind].autumn;
          const pal = pals[v % pals.length];
          paintGeo(t.hi, t.hiT, pal);
          paintGeo(t.lo, t.loT, pal);
        }
      });
      treeSet.season = season;
    }
    treeSet.leaves.forEach((m) => { m.visible = SPECIES[m.userData.kind].evergreen || season !== 'winter'; });
    if (treeSet.decal) treeSet.decal.visible = season === 'autumn' && !cover;
    if (treeSet.litter) treeSet.litter.visible = season === 'autumn' && !cover;
  }

  // ---------- campus ----------
  let campus = null;
  let lampParts = [];
  let windowMats = [];
  let leafMat = null;
  let groundMeshes = [];
  let blockers = [];
  let crownMats = [];
  const xmas = { group: null, mats: [], spots: [] };

  function buildCampus(styleKey) {
    if (campus) {
      scene.remove(campus);
      campus.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { if (m.map && !m.map.__shared) m.map.dispose(); m.dispose(); });
      });
    }
    campus = new THREE.Group();
    scene.add(campus);
    lampParts = []; windowMats = []; groundMeshes = []; blockers = []; crownMats = [];
    const S = STYLES[styleKey];

    const mat = (color, extra) => {
      const o = Object.assign({ color, side: THREE.DoubleSide }, extra || {});
      return S.standard ? new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.93, metalness: 0 }, o)) : new THREE.MeshLambertMaterial(o);
    };
    function terraceWall() {
      const ring = lowerRing;
      let best = 0, bd = 1e9, bq = null;
      ring.forEach((a, i) => {
        const b = ring[(i + 1) % ring.length], dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz;
        const t = Math.max(0, Math.min(1, ((-123 - a[0]) * dx + (41 - a[1]) * dz) / l2));
        const q = [a[0] + dx * t, a[1] + dz * t], d = Math.hypot(q[0] + 123, q[1] - 41);
        if (d < bd) { bd = d; best = i; bq = q; }
      });
      const a = ring[best], b = ring[(best + 1) % ring.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const ux = (b[0] - a[0]) / l, uz = (b[1] - a[1]) / l, gap = 3.9;
      const line = [[bq[0] + ux * gap, bq[1] + uz * gap]];
      for (let i = 1; i <= ring.length; i++) line.push(ring[(best + i) % ring.length]);
      line.push([bq[0] - ux * gap, bq[1] - uz * gap]);
      return wallGeo(line, -2, 2, 6, 2, true);
    }
    function rampGeo() {
      const h = 3.6, top = (x) => 39.63 + ((x + 130.54) * 25.39) / 150.18;
      const c0 = -123, c1 = -126.1, z1 = 58.6;
      const A = [c0 - h, 0, top(c0 - h)], B = [c0 + h, 0, top(c0 + h)], C = [c1 + h, -2, z1], E = [c1 - h, -2, z1];
      const AL = [A[0], -2, A[2]], BL = [B[0], -2, B[2]];
      const tri = [A, E, B, B, E, C, A, AL, E, B, C, BL].flat();
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(tri, 3));
      g.computeVertexNormals();
      return g;
    }
    const add = (geo, m, opts) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.receiveShadow = !(opts && opts.noReceive);
      mesh.castShadow = !!(opts && opts.cast);
      campus.add(mesh);
      if (opts && opts.ground) groundMeshes.push(mesh);
      if (opts && opts.block) blockers.push(mesh);
      return mesh;
    };

    // Ground
    const grassMat = mat('#ffffff', { map: mottled(S.grass, S.noise * 1.5, false, 1 / 36) });
    const yardMat = mat('#ffffff', { map: mottled(S.yard, S.noise, false, 1 / 22) });
    if (S.island) {
      add(flatGeo(D.plots[0].ring, 0), yardMat, { ground: true });
      add(flatGeo(lowerRing, -2), grassMat, { ground: true });
      add(terraceWall(), mat(S.stand));
      add(rampGeo(), mat(S.yard), { cast: true, ground: true });
      add(wallGeo(D.plots[0].ring, -26, 26, 12, 8), mat('#a98a68'), { cast: true, noReceive: true });
      add(wallGeo(lowerRing, -26, 24, 12, 8), mat('#a98a68'), { cast: true, noReceive: true });
    } else {
      const circle = [];
      for (let i = 0; i < 72; i++) circle.push([Math.cos((i / 72) * 6.283) * 4800, Math.sin((i / 72) * 6.283) * 4800]);
      add(flatGeo(circle, 0, [lowerRing]), mat('#ffffff', { map: mottled(S.far, S.noise * 1.5, false, 1 / 60) }), { ground: true });
      add(flatGeo(lowerRing, -2), grassMat, { ground: true });
      add(flatGeo(D.plots[0].ring, 0.03), yardMat, { ground: true });
      add(terraceWall(), mat(S.stand));
      add(rampGeo(), mat(S.yard), { cast: true, ground: true });
    }

    // Roads and neighbourhood
    if (!S.island) {
      add(ribbonGeo(D.around.roads.map((r) => r.line), (l) => (D.around.roads.find((r) => r.line === l).w || 4) * 2.4, 0.05), mat(S.road));
      D.around.green.forEach((g) => add(flatGeo(g, 0.04), mat(S.lawn)));
      const cityTex = facade(S.cityWall, S.cityWall, S.cityGlass, 91);
      const cityLit = facade('#000', '#000', '#000', 91, true);
      const rnd = seeded(31);
      const city = mat('#ffffff', { map: cityTex, emissive: new THREE.Color('#ffffff'), emissiveMap: cityLit, emissiveIntensity: 0 });
      windowMats.push(city);
      D.around.buildings.forEach((ring) => {
        const h = 10 + rnd() * rnd() * 26;
        add(wallGeo(ring, 0, h, 3.2 * 8, 3 * 5), city, { cast: false });
        add(flatGeo(ring, h), mat(S.cityRoof), { cast: false });
      });
    }

    // Paths
    D.paths.forEach((p) => add(ribbonGeo([p.line], p.width, (x, z) => heightAt(x, z) + 0.07), mat(S.yard)));
    const closed = (l) => l.concat([l[0]]);
    add(ribbonGeo([closed(COURSES.campus)], 2.4, (x, z) => heightAt(x, z) + 0.09), mat('#f0e4c8'));
    add(ribbonGeo([closed(COURSES.outside)], 2.8, 0.08), mat('#d2ccbe'));

    // Garden
    add(flatGeo(D.garden.zone, 0.06), mat(S.lawn));
    D.garden.beds.forEach((b) => add(flatGeo(b, 0.1), mat(S.grass)));

    // Sports ground
    D.grounds.forEach((g) => {
      const y = g.elev || 0;
      if (g.kind === 'grass') { add(flatGeo(g.ring, y + 0.06), mat(S.lawn)); return; }
      if (g.sport === 'tennis') { add(flatGeo(g.ring, y + 0.05), mat(S.court)); (g.lines || []).forEach((l) => add(ribbonGeo([l], 0.09, y + 0.09), mat('#ffffff'))); return; }
      add(flatGeo(g.ring, y + 0.04), mat(S.yard));
      if (g.track) {
        const [outer, inner] = g.track;
        const pos = [], n = Math.min(outer.length, inner.length);
        for (let i = 0; i < n; i++) {
          const a = outer[i], b = outer[(i + 1) % n], c = inner[i], d = inner[(i + 1) % n];
          pos.push(a[0], 0, a[1], c[0], 0, c[1], b[0], 0, b[1], b[0], 0, b[1], c[0], 0, c[1], d[0], 0, d[1]);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        geo.computeVertexNormals();
        add(geo, mat(S.track)).position.y = y + 0.08;
        add(ribbonGeo(g.track.slice(1).map((l) => (l.length > 2 ? l.concat([l[0]]) : l)), 0.09, y + 0.11), mat('#fff8ec'));
      }
      if (g.surface) {
        const pitchTex = mottled(S.lawn, S.noise, true, 1 / 26);
        add(flatGeo(g.surface, y + 0.09), mat('#ffffff', { map: pitchTex }), { ground: true });
      }
      (g.aprons || []).forEach((r) => add(flatGeo(r, y + 0.07), mat(S.track)));
      (g.courts || []).forEach((c) => {
        add(flatGeo(c.ring, y + 0.1), mat(S.court));
        (c.lines || []).forEach((l) => add(ribbonGeo([l], 0.07, y + 0.13), mat('#fff8ec')));
      });
      (g.lines || []).forEach((l) => add(ribbonGeo([l], 0.12, y + 0.13), mat('#fff8ec')));
    });

    // Terrace seating above the ground
    {
      const T = D.terrace, [a, b] = T.line;
      const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz), ang = Math.atan2(-dz, dx);
      const t0 = (T.stand_x[0] - a[0]) / dx, t1 = (T.stand_x[1] - a[0]) / dx;
      const nx = -dz / len, nz = dx / len, sign = nz > 0 ? 1 : -1;
      const standMat = mat(S.stand);
      for (let i = 0; i < T.steps; i++) {
        const h = (2 * (T.steps - i)) / T.steps;
        const box = new THREE.BoxGeometry(Math.abs(t1 - t0) * len, h, 1.5);
        const m = add(box, standMat, { cast: true });
        const t = (t0 + t1) / 2, off = 0.8 + i * 1.5;
        m.position.set(a[0] + dx * t + nx * sign * off, -2 + h / 2, a[1] + dz * t + nz * sign * off);
        m.rotation.y = ang;
      }
    }

    // School buildings
    const wallTex = facade(S.wall, S.wallTrim, S.glass, 17);
    const litTex = facade('#000', '#000', '#000', 41, true);
    const school = mat('#ffffff', { map: wallTex, emissive: new THREE.Color('#ffffff'), emissiveMap: litTex, emissiveIntensity: 0 });
    windowMats.push(school);
        const trim = mat(S.wallTrim);
    const roof = mat(S.roof);
    const glass = mat('#9fc0d4', { transparent: true, opacity: 0.55 });
    D.buildings.forEach((b) => {
      const bridge = b.kind === 'bridge';
            const y0 = (bridge ? 0 : 0) + b.base + groundY(b.ring[0][0], b.ring[0][1]) * (b.base ? 0 : 1);
      const wm = bridge ? glass : school;
      add(wallGeo(b.ring, y0, b.height, 3.6 * 8, 3.3 * 5), wm, { cast: true, block: true });
      add(flatGeo(b.ring, y0 + b.height + 0.05), roof, { cast: true, block: true });
      if (!bridge) add(wallGeo(b.ring, y0 + b.height, 0.7, 4, 1), trim, { cast: true });
    });

    // Low wall along the boundary, skipping the real gates
    const gates = D.wall.gates;
    const wallPos = [];
    const low = mat(S.wallTrim);
    D.boundary.forEach((p, i) => {
      const q = D.boundary[(i + 1) % D.boundary.length];
      const mx = (p[0] + q[0]) / 2, mz = (p[1] + q[1]) / 2;
      if (gates.some((g) => Math.hypot(g.at[0] - mx, g.at[1] - mz) < g.width + 2)) return;
      const y = groundY(p[0] * 0.99 + mx * 0.01, p[1] * 0.99 + mz * 0.01);
      wallPos.push([p, q, y]);
    });
    wallPos.forEach(([p, q]) => {
      const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
      const box = new THREE.BoxGeometry(len, D.wall.height, D.wall.thick);
      const m = add(box, low, { cast: true });
      m.position.set((p[0] + q[0]) / 2, D.wall.height / 2, (p[1] + q[1]) / 2);
      m.rotation.y = Math.atan2(-(q[1] - p[1]), q[0] - p[0]);
    });

    // Trees: groves and uneven rows instead of one tree every few metres.
    const plants = [], bushes = [];
    const rt = seeded(101);
    const plant = (x, z, kind, near) => plants.push({ x, z, kind, near: !!near });
    const runs = (list, a, b) => {
      let cur = list[0], until = 0;
      return (d) => {
        if (d >= until) { cur = list[Math.floor(rt() * list.length)]; until = d + a + rt() * (b - a); }
        return rt() < 0.1 ? list[Math.floor(rt() * list.length)] : cur;
      };
    };
    const along = (line, a, b, jitter, pick, near) => {
      let t = a * rt(), walked = 0;
      for (let i = 0; i < line.length - 1; i++) {
        const p = line[i], q = line[i + 1], l = Math.hypot(q[0] - p[0], q[1] - p[1]);
        if (!l) continue;
        const ux = (q[0] - p[0]) / l, uz = (q[1] - p[1]) / l;
        while (t < l) {
          const off = (rt() - 0.5) * 2 * jitter;
          plant(p[0] + ux * t - uz * off, p[1] + uz * t + ux * off, pick(walked + t), near);
          t += a + rt() * (b - a);
        }
        t -= l; walked += l;
      }
    };
    const inRing = (ring) => {
      const xs = ring.map((p) => p[0]), zs = ring.map((p) => p[1]);
      for (let i = 0; i < 60; i++) {
        const x = Math.min(...xs) + rt() * (Math.max(...xs) - Math.min(...xs)), z = Math.min(...zs) + rt() * (Math.max(...zs) - Math.min(...zs));
        if (inPoly(x, z, ring)) return [x, z];
      }
      return ring[0];
    };
    const gauss = () => (rt() + rt() + rt() - 1.5) / 1.5;
    const grove = (ring, nGroves, nMin, nMax, sigma, kinds, near, withBushes) => {
      for (let g = 0; g < nGroves; g++) {
        const [cx, cz] = inRing(ring), kind = kinds[Math.floor(rt() * kinds.length)];
        const n = nMin + Math.floor(rt() * (nMax - nMin + 1));
        for (let i = 0; i < n; i++) {
          const x = cx + gauss() * sigma, z = cz + gauss() * sigma;
          if (inPoly(x, z, ring)) plant(x, z, rt() < 0.2 ? kinds[Math.floor(rt() * kinds.length)] : kind, near);
        }
        if (withBushes) for (let i = 0; i < 7; i++) bushes.push({ x: cx + gauss() * sigma * 1.7, z: cz + gauss() * sigma * 1.7, kind: rt() < 0.55 ? 'azalea' : 'box' });
      }
    };
    D.trees.lines.forEach((l) => along(l, 5, 8.5, 0.8, () => 'cherry', true));
    {
      const r = lowerRing, c = r.reduce((a, p) => [a[0] + p[0] / r.length, a[1] + p[1] / r.length], [0, 0]);
      const inset = (k) => { const q = r.map((p) => [p[0] + (c[0] - p[0]) * k, p[1] + (c[1] - p[1]) * k]); return q.concat([q[0]]); };
      along(inset(0.055), 5.5, 11, 1.4, runs(['cherry', 'zelkova', 'maple', 'ginkgo', 'cherry', 'pine'], 22, 48), true);
      along(inset(0.1), 9, 22, 2, runs(['maple', 'pine', 'zelkova'], 20, 40), true);
    }
    grove(D.garden.zone, 8, 3, 6, 5.5, ['maple', 'maple', 'pine', 'cherry', 'zelkova', 'pine'], true, true);
    D.grounds.filter((g) => g.kind === 'grass').forEach((g) => grove(g.ring, 2, 3, 5, 5, ['maple', 'zelkova', 'pine'], true, true));
    grove(D.plots[0].ring, 15, 1, 4, 4.5, ['zelkova', 'maple', 'pine', 'ginkgo', 'cherry'], true, true);
    if (!S.island) {
      D.around.green.forEach((g) => grove(g, Math.min(5, 1 + Math.round(Math.abs(area(g)) / 1500)), 2, 5, 6, ['pine', 'zelkova', 'maple', 'pine', 'ginkgo'], false, false));
      // Street trees on both sides of the nearby roads. Korean streets are mostly one kind per road.
      D.around.roads.filter((r) => r.line.some((p) => Math.hypot(p[0] + 40, p[1] - 40) < 300) && (r.w || 0) >= 4).slice(0, 24).forEach((r, ri) => {
        const gap = (r.w || 4) * 1.2 + 1.8, kind = ri % 3 === 2 ? 'zelkova' : 'ginkgo';
        [1, -1].forEach((sd) => {
          const side = r.line.map((p, i) => {
            const a = r.line[Math.max(0, i - 1)], b = r.line[Math.min(r.line.length - 1, i + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
            return [p[0] - ((b[1] - a[1]) / l) * gap * sd, p[1] + ((b[0] - a[0]) / l) * gap * sd];
          });
          along(side, 9, 13, 0.4, () => kind, false);
        });
      });
      const o = COURSES.outside, cx = o.reduce((a, p) => a + p[0], 0) / o.length, cz = o.reduce((a, p) => a + p[1], 0) / o.length;
      along(closed(o.map((p) => { const l = Math.hypot(p[0] - cx, p[1] - cz); return [p[0] + ((p[0] - cx) / l) * 4.6, p[1] + ((p[1] - cz) / l) * 4.6]; })), 8.5, 13, 0.5, runs(['ginkgo', 'zelkova'], 70, 150), true);
    }
    // Low bushes along building walls, with gaps.
    groundBuildings.filter((b) => b.height > 3.6).forEach((b) => {
      const ring = b.ring;
      ring.forEach((a, i) => {
        const q = ring[(i + 1) % ring.length], l = Math.hypot(q[0] - a[0], q[1] - a[1]);
        if (l < 6 || rt() > 0.55) return;
        const ux = (q[0] - a[0]) / l, uz = (q[1] - a[1]) / l;
        const mx = (a[0] + q[0]) / 2, mz = (a[1] + q[1]) / 2;
        const sd = inPoly(mx - uz * 0.5, mz + ux * 0.5, ring) ? -1 : 1;
        const kind = rt() < 0.5 ? 'box' : 'azalea';
        for (let t = 1.5; t < l - 1; t += 1.05 + rt() * 0.6) {
          if (rt() < 0.12) t += 2;
          bushes.push({ x: a[0] + ux * t - uz * sd * 1.45, z: a[1] + uz * t + ux * sd * 1.45, kind });
        }
      });
    });
    const courseDots = Object.values(COURSES).flat();
    const pitch = D.grounds[0];
    const outer = pitch.track[0];
    const clearOf = (x, z, course, path) => {
      if (inPoly(x, z, outer)) return false;
      if (D.buildings.some((b) => inPoly(x, z, b.ring))) return false;
      if (courseDots.some((p) => Math.hypot(p[0] - x, p[1] - z) < course)) return false;
      if (D.paths.some((q) => q.line.some((p) => Math.hypot(p[0] - x, p[1] - z) < path))) return false;
      if (D.grounds.some((g) => g !== pitch && g.kind === 'pitch' && inPoly(x, z, g.ring))) return false;
      if (S.island && !inPoly(x, z, D.boundary)) return false;
      if (D.around.buildings.some((b) => inPoly(x, z, b))) return false;
      if (D.around.roads.some((r) => r.line.some((p) => Math.hypot(p[0] - x, p[1] - z) < 2.5))) return false;
      return true;
    };
    const roomOf = { ginkgo: 2.6, maple: 2.8, cherry: 3.4, zelkova: 3.8, pine: 2.8 };
    const free = [];
    plants.forEach((t) => {
      if (outer.some((p) => Math.hypot(p[0] - t.x, p[1] - t.z) < 4.5)) return;
      if (!clearOf(t.x, t.z, 3, 4)) return;
      // A crown should not grow into a wall.
      const pad = roomOf[t.kind] * 0.75;
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => groundBuildings.some((g) => inPoly(t.x + a * pad, t.z + b * pad, g.ring)))) return;
      if (free.some((o) => Math.hypot(o.x - t.x, o.z - t.z) < (roomOf[o.kind] + roomOf[t.kind]) * 0.62)) return;
      free.push(t);
    });
    const freeBushes = [];
    bushes.forEach((b) => {
      if (outer.some((p) => Math.hypot(p[0] - b.x, p[1] - b.z) < 2.5)) return;
      if (!clearOf(b.x, b.z, 1.6, 1.8)) return;
      if (free.some((o) => Math.hypot(o.x - b.x, o.z - b.z) < 1)) return;
      freeBushes.push(b);
    });

    const woodMat = weatherize(new THREE.MeshLambertMaterial({ map: barkTex, vertexColors: true, emissive: 0x2c241c, emissiveMap: barkTex }));
    const leafMatOf = (needle) => weatherize(new THREE.MeshLambertMaterial({ map: needle ? needleCardTex : leafCardTex, vertexColors: true, alphaTest: 0.42, side: THREE.DoubleSide }), { sway: true, signed: true, oneNormal: true });
    const broad = leafMatOf(false), needles = leafMatOf(true);
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), K = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
    const col = new THREE.Color();
    const groups = new Map();
    const place = (t, kind) => {
      t.v = Math.floor(rt() * VARIANTS);
      t.k = kind;
      t.rot = rt() * 6.283;
      t.s = 0.78 + rt() * 0.48;
      t.tint = 0.9 + rt() * 0.2;
      const key = kind + t.v;
      if (!groups.has(key)) groups.set(key, { kind, v: t.v, near: [], far: [] });
      groups.get(key)[t.near ? 'near' : 'far'].push(t);
    };
    free.forEach((t) => place(t, t.kind));
    freeBushes.forEach((t) => { t.near = true; place(t, t.kind); });
    treeSet.leaves = [];
    // Low quality keeps only part of the trees. Each plant gets one rank (its own seed, so the
    // layout above does not change), and instances are ordered by it, so a trunk and its crown
    // are kept or dropped together.
    const rq = seeded(202);
    free.concat(freeBushes).forEach((t) => { t.q = rq(); });
    const instance = (geo, material, srcList, cast) => {
      const list = srcList.slice().sort((a, b) => a.q - b.q);
      const m = new THREE.InstancedMesh(geo, material, list.length);
      m.userData.full = list.length;
      m.userData.ranks = list.map((t) => t.q);
      list.forEach((t, i) => {
        const y = groundY(t.x, t.z);
        Q.setFromAxisAngle(UP, t.rot);
        m.setMatrixAt(i, M.compose(P.set(t.x, y, t.z), Q, K.set(t.s, t.s * (0.92 + (t.tint - 0.9) * 0.8), t.s)));
        m.setColorAt(i, col.setRGB(t.tint, t.tint, t.tint * 0.97));
      });
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      m.castShadow = cast;
      m.receiveShadow = material !== broad && material !== needles;
      m.frustumCulled = false;
      campus.add(m);
      return m;
    };
    groups.forEach((g) => {
      const tree = treeOf(g.kind, g.v), sp = SPECIES[g.kind], all = g.near.concat(g.far), lm = sp.needle ? needles : broad;
      if (tree.wood) instance(tree.wood, woodMat, all, true);
      [[tree.hi, g.near, true], [tree.lo, g.far, false]].forEach(([geo, list, cast]) => {
        if (!list.length) return;
        const m = instance(geo, lm, list, cast);
        m.userData.kind = g.kind;
        treeSet.leaves.push(m);
      });
    });

    // A soft stain of fallen colour under each deciduous tree, then single leaves.
    const fallers = free.filter((t) => !SPECIES[t.kind].evergreen);
    {
      const stain = canvasTex(128, 128, (x, w, h) => {
        const r = seeded(17);
        x.clearRect(0, 0, w, h);
        for (let i = 0; i < 900; i++) {
          const a = r() * 6.283, d = Math.sqrt(r()) * r() * 62, o = (1 - d / 62) * 0.3;
          x.fillStyle = 'rgba(255,255,255,' + o.toFixed(3) + ')';
          x.beginPath();
          x.ellipse(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 1.2 + r() * 2.2, 0.8 + r() * 1.2, r() * 3, 0, 6.3);
          x.fill();
        }
      });
      const plane = new THREE.PlaneGeometry(1, 1);
      plane.rotateX(-Math.PI / 2);
      const decal = new THREE.InstancedMesh(plane, new THREE.MeshLambertMaterial({ map: stain, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), fallers.length);
      fallers.forEach((t, i) => {
        const c = treeOf(t.kind, t.v).crownR * t.s * 2.9;
        const pal = PALETTES[t.kind].autumn[t.v % PALETTES[t.kind].autumn.length];
        Q.identity();
        decal.setMatrixAt(i, M.compose(P.set(t.x + (rt() - 0.5) * 1.4, groundY(t.x, t.z) + 0.08, t.z + (rt() - 0.5) * 1.4), Q, K.set(c, 1, c)));
        decal.setColorAt(i, col.set(pal[1]));
      });
      decal.receiveShadow = true;
      decal.frustumCulled = false;
      campus.add(decal);
      treeSet.decal = decal;
      decal.userData.hideRanks = fallers.map((t) => t.q);

      const near = fallers.filter((t) => t.near);
      const rl = seeded(55), E = new THREE.Euler();
      const shape = new THREE.Shape();
      shape.moveTo(-0.17, 0); shape.quadraticCurveTo(0, -0.1, 0.17, 0); shape.quadraticCurveTo(0, 0.1, -0.17, 0);
      const litter = new THREE.InstancedMesh(new THREE.ShapeGeometry(shape, 3), new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }), Math.min(7000, near.length * 34));
      for (let i = 0; i < litter.count; i++) {
        const t = near[i % near.length];
        const a = rl() * 6.283, d = rl() * rl() * treeOf(t.kind, t.v).crownR * t.s * 1.9;
        const x = t.x + Math.cos(a) * d, z = t.z + Math.sin(a) * d;
        E.set(-Math.PI / 2 + (rl() - 0.5) * 0.5, (rl() - 0.5) * 0.3, rl() * 6.28);
        Q.setFromEuler(E);
        const k = 0.65 + rl() * 0.7;
        litter.setMatrixAt(i, M.compose(P.set(x, groundY(x, z) + 0.17, z), Q, K.set(k, k, k)));
        const pal = PALETTES[t.kind].autumn[t.v % PALETTES[t.kind].autumn.length];
        litter.setColorAt(i, col.set(pal[Math.floor(rl() * 3)]).multiplyScalar(0.8 + rl() * 0.35));
      }
      litter.instanceMatrix.needsUpdate = true;
      litter.receiveShadow = true;
      litter.frustumCulled = false;
      campus.add(litter);
      treeSet.litter = litter;
      litter.userData.hideRanks = Array.from({ length: litter.count }, (_, i) => near[i % near.length].q);
    }
    treeSet.season = null;
    treeSet.counts = { trees: free.length, near: free.filter((t) => t.near).length, bushes: freeBushes.length };

    // ---------- Christmas ----------
    xmas.group = new THREE.Group();
    xmas.group.visible = false;
    xmas.mats = [];
    campus.add(xmas.group);
    const bulbColors = [0xfff0c0, 0xff5a4a, 0x63e08a, 0x7ab8ff];
    const bulbLists = bulbColors.map(() => []);
    function fir(x, y, z, h) {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(h * 0.025, h * 0.04, h * 0.14, 8), new THREE.MeshLambertMaterial({ color: 0x5c4332 }));
      trunk.position.set(x, y + h * 0.07, z);
      trunk.castShadow = true;
      xmas.group.add(trunk);
      const coneMat = new THREE.MeshLambertMaterial({ color: 0x1f4a2c, flatShading: true });
      const TIERS = 8;
      for (let i = 0; i < TIERS; i++) {
        const t = i / TIERS, rr = h * 0.31 * (1 - t * 0.9), ch = h * 0.24;
        const c = new THREE.Mesh(new THREE.ConeGeometry(rr, ch, 18, 1), coneMat);
        c.position.set(x, y + h * 0.12 + t * h * 0.76 + ch / 2, z);
        c.rotation.y = i * 0.8;
        c.castShadow = true;
        xmas.group.add(c);
      }
      const r = seeded(Math.round(h * 100)), cards = buffers();
      for (let i = 0; i < 620; i++) {
        const t = Math.pow(r(), 1.25), a = r() * 6.283, rr = h * 0.31 * (1 - t) * (0.72 + r() * 0.34);
        const c = V3(x + Math.cos(a) * rr, y + h * 0.13 + t * h * 0.84, z + Math.sin(a) * rr);
        addCard(cards, c, h * 0.1, V3(Math.cos(a), 0.45, Math.sin(a)).normalize(), r);
      }
      for (let i = 0; i < cards.col.length; i += 12) {
        const k = 0.75 + r() * 0.5;
        for (let j = 0; j < 12; j += 3) { cards.col[i + j] = 0.09 * k; cards.col[i + j + 1] = 0.25 * k; cards.col[i + j + 2] = 0.12 * k; }
      }
      const needleMesh = new THREE.Mesh(toGeo(cards), weatherize(new THREE.MeshLambertMaterial({ map: needleCardTex, vertexColors: true, alphaTest: 0.42, side: THREE.DoubleSide }), { signed: true, oneNormal: true }));
      needleMesh.castShadow = true;
      needleMesh.frustumCulled = false;
      xmas.group.add(needleMesh);
      // Lights wound round the tree in a spiral.
      const turns = Math.round(h * 1.1), count = Math.round(h * 26);
      for (let i = 0; i < count; i++) {
        const t = i / count, a = t * turns * 6.283, rr = h * 0.33 * (1 - t) + 0.12;
        bulbLists[i % bulbLists.length].push(x + Math.cos(a) * rr, y + h * 0.15 + t * h * 0.82, z + Math.sin(a) * rr);
      }
      const star = new THREE.Mesh(new THREE.OctahedronGeometry(h * 0.04, 0), new THREE.MeshBasicMaterial({ color: 0xffe28a }));
      star.position.set(x, y + h * 1.0, z);
      xmas.group.add(star);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot, color: 0xffd98a, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }));
      glow.scale.setScalar(h * 0.26);
      glow.position.copy(star.position);
      xmas.group.add(glow);
      // Presents at the foot of the tree.
      const giftCols = [0xc8392f, 0x2d7a4d, 0xe8c04a, 0x3b6fb5, 0xf2ebe0];
      for (let i = 0; i < Math.round(h * 0.8); i++) {
        const a = r() * 6.283, d = h * (0.16 + r() * 0.2), w = 0.32 + r() * 0.42, gh = 0.26 + r() * 0.34;
        const box = new THREE.Mesh(new THREE.BoxGeometry(w, gh, w), new THREE.MeshLambertMaterial({ color: giftCols[i % giftCols.length] }));
        box.position.set(x + Math.cos(a) * d, y + 0.13 + gh / 2, z + Math.sin(a) * d);
        box.rotation.y = r() * 3;
        box.castShadow = true;
        const rib = new THREE.Mesh(new THREE.BoxGeometry(w * 1.02, gh * 1.02, w * 0.16), new THREE.MeshLambertMaterial({ color: 0xfff4d8 }));
        box.add(rib);
        xmas.group.add(box);
      }
    }
    // One big tree in the middle of the sports ground, one in the garden by the school.
    fir(-65, -2, 94, 13);
    {
      const z = D.garden.zone, gx = z.reduce((a, p) => a + p[0], 0) / z.length, gz = z.reduce((a, p) => a + p[1], 0) / z.length;
      fir(gx, 0, gz, 8);
      xmas.spots = [[-65, 94], [gx, gz]];
    }
    // Small lights in the trees next to the paths.
    const lit = free.filter((t) => t.near && courseDots.some((p) => Math.hypot(p[0] - t.x, p[1] - t.z) < 11)).slice(0, 110);
    // Ordered by the tree's quality rank (after the fir lights), so low quality can stop
    // drawing the bulbs of the trees it leaves out.
    const firBulbs = bulbLists[0].length / 3, bulbRanks = [];
    lit.slice().sort((a, b) => a.q - b.q).forEach((t) => {
      const tree = treeOf(t.kind, t.v), cs = Math.cos(t.rot), sn = Math.sin(t.rot);
      tree.tips.forEach((p, i) => {
        if (i % 2) return;
        bulbRanks.push(t.q);
        const x = p.x * t.s, z = p.z * t.s;
        bulbLists[0].push(t.x + x * cs + z * sn, groundY(t.x, t.z) + p.y * t.s, t.z - x * sn + z * cs);
      });
    });
    bulbLists.forEach((list, i) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(list, 3));
      const m = new THREE.PointsMaterial({ map: dot, color: bulbColors[i], size: i === 0 ? 0.42 : 0.62, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
      const pts = new THREE.Points(g, m);
      pts.frustumCulled = false;
      if (i === 0) Object.assign(pts.userData, { firBulbs, bulbRanks });
      xmas.group.add(pts);
      xmas.mats.push(m);
    });

    // Everything else outdoors takes snow and rain too.
    campus.traverse((o) => {
      const m = o.material;
      if (!m || m.isMeshBasicMaterial || m.isSpriteMaterial || m.isPointsMaterial || m.transparent) return;
      if (m.customProgramCacheKey !== THREE.Material.prototype.customProgramCacheKey) return;
      if (m.isMeshLambertMaterial || m.isMeshStandardMaterial) weatherize(m);
    });

    // Lamps along the track
    const laneLoop = pitch.track[2];
    const poleMat = mat('#3a3f46');
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffe9b8 });
    const poleGeo = new THREE.CylinderGeometry(0.06, 0.09, 4.2, 6);
    const bulbGeo = new THREE.SphereGeometry(0.22, 10, 8);
    for (let i = 2; i < laneLoop.length; i += Math.floor(laneLoop.length / 10)) {
      const a = outer[i];
      const c = [(outer[0][0] + outer[26][0]) / 2, (outer[0][1] + outer[26][1]) / 2];
      const l = Math.hypot(a[0] - c[0], a[1] - c[1]);
      const x = a[0] + ((a[0] - c[0]) / l) * 2.2, z = a[1] + ((a[1] - c[1]) / l) * 2.2;
      const pole = add(poleGeo, poleMat, { cast: true });
      pole.position.set(x, -2 + 2.1, z);
      const bulb = add(bulbGeo, bulbMat, { noReceive: true });
      bulb.position.set(x, -2 + 4.25, z);
      const glowMat = new THREE.SpriteMaterial({ map: dot, color: 0xffcf85, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
      const glow = new THREE.Sprite(glowMat);
      glow.scale.set(3.4, 3.4, 1);
      glow.position.copy(bulb.position);
      campus.add(glow);
      const poolMat = new THREE.MeshBasicMaterial({ map: dot, color: 0xffc070, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
      const pool = new THREE.Mesh(new THREE.PlaneGeometry(13, 13), poolMat);
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(x, -2 + 0.17, z);
      campus.add(pool);
      lampParts.push(glowMat, poolMat);
    }
  }

  const marker = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.5, 28), new THREE.MeshBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }));
  marker.rotation.x = -Math.PI / 2;
  marker.visible = false;
  scene.add(marker);

  // ---------- falling leaves ----------
  const LEAF_N = reduced ? 0 : 260;
  const leafPos = new Float32Array(LEAF_N * 3);
  const leafGeo = new THREE.BufferGeometry();
  leafGeo.setAttribute('position', new THREE.BufferAttribute(leafPos, 3));
  leafMat = new THREE.PointsMaterial({ map: leafTex, size: 0.2, transparent: true, depthWrite: false, alphaTest: 0.3, color: 0xf0a23c });
  const leaves = new THREE.Points(leafGeo, leafMat);
  leaves.frustumCulled = false;
  scene.add(leaves);
  const leafSeed = [];
  for (let i = 0; i < LEAF_N; i++) leafSeed.push({ a: Math.random() * 6.28, r: Math.random() * 42, y: Math.random() * 14, v: 0.35 + Math.random() * 0.55, p: Math.random() * 6 });

  // Lights the walker's face at night. main attaches it to the character.
  const faceLight = new THREE.PointLight(0xffe2c0, 0, 7);
  faceLight.position.set(0, 2, 1.6);

  // ---------- rain and snow ----------
  const FLAKES = 2400, DROPS = 1300;
  const flakeSeed = [];
  for (let i = 0; i < FLAKES; i++) flakeSeed.push([Math.random(), Math.random(), Math.random(), 0.75 + Math.random() * 0.6, Math.random() * 6.28]);
  const flakePos = new Float32Array(FLAKES * 3);
  const flakeGeo = new THREE.BufferGeometry();
  flakeGeo.setAttribute('position', new THREE.BufferAttribute(flakePos, 3));
  const flakeMat = new THREE.PointsMaterial({ map: dot, color: 0xffffff, size: 0.2, transparent: true, opacity: 0.95, depthWrite: false, fog: false });
  const flakes = new THREE.Points(flakeGeo, flakeMat);
  flakes.frustumCulled = false;
  flakes.visible = false;
  scene.add(flakes);
  const dropSeed = [];
  for (let i = 0; i < DROPS; i++) dropSeed.push([Math.random(), Math.random(), Math.random(), 0.85 + Math.random() * 0.3]);
  const dropPos = new Float32Array(DROPS * 6);
  const dropGeo = new THREE.BufferGeometry();
  dropGeo.setAttribute('position', new THREE.BufferAttribute(dropPos, 3));
  const dropMat = new THREE.LineBasicMaterial({ color: 0xe2ecf6, transparent: true, opacity: 0.55, depthWrite: false, fog: false });
  const drops = new THREE.LineSegments(dropGeo, dropMat);
  drops.frustumCulled = false;
  drops.visible = false;
  scene.add(drops);
  const wrap = (v, m) => ((v % m) + m) % m;
  function animatePrecip(t, look) {
    const aerial = view.mode === 'aerial';
    const c = aerial ? look : camera.position;
    const half = aerial ? 150 : 20, H = aerial ? 110 : 14, base = aerial ? -2 : Math.max(-2, c.y - 4);
    if (flakes.visible) {
      flakeMat.size = aerial ? 1.3 : 0.17;
      for (let i = 0; i < FLAKES; i++) {
        const f = flakeSeed[i];
        flakePos[i * 3] = c.x - half + wrap(f[0] * half * 2 + t * 0.5 + Math.sin(t * 0.6 + f[4]) * 0.9, half * 2);
        flakePos[i * 3 + 1] = base + wrap(f[1] * H - t * f[3], H);
        flakePos[i * 3 + 2] = c.z - half + wrap(f[2] * half * 2 + Math.cos(t * 0.5 + f[4]) * 0.9, half * 2);
      }
      flakeGeo.attributes.position.needsUpdate = true;
    }
    if (drops.visible) {
      for (let i = 0; i < DROPS; i++) {
        const d = dropSeed[i], x = c.x - half + wrap(d[0] * half * 2 + t * 1.5, half * 2), y = base + wrap(d[1] * H - t * 13 * d[3], H), z = c.z - half + d[2] * half * 2;
        dropPos.set([x, y, z, x + 0.07, y + 0.95, z], i * 6);
      }
      dropGeo.attributes.position.needsUpdate = true;
    }
  }


  // Overcast, rain, snow and fog are layered on top of the chosen time of day.
  const GREY = { day: '#aeb6bf', sunset: '#a39a9c', night: '#161c2b' };
  const GLOOM = { clear: 0, cloudy: 0.62, fog: 0.6, rain: 0.86, snow: 0.72 };
  const FOGGY = { clear: 1, cloudy: 1.2, fog: 6, rain: 2.4, snow: 3 };
  const mixHex = (a, b, k) => new THREE.Color(a).lerp(new THREE.Color(b), k);
  function applyTime() {
    // Dawn has the evening's colours, but the sun is in the east.
    const T = view.dawn ? Object.assign({}, TIMES.sunset, { az: 112 }) : TIMES[view.time];
    const W = resolveWorld({ ms: Date.now(), live: view.live, wxMode: view.wxMode, seasonMode: view.seasonMode });
    view.world = W;
    const g = GLOOM[W.kind], grey = GREY[view.time];
    const azr = (T.az * Math.PI) / 180, elr = (T.el * Math.PI) / 180;
    const dir = new THREE.Vector3(Math.sin(azr) * Math.cos(elr), Math.sin(elr), -Math.cos(azr) * Math.cos(elr));
    sun.position.copy(sun.target.position).addScaledVector(dir, 700);
    sun.color.copy(mixHex(T.sun, '#ffffff', g * 0.6)); sun.intensity = T.sunI * (1 - 0.72 * g);
    hemi.color.copy(mixHex(T.hemiS, grey, g * 0.6)); hemi.groundColor.set(T.hemiG); hemi.intensity = T.hemiI * (1 + 0.45 * g);
    skyU.top.value.copy(mixHex(T.top, grey, g)); skyU.hor.value.copy(mixHex(T.hor, grey, g * 0.9));
    skyU.sunDir.value.copy(dir); skyU.sunCol.value.set(T.sun); skyU.glow.value = T.glow * (1 - g);
    const island = STYLES[view.style].island;
    if (island && view.time === 'day' && !g) { skyU.top.value.set('#a9dcef'); skyU.hor.value.set('#fbf3df'); }
    scene.fog.color.copy(island && view.time === 'day' && !g ? new THREE.Color('#fbf3df') : mixHex(T.fog, grey, g));
    view.fogBase = (island ? T.fogD * 0.25 : T.fogD) * FOGGY[W.kind];
    renderer.toneMappingExposure = T.exp;
    windowMats.forEach((m) => { m.emissiveIntensity = Math.max(T.win, g > 0.7 ? 0.35 : 0) * 1.1; });
    lampParts.forEach((m) => { m.opacity = T.lamps ? 0.8 : 0; });
    stars.visible = !!T.stars && g < 0.3;
    cloudMats.forEach((m) => { m.color.copy(mixHex(T.cloud, grey, g)); m.opacity = Math.min(1, T.cloudA + g * 0.5); });
    // Date and weather on the ground and in the trees.
    WX.uSnow.value = W.cover;
    WX.uWet.value = W.kind === 'rain' ? 1 : 0;
    WX.uWind.value = Math.min(1.7, 0.25 + W.wind / 22);
    paintSeason(W.season, W.cover);
    flakes.visible = W.kind === 'snow';
    drops.visible = W.kind === 'rain';
    const falling = W.kind !== 'rain' && W.kind !== 'snow' && (W.season === 'autumn' || W.season === 'spring');
    leaves.visible = falling;
    leafMat.opacity = T.leaf;
    leafMat.color.set(W.season === 'spring' ? 0xfbdce4 : 0xf0a23c);
    if (xmas.group) xmas.group.visible = W.xmas;
    faceLight.intensity = view.time === 'night' ? 0.75 : 0;
    onWeather?.(W, view.live);
    return W;
  }

  // The draft's syncClock, on the shared sky clock. Returns whether the sky changed.
  function syncSky() {
    if (view.timeMode !== 'now') { view.time = view.timeMode; view.dawn = false; return false; }
    const { time, dawn } = skyNow(Date.now());
    const changed = time !== view.time || dawn !== view.dawn;
    view.time = time;
    view.dawn = dawn;
    return changed;
  }

  buildCampus(view.style);
  syncSky();
  applyTime();

  return {
    renderer, scene, camera, marker, faceLight,
    heightAt, inBuilding, groundMeshes: () => groundMeshes, blockers: () => blockers,
    setTimeMode(mode) { view.timeMode = mode; syncSky(); applyTime(); },
    setPreview({ wxMode, seasonMode }) { Object.assign(view, { wxMode, seasonMode }); applyTime(); },
    setLive(live) { view.live = live; applyTime(); },
    setViewMode(m) { view.mode = m; },
    setQuality(q) {
      renderer.shadowMap.enabled = q.shadows;
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, q.maxDpr));
      scene.traverse((o) => {
        if (o.isInstancedMesh && o.userData.ranks) o.count = o.userData.ranks.filter((r) => r < q.treeShare).length;
        if (o.isPoints && o.userData.bulbRanks) o.geometry.setDrawRange(0, o.userData.firBulbs + o.userData.bulbRanks.filter((r) => r < q.treeShare).length);
        // Fallen-leaf stains and litter belong to a tree: squash the ones whose tree is gone.
        if (o.isInstancedMesh && o.userData.hideRanks) {
          const arr = o.instanceMatrix.array;
          if (!o.userData.orig) o.userData.orig = arr.slice();
          o.userData.hideRanks.forEach((r, i) => {
            for (let k = 0; k < 16; k++) arr[i * 16 + k] = r < q.treeShare ? o.userData.orig[i * 16 + k] : 0;
          });
          o.instanceMatrix.needsUpdate = true;
        }
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.needsUpdate = true; });
      });
    },
    tickClock() { if (syncSky()) applyTime(); },
    frame(dt, t, look) {
      if (LEAF_N && leaves.visible) {
        for (let i = 0; i < LEAF_N; i++) {
          const l = leafSeed[i];
          l.y -= l.v * dt;
          if (l.y < 0) { l.y = 14; l.a = Math.random() * 6.28; l.r = Math.random() * 42; }
          leafPos[i * 3] = look.x + Math.cos(l.a) * l.r + Math.sin(t * 0.7 + l.p) * 1.2;
          leafPos[i * 3 + 1] = -2 + l.y;
          leafPos[i * 3 + 2] = look.z + Math.sin(l.a) * l.r + Math.cos(t * 0.5 + l.p) * 1.2;
        }
        leafGeo.attributes.position.needsUpdate = true;
      }
      if (!reduced) WX.uTime.value = t;
      animatePrecip(reduced ? 0 : t, look);
      if (xmas.group && xmas.group.visible) xmas.mats.forEach((m, i) => { m.opacity = 0.62 + 0.38 * Math.sin(t * 1.6 + i * 1.9); m.size = (i === 0 ? 0.42 : 0.62) * (view.mode === 'aerial' ? 5 : 1); });
      clouds.children.forEach((c) => {
        c.position.x += dt * 2.2;
        if (c.position.x > 2700) c.position.x = -2700;
      });
      scene.fog.density = (view.fogBase || 0.001) * (view.mode === 'aerial' ? 0.4 : 1);
      sky.position.copy(camera.position);
      stars.position.copy(camera.position);
    },
    resize(w, h) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.fov = w < h ? 58 : 46;
      // Phones: raise the scene so the menu does not cover the character.
      if (w < h) camera.setViewOffset(w, h, 0, h * 0.14, w, h); else camera.clearViewOffset();
      camera.updateProjectionMatrix();
    },
    get xmas() { return !!(view.world && view.world.xmas); }
  };
}
