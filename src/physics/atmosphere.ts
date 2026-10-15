/**
 * US Standard Atmosphere 1976 (NOAA-S/T 76-1562), 7-layer molecular-scale
 * model to 86 km geometric, with a documented exponential taper above.
 *
 * Approximations:
 *  1. Geometric→geopotential uses the engine's mean radius R_EARTH = 6371 km,
 *     not USSA76's adopted r0 = 6356.766 km. Consequence: 86 km geometric maps
 *     to ≈84.896 km geopotential instead of the canonical table top 84.852 km;
 *     the last gradient layer (71 km, −2 K/km) simply extends those extra 44 m.
 *     Error vs the official table stays well inside the ±0.5 % budget.
 *  2. Above 86 km geometric the real USSA76 switches to a species-resolved
 *     hydrostatic integration; a flight simulator needs only "q ≈ 0" fidelity
 *     there, so we taper p = p86·exp(−(h−86 km)/7200 m) with T frozen at the
 *     86 km value (7200 m ≈ the local scale height R·T/g), and cut to hard
 *     vacuum (p = ρ = 0) above 150 km.
 */
import { G0, GAMMA_AIR, P0, R_AIR, R_EARTH, T0 } from './constants.ts';

export interface AtmoState {
  /** K */
  temperature: number;
  /** Pa */
  pressure: number;
  /** kg/m³ */
  density: number;
  /** m/s */
  speedOfSound: number;
}

/** Geopotential layer bases, m (USSA76 table 4). Layer i spans HB[i]..HB[i+1]. */
const HB = [0, 11000, 20000, 32000, 47000, 51000, 71000] as const;
/** Molecular-scale temperature lapse rates dT/dh', K/m (USSA76 table 4). */
const LAPSE = [-0.0065, 0, 0.001, 0.0028, 0, -0.0028, -0.002] as const;
const N_LAYERS = 7;

/**
 * Layer base temperatures and pressures, chained hydrostatically from
 * T0/P0 at module init (no hand-baked long decimals to drift from the
 * formulas below). Reproduces the canonical bases: 22632 Pa @ 11 km,
 * 5474.9 @ 20 km, 868.02 @ 32 km, 110.91 @ 47 km, 66.94 @ 51 km,
 * 3.956 @ 71 km (all geopotential).
 */
const TB = new Float64Array(N_LAYERS);
const PB = new Float64Array(N_LAYERS);
TB[0] = T0;
PB[0] = P0;
for (let i = 1; i < N_LAYERS; i++) {
  const L = LAPSE[i - 1]!;
  const dh = HB[i]! - HB[i - 1]!;
  const tb = TB[i - 1]!;
  TB[i] = tb + L * dh;
  PB[i] =
    L === 0
      ? PB[i - 1]! * Math.exp((-G0 * dh) / (R_AIR * tb)) // isothermal, USSA76 eq 33b
      : PB[i - 1]! * Math.pow(TB[i]! / tb, -G0 / (L * R_AIR)); // gradient, USSA76 eq 33a
}

/** Taper scale height above 86 km, m (≈ R_AIR·T86/g there). */
const H_TAPER = 7200;
/** Geometric altitude of the hard-vacuum cutoff, m. */
const H_VACUUM = 150e3;

/** Layered USSA76 state for 0 ≤ h ≤ 86 km geometric. */
function layerState(altitudeGeometric: number): AtmoState {
  // Geopotential altitude h' = R·h/(R+h) — USSA76 eq 18 with R_EARTH.
  const hgp = (R_EARTH * altitudeGeometric) / (R_EARTH + altitudeGeometric);
  let i = N_LAYERS - 1;
  while (i > 0 && hgp < HB[i]!) i--;
  const L = LAPSE[i]!;
  const tb = TB[i]!;
  const dh = hgp - HB[i]!;
  const T = tb + L * dh;
  const p =
    L === 0
      ? PB[i]! * Math.exp((-G0 * dh) / (R_AIR * tb)) // isothermal, USSA76 eq 33b
      : PB[i]! * Math.pow(T / tb, -G0 / (L * R_AIR)); // gradient, USSA76 eq 33a
  return {
    temperature: T,
    pressure: p,
    density: p / (R_AIR * T), // ideal gas, ρ = p/(R·T)
    speedOfSound: Math.sqrt(GAMMA_AIR * R_AIR * T), // a = √(γ·R·T)
  };
}

// Frozen 86 km state anchoring the taper (T ≈ 186.87 K, p ≈ 0.374 Pa).
const S86 = layerState(86e3);
const T86 = S86.temperature;
const P86 = S86.pressure;
const A86 = S86.speedOfSound;

/**
 * US Standard Atmosphere 1976 at a geometric altitude, m.
 * Negative altitudes clamp to sea level. Allocation-cheap: one result object,
 * no arrays — safe inside the RK4 derivative at ~100k evals/frame.
 */
export function atmosphere(altitudeGeometric: number): AtmoState {
  const h = altitudeGeometric < 0 ? 0 : altitudeGeometric;
  if (h <= 86e3) return layerState(h);
  if (h > H_VACUUM) {
    return { temperature: T86, pressure: 0, density: 0, speedOfSound: A86 };
  }
  // Exponential taper (approximation 2 in the header).
  const p = P86 * Math.exp(-(h - 86e3) / H_TAPER);
  return { temperature: T86, pressure: p, density: p / (R_AIR * T86), speedOfSound: A86 };
}
