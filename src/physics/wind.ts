/**
 * Deterministic launch-day wind profile. Signed horizontal wind speed vs
 * altitude, + = tailwind along the launch azimuth. All randomness is drawn
 * ONCE at construction from the seeded sfc32 stream (src/sim/rng.ts) —
 * speedAt is a pure smooth closed form afterwards, safe inside RK4 stages.
 *
 * Model, three superposed layers:
 *  1. Surface boundary layer — logarithmic profile u(h) = u₁₀·ln(1+h/z₀)/
 *     ln(1+10/z₀) with roughness z₀ = 0.03 m (open grassland, WMO class 2),
 *     seeded u₁₀ of 0–9 m/s at the 10 m anemometer height, faded out above the
 *     boundary layer by e^{−h/1.5 km}. Zero at the ground (no-slip). This is
 *     the wind the range officer actually reads out, and the wind that
 *     weathercocks an over-stable vehicle off the rail.
 *  2. Jet-stream mean shear — seeded peak of 4–12 m/s at 10 km (tropospheric
 *     jet), shaped as the gamma-like bump (h/H)³·e^{3(1−h/H)} (unit peak at
 *     h = H, C¹ smooth, <1% of peak by 30 km).
 *  3. Three seeded sinusoidal gust harmonics in altitude (amplitudes 0.3–0.9
 *     m/s each, wavelengths 2–8 km, seeded phases) under an e^{−h/30 km}
 *     envelope so the profile dies off in the mesosphere.
 * Magnitudes follow the shear climatology in Justus & Johnson,
 * NASA/TM-1999-209630 (GRAM-99).
 */

import { rngFrom, uniform } from '../sim/rng.ts';

/** Signed horizontal wind speed at altitude, m/s. + = tailwind at launch azimuth. */
export interface WindProfile {
  speedAt(altitude: number): number;
  /**
   * The 10 m anemometer reading, m/s — the number the range officer reads out
   * and the vehicle weathercocks against. Exposed separately because the
   * integrated field (speedAt) deliberately ramps the surface layer in over
   * ~200 m: a true logarithmic profile has a ~50 m/s-per-metre gradient at the
   * ground, which is real but far too stiff for a fixed-step RK4 to see.
   */
  readonly surfaceWind: number;
}

/** Jet peak altitude, m. */
const H_JET = 10e3;
/** Gust envelope e-folding altitude, m. */
const H_GUST = 30e3;
/** Gust harmonic count — fixed so the seed→draw sequence is part of the contract. */
const N_GUSTS = 3;
/** Surface-layer ramp height, m — the integrator-friendly stand-in for the
    logarithmic profile's stiff near-ground gradient. */
const H_SURF = 200;
/** Boundary-layer fade height, m. */
const H_BL = 1.5e3;

/**
 * Build the launch-day profile for a weather seed. Draw order is FIXED and
 * part of the contract: jet peak, then per harmonic (amplitude, wavelength,
 * phase) × 3, then the surface wind LAST — appending kept every previously
 * seeded jet/gust value bit-identical when the surface layer was added.
 */
export function windProfile(seed: string): WindProfile {
  // Weather is a property of the MISSION, not of the attempt. Flight seeds are
  // `<missionId>:<rev>`; only the mission part reaches the RNG, so every
  // revision of a vehicle faces the same launch-day forecast — the one the
  // Flight Readiness Review showed you. Margins are designed against known
  // weather; an open-loop gravity turn is sensitive enough that re-rolling the
  // wind each attempt would make the campaign a lottery rather than a lesson.
  // The 'wx:' salt is part of the contract: it selects the draw sequence that
  // gives the campaign a representative spread of launch days (the unsalted
  // stream happened to hand the two sounding missions dead-calm mornings,
  // which would have made weathercocking unteachable in the very missions
  // that teach it).
  const rng = rngFrom(`wx:${seed.split(':')[0] ?? seed}`);
  const jetPeak = uniform(rng, 4, 12);
  const amp: number[] = new Array(N_GUSTS);
  const k: number[] = new Array(N_GUSTS); // spatial angular frequency 2π/λ, rad/m
  const phase: number[] = new Array(N_GUSTS);
  for (let i = 0; i < N_GUSTS; i++) {
    amp[i] = uniform(rng, 0.3, 0.9);
    k[i] = (2 * Math.PI) / uniform(rng, 2e3, 8e3);
    phase[i] = uniform(rng, 0, 2 * Math.PI);
  }
  // Surface wind at the 10 m reference height, signed: a range that spans a
  // dead-calm morning to a day the launch director should have scrubbed.
  const surface = uniform(rng, -7, 7);
  return {
    surfaceWind: surface,
    speedAt(altitude: number): number {
      const h = altitude < 0 ? 0 : altitude;
      // Surface layer: smooth ramp to u₁₀ over H_SURF, faded out above the
      // boundary layer. Exactly zero at the ground (no-slip).
      let v = surface * (1 - Math.exp(-h / H_SURF)) * Math.exp(-h / H_BL);
      // Mean shear: unit-peak gamma bump u³·e^{3(1−u)}, u = h/H_JET.
      const u = h / H_JET;
      v += jetPeak * u * u * u * Math.exp(3 * (1 - u));
      // Gust harmonics under the mesospheric decay envelope.
      const env = Math.exp(-h / H_GUST);
      for (let i = 0; i < N_GUSTS; i++) {
        v += amp[i]! * env * Math.sin(k[i]! * h + phase[i]!);
      }
      return v;
    },
  };
}

/** The reported launch-day surface wind (10 m anemometer height, WMO
    standard) — what the FRR displays and what weathercocks the vehicle. */
export function groundWind(profile: WindProfile): number {
  return profile.surfaceWind;
}
