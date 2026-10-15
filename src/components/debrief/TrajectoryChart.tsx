/**
 * Annotated trajectory: altitude vs ground range in the blueprint drawing
 * grammar — fine grid, dimension-style ticks, circled-letter event markers,
 * failure points as ✕ with a danger label. Pure SVG from the trajectory table.
 *
 * x is GROUND range (inertial arc minus the pad's own co-rotation arc) — the
 * summary's `downrange` is the inertial arc, which for a 10-minute chute
 * descent is dominated by Earth rotation and would flatten the plot.
 */
import type { FailureEvent, FlightEvent, TrajectoryTable } from '../../physics/types.ts';
import { FAILURES, OMEGA_EARTH, R_EARTH } from '../../physics/index.ts';
import { indexAt } from '../../flight/sample.ts';
import { fmtSIUnit } from '../bureau/fmt.ts';

const W = 760;
const H = 430;
const M = { l: 58, r: 20, t: 18, b: 40 };

export interface ChartMarker {
  letter: string;
  t: number;
  label: string;
}

/** Pleasant tick step: 1/2/5 × 10^k covering range/target divisions. */
function niceStep(range: number, target: number): number {
  const raw = range / Math.max(1, target);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const m of [1, 2, 5, 10]) {
    if (raw <= m * mag) return m * mag;
  }
  return 10 * mag;
}

function groundRange(table: TrajectoryTable, i: number, omegaEff: number): number {
  const theta = Math.atan2(table.x[i]!, table.y[i]!);
  return (theta - omegaEff * table.t[i]!) * R_EARTH;
}

export function buildTrajectory(
  table: TrajectoryTable,
  events: FlightEvent[],
  failures: FailureEvent[],
  latitude: number,
): {
  gridV: number[];
  gridH: number[];
  ticksX: Array<{ px: number; label: string }>;
  ticksY: Array<{ py: number; label: string }>;
  paths: Array<{ d: string; kind: 'powered' | 'coast' | 'chute' }>;
  markers: Array<ChartMarker & { px: number; py: number }>;
  fails: Array<{ px: number; py: number; title: string; t: number }>;
  toPx: (t: number) => { px: number; py: number };
} {
  const omegaEff = OMEGA_EARTH * Math.cos(latitude);
  const n = table.t.length;
  const gr = new Float64Array(n);
  let xMin = 0;
  let xMax = 0;
  let yMax = 0;
  for (let i = 0; i < n; i++) {
    gr[i] = groundRange(table, i, omegaEff);
    if (gr[i]! < xMin) xMin = gr[i]!;
    if (gr[i]! > xMax) xMax = gr[i]!;
    if (table.altitude[i]! > yMax) yMax = table.altitude[i]!;
  }
  // pad the domain; keep the pad (0,0) in frame
  const spanX = Math.max(xMax - xMin, 10);
  xMin -= spanX * 0.06;
  xMax += spanX * 0.06;
  yMax = Math.max(yMax * 1.12, 10);
  // near-vertical flights: enforce a minimum ground-range span so the plot
  // still reads as a drawing, not a hairline
  const minSpan = Math.max(yMax * 0.35, 60);
  if (xMax - xMin < minSpan) {
    const c = (xMax + xMin) / 2;
    xMin = c - minSpan / 2;
    xMax = c + minSpan / 2;
  }

  const sx = (v: number): number => M.l + ((v - xMin) / (xMax - xMin)) * (W - M.l - M.r);
  const sy = (v: number): number => H - M.b - (v / yMax) * (H - M.t - M.b);

  // ————— grid + ticks —————
  const stepX = niceStep(xMax - xMin, 7);
  const stepY = niceStep(yMax, 6);
  const gridV: number[] = [];
  const ticksX: Array<{ px: number; label: string }> = [];
  for (let v = Math.ceil(xMin / stepX) * stepX; v <= xMax; v += stepX) {
    gridV.push(sx(v));
    // the origin tick is labeled by the PAD glyph instead
    if (Math.abs(v) > stepX / 2) ticksX.push({ px: sx(v), label: fmtSIUnit(v, 'm', 3) });
  }
  const gridH: number[] = [];
  const ticksY: Array<{ py: number; label: string }> = [];
  for (let v = 0; v <= yMax; v += stepY) {
    gridH.push(sy(v));
    // leave the top-left corner to the ALT caption
    if (sy(v) > M.t + 14) ticksY.push({ py: sy(v), label: v === 0 ? '0' : fmtSIUnit(v, 'm', 3) });
  }

  // ————— path segments by flight regime —————
  const chuteT = events.find((e) => e.id === 'chute-deploy')?.t ?? Infinity;
  const paths: Array<{ d: string; kind: 'powered' | 'coast' | 'chute' }> = [];
  let cur = '';
  let curKind: 'powered' | 'coast' | 'chute' | null = null;
  for (let i = 0; i < n; i++) {
    const kind: 'powered' | 'coast' | 'chute' =
      table.thrust[i]! > 0 ? 'powered' : table.t[i]! >= chuteT ? 'chute' : 'coast';
    const px = sx(gr[i]!);
    const py = sy(table.altitude[i]!);
    if (kind !== curKind) {
      if (cur) paths.push({ d: cur, kind: curKind! });
      cur = `M ${px.toFixed(1)} ${py.toFixed(1)}`;
      curKind = kind;
    } else {
      cur += ` L ${px.toFixed(1)} ${py.toFixed(1)}`;
    }
  }
  if (cur && curKind) paths.push({ d: cur, kind: curKind });

  const toPx = (t: number): { px: number; py: number } => {
    const i = indexAt(table, t);
    return { px: sx(gr[i]!), py: sy(table.altitude[i]!) };
  };

  // ————— event markers (circled letters, decluttered) —————
  const markers: Array<ChartMarker & { px: number; py: number }> = [];
  let letter = 65;
  for (const e of events) {
    if (e.id === 'liftoff') continue;
    const { px, py } = toPx(e.t);
    const crowded = markers.some((m) => Math.hypot(m.px - px, m.py - py) < 17);
    if (crowded) continue;
    markers.push({ letter: String.fromCharCode(letter++), t: e.t, label: e.label, px, py });
    if (letter > 90) break;
  }

  const fails = failures
    .filter((f, i, arr) => arr.findIndex((g) => g.id === f.id) === i)
    .map((f) => {
      const { px, py } = toPx(f.t);
      return { px, py, title: FAILURES[f.id].title, t: f.t };
    });

  return { gridV, gridH, ticksX, ticksY, paths, markers, fails, toPx };
}

export function TrajectoryChart({
  table,
  events,
  failures,
  latitude,
}: {
  table: TrajectoryTable;
  events: FlightEvent[];
  failures: FailureEvent[];
  latitude: number;
}) {
  const g = buildTrajectory(table, events, failures, latitude);
  const groundY = H - M.b;

  return (
    <div className="db-chart">
      <svg viewBox={`0 0 ${W} ${H}`} className="db-chart__svg" role="img" aria-label="flight path">
        {/* grid */}
        {g.gridV.map((px, i) => (
          <line key={`v${i}`} x1={px} y1={M.t} x2={px} y2={groundY} className="db-chart__grid" />
        ))}
        {g.gridH.map((py, i) => (
          <line key={`h${i}`} x1={M.l} y1={py} x2={W - M.r} y2={py} className="db-chart__grid" />
        ))}
        {/* frame + ground */}
        <line x1={M.l} y1={M.t} x2={M.l} y2={groundY} className="db-chart__axis" />
        <line x1={M.l} y1={groundY} x2={W - M.r} y2={groundY} className="db-chart__axis db-chart__ground" />
        {/* dimension-style ticks */}
        {g.ticksX.map((tk, i) => (
          <g key={`tx${i}`}>
            <line x1={tk.px} y1={groundY} x2={tk.px} y2={groundY + 5} className="db-chart__axis" />
            <text x={tk.px} y={groundY + 17} className="db-chart__ticklabel" textAnchor="middle">
              {tk.label}
            </text>
          </g>
        ))}
        {g.ticksY.map((tk, i) => (
          <g key={`ty${i}`}>
            <line x1={M.l - 5} y1={tk.py} x2={M.l} y2={tk.py} className="db-chart__axis" />
            <text x={M.l - 9} y={tk.py + 3} className="db-chart__ticklabel" textAnchor="end">
              {tk.label}
            </text>
          </g>
        ))}
        {/* axis captions */}
        <text x={W - M.r} y={groundY + 30} className="db-chart__caption" textAnchor="end">
          GROUND RANGE →
        </text>
        <text x={M.l - 44} y={M.t + 4} className="db-chart__caption">
          ALT
        </text>
        {/* trajectory */}
        {g.paths.map((p, i) => (
          <path key={i} d={p.d} className={`db-chart__path db-chart__path--${p.kind}`} />
        ))}
        {/* pad marker */}
        <g className="db-chart__pad">
          <line x1={g.toPx(0).px - 5} y1={groundY} x2={g.toPx(0).px + 5} y2={groundY} />
          <line x1={g.toPx(0).px} y1={groundY} x2={g.toPx(0).px} y2={groundY - 6} />
          <text x={g.toPx(0).px} y={groundY + 17} textAnchor="middle" className="db-chart__ticklabel">
            PAD
          </text>
        </g>
        {/* event markers */}
        {g.markers.map((m) => (
          <g key={m.letter} className="db-chart__marker">
            <circle cx={m.px} cy={m.py} r={8} />
            <text x={m.px} y={m.py + 3}>
              {m.letter}
            </text>
          </g>
        ))}
        {/* failure ✕ */}
        {g.fails.map((f, i) => (
          <g key={i} className="db-chart__fail">
            <line x1={f.px - 5} y1={f.py - 5} x2={f.px + 5} y2={f.py + 5} />
            <line x1={f.px - 5} y1={f.py + 5} x2={f.px + 5} y2={f.py - 5} />
            <text
              x={Math.min(f.px + 11, W - M.r - 4)}
              y={Math.max(f.py - 8 - i * 13, M.t + 8)}
              textAnchor={f.px > W - 210 ? 'end' : 'start'}
            >
              {`✕ ${f.title} T+${f.t.toFixed(1)}`}
            </text>
          </g>
        ))}
      </svg>
      {/* legend: letter → event */}
      <div className="db-chart__legend mono">
        {g.markers.map((m) => (
          <span key={m.letter} className="db-chart__legend-item">
            <span className="db-chart__legend-letter">{m.letter}</span>
            <span className="db-chart__legend-t">T+{m.t.toFixed(1)}</span>
            <span className="db-chart__legend-label">{m.label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
