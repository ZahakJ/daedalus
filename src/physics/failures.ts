/**
 * Failure catalog: id → severity semantics, lesson link, and report language.
 * Detection lives in simulateFlight.ts (in the integration loop, where the
 * numbers are); this table is what the mishap report and the debrief read.
 */
import type { FailureId } from './types.ts';

export interface FailureInfo {
  id: FailureId;
  title: string;
  lessonId: string;
  /** Mishap-report probable-cause template; {v} placeholders substituted from
      FailureEvent.data by the debrief generator. */
  cause: string;
  /** The decision the finding points at. */
  fixHint: string;
}

export const FAILURES: Record<FailureId, FailureInfo> = {
  'pad-crawl': {
    id: 'pad-crawl',
    title: 'INSUFFICIENT LIFTOFF THRUST',
    lessonId: 'twr',
    cause: 'Liftoff thrust-to-weight {twr} < 1.02. Vehicle consumed propellant on the pad without climbing.',
    fixHint: 'Raise thrust or cut mass until T/W ≥ 1.2.',
  },
  'unstable-tumble': {
    id: 'unstable-tumble',
    title: 'LOSS OF STABILITY',
    lessonId: 'static-stability',
    cause: 'Static margin fell to {margin} cal (guideline ≥ 1.0) with q = {q} Pa — center of pressure ahead of center of gravity.',
    fixHint: 'Larger fins, longer nose, or ballast forward.',
  },
  weathercock: {
    id: 'weathercock',
    title: 'WEATHERCOCK INTO WIND',
    lessonId: 'static-stability',
    cause: 'Over-stable vehicle (margin {margin} cal) rotated into a {wind} m/s crosswind at rail exit — trajectory bent {bend}° off vertical.',
    fixHint: 'Reduce fin area toward 1–2 cal, or fly a calmer day.',
  },
  'maxq-structural': {
    id: 'maxq-structural',
    title: 'STRUCTURAL FAILURE AT MAX-Q',
    lessonId: 'max-q',
    cause: 'Airframe load exceeded capability at q = {q} Pa, α = {aoa}° — compressive margin {margin}%.',
    fixHint: 'Thicker walls, higher SF, or a max-Q throttle bucket.',
  },
  'fin-flutter': {
    id: 'fin-flutter',
    title: 'FIN FLUTTER',
    lessonId: 'fin-flutter',
    cause: 'Airspeed {v} m/s exceeded the flutter boundary {vf} m/s. Fin structural divergence, loss of fin, loss of stability.',
    fixHint: 'Thicker fins, stiffer material, or shorter span.',
  },
  'tank-burst': {
    id: 'tank-burst',
    title: 'TANK OVERPRESSURE AT IGNITION',
    lessonId: 'hoop-stress',
    cause: 'Tank safety factor {sf} below the 1.15 weld-knockdown floor. Burst at pressurization to {meop} Pa.',
    fixHint: 'SF ≥ 1.25 for flight hardware.',
  },
  'flow-separation': {
    id: 'flow-separation',
    title: 'NOZZLE FLOW SEPARATION',
    lessonId: 'nozzle-expansion',
    cause: 'Exit pressure {pe} Pa fell below 0.35× ambient {pa} Pa — separated flow, asymmetric side loads, thrust loss.',
    fixHint: 'Lower expansion ratio for the sea-level stage.',
  },
  cavitation: {
    id: 'cavitation',
    title: 'PUMP CAVITATION',
    lessonId: 'engine-cycles',
    cause: 'Feed pressure below pump NPSH requirement.',
    fixHint: 'Raise tank pressure.',
  },
  'battery-depleted': {
    id: 'battery-depleted',
    title: 'RESTART CAPABILITY EXCEEDED',
    lessonId: 'engine-cycles',
    cause: 'Stage attempted restart #{attempt}, but the {cycle} cycle supports {allowed}. Ignition failed.',
    fixHint: 'Pick a restartable cycle for the upper stage.',
  },
  'pressurant-depleted': {
    id: 'pressurant-depleted',
    title: 'PRESSURANT DEPLETION',
    lessonId: 'pressure-fed',
    cause: 'Helium exhausted before propellant depletion; chamber pressure sagged.',
    fixHint: 'Bigger COPV.',
  },
  'chute-shred': {
    id: 'chute-shred',
    title: 'PARACHUTE FAILURE AT DEPLOY',
    lessonId: 'recovery',
    cause: 'Canopy deployed at q = {q} Pa — above the 1.2 kPa structural limit. Canopy destroyed; ballistic descent.',
    fixHint: 'Deploy at apogee, or lower.',
  },
  'boiloff-shortfall': {
    id: 'boiloff-shortfall',
    title: 'CRYOGENIC BOILOFF SHORTFALL',
    lessonId: 'boiloff',
    cause: '{lost} kg of LH2 boiled off during coast; the burn ran dry {dv} m/s short.',
    fixHint: 'Insulate, shorten the coast, or carry margin propellant.',
  },
};

/** Restarts allowed per engine cycle beyond the first ignition. */
export const RESTARTS_ALLOWED: Record<string, number> = {
  'pressure-fed': 99,
  'staged-combustion': 2,
  'gas-generator': 1,
  'electric-pump': 0,
};
