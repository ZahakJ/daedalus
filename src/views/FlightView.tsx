/**
 * Launch day. Re-derives the SAME FlightResult the FRR committed (identical
 * design + weather seed → bit-identical trajectory), then plays it back:
 * full-bleed range canvas, strip-chart rail, event ticker, scrub bar.
 */
import { useEffect, useMemo, useState } from 'react';
import { Hud } from '../components/Hud.tsx';
import { navigate } from '../router.ts';
import { useStore } from '../store.ts';
import { missionById } from '../campaign/catalog.ts';
import type { MissionId } from '../schema.ts';
import { computeDerived, simulateFlight } from '../physics/index.ts';
import { buildScene, usePlayback } from '../flight/playback.ts';
import { FlightCanvas } from '../flight/FlightCanvas.tsx';
import { TelemetryStrip } from '../flight/TelemetryStrip.tsx';
import { EventLog } from '../flight/EventLog.tsx';
import { ScrubBar } from '../flight/ScrubBar.tsx';
import { fmtSIUnit } from '../components/bureau/fmt.ts';
import { ShareButton } from '../components/ShareButton.tsx';
import type { FlightRecord } from '../schema.ts';
import type { SharedContext } from './SharedView.tsx';

export function FlightView({
  missionId,
  shared,
}: {
  missionId: string;
  /** A flight opened from a share link instead of the local committed record. */
  shared?: SharedContext & { record: FlightRecord };
}) {
  const mission = missionById(missionId);
  const localRecord = useStore((s) => s.committed[missionId as MissionId]);
  const record = shared?.record ?? localRecord;
  const pb = useStore((s) => s.playback);
  const [replayed, setReplayed] = useState(false);

  // Deterministic re-derivation of the committed flight (contract: same seed).
  const result = useMemo(
    () => (record ? simulateFlight(record.design, { weatherSeed: record.seed }) : null),
    [record],
  );
  const scene = useMemo(
    () => (record && result ? buildScene(record.design, result) : null),
    [record, result],
  );
  const derived = useMemo(() => (record ? computeDerived(record.design) : null), [record]);
  const playback = usePlayback(result);
  const toDebrief = (): void =>
    shared
      ? navigate({ view: 'shared', missionId, kind: 'report', payload: shared.payload })
      : navigate({ view: 'debrief', missionId });

  // guard: no committed flight → nothing to watch
  useEffect(() => {
    if (!record || !mission) navigate({ view: 'campaign' }, true);
  }, [record, mission]);

  // space = pause/resume, ←/→ = ±5 s scrub
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === ' ') {
        e.preventDefault();
        playback.setPaused(!playback.clockRef.current.paused);
      } else if (e.key === 'ArrowLeft') {
        playback.scrubTo(playback.clockRef.current.now() / 1000 - 5);
      } else if (e.key === 'ArrowRight') {
        playback.scrubTo(playback.clockRef.current.now() / 1000 + 5);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [playback]);

  if (!mission || !record || !result || !scene || !derived) return null;

  const ended = pb.paused && pb.tSec >= playback.endSec - 1e-6 && playback.endSec > 0;
  const failed = result.summary.outcome === 'failure';

  return (
    <Hud
      sub={`range · ${mission.title.toLowerCase()}`}
      bar={
        <>
          <span className="fl-bar__id mono">
            {record.design.name} · REV {record.rev} · WX {record.seed}
          </span>
          {shared ? (
            shared.bar
          ) : (
            <ShareButton
              missionId={missionId as MissionId}
              design={record.design}
              rev={record.rev}
              kind="flight"
              label="share flight"
            />
          )}
          <button className="ms-btn ms-btn--ghost" onClick={toDebrief}>
            DEBRIEF →
          </button>
        </>
      }
    >
      <div className="fl-root">
        <div className="fl-main">
          <div className="fl-stage">
            <FlightCanvas playback={playback} scene={scene} />
            {ended && !replayed && (
              <div className="fl-endcard">
                <div
                  className={`fl-endcard__outcome mono ${failed ? 'fl-endcard__outcome--failure' : 'fl-endcard__outcome--success'}`}
                >
                  {failed ? '■ FLIGHT TERMINATED' : '● FLIGHT COMPLETE'}
                </div>
                <div className="fl-endcard__stats mono">
                  APOGEE {fmtSIUnit(result.summary.apogee, 'm')} · MAX-Q{' '}
                  {(result.summary.maxQ.value / 1e3).toFixed(1)} kPa ·{' '}
                  {result.summary.flightTime.toFixed(0)} s
                  {result.failures.length > 0 && (
                    <span className="fl-endcard__fail">
                      {` · ${result.failures.length} ${result.failures.length === 1 ? 'anomaly' : 'anomalies'}`}
                    </span>
                  )}
                </div>
                <div className="fl-endcard__actions">
                  <button
                    className="ms-btn ms-btn--primary"
                    onClick={toDebrief}
                  >
                    PROCEED TO DEBRIEF
                  </button>
                  <button
                    className="ms-btn ms-btn--ghost"
                    onClick={() => {
                      setReplayed(true);
                      playback.scrubTo(0);
                      playback.setPaused(false);
                      setTimeout(() => setReplayed(false), 500);
                    }}
                  >
                    REPLAY
                  </button>
                </div>
              </div>
            )}
          </div>
          <TelemetryStrip playback={playback} scene={scene} derived={derived} />
        </div>
        <EventLog scene={scene} />
        <ScrubBar playback={playback} scene={scene} />
      </div>
    </Hud>
  );
}
