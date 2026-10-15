/**
 * 2D planar two-body orbital mechanics about a spherical Earth (MU_EARTH,
 * R_EARTH). State is Earth-centered inertial plane coords (x, y, vx, vy);
 * strict SI. Pure closed forms — no iteration, no allocation beyond the
 * returned OrbitElements.
 */

import type { OrbitElements } from './types.ts';
import { MU_EARTH, R_EARTH } from './constants.ts';

/**
 * Osculating orbital elements from a planar state vector.
 *
 * Specific orbital energy ε = v²/2 − μ/r (Vallado eq 1-20); semi-major axis
 * a = −μ/(2ε); specific angular momentum h = x·vy − y·vx (z-component, planar);
 * eccentricity from the eccentricity vector e⃗ = ((v² − μ/r)·r⃗ − (r⃗·v⃗)·v⃗)/μ
 * (Vallado eq 2-78) — numerically far better conditioned near e = 0 than
 * √(1 + 2εh²/μ²), which squares the cancellation error; rp = a(1−e),
 * ra = a(1+e); period T = 2π√(a³/μ) (Kepler III).
 *
 * ε ≥ 0 (parabolic/hyperbolic): apoapsisAlt, sma, and period are Infinity;
 * periapsis comes from the semi-latus rectum, rp = (h²/μ)/(1+e), which stays
 * finite where a(1−e) degenerates.
 */
export function orbitalElements(x: number, y: number, vx: number, vy: number): OrbitElements {
  const r = Math.hypot(x, y);
  const v2 = vx * vx + vy * vy;
  const eps = v2 / 2 - MU_EARTH / r;
  const rdotv = x * vx + y * vy;
  const c = v2 - MU_EARTH / r; // (v² − μ/r), the eccentricity-vector scalar
  const ex = (c * x - rdotv * vx) / MU_EARTH;
  const ey = (c * y - rdotv * vy) / MU_EARTH;
  const e = Math.hypot(ex, ey);
  if (eps >= 0) {
    const h = x * vy - y * vx;
    const rp = (h * h) / MU_EARTH / (1 + e);
    return {
      apoapsisAlt: Infinity,
      periapsisAlt: rp - R_EARTH,
      eccentricity: e,
      semiMajorAxis: Infinity,
      period: Infinity,
    };
  }
  const a = -MU_EARTH / (2 * eps);
  return {
    apoapsisAlt: a * (1 + e) - R_EARTH,
    periapsisAlt: a * (1 - e) - R_EARTH,
    eccentricity: e,
    semiMajorAxis: a,
    period: 2 * Math.PI * Math.sqrt((a * a * a) / MU_EARTH),
  };
}

/** Stable-orbit criterion: periapsis above 140 km — clear of re-entry drag decay
    on mission timescales (LEO lifetime below ~140 km is under one orbit). */
export function isOrbit(el: OrbitElements): boolean {
  return el.periapsisAlt > 140e3;
}

/** Vis-viva: v = √(μ(2/r − 1/a)) (Vallado eq 1-31). */
export function visViva(r: number, sma: number): number {
  return Math.sqrt(MU_EARTH * (2 / r - 1 / sma));
}

/** Circular orbital speed v = √(μ/r) — vis-viva with a = r. */
export function circularSpeed(r: number): number {
  return Math.sqrt(MU_EARTH / r);
}

/**
 * Coasting apoapsis altitude ra − R_EARTH = a(1+e) − R_EARTH straight from the
 * state — the apoapsis-target cutoff check, called every guidance step, so no
 * intermediate OrbitElements object is built. Infinity when ε ≥ 0 (escape).
 */
export function apoapsisFromState(x: number, y: number, vx: number, vy: number): number {
  const r = Math.hypot(x, y);
  const v2 = vx * vx + vy * vy;
  const eps = v2 / 2 - MU_EARTH / r;
  if (eps >= 0) return Infinity;
  const rdotv = x * vx + y * vy;
  const c = v2 - MU_EARTH / r;
  const ex = (c * x - rdotv * vx) / MU_EARTH;
  const ey = (c * y - rdotv * vy) / MU_EARTH;
  const e = Math.hypot(ex, ey);
  return (-MU_EARTH / (2 * eps)) * (1 + e) - R_EARTH;
}
