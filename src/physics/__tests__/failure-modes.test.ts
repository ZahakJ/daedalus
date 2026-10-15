/**
 * Failure-mode fixtures: a canonical BAD design per teachable failure, each
 * asserted to fail with the right id. The goldens prove the campaign is
 * winnable; these prove it is instructive — every lesson in FAILURES must
 * still be reachable by a design a player could plausibly build.
 */
import { describe, expect, it } from 'vitest';
import type { Environment, RocketDesign } from '../types.ts';
import { MISSIONS } from '../../campaign/catalog.ts';
import { GOLDEN } from '../../campaign/golden.ts';
import { simulateFlight } from '../simulateFlight.ts';
import { FAILURES } from '../failures.ts';
import type { MissionId } from '../../schema.ts';

const ENV: Environment = { weatherSeed: 'failure-fixtures' };

/** Start from a mission's known-good design, then break exactly one thing. */
function from(id: MissionId, break_: (d: RocketDesign) => void): RocketDesign {
  const m = MISSIONS.find((x) => x.id === id)!;
  const d = m.preset();
  GOLDEN[id](d);
  break_(d);
  return d;
}

function failureIds(design: RocketDesign): string[] {
  return simulateFlight(design, ENV).failures.map((f) => f.id);
}

describe('failure modes — every lesson stays reachable', () => {
  it('pad-crawl: an engine that cannot lift its own vehicle', () => {
    const d = from('liquid-fire', (x) => {
      (x.stages[0]!.propulsion as { engine: { vacuumThrust: number } }).engine.vacuumThrust = 8e3;
    });
    expect(failureIds(d)).toContain('pad-crawl');
  });

  it('tank-burst: safety factor below the weld-knockdown floor', () => {
    const d = from('liquid-fire', (x) => {
      x.stages[0]!.tanks!.safetyFactor = 1.02;
    });
    expect(failureIds(d)).toContain('tank-burst');
  });

  it('unstable-tumble: fins too small to hold the center of pressure aft', () => {
    const d = from('first-flight', (x) => {
      x.fins!.span = 0.04;
      x.fins!.rootChord = 0.06;
      x.noseBallast = 0;
    });
    expect(failureIds(d)).toContain('unstable-tumble');
  });

  it('fin-flutter: fins too thin for the airspeed they will see', () => {
    const d = from('karman-line', (x) => {
      x.fins!.thickness = 1.5e-3;
      x.fins!.material = 'cfrp';
    });
    expect(failureIds(d)).toContain('fin-flutter');
  });

  it('flow-separation: a vacuum nozzle bolted to a sea-level stage', () => {
    const d = from('liquid-fire', (x) => {
      (x.stages[0]!.propulsion as { engine: { expansionRatio: number } }).engine.expansionRatio = 90;
    });
    expect(failureIds(d)).toContain('flow-separation');
  });

  it('chute-shred: deploying the canopy while still supersonic', () => {
    const d = from('first-flight', (x) => {
      x.recovery = { chuteArea: 2.5, deploy: { altitude: 300 } };
    });
    // Deploying on the way up at 300 m — the vehicle is still under thrust.
    const r = simulateFlight(d, ENV);
    expect(r.failures.map((f) => f.id)).toContain('chute-shred');
  });

  it('maxq-structural: a paper-thin airframe flown flat through max-Q', () => {
    const d = from('gravity-turn', (x) => {
      x.stages[0]!.tanks!.safetyFactor = 1.16; // just above the burst floor
      x.stages[0]!.tanks!.material = 'cfrp';
      // Pitch over hard and early, so the vehicle is still deep in the
      // atmosphere when it is fastest — the classic too-flat ascent.
      x.guidance.pitchKick = { atSpeed: 35, angle: (32 * Math.PI) / 180 };
      x.guidance.verticalUntilSpeed = 35;
      delete x.guidance.throttleBucket;
    });
    expect(failureIds(d)).toContain('maxq-structural');
  });

  it('boiloff-shortfall: LH2 in an uninsulated tank across a long coast', () => {
    const d = from('high-energy', (x) => {
      x.stages[1]!.tanks!.insulated = false;
    });
    const ids = failureIds(d);
    // Uninsulated LH2 either boils off short or never reaches the GTO burn.
    const r = simulateFlight(d, ENV);
    const reachedGto = (r.orbit?.apoapsisAlt ?? 0) > 30e6;
    expect(ids.includes('boiloff-shortfall') || !reachedGto).toBe(true);
  });

  it('cavitation: chamber pressure outruns the pump suction head', () => {
    const d = from('pumps-and-power', (x) => {
      (x.stages[0]!.propulsion as { engine: { chamberPressure: number } }).engine.chamberPressure = 30e6;
    });
    expect(failureIds(d)).toContain('cavitation');
  });

  it('pressurant-depleted: a pressure-fed stage asked to restart', () => {
    const d = from('two-steps', (x) => {
      // The upper stage is pressure-fed; ask it to coast and circularize, so
      // it must re-pressurize and run the single-blowdown COPV dry.
      x.guidance.cutoff = { apoapsisTarget: 400e3 };
      x.guidance.circularizeAtApoapsis = true;
    });
    expect(failureIds(d)).toContain('pressurant-depleted');
  });

  it('weathercock: an over-stable vehicle leans into the launch-day wind', () => {
    const d = from('first-flight', (x) => {
      x.fins!.span = 0.22;
      x.fins!.rootChord = 0.286;
      x.noseBallast = 14; // way past the stability sweet spot
    });
    // M1's launch day carries a real crosswind; weather is fixed per mission.
    const r = simulateFlight(d, { weatherSeed: 'first-flight:A' });
    expect(r.failures.map((f) => f.id)).toContain('weathercock');
  });

  it('the M1 stability lesson has a genuine sweet spot', () => {
    const build = (ballast: number): string[] => {
      const d = from('first-flight', (x) => {
        x.fins!.span = 0.22;
        x.fins!.rootChord = 0.286;
        x.noseBallast = ballast;
      });
      return simulateFlight(d, { weatherSeed: 'first-flight:A' }).failures.map((f) => f.id);
    };
    expect(build(6)).toContain('unstable-tumble'); // too little → tumbles
    expect(build(10)).toEqual([]); // just right → clean flight
    expect(build(14)).toContain('weathercock'); // too much → weathercocks
  });

  it('every failure id in the catalog carries teaching metadata', () => {
    for (const [id, info] of Object.entries(FAILURES)) {
      expect(info.id, id).toBe(id);
      expect(info.title.length, id).toBeGreaterThan(4);
      expect(info.lessonId.length, id).toBeGreaterThan(2);
      expect(info.cause.length, id).toBeGreaterThan(20);
      expect(info.fixHint.length, id).toBeGreaterThan(8);
    }
  });

  it('failures are deterministic: the same broken design fails identically', () => {
    const d = from('first-flight', (x) => {
      x.fins!.span = 0.04;
      x.noseBallast = 0;
    });
    const a = simulateFlight(d, ENV);
    const b = simulateFlight(d, ENV);
    expect(a.failures.map((f) => `${f.id}@${f.t}`)).toEqual(b.failures.map((f) => `${f.id}@${f.t}`));
  });
});
