/**
 * Immutable RocketDesign update helpers. Every decision-card mutation flows
 * through one of these + store.setDesign, so a card can never half-mutate a
 * design or touch a stage that isn't there (helpers no-op on kind mismatch).
 */
import type {
  EngineDesign,
  FinSet,
  GuidanceProgram,
  RecoveryConfig,
  RocketDesign,
  SolidMotorDesign,
  StageDesign,
  TankConfig,
} from '../physics/types.ts';

export function patchDesign(d: RocketDesign, patch: Partial<RocketDesign>): RocketDesign {
  return { ...d, ...patch };
}

export function patchStage(d: RocketDesign, i: number, patch: Partial<StageDesign>): RocketDesign {
  return { ...d, stages: d.stages.map((s, j) => (j === i ? { ...s, ...patch } : s)) };
}

/** Patch the liquid engine of stage i (no-op on solid stages). */
export function patchEngine(d: RocketDesign, i: number, patch: Partial<EngineDesign>): RocketDesign {
  return {
    ...d,
    stages: d.stages.map((s, j) =>
      j === i && s.propulsion.kind === 'liquid'
        ? { ...s, propulsion: { ...s.propulsion, engine: { ...s.propulsion.engine, ...patch } } }
        : s,
    ),
  };
}

/** Set the liquid propellant load of stage i, kg (no-op on solid stages). */
export function setStagePropellant(d: RocketDesign, i: number, mass: number): RocketDesign {
  return {
    ...d,
    stages: d.stages.map((s, j) =>
      j === i && s.propulsion.kind === 'liquid'
        ? { ...s, propulsion: { ...s.propulsion, propellantMass: mass } }
        : s,
    ),
  };
}

/** Patch the solid motor of stage i (no-op on liquid stages). */
export function patchSolid(d: RocketDesign, i: number, patch: Partial<SolidMotorDesign>): RocketDesign {
  return {
    ...d,
    stages: d.stages.map((s, j) =>
      j === i && s.propulsion.kind === 'solid'
        ? { ...s, propulsion: { ...s.propulsion, motor: { ...s.propulsion.motor, ...patch } } }
        : s,
    ),
  };
}

/** Patch the tank config of stage i (no-op when the stage has no tanks). */
export function patchTanks(d: RocketDesign, i: number, patch: Partial<TankConfig>): RocketDesign {
  return {
    ...d,
    stages: d.stages.map((s, j) =>
      j === i && s.tanks !== undefined ? { ...s, tanks: { ...s.tanks, ...patch } } : s,
    ),
  };
}

export function patchFins(d: RocketDesign, patch: Partial<FinSet>): RocketDesign {
  if (!d.fins) return d;
  return { ...d, fins: { ...d.fins, ...patch } };
}

export function patchRecovery(d: RocketDesign, patch: Partial<RecoveryConfig>): RocketDesign {
  if (!d.recovery) return d;
  return { ...d, recovery: { ...d.recovery, ...patch } };
}

export function patchGuidance(d: RocketDesign, patch: Partial<GuidanceProgram>): RocketDesign {
  return { ...d, guidance: { ...d.guidance, ...patch } };
}

export function patchLaunch(d: RocketDesign, patch: Partial<RocketDesign['launch']>): RocketDesign {
  return { ...d, launch: { ...d.launch, ...patch } };
}

export function setNoseBallast(d: RocketDesign, kg: number): RocketDesign {
  return { ...d, noseBallast: kg };
}
