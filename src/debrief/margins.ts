/**
 * Margin timelines: per-sample proximity-to-limit series derived from the
 * trajectory table — the debrief's "how close did we come" instrument.
 *
 * Each row mirrors the EXACT check simulateFlight runs in its loop (same
 * formulas, same masks), so the bands never contradict the outcome:
 *   structure — equivalent axial load vs buckling capability of the stage-0 wall
 *   flutter   — airspeed vs the NACA TN 4197 boundary at local p, a
 *   stability — static margin vs the 0.5 cal tumble floor (passive vehicles)
 *   twr       — thrust/weight vs 1 during burns
 *
 * proximity = 0 (deep margin) … 1 (at the limit); NaN = not applicable
 * (post-apogee, part jettisoned, engine off, vehicle lost).
 */
import type { FlightResult, RocketDesign } from '../physics/types.ts';
import {
  G0,
  atmosphere,
  computeVehicleMass,
  material,
  vehicleCG,
} from '../physics/index.ts';
import { axialCapability, jointLoads, jointMargin } from '../physics/structures.ts';
import { finsCN, flutterSpeed, noseCN, staticMarginCalibers, totalCP } from '../physics/stability.ts';

export interface MarginWorst {
  /** Mission elapsed time of the closest approach, s. */
  t: number;
  /** The physical value at that instant (load N, airspeed m/s, cal, T/W). */
  value: number;
  /** The limit it approached (capability N, Vf m/s, 0.5 cal, 1.0). */
  limit: number;
  /** Raw proximity at that instant (may exceed 1 when the limit was crossed). */
  proximity: number;
}

export interface MarginRow {
  id: 'structure' | 'flutter' | 'stability' | 'twr';
  label: string;
  /** Per-table-sample proximity, clamped 0..1; NaN where not applicable. */
  series: Float64Array;
  worst: MarginWorst;
  /** "closest approach 4% @ T+41.2" | "limit exceeded @ T+41.2" */
  callout: string;
  status: 'ok' | 'warn' | 'danger';
  /** Formats a physical value of this margin for display. */
  format: (v: number) => string;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

interface Probe {
  /** Raw proximity (unclamped) or NaN when masked. */
  prox: number;
  value: number;
  limit: number;
}

function buildRow(
  id: MarginRow['id'],
  label: string,
  t: Float64Array,
  probe: (i: number) => Probe,
  format: (v: number) => string,
): MarginRow | null {
  const n = t.length;
  const series = new Float64Array(n);
  let worstI = -1;
  let worstProx = -Infinity;
  let worstVal = 0;
  let worstLim = 0;
  for (let i = 0; i < n; i++) {
    const p = probe(i);
    if (Number.isNaN(p.prox)) {
      series[i] = NaN;
      continue;
    }
    series[i] = clamp01(p.prox);
    if (p.prox > worstProx) {
      worstProx = p.prox;
      worstI = i;
      worstVal = p.value;
      worstLim = p.limit;
    }
  }
  if (worstI < 0) return null; // never applicable on this flight
  const worst: MarginWorst = { t: t[worstI]!, value: worstVal, limit: worstLim, proximity: worstProx };
  const tTxt = `T+${worst.t.toFixed(1)}`;
  const distPct = (1 - worstProx) * 100;
  const pctTxt = `${distPct < 9.95 ? distPct.toFixed(1) : distPct.toFixed(0)}%`;
  const callout =
    worstProx >= 1
      ? `limit exceeded @ ${tTxt}`
      : worstProx >= 0.5
        ? `closest approach ${pctTxt} @ ${tTxt}`
        : `min margin ${pctTxt} @ ${tTxt}`;
  const status: MarginRow['status'] = worstProx >= 1 ? 'danger' : worstProx >= 0.8 ? 'warn' : 'ok';
  return { id, label, series, worst, callout, status, format };
}

/**
 * Distance-to-limit series over the flight, sampled from the trajectory table.
 * Rows appear only where the margin exists (fins → flutter, solid first stage
 * with fins → static stability, …).
 */
export function computeMarginTimeline(result: FlightResult, design: RocketDesign): MarginRow[] {
  const { table, events, failures } = result;
  const t = table.t;
  const n = t.length;
  if (n === 0) return [];

  const vm = computeVehicleMass(design);
  const nStages = design.stages.length;
  const apogeeT = events.find((e) => e.id === 'apogee')?.t ?? Infinity;
  const lovT = failures.find((f) => f.severity === 'loss-of-vehicle')?.t ?? Infinity;
  const finLossT = failures.find((f) => f.id === 'fin-flutter')?.t ?? Infinity;
  const passive = design.stages[0]!.propulsion.kind === 'solid';

  const rows: MarginRow[] = [];

  // ————— structure: stage-0 wall, equivalent axial vs buckling capability —————
  // (mirrors the sim's maxq-structural check: same capability, same load case)
  {
    const s0 = design.stages[0]!;
    const s0mat =
      s0.propulsion.kind === 'liquid'
        ? material(s0.tanks?.material ?? 'al-2219')
        : material(s0.propulsion.motor.caseMaterial);
    const s0wall = vm.stages[0]!.tank ? vm.stages[0]!.tank.oxWall : Math.max(s0mat.minGauge, 1.5e-3);
    const s0press = vm.stages[0]!.tank ? vm.stages[0]!.tank.meop * 0.8 : 0;
    const r0 = s0.diameter / 2;
    const cap = axialCapability(s0mat, s0wall, r0, s0press);
    const refArea = Math.PI * (Math.max(...design.stages.map((s) => s.diameter)) / 2) ** 2;
    let massAbove = vm.upperDry;
    for (let j = 1; j < nStages; j++) massAbove += vm.stages[j]!.dry + vm.stages[j]!.propellant;
    const lever = vm.stages[0]!.length * 0.5;
    const deadMass = massAbove + vm.stages[0]!.dry * 0.4;
    const DEG = Math.PI / 180;

    const row = buildRow(
      'structure',
      'STRUCTURE',
      t,
      (i) => {
        const ti = t[i]!;
        if (ti > apogeeT || ti > lovT + 0.2 || table.stage[i]! !== 0) {
          return { prox: NaN, value: 0, limit: cap };
        }
        const finsOn = design.fins !== undefined && ti <= finLossT;
        const load = jointLoads(
          deadMass,
          table.accel[i]!,
          table.q[i]!,
          Math.abs(table.aoa[i]!) + 0.5 * DEG,
          4 + (finsOn ? 8 : 0),
          refArea,
          lever,
        );
        const margin = jointMargin(cap, load, r0); // cap/load − 1
        const prox = 1 / (1 + Math.max(margin, -0.999)); // = load/cap
        return { prox, value: load.axialForce + (2 * load.bendingMoment) / r0, limit: cap };
      },
      (v) => `${(v / 1e3).toFixed(1)} kN`,
    );
    if (row) rows.push(row);
  }

  // ————— flutter: airspeed vs the boundary at local pressure —————
  if (design.fins) {
    const fins = design.fins;
    const G = material(fins.material).modulus / 2.6;
    const row = buildRow(
      'flutter',
      'FLUTTER',
      t,
      (i) => {
        const ti = t[i]!;
        if (ti > apogeeT || ti > finLossT + 0.2 || ti > lovT + 0.2) {
          return { prox: NaN, value: 0, limit: Infinity };
        }
        const atmo = atmosphere(Math.max(0, table.altitude[i]!));
        const vf = flutterSpeed(fins, G, atmo.pressure, atmo.speedOfSound);
        if (!Number.isFinite(vf) || vf <= 0) return { prox: 0, value: table.airspeed[i]!, limit: vf };
        return { prox: table.airspeed[i]! / vf, value: table.airspeed[i]!, limit: vf };
      },
      (v) => `${v.toFixed(0)} m/s`,
    );
    if (row) rows.push(row);
  }

  // ————— static margin vs the 0.5 cal tumble floor (passive vehicles) —————
  if (passive && design.fins) {
    const d0 = design.stages[0]!.diameter;
    const totalLen = vm.upperLength + vm.stages.reduce((a, s) => a + s.length, 0);
    const comps = [noseCN(design.noseShape, vm.noseLength)];
    comps.push(finsCN(design.fins, d0, totalLen - design.fins.rootChord - 0.05));
    const cpX = totalCP(comps).xcp;
    const totalProp = vm.stages.reduce((a, s) => a + s.propellant, 0);
    const burnoutMass = vm.glow - totalProp;
    const FLOOR = 0.5; // cal — the sim's tumble threshold
    const row = buildRow(
      'stability',
      'STATIC MARGIN',
      t,
      (i) => {
        const ti = t[i]!;
        if (ti > apogeeT || ti > finLossT || ti > lovT + 0.2) {
          return { prox: NaN, value: 0, limit: FLOOR };
        }
        const frac = totalProp > 0 ? clamp01((table.mass[i]! - burnoutMass) / totalProp) : 0;
        const { cg } = vehicleCG(vm, design, frac);
        const margin = staticMarginCalibers(cpX, cg, d0);
        // Lower-bound limit: proximity = floor/margin (→1 at the floor, >1 past it).
        const prox = margin <= 0 ? 2 : FLOOR / margin;
        return { prox, value: margin, limit: FLOOR };
      },
      (v) => `${v.toFixed(2)} cal`,
    );
    if (row) rows.push(row);
  }

  // ————— T/W vs 1 during burns —————
  {
    const row = buildRow(
      'twr',
      'T/W',
      t,
      (i) => {
        const ti = t[i]!;
        if (ti > lovT + 0.2 || table.thrust[i]! <= 0) return { prox: NaN, value: 0, limit: 1 };
        // twr channel is thrust/(m·g0); gravity-relative limit is 1.
        const twr = table.thrust[i]! / (table.mass[i]! * G0);
        const prox = twr <= 0 ? 2 : 1 / twr;
        return { prox, value: twr, limit: 1 };
      },
      (v) => v.toFixed(2),
    );
    if (row) rows.push(row);
  }

  return rows;
}

/** Last mission-elapsed time at which ANY margin row is still applicable —
    the natural right edge of the margin-timeline plot (descent under chute
    would otherwise compress the story into the left 5%). */
export function marginDomainEnd(rows: MarginRow[], t: Float64Array): number {
  let last = 0;
  for (const row of rows) {
    for (let i = row.series.length - 1; i >= 0; i--) {
      if (!Number.isNaN(row.series[i]!)) {
        last = Math.max(last, t[i]!);
        break;
      }
    }
  }
  return last > 0 ? last : (t.length > 0 ? t[t.length - 1]! : 1);
}
