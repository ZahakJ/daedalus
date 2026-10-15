/**
 * The cutaway drawing. Declarative React-SVG over computeBlueprint() geometry.
 * ViewBox is in real meters; all strokes are non-scaling so the drawing stays
 * crisp at any zoom. Accent appears ONLY on the hovered/selected part and its
 * bound dimension; failing-margin parts carry a --danger stroke overlay.
 */
import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { useStore } from '../store.ts';
import { BlueprintDefs } from './defs.tsx';
import { DimensionLine } from './DimensionLine.tsx';
import type { BlueprintGeometry, BpPart } from './geometry.ts';

/**
 * The mirrored fin pair is drawn as two parts ('fin-r' / 'fin-l') but it is ONE
 * design decision, and the cards + leaders all bind to 'fin-r'. Without this
 * alias, hovering the left fin selects an id nothing owns: no card lights up
 * and every leader dims for nothing.
 */
const canonPart = (id: string | null): string | null => (id === 'fin-l' ? 'fin-r' : id);

function Part({
  part,
  selected,
  failing,
  onSelect,
}: {
  part: BpPart;
  selected: boolean;
  failing: boolean;
  onSelect: (id: string | null) => void;
}) {
  return (
    <g
      className="bp-part"
      data-part={part.id}
      onMouseEnter={() => onSelect(part.id)}
      onMouseLeave={() => onSelect(null)}
    >
      {/* hatch fill (cut material) */}
      {part.hatch !== '' && <path d={part.outline} fill={`url(#${part.hatch})`} stroke="none" />}
      {/* liquid fill */}
      {part.liquid && (
        <clipPath id={`clip-${part.id}`}>
          <path d={part.outline} />
        </clipPath>
      )}
      {part.liquid && (
        <rect
          x={-part.liquid.halfWidth}
          y={part.liquid.surfaceY}
          width={part.liquid.halfWidth * 2}
          height={Math.max(0, part.liquid.bottomY - part.liquid.surfaceY)}
          clipPath={`url(#clip-${part.id})`}
          fill={part.liquid.kind === 'ox' ? 'rgba(140, 180, 255, 0.10)' : 'rgba(255, 200, 140, 0.08)'}
        />
      )}
      {part.liquid && (
        <line
          x1={-part.liquid.halfWidth}
          x2={part.liquid.halfWidth}
          y1={part.liquid.surfaceY}
          y2={part.liquid.surfaceY}
          clipPath={`url(#clip-${part.id})`}
          stroke="var(--bp-edge)"
          strokeWidth="var(--bp-stroke-fine)"
          vectorEffect="non-scaling-stroke"
          strokeDasharray="6 3"
        />
      )}
      {/* outline */}
      <path
        d={part.outline}
        fill="transparent"
        stroke={selected ? 'var(--accent)' : failing ? 'var(--danger)' : 'var(--text-1)'}
        strokeWidth={selected ? 'var(--bp-stroke-outline)' : failing ? 'var(--bp-stroke-outline)' : 'var(--bp-stroke-edge)'}
        vectorEffect="non-scaling-stroke"
        filter={selected ? 'url(#bp-glow)' : undefined}
      />
    </g>
  );
}

export function Blueprint({
  geometry,
  failingParts = new Set(),
  title,
  extra,
}: {
  geometry: BlueprintGeometry;
  /** Part ids whose structural margin is negative. */
  failingParts?: Set<string>;
  /** Title-block fields. */
  title: { vehicle: string; mission: string; rev: string; gross: string };
  /** Overlay layer (plumbing, ghosts) rendered in drawing coords. */
  extra?: ReactNode;
}) {
  const selectedPartId = useStore((s) => s.ui.selectedPartId);
  const setUi = useStore((s) => s.setUi);

  const { totalLength, maxRadius, halfWidth } = geometry;
  // Everything drawn, fins included, fits inside halfWidth.
  const finSpan = Math.max(halfWidth, maxRadius * 2.2);
  const pad = Math.max(0.6, totalLength * 0.08);
  const viewMinX = -finSpan - pad;
  const viewW = 2 * (finSpan + pad);
  const viewMinY = -pad * 0.6;
  const viewH = totalLength + pad * 1.4;
  // Nominal px-per-meter for text sizing (SVG scales with its container).
  const pxPerM = 640 / viewH;

  const selected = useMemo(() => selectedPartId, [selectedPartId]);

  // Leader labels anchor at their part's y, so two nearby parts stack their text
  // on top of each other. Sweep each side independently and push overlapping
  // labels down by one line height; the leader line doglegs to the moved label.
  const leaderLayout = useMemo(() => {
    const minGap = 12 / pxPerM; // one label line-height in model units
    const place = (side: typeof geometry.leaders) => {
      const sorted = [...side].sort((a, b) => a.y - b.y);
      let prev = -Infinity;
      return sorted.map((l) => {
        const labelY = Math.max(l.y, prev + minGap);
        prev = labelY;
        return { l, labelY };
      });
    };
    return [
      ...place(geometry.leaders.filter((l) => l.x >= 0)),
      ...place(geometry.leaders.filter((l) => l.x < 0)),
    ];
  }, [geometry.leaders, pxPerM]);

  return (
    <svg
      className="bp"
      viewBox={`${viewMinX} ${viewMinY} ${viewW} ${viewH}`}
      preserveAspectRatio="xMidYMid meet"
    >
      <BlueprintDefs />

      {/* drafting grid, subtle, fixed to drawing space */}
      <g className="bp-grid">
        {gridLines(viewMinX, viewMinY, viewW, viewH, viewH / 40).map((l, i) => (
          <line key={i} {...l} stroke={i % 5 === 0 ? 'var(--bp-grid-major)' : 'var(--bp-grid-minor)'} strokeWidth="1" vectorEffect="non-scaling-stroke" />
        ))}
      </g>

      {/* centerline: dash-dot, the datum of the whole drawing */}
      <line
        x1={0}
        y1={-pad * 0.4}
        x2={0}
        y2={totalLength + pad * 0.5}
        stroke="var(--text-3)"
        strokeWidth="var(--bp-stroke-fine)"
        strokeDasharray="var(--bp-center-dash)"
        vectorEffect="non-scaling-stroke"
        opacity={0.7}
      />

      {/* parts */}
      {geometry.parts.map((p) => (
        <Part
          key={p.id}
          part={p}
          selected={selected !== null && selected === canonPart(p.id)}
          failing={failingParts.has(p.id)}
          onSelect={(id) => setUi({ selectedPartId: canonPart(id) })}
        />
      ))}

      {/* CG / CP markers */}
      {geometry.markers.map((m) => (
        <g key={m.id} className="bp-marker">
          {m.id === 'cg' ? (
            <g>
              <circle cx={0} cy={m.y} r={8 / pxPerM} fill="none" stroke="var(--text-1)" strokeWidth="var(--bp-stroke-edge)" vectorEffect="non-scaling-stroke" />
              <path
                d={`M 0 ${m.y - 8 / pxPerM} A ${8 / pxPerM} ${8 / pxPerM} 0 0 1 ${8 / pxPerM} ${m.y} L 0 ${m.y} Z M 0 ${m.y + 8 / pxPerM} A ${8 / pxPerM} ${8 / pxPerM} 0 0 1 ${-8 / pxPerM} ${m.y} L 0 ${m.y} Z`}
                fill="var(--text-2)"
              />
              <text x={12 / pxPerM} y={m.y} fontSize={9 / pxPerM} fill="var(--text-2)" className="bp-dim__label" dominantBaseline="middle">CG</text>
            </g>
          ) : (
            <g>
              <path
                d={`M 0 ${m.y - 9 / pxPerM} L ${8 / pxPerM} ${m.y + 5 / pxPerM} L ${-8 / pxPerM} ${m.y + 5 / pxPerM} Z`}
                fill="none"
                stroke="var(--text-2)"
                strokeWidth="var(--bp-stroke-edge)"
                vectorEffect="non-scaling-stroke"
              />
              <text x={12 / pxPerM} y={m.y} fontSize={9 / pxPerM} fill="var(--text-2)" className="bp-dim__label" dominantBaseline="middle">CP</text>
            </g>
          )}
        </g>
      ))}

      {/* dimensions */}
      {geometry.dims.map((d) => (
        <DimensionLine key={d.id} dim={d} pxPerM={pxPerM} />
      ))}

      {/* leader callouts — label y is de-collided per side, then doglegged back
          to the true anchor point so the drawing never stacks two labels. */}
      {leaderLayout.map(({ l, labelY }) => {
        const side = l.x >= 0 ? 1 : -1;
        // Anchor OUTSIDE the fin envelope: maxRadius is the body, but fins reach
        // finSpan, so a body-relative label lands on top of the fin outline.
        const labelX = side * (finSpan + pad * 0.1);
        const elbowX = side * Math.max(Math.abs(l.x), finSpan * 0.6);
        return (
          <g key={`${l.partId}-${l.label}`} className="bp-leader" opacity={selected === null || selected === l.partId ? 1 : 0.25}>
            <circle cx={l.x} cy={l.y} r={2.2 / pxPerM} fill="var(--text-3)" />
            <path
              d={`M ${l.x} ${l.y} L ${elbowX} ${l.y} L ${labelX * 0.96} ${labelY}`}
              fill="none"
              stroke="var(--text-3)"
              strokeWidth="var(--bp-stroke-fine)"
              vectorEffect="non-scaling-stroke"
            />
            <text
              x={labelX}
              y={labelY}
              fontSize={8.5 / pxPerM}
              fill={selected === l.partId ? 'var(--accent)' : 'var(--text-3)'}
              textAnchor={l.x >= 0 ? 'start' : 'end'}
              dominantBaseline="middle"
              className="bp-dim__label"
            >
              {l.label}
            </text>
          </g>
        );
      })}

      {extra}

      {/* title block, bottom-right, drawing convention */}
      <g className="bp-title" transform={`translate(${viewMinX + viewW - 0.02} ${viewMinY + viewH - 0.02})`}>
        <TitleBlock title={title} pxPerM={pxPerM} />
      </g>
    </svg>
  );
}

function TitleBlock({
  title,
  pxPerM,
}: {
  title: { vehicle: string; mission: string; rev: string; gross: string };
  pxPerM: number;
}) {
  const w = 150 / pxPerM;
  const rowH = 13 / pxPerM;
  const rows = [
    ['VEHICLE', title.vehicle],
    ['MISSION', title.mission],
    ['REV', title.rev],
    ['GROSS', title.gross],
  ];
  return (
    <g transform={`translate(${-w} ${-rowH * rows.length})`}>
      <rect x={0} y={0} width={w} height={rowH * rows.length} fill="var(--panel)" stroke="var(--line-2)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      {rows.map(([k, v], i) => (
        <g key={k}>
          {i > 0 && <line x1={0} x2={w} y1={rowH * i} y2={rowH * i} stroke="var(--line-1)" strokeWidth="1" vectorEffect="non-scaling-stroke" />}
          <text x={4 / pxPerM} y={rowH * i + rowH * 0.68} fontSize={7.5 / pxPerM} fill="var(--text-3)" className="bp-dim__label">
            {k}
          </text>
          <text x={w - 4 / pxPerM} y={rowH * i + rowH * 0.68} fontSize={8 / pxPerM} fill="var(--text-2)" textAnchor="end" className="bp-dim__label">
            {v}
          </text>
        </g>
      ))}
    </g>
  );
}

function gridLines(minX: number, minY: number, w: number, h: number, pitch: number) {
  const lines: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
  const x0 = Math.ceil(minX / pitch) * pitch;
  for (let x = x0; x <= minX + w; x += pitch) lines.push({ x1: x, y1: minY, x2: x, y2: minY + h });
  const y0 = Math.ceil(minY / pitch) * pitch;
  for (let y = y0; y <= minY + h; y += pitch) lines.push({ x1: minX, y1: y, x2: minX + w, y2: y });
  return lines;
}
