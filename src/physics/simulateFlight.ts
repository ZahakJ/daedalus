/**
 * The flight simulator: 2D planar Earth-centered-inertial RK4 with an
 * open-loop guidance program, staging, deterministic weather, and failure
 * detection. Pure function of (design, environment) — the same code runs in
 * the worker, in vitest, and at launch commit; bit-identical every time.
 *
 * Frame: x-y plane through the launch site and the (eastward) launch azimuth.
 * Launch site at (0, R); local up = r̂; downrange = +x at t=0. Earth rotation
 * is modeled as clockwise co-rotation ωeff = ωE·cos(lat): ground/air velocity
 * at r⃗ is ωeff·(y, −x), giving the eastward pad velocity ~465·cos(lat) m/s.
 *
 * Guidance, staging and failure detection share the integration state
 * machine, so they live here; failures.ts holds only failure metadata.
 */
import { G0, MU_EARTH, OMEGA_EARTH, P0, R_EARTH } from './constants.ts';
import type {
  Environment,
  EventId,
  FailureEvent,
  FlightEvent,
  FlightResult,
  FlightSummary,
  RocketDesign,
  TrajectoryTable,
} from './types.ts';
import { atmosphere } from './atmosphere.ts';
import { dragCoefficient, dragForce, dynamicPressure, finDragIncrement, machNumber } from './aero.ts';
import { gravityAccel } from './gravity.ts';
import { orbitalElements, isOrbit, apoapsisFromState } from './orbit.ts';
import { windProfile } from './wind.ts';
import { computeVehicleMass, vehicleCG } from './mass.ts';
import { boiloffRate } from './tanks.ts';
import { material } from './materials.ts';
import {
  finsCN,
  flutterSpeed,
  noseCN,
  staticMarginCalibers,
  totalCP,
  windAngleOfAttack,
} from './stability.ts';
import { axialCapability, jointLoads, jointMargin } from './structures.ts';
import { solidThrustAt } from './propulsion/solid.ts';
import { RESTARTS_ALLOWED } from './failures.ts';

// ————— recording —————

class Recorder {
  private cols: Record<string, number[]> = {};
  private names = [
    't', 'x', 'y', 'altitude', 'downrange', 'vx', 'vy', 'speed', 'airspeed',
    'mach', 'q', 'aoa', 'flightPathAngle', 'pitch', 'thrust', 'drag', 'mass',
    'twr', 'accel', 'throttle', 'stage',
  ] as const;

  constructor() {
    for (const n of this.names) this.cols[n] = [];
  }

  push(row: Record<(typeof this.names)[number], number>): void {
    for (const n of this.names) this.cols[n]!.push(row[n]);
  }

  get length(): number {
    return this.cols['t']!.length;
  }

  lastT(): number {
    const t = this.cols['t']!;
    return t.length > 0 ? t[t.length - 1]! : -Infinity;
  }

  toTable(): TrajectoryTable {
    const out = {} as Record<string, Float64Array>;
    for (const n of this.names) out[n] = Float64Array.from(this.cols[n]!);
    return out as unknown as TrajectoryTable;
  }
}

// ————— per-stage runtime state —————

interface StageRuntime {
  propRemaining: number;
  burning: boolean;
  burnedOut: boolean;
  attached: boolean;
  burnElapsed: number;
  ignitions: number;
  /** Pressure-fed only: helium budget, kg. Sized for one full blowdown; each
      restart re-pressurizes the ullage and costs extra. */
  heliumRemaining: number;
  heliumPerKgProp: number;
  isPressureFed: boolean;
  pressurantSagging: boolean;
  // liquid cached numbers (per stage totals, full throttle)
  thrustVacFull: number;
  massFlowFull: number;
  exitArea: number;
  exitPressureFull: number;
  isLh2: boolean;
  insulated: boolean;
  cycle: string;
  throttleFloor: number;
  // solid
  isSolid: boolean;
  solidBurnTime: number;
  solidProfile: 'progressive' | 'neutral' | 'regressive';
}

const DEG = Math.PI / 180;

export function simulateFlight(design: RocketDesign, env: Environment): FlightResult {
  const vm = computeVehicleMass(design);
  const wind = windProfile(env.weatherSeed);
  const n = design.stages.length;
  const lat = design.launch.latitude;
  const omegaEff = OMEGA_EARTH * Math.cos(lat);

  // ————— stage runtimes —————
  const rt: StageRuntime[] = design.stages.map((s, i) => {
    const bd = vm.stages[i]!;
    if (s.propulsion.kind === 'liquid') {
      const e = bd.engine!;
      const count = s.propulsion.engine.count;
      const pressureFed = s.propulsion.engine.cycle === 'pressure-fed';
      const helium = bd.tank?.pressurantMass ?? 0;
      return {
        propRemaining: s.propulsion.propellantMass,
        burning: false,
        burnedOut: false,
        attached: true,
        burnElapsed: 0,
        ignitions: 0,
        heliumRemaining: helium,
        heliumPerKgProp: helium / Math.max(1, s.propulsion.propellantMass),
        isPressureFed: pressureFed,
        pressurantSagging: false,
        thrustVacFull: e.thrustVac * count,
        massFlowFull: e.massFlow * count,
        exitArea: e.exitArea * count,
        exitPressureFull: e.exitPressure,
        isLh2: s.propulsion.engine.propellant === 'lox-lh2',
        insulated: s.tanks?.insulated ?? false,
        cycle: s.propulsion.engine.cycle,
        throttleFloor: e.throttleFloor,
        isSolid: false,
        solidBurnTime: 0,
        solidProfile: 'neutral',
      };
    }
    const sp = bd.solid!;
    return {
      propRemaining: s.propulsion.motor.propellantMass,
      burning: false,
      burnedOut: false,
      attached: true,
      burnElapsed: 0,
      ignitions: 0,
      heliumRemaining: 0,
      heliumPerKgProp: 0,
      isPressureFed: false,
      pressurantSagging: false,
      thrustVacFull: sp.thrustAvg * (sp.ispVac / sp.ispSL),
      massFlowFull: s.propulsion.motor.propellantMass / s.propulsion.motor.burnTime,
      exitArea: Math.PI * (sp.exitDiameter / 2) ** 2,
      exitPressureFull: 0,
      isLh2: false,
      insulated: false,
      cycle: 'solid',
      throttleFloor: 1,
      isSolid: true,
      solidBurnTime: s.propulsion.motor.burnTime,
      solidProfile: s.propulsion.motor.thrustProfile,
    };
  });

  // ————— stability precomputation (sounding chain) —————
  // Solid first stages are unguided — fins are the only thing keeping them
  // pointed. Liquid vehicles gimbal their engines (TVC) and are actively
  // stabilized, so CP/CG margin is not a loss-of-vehicle condition for them.
  const passiveStability = design.stages[0]!.propulsion.kind === 'solid';
  const d0 = design.stages[0]!.diameter;
  const refArea = Math.PI * (Math.max(...design.stages.map((s) => s.diameter)) / 2) ** 2;
  let cpX = NaN;
  let finVfG = 0;
  if (design.fins) {
    const totalLen = vm.upperLength + vm.stages.reduce((a, s) => a + s.length, 0);
    const comps = [noseCN(design.noseShape, vm.noseLength)];
    comps.push(finsCN(design.fins, d0, totalLen - design.fins.rootChord - 0.05));
    cpX = totalCP(comps).xcp;
    finVfG = material(design.fins.material).modulus / 2.6;
  }
  const finArea = design.fins
    ? ((design.fins.rootChord + design.fins.tipChord) / 2) * design.fins.span * design.fins.count
    : 0;

  // Structural capability of the weakest wall (stage 0).
  const s0 = design.stages[0]!;
  const s0mat =
    s0.propulsion.kind === 'liquid'
      ? material(s0.tanks?.material ?? 'al-2219')
      : material(s0.propulsion.motor.caseMaterial);
  const s0wall = vm.stages[0]!.tank
    ? vm.stages[0]!.tank.oxWall
    : Math.max(s0mat.minGauge, 1.5e-3);
  const s0press = vm.stages[0]!.tank ? vm.stages[0]!.tank.meop * 0.8 : 0;
  const s0cap = axialCapability(s0mat, s0wall, s0.diameter / 2, s0press);

  // ————— events / failures —————
  const events: FlightEvent[] = [];
  const failures: FailureEvent[] = [];
  let lov = false;
  const emit = (id: EventId, t: number, label: string, stage?: number, data?: Record<string, number>) => {
    events.push({ id, t, label, stage, data });
  };
  const fail = (f: FailureEvent) => {
    failures.push(f);
    if (f.severity === 'loss-of-vehicle') lov = true;
  };

  // ————— initial state —————
  let x = 0;
  let y = R_EARTH;
  // vehicle starts moving with the ground/air (clockwise co-rotation): v = ωeff·(y, −x)
  let vx = omegaEff * y;
  let vy = 0;
  let massNow = vm.glow;
  let t = 0;

  const g = design.guidance;
  let stageIdx = 0;
  let phase:
    | 'burn'
    | 'coast-sep'
    | 'coast-ignite'
    | 'ballistic'
    | 'coast-apo'
    | 'circularize'
    | 'coast-gto'
    | 'gto-burn'
    | 'descent'
    | 'done' = 'burn';
  let phaseT = 0; // time in current phase
  let kicked = false;
  let kickTime = 0;
  let attitude = Math.atan2(y, x); // absolute angle of thrust axis (≈ 90° = up at pad)
  let weathercockBias = 0;
  let fairingAttached = design.fairing;
  let finsAttached = design.fins !== undefined;
  const chute = { state: 'stowed' as 'stowed' | 'deployed' | 'shredded' };
  let apogeeSeen = false;
  let maxAlt = 0;
  let bucketActive = false;
  let qPeak = 0;
  let qPeakPassed = false;
  let mach1Done = false;
  let railExited = design.launch.railLength <= 0;
  let sepFlowTime = 0;
  let lovBallisticT = 0;
  let boiloffLost = 0;
  let orbitDone = false;
  let cutoffDone = false;
  let circTargetAlt = 0;

  // loss budget
  let dvSpent = 0;
  let lossGravity = 0;
  let lossDrag = 0;
  let lossSteering = 0;

  const rec = new Recorder();

  // ————— pre-flight deterministic failures —————
  for (let i = 0; i < n; i++) {
    const s = design.stages[i]!;
    if (s.propulsion.kind === 'liquid' && s.tanks && s.tanks.safetyFactor < 1.15) {
      fail({
        id: 'tank-burst',
        t: 0,
        severity: 'loss-of-vehicle',
        detail: `Stage ${i + 1} tank burst at pressurization (SF ${s.tanks.safetyFactor.toFixed(2)})`,
        lessonId: 'hoop-stress',
        data: { sf: s.tanks.safetyFactor, meop: vm.stages[i]!.tank?.meop ?? 0 },
      });
    }
  }

  // Liftoff TWR (sea level thrust of stage 0).
  const thrustAt = (i: number, pa: number, throttle: number, tFracSolid: number): number => {
    const r = rt[i]!;
    if (r.isSolid) {
      const shape = solidThrustAt(r.solidProfile, tFracSolid);
      return Math.max(0, r.thrustVacFull * shape - pa * r.exitArea);
    }
    return Math.max(0, throttle * r.thrustVacFull - pa * r.exitArea);
  };
  // Root cause before symptom: a badly overexpanded sea-level nozzle collapses
  // its own thrust, which would otherwise be reported as "not enough thrust".
  // Name the nozzle, not the consequence — the player has to know which slider
  // to move.
  const s0engine = vm.stages[0]?.engine;
  if (!lov && s0engine !== undefined && s0engine.exitPressure < 0.25 * P0) {
    fail({
      id: 'flow-separation',
      t: 0,
      severity: 'loss-of-vehicle',
      detail: `Stage 1 nozzle (ε ${
        design.stages[0]!.propulsion.kind === 'liquid'
          ? design.stages[0]!.propulsion.engine.expansionRatio.toFixed(0)
          : '?'
      }) separates at sea level: exit pressure ${s0engine.exitPressure.toFixed(0)} Pa against ${P0} Pa ambient`,
      lessonId: 'nozzle-expansion',
      data: { pe: s0engine.exitPressure, pa: P0 },
    });
  }

  // Pump suction: NPSH required rises with the head the pump must develop, so
  // a very high chamber pressure outruns the modest tank pressure a pump-fed
  // stage carries (MEOP floor 0.25 MPa). Crank pc far enough and the inducer
  // cavitates on the pad. Calibrated so ordinary pc (≤ ~20 MPa) is safe.
  for (let i = 0; i < n && !lov; i++) {
    const s = design.stages[i]!;
    if (s.propulsion.kind !== 'liquid') continue;
    if (s.propulsion.engine.cycle === 'pressure-fed') continue;
    const npshRequired = 0.08e6 + 0.006 * s.propulsion.engine.chamberPressure;
    const tankHead = vm.stages[i]!.tank?.meop ?? 0.25e6;
    if (npshRequired > tankHead) {
      fail({
        id: 'cavitation',
        t: 0,
        severity: 'loss-of-vehicle',
        detail: `Stage ${i + 1} pump requires ${(npshRequired / 1e6).toFixed(2)} MPa suction head at ${(s.propulsion.engine.chamberPressure / 1e6).toFixed(0)} MPa chamber pressure; the tanks supply ${(tankHead / 1e6).toFixed(2)} MPa`,
        lessonId: 'engine-cycles',
        data: { npsh: npshRequired, head: tankHead, pc: s.propulsion.engine.chamberPressure },
      });
    }
  }

  const twr0 = thrustAt(0, P0, 1, 0.05) / (vm.glow * G0);
  if (!lov && twr0 < 1.02) {
    fail({
      id: 'pad-crawl',
      t: 0,
      severity: 'loss-of-vehicle',
      detail: `Liftoff T/W ${twr0.toFixed(2)} — vehicle cannot climb`,
      lessonId: 'twr',
      data: { twr: twr0 },
    });
  }

  if (!lov) {
    emit('liftoff', 0, 'Liftoff', 0, { twr: twr0 });
    rt[0]!.burning = true;
    rt[0]!.ignitions = 1;
  } else {
    phase = 'done';
  }

  // ————— helpers —————
  const totalPropFraction = (): number => {
    let p = 0;
    let pf = 0;
    for (let i = 0; i < n; i++) {
      if (!rt[i]!.attached) continue;
      p += rt[i]!.propRemaining;
      pf += vm.stages[i]!.propellant;
    }
    return pf > 0 ? p / pf : 0;
  };

  const currentMass = (): number => {
    let m = vm.upperDry;
    if (!fairingAttached && design.fairing) {
      // fairing mass = nose mass share of upper works
      m -= vm.tree.children![0]!.children![0]!.mass;
    }
    if (!finsAttached && design.fins) m -= vm.finsMass;
    for (let i = 0; i < n; i++) {
      const r = rt[i]!;
      if (!r.attached) continue;
      m += vm.stages[i]!.dry + r.propRemaining;
      if (!finsAttached && design.fins && i === 0) m -= 0; // fins already excluded above
    }
    return m;
  };

  // fins are inside stage0 dry — subtract them once here if detached
  const massOf = (): number => {
    let m = currentMass();
    if (!finsAttached && design.fins && rt[0]!.attached) m -= vm.finsMass;
    return m;
  };

  // ————— the loop —————
  const maxT = 7200;
  let recordCounter = 0;

  while (t < maxT && phase !== 'done') {
    const r2 = x * x + y * y;
    const rr = Math.sqrt(r2);
    const alt = rr - R_EARTH;
    const upX = x / rr;
    const upY = y / rr;
    // local east (downrange, clockwise rotation direction): (upY, -upX)
    const eastX = upY;
    const eastY = -upX;

    const atmo = atmosphere(Math.max(0, alt));
    const inVacuum = atmo.pressure < 1;
    const activeR = stageIdx < n ? rt[stageIdx]! : null;
    const burning = activeR !== null && activeR.burning && !lov;

    const dt = burning || !inVacuum || phase === 'descent' ? 0.1 : 1.0;

    // ————— air-relative velocity —————
    const windSpd = wind.speedAt(Math.max(0, alt));
    const airVx = omegaEff * y + windSpd * eastX;
    const airVy = -omegaEff * x + windSpd * eastY;
    const relVx = vx - airVx;
    const relVy = vy - airVy;
    const airspeed = Math.hypot(relVx, relVy);
    // Pad-relative ground speed: the co-rotating frame WITHOUT the wind term.
    // Aerodynamics uses airspeed; guidance gates, rail exit and touchdown use
    // ground speed — real guidance triggers on the navigation state, not air
    // data, and a wind-dependent pitch-kick trigger would make every flight a
    // weather lottery (each attempt draws a new weather seed).
    const groundSpeed = Math.hypot(vx - omegaEff * y, vy + omegaEff * x);
    const mach = machNumber(airspeed, atmo.speedOfSound);
    const q = dynamicPressure(atmo.density, airspeed);
    const speed = Math.hypot(vx, vy);

    // ————— guidance: attitude —————
    // Speed gates use AIRSPEED: inertial speed includes the ~465·cos(lat) m/s
    // Earth-rotation velocity the vehicle is born with on the pad.
    const upAngle = Math.atan2(upY, upX);
    if (phase === 'burn' || phase === 'coast-sep' || phase === 'coast-ignite') {
      if (!railExited || groundSpeed < g.verticalUntilSpeed) {
        attitude = upAngle + weathercockBias;
      } else if (!kicked && groundSpeed >= g.pitchKick.atSpeed) {
        kicked = true;
        kickTime = t;
        attitude = upAngle - g.pitchKick.angle; // rotate toward +east (clockwise in-plane)
      } else if (kicked) {
        if (g.law === 'prograde') {
          // gravity turn: follow air-relative prograde; blend at 4°/s max
          const target = airspeed > 5 ? Math.atan2(relVy, relVx) : attitude;
          attitude = rotateToward(attitude, target, 4 * DEG * dt);
        } else {
          attitude = upAngle - g.pitchKick.angle - g.law.pitchRate * (t - kickTime);
        }
      } else {
        attitude = upAngle + weathercockBias;
      }
    } else if (phase === 'circularize') {
      // Altitude-hold insertion: thrust along the local horizontal, pitched
      // up/down against radial velocity so the long low-thrust burn neither
      // lofts nor falls — what closed-loop ascent guidance actually does.
      const rdotNow = (x * vx + y * vy) / rr;
      const tSign = vx * eastX + vy * eastY >= 0 ? 1 : -1;
      const tangX = eastX * tSign;
      const tangY = eastY * tSign;
      const vTanNow = Math.max(1, Math.abs(vx * tangX + vy * tangY));
      const pitchBias = Math.max(-0.5, Math.min(0.5, (8 * -rdotNow) / vTanNow));
      const dirX = tangX + upX * pitchBias;
      const dirY = tangY + upY * pitchBias;
      attitude = Math.atan2(dirY, dirX);
    } else if (phase === 'gto-burn') {
      attitude = Math.atan2(vy, vx); // inertial prograde — the Oberth burn
    }

    // ————— throttle —————
    let throttle = 1;
    if (burning && activeR !== null && !activeR.isSolid && g.throttleBucket) {
      const b = g.throttleBucket;
      if (!bucketActive && q > b.fromQ && !qPeakPassed) bucketActive = true;
      if (bucketActive && qPeakPassed && q < b.toQ) bucketActive = false;
      if (bucketActive) throttle = Math.max(b.level, activeR.throttleFloor);
    }

    // ————— thrust & mass flow —————
    let thrust = 0;
    let mdot = 0;
    if (burning && activeR !== null) {
      const tFrac = activeR.isSolid ? Math.min(1, activeR.burnElapsed / activeR.solidBurnTime) : 0;
      thrust = thrustAt(stageIdx, atmo.pressure, throttle, tFrac);
      // A starved pressurant system bleeds chamber pressure away: thrust and
      // mass flow decay together (Isp is roughly preserved, thrust is not).
      if (activeR.pressurantSagging) thrust *= 0.45;
      mdot = activeR.isSolid
        ? activeR.massFlowFull * solidThrustAt(activeR.solidProfile, tFrac)
        : activeR.massFlowFull * throttle * (activeR.pressurantSagging ? 0.45 : 1);

      // Flow separation (liquid first stage in thick air).
      if (!activeR.isSolid) {
        const pe = activeR.exitPressureFull * throttle;
        if (pe < 0.35 * atmo.pressure) {
          sepFlowTime += dt;
          thrust *= 0.88;
          if (sepFlowTime > 2 && pe < 0.25 * atmo.pressure && !lov) {
            fail({
              id: 'flow-separation',
              t,
              severity: 'loss-of-vehicle',
              detail: `Nozzle flow separation destroyed the engine (pe ${pe.toFixed(0)} Pa vs pa ${atmo.pressure.toFixed(0)} Pa)`,
              lessonId: 'nozzle-expansion',
              data: { pe, pa: atmo.pressure },
            });
          } else if (sepFlowTime > 2 && failures.every((f) => f.id !== 'flow-separation')) {
            fail({
              id: 'flow-separation',
              t,
              severity: 'degraded',
              detail: `Sustained flow separation — thrust down 12%, side loads`,
              lessonId: 'nozzle-expansion',
              data: { pe, pa: atmo.pressure },
            });
          }
        }
      }
    }

    // ————— aero forces —————
    let dragN = 0;
    if (airspeed > 0.1 && atmo.density > 1e-9) {
      const fin = finsAttached && design.fins ? finDragIncrement(finArea / design.fins.count, refArea, design.fins.count) : 0;
      let cd = dragCoefficient(mach, design.noseShape, 8) + fin;
      if (chute.state === 'deployed' && design.recovery) {
        dragN = q * (cd * refArea + 1.75 * design.recovery.chuteArea);
      } else {
        dragN = dragForce(q, cd, refArea);
      }
    }

    const m = massOf();
    const aoa = burning || airspeed > 5 ? angleDiff(attitude, Math.atan2(relVy, relVx)) : 0;

    // ————— RK4 on [x, y, vx, vy] with mass forward-Euler (mdot constant over step) —————
    const thrustAx = (thrust / m) * Math.cos(attitude);
    const thrustAy = (thrust / m) * Math.sin(attitude);
    const dragScale = airspeed > 0.1 ? dragN / (m * airspeed) : 0;

    const deriv = (px: number, py: number, pvx: number, pvy: number): [number, number, number, number] => {
      const ga = gravityAccel(px, py);
      // drag: recompute direction from frozen scale (density/cd frozen over dt — fine at 0.1 s)
      const rvx = pvx - (omegaEff * py + windSpd * eastX);
      const rvy = pvy - (-omegaEff * px + windSpd * eastY);
      return [pvx, pvy, ga.ax + thrustAx - dragScale * rvx, ga.ay + thrustAy - dragScale * rvy];
    };

    const k1 = deriv(x, y, vx, vy);
    const k2 = deriv(x + (dt / 2) * k1[0], y + (dt / 2) * k1[1], vx + (dt / 2) * k1[2], vy + (dt / 2) * k1[3]);
    const k3 = deriv(x + (dt / 2) * k2[0], y + (dt / 2) * k2[1], vx + (dt / 2) * k2[2], vy + (dt / 2) * k2[3]);
    const k4 = deriv(x + dt * k3[0], y + dt * k3[1], vx + dt * k3[2], vy + dt * k3[3]);
    x += (dt / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
    y += (dt / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
    vx += (dt / 6) * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]);
    vy += (dt / 6) * (k1[3] + 2 * k2[3] + 2 * k3[3] + k4[3]);

    // ————— loss budget (during burns) —————
    if (thrust > 0) {
      const fpa = Math.asin(clamp01s((vx * upX + vy * upY) / Math.max(speed, 0.1)));
      const gLocal = Math.hypot(gravityAccel(x, y).ax, gravityAccel(x, y).ay);
      dvSpent += (thrust / m) * dt;
      lossGravity += gLocal * Math.sin(Math.max(0, fpa)) * dt;
      lossSteering += (thrust / m) * (1 - Math.cos(aoa)) * dt;
    }
    // Drag loss counts only while thrusting — the launch loss budget runs to
    // burnout/insertion; reentry deceleration is not a "loss".
    if (dragN > 0 && thrust > 0) lossDrag += (dragN / m) * dt;

    // ————— propellant & stage bookkeeping —————
    if (burning && activeR !== null) {
      // Pressure-fed stages spend helium to displace the propellant they burn.
      // The COPV is sized for exactly one full blowdown, so a stage that
      // restarts (each start re-pressurizes the ullage) runs the bottle dry
      // before the tanks are empty and the chamber pressure sags.
      if (activeR.isPressureFed && activeR.heliumRemaining > 0) {
        activeR.heliumRemaining -= activeR.heliumPerKgProp * mdot * dt;
        if (activeR.heliumRemaining <= 0 && activeR.propRemaining > 0) {
          activeR.pressurantSagging = true;
          fail({
            id: 'pressurant-depleted',
            t,
            severity: 'degraded',
            detail: `Stage ${stageIdx + 1} helium exhausted with ${activeR.propRemaining.toFixed(0)} kg of propellant left — chamber pressure decaying`,
            lessonId: 'pressure-fed',
            data: { propLeft: activeR.propRemaining, restarts: activeR.ignitions - 1 },
          });
        }
      }
      activeR.propRemaining -= mdot * dt;
      activeR.burnElapsed += dt;
      massNow = m;
      const depleted = activeR.isSolid
        ? activeR.burnElapsed >= activeR.solidBurnTime
        : activeR.propRemaining <= 0;
      if (depleted && phase === 'burn') {
        activeR.propRemaining = Math.max(0, activeR.propRemaining);
        activeR.burning = false;
        activeR.burnedOut = true;
        emit('burnout', t, `Stage ${stageIdx + 1} burnout${activeR.isSolid ? ' (uncommanded)' : ''}`, stageIdx);
        if (stageIdx < n - 1) {
          phase = 'coast-sep';
          phaseT = 0;
        } else {
          phase = afterFinalBurn();
        }
      }
    }

    // LH2 boiloff during any coast.
    if (!burning) {
      for (let i = 0; i < n; i++) {
        const r = rt[i]!;
        if (r.attached && r.isLh2 && r.propRemaining > 0 && !r.burnedOut) {
          const lost = boiloffRate(r.propRemaining, r.insulated) * dt;
          r.propRemaining = Math.max(0, r.propRemaining - lost);
          boiloffLost += lost;
        }
      }
    }

    // ————— phase machine —————
    phaseT += dt;
    switch (phase) {
      case 'coast-sep': {
        if (phaseT >= design.stages[stageIdx]!.separationDelay) {
          rt[stageIdx]!.attached = false;
          emit('separation', t, `Stage ${stageIdx + 1} separation`, stageIdx);
          stageIdx++;
          phase = 'coast-ignite';
          phaseT = 0;
        }
        break;
      }
      case 'coast-ignite': {
        if (phaseT >= design.stages[stageIdx]!.ignitionDelay) {
          igniteStage(stageIdx);
          phase = 'burn';
          phaseT = 0;
        }
        break;
      }
      case 'burn': {
        // Apoapsis-target cutoff on the FINAL burn.
        if (
          !cutoffDone &&
          stageIdx === n - 1 &&
          typeof g.cutoff === 'object' &&
          alt > 30e3 &&
          apoapsisFromState(x, y, vx, vy) >= g.cutoff.apoapsisTarget
        ) {
          cutoffDone = true;
          rt[stageIdx]!.burning = false;
          emit('cutoff', t, `MECO — apoapsis target ${(g.cutoff.apoapsisTarget / 1e3).toFixed(0)} km`, stageIdx);
          phase = afterFinalBurn();
          phaseT = 0;
        }
        break;
      }
      case 'coast-apo': {
        // Lead the circularization: ignite when time-to-apoapsis ≈ half the
        // expected burn duration, so the burn straddles apoapsis instead of
        // racing the fall back into the atmosphere.
        const rdot = (x * vx + y * vy) / rr;
        const el = orbitalElements(x, y, vx, vy);
        const rApo = R_EARTH + el.apoapsisAlt;
        const vApoPred = Math.sqrt(
          Math.max(0, (2 * MU_EARTH) / rApo - MU_EARTH / el.semiMajorAxis),
        );
        const dvNeed = Math.max(0, Math.sqrt(MU_EARTH / rApo) - vApoPred);
        const mNow = massOf();
        const burnDur = (dvNeed * mNow) / Math.max(1, rt[stageIdx]!.thrustVacFull);
        // Near apoapsis rdot decays at roughly the net radial gravity.
        const vCircHere = Math.sqrt(MU_EARTH / rr);
        const vTan = Math.abs(vx * -upY + vy * upX);
        const gNet = Math.max(0.5, (MU_EARTH / r2) * (1 - (vTan / vCircHere) ** 2));
        const tToApo = rdot / gNet;
        if ((rdot <= 0 || tToApo <= burnDur / 2) && phaseT > 5) {
          emit('circularization-start', t, 'Circularization burn ignition', stageIdx);
          // Circularize AT the apoapsis we actually coasted to — a lofted
          // ascent settles far above the cutoff target, and that is where we are.
          circTargetAlt = Math.max(el.apoapsisAlt, typeof g.cutoff === 'object' ? g.cutoff.apoapsisTarget : el.apoapsisAlt);
          if (tryRestart(stageIdx)) {
            phase = 'circularize';
          } else {
            phase = 'ballistic';
          }
          phaseT = 0;
        }
        break;
      }
      case 'circularize': {
        const el = orbitalElements(x, y, vx, vy);
        const target = circTargetAlt;
        // Done when circular-enough; fallen when we dropped back under 120 km
        // (the burn lost the race); dry when the tanks give out.
        // Cut off the moment the orbit is circular enough and safely clear of
        // the atmosphere — waiting for periapsis to reach the target overshoots
        // the apoapsis instead (the burn keeps adding energy).
        const done =
          (el.periapsisAlt > 150e3 && el.eccentricity <= 0.015) ||
          el.periapsisAlt >= target * 0.96 ||
          (el.periapsisAlt > 150e3 && el.apoapsisAlt > target * 1.5);
        const fallen = alt < 120e3;
        const dry = rt[stageIdx]!.propRemaining <= 0;
        if (done || dry || fallen) {
          rt[stageIdx]!.burning = false;
          emit(
            'circularization-end',
            t,
            dry
              ? 'Circularization cutoff — propellant depleted'
              : fallen
                ? 'Circularization abandoned — fell below 120 km'
                : 'Circularization complete',
            stageIdx,
          );
          if (dry && !done && boiloffLost > 1) {
            fail({
              id: 'boiloff-shortfall',
              t,
              severity: 'degraded',
              detail: `${boiloffLost.toFixed(0)} kg boiled off during coast; burn ran dry short of circular`,
              lessonId: 'boiloff',
              data: { lost: boiloffLost },
            });
          }
          const el2 = orbitalElements(x, y, vx, vy);
          if (isOrbit(el2) && !orbitDone) {
            orbitDone = true;
            emit('orbit', t, `Orbit: ${(el2.periapsisAlt / 1e3).toFixed(0)} × ${(el2.apoapsisAlt / 1e3).toFixed(0)} km`);
          }
          phase = g.raiseApoapsisTo !== undefined && !dry ? 'coast-gto' : orbitDone ? 'done' : 'ballistic';
          phaseT = 0;
        }
        break;
      }
      case 'coast-gto': {
        if (phaseT >= 600) {
          emit('ignition', t, 'GTO injection burn ignition', stageIdx);
          if (tryRestart(stageIdx)) phase = 'gto-burn';
          else phase = 'done';
          phaseT = 0;
        }
        break;
      }
      case 'gto-burn': {
        const apo = apoapsisFromState(x, y, vx, vy);
        const dry = rt[stageIdx]!.propRemaining <= 0;
        if ((g.raiseApoapsisTo !== undefined && apo >= g.raiseApoapsisTo) || dry) {
          rt[stageIdx]!.burning = false;
          emit('cutoff', t, dry ? 'GTO burn — propellant depleted' : 'GTO injection complete', stageIdx);
          if (dry && boiloffLost > 1) {
            fail({
              id: 'boiloff-shortfall',
              t,
              severity: 'degraded',
              detail: `${boiloffLost.toFixed(0)} kg of cryogens boiled off; apoapsis ${(apo / 1e3).toFixed(0)} km short of target`,
              lessonId: 'boiloff',
              data: { lost: boiloffLost },
            });
          }
          phase = 'done';
        }
        break;
      }
      case 'ballistic':
      case 'descent':
        break;
    }

    // ————— event detection —————
    if (!railExited && alt >= design.launch.railLength) {
      railExited = true;
      const vExit = groundSpeed;
      emit('rail-exit', t, `Rail exit at ${vExit.toFixed(1)} m/s`, 0, { v: vExit });
      // Weathercock check (passively stabilized vehicles only).
      if (passiveStability && design.fins && !Number.isNaN(cpX)) {
        const { cg } = vehicleCG(vm, design, totalPropFraction());
        const margin = staticMarginCalibers(cpX, cg, d0);
        const wAoA = windAngleOfAttack(Math.abs(wind.surfaceWind), Math.max(vExit, 1));
        // An over-stable vehicle turns into the relative wind at rail exit; the
        // lean scales with how over-stable it is and how slowly it left the
        // rail. Reported once it is large enough to cost real altitude (~4°).
        if (margin > 3 && wAoA > 4.5 * DEG) {
          weathercockBias = Math.min(15 * DEG, wAoA * (margin / 3)) * Math.sign(wind.surfaceWind);
          fail({
            id: 'weathercock',
            t,
            severity: 'degraded',
            detail: `Over-stable (${margin.toFixed(1)} cal) — weathercocked ${(weathercockBias / DEG).toFixed(1)}° into wind`,
            lessonId: 'static-stability',
            data: { margin, wind: wind.surfaceWind, bend: weathercockBias / DEG },
          });
        }
      }
    }
    if (!mach1Done && mach >= 1) {
      mach1Done = true;
      emit('mach-1', t, 'Mach 1', stageIdx);
    }
    if (q > qPeak) {
      qPeak = q;
    } else if (!qPeakPassed && qPeak > 2e3 && q < qPeak * 0.85) {
      qPeakPassed = true;
      emit('max-q', t, `Max-Q ${(qPeak / 1e3).toFixed(1)} kPa`, stageIdx, { q: qPeak, altitude: alt });
    }
    if (fairingAttached && qPeakPassed && q < (g.fairingJettisonQ ?? 1000)) {
      fairingAttached = false;
      emit('fairing', t, 'Fairing jettison', stageIdx);
    }
    if (!apogeeSeen && alt > 500 && (x * vx + y * vy) <= 0 && phase !== 'circularize') {
      apogeeSeen = true;
      emit('apogee', t, `Apogee ${(alt / 1e3).toFixed(1)} km`, undefined, { altitude: alt });
      if (design.recovery && design.recovery.deploy === 'apogee' && chute.state === 'stowed') {
        deployChute();
      }
      if (phase === 'burn' || phase === 'ballistic') phase = 'descent';
    }
    if (
      design.recovery &&
      typeof design.recovery.deploy === 'object' &&
      chute.state === 'stowed' &&
      apogeeSeen &&
      alt <= design.recovery.deploy.altitude
    ) {
      deployChute();
    }
    maxAlt = Math.max(maxAlt, alt);

    // ————— in-flight failure detection —————
    // Flutter threatens ANY finned vehicle (ascent only — falling boosters
    // shredding fins on reentry is not a design lesson); the tumble checks
    // apply only to passively-stabilized (solid, unguided) vehicles.
    if (!lov && !apogeeSeen && finsAttached && design.fins && q > 500) {
      const vf = flutterSpeed(design.fins, finVfG, atmo.pressure, atmo.speedOfSound);
      if (airspeed > vf) {
        fail({
          id: 'fin-flutter',
          t,
          severity: 'degraded',
          detail: `Flutter boundary ${vf.toFixed(0)} m/s exceeded at ${airspeed.toFixed(0)} m/s — fin lost`,
          lessonId: 'fin-flutter',
          data: { v: airspeed, vf },
        });
        finsAttached = false;
      } else if (passiveStability && recordCounter % 5 === 0 && !Number.isNaN(cpX)) {
        // Stability (CP fixed, CG moves as propellant drains).
        const { cg } = vehicleCG(vm, design, totalPropFraction());
        const margin = staticMarginCalibers(cpX, cg, d0);
        if (margin < 0.5) {
          fail({
            id: 'unstable-tumble',
            t,
            severity: 'loss-of-vehicle',
            detail: `Static margin ${margin.toFixed(2)} cal at q ${(q / 1e3).toFixed(1)} kPa — vehicle tumbled`,
            lessonId: 'static-stability',
            data: { margin, q },
          });
        }
      }
    }
    if (!lov && passiveStability && !finsAttached && design.fins && q > 500 && !Number.isNaN(cpX)) {
      // CP jumped forward after fin loss → tumble chain.
      fail({
        id: 'unstable-tumble',
        t,
        severity: 'loss-of-vehicle',
        detail: `Loss of fins shifted CP forward — vehicle tumbled at q ${(q / 1e3).toFixed(1)} kPa`,
        lessonId: 'fin-flutter',
        data: { q },
      });
    }
    // Structural check: ascent only. Post-burnout the commanded attitude is
    // meaningless (unguided ballistic bodies trim near zero AoA); reentry
    // breakup modeling is out of scope.
    if (!lov && q > 5e3 && recordCounter % 5 === 0 && rt[0]!.attached && !apogeeSeen && (burning || !railExited || t < 300)) {
      // Structural: stage-0 wall under the current q/α/accel.
      const sensedAccel = (thrust + dragN) / m;
      let massAbove = vm.upperDry;
      for (let j = 1; j < n; j++) if (rt[j]!.attached) massAbove += vm.stages[j]!.dry + rt[j]!.propRemaining;
      const load = jointLoads(massAbove + vm.stages[0]!.dry * 0.4, sensedAccel, q, Math.abs(aoa) + 0.5 * DEG, 4 + (finsAttached ? 8 : 0), refArea, vm.stages[0]!.length * 0.5);
      const margin = jointMargin(s0cap, load, s0.diameter / 2);
      if (margin < 0) {
        fail({
          id: 'maxq-structural',
          t,
          severity: 'loss-of-vehicle',
          detail: `Airframe buckled: q ${(q / 1e3).toFixed(1)} kPa, α ${(Math.abs(aoa) / DEG).toFixed(1)}°, margin ${(margin * 100).toFixed(0)}%`,
          lessonId: 'max-q',
          data: { q, aoa: Math.abs(aoa) / DEG, margin: margin * 100 },
        });
      }
    }

    if (lov) {
      // Ballistic debris: cut thrust, integrate briefly, stop.
      for (const r of rt) r.burning = false;
      lovBallisticT += dt;
      if (lovBallisticT > 3) phase = 'done';
    }

    // ————— ground contact —————
    if (alt <= 0 && t > 1) {
      const vDown = groundSpeed; // impact energy is relative to the ground, not the air
      if (chute.state === 'deployed' && vDown < 15) {
        emit('touchdown', t, `Touchdown at ${vDown.toFixed(1)} m/s`, undefined, { v: vDown });
      } else {
        emit('impact', t, `Ground impact at ${vDown.toFixed(0)} m/s`, undefined, { v: vDown });
      }
      phase = 'done';
    }

    t += dt;
    recordCounter++;

    // ————— record (5 Hz powered/atmo, 1 Hz coast) —————
    const recEvery = dt < 0.5 ? 2 : 1;
    if (recordCounter % recEvery === 0 || phase === 'done') {
      const fpa = Math.asin(clamp01s((vx * upX + vy * upY) / Math.max(Math.hypot(vx, vy), 0.1)));
      const pitchLocal = angleDiff(attitude, Math.atan2(eastY, eastX));
      rec.push({
        t,
        x,
        y,
        altitude: Math.max(0, alt),
        downrange: downrangeArc(x, y),
        vx,
        vy,
        speed: Math.hypot(vx, vy),
        airspeed,
        mach,
        q,
        aoa,
        flightPathAngle: fpa,
        pitch: pitchLocal,
        thrust,
        drag: dragN,
        mass: m,
        twr: thrust / (m * G0),
        accel: (thrust + dragN) / m,
        throttle: burning ? throttle : 0,
        stage: stageIdx < n ? stageIdx : -1,
      });
    }
  }

  // ————— post-flight assembly —————
  const table = rec.toTable();
  const el = orbitalElements(x, y, vx, vy);
  const finalOrbit = isOrbit(el) ? el : null;

  // Max-Q is an ASCENT metric — a sounding rocket falling back into the
  // atmosphere sees far higher q on reentry, which is not what "max-Q" means
  // on launch day. Window the search to samples before apogee.
  const apogeeT = events.find((e) => e.id === 'apogee')?.t ?? Infinity;
  const maxQIdx = argmaxBefore(table.q, table.t, apogeeT);
  const landSample = events.find((e) => e.id === 'touchdown');
  const summary: FlightSummary = {
    outcome: lov ? 'failure' : 'success',
    apogee: maxAlt,
    maxQ: {
      value: table.q[maxQIdx] ?? 0,
      altitude: table.altitude[maxQIdx] ?? 0,
      t: table.t[maxQIdx] ?? 0,
    },
    maxMach: maxOf(table.mach),
    maxAccelG: maxOf(table.accel) / G0,
    downrange: table.downrange[table.downrange.length - 1] ?? 0,
    flightTime: t,
    deltaVSpent: dvSpent,
    lossGravity,
    lossDrag,
    lossSteering,
    landingSpeed: landSample?.data?.['v'],
  };

  return { table, events, failures, orbit: finalOrbit, summary };

  // ————— inner helpers (close over state) —————

  function afterFinalBurn(): 'coast-apo' | 'ballistic' {
    if (g.circularizeAtApoapsis && stageIdx === n - 1) return 'coast-apo';
    return 'ballistic';
  }

  function igniteStage(i: number): void {
    const r = rt[i]!;
    r.ignitions++;
    r.burning = true;
    emit('ignition', t, `Stage ${i + 1} ignition`, i);
  }

  function tryRestart(i: number): boolean {
    const r = rt[i]!;
    const allowed = RESTARTS_ALLOWED[r.cycle] ?? 0;
    const restartsUsed = r.ignitions; // first ignition not a restart; ignitions counts starts
    if (restartsUsed - 1 >= allowed) {
      fail({
        id: 'battery-depleted',
        t,
        severity: 'degraded',
        detail: `Stage ${i + 1} restart refused — ${r.cycle} supports ${allowed} restart(s)`,
        lessonId: 'engine-cycles',
        data: { attempt: restartsUsed, allowed },
      });
      return false;
    }
    if (r.propRemaining <= 0) return false;
    r.ignitions++;
    r.burning = true;
    return true;
  }

  function deployChute(): void {
    const atmoNow = atmosphere(Math.max(0, Math.hypot(x, y) - R_EARTH));
    const relV = Math.hypot(vx - omegaEff * y, vy + omegaEff * x);
    const qNow = dynamicPressure(atmoNow.density, relV);
    if (qNow > 1.2e3) {
      chute.state = 'shredded';
      fail({
        id: 'chute-shred',
        t,
        severity: 'degraded',
        detail: `Chute deployed at q ${(qNow / 1e3).toFixed(1)} kPa — canopy destroyed`,
        lessonId: 'recovery',
        data: { q: qNow },
      });
      emit('chute-deploy', t, 'Chute deploy — FAILED (shredded)');
    } else {
      chute.state = 'deployed';
      emit('chute-deploy', t, 'Chute deploy');
    }
  }

  function downrangeArc(px: number, py: number): number {
    const theta = Math.atan2(px, py); // angle from launch site meridian
    return Math.abs(theta) * R_EARTH;
  }
}

// ————— small math helpers —————

function rotateToward(a: number, target: number, maxStep: number): number {
  const d = angleDiff(target, a);
  if (Math.abs(d) <= maxStep) return target;
  return a + Math.sign(d) * maxStep;
}

function angleDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

function clamp01s(v: number): number {
  return v < -1 ? -1 : v > 1 ? 1 : v;
}

function argmaxBefore(a: Float64Array, t: Float64Array, tMax: number): number {
  let best = 0;
  for (let i = 1; i < a.length; i++) {
    if (t[i]! > tMax) break;
    if (a[i]! > a[best]!) best = i;
  }
  return best;
}

function maxOf(a: Float64Array): number {
  let m = 0;
  for (let i = 0; i < a.length; i++) if (a[i]! > m) m = a[i]!;
  return m;
}
