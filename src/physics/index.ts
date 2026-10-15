/** Public surface of the physics engine. Everything pure and deterministic. */
export * from './types.ts';
export * from './constants.ts';
export { atmosphere, type AtmoState } from './atmosphere.ts';
export { computeDerived, stabilityReport, structuralMargins, designWarnings } from './derived.ts';
export { computeVehicleMass, vehicleCG, type VehicleMass, type StageMassBreakdown } from './mass.ts';
export { simulateFlight } from './simulateFlight.ts';
export { FAILURES, RESTARTS_ALLOWED, type FailureInfo } from './failures.ts';
export { evaluateEngine } from './propulsion/engine.ts';
export { evaluateSolid, type SolidPerformance } from './propulsion/solid.ts';
export { sizeStageTanks } from './tanks.ts';
export { material, MATERIALS, type Material } from './materials.ts';
export { orbitalElements, isOrbit, circularSpeed, visViva } from './orbit.ts';
export { windProfile } from './wind.ts';
