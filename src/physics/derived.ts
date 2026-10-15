/**
 * Tier-1 design-time evaluators: pure algebra, <1 ms, run on every slider
 * tick. The trajectory sim (tier 2) is the truth; these are the instant
 * readouts that make the bureau feel alive.
 */
import { G0, P0 } from './constants.ts';
import type {
  DerivedPerformance,
  DesignFlag,
  MarginReport,
  RocketDesign,
  StabilityReport,
  StagePerf,
} from './types.ts';
import { computeVehicleMass, vehicleCG, type VehicleMass } from './mass.ts';
import { propellantDensities } from './propulsion/propellants.ts';
import { material } from './materials.ts';
import { finsCN, noseCN, railExitSpeed, staticMarginCalibers, totalCP, flutterSpeed } from './stability.ts';
import { axialCapability, jointLoads, jointMargin } from './structures.ts';
import { atmosphere } from './atmosphere.ts';

/** Cost units: a deliberately simple, fully explained bill of materials. */
function computeCost(design: RocketDesign, vm: VehicleMass): number {
  let cost = 0;
  for (let i = 0; i < design.stages.length; i++) {
    const s = design.stages[i]!;
    const bd = vm.stages[i]!;
    if (s.propulsion.kind === 'liquid') {
      const e = s.propulsion.engine;
      const cycleFactor = { 'pressure-fed': 1, 'gas-generator': 2.6, 'electric-pump': 1.8, 'staged-combustion': 4.2 }[e.cycle];
      // Engines: thrust class × cycle complexity.
      cost += (e.vacuumThrust / 1e4) * cycleFactor * e.count * 0.9;
      // Tanks: shell mass × material cost index.
      const matCost = material(s.tanks?.material ?? 'al-2219').costIndex;
      cost += ((bd.tank?.oxMass ?? 0) + (bd.tank?.fuelMass ?? 0)) * matCost * 0.05;
      cost += (bd.tank?.copvMass ?? 0) * 0.6;
      if (s.tanks?.commonBulkhead) cost += 30; // manufacturing premium
    } else {
      cost += s.propulsion.motor.propellantMass * 0.12 + bd.dry * 0.25;
    }
    cost += bd.interstage * 0.08;
  }
  cost += vm.upperDry * 0.15;
  return cost;
}

export function computeDerived(design: RocketDesign): DerivedPerformance {
  const vm = computeVehicleMass(design);
  const n = design.stages.length;
  const stages: StagePerf[] = [];

  // Stack masses top-down first: mass above stage i = payload works + stages > i.
  const aboveMass: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    let m = vm.upperDry;
    for (let j = i + 1; j < n; j++) m += vm.stages[j]!.dry + vm.stages[j]!.propellant;
    aboveMass[i] = m;
  }

  let totalDeltaV = 0;
  for (let i = 0; i < n; i++) {
    const bd = vm.stages[i]!;
    const s = design.stages[i]!;
    // Fairing drops with stage 0 in reality; for the Δv ladder keep it simple
    // (small error, the sim is the truth).
    const ignitionMass = aboveMass[i]! + bd.dry + bd.propellant;
    const burnoutMass = aboveMass[i]! + bd.dry;

    let thrustSL = 0;
    let thrustVac = 0;
    let ispSL = 0;
    let ispVac = 0;
    let burnTime = 0;
    if (s.propulsion.kind === 'liquid') {
      const e = bd.engine!;
      const count = s.propulsion.engine.count;
      thrustSL = Math.max(0, e.thrustSL) * count;
      thrustVac = e.thrustVac * count;
      ispSL = e.ispSL;
      ispVac = e.ispVac;
      burnTime = bd.propellant / (e.massFlow * count);
    } else {
      const sp = bd.solid!;
      thrustSL = sp.thrustAvg;
      thrustVac = sp.thrustAvg * (sp.ispVac / sp.ispSL);
      ispSL = sp.ispSL;
      ispVac = sp.ispVac;
      burnTime = s.propulsion.motor.burnTime;
    }

    const deltaV = ispVac * G0 * Math.log(ignitionMass / burnoutMass);
    totalDeltaV += deltaV;
    stages.push({
      ignitionMass,
      burnoutMass,
      dryMass: bd.dry,
      propellantMass: bd.propellant,
      propellantMassFraction: bd.propellant / (bd.dry + bd.propellant),
      thrustSL,
      thrustVac,
      ispSL,
      ispVac,
      twrIgnition: thrustSL > 0 ? thrustSL / (ignitionMass * G0) : thrustVac / (ignitionMass * G0),
      twrBurnout: thrustVac / (burnoutMass * G0),
      burnTime,
      deltaV,
    });
  }

  return { stages, totalDeltaV, glow: vm.glow, massTree: vm.tree, cost: computeCost(design, vm) };
}

/** CP/CG stability at a propellant fraction (sounding-rocket chain). */
export function stabilityReport(design: RocketDesign, propellantFraction: number): StabilityReport {
  const vm = computeVehicleMass(design);
  const { cg, totalMass, totalLength } = vehicleCG(vm, design, propellantFraction);
  const d = design.stages[0]!.diameter;

  const components = [noseCN(design.noseShape, vm.noseLength)];
  let cnAlpha = components[0]!.cnAlpha;
  let cp = components[0]!.xcp;
  let flutter = Infinity;
  if (design.fins) {
    const finRootLE = totalLength - design.fins.rootChord - 0.05;
    const fins = finsCN(design.fins, d, finRootLE);
    const tot = totalCP([...components, fins]);
    cnAlpha = tot.cnAlpha;
    cp = tot.xcp;
    const mat = material(design.fins.material);
    const atmo = atmosphere(0);
    flutter = flutterSpeed(design.fins, mat.modulus / 2.6, atmo.pressure, atmo.speedOfSound);
  }

  const derived = computeDerived(design);
  const twr = derived.stages[0]!.twrIgnition;
  return {
    cg,
    cp,
    marginCalibers: staticMarginCalibers(cp, cg, d),
    cnAlpha,
    flutterSpeed: flutter,
    railExitSpeed: design.launch.railLength > 0 ? railExitSpeed(twr, design.launch.railLength) : NaN,
  };
}

/** Design-time structural margin envelope (max-Q 35 kPa @ 2° AoA, max thrust). */
export function structuralMargins(design: RocketDesign): MarginReport[] {
  const vm = computeVehicleMass(design);
  const derived = computeDerived(design);
  const out: MarginReport[] = [];
  const qEnvelope = 35e3;
  const aoaEnvelope = (2 * Math.PI) / 180;

  for (let i = 0; i < design.stages.length; i++) {
    const s = design.stages[i]!;
    const bd = vm.stages[i]!;
    const r = s.diameter / 2;
    const refArea = Math.PI * r * r;
    let massAbove = vm.upperDry;
    for (let j = i + 1; j < design.stages.length; j++)
      massAbove += vm.stages[j]!.dry + vm.stages[j]!.propellant;

    const accel = (derived.stages[i]!.thrustVac / derived.stages[i]!.burnoutMass) as number;
    const mat = s.propulsion.kind === 'liquid' ? material(s.tanks?.material ?? 'al-2219') : material(s.propulsion.motor.caseMaterial);
    // Wall from tank sizing (liquid) or case (solid): approximate with hoop-sized wall.
    const t = bd.tank ? bd.tank.oxWall : Math.max(mat.minGauge, 1.5e-3);
    const pressStab = bd.tank ? bd.tank.meop * 0.8 : 0;
    const cap = axialCapability(mat, t, r, pressStab);

    for (const [phase, q, acc] of [
      ['max-q', qEnvelope, accel * 0.6],
      ['max-accel', 2e3, accel],
    ] as const) {
      const load = jointLoads(massAbove + bd.dry * 0.4, acc, q, aoaEnvelope, 4 + (design.fins ? 8 : 0), refArea, bd.length * 0.5);
      out.push({
        joint: `stage${i + 1}-wall`,
        phase,
        margin: jointMargin(cap, load, r),
      });
    }
  }
  return out;
}

/** Pre-flight risk flags: launch day confirms, never ambushes. */
export function designWarnings(design: RocketDesign): DesignFlag[] {
  const flags: DesignFlag[] = [];
  const derived = computeDerived(design);
  const vm = computeVehicleMass(design);

  const twr0 = derived.stages[0]!.twrIgnition;
  if (twr0 < 1.05) {
    flags.push({ id: 'twr-low', severity: 'danger', message: `Liftoff T/W ${twr0.toFixed(2)} — the vehicle will crawl or sit on the pad burning propellant.`, lessonId: 'twr' });
  } else if (twr0 < 1.25) {
    flags.push({ id: 'twr-marginal', severity: 'warning', message: `Liftoff T/W ${twr0.toFixed(2)} — heavy gravity losses; consider more thrust or less mass.`, lessonId: 'twr' });
  }

  for (let i = 0; i < design.stages.length; i++) {
    const s = design.stages[i]!;
    if (s.propulsion.kind !== 'liquid') continue;
    const e = vm.stages[i]!.engine!;
    if (i === 0 && e.separationAtSL) {
      flags.push({ id: `flow-sep-s${i}`, severity: 'danger', message: `Stage ${i + 1} nozzle (ε ${s.propulsion.engine.expansionRatio.toFixed(0)}) is heavily overexpanded at sea level — flow separation and side loads at ignition.`, lessonId: 'nozzle-expansion' });
    }
    if (s.tanks && s.tanks.safetyFactor < 1.15) {
      flags.push({ id: `sf-low-s${i}`, severity: 'danger', message: `Stage ${i + 1} tank SF ${s.tanks.safetyFactor.toFixed(2)} < 1.15 weld-knockdown floor — expect burst at pressurization.`, lessonId: 'hoop-stress' });
    }
    if (s.propulsion.engine.propellant === 'lox-lh2' && s.tanks && !s.tanks.insulated) {
      flags.push({ id: `lh2-insulation-s${i}`, severity: 'danger', message: `Stage ${i + 1} carries LH2 in an uninsulated tank — boiloff will drain it.`, lessonId: 'boiloff' });
    }
    if (s.tanks?.commonBulkhead) {
      const dens = propellantDensities(s.propulsion.engine.propellant);
      if (dens.oxCryo !== dens.fuelCryo && !s.tanks.insulated) {
        flags.push({ id: `cb-thermal-s${i}`, severity: 'warning', message: `Common bulkhead between cryo and storable propellants without insulation — thermal short.`, lessonId: 'common-bulkhead' });
      }
    }
  }

  if (design.fins && design.stages[0]) {
    const rep = stabilityReport(design, 1);
    if (rep.marginCalibers < 0.5) {
      flags.push({ id: 'unstable', severity: 'danger', message: `Static margin ${rep.marginCalibers.toFixed(2)} cal — the vehicle will tumble off the rail.`, lessonId: 'static-stability' });
    } else if (rep.marginCalibers > 3) {
      flags.push({ id: 'over-stable', severity: 'warning', message: `Static margin ${rep.marginCalibers.toFixed(1)} cal — over-stable; it will weathercock into wind.`, lessonId: 'static-stability' });
    }
  }

  for (const m of structuralMargins(design)) {
    if (m.margin < 0) {
      flags.push({ id: `structure-${m.joint}-${m.phase}`, severity: 'danger', message: `${m.joint} margin ${(m.margin * 100).toFixed(0)}% at ${m.phase} — structural failure predicted.`, lessonId: 'max-q' });
    } else if (m.margin < 0.15) {
      flags.push({ id: `structure-${m.joint}-${m.phase}`, severity: 'warning', message: `${m.joint} margin ${(m.margin * 100).toFixed(0)}% at ${m.phase} — program guideline is 15%.`, lessonId: 'max-q' });
    }
  }

  return flags;
}
