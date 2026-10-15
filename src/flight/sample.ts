/** Playback is sampling, not simulation: interpolate the precomputed table. */
import type { TrajectoryTable } from '../physics/types.ts';

export interface FrameSample {
  t: number;
  x: number;
  y: number;
  altitude: number;
  downrange: number;
  speed: number;
  airspeed: number;
  mach: number;
  q: number;
  aoa: number;
  flightPathAngle: number;
  pitch: number;
  thrust: number;
  drag: number;
  mass: number;
  twr: number;
  accel: number;
  throttle: number;
  stage: number;
}

/** Binary search for the last index with t[i] <= t. */
export function indexAt(table: TrajectoryTable, t: number): number {
  const ts = table.t;
  const n = ts.length;
  if (n === 0) return 0;
  if (t <= ts[0]!) return 0;
  if (t >= ts[n - 1]!) return n - 1;
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (ts[mid]! <= t) lo = mid;
    else hi = mid;
  }
  return lo;
}

const lerp = (a: number, b: number, u: number): number => a + (b - a) * u;

/** Shortest-path angular interpolation (pitch can wrap at staging events). */
function alerp(a: number, b: number, u: number): number {
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return a + d * u;
}

export function sampleAt(table: TrajectoryTable, t: number): FrameSample {
  const n = table.t.length;
  const i = indexAt(table, t);
  const j = Math.min(i + 1, n - 1);
  const t0 = table.t[i]!;
  const t1 = table.t[j]!;
  const u = t1 > t0 ? Math.max(0, Math.min(1, (t - t0) / (t1 - t0))) : 0;
  return {
    t: Math.max(table.t[0] ?? 0, Math.min(t, table.t[n - 1] ?? 0)),
    x: lerp(table.x[i]!, table.x[j]!, u),
    y: lerp(table.y[i]!, table.y[j]!, u),
    altitude: lerp(table.altitude[i]!, table.altitude[j]!, u),
    downrange: lerp(table.downrange[i]!, table.downrange[j]!, u),
    speed: lerp(table.speed[i]!, table.speed[j]!, u),
    airspeed: lerp(table.airspeed[i]!, table.airspeed[j]!, u),
    mach: lerp(table.mach[i]!, table.mach[j]!, u),
    q: lerp(table.q[i]!, table.q[j]!, u),
    aoa: alerp(table.aoa[i]!, table.aoa[j]!, u),
    flightPathAngle: alerp(table.flightPathAngle[i]!, table.flightPathAngle[j]!, u),
    pitch: alerp(table.pitch[i]!, table.pitch[j]!, u),
    thrust: lerp(table.thrust[i]!, table.thrust[j]!, u),
    drag: lerp(table.drag[i]!, table.drag[j]!, u),
    mass: lerp(table.mass[i]!, table.mass[j]!, u),
    twr: lerp(table.twr[i]!, table.twr[j]!, u),
    accel: lerp(table.accel[i]!, table.accel[j]!, u),
    throttle: lerp(table.throttle[i]!, table.throttle[j]!, u),
    stage: table.stage[i]!, // discrete — no interpolation
  };
}

export function endTime(table: TrajectoryTable): number {
  return table.t.length > 0 ? table.t[table.t.length - 1]! : 0;
}
