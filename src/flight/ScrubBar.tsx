/**
 * Timeline: MET readout, pause/play, full-width scrubber with event and
 * failure pips, drag-to-scrub, and the 1–100× multiplier control.
 */
import { useCallback, useMemo, useRef } from 'react';
import { useStore } from '../store.ts';
import { Seg } from '../components/controls.tsx';
import { MULTIPLIERS, type FlightScene, type Playback } from './playback.ts';
import { fmtMET } from './FlightCanvas.tsx';

export function ScrubBar({ playback, scene }: { playback: Playback; scene: FlightScene }) {
  const pb = useStore((s) => s.playback);
  const trackRef = useRef<HTMLDivElement>(null);
  const end = Math.max(1e-6, playback.endSec);
  const frac = Math.max(0, Math.min(1, pb.tSec / end));

  const pips = useMemo(
    () => [
      ...scene.result.events.map((e) => ({ t: e.t, failure: false, label: e.label })),
      ...scene.result.failures.map((f) => ({ t: f.t, failure: true, label: f.detail })),
    ],
    [scene],
  );

  const scrubFromPointer = useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const u = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
      playback.scrubTo(u * end);
    },
    [playback, end],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      scrubFromPointer(e.clientX);
    },
    [scrubFromPointer],
  );
  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.buttons & 1) scrubFromPointer(e.clientX);
    },
    [scrubFromPointer],
  );

  const multId = String(
    MULTIPLIERS.includes(pb.multiplier as (typeof MULTIPLIERS)[number]) ? pb.multiplier : 1,
  );

  return (
    <div className="fl-scrub">
      <button
        className="ms-btn ms-btn--icon fl-scrub__pp mono"
        title={pb.paused ? 'resume (space)' : 'pause (space)'}
        onClick={() => playback.setPaused(!pb.paused)}
      >
        {pb.paused ? '▶' : '❚❚'}
      </button>
      <span className="fl-scrub__met mono">{fmtMET(pb.tSec)}</span>
      <div
        className="fl-scrub__track"
        ref={trackRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
      >
        <div className="fl-scrub__rail" />
        <div className="fl-scrub__fill" style={{ width: `${frac * 100}%` }} />
        {pips.map((p, i) => (
          <div
            key={i}
            className={`fl-scrub__pip${p.failure ? ' fl-scrub__pip--failure' : ''}${
              p.t <= pb.tSec ? ' fl-scrub__pip--past' : ''
            }`}
            style={{ left: `${(p.t / end) * 100}%` }}
            title={`${fmtMET(p.t)} ${p.label}`}
          />
        ))}
        <div className="fl-scrub__thumb" style={{ left: `${frac * 100}%` }} />
      </div>
      <span className="fl-scrub__end mono">{fmtMET(end)}</span>
      <Seg
        options={MULTIPLIERS.map((m) => ({ id: String(m), label: `${m}×` }))}
        value={multId}
        onChange={(v) => playback.setMultiplier(Number(v))}
      />
    </div>
  );
}
