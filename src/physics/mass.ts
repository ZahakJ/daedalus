/**
 * The mass budget: every screw, rolled up into a MassNode tree and per-stage
 * totals, with axial CG for the stability chain. One place computes mass;
 * derived.ts, trajectory.ts and the blueprint all read from here.
 */
import type {
  EnginePerformance,
  MassNode,
  RocketDesign,
  StageDesign,
  TankReport,
} from './types.ts';
import { evaluateEngine } from './propulsion/engine.ts';
import { evaluateSolid, type SolidPerformance } from './propulsion/solid.ts';
import { sizeStageTanks } from './tanks.ts';
import { material } from './materials.ts';

/** Areal masses & fixed items — the small print of a dry-mass budget. */
const FAIRING_AREAL = 8; // kg/m² of nose surface
const NOSE_AREAL = 4.5; // kg/m² (composite shell + tip)
const INTERSTAGE_AREAL = 11; // kg/m² of skirt cylinder
/** Avionics scale with the vehicle: a hobby altimeter is 100 g, an orbital
    flight computer + RF + harness is ~15 kg. 0.9 + 1.2% of GLOW, capped. */
const avionicsMass = (glowEstimate: number): number =>
  Math.min(18, 0.9 + 0.012 * glowEstimate);
/** Solid sounding stages carry an airframe tube above the motor (payload,
    recovery, ballast volume) — mostly empty, light, and what actually puts
    the CG ahead of the fins on a hobby rocket. */
const AIRFRAME_TUBE_LD = 3; // tube length in body diameters
const AIRFRAME_AREAL = 1.8; // kg/m² (wound composite tube)
const CHUTE_AREAL = 0.12; // kg/m² canopy + lines
const CHUTE_MORTAR = 1.5; // kg

export interface StageMassBreakdown {
  stage: StageDesign;
  engine?: EnginePerformance;
  solid?: SolidPerformance;
  tank?: TankReport;
  /** Stage dry mass (no payload/fairing/upper stages), kg. */
  dry: number;
  propellant: number;
  /** Interstage adapter below-stage, kg (jettisoned with this stage). */
  interstage: number;
  /** Stage length estimate for CG stations, m. */
  length: number;
  /** CG of the DRY stage from its own top, m. */
  dryCgFromTop: number;
  /** CG of the propellant volume from stage top, m. */
  propCgFromTop: number;
  node: MassNode;
}

export interface VehicleMass {
  stages: StageMassBreakdown[];
  /** Nose/fairing + payload + avionics + recovery, kg. */
  upperDry: number;
  noseLength: number;
  upperLength: number;
  finsMass: number;
  glow: number;
  tree: MassNode;
}

/** Large fins are built-up rib/skin structures, not solid plate — the flutter
    model still sees the full section thickness, but mass carries a structure
    factor. Small hobby fins (≤0.05 m²) really are solid plate. */
const FIN_STRUCTURE_FACTOR = 0.45;

function finsMass(design: RocketDesign): number {
  if (!design.fins) return 0;
  const f = design.fins;
  const area = ((f.rootChord + f.tipChord) / 2) * f.span;
  const solidity = area <= 0.05 ? 1 : FIN_STRUCTURE_FACTOR;
  return f.count * area * f.thickness * material(f.material).density * solidity;
}

/** Ogive-ish nose lateral surface ≈ 0.75 × cone side area heuristic. */
function noseArea(diameter: number, length: number): number {
  const r = diameter / 2;
  const slant = Math.sqrt(length * length + r * r);
  return Math.PI * r * slant * 0.85;
}

export function computeVehicleMass(design: RocketDesign): VehicleMass {
  const stages: StageMassBreakdown[] = [];
  const nStages = design.stages.length;
  const top = design.stages[nStages - 1]!;

  // ————— upper works: nose/fairing, payload, avionics, recovery —————
  const noseLength = design.noseFineness * top.diameter;
  const noseMass = noseArea(top.diameter, noseLength) * (design.fairing ? FAIRING_AREAL : NOSE_AREAL);
  const chuteMass = design.recovery ? design.recovery.chuteArea * CHUTE_AREAL + CHUTE_MORTAR : 0;

  const ballast = design.noseBallast ?? 0;
  const upperNodes: MassNode[] = [
    { label: design.fairing ? 'Payload fairing' : 'Nose cone', mass: noseMass },
    { label: 'Payload', mass: design.payloadMass },
  ];
  if (ballast > 0) upperNodes.push({ label: 'Nose ballast', mass: ballast });
  if (chuteMass > 0) upperNodes.push({ label: 'Recovery system', mass: chuteMass });

  // ————— stages —————
  for (let i = 0; i < nStages; i++) {
    const s = design.stages[i]!;
    let dry = 0;
    let propellant = 0;
    let length = 0;
    let dryCgFromTop = 0;
    let propCgFromTop = 0;
    const children: MassNode[] = [];
    let engine: EnginePerformance | undefined;
    let solid: SolidPerformance | undefined;
    let tank: TankReport | undefined;

    if (s.propulsion.kind === 'liquid') {
      propellant = s.propulsion.propellantMass;
      engine = evaluateEngine(s.propulsion.engine, propellant);
      tank = sizeStageTanks(s, engine.feedPressure);
      const engMass = engine.engineMass * s.propulsion.engine.count;
      const thrustStructure = 0.35 * engMass + 0.004 * propellant;
      children.push(
        {
          label: `Engine ×${s.propulsion.engine.count} (${s.propulsion.engine.cycle})`,
          mass: engMass,
          children: [
            { label: 'Thrust chamber + nozzle', mass: engMass * 0.62 },
            { label: 'Turbomachinery / pressurization', mass: engMass * 0.23 },
            { label: 'Valves & actuators', mass: 8 * s.propulsion.engine.count },
          ],
        },
        {
          label: 'Tanks',
          mass: tank.totalMass,
          children: [
            { label: 'Oxidizer tank shell', mass: tank.oxMass },
            { label: 'Fuel tank shell', mass: tank.fuelMass },
            { label: 'Helium pressurant', mass: tank.pressurantMass },
            { label: 'COPV', mass: tank.copvMass },
            ...(tank.insulationMass > 0
              ? [{ label: 'Cryo insulation', mass: tank.insulationMass }]
              : []),
          ],
        },
        { label: 'Thrust structure', mass: thrustStructure },
      );
      if (engine.batteryMass > 0) children.push({ label: 'Pump battery', mass: engine.batteryMass });
      dry = engMass + tank.totalMass + thrustStructure + engine.batteryMass;
      const domeH = s.diameter / 4;
      const intertank = s.tanks?.commonBulkhead ? 0 : Math.max(0.12, 0.3 * s.diameter) ;
      length =
        tank.oxLength + tank.fuelLength + intertank + 0.3 * s.diameter + engine.nozzleLength + domeH;
      // Tanks dominate: dry CG near the intertank; propellant CG at tank centroid.
      dryCgFromTop = length * 0.45;
      propCgFromTop = (tank.oxLength + intertank + tank.fuelLength) * 0.5;
    } else {
      solid = evaluateSolid(s.propulsion.motor, s.diameter);
      propellant = s.propulsion.motor.propellantMass;
      const tubeLen = AIRFRAME_TUBE_LD * s.diameter;
      const tubeMass = Math.PI * s.diameter * tubeLen * AIRFRAME_AREAL;
      const caseTotal = solid.caseMass * 1.18 + 2;
      children.push(
        { label: 'Airframe tube', mass: tubeMass },
        { label: 'Motor case', mass: solid.caseMass },
        { label: 'Nozzle', mass: solid.caseMass * 0.18 + 2 },
      );
      dry = caseTotal + tubeMass;
      length = tubeLen + solid.motorLength;
      // Tube CG at its middle, motor hardware at the middle of the case.
      dryCgFromTop =
        (tubeMass * (tubeLen / 2) + caseTotal * (tubeLen + solid.motorLength * 0.55)) / dry;
      propCgFromTop = tubeLen + (solid.motorLength - solid.nozzleLength) * 0.5;
    }

    // Interstage adapter BELOW the stage above (belongs to lower stage i).
    let interstage = 0;
    if (i < nStages - 1) {
      const above = design.stages[i + 1]!;
      const skirtLen = above.interstageLength;
      interstage = Math.PI * Math.max(s.diameter, above.diameter) * skirtLen * INTERSTAGE_AREAL;
      children.push({ label: 'Interstage', mass: interstage });
      dry += interstage;
    }

    // Stage-level avionics share: full package on the top stage, a small
    // sequencer on boosters.
    const glowEstimate =
      design.payloadMass + design.stages.reduce((a, st) => a + (st.propulsion.kind === 'liquid' ? st.propulsion.propellantMass : st.propulsion.motor.propellantMass), 0);
    const avio = i === nStages - 1 ? avionicsMass(glowEstimate) : 4;
    children.push({ label: 'Avionics & harness', mass: avio });
    dry += avio;

    children.push({ label: `Propellant (${propellantLabel(s)})`, mass: propellant });

    stages.push({
      stage: s,
      engine,
      solid,
      tank,
      dry,
      propellant,
      interstage,
      length,
      dryCgFromTop,
      propCgFromTop,
      node: { label: `Stage ${i + 1}`, mass: dry + propellant, children },
    });
  }

  const fins = finsMass(design);
  if (fins > 0) {
    const s0 = stages[0]!;
    s0.dry += fins;
    s0.node.children!.push({ label: `Fins ×${design.fins!.count}`, mass: fins });
    s0.node.mass += fins;
  }

  const upperDry = noseMass + design.payloadMass + chuteMass + ballast;
  const upperLength = noseLength + Math.max(0.25, 0.5 * top.diameter) + 0.12;
  const glow = upperDry + stages.reduce((a, s) => a + s.dry + s.propellant, 0);

  const tree: MassNode = {
    label: design.name || 'Vehicle',
    mass: glow,
    children: [
      { label: 'Upper works', mass: upperDry, children: upperNodes },
      ...stages.map((s) => s.node).reverse(),
    ],
  };

  return { stages, upperDry, noseLength, upperLength, finsMass: fins, glow, tree };
}

function propellantLabel(s: StageDesign): string {
  return s.propulsion.kind === 'liquid' ? s.propulsion.engine.propellant : 'APCP';
}

/**
 * Vehicle CG from nose tip at a given per-stage propellant fraction.
 * Stations: upper works, then stages top→bottom in reverse index order.
 */
export function vehicleCG(
  vm: VehicleMass,
  design: RocketDesign,
  propellantFraction: number,
): { cg: number; totalMass: number; totalLength: number } {
  let mSum = 0;
  let mx = 0;
  // Upper works CG ~65% into the upper length — except nose ballast, whose
  // whole purpose is to sit as far forward as possible (30% into the nose).
  const ballast = design.noseBallast ?? 0;
  const mUpper = vm.upperDry - ballast;
  mSum += mUpper + ballast;
  mx += mUpper * vm.upperLength * 0.65;
  mx += ballast * vm.noseLength * 0.3;
  let y = vm.upperLength;
  for (let i = design.stages.length - 1; i >= 0; i--) {
    const s = vm.stages[i]!;
    const prop = s.propellant * propellantFraction;
    mSum += s.dry + prop;
    mx += s.dry * (y + s.dryCgFromTop);
    // Liquid level drops as propellant burns: CG of remaining prop sinks.
    const propCg = y + s.propCgFromTop + (1 - propellantFraction) * 0.25 * s.length;
    mx += prop * propCg;
    y += s.length;
  }
  // Fins already included in stage 0 dry at its generic dry-CG station; move
  // their share to the actual fin station near the tail.
  if (vm.finsMass > 0) {
    let stage0Top = vm.upperLength;
    for (let i = design.stages.length - 1; i >= 1; i--) stage0Top += vm.stages[i]!.length;
    const finStation = y - (design.fins?.rootChord ?? 0) * 0.5;
    mx += vm.finsMass * (finStation - (stage0Top + vm.stages[0]!.dryCgFromTop));
  }
  return { cg: mx / mSum, totalMass: mSum, totalLength: y };
}
