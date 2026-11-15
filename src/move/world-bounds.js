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
const onCampus = campus.buildings.filter((b) => !b.base).map((b) => b.ring);
// Off-campus houses block too, but only those whose bounding box touches the walkable rectangle.
const around = campus.around.buildings.filter((ring) => {
  const xs = ring.map((p) => p[0]), zs = ring.map((p) => p[1]);
  return Math.max(...xs) >= WORLD_BOUNDS.minX && Math.min(...xs) <= WORLD_BOUNDS.maxX &&
    Math.max(...zs) >= WORLD_BOUNDS.minZ && Math.min(...zs) <= WORLD_BOUNDS.maxZ;
});
export const BLOCKED = [...onCampus, ...around];
