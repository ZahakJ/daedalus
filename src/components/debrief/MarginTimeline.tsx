/**
 * Margin timeline: one horizontal band per margin, colored by proximity to
 * the limit (ok → warn → danger gradient computed from the series), with the
 * closest-approach instant ticked and annotated. Time domain is clipped to
 * where margins still apply — a 10-minute chute descent would otherwise
 * compress the whole story into the left edge.
 */
import type { TrajectoryTable } from '../../physics/types.ts';
import { marginDomainEnd, type MarginRow } from '../../debrief/margins.ts';

/* status token RGB values (tokens.css --ok/--warn/--danger) — gradients need
   concrete stops; semantics stay identical to the CSS custom properties. */
const OK: [number, number, number] = [88, 213, 160];
const WARN: [number, number, number] = [242, 193, 78];
const DANGER: [number, number, number] = [255, 107, 107];

function mix(a: [number, number, number], b: [number, number, number], u: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
}

function proxColor(p: number): string {
  let rgb: [number, number, number];
  if (p < 0.45) rgb = OK;
  else if (p < 0.75) rgb = mix(OK, WARN, (p - 0.45) / 0.3);
  else rgb = mix(WARN, DANGER, Math.min(1, (p - 0.75) / 0.25));
  const alpha = 0.14 + 0.68 * p;
  return `rgba(${rgb[0].toFixed(0)},${rgb[1].toFixed(0)},${rgb[2].toFixed(0)},${alpha.toFixed(3)})`;
}

const BUCKETS = 140;

/** Sample the series at each bucket center (linear interpolation between
    table samples, extending across a valid→NaN edge by one sample) and emit
    a crisp two-stop-per-bucket linear-gradient. NaN buckets stay transparent. */
function bandGradient(row: MarginRow, t: Float64Array, tEnd: number): string {
  const n = t.length;
  const pooled = new Float64Array(BUCKETS).fill(NaN);
  let j = 0;
  for (let b = 0; b < BUCKETS; b++) {
    const tc = ((b + 0.5) / BUCKETS) * tEnd;
    while (j < n - 1 && t[j + 1]! <= tc) j++;
    if (t[j]! > tc) continue; // before the first sample (backfilled below)
    const s0 = row.series[j]!;
    if (j >= n - 1) {
      pooled[b] = s0; // at/after the last sample (domain is clipped anyway)
      continue;
    }
    const s1 = row.series[j + 1]!;
    if (Number.isNaN(s0) && Number.isNaN(s1)) continue;
    if (Number.isNaN(s1)) {
      pooled[b] = s0; // trailing edge of a valid stretch
    } else if (Number.isNaN(s0)) {
      pooled[b] = s1; // leading edge
    } else {
      const u = (tc - t[j]!) / Math.max(1e-9, t[j + 1]! - t[j]!);
      pooled[b] = s0 + (s1 - s0) * u;
    }
  }
  // backfill the pre-first-sample sliver so bands start at T+0
  let first = -1;
  for (let b = 0; b < BUCKETS; b++) {
    if (!Number.isNaN(pooled[b]!)) {
      first = b;
      break;
    }
  }
  if (first > 0 && first < BUCKETS * 0.5) {
    for (let b = 0; b < first; b++) pooled[b] = pooled[first]!;
  }
  const stops: string[] = [];
  for (let b = 0; b < BUCKETS; b++) {
    const p0 = ((b / BUCKETS) * 100).toFixed(2);
    const p1 = (((b + 1) / BUCKETS) * 100).toFixed(2);
    const c = Number.isNaN(pooled[b]!) ? 'transparent' : proxColor(pooled[b]!);
    stops.push(`${c} ${p0}% ${p1}%`);
  }
  return `linear-gradient(90deg, ${stops.join(', ')})`;
}

function niceStep(range: number, target: number): number {
  const raw = range / Math.max(1, target);
  const mag = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1e-9))));
  for (const m of [1, 2, 5, 10]) if (raw <= m * mag) return m * mag;
  return 10 * mag;
}

export function MarginTimeline({ rows, table }: { rows: MarginRow[]; table: TrajectoryTable }) {
  if (rows.length === 0) {
    return <div className="db-margins__empty mono">NO MARGIN CHANNELS FOR THIS VEHICLE</div>;
  }
  const tEnd = marginDomainEnd(rows, table.t) * 1.04;
  const step = niceStep(tEnd, 8);
  const ticks: number[] = [];
  for (let v = 0; v <= tEnd; v += step) ticks.push(v);

  return (
    <div className="db-margins">
      {rows.map((row) => (
        <div key={row.id} className="db-margins__row">
          <div className="db-margins__label mono">{row.label}</div>
          <div className="db-margins__bandwrap">
            <div className="db-margins__band" style={{ backgroundImage: bandGradient(row, table.t, tEnd) }}>
              <span
                className={`db-margins__worst db-margins__worst--${row.status}`}
                style={{ left: `${Math.min(99.4, (row.worst.t / tEnd) * 100).toFixed(2)}%` }}
              />
            </div>
            <div className="db-margins__note mono">
              <span className={`db-margins__callout db-margins__callout--${row.status}`}>{row.callout}</span>
              <span className="db-margins__detail">
                {row.format(row.worst.value)} vs limit {row.format(row.worst.limit)}
              </span>
            </div>
          </div>
        </div>
      ))}
      {/* shared time ruler */}
      <div className="db-margins__row db-margins__row--ruler">
        <div className="db-margins__label mono">MET</div>
        <div className="db-margins__ruler mono">
          {ticks.map((v) => (
            <span key={v} className="db-margins__tick" style={{ left: `${((v / tEnd) * 100).toFixed(2)}%` }}>
              <span className="db-margins__tickmark" />
              T+{step < 1 ? v.toFixed(1) : v.toFixed(0)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
