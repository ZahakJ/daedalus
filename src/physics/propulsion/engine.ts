/**
 * Liquid engine synthesis: EngineDesign → EnginePerformance. Chains the
 * combustion tables (propellants.ts) through isentropic nozzle closed forms
 * (nozzle.ts), then applies per-cycle delivered efficiencies and mass models.
 * Strict SI: Pa, m², kg/s, N, s, K.
 */

import type { EngineCycle, EngineDesign, EnginePerformance } from '../types.ts';
import { G0, P0 } from '../constants.ts';
import {
  exitMachFromAreaRatio,
  exitPressureRatio,
  nozzleGeometry,
  thrustCoefficient,
} from './nozzle.ts';
import { bulkDensity, combustionState, cstarIdeal } from './propellants.ts';

interface CycleParams {
  /** Delivered-c* efficiency η_c* (combustion + injector losses), applied to
      cstarIdeal. Calibrated so the Merlin/RL10/Raptor anchors land inside
      ±3% given the baked CEA-lite grids (which sit ~2.5% below Sutton's
      shifting-equilibrium c* values — the cycle η absorbs that offset). */
  etaCstar: number;
  /** Engine thrust-to-weight (vacuum thrust / weight), dimensionless. */
  tw: number;
  /** Minimum stable throttle fraction for the cycle. */
  throttleFloor: number;
}

const CYCLES: Record<EngineCycle, CycleParams> = {
  'pressure-fed': { etaCstar: 0.94, tw: 35, throttleFloor: 0.4 },
  'gas-generator': { etaCstar: 0.98, tw: 90, throttleFloor: 0.6 },
  'electric-pump': { etaCstar: 0.96, tw: 70, throttleFloor: 0.3 },
  'staged-combustion': { etaCstar: 0.985, tw: 110, throttleFloor: 0.55 },
};

/** Gas-generator open-cycle Isp fraction: ~2.5% of the flow leaves through the
    turbine exhaust at ~1/6 core exhaust velocity → 0.975 + 0.025/6 ≈ 0.979.
    Applied as mdot_total = mdot_core/0.979 with thrust unchanged, so
    F = mdot_core·c*·CF relations stay consistent. */
const GG_ISP_FRACTION = 0.979;

/** Fixed valves/actuators mass per engine, kg. */
const VALVE_MASS = 8;

/** Battery pack specific energy: 250 Wh/kg = 250·3600 J/kg = 9e5 J/kg. */
const BATTERY_J_PER_KG = 250 * 3600;

/** Electric pump hydraulic·electric efficiency chain. */
const PUMP_EFFICIENCY = 0.65;

/** Summerfield criterion: nozzle flow separates when pe < 0.35·pa. */
const SEPARATION_FRACTION = 0.35;

/**
 * Evaluate one liquid engine. Sizing chain (Sutton ch. 3):
 *   combustion state → c*_delivered = η_c*·c*_ideal (Sutton eq 3-32)
 *   Me from ε (eq 3-14 inverse) → pe = pc·(1+((γ−1)/2)Me²)^(−γ/(γ−1)) (eq 3-13)
 *   CF_vac, CF_SL (eq 3-30) → At = F_vac/(CF_vac·pc) → ṁ = pc·At/c* (eq 3-24)
 *   F = CF·pc·At, Isp = c*·CF/g0
 * `stagePropellantMass` (kg, whole stage) sets the burn time used only for
 * electric-pump battery sizing; batteryMass is 0 for every other cycle.
 */
export function evaluateEngine(d: EngineDesign, stagePropellantMass: number): EnginePerformance {
  const cyc = CYCLES[d.cycle];
  const pc = d.chamberPressure;
  const eps = d.expansionRatio;
  const state = combustionState(d.propellant, d.mixtureRatio, pc);
  const cstar = cyc.etaCstar * cstarIdeal(state);

  const Me = exitMachFromAreaRatio(eps, state.gamma);
  const exitPressure = pc * exitPressureRatio(Me, state.gamma);
  const cfVac = thrustCoefficient(pc, exitPressure, 0, eps, state.gamma);
  const cfSL = thrustCoefficient(pc, exitPressure, P0, eps, state.gamma);

  // Throat sized to hit the vacuum thrust target exactly.
  const throatArea = d.vacuumThrust / (cfVac * pc);
  const mdotCore = (pc * throatArea) / cstar;
  // Open-cycle bleed: turbine exhaust flow is extra propellant that buys no
  // core thrust — total flow rises, Isp falls by GG_ISP_FRACTION.
  const massFlow = d.cycle === 'gas-generator' ? mdotCore / GG_ISP_FRACTION : mdotCore;

  const thrustVac = cfVac * pc * throatArea;
  const thrustSL = cfSL * pc * throatArea;
  const ispVac = thrustVac / (massFlow * G0);
  const ispSL = thrustSL / (massFlow * G0);

  const geom = nozzleGeometry(throatArea, eps);

  // Dry mass: TW on vacuum thrust, +0.4%/unit ε beyond 15 (big bells are
  // heavy), + fixed valve/actuator allowance.
  const engineMass =
    (thrustVac / (G0 * cyc.tw)) * (1 + 0.004 * Math.max(0, eps - 15)) + VALVE_MASS;

  // Electric-pump battery: pump power = ṁ·Δp/(ρ·η) with Δp = 1.25·pc, energy
  // over the stage burn, ×1.2 pack margin (depth-of-discharge + BMS).
  let batteryMass = 0;
  if (d.cycle === 'electric-pump') {
    const burnTime = stagePropellantMass / (massFlow * d.count);
    const deltaP = 1.25 * pc;
    const rhoBulk = bulkDensity(d.propellant, d.mixtureRatio);
    const pumpPower = (massFlow * deltaP) / (rhoBulk * PUMP_EFFICIENCY);
    batteryMass = ((pumpPower * burnTime) / BATTERY_J_PER_KG) * 1.2;
  }

  // Pressure-fed tanks must push the full injector drop; pumped cycles only
  // need NPSH head at the pump inlet.
  const feedPressure = d.cycle === 'pressure-fed' ? 1.3 * pc + 0.5e6 : 0.25e6;

  return {
    thrustVac,
    thrustSL,
    ispVac,
    ispSL,
    massFlow,
    throatArea,
    throatDiameter: geom.throatDiameter,
    exitArea: eps * throatArea,
    exitDiameter: geom.exitDiameter,
    nozzleLength: geom.length,
    exitPressure,
    cstar,
    chamberTemp: state.chamberTemp,
    gamma: state.gamma,
    molarMass: state.molarMass,
    engineMass,
    batteryMass,
    feedPressure,
    throttleFloor: cyc.throttleFloor,
    separationAtSL: exitPressure < SEPARATION_FRACTION * P0,
  };
}

/** Minimum throttle fraction for a cycle (same value as EnginePerformance.throttleFloor). */
export function engineThrottleRange(cycle: EngineCycle): number {
  return CYCLES[cycle].throttleFloor;
}
