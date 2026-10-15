import { describe, expect, it } from 'vitest';
import type { Environment, RocketDesign } from '../types.ts';
import { simulateFlight } from '../simulateFlight.ts';
import { computeDerived } from '../derived.ts';
import { G0 } from '../constants.ts';

const ENV: Environment = { weatherSeed: 'calm-day' };
const deg = (d: number): number => (d * Math.PI) / 180;

/** V-2 GEOMETRY with modern parts: same 8.8 t propellant load and ~265 kN
    sea-level thrust as the 1944 vehicle, but a gas-generator engine (T/W 90 vs
    ~20) and modern tank fractions make it far lighter and hotter — the 1944
    original (Isp 239 vac, 3.2 t structure) reached ~175 km vertical; this one
    should overperform it substantially. Payload is ballasted to 2.4 t to keep
    the burnout mass in a sane band. */
function v2Like(): RocketDesign {
  return {
    name: 'A-4',
    stages: [
      {
        diameter: 1.65,
        propulsion: {
          kind: 'liquid',
          engine: {
            propellant: 'lox-rp1', // stand-in for LOX/ethanol: match Isp via pc/ε
            mixtureRatio: 1.9,
            chamberPressure: 1.5e6,
            vacuumThrust: 312e3,
            expansionRatio: 3.4,
            cycle: 'gas-generator',
            count: 1,
          },
          propellantMass: 8800,
        },
        tanks: { material: 'ss-304l', safetyFactor: 1.5, commonBulkhead: false, insulated: false },
        interstageLength: 0,
        separationDelay: 0,
        ignitionDelay: 0,
      },
    ],
    payloadMass: 2400,
    noseShape: 'ogive',
    noseFineness: 3,
    fairing: false,
    fins: {
      count: 4,
      rootChord: 2.4,
      tipChord: 1.0,
      span: 1.1,
      sweep: deg(35),
      thickness: 0.025,
      material: 'steel-4130',
    },
    launch: { latitude: deg(52), railLength: 4 },
    guidance: {
      verticalUntilSpeed: 1e9,
      pitchKick: { atSpeed: 1e9, angle: 0 },
      law: 'prograde',
      cutoff: 'depletion',
    },
  };
}

describe('simulateFlight integration anchors', () => {
  it('is deterministic: identical design+seed → identical trajectory', () => {
    const a = simulateFlight(v2Like(), ENV);
    const b = simulateFlight(v2Like(), ENV);
    expect(a.table.t.length).toBe(b.table.t.length);
    expect(Array.from(a.table.x)).toEqual(Array.from(b.table.x));
    expect(Array.from(a.table.q)).toEqual(Array.from(b.table.q));
    expect(a.summary.apogee).toBe(b.summary.apogee);
  });

  it('V-2-geometry vertical flight reaches a 180–320 km apogee, clean', () => {
    const r = simulateFlight(v2Like(), ENV);
    const lov = r.failures.filter((f) => f.severity === 'loss-of-vehicle');
    expect(lov, JSON.stringify(lov)).toEqual([]);
    expect(r.summary.apogee).toBeGreaterThan(180e3);
    expect(r.summary.apogee).toBeLessThan(320e3);
    // Max-Q in a plausible band for a vertical vehicle of this T/W.
    expect(r.summary.maxQ.value).toBeGreaterThan(30e3);
    expect(r.summary.maxQ.value).toBeLessThan(160e3);
  });

  it('coast integrator matches closed-form vis-viva apogee within 2%', () => {
    const r = simulateFlight(v2Like(), ENV);
    // Find burnout sample, predict apogee from specific energy, compare.
    let i = 1;
    while (i < r.table.t.length && !(r.table.thrust[i]! === 0 && r.table.thrust[i - 1]! > 0)) i++;
    const rr = Math.hypot(r.table.x[i]!, r.table.y[i]!);
    const v = r.table.speed[i]!;
    const MU = 3.986004418e14;
    const R = 6.371e6;
    const invR1 = 1 / rr - (v * v) / (2 * MU);
    const apoPredicted = 1 / invR1 - R;
    // The trajectory continues past burnout losing a little energy to residual
    // drag above 60 km — allow 2%.
    expect(Math.abs(r.summary.apogee - apoPredicted) / apoPredicted).toBeLessThan(0.02);
  });

  it('drag-free sanity: Δv spent ≈ ideal minus losses accounts for apogee energy', () => {
    const r = simulateFlight(v2Like(), ENV);
    const d = computeDerived(v2Like());
    // dvSpent should be within a few percent of stage ideal Δv (full depletion).
    expect(r.summary.deltaVSpent).toBeGreaterThan(d.totalDeltaV * 0.93);
    expect(r.summary.deltaVSpent).toBeLessThan(d.totalDeltaV * 1.07);
    // Loss budget is positive and dominated by gravity for a vertical shot.
    expect(r.summary.lossGravity).toBeGreaterThan(r.summary.lossDrag);
  });

  it('events arrive in causal order with liftoff first', () => {
    const r = simulateFlight(v2Like(), ENV);
    const ids = r.events.map((e) => e.id);
    expect(ids[0]).toBe('liftoff');
    const tArr = r.events.map((e) => e.t);
    expect([...tArr].sort((a, b) => a - b)).toEqual(tArr);
    expect(ids).toContain('max-q');
    expect(ids).toContain('burnout');
    expect(ids).toContain('apogee');
  });

  it('pad-crawl: hopeless TWR fails immediately', () => {
    const d = v2Like();
    (d.stages[0]!.propulsion as { engine: { vacuumThrust: number } }).engine.vacuumThrust = 100e3;
    const r = simulateFlight(d, ENV);
    expect(r.failures.some((f) => f.id === 'pad-crawl')).toBe(true);
    expect(r.summary.outcome).toBe('failure');
  });

  it('tank burst: SF below the weld floor kills the vehicle at t=0', () => {
    const d = v2Like();
    d.stages[0]!.tanks!.safetyFactor = 1.05;
    const r = simulateFlight(d, ENV);
    expect(r.failures.some((f) => f.id === 'tank-burst')).toBe(true);
  });

  it('mass conservation: recorded mass is monotonically non-increasing during burn', () => {
    const r = simulateFlight(v2Like(), ENV);
    let prev = Infinity;
    for (let i = 0; i < r.table.mass.length; i++) {
      if (r.table.stage[i]! === 0 && r.table.thrust[i]! > 0) {
        expect(r.table.mass[i]!).toBeLessThanOrEqual(prev + 1e-9);
        prev = r.table.mass[i]!;
      }
    }
  });

  it('performance: full sim runs in well under 50 ms', () => {
    const d = v2Like();
    simulateFlight(d, ENV); // warm
    const t0 = performance.now();
    simulateFlight(d, ENV);
    const ms = performance.now() - t0;
    expect(ms).toBeLessThan(50);
  });

  it('twr recorded at liftoff matches derived prediction', () => {
    const r = simulateFlight(v2Like(), ENV);
    const d = computeDerived(v2Like());
    const liftoffEvent = r.events.find((e) => e.id === 'liftoff');
    expect(liftoffEvent?.data?.['twr']).toBeCloseTo(d.stages[0]!.twrIgnition, 1);
    expect(d.stages[0]!.twrIgnition).toBeGreaterThan(1.5);
    expect(d.stages[0]!.twrIgnition).toBeLessThan(3.5);
  });

  it('Tsiolkovsky cross-check: derived stage Δv equals Isp·g0·ln(m0/mf)', () => {
    const d = computeDerived(v2Like());
    const s = d.stages[0]!;
    const expected = s.ispVac * G0 * Math.log(s.ignitionMass / s.burnoutMass);
    expect(s.deltaV).toBeCloseTo(expected, 6);
  });
});
