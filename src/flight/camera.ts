/**
 * Log-zoom tracking camera spanning pad (meters) to orbit (megameters).
 *
 * PRECISION RULE: world coordinates reach 1e7 m; float32 canvas transforms
 * would shred pixel precision. ALWAYS subtract the camera center from world
 * coords in double precision BEFORE scaling — never bake large translations
 * into the canvas transform matrix.
 */
export interface Camera {
  /** World center, m (ECI plane coords). */
  cx: number;
  cy: number;
  /** log2 of pixels-per-meter. */
  logScale: number;
  /** User wheel bias added in log space. */
  userBias: number;
}

export function createCamera(): Camera {
  return { cx: 0, cy: 0, logScale: 3, userBias: 0 };
}

export function pxPerMeter(cam: Camera): number {
  return Math.pow(2, cam.logScale + cam.userBias);
}

export function worldToScreen(
  cam: Camera,
  wx: number,
  wy: number,
  w: number,
  h: number,
): [number, number] {
  const s = pxPerMeter(cam);
  // double-precision subtraction first — see header
  const dx = wx - cam.cx;
  const dy = wy - cam.cy;
  // world +y = up (radial), screen +y = down; flight renders in a local frame
  return [w / 2 + dx * s, h * 0.62 - dy * s];
}

/**
 * Target scale from flight state: pad fills the frame at T-0, the planet limb
 * appears near orbit. Smoothly follows altitude+speed.
 */
export function targetLogScale(altitude: number, speed: number): number {
  // At alt 0: ~24 px/m (2^4.6); at 10 km: ~0.05 px/m; at 200 km: ~0.004 px/m.
  const span = Math.max(60, altitude * 1.6 + speed * 8);
  return Math.log2(560 / span);
}

/** Exponential smoothing toward the target, dt-aware. */
export function updateCamera(
  cam: Camera,
  targetCx: number,
  targetCy: number,
  targetLog: number,
  dtMs: number,
): void {
  const k = 1 - Math.exp(-dtMs / 450);
  cam.cx += (targetCx - cam.cx) * k;
  cam.cy += (targetCy - cam.cy) * k;
  cam.logScale += (targetLog - cam.logScale) * k;
}
