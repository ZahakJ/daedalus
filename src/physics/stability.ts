/**
 * Barrowman-lite aerodynamic stability: component CNα/CP, static margin,
 * NACA TN 4197 fin flutter boundary, rail-exit speed. Pure geometry — the CG
 * comes from the mass rollup elsewhere and is passed in.
 *
 * All normal-force slopes are per radian, normalized to the body reference
 * area A_ref = π·d²/4 (the Barrowman convention). All x stations are measured
 * from the nose tip, m.
 */

import { G0 } from './constants';
import type { FinSet, NoseShape } from './types';

/** One lifting component: normal-force slope (1/rad, body reference area) and
    its center of pressure measured from the nose tip, m. */
export interface AeroComponent {
  cnAlpha: number;
  xcp: number;
}

/**
 * Nose cone normal-force slope and CP (Barrowman 1967, "The Practical
 * Calculation of the Aerodynamic Characteristics of Slender Finned Vehicles").
 * Slender-body theory gives CNα = 2 for ANY nose that ends at the body
 * diameter; only the CP location depends on shape:
 *   conical      xcp = (2/3)·L
 *   tangent ogive xcp = 0.466·L
 *   von Kármán   xcp ≈ 0.5·L   (LD-haack, standard hobby value)
 */
export function noseCN(shape: NoseShape, noseLength: number): AeroComponent {
  const frac = shape === 'conical' ? 2 / 3 : shape === 'ogive' ? 0.466 : 0.5;
  return { cnAlpha: 2, xcp: frac * noseLength };
}

/**
 * Fin set normal-force slope and CP — Barrowman planform equations as
 * implemented by OpenRocket (Barrowman 1967 eq 12-27 / TIR-33):
 *
 *   CNα = [4·n·(s/d)²] / [1 + √(1 + (2ℓ/(cr+ct))²)] · (1 + r/(s+r))
 *
 * with n = fin count (3 or 4 both fully effective in the planar model),
 * s = exposed semispan, d = body diameter, r = d/2 the body radius,
 * ℓ = midchord line length = √(s² + xm²), xm = s·tan(Λ_LE) + (ct−cr)/2,
 * and the trailing factor the standard body-interference term.
 *
 * CP from the fin-root leading edge (Barrowman TIR-33):
 *   Δx = xLE·(cr+2ct)/(3(cr+ct)) + (1/6)·(cr + ct − cr·ct/(cr+ct))
 * with xLE = s·tan(Λ_LE) the leading-edge sweep distance.
 *
 * @param finRootLeadingEdgeX Station of the fin-root leading edge from the
 *   nose tip, m.
 */
export function finsCN(
  fins: FinSet,
  bodyDiameter: number,
  finRootLeadingEdgeX: number,
): AeroComponent {
  const { count: n, rootChord: cr, tipChord: ct, span: s, sweep } = fins;
  const d = bodyDiameter;
  const r = d / 2;
  const xSweepLE = s * Math.tan(sweep);
  const xSweepMid = xSweepLE + (ct - cr) / 2;
  const l = Math.sqrt(s * s + xSweepMid * xSweepMid);
  const cSum = cr + ct;
  const bare =
    (4 * n * (s / d) * (s / d)) / (1 + Math.sqrt(1 + ((2 * l) / cSum) * ((2 * l) / cSum)));
  const interference = 1 + r / (s + r);
  const cnAlpha = bare * interference;
  const xcp =
    finRootLeadingEdgeX +
    (xSweepLE * (cr + 2 * ct)) / (3 * cSum) +
    (1 / 6) * (cSum - (cr * ct) / cSum);
  return { cnAlpha, xcp };
}

/**
 * Whole-vehicle CP: CNα-weighted average of component CPs
 * (Barrowman superposition: X̄ = Σ CNαi·x̄i / Σ CNαi).
 */
export function totalCP(components: AeroComponent[]): AeroComponent {
  let cn = 0;
  let moment = 0;
  for (const c of components) {
    cn += c.cnAlpha;
    moment += c.cnAlpha * c.xcp;
  }
  return { cnAlpha: cn, xcp: cn > 0 ? moment / cn : 0 };
}

/** Static margin in calibers: (xcp − xcg)/d. Positive = stable (CP aft of CG). */
export function staticMarginCalibers(cp: number, cg: number, diameter: number): number {
  return (cp - cg) / diameter;
}

/**
 * Fin flutter boundary airspeed — NACA TN 4197 closed form (the hobby-rocketry
 * standard, Martin "Peak of Flight" formulation):
 *
 *   Vf = a · √( G / [ 1.337·AR³·p·(λ+1) / (2·(AR+2)·(t/c)³) ] )
 *
 * AR = s²/S aspect ratio with S = s·(cr+ct)/2 the trapezoid planform area,
 * λ = ct/cr taper ratio, t/c = thickness/rootChord, G the material shear
 * modulus (≈ E/2.6 for isotropic fins), p ambient static pressure, a ambient
 * speed of sound. Returns Infinity when the divisor collapses (p → 0, or
 * degenerate geometry) — very stiff fins simply produce very large Vf.
 *
 * @param shearModulus G, Pa.
 * @param pressure Ambient static pressure, Pa.
 * @param speedOfSound Ambient speed of sound a, m/s.
 */
export function flutterSpeed(
  fins: FinSet,
  shearModulus: number,
  pressure: number,
  speedOfSound: number,
): number {
  const { rootChord: cr, tipChord: ct, span: s, thickness } = fins;
  const area = (s * (cr + ct)) / 2;
  if (area <= 0 || cr <= 0) return Infinity;
  const ar = (s * s) / area;
  const lambda = ct / cr;
  const tc = thickness / cr;
  const divisor = (1.337 * ar * ar * ar * pressure * (lambda + 1)) / (2 * (ar + 2) * tc * tc * tc);
  if (!(divisor > 0)) return Infinity;
  return speedOfSound * Math.sqrt(shearModulus / divisor);
}

/**
 * Rail-exit speed from constant net acceleration over the rail:
 * v = √(2·(TWR−1)·g0·L) — uniform-acceleration kinematics with a = (T−mg)/m.
 * Returns 0 when TWR ≤ 1 (pad crawl: the vehicle never leaves the rail).
 */
export function railExitSpeed(twr: number, railLength: number): number {
  if (twr <= 1) return 0;
  return Math.sqrt(2 * (twr - 1) * G0 * railLength);
}

/** Angle of attack induced by a horizontal wind on a vertically moving vehicle:
    α = atan2(v_wind, v_vehicle). Well-behaved at zero vehicle speed (α → π/2). */
export function windAngleOfAttack(windSpeed: number, vehicleSpeed: number): number {
  return Math.atan2(windSpeed, vehicleSpeed);
}
