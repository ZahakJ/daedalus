/**
 * Isentropic nozzle flow — Sutton, Rocket Propulsion Elements 9th ed, ch. 3.
 * Pure closed forms plus a deterministic fixed-count bisection inverse.
 * Strict SI: Pa, m², m, rad.
 */

/** 80% bell divergence half-angle equivalent, rad (15° conical reference). */
const TAN_15_DEG = Math.tan((15 * Math.PI) / 180);

/**
 * Vandenkerckhove function Γ(γ) = √γ·(2/(γ+1))^((γ+1)/(2(γ−1))).
 * Appears in choked mass flow ṁ = pc·At·Γ/√(R·Tc) (Sutton eq 3-24).
 */
export function vandenkerckhove(gamma: number): number {
  return Math.sqrt(gamma) * Math.pow(2 / (gamma + 1), (gamma + 1) / (2 * (gamma - 1)));
}

/**
 * Isentropic area ratio, Sutton eq 3-14:
 * A/A* = (1/M)·[(2/(γ+1))·(1+((γ−1)/2)M²)]^((γ+1)/(2(γ−1)))
 */
export function areaRatioFromMach(M: number, gamma: number): number {
  const term = (2 / (gamma + 1)) * (1 + ((gamma - 1) / 2) * M * M);
  return (1 / M) * Math.pow(term, (gamma + 1) / (2 * (gamma - 1)));
}

/**
 * Inverse of areaRatioFromMach on the supersonic branch, where A/A* is
 * strictly increasing in M. Fixed 32-iteration bisection on M ∈ [1, 12]
 * (deterministic, branch-free iteration count; resolution (12−1)/2³² ≪ 1e-6).
 * eps ≤ 1 returns 1 (sonic throat); eps beyond M=12 clamps to the bracket top.
 */
export function exitMachFromAreaRatio(eps: number, gamma: number): number {
  if (eps <= 1) return 1;
  let lo = 1;
  let hi = 12;
  for (let i = 0; i < 32; i++) {
    const mid = 0.5 * (lo + hi);
    if (areaRatioFromMach(mid, gamma) < eps) lo = mid;
    else hi = mid;
  }
  return 0.5 * (lo + hi);
}

/**
 * Isentropic exit-to-chamber pressure ratio, Sutton eq 3-13:
 * pe/pc = (1+((γ−1)/2)Me²)^(−γ/(γ−1))
 */
export function exitPressureRatio(Me: number, gamma: number): number {
  return Math.pow(1 + ((gamma - 1) / 2) * Me * Me, -gamma / (gamma - 1));
}

/**
 * Thrust coefficient, Sutton eq 3-30:
 * CF = √((2γ²/(γ−1))·(2/(γ+1))^((γ+1)/(γ−1))·(1−(pe/pc)^((γ−1)/γ))) + ε·(pe−pa)/pc
 * The radical is the momentum term alone; the pressure term vanishes when
 * matched (pe = pa). Thrust F = CF·pc·At.
 */
export function thrustCoefficient(
  pc: number,
  pe: number,
  pa: number,
  eps: number,
  gamma: number,
): number {
  const momentum = Math.sqrt(
    ((2 * gamma * gamma) / (gamma - 1)) *
      Math.pow(2 / (gamma + 1), (gamma + 1) / (gamma - 1)) *
      (1 - Math.pow(pe / pc, (gamma - 1) / gamma)),
  );
  return momentum + (eps * (pe - pa)) / pc;
}

/**
 * Bell-nozzle envelope from throat area and expansion ratio.
 * 80% bell (Rao): length = 0.8·(rExit−rThroat)/tan(15°), the standard
 * fraction of the equivalent 15° conical nozzle (Sutton fig 3-12).
 */
export function nozzleGeometry(
  throatArea: number,
  eps: number,
): { throatDiameter: number; exitDiameter: number; length: number } {
  const rThroat = Math.sqrt(throatArea / Math.PI);
  const rExit = Math.sqrt((eps * throatArea) / Math.PI);
  return {
    throatDiameter: 2 * rThroat,
    exitDiameter: 2 * rExit,
    length: (0.8 * (rExit - rThroat)) / TAN_15_DEG,
  };
}
