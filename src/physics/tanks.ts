/**
 * Propellant tank sizing: wall gauges, shell/pressurant/COPV/insulation masses,
 * and LH2 boiloff. Pure functions of the design; strict SI (m, kg, s, Pa, K).
 * Geometry model: cylindrical barrel with 2:1 ellipsoidal domes (dome height
 * r/2), the standard launch-vehicle tank closure (Huzel & Huang ch. 8).
 */

import { M_HELIUM, R_UNIVERSAL } from './constants';
import type { Material } from './materials';
import { material } from './materials';
import { propellantDensities } from './propulsion/propellants';
import type { StageDesign, TankReport } from './types';

/** Ullage volume factor — 4% gas space above the liquid (industry 3–5%). */
const ULLAGE = 1.04;

/** Autogenous-pressurization MEOP floor, Pa — even pump-fed tanks hold ~2.5 bar
    for pump NPSH and structural stiffness (Falcon 9 / Saturn practice). */
const MEOP_FLOOR = 0.25e6;

/** Shell non-optimum factor: weld lands, slosh baffles, sumps, outlets. */
const NON_OPTIMUM = 1.12;

/** Surface area of a 2:1 ellipsoidal dome PAIR ≈ 2·1.38·πr² (exact oblate
    surface integral gives 1.3801·πr² per dome at 2:1 aspect). */
const DOME_PAIR_AREA_COEF = 2 * 1.38 * Math.PI;

/** Helium pressurant sizing (Huzel & Huang ch. 5): collapse factor covers
    heat loss into cold ullage; 250 K effective delivered-gas temperature. */
const HE_COLLAPSE = 1.6;
const T_HE_DELIVERED = 250;
/** COPV storage state: 31 MPa at 290 K; ti-6al4v sphere, SF 1.5, 1.3 for
    boss/liner/overwrap non-optimum. */
const P_COPV = 31e6;
const T_HE_STORED = 290;
const COPV_SF = 1.5;
const COPV_NON_OPTIMUM = 1.3;

/** Cryo insulation areal density, kg/m² (SOFI-class spray-on foam). */
const INSULATION_AREAL = 1.5;

/**
 * Pressure-vessel wall gauges from thin-wall membrane theory:
 * cylinder hoop stress σ_θ = p·r/t (Barlow) → t = MEOP·r·SF/σ_y;
 * a 2:1 ellipsoidal dome crown carries half the hoop stress → t_dome = t/2.
 * Both gauges are clamped up to the material minimum manufacturable gauge;
 * `minGaugeLimited` reports the CYLINDER clamp only (the dome, at t/2, clamps
 * long before the sizing-governing barrel does).
 */
export function wallThickness(
  meop: number,
  radius: number,
  safetyFactor: number,
  mat: Material,
): { cylinder: number; dome: number; minGaugeLimited: boolean } {
  const tCyl = (meop * radius * safetyFactor) / mat.yieldStrength;
  const tDome = tCyl / 2;
  return {
    cylinder: Math.max(tCyl, mat.minGauge),
    dome: Math.max(tDome, mat.minGauge),
    minGaugeLimited: tCyl < mat.minGauge,
  };
}

/**
 * Size both propellant tanks of a liquid stage and fill the TankReport.
 *
 * - Propellant split by O/F mixture ratio; volumes at tanked density × 4% ullage.
 * - Each tank: cylinder radius r = diameter/2, 2:1 ellipsoidal domes (height
 *   r/2); dome-pair volume = (2/3)πr³ (the full 2:1 oblate ellipsoid); the
 *   barrel takes the remaining volume. For stubby tanks the domes alone can
 *   exceed the required volume — barrel length clamps to 0 and the tank
 *   over-provides (accepted; the blueprint draws a near-oblate tank).
 * - MEOP = max(feedPressure, 0.25 MPa autogenous floor); pressure-fed cycles
 *   pass their large feedPressure and eat the mass spiral.
 * - Shell mass = (2πr·Lcyl + 2·1.38·πr²)·t_cyl·ρ·1.12 — single cylinder gauge
 *   over the whole shell (weld-land/baffle non-optimum absorbs the dome
 *   taper), Huzel & Huang non-optimum practice.
 * - Common bulkhead deletes one dome pair's mass (totalMass only). The 0.4 m
 *   stack-length credit is NOT representable in per-tank lengths, so oxLength
 *   and fuelLength are reported unchanged; the stage stacker owns that credit.
 * - Helium pressurant: ideal gas at MEOP filling both ullaged volumes with
 *   collapse factor 1.6 at 250 K delivered; COPV is a ti-6al4v sphere storing
 *   it at 31 MPa / 290 K, membrane t = p·r·SF/(2σ_y) (sphere stress is half
 *   the cylinder hoop value).
 * - Insulation (if configured): 1.5 kg/m² × wetted shell area of both tanks.
 * - burstPressure = t_actual·σ_y/r — cylinder hoop governs burst.
 *
 * Throws for solid stages (the motor case is the tank) and for liquid stages
 * missing their TankConfig.
 */
export function sizeStageTanks(stage: StageDesign, feedPressure: number): TankReport {
  if (stage.propulsion.kind !== 'liquid') {
    throw new Error('sizeStageTanks: liquid stages only (solid motor case is the tank)');
  }
  const tanks = stage.tanks;
  if (!tanks) throw new Error('sizeStageTanks: liquid stage requires a TankConfig');

  const { engine, propellantMass } = stage.propulsion;
  const mat = material(tanks.material);
  const dens = propellantDensities(engine.propellant);
  const mr = engine.mixtureRatio;

  const oxPropMass = (propellantMass * mr) / (1 + mr);
  const fuelPropMass = propellantMass / (1 + mr);
  const oxVolume = (oxPropMass / dens.ox) * ULLAGE;
  const fuelVolume = (fuelPropMass / dens.fuel) * ULLAGE;

  const r = stage.diameter / 2;
  const meop = Math.max(feedPressure, MEOP_FLOOR);
  const wall = wallThickness(meop, r, tanks.safetyFactor, mat);
  const t = wall.cylinder;

  // 2:1 ellipsoid dome pair: volume (4/3)πr²·(r/2) = (2/3)πr³, area 2·1.38·πr².
  const domePairVolume = (2 / 3) * Math.PI * r * r * r;
  const domePairArea = DOME_PAIR_AREA_COEF * r * r;

  const tank = (volume: number): { length: number; area: number } => {
    const barrelLength = Math.max(0, volume - domePairVolume) / (Math.PI * r * r);
    return {
      // total length = barrel + two dome heights of r/2.
      length: barrelLength + r,
      area: 2 * Math.PI * r * barrelLength + domePairArea,
    };
  };
  const ox = tank(oxVolume);
  const fuel = tank(fuelVolume);

  const shellMass = (area: number): number => area * t * mat.density * NON_OPTIMUM;
  const oxMass = shellMass(ox.area);
  const fuelMass = shellMass(fuel.area);
  // Common bulkhead: the merged inter-propellant dome deletes one dome pair.
  const bulkheadCredit = tanks.commonBulkhead ? shellMass(domePairArea) : 0;

  // Pressurant: m_He = k_collapse·MEOP·V_total / (R_He·T_delivered), ideal gas.
  const rHe = R_UNIVERSAL / M_HELIUM;
  const totalVolume = oxVolume + fuelVolume;
  const pressurantMass = (HE_COLLAPSE * meop * totalVolume) / (rHe * T_HE_DELIVERED);

  // COPV: stored-gas volume at 31 MPa / 290 K, spherical ti-6al4v vessel.
  const copvVolume = (pressurantMass * rHe * T_HE_STORED) / P_COPV;
  const copvRadius = Math.cbrt((3 * copvVolume) / (4 * Math.PI));
  const ti = material('ti-6al4v');
  // Sphere membrane stress σ = p·r/(2t) → t = p·r·SF/(2σ_y).
  const copvWall = Math.max((P_COPV * copvRadius * COPV_SF) / (2 * ti.yieldStrength), ti.minGauge);
  const copvMass = 4 * Math.PI * copvRadius * copvRadius * copvWall * ti.density * COPV_NON_OPTIMUM;

  const insulationMass = tanks.insulated ? INSULATION_AREAL * (ox.area + fuel.area) : 0;

  return {
    oxWall: t,
    fuelWall: t,
    meop,
    oxMass,
    fuelMass,
    pressurantMass,
    copvMass,
    insulationMass,
    totalMass: oxMass + fuelMass - bulkheadCredit + pressurantMass + copvMass + insulationMass,
    oxLength: ox.length,
    fuelLength: fuel.length,
    minGaugeLimited: wall.minGaugeLimited,
    burstPressure: (t * mat.yieldStrength) / r,
  };
}

/**
 * LH2 boiloff mass-flow, kg/s: 0.2%/hour of remaining mass with SOFI-class
 * insulation (Centaur/SLS flight experience), 5× that for a bare tank.
 * Proportional-to-remaining is the standard first-order heat-leak model.
 */
export function boiloffRate(lh2MassRemaining: number, insulated: boolean): number {
  const insulatedRate = (0.002 / 3600) * lh2MassRemaining;
  return insulated ? insulatedRate : 5 * insulatedRate;
}
