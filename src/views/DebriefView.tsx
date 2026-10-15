/**
 * Post-flight debrief: annotated trajectory + margin timeline on the left,
 * the mishap-investigation / flight report on the right. The FlightResult is
 * re-derived from the committed record — same design, same weather seed,
 * bit-identical to what flew.
 */
import { useMemo } from 'react';
import { Hud } from '../components/Hud.tsx';
import { TrajectoryChart } from '../components/debrief/TrajectoryChart.tsx';
import { MarginTimeline } from '../components/debrief/MarginTimeline.tsx';
import { ReportDoc } from '../components/debrief/ReportDoc.tsx';
import { navigate } from '../router.ts';
import { useStore } from '../store.ts';
import { missionById } from '../campaign/catalog.ts';
import type { Mission } from '../campaign/types.ts';
import { computeDerived, simulateFlight } from '../physics/index.ts';
import { computeMarginTimeline } from '../debrief/margins.ts';
import { buildEpitaph, generateReport } from '../debrief/report.ts';
import type { CompletionRecord, FlightRecord, MissionId } from '../schema.ts';
import { ShareButton } from '../components/ShareButton.tsx';
import type { SharedContext } from './SharedView.tsx';

type Shared = SharedContext & { record: FlightRecord };

export function DebriefView({ missionId, shared }: { missionId: string; shared?: Shared }) {
  const mission = missionById(missionId);
  const localRecord = useStore((s) => s.committed[missionId as MissionId]);
  const record = shared?.record ?? localRecord;
  if (!mission || !record) {
    // App's route guard bounces this case; render nothing during the redirect.
    return null;
  }
  return <DebriefBody mission={mission} record={record} {...(shared ? { shared } : {})} />;
}

function DebriefBody({ mission, record, shared }: { mission: Mission; record: FlightRecord; shared?: Shared }) {
  const missionId = mission.id;
  const localRevisions = useStore((s) => s.revisions[missionId]);
  const revisions = shared ? [record] : (localRevisions ?? []);
  const localComplete = useStore((s) => s.campaign.completions[missionId] !== undefined);
  const alreadyComplete = shared ? false : localComplete;
  const go = (view: 'bureau' | 'flight'): void => {
    if (shared) {
      navigate({ view: 'shared', missionId, kind: view === 'bureau' ? 'design' : 'flight', payload: shared.payload });
    } else navigate({ view, missionId });
  };
  const setUi = useStore((s) => s.setUi);
  const completeMission = useStore((s) => s.completeMission);

  // Deterministic re-derivation of the committed flight (~5–20 ms, sync).
  const result = useMemo(
    () => simulateFlight(record.design, { weatherSeed: record.seed }),
    [record],
  );
  const derived = useMemo(() => computeDerived(record.design), [record]);
  const margins = useMemo(() => computeMarginTimeline(result, record.design), [result, record]);
  const report = useMemo(
    () => generateReport(mission, record, result, derived, margins),
    [mission, record, result, derived, margins],
  );

  const openCard = (f: { partId: string | null }): void => {
    setUi({ selectedPartId: f.partId });
    go('bureau');
  };
  const openLesson = (lessonId: string): void => {
    navigate({ view: 'handbook', conceptId: lessonId });
  };

  const accept = (): void => {
    const completion: CompletionRecord = {
      at: new Date().toISOString(),
      flights: revisions.length,
      bestApogee: revisions.reduce((a, r) => Math.max(a, r.apogee), record.apogee),
      vehicle: record.design,
      vehicleName: record.design.name,
      epitaph: buildEpitaph(revisions),
    };
    completeMission(missionId, completion);
    navigate({ view: 'campaign' });
  };

  const canAccept = report.outcome === 'success' && report.objectivesMet;

  return (
    <Hud
      sub={`post-flight · ${mission.title.toLowerCase()}`}
      bar={
        <>
        <span className="db-topmeta mono">
          {report.docId} · REV {record.rev}
          {record.at ? ` · ${record.at.slice(0, 10)}` : ''}
        </span>
        {shared ? (
          shared.bar
        ) : (
          <ShareButton missionId={missionId} design={record.design} rev={record.rev} kind="report" label="share report" />
        )}
        </>
      }
    >
      <div className="db">
        <div className="db__cols">
          {/* ————— left: trajectory + margins ————— */}
          <div className="db__left">
            <section className="db-panel">
              <header className="db-panel__head">
                <span>FLIGHT PATH</span>
                <span className="db-panel__hint">ALTITUDE vs GROUND RANGE · FIG. 1</span>
              </header>
              <TrajectoryChart
                table={result.table}
                events={result.events}
                failures={result.failures}
                latitude={record.design.launch.latitude}
              />
            </section>
            <section className="db-panel">
              <header className="db-panel__head">
                <span>MARGIN TIMELINE</span>
                <span className="db-panel__hint">PROXIMITY TO LIMIT · FIG. 2</span>
              </header>
              <MarginTimeline rows={margins} table={result.table} />
            </section>
          </div>

          {/* ————— right: the document ————— */}
          <div className="db__right">
            <ReportDoc
              report={report}
              revisions={revisions}
              currentRev={record.rev}
              onOpenCard={openCard}
              onLesson={openLesson}
            />
          </div>
        </div>

        {/* ————— footer actions ————— */}
        <footer className="db-actions">
          <button className="ms-btn" onClick={() => go('bureau')}>
            {shared ? 'OPEN DESIGN' : 'RETURN TO BUREAU'}
          </button>
          <button className="ms-btn ms-btn--ghost" onClick={() => go('flight')}>
            REPLAY FLIGHT
          </button>
          <span className="db-actions__spacer" />
          {alreadyComplete && (
            <button className="ms-btn" onClick={() => navigate({ view: 'campaign' })}>
              RETURN TO CAMPAIGN
            </button>
          )}
          {canAccept && !alreadyComplete && !shared && (
            <button className="ms-btn ms-btn--primary" onClick={accept}>
              ACCEPT &amp; CONTINUE
            </button>
          )}
          {!canAccept && !alreadyComplete && !shared && (
            <span className="db-actions__hint mono">
              {report.outcome === 'failure'
                ? 'VEHICLE LOST — REVISE AND REFLY'
                : 'OBJECTIVES NOT MET — REVISE AND REFLY'}
            </span>
          )}
        </footer>
      </div>
    </Hud>
  );
}
