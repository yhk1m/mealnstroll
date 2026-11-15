// © 2026 김용현
import { createWorld } from '../world/world.js';
import { QUALITY } from '../quality.js';

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
let last = performance.now();
world.renderer.setAnimationLoop((now) => {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  world.frame(dt, now / 1000, { x: -55, y: 0, z: 40 });
  world.renderer.render(world.scene, world.camera);
  window.__frames = (window.__frames || 0) + 1;
});
