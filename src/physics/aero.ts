/**
 * Aerodynamics: Cd(M) lookup for a finned/finless body of revolution plus the
 * q/drag closed forms. The base curve is a composite of Hoerner (Fluid-Dynamic
 * Drag, ch. 16) slender-body data and Sutton fig 4-4 — power-on, zero-AoA,
 * fineness ~8 reference shape with a conical nose.
 */

import { clamp, monotoneCubic } from './interp';
import type { NoseShape } from './types';

/** Subsonic incompressible baseline (skin friction + base drag), Cd at M≈0.3. */
const CD_SUBSONIC = 0.3;

/**
 * Base Cd(M) table, conical nose, fineness 8. Flat to M0.5, transonic rise
 * through the drag divergence, peak 0.62 at M1.1, supersonic decay to a
 * hypersonic floor of 0.24 from M6 (Mach-independence principle).
 */
const MACH_PTS = [0, 0.5, 0.8, 0.9, 0.95, 1.0, 1.05, 1.1, 1.2, 1.3, 1.6, 2.0, 2.5, 3.0, 4.0, 5.0, 6.0, 8.0];
const CD_PTS = [0.3, 0.3, 0.35, 0.4, 0.45, 0.55, 0.6, 0.62, 0.58, 0.55, 0.48, 0.42, 0.36, 0.32, 0.28, 0.26, 0.24, 0.24];
const cdBase = monotoneCubic(MACH_PTS, CD_PTS);

/** Wave-drag multiplier per nose shape (applied to the excess over CD_SUBSONIC
    only — subsonic friction/base drag is shape-independent at this fidelity).
    Ogive/von Kármán factors from Hoerner ch. 17 nose-pressure-drag ratios. */
const NOSE_WAVE_FACTOR: Record<NoseShape, number> = {
  conical: 1.0,
  ogive: 0.92,
  'von-karman': 0.85,
};

/**
 * Vehicle drag coefficient vs Mach, referenced to body cross-section area.
 * Cd = [CD_SUBSONIC + k_nose·(Cd_base(M) − CD_SUBSONIC)] · f_fineness where
 * f_fineness = clamp(1 + 0.012·(8 − L/D), 0.92, 1.15) — stubby vehicles pay
 * more wave+base drag, slender ones slightly less (Hoerner fineness trend).
 *
 * @param mach free-stream Mach number
 * @param noseShape nose profile (wave-drag component only)
 * @param finenessRatio overall length / body diameter, supplied by the caller
 */
export function dragCoefficient(mach: number, noseShape: NoseShape, finenessRatio: number): number {
  const base = cdBase(mach);
  // Wave component = excess over the subsonic base; where the curve decays
  // below it (hypersonic friction/base-drag relief) there is no wave excess
  // to scale and the base curve passes through unchanged.
  const wave = base > CD_SUBSONIC ? base - CD_SUBSONIC : 0;
  const cd = base + (NOSE_WAVE_FACTOR[noseShape] - 1) * wave;
  const finenessFactor = clamp(1 + 0.012 * (8 - finenessRatio), 0.92, 1.15);
  return cd * finenessFactor;
}

/**
 * Parasitic fin drag increment referenced to body cross-section:
 * ΔCd = 0.008·(count·S_fin/S_ref)·2 — flat-plate friction+profile drag
 * coefficient 0.008 per wetted side, both sides wetted.
 */
export function finDragIncrement(finArea: number, refArea: number, count: number): number {
  return 0.008 * ((count * finArea) / refArea) * 2;
}

/** Dynamic pressure q = ½ρv², Pa. */
export function dynamicPressure(density: number, airspeed: number): number {
  // v² first: keeps q exact for exactly-representable inputs (1.225·10000
  // rounds to 12250 exactly; 0.5·1.225 does not stay exact through ·10⁴).
  return airspeed * airspeed * density * 0.5;
}

/** Drag D = q·Cd·S_ref, N. */
export function dragForce(q: number, cd: number, refArea: number): number {
  return q * cd * refArea;
}

/** Mach number M = v/a; 0 when the speed of sound is not positive (vacuum). */
export function machNumber(airspeed: number, speedOfSound: number): number {
  return speedOfSound > 0 ? airspeed / speedOfSound : 0;
}
