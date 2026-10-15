/**
 * Live trajectory thumbnail: altitude vs downrange from the worker preview,
 * plus the mission objective checklist evaluated against the same result.
 * Dims while a recompute is in flight (previewStale).
 */
import { useMemo } from 'react';
import type { DerivedPerformance, FlightResult, RocketDesign } from '../../physics/index.ts';
import type { Mission } from '../../campaign/types.ts';
import { fmtKm } from './fmt.ts';

const W = 264;
const H = 148;
const ML = 8;
const MR = 10;
const MT = 12;
const MB = 16;

export function TrajectoryPreview({
  preview,
  stale,
  mission,
  design,
  derived,
}: {
  preview: FlightResult | null;
  stale: boolean;
  mission: Mission;
  design: RocketDesign;
  derived: DerivedPerformance;
}) {
  const plot = useMemo(() => {
    if (!preview) return null;
    const { altitude, downrange } = preview.table;
    const n = altitude.length;
    if (n < 2) return null;
    let maxAlt = 0;
    let maxDr = 0;
    for (let i = 0; i < n; i++) {
      if (altitude[i]! > maxAlt) maxAlt = altitude[i]!;
      if (downrange[i]! > maxDr) maxDr = downrange[i]!;
    }
    // Vertical sounding flights have ~zero downrange — keep the spike readable.
    const xSpan = Math.max(maxDr, maxAlt * 0.7, 1);
    const targetVisible = mission.altitudeTarget <= maxAlt * 3.2;
    const ySpan = Math.max(targetVisible ? mission.altitudeTarget * 1.08 : 0, maxAlt * 1.06, 1);
    const px = (dr: number): number => ML + (dr / xSpan) * (W - ML - MR);
    const py = (alt: number): number => H - MB - (alt / ySpan) * (H - MT - MB);
    const step = Math.max(1, Math.floor(n / 320));
    const pts: string[] = [];
    for (let i = 0; i < n; i += step) pts.push(`${px(downrange[i]!).toFixed(1)},${py(altitude[i]!).toFixed(1)}`);
    pts.push(`${px(downrange[n - 1]!).toFixed(1)},${py(altitude[n - 1]!).toFixed(1)}`);
    const apogee = preview.events.find((e) => e.id === 'apogee');
    let apoPt: { x: number; y: number } | null = null;
    if (apogee) {
      // nearest sample to the apogee time
      const t = preview.table.t;
      let lo = 0;
      let best = Infinity;
      for (let i = 0; i < n; i += step) {
        const d = Math.abs(t[i]! - apogee.t);
        if (d < best) {
          best = d;
          lo = i;
        }
      }
      apoPt = { x: px(downrange[lo]!), y: py(altitude[lo]!) };
    }
    return {
      line: pts.join(' '),
      maxAlt,
      maxDr,
      targetY: targetVisible ? py(mission.altitudeTarget) : null,
      apoPt,
    };
  }, [preview, mission.altitudeTarget]);

  const objectives = useMemo(() => {
    if (!preview) return null;
    return mission.objectives.map((o) => ({ o, r: o.evaluate(preview, design, derived) }));
  }, [preview, mission, design, derived]);

  return (
    <div className={`tp${stale ? ' tp--stale' : ''}`}>
      <svg className="tp__plot" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        {/* frame + horizontal grid */}
        {[0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1={ML}
            x2={W - MR}
            y1={MT + (H - MT - MB) * f}
            y2={MT + (H - MT - MB) * f}
            stroke="var(--line-1)"
            strokeWidth="1"
          />
        ))}
        <rect x={ML} y={MT} width={W - ML - MR} height={H - MT - MB} fill="none" stroke="var(--line-2)" strokeWidth="1" />
        {plot?.targetY !== null && plot?.targetY !== undefined && (
          <g>
            <line x1={ML} x2={W - MR} y1={plot.targetY} y2={plot.targetY} stroke="var(--text-3)" strokeWidth="1" strokeDasharray="5 4" />
            <text x={W - MR - 2} y={plot.targetY - 3} textAnchor="end" fontSize="8" fill="var(--text-3)" className="mono">
              TARGET {fmtKm(mission.altitudeTarget)}
            </text>
          </g>
        )}
        {plot && (
          <>
            <polyline points={plot.line} fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinejoin="round" />
            {plot.apoPt && (
              <g>
                <circle cx={plot.apoPt.x} cy={plot.apoPt.y} r={2.5} fill="none" stroke="var(--text-1)" strokeWidth="1" />
                <text
                  x={Math.min(plot.apoPt.x + 5, W - 66)}
                  y={Math.max(plot.apoPt.y - 4, 10)}
                  fontSize="8"
                  fill="var(--text-2)"
                  className="mono"
                >
                  APO {fmtKm(plot.maxAlt)}
                </text>
              </g>
            )}
            <text x={W - MR} y={H - 4} textAnchor="end" fontSize="8" fill="var(--text-3)" className="mono">
              DR {fmtKm(plot.maxDr)}
            </text>
          </>
        )}
        {!plot && (
          <text x={W / 2} y={H / 2} textAnchor="middle" fontSize="9" fill="var(--text-3)" className="mono">
            SIMULATING…
          </text>
        )}
      </svg>

      <div className="tp__objectives">
        {mission.objectives.map((o, i) => {
          const r = objectives?.[i]?.r;
          const cls = r === undefined ? 'tp-obj--pending' : r.pass ? 'tp-obj--pass' : 'tp-obj--fail';
          return (
            <div key={o.id} className={`tp-obj ${cls}`}>
              <span className="tp-obj__dot" />
              <span className="tp-obj__label">{o.label}</span>
              <span className="tp-obj__actual mono">{r ? r.actual : '—'}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
