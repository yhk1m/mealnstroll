// © 2026 김용현
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { makePerson, makeFarPerson, poseLeg, animatePerson, LOOKS, PERSON_SCALE } from '../src/avatar/person.js';

test('LOOKS has the eight staff outfits and the scale of the draft', () => {
  assert.equal(LOOKS.length, 8);
  assert.equal(PERSON_SCALE, 1.12);
  LOOKS.forEach((l) => ['skin', 'hair', 'top', 'pants', 'shoe', 'outfit'].forEach((k) => assert.ok(l[k], k)));
});

test('poseLeg standing straight drops the ankle by thigh plus shin', () => {
  const l = { thigh: new THREE.Object3D(), shin: new THREE.Object3D(), foot: new THREE.Object3D() };
  assert.ok(Math.abs(poseLeg(l, 1.3, 0) - 0.36) < 1e-9);
  assert.ok(l.thigh.rotation.x === 0);
  // Walking bends the leg, so the ankle rises.
  assert.ok(poseLeg(l, 0, 1) < 0.36);
});

test('makePerson builds the rig, a hidden Christmas hat and the given scale', () => {
  const p = makePerson(LOOKS[0], PERSON_SCALE);
  const u = p.userData;
  ['rig', 'torso', 'head', 'hat', 'legL', 'legR', 'armL', 'armR'].forEach((k) => assert.ok(u[k], k));
  assert.equal(u.hat.visible, false);
  assert.equal(p.scale.x, PERSON_SCALE);
  assert.equal(u.armL.carry, true); // LOOKS[0] carries a book
});

test('walking keeps the lower sole on the ground', () => {
  const p = makePerson(LOOKS[3], 1);
  const v = new THREE.Vector3();
  const lows = [];
  for (let i = 0; i < 120; i++) {
    animatePerson(p, 1 / 60, 1.2);
    p.updateMatrixWorld(true);
    const ys = [p.userData.legL.foot, p.userData.legR.foot].map((f) => f.getWorldPosition(v).y);
    lows.push(Math.min(...ys));
  }
  const later = lows.slice(60);
  // The planted ankle stays about ANKLE (0.07) above the root, within a couple of centimetres.
  later.forEach((y) => assert.ok(Math.abs(y - 0.07) < 0.03, String(y)));
});

test('makeFarPerson is two meshes without shadows at the person scale', () => {
  const g = makeFarPerson(LOOKS[2]);
  const meshes = [];
  g.traverse((o) => { if (o.isMesh) meshes.push(o); });
  assert.equal(meshes.length, 2);
  meshes.forEach((m) => assert.equal(m.castShadow, false));
  assert.equal(g.scale.x, PERSON_SCALE);
});
