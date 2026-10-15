/**
 * Zod schemas for everything that crosses the localStorage boundary.
 * The TS types in physics/types.ts are the source of truth: every design
 * schema is annotated z.ZodType<T> so drift is a compile error.
 */
import { z } from 'zod';
import type {
  EngineDesign,
  FinSet,
  GuidanceProgram,
  RecoveryConfig,
  RocketDesign,
  SolidMotorDesign,
  StageDesign,
  StagePropulsion,
  TankConfig,
} from './physics/types.ts';

/** Bump when any persisted shape changes; add a migration step alongside. */
export const PERSIST_VERSION = 1;

const propellantId = z.enum(['lox-rp1', 'lox-ch4', 'lox-lh2', 'nto-mmh']);
const materialId = z.enum([
  'al-2219',
  'al-li-2195',
  'ss-304l',
  'ss-301fh',
  'ti-6al4v',
  'cfrp',
  'steel-4130',
]);
const engineCycle = z.enum(['pressure-fed', 'gas-generator', 'electric-pump', 'staged-combustion']);
const noseShape = z.enum(['conical', 'ogive', 'von-karman']);
const thrustProfile = z.enum(['progressive', 'neutral', 'regressive']);

const engineDesign: z.ZodType<EngineDesign> = z.object({
  propellant: propellantId,
  mixtureRatio: z.number().positive(),
  chamberPressure: z.number().positive(),
  vacuumThrust: z.number().positive(),
  expansionRatio: z.number().min(1),
  cycle: engineCycle,
  count: z.number().int().min(1).max(9),
});

const solidMotorDesign: z.ZodType<SolidMotorDesign> = z.object({
  propellantMass: z.number().positive(),
  burnTime: z.number().positive(),
  thrustProfile,
  expansionRatio: z.number().min(1),
  caseMaterial: materialId,
});

const tankConfig: z.ZodType<TankConfig> = z.object({
  material: materialId,
  safetyFactor: z.number().min(1).max(4),
  commonBulkhead: z.boolean(),
  insulated: z.boolean(),
});

const stagePropulsion: z.ZodType<StagePropulsion> = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('liquid'), engine: engineDesign, propellantMass: z.number().positive() }),
  z.object({ kind: z.literal('solid'), motor: solidMotorDesign }),
]);

const stageDesign: z.ZodType<StageDesign> = z.object({
  diameter: z.number().positive(),
  propulsion: stagePropulsion,
  tanks: tankConfig.optional(),
  interstageLength: z.number().min(0),
  separationDelay: z.number().min(0),
  ignitionDelay: z.number().min(0),
});

const finSet: z.ZodType<FinSet> = z.object({
  count: z.number().int().min(2).max(8),
  rootChord: z.number().positive(),
  tipChord: z.number().min(0),
  span: z.number().positive(),
  sweep: z.number().min(0),
  thickness: z.number().positive(),
  material: materialId,
});

const recoveryConfig: z.ZodType<RecoveryConfig> = z.object({
  chuteArea: z.number().positive(),
  deploy: z.union([z.literal('apogee'), z.object({ altitude: z.number().positive() })]),
});

const guidanceProgram: z.ZodType<GuidanceProgram> = z.object({
  verticalUntilSpeed: z.number().min(0),
  pitchKick: z.object({ atSpeed: z.number().min(0), angle: z.number().min(0) }),
  law: z.union([z.literal('prograde'), z.object({ pitchRate: z.number() })]),
  throttleBucket: z
    .object({ fromQ: z.number().positive(), toQ: z.number().positive(), level: z.number().min(0.1).max(1) })
    .optional(),
  cutoff: z.union([z.literal('depletion'), z.object({ apoapsisTarget: z.number().positive() })]),
  circularizeAtApoapsis: z.boolean().optional(),
  raiseApoapsisTo: z.number().positive().optional(),
  fairingJettisonQ: z.number().positive().optional(),
});

export const rocketDesignSchema: z.ZodType<RocketDesign> = z.object({
  name: z.string().max(64),
  stages: z.array(stageDesign).min(1).max(3),
  payloadMass: z.number().min(0),
  noseShape,
  noseFineness: z.number().min(1).max(8),
  noseBallast: z.number().min(0).max(100).optional(),
  fairing: z.boolean(),
  fins: finSet.optional(),
  recovery: recoveryConfig.optional(),
  launch: z.object({ latitude: z.number(), railLength: z.number().min(0) }),
  guidance: guidanceProgram,
});

// ————— campaign persistence —————

export const missionIdSchema = z.enum([
  'first-flight',
  'karman-line',
  'liquid-fire',
  'pumps-and-power',
  'two-steps',
  'gravity-turn',
  'every-kilogram',
  'high-energy',
]);
export type MissionId = z.infer<typeof missionIdSchema>;

/** One committed flight of a revision: outcome + headline numbers.
    The trajectory itself is re-derived on demand (deterministic sim). */
export const flightRecordSchema = z.object({
  rev: z.string(),
  seed: z.string(),
  design: rocketDesignSchema,
  at: z.string(), // ISO date
  outcome: z.enum(['success', 'failure']),
  apogee: z.number(),
  maxQ: z.number(),
  failureIds: z.array(z.string()),
  /** FRR warn-lines the user explicitly waived pre-flight. */
  waivedRisks: z.array(z.string()),
  /** Diff summary vs previous rev, human-readable. */
  diff: z.string(),
});
export type FlightRecord = z.infer<typeof flightRecordSchema>;

export const completionSchema = z.object({
  at: z.string(),
  flights: z.number().int(),
  bestApogee: z.number(),
  /** The vehicle preserved in the museum. */
  vehicle: rocketDesignSchema,
  vehicleName: z.string(),
  epitaph: z.string(),
});
export type CompletionRecord = z.infer<typeof completionSchema>;

export const campaignStateSchema = z.object({
  completions: z.record(missionIdSchema, completionSchema.optional()),
});
export type CampaignState = z.infer<typeof campaignStateSchema>;

export const designsStateSchema = z.record(missionIdSchema, rocketDesignSchema.optional());
export type DesignsState = z.infer<typeof designsStateSchema>;

export const revisionsStateSchema = z.record(
  missionIdSchema,
  z.array(flightRecordSchema).optional(),
);
export type RevisionsState = z.infer<typeof revisionsStateSchema>;

export const committedStateSchema = z.record(missionIdSchema, flightRecordSchema.optional());
export type CommittedState = z.infer<typeof committedStateSchema>;

export const settingsSchema = z.object({
  /** Free-flight sandbox unlocked by finishing the campaign. */
  sandboxUnlocked: z.boolean(),
});
export type Settings = z.infer<typeof settingsSchema>;
