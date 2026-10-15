/** Drafting-style dimension line: extension lines with standoff, filled-arrow
    dimension line, mono label set in a gap. Lives in drawing meters; strokes
    use non-scaling-stroke so zoom keeps them hairline. */
import type { BpDimension } from './geometry.ts';
import { useBindingHover } from '../eq/bindings.ts';

export function DimensionLine({ dim, pxPerM }: { dim: BpDimension; pxPerM: number }) {
  const { highlighted, onMouseEnter, onMouseLeave } = useBindingHover(dim.bind);
  const stroke = highlighted ? 'var(--accent)' : 'var(--bp-dim, var(--text-3))';
  const standoff = 3 / pxPerM; // 3px gap from geometry, in meters
  const fontM = 10 / pxPerM;

  if (dim.orient === 'v') {
    const lx = dim.x1 + dim.offset;
    const midY = (dim.y1 + dim.y2) / 2;
    return (
      <g
        className="bp-dim"
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        style={{ color: stroke }}
      >
        {/* extension lines */}
        <line x1={dim.x1 + standoff} y1={dim.y1} x2={lx + standoff} y2={dim.y1} stroke={stroke} strokeWidth="var(--bp-stroke-fine)" vectorEffect="non-scaling-stroke" />
        <line x1={dim.x2 + standoff} y1={dim.y2} x2={lx + standoff} y2={dim.y2} stroke={stroke} strokeWidth="var(--bp-stroke-fine)" vectorEffect="non-scaling-stroke" />
        {/* dimension line, split around the label */}
        <line x1={lx} y1={dim.y1} x2={lx} y2={dim.y2} stroke={stroke} strokeWidth="var(--bp-stroke-fine)" vectorEffect="non-scaling-stroke" markerStart="url(#dim-arrow-s)" markerEnd="url(#dim-arrow-e)" />
        <text
          x={lx}
          y={midY}
          fill={stroke}
          fontSize={fontM}
          textAnchor="middle"
          transform={`rotate(-90 ${lx} ${midY})`}
          dy={-2 / pxPerM}
          className="bp-dim__label"
        >
          {dim.label}
        </text>
      </g>
    );
  }

  const ly = dim.y1 + dim.offset;
  const midX = (dim.x1 + dim.x2) / 2;
  return (
    <g className="bp-dim" onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      <line x1={dim.x1} y1={dim.y1 + standoff} x2={dim.x1} y2={ly} stroke={stroke} strokeWidth="var(--bp-stroke-fine)" vectorEffect="non-scaling-stroke" />
      <line x1={dim.x2} y1={dim.y2 + standoff} x2={dim.x2} y2={ly} stroke={stroke} strokeWidth="var(--bp-stroke-fine)" vectorEffect="non-scaling-stroke" />
      <line x1={dim.x1} y1={ly} x2={dim.x2} y2={ly} stroke={stroke} strokeWidth="var(--bp-stroke-fine)" vectorEffect="non-scaling-stroke" markerStart="url(#dim-arrow-s)" markerEnd="url(#dim-arrow-e)" />
      <text x={midX} y={ly} fill={stroke} fontSize={fontM} textAnchor="middle" dy={-3 / pxPerM} className="bp-dim__label">
        {dim.label}
      </text>
    </g>
  );
}
