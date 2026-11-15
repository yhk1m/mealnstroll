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
