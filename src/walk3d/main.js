// © 2026 김용현
import { createWorld } from '../world/world.js';
import { QUALITY } from '../quality.js';
import { makePerson, makeFarPerson, animatePerson, LOOKS, PERSON_SCALE } from '../avatar/person.js';

const world = createWorld({ canvas: document.getElementById('c'), onWeather: (w) => console.log('weather', w) });
const fit = () => world.resize(innerWidth, innerHeight);
addEventListener('resize', fit);
fit();
world.setViewMode('aerial');
world.camera.position.set(250, 260, 250);
world.camera.lookAt(-55, 0, 40);
const params = new URLSearchParams(location.hash.slice(1));
if (QUALITY[params.get('q')]) world.setQuality(QUALITY[params.get('q')]);
if (params.get('time')) world.setTimeMode(params.get('time'));
if (params.get('wx') || params.get('season')) world.setPreview({ wxMode: params.get('wx') || 'live', seasonMode: params.get('season') || 'date' });
// Temporary check (#people): the eight outfits walking in place, then one far stand-in.
let crowd = [];
if (params.has('people')) {
  crowd = LOOKS.map((look, i) => {
    const p = makePerson(look, PERSON_SCALE);
    p.position.set(-40 + i * 1.2, world.heightAt(-40 + i * 1.2, 100) + 0.13, 100);
    p.userData.hat.visible = world.xmas || params.has('hat');
    world.scene.add(p);
    return p;
  });
  const far = makeFarPerson(LOOKS[2]);
  far.position.set(-40 + 8 * 1.2, world.heightAt(-40 + 8 * 1.2, 100) + 0.13, 100);
  world.scene.add(far);
  world.setViewMode('walk');
  world.camera.position.set(-35.2, 2.2, 108.5);
  world.camera.lookAt(-35.2, 0.6, 100);
}
let last = performance.now();
world.renderer.setAnimationLoop((now) => {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  crowd.forEach((p) => animatePerson(p, dt, 1));
  world.frame(dt, now / 1000, { x: -55, y: 0, z: 40 });
  world.renderer.render(world.scene, world.camera);
  window.__frames = (window.__frames || 0) + 1;
});
