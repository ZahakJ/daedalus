/**
 * The report itself, typeset like a government document: masthead, meta grid,
 * ruled numbered sections, an outcome stamp, findings that deep-link back to
 * the indicted decision card, and the revision ladder as Appendix A.
 */
import type { FlightRecord } from '../../schema.ts';
import type { DebriefReport, Finding } from '../../debrief/report.ts';

// The chart legend and margin callouts on the same screen print "T+19.1", so
// the timeline must too — column alignment comes from tabular-nums, not from
// padding real numbers with fake leading zeros.
function fmtT(t: number): string {
  return `T+${t.toFixed(1)}`;
}

const SEVERITY_TEXT: Record<string, string> = {
  warning: 'WARNING',
  degraded: 'DEGRADED',
  'loss-of-vehicle': 'LOSS OF VEHICLE',
};

export function ReportDoc({
  report,
  revisions,
  currentRev,
  onOpenCard,
  onLesson,
}: {
  report: DebriefReport;
  revisions: FlightRecord[];
  currentRev: string;
  onOpenCard: (f: { partId: string | null }) => void;
  onLesson: (lessonId: string) => void;
}) {
  return (
    <article className="db-doc mono">
      {/* ————— masthead ————— */}
      <header className="db-doc__masthead">
        <div className="db-doc__agencyrow">
          <span className="db-doc__agency">DAEDALUS PROGRAM · OFFICE OF FLIGHT SAFETY</span>
          <span className="db-doc__docid">{report.docId}</span>
        </div>
        <div className="db-doc__titlerow">
          <h1 className="db-doc__title">{report.docTitle}</h1>
          <span className={`db-doc__stamp db-doc__stamp--${report.stamp.tone}`}>{report.stamp.text}</span>
        </div>
      </header>

      {/* ————— meta grid ————— */}
      <dl className="db-doc__meta">
        {report.meta.map((m) => (
          <div key={m.label} className="db-doc__meta-cell">
            <dt>{m.label}</dt>
            <dd>{m.value}</dd>
          </div>
        ))}
      </dl>

      {/* ————— 1. synopsis ————— */}
      <section className="db-doc__section">
        <h2>1 · SYNOPSIS</h2>
        <p className="db-doc__prose">{report.synopsis}</p>
      </section>

      {/* ————— 2. timeline ————— */}
      <section className="db-doc__section">
        <h2>2 · TIMELINE OF FLIGHT</h2>
        <div className="db-doc__timeline">
          {report.timeline.map((e, i) => (
            <div key={i} className={`db-doc__tl db-doc__tl--${e.kind}`}>
              <span className="db-doc__tl-t">{fmtT(e.t)}</span>
              <span className="db-doc__tl-label">{e.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ————— 3. findings / performance ————— */}
      <section className="db-doc__section">
        <h2>3 · {report.findings.length > 0 ? 'FINDINGS' : 'PERFORMANCE'}</h2>
        {report.findings.map((f) => (
          <FindingBlock key={f.n} f={f} onOpenCard={onOpenCard} onLesson={onLesson} />
        ))}
        {report.records.length > 0 && (
          <div className="db-doc__records">
            {report.findings.length > 0 && <div className="db-doc__records-head">PERFORMANCE RECORDS</div>}
            {report.records.map((r) => (
              <div key={r.label} className="db-doc__record">
                <span className="db-doc__record-label">{r.label}</span>
                <span className="db-doc__record-dots" aria-hidden="true" />
                <span className="db-doc__record-value">{r.value}</span>
              </div>
            ))}
          </div>
        )}
        {report.closestMargin && (
          <div className={`db-doc__closest db-doc__closest--${report.closestMargin.status}`}>
            MARGIN CLOSEST TO LIMIT — {report.closestMargin.label}: {report.closestMargin.callout}
          </div>
        )}
      </section>

      {/* ————— 4. probable cause ————— */}
      <section className="db-doc__section">
        <h2>4 · PROBABLE CAUSE</h2>
        <p className={`db-doc__cause${report.outcome === 'failure' ? ' db-doc__cause--lov' : ''}`}>
          {report.probableCause}
        </p>
      </section>

      {/* ————— 5. recommendations ————— */}
      <section className="db-doc__section">
        <h2>5 · RECOMMENDATIONS</h2>
        {report.recommendations.length === 0 && (
          <p className="db-doc__prose db-doc__prose--dim">No corrective action required.</p>
        )}
        {report.recommendations.map((r) => (
          <div key={r.n} className="db-doc__rec">
            <span className="db-doc__rec-n">R-{r.n}</span>
            <div className="db-doc__rec-body">
              <div className="db-doc__rec-text">{r.text}</div>
              <div className="db-doc__rec-actions">
                <button className="db-doc__btn" onClick={() => onOpenCard(r)}>
                  OPEN {r.card} → BUREAU
                </button>
                <button className="db-doc__chip" onClick={() => onLesson(r.lessonId)}>
                  read §{r.lessonId}
                </button>
              </div>
            </div>
          </div>
        ))}
      </section>

      {/* ————— 6. objectives ————— */}
      <section className="db-doc__section">
        <h2>6 · MISSION OBJECTIVES</h2>
        <div className="db-doc__objectives">
          {report.objectives.map((o) => (
            <div key={o.id} className="db-doc__obj">
              <span className={`db-doc__obj-dot db-doc__obj-dot--${o.pass ? 'ok' : 'danger'}`} />
              <span className="db-doc__obj-label">{o.label}</span>
              <span className="db-doc__obj-actual">{o.actual}</span>
              <span className="db-doc__obj-target">{o.target}</span>
              <span className={`db-doc__obj-verdict db-doc__obj-verdict--${o.pass ? 'ok' : 'danger'}`}>
                {o.pass ? 'PASS' : 'FAIL'}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* ————— appendix A: revision ladder ————— */}
      <section className="db-doc__section">
        <h2>APPENDIX A · REVISION HISTORY</h2>
        <div className="db-doc__revs">
          {revisions.map((r) => (
            <div key={r.rev} className={`db-doc__rev${r.rev === currentRev ? ' db-doc__rev--current' : ''}`}>
              <span className="db-doc__rev-id">REV {r.rev}</span>
              <span className={`db-doc__rev-chip db-doc__rev-chip--${r.outcome === 'failure' ? 'loss' : 'flew'}`}>
                {r.outcome === 'failure' ? '✕ LOSS' : '● FLEW'}
              </span>
              <span className="db-doc__rev-apogee">apogee {(r.apogee / 1e3).toFixed(1)} km</span>
              <span className="db-doc__rev-diff" title={r.diff}>
                {r.diff}
              </span>
              {r.rev === currentRev && <span className="db-doc__rev-here">← THIS FLIGHT</span>}
            </div>
          ))}
        </div>
      </section>

      <footer className="db-doc__end">— END OF REPORT · {report.docId} —</footer>
    </article>
  );
}

function FindingBlock({
  f,
  onOpenCard,
  onLesson,
}: {
  f: Finding;
  onOpenCard: (f: { partId: string | null }) => void;
  onLesson: (lessonId: string) => void;
}) {
  return (
    <div className={`db-doc__finding db-doc__finding--${f.severity}`}>
      <div className="db-doc__finding-head">
        <span className="db-doc__finding-n">FINDING {f.n}</span>
        <span className="db-doc__finding-title">{f.title}</span>
        <span className="db-doc__finding-t">
          {fmtT(f.t)} · {SEVERITY_TEXT[f.severity]}
        </span>
      </div>
      <p className="db-doc__finding-cause">{f.cause}</p>
      <div className="db-doc__finding-foot">
        <span className="db-doc__finding-fix">CORRECTIVE — {f.fixHint}</span>
        <button className="db-doc__btn" onClick={() => onOpenCard(f)}>
          OPEN {f.card}
        </button>
        <button className="db-doc__chip" onClick={() => onLesson(f.lessonId)}>
          §{f.lessonId}
        </button>
      </div>
    </div>
  );
}
