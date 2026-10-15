/**
 * Combustion-products lookup — NO equilibrium solver. Baked tables digested
 * from NASA CEA runs at reference pc = 7 MPa, cross-checked against Sutton,
 * Rocket Propulsion Elements 9th ed, tables 5-5/5-6. Grids bracket the
 * optimum mixture ratio: Tc peaks near stoichiometric-optimum and falls off
 * both fuel-rich and ox-rich; molar mass rises monotonically with MR
 * (heavier oxidized products); γ drifts down as Tc and dissociation rise.
 * Strict SI: K, kg/kmol, Pa, kg/m³, m/s.
 */

import type { LiquidPropellantId, PropellantId } from '../types.ts';
import { R_UNIVERSAL } from '../constants.ts';
import { clamp, monotoneCubic } from '../interp.ts';
import { vandenkerckhove } from './nozzle.ts';

export interface CombustionState {
  /** Chamber (stagnation) temperature, K. */
  chamberTemp: number;
  /** Mean molar mass of combustion products, kg/kmol. */
  molarMass: number;
  /** Ratio of specific heats of the products. */
  gamma: number;
}

interface ComboGrid {
  mr: readonly number[];
  tc: readonly number[];
  mm: readonly number[];
  g: readonly number[];
}

/** CEA-digested grids at pc = 7 MPa. Anchor rows (optimum MR) match Sutton. */
const GRIDS: Record<LiquidPropellantId, ComboGrid> = {
  'lox-rp1': {
    mr: [1.8, 2.0, 2.1, 2.3, 2.5, 2.8],
    tc: [3390, 3560, 3625, 3670, 3650, 3560],
    mm: [21.0, 22.1, 22.6, 23.3, 23.9, 24.7],
    g: [1.245, 1.232, 1.227, 1.22, 1.217, 1.215],
  },
  'lox-ch4': {
    mr: [2.8, 3.1, 3.4, 3.6, 3.8, 4.0],
    tc: [3320, 3450, 3530, 3550, 3540, 3500],
    mm: [19.2, 20.0, 20.8, 21.4, 21.9, 22.4],
    g: [1.225, 1.215, 1.206, 1.2, 1.197, 1.195],
  },
  'lox-lh2': {
    mr: [4.0, 4.8, 5.5, 6.0, 6.5, 7.0],
    tc: [2980, 3220, 3370, 3430, 3420, 3380],
    mm: [10.0, 11.4, 12.5, 13.3, 14.0, 14.7],
    g: [1.2, 1.17, 1.15, 1.14, 1.135, 1.13],
  },
  'nto-mmh': {
    mr: [1.6, 1.8, 2.0, 2.1, 2.2, 2.4],
    tc: [3180, 3300, 3380, 3400, 3395, 3350],
    mm: [20.6, 21.4, 22.2, 22.6, 23.0, 23.7],
    g: [1.25, 1.243, 1.235, 1.23, 1.228, 1.224],
  },
};

/** APCP (solid) products at pc = 7 MPa — MR is fixed by the grain, ignored. */
const APCP: CombustionState = { chamberTemp: 3200, molarMass: 26.0, gamma: 1.18 };

/** Monotone-cubic evaluators built once per combo (pure, deterministic). */
const EVALS: Record<
  LiquidPropellantId,
  { tc: (x: number) => number; mm: (x: number) => number; g: (x: number) => number }
> = {
  'lox-rp1': buildEvals('lox-rp1'),
  'lox-ch4': buildEvals('lox-ch4'),
  'lox-lh2': buildEvals('lox-lh2'),
  'nto-mmh': buildEvals('nto-mmh'),
};

function buildEvals(id: LiquidPropellantId) {
  const grid = GRIDS[id];
  return {
    tc: monotoneCubic(grid.mr, grid.tc),
    mm: monotoneCubic(grid.mr, grid.mm),
    g: monotoneCubic(grid.mr, grid.g),
  };
}

/** Reference chamber pressure of the baked CEA grids, Pa. */
const PC_REF = 7e6;

/**
 * Combustion state vs mixture ratio and chamber pressure. MR is clamped to
 * the combo's grid; the chamber-pressure dissociation correction
 * Tc = Tc_ref·(pc/7 MPa)^0.015 (higher pc suppresses dissociation, CEA
 * trend) is clamped to ±4% of Tc_ref. 'apcp' ignores mixtureRatio.
 */
export function combustionState(
  id: PropellantId,
  mixtureRatio: number,
  chamberPressure: number,
): CombustionState {
  if (id === 'apcp') {
    return { ...APCP, chamberTemp: pcCorrected(APCP.chamberTemp, chamberPressure) };
  }
  const grid = GRIDS[id];
  const ev = EVALS[id];
  const mr = clamp(mixtureRatio, grid.mr[0]!, grid.mr[grid.mr.length - 1]!);
  return {
    chamberTemp: pcCorrected(ev.tc(mr), chamberPressure),
    molarMass: ev.mm(mr),
    gamma: ev.g(mr),
  };
}

/** Tc_ref·(pc/7 MPa)^0.015, clamped to ±4% of Tc_ref (dissociation trend). */
function pcCorrected(tcRef: number, pc: number): number {
  return tcRef * clamp(Math.pow(pc / PC_REF, 0.015), 0.96, 1.04);
}

/**
 * Ideal characteristic velocity, Sutton eq 3-32:
 * c* = √(γ·(R/M̄)·Tc)/(γ·(2/(γ+1))^((γ+1)/(2(γ−1)))) ≡ √((R/M̄)·Tc)/Γ(γ)
 * with Γ the Vandenkerckhove function. (The form √(γRTc)/Γ overpredicts by
 * √γ and does not match Sutton table 5-5 values — do not "simplify" to it.)
 */
export function cstarIdeal(s: CombustionState): number {
  const R = R_UNIVERSAL / s.molarMass;
  return Math.sqrt(R * s.chamberTemp) / vandenkerckhove(s.gamma);
}

/** Bulk (tanked) propellant densities, kg/m³ — NIST/handbook boiling-point
    values for cryogens, 293 K for storables. */
const DENSITIES: Record<
  LiquidPropellantId,
  { ox: number; fuel: number; oxCryo: boolean; fuelCryo: boolean }
> = {
  'lox-rp1': { ox: 1141, fuel: 810, oxCryo: true, fuelCryo: false },
  'lox-ch4': { ox: 1141, fuel: 423, oxCryo: true, fuelCryo: true },
  'lox-lh2': { ox: 1141, fuel: 71, oxCryo: true, fuelCryo: true },
  'nto-mmh': { ox: 1440, fuel: 880, oxCryo: false, fuelCryo: false },
};

/**
 * Mass-weighted harmonic-mean bulk density of a loaded stage:
 * 1/ρ_bulk = (mr/(1+mr))/ρ_ox + (1/(1+mr))/ρ_fuel
 */
export function bulkDensity(id: LiquidPropellantId, mixtureRatio: number): number {
  const d = DENSITIES[id];
  const oxFrac = mixtureRatio / (1 + mixtureRatio);
  return 1 / (oxFrac / d.ox + (1 - oxFrac) / d.fuel);
}

/** Tanked densities and cryogenic flags (insulation/boiloff drivers). */
export function propellantDensities(id: LiquidPropellantId): {
  ox: number;
  fuel: number;
  oxCryo: boolean;
  fuelCryo: boolean;
} {
  return { ...DENSITIES[id] };
}

/** APCP grain density, kg/m³ (typical 88%-solids composite). */
export const SOLID_DENSITY = 1800;

/** Display names + relative cost index (LOX/RP-1 ≡ 1; hypergols dominated by
    toxic-handling ops, LH2 by liquefaction energy). */
const INFO: Record<PropellantId, { name: string; costIndex: number }> = {
  apcp: { name: 'APCP (solid)', costIndex: 5 },
  'lox-rp1': { name: 'LOX / RP-1', costIndex: 1 },
  'lox-ch4': { name: 'LOX / CH₄', costIndex: 0.9 },
  'lox-lh2': { name: 'LOX / LH₂', costIndex: 4 },
  'nto-mmh': { name: 'NTO / MMH', costIndex: 12 },
};

export function propellantInfo(id: PropellantId): { name: string; costIndex: number } {
  return { ...INFO[id] };
}
