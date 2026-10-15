/**
 * Right-rail telemetry: six ring-buffer strip charts (ALT / VEL / Q with the
 * 35 kPa structural envelope hairline / TWR / PITCH cmd / PROP remaining),
 * window = 45 s × multiplier, event ticks on top. Buffers self-heal: scrubs
 * and multiplier changes refill, steady playback pushes decimated samples.
 */
import { useMemo, useRef } from 'react';
import { useCanvas } from './useCanvas.ts';
import { createBuffer, drawStrip, pushSample, refillBuffer, type StripChannel } from './stripchart.ts';
import { sampleAt, type FrameSample } from './sample.ts';
import type { FlightScene, Playback } from './playback.ts';
import type { DerivedPerformance } from '../physics/types.ts';
import { formatSI } from '../sim/format.ts';

const TRACE = '#c4d1e2';
const WINDOW_BASE = 45;

interface ChartSpec {
  ch: StripChannel;
  get: (f: FrameSample) => number;
  fmt: (v: number) => string;
}

function chartSpecs(derived: DerivedPerformance): ChartSpec[] {
  return [
    {
      ch: { label: 'ALT', unit: 'm', color: TRACE },
      get: (f) => f.altitude,
      fmt: (v) => formatSI(v, 3),
    },
    {
      ch: { label: 'VEL AIR', unit: 'm/s', color: TRACE },
      get: (f) => f.airspeed,
      fmt: (v) => v.toFixed(0),
    },
    {
      // limit line: the 35 kPa design envelope structuralMargins sizes against
      ch: { label: 'Q', unit: 'kPa', color: TRACE, limit: 35 },
      get: (f) => f.q / 1e3,
      fmt: (v) => v.toFixed(1),
    },
    {
      ch: { label: 'TWR', unit: 'F/mg', color: TRACE },
      get: (f) => f.twr,
      fmt: (v) => v.toFixed(2),
    },
    {
      ch: { label: 'PITCH CMD', unit: 'deg', color: TRACE, fixedMax: 96 },
      get: (f) => (f.pitch * 180) / Math.PI,
      fmt: (v) => v.toFixed(1),
    },
    {
      ch: { label: 'PROP STAGE', unit: '%', color: TRACE, fixedMax: 105 },
      get: (f) => {
        const s = Math.floor(f.stage);
        if (s < 0) return 0;
        const st = derived.stages[s];
        if (!st) return 0;
        const frac = (f.mass - st.burnoutMass) / Math.max(1e-9, st.ignitionMass - st.burnoutMass);
        return Math.max(0, Math.min(1, frac)) * 100;
      },
      fmt: (v) => v.toFixed(0),
    },
  ];
}

function StripChart({
  spec,
  playback,
  scene,
}: {
  spec: ChartSpec;
  playback: Playback;
  scene: FlightScene;
}) {
  const bufRef = useRef(createBuffer(600));
  const stateRef = useRef({ lastT: -1, lastWin: -1, lastPush: -1e9 });
  const ref = useCanvas((ctx, w, h) => {
    const clock = playback.clockRef.current;
    const t = clock.now() / 1000;
    const win = WINDOW_BASE * clock.multiplier;
    const buf = bufRef.current;
    const st = stateRef.current;
    const fn = (tt: number): number => spec.get(sampleAt(scene.result.table, Math.max(0, tt)));
    if (t < st.lastT - 1e-6 || win !== st.lastWin || t - st.lastPush > win * 0.25) {
      refillBuffer(buf, t - win, t, fn);
      st.lastPush = t;
    } else if (t - st.lastPush >= win / 580) {
      pushSample(buf, t, fn(t));
      st.lastPush = t;
    }
    st.lastT = t;
    st.lastWin = win;
    drawStrip(ctx, w, h, buf, spec.ch, t, win, spec.fmt, scene.result.events);
  });
  return <canvas ref={ref} className="fl-strip" />;
}

export function TelemetryStrip({
  playback,
  scene,
  derived,
}: {
  playback: Playback;
  scene: FlightScene;
  derived: DerivedPerformance;
}) {
  const specs = useMemo(() => chartSpecs(derived), [derived]);
  return (
    <div className="fl-rail">
      <div className="fl-rail__head mono">
        TELEMETRY <span className="fl-rail__win">win 45 s × spd</span>
      </div>
      {specs.map((spec) => (
        <StripChart key={spec.ch.label} spec={spec} playback={playback} scene={scene} />
      ))}
    </div>
  );
}
