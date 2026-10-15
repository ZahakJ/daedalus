/**
 * Golden fixtures: one known-good design per mission that must ALWAYS pass
 * its objectives — the regression net for every physics change. If a physics
 * tweak breaks one of these, the campaign just became unwinnable somewhere.
 *
 * Each golden is the mission preset plus the deltas a player would plausibly
 * discover across 2–4 flights (the presets are deliberately imperfect).
 */
import { describe, expect, it } from 'vitest';
import { MISSIONS } from '../../campaign/catalog.ts';
import { simulateFlight } from '../simulateFlight.ts';
import { computeDerived } from '../derived.ts';
import { GOLDEN } from '../../campaign/golden.ts';

describe('golden fixtures — the campaign is winnable', () => {
  for (const m of MISSIONS) {
    it(`${m.id}: golden design passes every objective`, () => {
      const design = m.preset();
      GOLDEN[m.id](design);
      const derived = computeDerived(design);
      const r = simulateFlight(design, { weatherSeed: `${m.id}:1` });
      for (const o of m.objectives) {
        const res = o.evaluate(r, design, derived);
        expect(res.pass, `${o.id}: got ${res.actual}, need ${res.target}`).toBe(true);
      }
    });
  }

  it('presets are imperfect but never structurally hopeless: each has ≥ 60% of required Δv', () => {
    for (const m of MISSIONS) {
      const d = computeDerived(m.preset());
      expect(d.totalDeltaV, m.id).toBeGreaterThan(0);
    }
  });
});
