/** Shared SVG defs: material hatch patterns, arrowheads, glow filter.
    All hatching in --bp-hatch; hatch = cut material, per drafting convention. */
export function BlueprintDefs() {
  return (
    <defs>
      {/* metal: 45° single hatch */}
      <pattern id="hatch-metal" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <line x1="0" y1="0" x2="0" y2="6" stroke="var(--bp-hatch)" strokeWidth="1" />
      </pattern>
      {/* composite: cross hatch */}
      <pattern id="hatch-composite" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <line x1="0" y1="0" x2="0" y2="7" stroke="var(--bp-hatch)" strokeWidth="0.8" />
        <line x1="0" y1="0" x2="7" y2="0" stroke="var(--bp-hatch)" strokeWidth="0.8" />
      </pattern>
      {/* solid grain: dense diagonal */}
      <pattern id="hatch-grain" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
        <line x1="0" y1="0" x2="0" y2="4" stroke="var(--bp-hatch)" strokeWidth="1.2" />
      </pattern>
      {/* soft goods: wavy */}
      <pattern id="hatch-soft" width="8" height="4" patternUnits="userSpaceOnUse">
        <path d="M 0 2 Q 2 0 4 2 T 8 2" fill="none" stroke="var(--bp-hatch)" strokeWidth="0.8" />
      </pattern>
      {/* liquid: sparse horizontal ticks (drafting convention) */}
      <pattern id="hatch-liquid" width="10" height="5" patternUnits="userSpaceOnUse">
        <line x1="0" y1="2.5" x2="6" y2="2.5" stroke="var(--bp-hatch)" strokeWidth="0.8" />
      </pattern>
      {/* dimension arrowheads */}
      <marker id="dim-arrow-s" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M 0 0.8 L 8 4 L 0 7.2 Z" fill="var(--text-3)" />
      </marker>
      <marker id="dim-arrow-e" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
        <path d="M 0 0.8 L 8 4 L 0 7.2 Z" fill="var(--text-3)" />
      </marker>
      <filter id="bp-glow" x="-40%" y="-40%" width="180%" height="180%">
        <feGaussianBlur stdDeviation="2.5" result="b" />
        <feMerge>
          <feMergeNode in="b" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
  );
}
