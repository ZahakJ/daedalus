/**
 * Every type the engine, UI, worker, and tests share.
 * Design types are fully JSON-serializable (numbers + string enums only) so a
 * RocketDesign round-trips through localStorage and postMessage untouched.
 * Units are strict SI: m, kg, s, N, Pa, K, rad.
 */

// ————— identities —————

export type PropellantId = 'apcp' | 'lox-rp1' | 'lox-ch4' | 'lox-lh2' | 'nto-mmh';
export type LiquidPropellantId = Exclude<PropellantId, 'apcp'>;
export type MaterialId =
  | 'al-2219'
  | 'al-li-2195'
  | 'ss-304l'
  | 'ss-301fh'
  | 'ti-6al4v'
  | 'cfrp'
  | 'steel-4130';
export type EngineCycle = 'pressure-fed' | 'gas-generator' | 'electric-pump' | 'staged-combustion';
export type NoseShape = 'conical' | 'ogive' | 'von-karman';
export type ThrustProfile = 'progressive' | 'neutral' | 'regressive';

// ————— design (user-authored, serializable) —————

export interface EngineDesign {
  propellant: LiquidPropellantId;
  /** O/F mass mixture ratio. */
  mixtureRatio: number;
  /** Chamber pressure, Pa. */
  chamberPressure: number;
  /** Vacuum thrust target PER ENGINE, N — throat area is sized from this. */
  vacuumThrust: number;
  /** Nozzle area ratio Ae/At. */
  expansionRatio: number;
  cycle: EngineCycle;
  /** Number of identical engines on the stage. */
  count: number;
}

export interface SolidMotorDesign {
  /** Propellant grain mass, kg. */
  propellantMass: number;
  /** Nominal burn duration, s. */
  burnTime: number;
  thrustProfile: ThrustProfile;
  expansionRatio: number;
  caseMaterial: MaterialId;
}

export interface TankConfig {
  material: MaterialId;
  /** Structural safety factor applied to MEOP, 1.1–2.5. The margins slider. */
  safetyFactor: number;
  /** Merge the inter-propellant domes; mass credit, cryo-adjacency risk. */
  commonBulkhead: boolean;
  /** Cryo insulation (mandatory for LH2 to control boiloff). */
  insulated: boolean;
}

export type StagePropulsion =
  | { kind: 'liquid'; engine: EngineDesign; propellantMass: number }
  | { kind: 'solid'; motor: SolidMotorDesign };

export interface StageDesign {
  /** Stage body diameter, m. */
  diameter: number;
  propulsion: StagePropulsion;
  /** Required for liquid stages; ignored for solids (case is the tank). */
  tanks?: TankConfig;
  /** Interstage adapter length to the stage above, m (0 on the top stage). */
  interstageLength: number;
  /** Coast between burnout and separation, s. */
  separationDelay: number;
  /** Coast between separation and upper-stage ignition, s (0 on stage 0). */
  ignitionDelay: number;
}

export interface FinSet {
  count: number;
  /** Planform, m. Sweep is the leading-edge sweep angle, rad. */
  rootChord: number;
  tipChord: number;
  span: number;
  sweep: number;
  /** Fin thickness, m — the flutter knob. */
  thickness: number;
  material: MaterialId;
}

export interface RecoveryConfig {
  /** Parachute canopy area, m². */
  chuteArea: number;
  /** 'apogee' or a fixed altitude (m) on descent. */
  deploy: 'apogee' | { altitude: number };
}

export interface GuidanceProgram {
  /** Fly vertically until this inertial speed, m/s. */
  verticalUntilSpeed: number;
  /** Then pitch over by `angle` rad from vertical (the gravity-turn seed). */
  pitchKick: { atSpeed: number; angle: number };
  /** After the kick: follow air-relative prograde (gravity turn) or a fixed
      inertial pitch rate, rad/s (positive = towards horizontal). */
  law: 'prograde' | { pitchRate: number };
  /** Optional max-Q throttle bucket (liquid stages at/above the floor only). */
  throttleBucket?: { fromQ: number; toQ: number; level: number };
  /** Stage-0..n-1 burn to depletion; the FINAL burn may instead cut off when
      the coasting apoapsis reaches a target altitude, m. */
  cutoff: 'depletion' | { apoapsisTarget: number };
  /** Restart the final stage at apoapsis to circularize (M6+). */
  circularizeAtApoapsis?: boolean;
  /** After circularizing, coast then burn again to raise apoapsis to this
      altitude, m — the GTO injection burn (M8). */
  raiseApoapsisTo?: number;
  /** Jettison fairing when q falls below this, Pa (default 1000). */
  fairingJettisonQ?: number;
}

export interface RocketDesign {
  name: string;
  /** Index 0 = first (bottom) stage. */
  stages: StageDesign[];
  /** Payload mass, kg (mission may fix or bound it). */
  payloadMass: number;
  noseShape: NoseShape;
  /** Nose length / body diameter. */
  noseFineness: number;
  /** Nose ballast, kg — dead mass bought purely to move the CG forward
      (the classic sounding-rocket stability fix). */
  noseBallast?: number;
  /** Fairing carried above the top stage (orbital missions). */
  fairing: boolean;
  /** Fins on the first stage (sounding missions). */
  fins?: FinSet;
  recovery?: RecoveryConfig;
  launch: {
    /** Launch site latitude, rad. Azimuth is due east. */
    latitude: number;
    /** Launch rail length, m (sounding missions; 0 = tower launch). */
    railLength: number;
  };
  guidance: GuidanceProgram;
}

export interface Environment {
  /** Seed for the launch-day wind profile — deterministic weather. */
  weatherSeed: string;
}

// ————— engine evaluation —————

export interface EnginePerformance {
  /** Per-engine values. */
  thrustVac: number;
  thrustSL: number;
  ispVac: number;
  ispSL: number;
  /** Total propellant mass flow, kg/s. */
  massFlow: number;
  throatArea: number;
  throatDiameter: number;
  exitArea: number;
  exitDiameter: number;
  /** 80% bell length, throat plane → exit plane, m. */
  nozzleLength: number;
  exitPressure: number;
  /** Delivered characteristic velocity, m/s (η_c* applied). */
  cstar: number;
  /** Combustion state used (after pc correction). */
  chamberTemp: number;
  gamma: number;
  molarMass: number;
  /** Dry mass PER ENGINE including valves/actuators, kg. */
  engineMass: number;
  /** Battery mass chargeable to the stage for electric-pump cycles, kg (0 otherwise).
      Computed for the burn time implied by the stage's propellant load. */
  batteryMass: number;
  /** Required tank feed pressure (MEOP driver), Pa: 1.3·pc + injector drop for
      pressure-fed; pump NPSH head otherwise. */
  feedPressure: number;
  /** Minimum throttle fraction for the cycle. */
  throttleFloor: number;
  /** Summerfield flow-separation risk at sea level (pe < 0.35·p0). */
  separationAtSL: boolean;
}

// ————— reports (design-time evaluators) —————

export interface MassNode {
  label: string;
  mass: number;
  children?: MassNode[];
}

export interface StagePerf {
  /** Stack mass at this stage's ignition (everything above included), kg. */
  ignitionMass: number;
  /** Stack mass at this stage's burnout, kg. */
  burnoutMass: number;
  /** This stage alone: dry and propellant, kg. */
  dryMass: number;
  propellantMass: number;
  propellantMassFraction: number;
  thrustSL: number;
  thrustVac: number;
  ispSL: number;
  ispVac: number;
  twrIgnition: number;
  twrBurnout: number;
  burnTime: number;
  /** Tsiolkovsky vacuum Δv for this stage in the stack, m/s. */
  deltaV: number;
}

export interface DerivedPerformance {
  stages: StagePerf[];
  totalDeltaV: number;
  /** Gross liftoff mass, kg. */
  glow: number;
  massTree: MassNode;
  /** Program cost, arbitrary cost units (materials/cycle premiums; M7). */
  cost: number;
}

export interface TankReport {
  /** Per-tank wall thickness after min-gauge clamp, m. */
  oxWall: number;
  fuelWall: number;
  /** MEOP the tanks are sized for, Pa. */
  meop: number;
  /** Tank shell masses (ox, fuel), kg. */
  oxMass: number;
  fuelMass: number;
  /** Helium + COPV system mass, kg. */
  pressurantMass: number;
  copvMass: number;
  insulationMass: number;
  /** Total tank-system dry mass, kg. */
  totalMass: number;
  /** Tank lengths for the blueprint (cylindrical section + domes), m. */
  oxLength: number;
  fuelLength: number;
  /** True if a wall hit the material minimum gauge. */
  minGaugeLimited: boolean;
  /** Burst pressure at actual thickness, Pa. */
  burstPressure: number;
}

export interface StabilityReport {
  /** Distances from nose tip, m. */
  cg: number;
  cp: number;
  /** Static margin in calibers (body diameters). */
  marginCalibers: number;
  /** Normal force curve slope of the whole vehicle, 1/rad. */
  cnAlpha: number;
  /** Fin flutter boundary airspeed at sea level, m/s (Infinity without fins). */
  flutterSpeed: number;
  /** Rail-exit speed, m/s (NaN if no rail). */
  railExitSpeed: number;
}

export interface MarginReport {
  /** Structural joint or component identifier. */
  joint: string;
  /** Load case label ('max-thrust' | 'max-q' | 'max-accel'). */
  phase: string;
  /** capability/load − 1. Negative = failure. */
  margin: number;
}

export interface DesignFlag {
  id: string;
  severity: 'info' | 'warning' | 'danger';
  message: string;
  /** Handbook concept this flag teaches. */
  lessonId: string;
}

// ————— flight result —————

export type EventId =
  | 'liftoff'
  | 'rail-exit'
  | 'mach-1'
  | 'max-q'
  | 'burnout'
  | 'separation'
  | 'ignition'
  | 'fairing'
  | 'apogee'
  | 'cutoff'
  | 'circularization-start'
  | 'circularization-end'
  | 'orbit'
  | 'chute-deploy'
  | 'touchdown'
  | 'impact'
  | 'failure';

export interface FlightEvent {
  id: EventId;
  /** Mission elapsed time, s. */
  t: number;
  label: string;
  /** Stage index for burnout/separation/ignition. */
  stage?: number;
  data?: Record<string, number>;
}

export type FailureId =
  | 'unstable-tumble'
  | 'weathercock'
  | 'maxq-structural'
  | 'fin-flutter'
  | 'tank-burst'
  | 'flow-separation'
  | 'cavitation'
  | 'battery-depleted'
  | 'pressurant-depleted'
  | 'chute-shred'
  | 'pad-crawl'
  | 'boiloff-shortfall';

export interface FailureEvent {
  id: FailureId;
  t: number;
  severity: 'warning' | 'degraded' | 'loss-of-vehicle';
  detail: string;
  lessonId: string;
  /** Numbers the mishap report substitutes into the governing equation. */
  data?: Record<string, number>;
}

/** Structure-of-arrays telemetry, uniform channels, one shared time array.
    Decimated to ~5 Hz plus full-rate windows around events. */
export interface TrajectoryTable {
  t: Float64Array;
  /** Earth-centered inertial plane coords, m. */
  x: Float64Array;
  y: Float64Array;
  altitude: Float64Array;
  /** Surface downrange arc, m. */
  downrange: Float64Array;
  vx: Float64Array;
  vy: Float64Array;
  /** Inertial speed, m/s. */
  speed: Float64Array;
  /** Air-relative speed, m/s. */
  airspeed: Float64Array;
  mach: Float64Array;
  /** Dynamic pressure, Pa. */
  q: Float64Array;
  /** Angle of attack (commanded attitude vs air-relative velocity), rad. */
  aoa: Float64Array;
  /** Flight-path angle above local horizon, rad. */
  flightPathAngle: Float64Array;
  /** Commanded pitch above local horizon, rad. */
  pitch: Float64Array;
  /** Total thrust, N. */
  thrust: Float64Array;
  drag: Float64Array;
  mass: Float64Array;
  twr: Float64Array;
  /** Sensed acceleration magnitude, m/s² (thrust+drag, no gravity). */
  accel: Float64Array;
  throttle: Float64Array;
  /** Active stage index; -1 after final burnout. */
  stage: Float64Array;
}

export interface OrbitElements {
  apoapsisAlt: number;
  periapsisAlt: number;
  eccentricity: number;
  semiMajorAxis: number;
  period: number;
}

export interface FlightSummary {
  outcome: 'success' | 'failure';
  apogee: number;
  maxQ: { value: number; altitude: number; t: number };
  maxMach: number;
  /** Peak sensed acceleration, g. */
  maxAccelG: number;
  downrange: number;
  flightTime: number;
  deltaVSpent: number;
  lossGravity: number;
  lossDrag: number;
  lossSteering: number;
  /** Touchdown speed if the vehicle came home under chute, m/s. */
  landingSpeed?: number;
}

export interface FlightResult {
  table: TrajectoryTable;
  events: FlightEvent[];
  failures: FailureEvent[];
  orbit: OrbitElements | null;
  summary: FlightSummary;
}
