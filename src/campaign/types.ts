import type { DerivedPerformance, FlightResult, RocketDesign } from '../physics/types.ts';
import type { MissionId } from '../schema.ts';

export interface ObjectiveResult {
  pass: boolean;
  /** Human-readable achieved value, e.g. "104.2 km". */
  actual: string;
  /** Human-readable requirement, e.g. "≥ 100 km". */
  target: string;
}

export interface Objective {
  id: string;
  label: string;
  evaluate(result: FlightResult, design: RocketDesign, derived: DerivedPerformance): ObjectiveResult;
}

/** Feature gates: what the bureau exposes at each point in the campaign. */
export type Feature =
  | 'fixed-motors' // M1: pick from 3 canned solids
  | 'recovery' // M1
  | 'fins' // M1
  | 'nose-shape' // M1
  | 'solid-designer' // M2: full solid motor design
  | 'airframe-material' // M2
  | 'liquid-engine' // M3: MR, pc, ε (pressure-fed only)
  | 'tank-design' // M3
  | 'pump-cycles' // M4: gas-generator + electric-pump
  | 'throttle-bucket' // M4
  | 'staging' // M5: second stage, interstage, fairing
  | 'pitch-kick' // M5
  | 'guidance-full' // M6: prograde law, apoapsis cutoff, latitude
  | 'advanced-materials' // M7: al-li, ss-301fh, common bulkhead
  | 'staged-combustion' // M7
  | 'cost-readout' // M7
  | 'lh2-restart'; // M8: LOX/LH2, restart, boiloff

export interface Mission {
  id: MissionId;
  /** 0-based campaign position. */
  index: number;
  title: string;
  /** Campaign-map one-liner. */
  tagline: string;
  /** Program-memo goal statement. */
  goal: string;
  /** Ladder height on the campaign map, m. */
  altitudeTarget: number;
  /** Handbook concepts that unlock when this mission becomes available. */
  newConcepts: string[];
  /** Features first available in this mission's bureau. */
  newFeatures: Feature[];
  /** Payload rule: fixed mass the mission supplies, or a deliverable minimum. */
  payload: { fixed: number } | { min: number };
  /** Program cost ceiling (M7 only), cost units. */
  costCap?: number;
  objectives: Objective[];
  /** Starting design when the user first enters the bureau. */
  preset(): RocketDesign;
}
