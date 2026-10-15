/**
 * Point-mass (spherical) Earth gravity for the 2D planar sim. Strict SI.
 * J2 and higher harmonics are far below the fidelity of a planar teaching
 * sim — documented approximation, matching R_EARTH's spherical model.
 */

import { MU_EARTH, R_EARTH } from './constants.ts';

/** Newtonian point-mass acceleration a⃗ = −(μ/r²)·r̂ = −μ·r⃗/r³, in the ECI plane. */
export function gravityAccel(x: number, y: number): { ax: number; ay: number } {
  const r2 = x * x + y * y;
  const invR3 = 1 / (r2 * Math.sqrt(r2));
  return { ax: -MU_EARTH * x * invR3, ay: -MU_EARTH * y * invR3 };
}

/** Gravity magnitude at altitude h: g = μ/(R_EARTH + h)² — inverse-square law.
    g(0) ≈ 9.820 m/s² with the mean-radius spherical model (vs 9.80665 standard). */
export function surfaceGravity(altitude: number): number {
  const r = R_EARTH + altitude;
  return MU_EARTH / (r * r);
}
