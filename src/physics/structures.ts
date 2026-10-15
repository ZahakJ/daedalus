/**
 * Structural joint loads and thin-shell buckling margins. Pure; strict SI.
 * Model: each interstage/skirt joint is a thin monocoque cylinder carrying
 * axial (inertial) load plus an aerodynamic bending moment.
 */

import type { Material } from './materials';

export interface LoadCase {
  /** Compressive axial force at the joint, N. */
  axialForce: number;
  /** Bending moment at the joint, N·m. */
  bendingMoment: number;
  label: string;
}

/**
 * Joint load case: axial F = m_above·a (inertial compression), bending
 * M = q·α·C_Nα,above·S_ref·l — the normal-force couple of everything above
 * the joint acting at its lever arm (aoa and cnAlphaAbove in rad, 1/rad).
 */
export function jointLoads(
  massAbove: number,
  accel: number,
  q: number,
  aoa: number,
  cnAlphaAbove: number,
  refArea: number,
  leverArm: number,
  label = 'combined',
): LoadCase {
  return {
    axialForce: massAbove * accel,
    bendingMoment: q * aoa * cnAlphaAbove * refArea * leverArm,
    label,
  };
}

/**
 * Critical buckling stress of a thin cylinder, NASA SP-8007:
 * σ_cr = γ·E·t/r with knockdown γ = 0.3 — a conservative lower-bound envelope
 * of test data (classical theory gives 0.605; real shells with imperfections
 * cluster near 0.2–0.4). Internal pressure adds membrane tension credit
 * p·r/(2t) (pressure-stabilized skin, Atlas balloon-tank effect). Capped at
 * 0.9·σ_y — yield governs before the pressurized shell can buckle.
 */
export function bucklingStress(
  mat: Material,
  t: number,
  r: number,
  internalPressure: number,
): number {
  const sigma = (0.3 * mat.modulus * t) / r + (internalPressure * r) / (2 * t);
  return Math.min(sigma, 0.9 * mat.yieldStrength);
}

/** Axial force capability, N: F_cr = σ_cr·A_shell = σ_cr·2πr·t. */
export function axialCapability(
  mat: Material,
  t: number,
  r: number,
  internalPressure: number,
): number {
  return bucklingStress(mat, t, r, internalPressure) * (2 * Math.PI * r * t);
}

/**
 * Joint margin of safety: margin = capability/F_eq − 1 (negative = failure).
 * Bending-to-equivalent-axial for a thin cylinder: peak bending stress
 * σ_b = M/(πr²t) vs uniform axial σ_a = F/(2πrt) → F_eq = F + 2M/r.
 */
export function jointMargin(cap: number, load: LoadCase, r: number): number {
  const equivalentAxial = load.axialForce + (2 * load.bendingMoment) / r;
  return cap / equivalentAxial - 1;
}
