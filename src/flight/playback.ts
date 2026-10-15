/**
 * Flight playback: ONE SimClock driven by ONE fixed-timestep loop. Canvas
 * layers read the clock directly every frame (60 fps, zero React); a throttled
 * ~10 Hz mirror pushes tSec into the zustand store for the React chrome
 * (scrub thumb, MET readout, event-log highlighting).
 *
 * Drama beats: at >10× the clock auto-drops to 1× three sim-seconds before the
 * next event, then restores the previous multiplier 1.5 s after it — so a
 * 100× replay still lets you watch every staging in real time.
 *
 * Also home of the FLIGHT SCENE: precomputed ground-frame geometry shared by
 * all canvas layers. The trajectory table is Earth-centered-inertial; the
 * range view renders in the launch-site co-rotating frame (pad fixed at
 * (0, R_EARTH), Earth circle fixed at the origin), so every ECI sample is
 * rotated by ω_eff·t once here, in double precision.
 */
import { useEffect, useMemo, useRef } from 'react';
import { SimClock } from '../sim/clock.ts';
import { createSimLoop } from '../sim/loop.ts';
import { useStore } from '../store.ts';
import { endTime, type FrameSample } from './sample.ts';
import { OMEGA_EARTH, computeVehicleMass } from '../physics/index.ts';
import type { FlightResult, RocketDesign } from '../physics/types.ts';
import { computeBlueprint, type BlueprintInputs } from '../blueprint/geometry.ts';

export const MULTIPLIERS = [1, 2, 5, 10, 25, 100] as const;

export interface Playback {
  /** The one clock. Sim time in ms (t=0 liftoff). Canvas layers read this. */
  clockRef: { readonly current: SimClock };
  /** Extra per-frame draw callbacks driven by the playback loop. */
  register(fn: (tSec: number, frameDtMs: number) => void): () => void;
  scrubTo(tSec: number): void;
  setMultiplier(m: number): void;
  setPaused(p: boolean): void;
  readonly endSec: number;
}

/** Auto-drop lead time before an event, sim-seconds. */
const DROP_LEAD = 3;
/** Restore the pre-drop multiplier this long after the event, sim-seconds. */
const DROP_TAIL = 1.5;

export function usePlayback(result: FlightResult | null): Playback {
  const clockRef = useRef<SimClock>(new SimClock(0));
  const fnsRef = useRef(new Set<(tSec: number, frameDtMs: number) => void>());
  const endRef = useRef(0);
  const eventsRef = useRef<number[]>([]);
  const dropRef = useRef<{ eventT: number; prevMult: number } | null>(null);

  endRef.current = result ? endTime(result.table) : 0;
  eventsRef.current = useMemo(
    () =>
      result
        ? [...result.events.map((e) => e.t), ...result.failures.map((f) => f.t)].sort((a, b) => a - b)
        : [],
    [result],
  );

  const apiRef = useRef<Playback | null>(null);
  if (apiRef.current === null) {
    const mirror = () => {
      const c = clockRef.current;
      useStore.getState().setPlayback({
        tSec: c.now() / 1000,
        multiplier: c.multiplier,
        paused: c.paused,
      });
    };
    apiRef.current = {
      clockRef,
      register(fn) {
        fnsRef.current.add(fn);
        return () => fnsRef.current.delete(fn);
      },
      scrubTo(tSec) {
        const t = Math.max(0, Math.min(tSec, endRef.current));
        dropRef.current = null;
        clockRef.current.scrubTo(t * 1000);
        mirror();
      },
      setMultiplier(m) {
        dropRef.current = null; // manual choice wins over drama beats
        clockRef.current.multiplier = m;
        mirror();
      },
      setPaused(p) {
        const c = clockRef.current;
        if (!p && c.now() / 1000 >= endRef.current - 1e-9) c.scrubTo(0); // play at end = replay
        c.paused = p;
        mirror();
      },
      get endSec() {
        return endRef.current;
      },
    };
  }

  useEffect(() => {
    if (!result) return;
    const clock = new SimClock(0);
    clockRef.current = clock;
    dropRef.current = null;

    // Dev/screenshot hook: daedalus:dev:playback = {"t0":32,"mult":5,"paused":true}
    try {
      const raw = localStorage.getItem('daedalus:dev:playback');
      if (raw) {
        const d = JSON.parse(raw) as { t0?: number; mult?: number; paused?: boolean };
        if (typeof d.t0 === 'number') clock.scrubTo(Math.max(0, d.t0) * 1000);
        if (typeof d.mult === 'number') clock.multiplier = d.mult;
        if (d.paused) clock.paused = true;
      }
    } catch {
      /* dev-only */
    }

    const mirror = () =>
      useStore.getState().setPlayback({
        tSec: clock.now() / 1000,
        multiplier: clock.multiplier,
        paused: clock.paused,
      });
    mirror();

    let mirrorAcc = 100; // mirror on the first frame
    const loop = createSimLoop({
      fixedDtMs: 10,
      update: (dt) => {
        clock.advance(dt);
        const t = clock.now() / 1000;

        // drama beats: slow down into events, speed back up after
        const drop = dropRef.current;
        if (drop && t > drop.eventT + DROP_TAIL) {
          clock.multiplier = drop.prevMult;
          dropRef.current = null;
          mirrorAcc = 100;
        } else if (!drop && clock.multiplier > 10) {
          const evs = eventsRef.current;
          let next = -1;
          for (let i = 0; i < evs.length; i++) {
            if (evs[i]! > t) {
              next = evs[i]!;
              break;
            }
          }
          if (next >= 0 && next - t <= DROP_LEAD) {
            dropRef.current = { eventT: next, prevMult: clock.multiplier };
            clock.multiplier = 1;
            mirrorAcc = 100;
          }
        }

        // auto-pause at the end of the table
        if (t >= endRef.current && !clock.paused) {
          clock.scrubTo(endRef.current * 1000);
          clock.paused = true;
          mirrorAcc = 100;
        }
      },
      render: (_alpha, frameDt) => {
        mirrorAcc += frameDt;
        if (mirrorAcc >= 100) {
          mirrorAcc = 0;
          mirror();
        }
        const t = clock.now() / 1000;
        for (const fn of fnsRef.current) fn(t, frameDt);
      },
    });
    loop.start();
    return () => loop.dispose();
  }, [result]);

  return apiRef.current;
}

// ————————————————————————————————————————————————————————————————————————
// Flight scene: shared precomputed geometry for the canvas layers.
// ————————————————————————————————————————————————————————————————————————

export interface SilhouetteConfig {
  /** Closed outline of the attached stack, drawing meters (y=0 nose, +y aft). */
  path: Path2D | null;
  length: number;
  radius: number;
}

export interface StageExit {
  /** Nozzle exit radius, m. */
  radius: number;
  /** Exit-plane pressure, Pa (plume under/over-expansion). */
  pe: number;
}

export interface FlightScene {
  design: RocketDesign;
  result: FlightResult;
  /** Effective co-rotation rate ω_E·cos(lat), rad/s. */
  omega: number;
  endSec: number;
  /** Ground-frame (co-rotating) trajectory, parallel to result.table. */
  gx: Float64Array;
  gy: Float64Array;
  /** Separation event times → silhouette config index = separations elapsed. */
  sepTimes: number[];
  /** Successful chute deploy time, s (null if none or shredded). */
  chuteTime: number | null;
  configs: SilhouetteConfig[];
  stageExits: StageExit[];
  /** Full-stack length, m (gantry sizing). */
  stackLength: number;
}

export interface FramePose {
  /** Ground-frame position, m. */
  x: number;
  y: number;
  /** Local up (radial) unit vector. */
  upx: number;
  upy: number;
  /** Body axis unit vector (nose direction) from commanded pitch. */
  axx: number;
  axy: number;
}

/** Ground-frame pose of an interpolated frame (ECI → co-rotating + attitude). */
export function framePose(scene: FlightScene, f: FrameSample): FramePose {
  const th = scene.omega * f.t;
  const c = Math.cos(th);
  const s = Math.sin(th);
  const x = f.x * c - f.y * s;
  const y = f.x * s + f.y * c;
  const r = Math.hypot(x, y) || 1;
  const upx = x / r;
  const upy = y / r;
  const tx = upy; // eastward (downrange) surface tangent
  const ty = -upx;
  const cp = Math.cos(f.pitch);
  const sp = Math.sin(f.pitch);
  return { x, y, upx, upy, axx: tx * cp + upx * sp, axy: ty * cp + upy * sp };
}

/** Silhouette config index at time t: how many separations have happened. */
export function configIndexAt(scene: FlightScene, t: number): number {
  let n = 0;
  for (const st of scene.sepTimes) if (st <= t) n++;
  return Math.min(n, scene.configs.length - 1);
}

function buildConfig(design: RocketDesign, k: number): SilhouetteConfig {
  try {
    const sub: RocketDesign =
      k === 0 ? design : { ...design, stages: design.stages.slice(k), fins: undefined };
    const vm = computeVehicleMass(sub);
    const inputs: BlueprintInputs = {
      design: sub,
      stages: vm.stages.map((bd, i) => ({
        tank: bd.tank,
        engine: bd.engine
          ? {
              throatDiameter: bd.engine.throatDiameter,
              exitDiameter: bd.engine.exitDiameter,
              nozzleLength: bd.engine.nozzleLength,
              count:
                sub.stages[i]!.propulsion.kind === 'liquid'
                  ? (sub.stages[i]!.propulsion as { engine: { count: number } }).engine.count
                  : 1,
            }
          : undefined,
        solid: bd.solid
          ? {
              motorLength: bd.solid.motorLength,
              exitDiameter: bd.solid.exitDiameter,
              nozzleLength: bd.solid.nozzleLength,
            }
          : undefined,
      })),
    };
    const geo = computeBlueprint(inputs);
    return {
      path: typeof Path2D !== 'undefined' ? new Path2D(geo.silhouette) : null,
      length: geo.totalLength,
      radius: geo.maxRadius + (sub.fins?.span ?? 0),
    };
  } catch {
    return { path: null, length: 10, radius: 0.5 };
  }
}

export function buildScene(design: RocketDesign, result: FlightResult): FlightScene {
  const omega = OMEGA_EARTH * Math.cos(design.launch.latitude);
  const table = result.table;
  const n = table.t.length;
  const gx = new Float64Array(n);
  const gy = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const th = omega * table.t[i]!;
    const c = Math.cos(th);
    const s = Math.sin(th);
    gx[i] = table.x[i]! * c - table.y[i]! * s;
    gy[i] = table.x[i]! * s + table.y[i]! * c;
  }

  const sepTimes = result.events.filter((e) => e.id === 'separation').map((e) => e.t);
  const deploy = result.events.find((e) => e.id === 'chute-deploy');
  const shredded = result.failures.some((f) => f.id === 'chute-shred');
  const chuteTime = deploy && !shredded ? deploy.t : null;
  const nConfigs = Math.min(sepTimes.length, design.stages.length - 1) + 1;
  const configs: SilhouetteConfig[] = [];
  for (let k = 0; k < nConfigs; k++) configs.push(buildConfig(design, k));

  const vm = computeVehicleMass(design);
  const stageExits: StageExit[] = design.stages.map((s, i) => {
    const bd = vm.stages[i]!;
    if (bd.engine) return { radius: bd.engine.exitDiameter / 2, pe: bd.engine.exitPressure };
    // Solids: exit pressure ≈ pc/(ε-dependent expansion); 65 kPa is a fair
    // stand-in for ε 6–10 APCP at 6 MPa — mildly underexpanded at altitude.
    return { radius: (bd.solid?.exitDiameter ?? s.diameter * 0.5) / 2, pe: 6.5e4 };
  });

  return {
    design,
    result,
    omega,
    endSec: endTime(table),
    gx,
    gy,
    sepTimes,
    chuteTime,
    configs,
    stageExits,
    stackLength: configs[0]?.length ?? 10,
  };
}
