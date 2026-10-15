/**
 * Solid motor synthesis: SolidMotorDesign → SolidPerformance, plus normalized
 * thrust-shape lookup for the three grain profiles. APCP at a fixed reference
 * chamber pressure of 6 MPa (typical mid-power composite motor MEOP band).
 * Strict SI: Pa, m², kg/s, N, s, m.
 */

import type { SolidMotorDesign, ThrustProfile } from '../types.ts';
import { G0, P0 } from '../constants.ts';
import { clamp, interpLinear } from '../interp.ts';
import { material } from '../materials.ts';
import {
  exitMachFromAreaRatio,
  exitPressureRatio,
  nozzleGeometry,
  thrustCoefficient,
} from './nozzle.ts';
import { combustionState, cstarIdeal, SOLID_DENSITY } from './propellants.ts';

export interface SolidPerformance {
  /** Time-averaged thrust at sea level, N (multiply by solidThrustAt for F(t)). */
  thrustAvg: number;
  ispVac: number;
  ispSL: number;
  /** Time-averaged mass flow, kg/s. */
  massFlowAvg: number;
  /** Case shell mass (cylinder + domes, welds/liner factor included), kg. */
  caseMass: number;
  /** Case cylinder length + nozzle length, m. */
  motorLength: number;
  throatArea: number;
  exitDiameter: number;
  nozzleLength: number;
}

/** Reference chamber pressure the motor is designed to, Pa. */
const PC_SOLID = 6e6;

/** Delivered-c* efficiency for solids (two-phase Al2O3 flow losses). */
const ETA_CSTAR_SOLID = 0.94;

/** Case design pressure: MEOP = 1.5·pc (ignition spike + grain-temp margin). */
const MEOP_FACTOR = 1.5;

/** Weld lands, insulation liner, igniter boss allowance on the shell mass. */
const CASE_MASS_FACTOR = 1.15;

/** Void fraction above the grain (nozzle entry + igniter cavity). */
const CASE_VOLUME_FACTOR = 1.1;

/**
 * Evaluate a solid motor of the given case diameter (m).
 * Performance (Sutton ch. 3, at fixed pc = 6 MPa):
 *   c* = 0.94·c*_ideal(APCP) → CF_vac/CF_SL (eq 3-30) → Isp = c*·CF / g0
 *   ṁ_avg = mp/tb → At = ṁ_avg·c* / pc (choked flow, eq 3-24) → F = ṁ·c*·CF.
 * Case: grain volume mp/1800 (+10% voids) as a cylinder of the given diameter;
 * wall from thin-wall hoop stress t = MEOP·r/σ_y at MEOP = 1.5·pc, clamped to
 * the material minimum gauge; shell area = lateral + two hemispherical domes
 * (4πr² = πd²); mass ×1.15 for welds/liner. Dome volume is credited to the
 * cylinder length (documented simplification — length is slightly generous).
 */
export function evaluateSolid(m: SolidMotorDesign, diameter: number): SolidPerformance {
  const state = combustionState('apcp', 0, PC_SOLID);
  const cstar = ETA_CSTAR_SOLID * cstarIdeal(state);

  const Me = exitMachFromAreaRatio(m.expansionRatio, state.gamma);
  const pe = PC_SOLID * exitPressureRatio(Me, state.gamma);
  const cfVac = thrustCoefficient(PC_SOLID, pe, 0, m.expansionRatio, state.gamma);
  const cfSL = thrustCoefficient(PC_SOLID, pe, P0, m.expansionRatio, state.gamma);

  const massFlowAvg = m.propellantMass / m.burnTime;
  const throatArea = (massFlowAvg * cstar) / PC_SOLID;
  const thrustAvg = massFlowAvg * cstar * cfSL;
  const geom = nozzleGeometry(throatArea, m.expansionRatio);

  const mat = material(m.caseMaterial);
  const r = diameter / 2;
  const caseVolume = (m.propellantMass / SOLID_DENSITY) * CASE_VOLUME_FACTOR;
  const caseLength = caseVolume / (Math.PI * r * r);
  const wall = Math.max((MEOP_FACTOR * PC_SOLID * r) / mat.yieldStrength, mat.minGauge);
  const shellArea = Math.PI * diameter * caseLength + Math.PI * diameter * diameter;
  const caseMass = shellArea * wall * mat.density * CASE_MASS_FACTOR;

  return {
    thrustAvg,
    ispVac: (cstar * cfVac) / G0,
    ispSL: (cstar * cfSL) / G0,
    massFlowAvg,
    caseMass,
    motorLength: caseLength + geom.length,
    throatArea,
    exitDiameter: geom.exitDiameter,
    nozzleLength: geom.length,
  };
}

/** 16 evenly spaced burn-fraction knots, i/15 for i = 0..15. */
const T_KNOTS: readonly number[] = Array.from({ length: 16 }, (_, i) => i / 15);

/**
 * Normalized thrust-shape tables, each integrating to 1 over tFrac ∈ [0,1]
 * (±2%), so F(t) = F_avg·shape(t/tb) conserves total impulse:
 * - progressive: linear ramp 0.75 → 1.25 (∫ = 1 exactly)
 * - neutral: flat 1.03 with a regressive tail as the web burns out (∫ ≈ 1.002)
 * - regressive: linear ramp 1.25 → 0.75 (∫ = 1 exactly)
 */
const SHAPES: Record<ThrustProfile, readonly number[]> = {
  progressive: T_KNOTS.map((t) => 0.75 + 0.5 * t),
  neutral: [
    1.03, 1.03, 1.03, 1.03, 1.03, 1.03, 1.03, 1.03, 1.03, 1.03, 1.03, 1.03, 1.03, 1.0, 0.85, 0.6,
  ],
  regressive: T_KNOTS.map((t) => 1.25 - 0.5 * t),
};

/** Normalized thrust multiplier at burn fraction tFrac (clamped to [0,1]). */
export function solidThrustAt(profile: ThrustProfile, tFrac: number): number {
  return interpLinear(T_KNOTS, SHAPES[profile], clamp(tFrac, 0, 1));
}
