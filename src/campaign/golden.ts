/**
 * Known-good design deltas per mission: preset + patch = a design that passes
 * every objective. The vitest golden suite runs these; tools/makeSeed.ts uses
 * them to seed realistic app state.
 */
import type { RocketDesign } from '../physics/types.ts';
import type { MissionId } from '../schema.ts';

const deg = (d: number): number => (d * Math.PI) / 180;

export const GOLDEN: Record<MissionId, (d: RocketDesign) => void> = {
  // Tumbles as shipped: bigger fins + nose ballast fix the static margin.
  'first-flight': (d) => {
    d.fins!.span = 0.15;
    d.noseBallast = 4;
  },
  // Flutters as shipped: thick steel fins + a slimmer airframe.
  'karman-line': (d) => {
    d.stages[0]!.diameter = 0.3;
    d.fins!.span = 0.45;
    d.fins!.rootChord = 0.585;
    d.fins!.tipChord = 0.225;
    d.fins!.thickness = 0.012;
    d.fins!.material = 'steel-4130';
    d.noseBallast = 16;
  },
  // Preset already clean after the ε lesson is applied (ships at ε 5).
  'liquid-fire': () => {},
  'pumps-and-power': () => {},
  'two-steps': () => {},
  // The lofted 5° kick parks you in a 700 km orbit; a real gravity turn.
  'gravity-turn': (d) => {
    d.guidance.pitchKick = { atSpeed: 45, angle: deg(20) };
    d.guidance.verticalUntilSpeed = 45;
  },
  // Gentler turn + shave thrust class to duck under the cost cap.
  'every-kilogram': (d) => {
    d.guidance.pitchKick = { atSpeed: 65, angle: deg(16) };
    d.guidance.verticalUntilSpeed = 65;
    (d.stages[0]!.propulsion as { engine: { vacuumThrust: number } }).engine.vacuumThrust = 1150e3;
  },
  'high-energy': (d) => {
    d.guidance.pitchKick = { atSpeed: 55, angle: deg(14) };
    d.guidance.verticalUntilSpeed = 55;
  },
};

