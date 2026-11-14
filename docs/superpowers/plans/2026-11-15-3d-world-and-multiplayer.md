# 급식먹고산책 3D 세계와 다중 접속 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 시안(`reference/sian.html`)의 3D 학교 풍경을 Vite 모듈로 옮기고, Supabase Realtime으로 같은 방 사람들이 서로 걷는 모습을 보게 만든다.

**Architecture:** 위치는 "움직임 기록(motion)"을 presence에 싣고 각 화면이 `positionAt(motion, 서버시각)`으로 계산한다. 순수 로직(`src/move/`, `src/net/`의 검사·방 고르기·시각 보정, `src/quality.js`, `src/world/sky-clock.js`)은 TDD로 만들고, three.js 그리기 코드는 시안에서 줄 범위를 지정해 옮긴 뒤 헤드리스 스크린샷으로 확인한다. 개발 중 입구는 `walk3d.html`이고 2D `index.html`은 건드리지 않는다.

**Tech Stack:** Vite 5, 순수 JS(ESM), three@0.147.0(시안과 같은 판으로 고정), @supabase/supabase-js 2, node:test, Vercel 함수.

**설계 문서:** `docs/superpowers/specs/2026-11-15-3d-metaverse-tech-design.md`

---

## 작업 환경 주의 (모든 작업 공통)

- 프로젝트 경로: `C:\Users\김용현\Desktop\vibecoding\mealnstroll`, 가지 `3d`.
- **빌드는 반드시** `npx vite build --emptyOutDir=false`. 한글 경로 때문에 그냥 `vite build`는 Node가 크래시한다.
- 새 파일 첫 줄에는 `// © 2026 김용현` 주석이 훅으로 자동 삽입된다. 지우지 말 것.
- 테스트: `npm test` (= `node --test "test/*.test.js"`).
- `git add -A` 금지. 바꾼 파일만 이름으로 add 한다.
- 커밋 메시지 끝에 다음 두 줄을 붙인다.
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01MdmEQx8a9skuhW9MBiXzSx
  ```
- 화면에 보이는 한국어 글에는 가운데 점(·)과 긴 대시(—)를 쓰지 않고, 이모지 대신 선 SVG 아이콘을 쓴다.
- 헤드리스 Chrome은 항상 `--disable-gpu`로 띄운다(이 PC는 GPU 블루스크린 이력).

## 파일 구조

| 파일 | 책임 |
|---|---|
| `reference/sian.html` | 확정 시안 원본(읽기 전용, 옮겨 올 출처) |
| `scripts/extract-sian-data.mjs` | 시안에서 `D`, `COURSES` JSON을 뽑아 `src/data/`에 저장 |
| `src/data/campus.json`, `src/data/courses.json` | 학교 외부 자료, 코스 좌표 |
| `src/move/geom.js` | `inPoly`, `segLen` 등 기하 도우미 |
| `src/move/courses.js` | 코스 길이표, `pointOnCourse`, `nearestOnCourse`, `COURSE_NAMES` |
| `src/move/motion.js` | `positionAt`, `goDuration`, `PACES` |
| `src/move/navgrid.js` | 걸을 수 있는 땅 격자, `findPath` |
| `src/move/world-bounds.js` | 걸을 수 있는 범위(사각형)와 막힌 건물 목록 |
| `src/net/validate.js` | 남이 보낸 presence 값 검사 |
| `src/net/clock.js` | 서버 시각 보정 |
| `src/net/throttle.js` | 0.5초 뒤처리 묶음 |
| `src/net/rooms.js` | 방 번호 순서, 방 고르기 |
| `src/net/session.js` | Supabase 연결(이 파일만 Supabase를 안다) |
| `api/time.js` | 서버 시각 응답 |
| `src/quality.js` | fps 측정, 화질 결정, 저장 |
| `src/world/sky-clock.js` | 해 뜨고 지는 시각, 하늘 단계, 계절, 날씨 코드 해석(순수) |
| `src/world/world.js` | 시안의 하늘, 나무, 학교, 비와 눈, 낙엽, 시간 적용(three) |
| `src/avatar/person.js` | 캐릭터 만들기와 걷기 동작, 복장 8종 |
| `src/walk3d/main.js` | 이어 붙이기, 그리기 반복, 카메라, 클릭 |
| `src/walk3d/ui.js` | 하단 메뉴, 설정 창, 방 표시, 상태 글 |
| `src/walk3d/style.css` | 시안의 화면 요소 스타일(게임 부분 제외) |
| `walk3d.html` | 개발 중 3D 입구 |

---

### Task 1: 준비 (three 설치, 입구, 시안 자료 뽑기)

**Files:**
- Modify: `package.json`, `vite.config.js`
- Create: `walk3d.html`, `scripts/extract-sian-data.mjs`, `src/data/campus.json`, `src/data/courses.json`
- Add to git: `reference/sian.html` (이미 파일은 있음)

- [ ] **Step 1: three 고정 설치**

Run: `npm install three@0.147.0 --save-exact`
Expected: `package.json` dependencies에 `"three": "0.147.0"`.

- [ ] **Step 2: Vite 다중 입구 설정**

`vite.config.js` 전체를 다음으로 바꾼다.

```js
// © 2026 김용현
import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  server: { port: 5173, open: true },
  build: {
    target: 'es2020',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        walk3d: resolve(__dirname, 'walk3d.html')
      }
    }
  }
});
```

- [ ] **Step 3: 자료 뽑기 스크립트**

`scripts/extract-sian-data.mjs`:

```js
// © 2026 김용현
// Pulls the campus data (D) and course lines (COURSES) out of the approved draft.
// Run: node scripts/extract-sian-data.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const html = readFileSync(new URL('../reference/sian.html', import.meta.url), 'utf8');
const grab = (name) => {
  const m = html.match(new RegExp(`<script>const ${name} = (\\{.*?\\});</script>`, 's'));
  if (!m) throw new Error(`${name} not found in sian.html`);
  return JSON.parse(m[1]);
};
const D = grab('D');
const COURSES = grab('COURSES');
mkdirSync(new URL('../src/data/', import.meta.url), { recursive: true });
writeFileSync(new URL('../src/data/campus.json', import.meta.url), JSON.stringify(D));
writeFileSync(new URL('../src/data/courses.json', import.meta.url), JSON.stringify(COURSES));
console.log('campus keys:', Object.keys(D).join(','));
console.log('courses:', Object.keys(COURSES).map((k) => `${k}=${COURSES[k].length}`).join(','));
```

Run: `node scripts/extract-sian-data.mjs`
Expected:
```
campus keys: boundary,fences,wall,trees,around,plots,buildings,grounds,paths,garden,terrace
courses: track=53,campus=...,outside=...,road=...
```

- [ ] **Step 4: 빈 입구 페이지**

`walk3d.html`:

```html
<!-- © 2026 김용현 -->
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>급식먹고산책</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@700&family=Gowun+Dodum&display=swap" />
    <link rel="stylesheet" href="/src/walk3d/style.css" />
  </head>
  <body>
    <canvas id="c" aria-label="학교 운동장 3D 풍경"></canvas>
    <script type="module" src="/src/walk3d/main.js"></script>
  </body>
</html>
```

`src/walk3d/style.css`는 빈 파일(© 주석만), `src/walk3d/main.js`는 `console.log('walk3d');` 한 줄로 만든다.

- [ ] **Step 5: 빌드 확인**

Run: `npx vite build --emptyOutDir=false`
Expected: `dist/walk3d.html`과 `dist/index.html`이 모두 생성, 오류 없음.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vite.config.js walk3d.html scripts/extract-sian-data.mjs src/data/campus.json src/data/courses.json src/walk3d/style.css src/walk3d/main.js reference/sian.html
git commit -m "3D: three 0.147 고정, walk3d 입구, 시안 자료 추출"
```

---

### Task 2: 기하 도우미와 코스

**Files:**
- Create: `src/move/geom.js`, `src/move/courses.js`
- Test: `test/courses.test.js`

- [ ] **Step 1: 실패하는 테스트**

`test/courses.test.js`:

```js
// © 2026 김용현
import test from 'node:test';
import assert from 'node:assert/strict';
import { inPoly } from '../src/move/geom.js';
import { makeCourses } from '../src/move/courses.js';

const square = [[0, 0], [10, 0], [10, 10], [0, 10]];
const C = makeCourses({ sq: square });

test('inPoly: inside and outside', () => {
  assert.equal(inPoly(5, 5, square), true);
  assert.equal(inPoly(15, 5, square), false);
});

test('course loop length closes the ring', () => {
  assert.equal(C.sq.loop, 40);
});

test('pointOnCourse walks the ring and wraps', () => {
  const p = C.pointOnCourse('sq', 15);
  assert.deepEqual([p.x, p.z], [10, 5]);
  const q = C.pointOnCourse('sq', 45);
  assert.deepEqual([q.x, q.z], [5, 0]);
  const r = C.pointOnCourse('sq', -5);
  assert.deepEqual([r.x, r.z], [0, 5]);
});

test('pointOnCourse gives heading along the segment', () => {
  const p = C.pointOnCourse('sq', 5); // moving +x
  assert.ok(Math.abs(p.heading - Math.PI / 2) < 1e-9);
});

test('nearestOnCourse returns distance along the ring', () => {
  assert.equal(C.nearestOnCourse('sq', 10.5, 6), 16);
});

test('unknown course throws', () => {
  assert.throws(() => C.pointOnCourse('nope', 0));
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test test/courses.test.js`
Expected: FAIL (`Cannot find module ../src/move/geom.js`)

- [ ] **Step 3: 구현**

`src/move/geom.js`:

```js
// © 2026 김용현
// Even-odd point-in-polygon on [x, z] rings (same rule as the draft).
export function inPoly(x, z, ring) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i], [xj, zj] = ring[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}

export const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);

// Heading convention of the draft: atan2(dx, dz), 0 = +z.
export const headingOf = (dx, dz) => Math.atan2(dx, dz);
```

`src/move/courses.js`:

```js
// © 2026 김용현
import { dist, headingOf } from './geom.js';

export const COURSE_NAMES = { track: '운동장 트랙', campus: '건물 주변', outside: '학교 밖', road: '학교 안 길' };

// Builds cumulative lengths for closed rings and lookup helpers.
export function makeCourses(rings) {
  const info = {};
  for (const key of Object.keys(rings)) {
    const pts = rings[key], len = [0];
    for (let i = 0; i < pts.length; i++) len.push(len[i] + dist(pts[i], pts[(i + 1) % pts.length]));
    info[key] = { pts, len, loop: len[pts.length] };
  }
  const get = (key) => {
    const c = info[key];
    if (!c) throw new Error('unknown course: ' + key);
    return c;
  };
  function pointOnCourse(key, s) {
    const c = get(key);
    s = ((s % c.loop) + c.loop) % c.loop;
    let lo = 0, hi = c.pts.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (c.len[m] <= s) lo = m; else hi = m - 1; }
    const a = c.pts[lo], b = c.pts[(lo + 1) % c.pts.length];
    const t = (s - c.len[lo]) / (c.len[lo + 1] - c.len[lo] || 1);
    return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, heading: headingOf(b[0] - a[0], b[1] - a[1]) };
  }
  function nearestOnCourse(key, x, z) {
    const c = get(key);
    let best = 0, bd = Infinity;
    for (let i = 0; i < c.pts.length; i++) {
      const a = c.pts[i], b = c.pts[(i + 1) % c.pts.length];
      const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2));
      const px = a[0] + dx * t, pz = a[1] + dz * t, d = Math.hypot(px - x, pz - z);
      if (d < bd) { bd = d; best = c.len[i] + Math.sqrt(l2) * t; }
    }
    return best;
  }
  return { ...info, keys: Object.keys(info), pointOnCourse, nearestOnCourse };
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test test/courses.test.js`
Expected: 6 tests PASS

- [ ] **Step 5: 실제 코스 길이 확인 (메모와 대조)**

Run: `node -e "import('./src/move/courses.js').then(async m=>{const c=JSON.parse(require('fs').readFileSync('src/data/courses.json','utf8'));const C=m.makeCourses(c);for(const k of C.keys)console.log(k,Math.round(C[k].loop))})"`
Expected: 대략 `track 311`, `campus 375`, `outside 839`, `road 805`. 크게 다르면 멈추고 보고.

- [ ] **Step 6: Commit**

```bash
git add src/move/geom.js src/move/courses.js test/courses.test.js
git commit -m "3D: 코스 길이표와 코스 위 위치 계산"
```

---

### Task 3: 움직임 기록과 `positionAt`

**Files:**
- Create: `src/move/motion.js`
- Test: `test/motion.test.js`

움직임 기록 형식(설계 문서 2절):
- `{ kind: 'idle', at: [x, z], face }`
- `{ kind: 'go', pts: [[x, z], ...], speed, t0, then? }` (`then = { course, offset }`)
- `{ kind: 'course', course, speed, t0, offset }`

`positionAt`은 `{ x, z, heading, moving, speed }`를 돌려준다. `t`와 `t0`는 ms.

- [ ] **Step 1: 실패하는 테스트**

`test/motion.test.js`:

```js
// © 2026 김용현
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeCourses } from '../src/move/courses.js';
import { createMotionMath } from '../src/move/motion.js';

const C = makeCourses({ sq: [[0, 0], [10, 0], [10, 10], [0, 10]] });
const { positionAt, goDuration } = createMotionMath(C);
const near = (a, b) => Math.abs(a - b) < 1e-6;

test('idle stays put and faces its direction', () => {
  const p = positionAt({ kind: 'idle', at: [3, 4], face: 1 }, 99999);
  assert.deepEqual([p.x, p.z, p.heading, p.moving, p.speed], [3, 4, 1, false, 0]);
});

test('go is at the start before t0', () => {
  const m = { kind: 'go', pts: [[0, 0], [10, 0]], speed: 1, t0: 1000 };
  const p = positionAt(m, 0);
  assert.deepEqual([p.x, p.z, p.moving], [0, 0, false]);
});

test('go walks along its points', () => {
  const m = { kind: 'go', pts: [[0, 0], [10, 0], [10, 10]], speed: 2, t0: 0 };
  const p = positionAt(m, 7000); // 14 m
  assert.ok(near(p.x, 10) && near(p.z, 4));
  assert.equal(p.moving, true);
  assert.ok(near(p.heading, 0)); // walking +z
  assert.equal(p.speed, 2);
});

test('go stops at the last point', () => {
  const m = { kind: 'go', pts: [[0, 0], [10, 0]], speed: 1, t0: 0 };
  const p = positionAt(m, 60000);
  assert.deepEqual([p.x, p.z, p.moving], [10, 0, false]);
  assert.ok(near(p.heading, Math.PI / 2));
});

test('goDuration is length over speed in ms', () => {
  assert.equal(goDuration({ pts: [[0, 0], [10, 0]], speed: 2 }), 5000);
});

test('course keeps looping from offset', () => {
  const m = { kind: 'course', course: 'sq', speed: 1, t0: 0, offset: 5 };
  const p = positionAt(m, 40000); // 45 m on a 40 m loop
  assert.ok(near(p.x, 10) && near(p.z, 0));
  assert.equal(p.moving, true);
});

test('go with then joins the course on arrival', () => {
  const m = { kind: 'go', pts: [[0, -4], [0, 0]], speed: 1, t0: 0, then: { course: 'sq', offset: 0 } };
  const p = positionAt(m, 4000 + 3000); // arrive at 4 s, then 3 m along the ring
  assert.ok(near(p.x, 3) && near(p.z, 0));
  assert.equal(p.moving, true);
});

test('single-point go is treated as standing', () => {
  const p = positionAt({ kind: 'go', pts: [[2, 2]], speed: 1, t0: 0 }, 5);
  assert.deepEqual([p.x, p.z, p.moving], [2, 2, false]);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test test/motion.test.js`
Expected: FAIL (모듈 없음)

- [ ] **Step 3: 구현**

`src/move/motion.js`:

```js
// © 2026 김용현
import { dist, headingOf } from './geom.js';

export const PACES = { slow: 0.7, normal: 1, fast: 1.4 };

function pathLength(pts) {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += dist(pts[i - 1], pts[i]);
  return l;
}

export function goDuration(m) {
  return (pathLength(m.pts) / m.speed) * 1000;
}

export function createMotionMath(courses) {
  function along(pts, s) {
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], l = dist(a, b);
      if (s <= l || i === pts.length - 1) {
        const t = l ? Math.min(1, s / l) : 1;
        return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, heading: headingOf(b[0] - a[0], b[1] - a[1]) };
      }
      s -= l;
    }
  }

  function onCourse(course, offset, speed, elapsedMs) {
    const p = courses.pointOnCourse(course, offset + (speed * Math.max(0, elapsedMs)) / 1000);
    return { x: p.x, z: p.z, heading: p.heading, moving: true, speed };
  }

  function positionAt(m, t) {
    if (m.kind === 'idle') return { x: m.at[0], z: m.at[1], heading: m.face || 0, moving: false, speed: 0 };
    if (m.kind === 'course') return onCourse(m.course, m.offset || 0, m.speed, t - m.t0);
    // go
    const pts = m.pts;
    if (pts.length < 2) return { x: pts[0][0], z: pts[0][1], heading: 0, moving: false, speed: 0 };
    const total = pathLength(pts);
    const s = (m.speed * (t - m.t0)) / 1000;
    if (s <= 0) {
      const p = along(pts, 0);
      return { ...p, moving: false, speed: 0 };
    }
    if (s >= total) {
      if (m.then) return onCourse(m.then.course, m.then.offset || 0, m.speed, t - m.t0 - (total / m.speed) * 1000);
      const p = along(pts, total);
      return { ...p, moving: false, speed: 0 };
    }
    return { ...along(pts, s), moving: true, speed: m.speed };
  }

  return { positionAt, goDuration };
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test test/motion.test.js`
Expected: 8 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/move/motion.js test/motion.test.js
git commit -m "3D: 움직임 기록으로 위치를 계산하는 positionAt"
```

---

### Task 4: 걸을 수 있는 범위와 길 찾기

**Files:**
- Create: `src/move/navgrid.js`, `src/move/world-bounds.js`
- Test: `test/navgrid.test.js`

격자는 1m 칸. 칸 중심이 막힌 다각형(건물) 안이거나, 건물 경계에서 0.5m 안이면 막힌 칸이다. A*는 8방향, 대각선은 양옆 칸이 모두 열려 있을 때만. 결과는 직선으로 볼 수 있는(line of sight) 칸을 건너뛰어 꺾이는 지점만 남기고, 최대 32개로 자른다(넘치면 앞 31개 + 마지막).

- [ ] **Step 1: 실패하는 테스트**

`test/navgrid.test.js`:

```js
// © 2026 김용현
import test from 'node:test';
import assert from 'node:assert/strict';
import { createNavGrid } from '../src/move/navgrid.js';
import { inPoly } from '../src/move/geom.js';

// 40 x 40 m field with a wall block in the middle (x 15..25, z 0..30).
const wall = [[15, 0], [25, 0], [25, 30], [15, 30]];
const grid = createNavGrid({ bounds: { minX: 0, minZ: 0, maxX: 40, maxZ: 40 }, blocked: [wall], cell: 1 });

const crossesWall = (pts) => {
  for (let i = 1; i < pts.length; i++) {
    const [a, b] = [pts[i - 1], pts[i]];
    for (let k = 0; k <= 50; k++) {
      const x = a[0] + ((b[0] - a[0]) * k) / 50, z = a[1] + ((b[1] - a[1]) * k) / 50;
      if (inPoly(x, z, wall)) return true;
    }
  }
  return false;
};

test('walkable reports open and blocked cells', () => {
  assert.equal(grid.walkable(5, 5), true);
  assert.equal(grid.walkable(20, 10), false);
  assert.equal(grid.walkable(-3, 5), false); // outside bounds
});

test('straight path when nothing is in the way', () => {
  const p = grid.findPath([2, 35], [38, 35]);
  assert.equal(p.length, 2);
});

test('path goes around the wall', () => {
  const p = grid.findPath([5, 5], [35, 5]);
  assert.ok(p.length >= 3);
  assert.equal(crossesWall(p), false);
  const last = p[p.length - 1];
  assert.ok(Math.hypot(last[0] - 35, last[1] - 5) < 1);
});

test('target inside a building snaps to the nearest open cell', () => {
  const p = grid.findPath([5, 5], [20, 15]);
  const last = p[p.length - 1];
  assert.equal(grid.walkable(last[0], last[1]), true);
  assert.ok(Math.abs(last[0] - 20) >= 4); // left or right of the wall
});

test('never more than 32 points', () => {
  const p = grid.findPath([1, 1], [39, 1]);
  assert.ok(p.length <= 32);
});

test('returns null when no open cell is reachable', () => {
  const closed = createNavGrid({ bounds: { minX: 0, minZ: 0, maxX: 10, maxZ: 10 }, blocked: [[[0, 4], [10, 4], [10, 6], [0, 6]]], cell: 1 });
  assert.equal(closed.findPath([5, 1], [5, 9]), null);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test test/navgrid.test.js`
Expected: FAIL

- [ ] **Step 3: 구현**

`src/move/navgrid.js`:

```js
// © 2026 김용현
import { inPoly } from './geom.js';

const MAX_PTS = 32;
const PAD = 0.5;

function nearEdge(x, z, ring, pad) {
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, az] = ring[j], [bx, bz] = ring[i];
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
    if (Math.hypot(ax + dx * t - x, az + dz * t - z) < pad) return true;
  }
  return false;
}

export function createNavGrid({ bounds, blocked, cell = 1 }) {
  const W = Math.ceil((bounds.maxX - bounds.minX) / cell);
  const H = Math.ceil((bounds.maxZ - bounds.minZ) / cell);
  const open = new Uint8Array(W * H);
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const x = bounds.minX + (i + 0.5) * cell, z = bounds.minZ + (j + 0.5) * cell;
      open[j * W + i] = blocked.some((r) => inPoly(x, z, r) || nearEdge(x, z, r, PAD)) ? 0 : 1;
    }
  }
  const ci = (x) => Math.floor((x - bounds.minX) / cell);
  const cj = (z) => Math.floor((z - bounds.minZ) / cell);
  const inside = (i, j) => i >= 0 && j >= 0 && i < W && j < H;
  const isOpen = (i, j) => inside(i, j) && open[j * W + i] === 1;
  const center = (i, j) => [bounds.minX + (i + 0.5) * cell, bounds.minZ + (j + 0.5) * cell];

  const walkable = (x, z) => isOpen(ci(x), cj(z));

  function snap(x, z) {
    let i = Math.max(0, Math.min(W - 1, ci(x))), j = Math.max(0, Math.min(H - 1, cj(z)));
    if (isOpen(i, j)) return [i, j];
    for (let r = 1; r < Math.max(W, H); r++) {
      let best = null, bd = Infinity;
      for (let dj = -r; dj <= r; dj++) {
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r || !isOpen(i + di, j + dj)) continue;
          const d = di * di + dj * dj;
          if (d < bd) { bd = d; best = [i + di, j + dj]; }
        }
      }
      if (best) return best;
    }
    return null;
  }

  function lineOpen(a, b) {
    const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (cell * 0.25)) || 1;
    for (let k = 0; k <= n; k++) {
      const x = a[0] + ((b[0] - a[0]) * k) / n, z = a[1] + ((b[1] - a[1]) * k) / n;
      if (!walkable(x, z)) return false;
    }
    return true;
  }

  function astar(s, g) {
    const N = W * H, gScore = new Float32Array(N).fill(Infinity), came = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const heap = []; // [f, idx]
    const push = (f, idx) => { heap.push([f, idx]); let c = heap.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (heap[p][0] <= heap[c][0]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let c = 0; for (;;) { const l = 2 * c + 1, r = l + 1; let m = c; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === c) break; [heap[m], heap[c]] = [heap[c], heap[m]]; c = m; } } return top; };
    const h = (i, j) => { const dx = Math.abs(i - g[0]), dj = Math.abs(j - g[1]); return Math.max(dx, dj) + (Math.SQRT2 - 1) * Math.min(dx, dj); };
    const sIdx = s[1] * W + s[0], gIdx = g[1] * W + g[0];
    gScore[sIdx] = 0; push(h(s[0], s[1]), sIdx);
    while (heap.length) {
      const [, idx] = pop();
      if (closed[idx]) continue;
      if (idx === gIdx) break;
      closed[idx] = 1;
      const i = idx % W, j = (idx / W) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = i + di, nj = j + dj;
        if (!isOpen(ni, nj)) continue;
        if (di && dj && (!isOpen(i + di, j) || !isOpen(i, j + dj))) continue;
        const nIdx = nj * W + ni, cost = gScore[idx] + (di && dj ? Math.SQRT2 : 1);
        if (cost < gScore[nIdx]) { gScore[nIdx] = cost; came[nIdx] = idx; push(cost + h(ni, nj), nIdx); }
      }
    }
    if (gScore[gIdx] === Infinity) return null;
    const cells = [];
    for (let idx = gIdx; idx !== -1; idx = came[idx]) cells.push(center(idx % W, (idx / W) | 0));
    return cells.reverse();
  }

  function simplify(pts) {
    const out = [pts[0]];
    let k = 0;
    while (k < pts.length - 1) {
      let far = k + 1;
      for (let m = pts.length - 1; m > k + 1; m--) if (lineOpen(pts[k], pts[m])) { far = m; break; }
      out.push(pts[far]);
      k = far;
    }
    if (out.length > MAX_PTS) return out.slice(0, MAX_PTS - 1).concat([out[out.length - 1]]);
    return out;
  }

  function findPath(from, to) {
    const s = snap(from[0], from[1]), g = snap(to[0], to[1]);
    if (!s || !g) return null;
    const cells = astar(s, g);
    if (!cells) return null;
    cells[0] = walkable(from[0], from[1]) ? [from[0], from[1]] : cells[0];
    const round = (p) => [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10];
    return simplify(cells).map(round);
  }

  return { walkable, findPath };
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test test/navgrid.test.js`
Expected: 6 tests PASS

- [ ] **Step 5: 실제 학교 범위 모듈**

`src/move/world-bounds.js`:

```js
// © 2026 김용현
// The walkable rectangle covers every course plus a margin, and the campus buildings block it.
import campus from '../data/campus.json' with { type: 'json' };
import courses from '../data/courses.json' with { type: 'json' };

const MARGIN = 25;
const all = Object.values(courses).flat();
export const WORLD_BOUNDS = {
  minX: Math.floor(Math.min(...all.map((p) => p[0])) - MARGIN),
  maxX: Math.ceil(Math.max(...all.map((p) => p[0])) + MARGIN),
  minZ: Math.floor(Math.min(...all.map((p) => p[1])) - MARGIN),
  maxZ: Math.ceil(Math.max(...all.map((p) => p[1])) + MARGIN)
};
// Same rule as the draft: buildings with `base` are raised decks you can walk under.
export const BLOCKED = campus.buildings.filter((b) => !b.base).map((b) => b.ring);
```

참고: Vite 5와 Node 24 모두 `with { type: 'json' }` 가져오기를 지원한다. Vite에서 경고가 나면 `assert` 대신 이 문법을 그대로 둔다.

- [ ] **Step 6: 실제 자료로 속도 확인 테스트 추가**

`test/navgrid.test.js` 끝에 덧붙인다.

```js
import { WORLD_BOUNDS, BLOCKED } from '../src/move/world-bounds.js';

test('real campus grid builds and finds a path quickly', () => {
  const t0 = performance.now();
  const g = createNavGrid({ bounds: WORLD_BOUNDS, blocked: BLOCKED, cell: 1 });
  const built = performance.now() - t0;
  const t1 = performance.now();
  const p = g.findPath([-17.6, 120.8], [-118.5, -30.2]); // track start to campus course start
  const searched = performance.now() - t1;
  assert.ok(p && p.length >= 2);
  assert.ok(built < 1500, `grid took ${built} ms`);
  assert.ok(searched < 150, `search took ${searched} ms`);
});
```

Run: `node --test test/navgrid.test.js`
Expected: 7 tests PASS. 격자 만들기가 1.5초를 넘으면 `nearEdge` 검사를 다각형 경계 상자 안의 칸에만 하도록 고친다.

- [ ] **Step 7: Commit**

```bash
git add src/move/navgrid.js src/move/world-bounds.js test/navgrid.test.js
git commit -m "3D: 걸을 수 있는 땅 격자와 A* 길 찾기"
```

---

### Task 5: 남이 보낸 presence 값 검사

**Files:**
- Create: `src/net/validate.js`
- Test: `test/validate.test.js`

규칙(설계 문서 4절): 좌표는 `WORLD_BOUNDS` 안, 속도 0.3~3, `go` 지점 2~32개, 코스 이름은 알려진 4개, 숫자는 유한수. 이름 12자 자르기, 복장 0~7 아니면 0. 잘못된 motion은 `null`을 돌려주고, 호출하는 쪽이 마지막 정상 위치에 세운다.

- [ ] **Step 1: 실패하는 테스트**

`test/validate.test.js`:

```js
// © 2026 김용현
import test from 'node:test';
import assert from 'node:assert/strict';
import { createValidator } from '../src/net/validate.js';

const v = createValidator({ bounds: { minX: -10, maxX: 10, minZ: -10, maxZ: 10 }, courses: ['track', 'campus'] });

test('accepts good motions', () => {
  assert.ok(v.motion({ kind: 'idle', at: [1, 2], face: 0.5 }));
  assert.ok(v.motion({ kind: 'go', pts: [[0, 0], [5, 5]], speed: 1, t0: 1 }));
  assert.ok(v.motion({ kind: 'go', pts: [[0, 0], [5, 5]], speed: 1, t0: 1, then: { course: 'track', offset: 3 } }));
  assert.ok(v.motion({ kind: 'course', course: 'campus', speed: 1.4, t0: 1, offset: 0 }));
});

test('rejects bad motions', () => {
  const bad = [
    null, 'x', { kind: 'fly' },
    { kind: 'idle', at: [99, 0] },
    { kind: 'idle', at: [NaN, 0] },
    { kind: 'go', pts: [[0, 0]], speed: 1, t0: 1 },
    { kind: 'go', pts: Array.from({ length: 33 }, () => [0, 0]), speed: 1, t0: 1 },
    { kind: 'go', pts: [[0, 0], [5, 5]], speed: 9, t0: 1 },
    { kind: 'go', pts: [[0, 0], [5, 5]], speed: 1, t0: 'now' },
    { kind: 'go', pts: [[0, 0], [5, 5]], speed: 1, t0: 1, then: { course: 'moon' } },
    { kind: 'course', course: 'moon', speed: 1, t0: 1, offset: 0 },
    { kind: 'course', course: 'track', speed: 0.1, t0: 1, offset: 0 }
  ];
  for (const m of bad) assert.equal(v.motion(m), null, JSON.stringify(m));
});

test('motion is copied with only known fields', () => {
  const out = v.motion({ kind: 'idle', at: [1, 2], face: 0, evil: '<script>' });
  assert.deepEqual(Object.keys(out).sort(), ['at', 'face', 'kind']);
});

test('profile trims name and fixes outfit', () => {
  assert.deepEqual(v.profile({ name: '아주아주아주아주긴이름입니다', outfit: 3, joinedAt: 5 }), { name: '아주아주아주아주긴이름입', outfit: 3, joinedAt: 5 });
  assert.deepEqual(v.profile({ name: 7, outfit: 99, joinedAt: 'x' }), { name: '산책자', outfit: 0, joinedAt: 0 });
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test test/validate.test.js`
Expected: FAIL

- [ ] **Step 3: 구현**

`src/net/validate.js`:

```js
// © 2026 김용현
const OUTFITS = 8;
const fin = (n) => typeof n === 'number' && Number.isFinite(n);

export function createValidator({ bounds, courses }) {
  const known = new Set(courses);
  const inB = (p) => Array.isArray(p) && p.length === 2 && fin(p[0]) && fin(p[1]) &&
    p[0] >= bounds.minX && p[0] <= bounds.maxX && p[1] >= bounds.minZ && p[1] <= bounds.maxZ;
  const okSpeed = (s) => fin(s) && s >= 0.3 && s <= 3;
  const okThen = (t) => t === undefined || (t && known.has(t.course) && (t.offset === undefined || fin(t.offset)));

  function motion(m) {
    if (!m || typeof m !== 'object') return null;
    if (m.kind === 'idle') {
      if (!inB(m.at)) return null;
      return { kind: 'idle', at: [m.at[0], m.at[1]], face: fin(m.face) ? m.face : 0 };
    }
    if (m.kind === 'go') {
      if (!Array.isArray(m.pts) || m.pts.length < 2 || m.pts.length > 32 || !m.pts.every(inB)) return null;
      if (!okSpeed(m.speed) || !fin(m.t0) || !okThen(m.then)) return null;
      const out = { kind: 'go', pts: m.pts.map((p) => [p[0], p[1]]), speed: m.speed, t0: m.t0 };
      if (m.then) out.then = { course: m.then.course, offset: fin(m.then.offset) ? m.then.offset : 0 };
      return out;
    }
    if (m.kind === 'course') {
      if (!known.has(m.course) || !okSpeed(m.speed) || !fin(m.t0)) return null;
      return { kind: 'course', course: m.course, speed: m.speed, t0: m.t0, offset: fin(m.offset) ? m.offset : 0 };
    }
    return null;
  }

  function profile(p) {
    const name = typeof p?.name === 'string' && p.name.trim() ? p.name.trim().slice(0, 12) : '산책자';
    const outfit = Number.isInteger(p?.outfit) && p.outfit >= 0 && p.outfit < OUTFITS ? p.outfit : 0;
    const joinedAt = fin(p?.joinedAt) ? p.joinedAt : 0;
    return { name, outfit, joinedAt };
  }

  return { motion, profile };
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test test/validate.test.js`
Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/net/validate.js test/validate.test.js
git commit -m "3D: 다른 접속자 움직임 기록 검사"
```

---

### Task 6: 서버 시각 보정

**Files:**
- Create: `api/time.js`, `src/net/clock.js`
- Test: `test/clock.test.js`

- [ ] **Step 1: 실패하는 테스트**

`test/clock.test.js`:

```js
// © 2026 김용현
import test from 'node:test';
import assert from 'node:assert/strict';
import { pickOffset, syncServerClock } from '../src/net/clock.js';
import handler from '../api/time.js';

test('pickOffset uses the sample with the shortest round trip', () => {
  // sent, received (local ms), server ms
  const off = pickOffset([
    { sent: 0, recv: 400, server: 1300 },  // rtt 400
    { sent: 1000, recv: 1100, server: 2050 } // rtt 100 -> server - (sent + rtt/2) = 2050 - 1050 = 1000
  ]);
  assert.equal(off, 1000);
});

test('pickOffset of nothing is 0', () => {
  assert.equal(pickOffset([]), 0);
});

test('syncServerClock asks three times and survives failures', async () => {
  let n = 0, local = 0;
  const now = () => (local += 10);
  const fetchFn = async () => {
    n++;
    if (n === 2) throw new Error('offline');
    return { ok: true, json: async () => ({ now: 5000 }) };
  };
  const off = await syncServerClock({ fetchFn, now, url: '/api/time' });
  assert.equal(n, 3);
  assert.ok(Number.isFinite(off));
});

test('api/time returns a number', () => {
  let body;
  handler({ method: 'GET' }, { setHeader() {}, status() { return this; }, json(b) { body = b; } });
  assert.equal(typeof body.now, 'number');
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test test/clock.test.js`
Expected: FAIL

- [ ] **Step 3: 구현**

`api/time.js`:

```js
// © 2026 김용현
// Returns the server clock so every walker computes positions on the same timeline.
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ now: Date.now() });
}
```

`src/net/clock.js`:

```js
// © 2026 김용현
export function pickOffset(samples) {
  if (!samples.length) return 0;
  const best = samples.reduce((a, b) => (b.recv - b.sent < a.recv - a.sent ? b : a));
  return Math.round(best.server - (best.sent + (best.recv - best.sent) / 2));
}

// Resolves to (server - local) in ms. Failed tries are skipped; all failing gives 0.
export async function syncServerClock({ fetchFn = fetch, now = Date.now, url = '/api/time', tries = 3 } = {}) {
  const samples = [];
  for (let i = 0; i < tries; i++) {
    const sent = now();
    try {
      const res = await fetchFn(url, { cache: 'no-store' });
      if (!res.ok) continue;
      const { now: server } = await res.json();
      if (Number.isFinite(server)) samples.push({ sent, recv: now(), server });
    } catch { /* try again */ }
  }
  return pickOffset(samples);
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test test/clock.test.js`
Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add api/time.js src/net/clock.js test/clock.test.js
git commit -m "3D: 서버 시각 보정(api/time)"
```

---

### Task 7: 0.5초 뒤처리 묶음

**Files:**
- Create: `src/net/throttle.js`
- Test: `test/throttle.test.js`

첫 호출은 바로 보내고, 0.5초 안의 다음 호출들은 마지막 것만 0.5초가 지난 뒤 보낸다.

- [ ] **Step 1: 실패하는 테스트**

`test/throttle.test.js`:

```js
// © 2026 김용현
import test from 'node:test';
import assert from 'node:assert/strict';
import { throttleLatest } from '../src/net/throttle.js';

test('first call goes now, the burst collapses to the last value', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const sent = [];
  const send = throttleLatest((v) => sent.push(v), 500);
  send(1);
  send(2);
  send(3);
  assert.deepEqual(sent, [1]);
  t.mock.timers.tick(499);
  assert.deepEqual(sent, [1]);
  t.mock.timers.tick(1);
  assert.deepEqual(sent, [1, 3]);
  t.mock.timers.tick(1000);
  send(4);
  assert.deepEqual(sent, [1, 3, 4]);
});

test('cancel drops a pending value', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const sent = [];
  const send = throttleLatest((v) => sent.push(v), 500);
  send(1);
  send(2);
  send.cancel();
  t.mock.timers.tick(600);
  assert.deepEqual(sent, [1]);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test test/throttle.test.js`
Expected: FAIL

- [ ] **Step 3: 구현**

`src/net/throttle.js`:

```js
// © 2026 김용현
export function throttleLatest(fn, ms) {
  let last = -Infinity, timer = null, pending;
  const fire = () => { timer = null; last = Date.now(); fn(pending); };
  const call = (v) => {
    pending = v;
    const wait = last + ms - Date.now();
    if (wait <= 0 && !timer) return fire();
    if (!timer) timer = setTimeout(fire, Math.max(0, wait));
  };
  call.cancel = () => { if (timer) clearTimeout(timer); timer = null; };
  return call;
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test test/throttle.test.js`
Expected: 2 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/net/throttle.js test/throttle.test.js
git commit -m "3D: 움직임 전송 0.5초 묶음"
```

---

### Task 8: 방 고르기

**Files:**
- Create: `src/net/rooms.js`
- Test: `test/rooms.test.js`

`chooseRoom({ start, cap, max, tryJoin })`: `tryJoin(n)`은 `{ others, leave }`를 돌려주는 비동기 함수(`others` = 나를 뺀 인원). `others >= cap`이면 `leave()` 후 다음 번호. 모두 차면 마지막 번호에 머문다. 링크 방(`start`)이 꽉 차서 옮겼으면 `moved: true`.

- [ ] **Step 1: 실패하는 테스트**

`test/rooms.test.js`:

```js
// © 2026 김용현
import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseRoom, roomFromHash } from '../src/net/rooms.js';

const fakeJoin = (counts) => {
  const left = [];
  const tryJoin = async (n) => ({ room: n, others: counts[n] || 0, leave: async () => left.push(n) });
  return { tryJoin, left };
};

test('joins room 1 when there is space', async () => {
  const { tryJoin, left } = fakeJoin({ 1: 5 });
  const r = await chooseRoom({ start: 1, cap: 30, max: 20, tryJoin });
  assert.equal(r.room, 1);
  assert.equal(r.moved, false);
  assert.deepEqual(left, []);
});

test('skips full rooms', async () => {
  const { tryJoin, left } = fakeJoin({ 1: 30, 2: 31, 3: 4 });
  const r = await chooseRoom({ start: 1, cap: 30, max: 20, tryJoin });
  assert.equal(r.room, 3);
  assert.deepEqual(left, [1, 2]);
});

test('link room full moves on and says so', async () => {
  const { tryJoin } = fakeJoin({ 3: 30 });
  const r = await chooseRoom({ start: 3, cap: 30, max: 20, tryJoin });
  assert.equal(r.room, 4);
  assert.equal(r.moved, true);
  assert.equal(r.wanted, 3);
});

test('wraps past max back to 1 and stops after one lap at the last tried room', async () => {
  const counts = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [i + 1, 30]));
  const { tryJoin } = fakeJoin(counts);
  const r = await chooseRoom({ start: 19, cap: 30, max: 20, tryJoin });
  assert.equal(r.room, 18); // 19, 20, 1, ..., 18: every room tried once, stays in the last
});

test('roomFromHash reads #room=N within range', () => {
  assert.equal(roomFromHash('#room=7', 20), 7);
  assert.equal(roomFromHash('#room=0', 20), 1);
  assert.equal(roomFromHash('#room=99', 20), 1);
  assert.equal(roomFromHash('#fps&room=4', 20), 4);
  assert.equal(roomFromHash('', 20), 1);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test test/rooms.test.js`
Expected: FAIL

- [ ] **Step 3: 구현**

`src/net/rooms.js`:

```js
// © 2026 김용현
export const ROOM_CAP = 30;
export const ROOM_MAX = 20;

export function roomFromHash(hash, max = ROOM_MAX) {
  const m = /(?:^#|&)room=(\d+)/.exec(hash || '');
  const n = m ? Number(m[1]) : 1;
  return n >= 1 && n <= max ? n : 1;
}

// Tries rooms in order from `start`, wrapping once. Stays in the last room tried if all are full.
export async function chooseRoom({ start, cap = ROOM_CAP, max = ROOM_MAX, tryJoin }) {
  let joined = null;
  for (let k = 0; k < max; k++) {
    const n = ((start - 1 + k) % max) + 1;
    joined = await tryJoin(n);
    if (joined.others < cap || k === max - 1) {
      return { ...joined, room: n, moved: n !== start, wanted: start };
    }
    await joined.leave();
  }
  return null; // unreachable when max >= 1
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test test/rooms.test.js`
Expected: 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/net/rooms.js test/rooms.test.js
git commit -m "3D: 30명 단위 방 고르기와 #room 링크"
```

---

### Task 9: Supabase 접속 세션

**Files:**
- Create: `src/net/session.js`
- Test: `test/session.test.js` (가짜 Supabase 클라이언트)

**공개 API**

```js
const s = createSession({
  client,            // supabase client 또는 null(혼자 걷기)
  selfId,            // 기기 고유 번호
  profile,           // { name, outfit, joinedAt }
  motion,            // 처음 움직임 기록
  startRoom,         // roomFromHash 결과
  cap,               // 방 정원(기본 30, #cap=3 테스트용)
  validator,         // createValidator 결과
  on: { peers, chat, notice, noticeRequest, status }
});
await s.ready;       // 방에 들어가면 resolve, 값 { room, moved, wanted }
s.setMotion(m)       // 0.5초 묶음으로 presence track
s.setProfile(patch)  // 이름, 복장 바꾸기(바로 track)
s.sendChat(text)
s.sendNotice(envelope) / s.requestNotice()
s.leave()
```

- `on.peers(list)`: `[{ id, name, outfit, joinedAt, motion }]`, 나는 빼고, 검사 통과한 것만. motion이 검사에서 떨어지면 `motion: null`(호출 쪽이 마지막 정상 위치에 세움).
- `on.status(s)`: `'connecting' | 'online' | 'reconnecting' | 'solo'`.
- 채널 이름: 방 `mealnstroll-room-N`, 공지 `mealnstroll-notice`.
- 재연결: 방 채널 상태가 `CHANNEL_ERROR`, `TIMED_OUT`, `CLOSED`가 되면 `status('reconnecting')`를 알리고, 2초 뒤 같은 방 채널을 다시 만들어 subscribe 후 마지막 상태를 track한다. 그동안 peers 목록은 비우지 않는다.

- [ ] **Step 1: 가짜 클라이언트와 실패하는 테스트**

`test/session.test.js`:

```js
// © 2026 김용현
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession } from '../src/net/session.js';
import { createValidator } from '../src/net/validate.js';

// Minimal stand-in for supabase-js realtime channels.
function fakeClient(occupants = {}) {
  const channels = [];
  return {
    channels,
    channel(name, opts) {
      const handlers = [];
      const ch = {
        name, opts, tracked: [], sent: [], removed: false,
        on(type, filter, cb) { handlers.push({ type, filter, cb }); return ch; },
        subscribe(cb) { setTimeout(() => { cb('SUBSCRIBED'); ch.emitSync(); }, 0); return ch; },
        presenceState() {
          const n = Number((name.match(/room-(\d+)/) || [])[1]);
          const state = {};
          for (let i = 0; i < (occupants[n] || 0); i++) state['p' + i] = [{ name: 'p' + i, outfit: 1, joinedAt: 1, motion: { kind: 'idle', at: [0, 0], face: 0 } }];
          return state;
        },
        emitSync() { handlers.filter((h) => h.type === 'presence' && h.filter.event === 'sync').forEach((h) => h.cb()); },
        emitBroadcast(event, payload) { handlers.filter((h) => h.type === 'broadcast' && h.filter.event === event).forEach((h) => h.cb({ payload })); },
        async track(v) { ch.tracked.push(v); },
        async send(m) { ch.sent.push(m); },
        async unsubscribe() { ch.removed = true; }
      };
      channels.push(ch);
      return ch;
    },
    removeChannel(ch) { ch.removed = true; }
  };
}

const validator = createValidator({ bounds: { minX: -500, maxX: 500, minZ: -500, maxZ: 500 }, courses: ['track'] });
const base = (client, extra = {}) => createSession({
  client, selfId: 'me', profile: { name: '나', outfit: 0, joinedAt: 1 },
  motion: { kind: 'idle', at: [0, 0], face: 0 }, startRoom: 1, cap: 3, validator, on: {}, ...extra
});

test('joins the first room with space and listens to the notice channel', async () => {
  const client = fakeClient({ 1: 3, 2: 1 });
  const s = base(client);
  const r = await s.ready;
  assert.equal(r.room, 2);
  const names = client.channels.map((c) => c.name);
  assert.ok(names.includes('mealnstroll-notice'));
  assert.equal(client.channels.find((c) => c.name === 'mealnstroll-room-1').removed, true);
  s.leave();
});

test('peers exclude me and pass through the validator', async () => {
  const client = fakeClient({ 1: 2 });
  let got = null;
  const s = base(client, { on: { peers: (l) => { got = l; } } });
  await s.ready;
  assert.equal(got.length, 2);
  assert.deepEqual(Object.keys(got[0]).sort(), ['id', 'joinedAt', 'motion', 'name', 'outfit']);
  s.leave();
});

test('setMotion tracks profile plus motion', async () => {
  const client = fakeClient({});
  const s = base(client);
  await s.ready;
  const room = client.channels.find((c) => c.name === 'mealnstroll-room-1');
  s.setMotion({ kind: 'idle', at: [3, 3], face: 0 });
  const last = room.tracked[room.tracked.length - 1];
  assert.deepEqual(last.motion.at, [3, 3]);
  assert.equal(last.name, '나');
  s.leave();
});

test('notice broadcast reaches on.notice', async () => {
  const client = fakeClient({});
  let n = null;
  const s = base(client, { on: { notice: (p) => { n = p; } } });
  await s.ready;
  client.channels.find((c) => c.name === 'mealnstroll-notice').emitBroadcast('notice', { body: 'x', sig: 'y' });
  assert.deepEqual(n, { body: 'x', sig: 'y' });
  s.leave();
});

test('no client means solo mode', async () => {
  const statuses = [];
  const s = base(null, { on: { status: (x) => statuses.push(x) } });
  const r = await s.ready;
  assert.equal(r.room, 0);
  assert.deepEqual(statuses, ['solo']);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test test/session.test.js`
Expected: FAIL

- [ ] **Step 3: 구현**

`src/net/session.js`:

```js
// © 2026 김용현
// The only module that talks to Supabase. Swap this file to move to another backend.
// supabase-js allows one subscribe() per channel, so drops are routed through `dropHandler`.
import { chooseRoom, ROOM_CAP, ROOM_MAX } from './rooms.js';
import { throttleLatest } from './throttle.js';

const ROOM = (n) => `mealnstroll-room-${n}`;
const NOTICE = 'mealnstroll-notice';
const SYNC_WAIT = 3000;
const RETRY_MS = 2000;
const DROPPED = new Set(['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED']);

export function createSession({ client, selfId, profile, motion, startRoom = 1, cap = ROOM_CAP, validator, on = {} }) {
  let me = { ...profile, motion };
  let roomCh = null, noticeCh = null, room = 0, closed = false, retrying = false;
  let dropHandler = () => {};
  const status = (s) => on.status?.(s);

  if (!client) {
    status('solo');
    return {
      ready: Promise.resolve({ room: 0, moved: false, wanted: startRoom }),
      setMotion(m) { me.motion = m; }, setProfile(p) { me = { ...me, ...p }; },
      sendChat(text) { on.chat?.({ id: selfId, name: me.name, text, at: Date.now(), self: true }); },
      sendNotice() {}, requestNotice() {}, leave() {}
    };
  }

  function peersFrom(ch) {
    const state = ch.presenceState(), list = [];
    for (const id of Object.keys(state)) {
      if (id === selfId || !state[id]?.length) continue;
      const raw = state[id][0];
      list.push({ id, ...validator.profile(raw), motion: validator.motion(raw.motion) });
    }
    return list;
  }

  function openRoom(n, onFirstSync) {
    const ch = client.channel(ROOM(n), { config: { presence: { key: selfId }, broadcast: { self: false, ack: false } } });
    let synced = false;
    ch.on('presence', { event: 'sync' }, () => {
      const list = peersFrom(ch);
      if (!synced) { synced = true; onFirstSync?.(list); }
      on.peers?.(list);
    });
    ch.on('broadcast', { event: 'chat' }, ({ payload }) => {
      if (payload && payload.id !== selfId && typeof payload.text === 'string') on.chat?.({ ...payload, text: payload.text.slice(0, 200) });
    });
    ch.subscribe((s) => {
      if (s === 'SUBSCRIBED') ch.track(me);
      else if (DROPPED.has(s) && ch === roomCh) dropHandler();
    });
    return ch;
  }

  function tryJoin(n) {
    return new Promise((resolve) => {
      let done = false, timer = null;
      function finish(list) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve({ others: list.length, leave: async () => { client.removeChannel(ch); } });
      }
      const ch = openRoom(n, finish);
      roomCh = ch;
      timer = setTimeout(() => finish(peersFrom(ch)), SYNC_WAIT);
    });
  }

  function reconnect() {
    if (closed || retrying) return;
    retrying = true;
    status('reconnecting');
    setTimeout(() => {
      retrying = false;
      if (closed) return;
      const old = roomCh;
      roomCh = null;              // so the old channel's CLOSED does not loop back here
      if (old) client.removeChannel(old);
      roomCh = openRoom(room, () => status('online'));
    }, RETRY_MS);
  }

  status('connecting');
  noticeCh = client.channel(NOTICE, { config: { broadcast: { self: false, ack: false } } });
  noticeCh.on('broadcast', { event: 'notice' }, ({ payload }) => on.notice?.(payload || null));
  noticeCh.on('broadcast', { event: 'notice-request' }, ({ payload }) => { if (payload?.id !== selfId) on.noticeRequest?.(payload); });
  noticeCh.subscribe(() => {});

  const ready = chooseRoom({ start: startRoom, cap, max: ROOM_MAX, tryJoin }).then((r) => {
    room = r.room;
    dropHandler = reconnect;
    status('online');
    return { room: r.room, moved: r.moved, wanted: r.wanted };
  });

  const pushMotion = throttleLatest(() => roomCh?.track(me), 500);

  return {
    ready,
    setMotion(m) { me = { ...me, motion: m }; pushMotion(); },
    setProfile(p) { me = { ...me, ...p }; roomCh?.track(me); },
    sendChat(text) {
      const payload = { id: selfId, name: me.name, text: String(text).slice(0, 200), at: Date.now() };
      roomCh?.send({ type: 'broadcast', event: 'chat', payload });
      on.chat?.({ ...payload, self: true });
    },
    sendNotice(envelope) { noticeCh.send({ type: 'broadcast', event: 'notice', payload: envelope }); },
    requestNotice() { noticeCh.send({ type: 'broadcast', event: 'notice-request', payload: { id: selfId } }); },
    leave() {
      closed = true;
      dropHandler = () => {};
      pushMotion.cancel();
      if (roomCh) client.removeChannel(roomCh);
      if (noticeCh) client.removeChannel(noticeCh);
    }
  };
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test test/session.test.js`
Expected: 5 tests PASS

- [ ] **Step 5: 전체 테스트**

Run: `npm test`
Expected: 기존 8개 포함 전부 PASS

- [ ] **Step 6: Commit**

```bash
git add src/net/session.js test/session.test.js
git commit -m "3D: Supabase 방 채널, 공지 채널, 재연결 세션"
```

---

### Task 10: 화질 결정

**Files:**
- Create: `src/quality.js`
- Test: `test/quality.test.js`

- [ ] **Step 1: 실패하는 테스트**

`test/quality.test.js`:

```js
// © 2026 김용현
import test from 'node:test';
import assert from 'node:assert/strict';
import { decideQuality, QUALITY } from '../src/quality.js';

test('saved choice wins', () => {
  assert.equal(decideQuality({ saved: 'high', fps: 10, mobile: true }), 'high');
  assert.equal(decideQuality({ saved: 'low', fps: 120, mobile: false }), 'low');
});

test('desktop under 50 fps goes light', () => {
  assert.equal(decideQuality({ saved: null, fps: 49, mobile: false }), 'low');
  assert.equal(decideQuality({ saved: null, fps: 55, mobile: false }), 'high');
});

test('phone under 30 fps goes light', () => {
  assert.equal(decideQuality({ saved: null, fps: 29, mobile: true }), 'low');
  assert.equal(decideQuality({ saved: null, fps: 40, mobile: true }), 'high');
});

test('settings for each level', () => {
  assert.deepEqual(QUALITY.low, { shadows: false, treeShare: 0.5, maxDpr: 1 });
  assert.deepEqual(QUALITY.high, { shadows: true, treeShare: 1, maxDpr: 2 });
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test test/quality.test.js`
Expected: FAIL

- [ ] **Step 3: 구현**

`src/quality.js`:

```js
// © 2026 김용현
export const QUALITY = {
  high: { shadows: true, treeShare: 1, maxDpr: 2 },
  low: { shadows: false, treeShare: 0.5, maxDpr: 1 }
};
const KEY = 'mealnstroll.quality';

export function decideQuality({ saved, fps, mobile }) {
  if (saved === 'high' || saved === 'low') return saved;
  return fps < (mobile ? 30 : 50) ? 'low' : 'high';
}

export function loadSavedQuality() {
  try { return localStorage.getItem(KEY); } catch { return null; }
}
export function saveQuality(v) {
  try { localStorage.setItem(KEY, v); } catch { /* fine without it */ }
}

// Counts frames for `ms` and resolves to the average fps.
export function measureFps(ms = 3000) {
  return new Promise((resolve) => {
    let frames = 0;
    const start = performance.now();
    const tick = (t) => {
      frames++;
      if (t - start < ms) requestAnimationFrame(tick);
      else resolve((frames * 1000) / (t - start));
    };
    requestAnimationFrame(tick);
  });
}

export const isMobile = () => matchMedia('(pointer: coarse)').matches;
```

- [ ] **Step 4: 통과 확인**

Run: `node --test test/quality.test.js`
Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/quality.js test/quality.test.js
git commit -m "3D: 화면 속도로 고화질과 가벼운 화면 결정"
```

---

### Task 11: 하늘 시각, 계절, 날씨 해석 (순수 함수)

**Files:**
- Create: `src/world/sky-clock.js`
- Test: `test/sky-clock.test.js`
- 출처: `reference/sian.html` 1748~1799줄 (`kindOfCode`, `seoulDate`, `sunTimes`, `skyAt`, `resolveWorld`의 계산 부분)

DOM, three, `state`에 기대지 않게 인자로 받는다.

- [ ] **Step 1: 실패하는 테스트**

`test/sky-clock.test.js`:

```js
// © 2026 김용현
import test from 'node:test';
import assert from 'node:assert/strict';
import { kindOfCode, sunTimes, skyAt, seoulParts, skyNow, resolveWorld } from '../src/world/sky-clock.js';

test('weather codes', () => {
  assert.equal(kindOfCode(0), 'clear');
  assert.equal(kindOfCode(3), 'cloudy');
  assert.equal(kindOfCode(45), 'fog');
  assert.equal(kindOfCode(73), 'snow');
  assert.equal(kindOfCode(61), 'rain');
});

test('sun rises before it sets, near 6-7 am in June', () => {
  const t = sunTimes(172);
  assert.ok(t.rise > 4.5 * 60 && t.rise < 6 * 60, String(t.rise));
  assert.ok(t.set > 19 * 60 && t.set < 20.5 * 60, String(t.set));
});

test('skyAt picks day, sunset, night', () => {
  const t = { rise: 360, set: 1140 };
  assert.equal(skyAt(720, t), 'day');
  assert.equal(skyAt(1100, t), 'sunset');
  assert.equal(skyAt(60, t), 'night');
  assert.equal(skyAt(370, t), 'dawn');
});

test('seoulParts shifts UTC by 9 hours', () => {
  const p = seoulParts(Date.UTC(2026, 11, 24, 15, 30)); // 00:30 on the 25th in Seoul
  assert.deepEqual([p.m, p.d, p.minute], [12, 25, 30]);
});

test('skyNow maps dawn to sunset sky with a dawn flag', () => {
  const r = skyNow(Date.UTC(2026, 5, 21, 20, 20)); // 05:20 KST, around sunrise in June
  assert.equal(r.time, 'sunset');
  assert.equal(r.dawn, true);
});

test('resolveWorld: live snow, winter, christmas', () => {
  const w = resolveWorld({ ms: Date.UTC(2026, 11, 24, 3), live: { code: 73, wind: 5, depth: 0 } });
  assert.deepEqual(w, { kind: 'snow', cover: 1, wind: 5, season: 'winter', xmas: true });
});

test('resolveWorld: lying snow from depth only', () => {
  const w = resolveWorld({ ms: Date.UTC(2026, 0, 10, 3), live: { code: 0, wind: 3, depth: 0.006 } });
  assert.equal(w.cover, 1);
  assert.equal(w.kind, 'clear');
});

test('resolveWorld: no live data is clear and season by date', () => {
  const w = resolveWorld({ ms: Date.UTC(2026, 9, 15, 3), live: null });
  assert.deepEqual(w, { kind: 'clear', cover: 0, wind: 10, season: 'autumn', xmas: false });
});

test('resolveWorld: preview overrides from #wx and #season', () => {
  const w = resolveWorld({ ms: Date.UTC(2026, 6, 1, 3), live: null, wxMode: 'snow', seasonMode: 'winter' });
  assert.deepEqual([w.kind, w.cover, w.season], ['snow', 1, 'winter']);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test test/sky-clock.test.js`
Expected: FAIL

- [ ] **Step 3: 구현**

`src/world/sky-clock.js` (시안 1748~1799줄에서 옮김. `snow_depth`는 m 단위라 0.005 = 0.5cm):

```js
// © 2026 김용현
const LAT = 37.53, LON = 126.87, rad = Math.PI / 180;

export function kindOfCode(c) {
  if (c <= 1) return 'clear';
  if (c <= 3) return 'cloudy';
  if (c === 45 || c === 48) return 'fog';
  if ((c >= 71 && c <= 77) || c === 85 || c === 86) return 'snow';
  return 'rain';
}

export function seoulParts(ms) {
  const d = new Date(ms + 9 * 3600 * 1000);
  const day = Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(d.getUTCFullYear(), 0, 0)) / 86400000);
  return { m: d.getUTCMonth() + 1, d: d.getUTCDate(), day, minute: d.getUTCHours() * 60 + d.getUTCMinutes() };
}

export function sunTimes(dayOfYear) {
  const B = ((dayOfYear - 81) * 360 / 365) * rad;
  const eqTime = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
  const decl = 23.44 * rad * Math.sin(B);
  const cosH = (Math.sin(-0.833 * rad) - Math.sin(LAT * rad) * Math.sin(decl)) / (Math.cos(LAT * rad) * Math.cos(decl));
  const halfDay = (Math.acos(cosH) / rad) * 4;
  const noon = 720 - 4 * (LON - 135) - eqTime;
  return { rise: noon - halfDay, set: noon + halfDay };
}

export function skyAt(minute, sunT) {
  if (minute >= sunT.set - 70 && minute <= sunT.set + 25) return 'sunset';
  if (minute >= sunT.rise - 25 && minute <= sunT.rise + 35) return 'dawn';
  return minute > sunT.rise && minute < sunT.set ? 'day' : 'night';
}

// The sky for the real Seoul time. Dawn uses the sunset sky, flagged so lights can differ.
export function skyNow(ms) {
  const p = seoulParts(ms);
  const sky = skyAt(p.minute, sunTimes(p.day));
  return { time: sky === 'dawn' ? 'sunset' : sky, dawn: sky === 'dawn' };
}

export function resolveWorld({ ms, live, wxMode = 'live', seasonMode = 'date' }) {
  const now = seoulParts(ms);
  const dateSeason = now.m >= 3 && now.m <= 5 ? 'spring' : now.m >= 6 && now.m <= 9 ? 'summer' : now.m >= 10 && now.m <= 11 ? 'autumn' : 'winter';
  const dateXmas = now.m === 12 && (now.d === 24 || now.d === 25);
  let kind, cover, wind = 10;
  if (wxMode === 'live') {
    kind = live ? kindOfCode(live.code) : 'clear';
    cover = kind === 'snow' || (live && live.depth >= 0.005) ? 1 : 0;
    if (live) wind = live.wind;
  } else if (wxMode === 'xmas') { kind = 'snow'; cover = 1; } else { kind = wxMode; cover = wxMode === 'snow' ? 1 : 0; }
  const season = seasonMode !== 'date' ? seasonMode : wxMode === 'xmas' ? 'winter' : dateSeason;
  return { kind, cover, wind, season, xmas: dateXmas || wxMode === 'xmas' };
}

export const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast?latitude=37.53&longitude=126.87&current=temperature_2m,weather_code,wind_speed_10m,snow_depth&timezone=Asia%2FSeoul&forecast_days=1';

export async function fetchLiveWeather(fetchFn = fetch) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 7000);
  try {
    const res = await fetchFn(WEATHER_URL, { signal: ctl.signal });
    if (!res.ok) throw new Error('status ' + res.status);
    const c = (await res.json()).current;
    return { code: c.weather_code, temp: c.temperature_2m, wind: c.wind_speed_10m, depth: c.snow_depth || 0 };
  } finally {
    clearTimeout(timer);
  }
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test test/sky-clock.test.js`
Expected: 9 tests PASS. `skyNow` 새벽 테스트가 떨어지면 6월 21일 서울 일출(약 05:11)을 기준으로 시각을 05:00~05:40 사이로 조정한다.

- [ ] **Step 5: Commit**

```bash
git add src/world/sky-clock.js test/sky-clock.test.js
git commit -m "3D: 해 뜨고 지는 시각, 계절, 날씨 해석"
```

---

### Task 12: 3D 세계 옮기기 (`src/world/world.js`)

**Files:**
- Create: `src/world/world.js`
- 출처: `reference/sian.html`

시안의 IIFE(179~3999줄) 가운데 "세계"에 해당하는 부분을 하나의 모듈 함수 `createWorld`로 옮긴다. 옮기는 동안 코드 내용은 바꾸지 않는 것이 원칙이고, 아래 "바꿀 점"만 바꾼다.

**옮길 줄 범위 (그대로 복사)**

| 시안 줄 | 내용 |
|---|---|
| 192~204 | renderer, scene, camera 만들기 (canvas는 인자) |
| 206~240 | `STYLES`(illust만 남기고 real, diorama 삭제), `TIMES` |
| 242~318 | 기하 도우미(`seeded`, `inPoly`는 `../move/geom.js`에서 import, `lowerRing`, `groundY`, `heightAt`, `groundBuildings`, `inBuilding`, `lineBlocked`, `area`, `shapeOf`, `flatGeo`, `wallGeo`, `ribbonGeo`) |
| 319~415 | 텍스처 |
| 416~510 | 하늘, 빛, 별, 구름, 날씨 uniform, `weatherize` |
| 511~776 | 나무 |
| 777~1316 | 학교와 크리스마스 (`buildCampus`) |
| 1663~1667 | 클릭 표시(marker) |
| 1668~1683 | 낙엽, faceLight |
| 1684~1729 | 비와 눈 |
| 1831~1873 | `GREY`, `GLOOM`, `FOGGY`, `mixHex`, `applyTime` |
| 2075~2142 중 낙엽, 강수, 크리스마스 깜빡임, 구름, 안개, 하늘·별 위치 갱신 부분 | 매 프레임 세계 갱신 |

**옮기지 않는 것:** 사람(1317~1662, Task 13), 상태와 hash(1730~1747), `kindOfCode`~`loadWeather`(Task 11에서 순수 함수로), 코스 선(1876~1903, Task 14), 조작(1904~2030, Task 14), `step`과 카메라(2036~2143, Task 14), 미니게임(2144~3961), 시작 코드(3962~3999).

**바꿀 점**
1. 맨 위: `import * as THREE from 'three';`, `import campus from '../data/campus.json';`, `import courses from '../data/courses.json';`, `import { inPoly } from '../move/geom.js';`, `import { resolveWorld, skyNow } from './sky-clock.js';`. 시안의 전역 `D`는 `campus`, `COURSES`는 `courses`로 바꾼다(`const D = campus; const COURSES = courses;` 두 줄을 두면 본문 수정이 필요 없다).
2. `THREE.ColorManagement.legacyMode = false;` 등 0.147 API는 그대로 둔다(three 0.147.0 고정).
3. `state`를 쓰는 곳은 함수 안 지역 객체 `const view = { style: 'illust', time: 'day', dawn: false, timeMode: 'now', mode: 'walk', world: null, fogBase: 0.001 }`로 바꾸고, `state.view`는 `view.mode`로 바꾼다. 시안의 `state.style`은 항상 `'illust'`.
4. `applyTime()` 안의 `resolveWorld()` 호출은 `resolveWorld({ ms: Date.now(), live: view.live, wxMode: view.wxMode, seasonMode: view.seasonMode })`로, `showWeatherStatus(W)`는 `onWeather?.(W, view.live)` 콜백으로 바꾼다. `me.userData.hat`, `others` 처리 줄은 지우고, 대신 `W.xmas`를 반환값에 담는다(캐릭터 모자는 main이 처리).
5. `reduced`는 인자로 받는다.
6. 화질: `setQuality(q)`에서 `renderer.shadowMap.enabled = q.shadows`, `renderer.setPixelRatio(Math.min(devicePixelRatio || 1, q.maxDpr))`, 나무 `InstancedMesh`의 `count`를 원래 개수 × `q.treeShare`로 줄인다. 원래 개수는 `buildCampus`의 `instance()`(1104줄 근처)에서 만든 메시마다 `mesh.userData.full = list.length`로 기록해 둔다. 그림자 설정을 바꾼 뒤에는 모든 재질에 `needsUpdate = true`.

**반환 API**

```js
export function createWorld({ canvas, reduced = false, onWeather }) {
  // ... 옮긴 코드 ...
  return {
    renderer, scene, camera, marker,
    heightAt, inBuilding, groundMeshes: () => groundMeshes, blockers: () => blockers,
    setTimeMode(mode) { view.timeMode = mode; syncSky(); applyTime(); },     // 'now'|'day'|'sunset'|'night'
    setPreview({ wxMode, seasonMode }) { Object.assign(view, { wxMode, seasonMode }); applyTime(); },
    setLive(live) { view.live = live; applyTime(); },
    setViewMode(m) { view.mode = m; },                                        // 'walk'|'face'|'aerial'
    setQuality(q) { /* 바꿀 점 6 */ },
    tickClock() { if (syncSky()) applyTime(); },                              // 1분마다 main이 부름
    frame(dt, t, look) { /* 낙엽, 강수, 구름, 크리스마스, 안개, 하늘 위치 */ },
    resize(w, h) { /* 시안 2019~2028줄의 renderer, camera 부분 */ },
    get xmas() { return !!(view.world && view.world.xmas); }
  };
}
```

`syncSky()`는 시안 `syncClock()`(1775줄)을 `skyNow(Date.now())`로 다시 쓴 것: `timeMode`가 `'now'`가 아니면 `view.time = view.timeMode`, 맞으면 `skyNow` 결과로 `view.time`, `view.dawn`을 바꾸고 바뀌었는지 반환.

`frame`의 `look`은 낙엽이 떨어질 중심(카메라가 보는 점)이다. 시안 `finishFrame`의 `look` 변수와 같다.

- [ ] **Step 1: 줄 범위대로 복사해 `src/world/world.js` 작성**

시안 파일에서 위 표의 줄 범위를 순서대로 복사하고 "바꿀 점"을 적용한다. 줄 번호는 `sed -n 'A,Bp' reference/sian.html`로 꺼내 확인한다(177번 줄은 46,000자짜리 COURSES 한 줄이므로 열지 않는다).

- [ ] **Step 2: 임시 확인용 main**

`src/walk3d/main.js`를 임시로 다음처럼 둔다.

```js
// © 2026 김용현
import { createWorld } from '../world/world.js';

const world = createWorld({ canvas: document.getElementById('c'), onWeather: (w) => console.log('weather', w) });
const fit = () => world.resize(innerWidth, innerHeight);
addEventListener('resize', fit);
fit();
world.setViewMode('aerial');
world.camera.position.set(250, 260, 250);
world.camera.lookAt(-55, 0, 40);
const params = new URLSearchParams(location.hash.slice(1));
if (params.get('time')) world.setTimeMode(params.get('time'));
if (params.get('wx') || params.get('season')) world.setPreview({ wxMode: params.get('wx') || 'live', seasonMode: params.get('season') || 'date' });
let last = performance.now();
world.renderer.setAnimationLoop((now) => {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  world.frame(dt, now / 1000, { x: -55, y: 0, z: 40 });
  world.renderer.render(world.scene, world.camera);
  window.__frames = (window.__frames || 0) + 1;
});
```

- [ ] **Step 3: 헤드리스 스크린샷 스크립트**

`scripts/shot.mjs`:

```js
// © 2026 김용현
// Usage: node scripts/shot.mjs <url> <out.png> [width] [height]
// Serves nothing itself: start `npx vite preview --port 4173` (after a build) first.
import { execFileSync } from 'node:child_process';
const [url, out, w = '1280', h = '800'] = process.argv.slice(2);
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const profile = `${process.env.TEMP}/mns-shot-${Date.now()}`; // fresh profile: no stale cache
execFileSync(chrome, [
  '--headless=new', '--disable-gpu', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--hide-scrollbars', `--user-data-dir=${profile}`, `--window-size=${w},${h}`,
  '--virtual-time-budget=15000', `--screenshot=${out}`, url
], { stdio: 'inherit' });
console.log('saved', out);
```

- [ ] **Step 4: 빌드하고 네 장면 찍기**

Run:
```bash
npx vite build --emptyOutDir=false
npx vite preview --port 4173 &   # 백그라운드로 띄운다
node scripts/shot.mjs "http://localhost:4173/walk3d.html#time=day" shots/day.png
node scripts/shot.mjs "http://localhost:4173/walk3d.html#time=sunset" shots/sunset.png
node scripts/shot.mjs "http://localhost:4173/walk3d.html#time=night" shots/night.png
node scripts/shot.mjs "http://localhost:4173/walk3d.html#time=day&wx=snow&season=winter" shots/snow.png
```
Expected: 네 장 모두 학교 건물, 트랙, 나무가 보이고 하늘색이 시각에 맞게 다르다. Read 도구로 png를 열어 눈으로 확인한다. `shots/`는 `.gitignore`에 추가한다.

- [ ] **Step 5: 콘솔 오류 확인**

브라우저(`npm run dev` 후 `http://localhost:5173/walk3d.html`)에서 콘솔 오류가 없는지 본다. 헤드리스로는 `--enable-logging=stderr --v=0` 출력에서 `Uncaught`가 없는지 본다.

- [ ] **Step 6: Commit**

```bash
git add src/world/world.js src/walk3d/main.js scripts/shot.mjs .gitignore
git commit -m "3D: 시안의 학교 풍경을 world 모듈로 옮김"
```

---

### Task 13: 캐릭터 옮기기 (`src/avatar/person.js`)

**Files:**
- Create: `src/avatar/person.js`
- 출처: `reference/sian.html` 1317~1605줄(사람), 1637~1647줄(`LOOKS`, `PERSON_SCALE`)

**바꿀 점**
1. `import * as THREE from 'three';`
2. `toonRamp`, `toon`, `capsule`, `makePerson`, `poseLeg`, `animatePerson`, `LOOKS`, `PERSON_SCALE`를 export 한다.
3. `animatePerson(p, dt, speed)` 안에서 `state`나 `camera`를 쓰는 곳이 있으면 인자로 받는다(시선 처리에 카메라 위치가 필요하면 `animatePerson(p, dt, speed, camPos)`로 넓힌다).
4. 먼 거리 단순 모양: `makeFarPerson(look)` 추가. 몸통 캡슐 1개(`look.top` 색) + 머리 구 1개(`look.skin`), 그림자 끔. `PERSON_SCALE` 그대로.

```js
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
```

(three 0.147에 `CapsuleGeometry`가 있다. 없으면 `CylinderGeometry(0.17, 0.17, 0.75, 8)`로 바꾼다.)

5. 크리스마스 모자: `makePerson`이 만드는 `userData.hat`를 그대로 쓴다.

- [ ] **Step 1: 옮기기**

위 줄 범위를 복사하고 바꿀 점을 적용해 `src/avatar/person.js`를 만든다.

- [ ] **Step 2: 확인용으로 main에 캐릭터 8명 세우기**

Task 12의 임시 main에 덧붙인다.

```js
import { makePerson, animatePerson, LOOKS, PERSON_SCALE } from '../avatar/person.js';
const crowd = LOOKS.map((look, i) => {
  const p = makePerson(look, PERSON_SCALE);
  p.position.set(-40 + i * 1.2, world.heightAt(-40 + i * 1.2, 100) + 0.13, 100);
  world.scene.add(p);
  return p;
});
// 루프 안: crowd.forEach((p) => animatePerson(p, dt, 1));
// 카메라: world.camera.position.set(-36, 2.2, 106); world.camera.lookAt(-36, 0.8, 100);
```

- [ ] **Step 3: 스크린샷**

Run: `npx vite build --emptyOutDir=false` 후 `node scripts/shot.mjs "http://localhost:4173/walk3d.html#time=day" shots/people.png`
Expected: 복장이 다른 2.5등신 캐릭터 8명이 걷는 자세로 서 있다. 발이 땅에 붙어 있다.

- [ ] **Step 4: Commit**

```bash
git add src/avatar/person.js src/walk3d/main.js
git commit -m "3D: 캐릭터와 걷기 동작을 avatar 모듈로 옮김"
```

---

### Task 14: 이어 붙이기 (내 캐릭터, 클릭 이동, 산책 참여, 다른 사람, 카메라)

**Files:**
- Modify: `src/walk3d/main.js` (임시 코드를 지우고 새로 작성)
- 출처: `reference/sian.html` 1876~1903줄(코스 선), 1955~2018줄(포인터, 확대, 탭), 2036~2143줄(`step`, `finishFrame`의 카메라 부분, `angLerp`)

**main.js 구성 (순서대로)**

1. 가져오기와 준비

```js
// © 2026 김용현
import * as THREE from 'three';
import { createWorld } from '../world/world.js';
import { makePerson, makeFarPerson, animatePerson, LOOKS, PERSON_SCALE } from '../avatar/person.js';
import courseRings from '../data/courses.json';
import { makeCourses } from '../move/courses.js';
import { createMotionMath, PACES, goDuration } from '../move/motion.js';
import { createNavGrid } from '../move/navgrid.js';
import { WORLD_BOUNDS, BLOCKED } from '../move/world-bounds.js';
import { createValidator } from '../net/validate.js';
import { syncServerClock } from '../net/clock.js';
import { roomFromHash } from '../net/rooms.js';
import { createSession } from '../net/session.js';
import { supabase } from '../supabase.js';
import { decideQuality, loadSavedQuality, saveQuality, measureFps, isMobile, QUALITY } from '../quality.js';
import { fetchLiveWeather } from '../world/sky-clock.js';
import { createUI } from './ui.js';

const courses = makeCourses(courseRings);
const { positionAt } = createMotionMath(courses);
const grid = createNavGrid({ bounds: WORLD_BOUNDS, blocked: BLOCKED, cell: 1 });
const validator = createValidator({ bounds: WORLD_BOUNDS, courses: courses.keys });
const params = new URLSearchParams(location.hash.slice(1).replace(/^room=\d+&?/, ''));
let clockOffset = 0;
const serverNow = () => Date.now() + clockOffset;
```

2. WebGL이 없으면 안내만 띄우고 끝낸다.

```js
let world, ui; // `ui` is assigned in step 9
try {
  world = createWorld({ canvas: document.getElementById('c'), reduced: matchMedia('(prefers-reduced-motion: reduce)').matches, onWeather: (w, live) => ui?.showWeather(w, live) }); // ui is created later; createWorld may call this first
} catch (e) {
  document.body.insertAdjacentHTML('beforeend', '<div class="err">이 기기에서는 3D가 열리지 않아요.</div>');
  throw e;
}
```

3. 나의 신원: `selfId`는 기존 키 `mealnstroll.id`를 그대로 읽고 없으면 `crypto.randomUUID()`로 만든다. 이름과 복장은 `mealnstroll.name`, `mealnstroll.outfit`. 이름이 없으면 UI가 처음에 묻는다(Task 15).

4. 내 움직임 상태

```js
let myMotion = (() => {
  const offset = courses.track.loop * 0.42; // draft start point on the track
  return { kind: 'course', course: 'track', speed: PACES.normal, t0: serverNow(), offset };
})();
let pace = 'normal';
function setMyMotion(m) {
  myMotion = m;
  session.setMotion(m);
  ui.syncJoin(m);
}
```

5. 바닥 클릭 → 길 찾기 → `go`. 시안 2004~2017줄 `tap`을 다음으로 바꾼다.

```js
function walkTo(x, z, then) {
  const here = positionAt(myMotion, serverNow());
  const pts = grid.findPath([here.x, here.z], [x, z]);
  if (!pts || pts.length < 2) return;
  setMyMotion({ kind: 'go', pts, speed: PACES[pace] * 1.25, t0: serverNow(), ...(then ? { then } : {}) });
  world.marker.visible = true;
  const end = pts[pts.length - 1];
  world.marker.position.set(end[0], world.heightAt(end[0], end[1]) + 0.24, end[1]);
}
```

탭 판정, 드래그로 시점 돌리기, 두 손가락 확대, 휠 확대는 시안 1955~2003줄을 그대로 옮기되 `state.view`를 `viewMode` 변수로, `Games.active` 검사는 지운다.

6. 산책 참여 / 나오기

```js
function joinCourse(key) {
  const here = positionAt(myMotion, serverNow());
  const offset = courses.nearestOnCourse(key, here.x, here.z);
  const target = courses.pointOnCourse(key, offset);
  if (Math.hypot(target.x - here.x, target.z - here.z) < 1) {
    setMyMotion({ kind: 'course', course: key, speed: PACES[pace], t0: serverNow(), offset });
  } else {
    walkTo(target.x, target.z, { course: key, offset });
  }
  world.drawCourseLine?.(key);
}
function leaveCourse() {
  const here = positionAt(myMotion, serverNow());
  setMyMotion({ kind: 'idle', at: [Math.round(here.x * 10) / 10, Math.round(here.z * 10) / 10], face: here.heading });
  world.marker.visible = false;
}
```

`go`가 끝나서 서 있게 되면(then 없음) 한 번 `idle`로 바꿔 보낸다(나중에 들어온 사람이 길 전체를 계산하지 않도록). 매 프레임 `myMotion.kind === 'go' && !myMotion.then && serverNow() > myMotion.t0 + goDuration(myMotion)`이면 `leaveCourse()`를 부른다.

걷는 속도를 바꾸면, 코스 위라면 현재 위치를 offset으로 새 `course` 기록을 만들어 보낸다.

코스 선은 시안 1876~1883줄 `drawCourseLine`을 main으로 옮겨 `world.scene`에 추가한다(`ribbonGeo`가 필요하므로 `world.js`에서 `ribbonGeo`를 반환 API에 추가로 내보낸다).

7. 다른 사람 그리기

```js
const peers = new Map(); // id -> { near, far, motion, last, outfit }
function syncPeers(list) {
  const seen = new Set();
  for (const p of list) {
    seen.add(p.id);
    let v = peers.get(p.id);
    if (!v || v.outfit !== p.outfit) {
      if (v) { world.scene.remove(v.near, v.far); }
      const look = LOOKS[p.outfit];
      v = { near: makePerson(look, PERSON_SCALE), far: makeFarPerson(look), outfit: p.outfit, last: null };
      world.scene.add(v.near, v.far);
      peers.set(p.id, v);
    }
    v.name = p.name;
    v.joinedAt = p.joinedAt;
    if (p.motion) v.motion = p.motion;                       // bad motion: keep the last good one
    else if (v.last) v.motion = { kind: 'idle', at: [v.last.x, v.last.z], face: v.last.heading };
    else v.motion = { kind: 'idle', at: [0, 0], face: 0 };
  }
  for (const [id, v] of peers) if (!seen.has(id)) leaveLater(id, v);
}
```

`leaveLater`: 30초 동안 지켜보다 다시 목록에 나타나지 않으면 장면에서 지운다(설계 4절). 재연결 중(`status === 'reconnecting'`)에는 지우지 않는다.

매 프레임:

```js
const FAR = 25;
let frameNo = 0;
function drawPeers(dt) {
  frameNo++;
  const now = serverNow();
  for (const v of peers.values()) {
    const p = positionAt(v.motion, now);
    v.last = p;
    const y = world.heightAt(p.x, p.z) + 0.13;
    const far = world.camera.position.distanceTo(new THREE.Vector3(p.x, y, p.z)) > FAR;
    v.near.visible = !far; v.far.visible = far;
    const obj = far ? v.far : v.near;
    obj.position.set(p.x, y, p.z);
    obj.rotation.y = angLerp(obj.rotation.y, p.heading, 1 - Math.exp(-dt * 6));
    if (!far) animatePerson(v.near, dt, p.speed);
    else if (frameNo % 2 === 0) obj.position.y += Math.abs(Math.sin(now / 160)) * 0.02 * (p.moving ? 1 : 0);
    v.near.userData.hat.visible = world.xmas;
  }
}
```

8. 내 캐릭터와 카메라: 시안 2036~2073줄(`step`)의 위치 갱신 부분은 지우고 `positionAt(myMotion, serverNow())`로 대신한다. 높이 보간(`X.y += ...`), `me.rotation.y = angLerp(...)`, `animatePerson(me, dt, p.speed)`는 유지. 카메라는 시안 2105~2142줄을 그대로 옮긴다(`state.view` → `viewMode`, `state.heading` → 내 현재 heading, `inBuilding`은 `world.inBuilding`). `angLerp`(2144줄)도 옮긴다.

9. 시작 순서 (빌드 대상이 es2020이라 최상위 `await`를 쓸 수 없다. `async function start()` 안에 두고 맨 끝에서 `start()`를 부른다. `session`, `netStatus`는 바깥에 `let`으로 선언한다.)

```js
ui = createUI({ /* Task 15 */ });
clockOffset = await syncServerClock();
const session = createSession({
  client: supabase, selfId, profile: { name, outfit, joinedAt: serverNow() }, motion: myMotion,
  startRoom: roomFromHash(location.hash), cap: Number(params.get('cap')) || undefined, validator,
  on: { peers: syncPeers, status: (s) => { netStatus = s; ui.showStatus(s); }, notice: () => {}, chat: () => {} }
});
session.ready.then((r) => ui.showRoom(r, peers.size + 1));
fetchLiveWeather().then((l) => world.setLive(l)).catch(() => world.setLive(null));
setInterval(() => fetchLiveWeather().then((l) => world.setLive(l)).catch(() => {}), 15 * 60 * 1000);
setInterval(() => world.tickClock(), 60 * 1000);
```

공지와 채팅 콜백은 3번 설계(기존 기능 이식)에서 채운다. 지금은 빈 함수.

`#cap=3`은 정원 확인용 숨은 설정이다(설계 6절).

10. 그리기 반복과 탭 숨김

```js
let running = true, last = performance.now();
document.addEventListener('visibilitychange', () => { running = !document.hidden; last = performance.now(); });
world.renderer.setAnimationLoop((now) => {
  if (!running) return;
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  stepMe(dt); drawPeers(dt); updateCamera(dt, now / 1000);
  world.frame(dt, now / 1000, look);
  world.renderer.render(world.scene, world.camera);
  ui.tickFps?.(now);
});
```

11. 화질: 시작 3초 뒤 `measureFps()` → `decideQuality({ saved: loadSavedQuality(), fps, mobile: isMobile() })` → `world.setQuality(QUALITY[level])`. 설정에서 직접 고르면 `saveQuality(level)`.

- [ ] **Step 1: main.js 작성** (위 1~11)
- [ ] **Step 2: `world.js`에 `ribbonGeo`와 `drawCourseLine` 지원 추가** (반환 API에 `ribbonGeo` 포함)
- [ ] **Step 3: 개발 서버에서 혼자 걷기 확인**

Run: `.env.local`의 Supabase 값을 잠시 비운 상태로 `npm run dev`, `http://localhost:5173/walk3d.html`
Expected: 트랙을 걷는 내 캐릭터, 바닥을 누르면 건물을 돌아서 걸어감, 코스 버튼으로 코스 합류, 콘솔 오류 없음.

- [ ] **Step 4: Commit**

```bash
git add src/walk3d/main.js src/world/world.js
git commit -m "3D: 클릭 이동, 산책 참여, 다른 사람 그리기, 카메라 연결"
```

---

### Task 15: 화면 요소 (`src/walk3d/ui.js`, `style.css`, `walk3d.html`)

**Files:**
- Create: `src/walk3d/ui.js`
- Modify: `src/walk3d/style.css`, `walk3d.html`
- 출처: `reference/sian.html` 6~66줄(CSS, 게임 부분인 67줄 이후 `body.gaming`부터 끝까지 제외), 129~154줄(HTML: `.vignette`, `#fade`, `.head`, `.credit`, `.dock`, `#panel`), 1904~1954줄(`syncButtons`, `setPanel`, 버튼 연결)

**바꿀 점**
1. `.dock`에서 "게임" 버튼은 뺀다(4번 설계).
2. 설정 창의 "날씨", "계절" 줄은 뺀다. 미리 보기는 `#wx=`, `#season=` 숨은 설정으로만(설계 결정: 서비스 노출 미정).
3. 설정 창에 "화질" 줄 추가: `자동`, `고화질`, `가벼운 화면`.
4. 오른쪽 위 `.credit` 문구: `건물 위치와 높이, 트랙은 실제 자료입니다. 지도 자료: OpenStreetMap 기여자. 날씨 자료: Open-Meteo.`
5. 새 요소:
   - 방 표시 `#room-badge`: `3번 방 12명` + 링크 복사 버튼(선 SVG 아이콘). 복사 문구 `https://mealnstroll.bgnl.kr/#room=3`(개발 중에는 `location.origin + location.pathname`). 복사되면 `링크를 복사했어요` 2초.
   - 방을 옮겼으면 한 번: `3번 방이 가득 차서 4번 방으로 왔어요` (5초 뒤 사라짐).
   - 연결 상태 `#net-status`: `connecting` → `연결하는 중`, `reconnecting` → `다시 연결하는 중`, `solo` → `혼자 걷는 중이에요`, `online` → 숨김.
   - 처음 들어온 사람: 이름(12자) 입력과 복장 8종 고르기 카드. 복장 미리 보기는 각 `LOOKS` 색 견본 원 2개(상의, 머리)로 단순하게. 저장 후 `session.setProfile`.
   - `#fps` 표시: 해시에 `fps`가 있으면 오른쪽 아래에 1초마다 fps 숫자.
6. 이모지 금지. 버튼 아이콘은 선 SVG.

**공개 API**

```js
export function createUI({ onCourse, onLeaveCourse, onPace, onTime, onView, onQuality, onProfile, getRoomLink }) {
  return { syncJoin(motion), showWeather(w, live), showRoom({ room, moved, wanted }, count), setCount(n), showStatus(s), askProfileIfNeeded(), tickFps(now) };
}
```

`showWeather` 문구는 시안 `showWeatherStatus`(1800~1810줄)와 같고, 미리 보기일 때만 `미리 보기:`를 붙인다.

- [ ] **Step 1: style.css 옮기기와 새 요소 스타일**
- [ ] **Step 2: walk3d.html에 HTML 옮기기**
- [ ] **Step 3: ui.js 작성, main.js에 연결**
- [ ] **Step 4: 휴대폰 폭 확인**

Run: `node scripts/shot.mjs "http://localhost:4173/walk3d.html#time=day" shots/phone.png 390 844`
Expected: 하단 메뉴가 화면 안에 들어가고 가로 스크롤 없음, 방 표시와 버튼이 겹치지 않음.

- [ ] **Step 5: 화면 글 검사**

Run: `grep -nP "[·—\x{1F300}-\x{1FAFF}]" walk3d.html src/walk3d/*.js`
Expected: 출력 없음.

- [ ] **Step 6: Commit**

```bash
git add walk3d.html src/walk3d/ui.js src/walk3d/style.css src/walk3d/main.js
git commit -m "3D: 하단 메뉴, 설정, 방 표시, 연결 상태, 이름과 복장 고르기"
```

---

### Task 16: 다중 접속 직접 확인과 미리 보기 배포

**Files:** 없음(확인만). 문제가 나오면 해당 파일 수정.

- [ ] **Step 1: 두 창 동기화**

`npm run dev` 후 Chrome 일반 창과 시크릿 창(서로 다른 `mealnstroll.id`)에서 `http://localhost:5173/walk3d.html`을 연다.
Expected: 같은 방 번호, 한 창에서 바닥을 누르면 다른 창에서 1초 안에 같은 길로 걷기 시작하고 도착 지점이 같다. 코스 합류도 같은 위치.

- [ ] **Step 2: 정원 넘김**

세 창 이상을 `#cap=1`로 연다(`http://localhost:5173/walk3d.html#cap=1`). `cap` 파싱이 `params`에서 되는지 확인.
Expected: 첫 창 1번 방, 둘째 창 2번 방(방 표시가 2번), 셋째 창 3번 방.

- [ ] **Step 3: 링크 방**

`#room=5`로 열기 → 5번 방. 5번 방에 이미 1명이 있는 상태에서 `#room=5&cap=1` → `5번 방이 가득 차서 6번 방으로 왔어요`.

- [ ] **Step 4: 끊김**

개발자 도구 네트워크를 Offline으로 10초 → 다시 Online.
Expected: `다시 연결하는 중` 표시, 다른 사람 캐릭터가 사라지지 않음, 복구 후 표시 사라짐.

- [ ] **Step 5: 이상한 기록 무시**

개발자 도구 콘솔에서 한 창의 세션으로 `{ kind: 'go', pts: [[0,0],[9999,0]], speed: 1, t0: Date.now() }`를 track 하도록 임시 노출(`window.__session = session`, 확인 후 지움)해서 보냄.
Expected: 다른 창에서 그 사람이 마지막 정상 위치에 서 있음, 오류 없음.

- [ ] **Step 6: 번들 크기**

Run: `npx vite build --emptyOutDir=false` 후 출력의 `walk3d-*.js` gzip 크기 확인.
Expected: gzip 합계 약 1MB 이하. 넘으면 보고만 하고 다음 단계로.

- [ ] **Step 7: 전체 테스트**

Run: `npm test`
Expected: 전부 PASS

- [ ] **Step 8: 푸시해서 Vercel 미리 보기 받기**

```bash
git push -u origin 3d
```
Expected: Vercel이 `3d` 가지 미리 보기를 만든다(`vercel ls`로 주소 확인). 운영 주소(mealnstroll.bgnl.kr)는 그대로 2D. 미리 보기 주소의 `/walk3d.html`과 `/api/time`이 동작하는지 확인한다. 미리 보기 환경에는 Supabase 환경 변수가 Production에만 있으므로 `vercel env add VITE_SUPABASE_URL preview`, `vercel env add VITE_SUPABASE_ANON_KEY preview`로 같은 값을 넣고 다시 배포해야 다중 접속이 된다(값은 `.env.local`에서 읽는다, 화면에 출력하지 않는다).

- [ ] **Step 9: 사용자에게 속도 측정 부탁**

미리 보기 주소에 `#fps`를 붙인 링크를 사용자에게 주고, 휴대폰 1대와 교무실 PC 1대에서 fps를 알려 달라고 한다.

---

## 이번 계획 밖 (다음 계획)

- 3번 설계: 접어 둔 채팅 UI, 서명 공지 UI(`src/notice-auth.js`, `api/notice-sign.js` 재사용, 공지 채널은 이번에 만듦), 운세, 오래 머물기 효과의 3D 모양.
- 4번 설계: 미니게임 4종(`reference/sian.html` 2144~3961줄)과 결과 공유.
- 교체: 2D 코드 삭제, `walk3d.html`을 `index.html`로, `mealnstroll-lobby` 정리, main 병합.
