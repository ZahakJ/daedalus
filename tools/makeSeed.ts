/**
 * Generate tools/smoke-seed.json: localStorage slices for the smoke test so
 * every route renders real state — first-flight completed (museum content),
 * karman-line with a committed golden flight (flight/debrief render live).
 *
 *   npx tsx tools/makeSeed.ts
 */
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MISSIONS } from '../src/campaign/catalog.ts';
import { GOLDEN } from '../src/campaign/golden.ts';
import { simulateFlight } from '../src/physics/simulateFlight.ts';

const env = (slice: unknown): string => JSON.stringify({ v: 1, data: slice });

function flightRecord(missionId: 'first-flight' | 'karman-line', rev: string) {
  const m = MISSIONS.find((x) => x.id === missionId)!;
  const design = m.preset();
  GOLDEN[missionId](design);
  const seed = `${missionId}:${rev}`;
  const r = simulateFlight(design, { weatherSeed: seed });
  return {
    rev,
    seed,
    design,
    at: '2026-07-18T12:00:00.000Z',
    outcome: r.summary.outcome,
    apogee: r.summary.apogee,
    maxQ: r.summary.maxQ.value,
    failureIds: r.failures.map((f) => f.id),
    waivedRisks: [],
    diff: rev === 'A' ? 'initial design' : 'fins.span 0.14→0.15 · ballast +4 kg',
  };
}

const ffRecord = flightRecord('first-flight', 'B');
const klRecord = flightRecord('karman-line', 'A');

const campaign = {
  completions: {
    'first-flight': {
      at: '2026-07-18T12:00:00.000Z',
      flights: 2,
      bestApogee: ffRecord.apogee,
      vehicle: ffRecord.design,
      vehicleName: 'DX-1',
      epitaph: 'Tumbled once, then flew true.',
    },
  },
};

const seed = {
  'daedalus:v1:campaign': env(campaign),
  'daedalus:v1:designs': env({ 'karman-line': klRecord.design }),
  'daedalus:v1:committed': env({ 'karman-line': klRecord }),
  'daedalus:v1:revisions': env({
    'first-flight': [ffRecord],
    'karman-line': [klRecord],
  }),
};

const out = join(dirname(fileURLToPath(import.meta.url)), 'smoke-seed.json');
writeFileSync(out, JSON.stringify(seed, null, 1));
console.log(`wrote ${out}`);
