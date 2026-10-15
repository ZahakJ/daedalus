/**
 * Decision card, same anatomy everywhere:
 * identity strip → one control → live equation → margin line with status dot
 * (the same dot reappears on the FRR) → tradeoff bar → the why.
 */
import type { ReactNode } from 'react';
import { navigate } from '../router.ts';
import { useStore } from '../store.ts';
import { EqBoard } from '../eq/EqBoard.tsx';
import type { EqSpec, EqValues } from '../eq/types.ts';

export type MarginStatus = 'ok' | 'warn' | 'danger';

export interface TradeoffSide {
  label: string;
  value: string;
}

export interface DecisionCardProps {
  /** Mono card id, e.g. "DC-07". */
  code: string;
  title: string;
  /** Blueprint part this card drives (hover ⇄ highlight). */
  partId?: string;
  /** Handbook concept id. */
  lessonId: string;
  control: ReactNode;
  equation?: { spec: EqSpec; values: EqValues };
  margin?: { label: string; text: string; status: MarginStatus };
  tradeoff?: { left: TradeoffSide; right: TradeoffSide; position: number };
  why: string;
  /** Mastered decision — render as a one-line inherited row until expanded. */
  inherited?: { summary: string; expanded: boolean; onToggle: () => void };
}

export function DecisionCard(p: DecisionCardProps) {
  const selected = useStore((s) => s.ui.selectedPartId !== null && s.ui.selectedPartId === p.partId);
  const setUi = useStore((s) => s.setUi);

  const head = (
    <div
      className="dc__head"
      onMouseEnter={() => p.partId && setUi({ selectedPartId: p.partId })}
      onMouseLeave={() => p.partId && setUi({ selectedPartId: null })}
      onClick={p.inherited ? p.inherited.onToggle : undefined}
    >
      <span className="dc__code">{p.code}</span>
      <span className="dc__title">{p.title}</span>
      {p.inherited && !p.inherited.expanded && (
        <span className="dc__inherited-summary">
          {p.inherited.summary}
          {p.margin && <span className={`dc__dot dc__dot--${p.margin.status}`} />}
        </span>
      )}
      <span
        className="dc__lesson"
        onClick={(e) => {
          e.stopPropagation();
          navigate({ view: 'handbook', conceptId: p.lessonId });
        }}
        title="open handbook"
      >
        §{p.lessonId}
      </span>
    </div>
  );

  if (p.inherited && !p.inherited.expanded) {
    return <div className={`dc dc--inherited${selected ? ' dc--active' : ''}`}>{head}</div>;
  }

  return (
    <div className={`dc${selected ? ' dc--active' : ''}`} data-card={p.code}>
      {head}
      <div className="dc__body">
        {p.control}
        {p.equation && <EqBoard spec={p.equation.spec} values={p.equation.values} />}
        {p.margin && (
          <div className="dc__margin">
            <span className="dc__margin-label">{p.margin.label}</span>
            <span>{p.margin.text}</span>
            <span className={`dc__dot dc__dot--${p.margin.status}`} />
          </div>
        )}
        {p.tradeoff && (
          <div className="dc__trade">
            <span className="dc__trade-side">
              <span className="dc__trade-label">{p.tradeoff.left.label}</span>
              <span className="dc__trade-value">{p.tradeoff.left.value}</span>
            </span>
            <span className="dc__trade-bar">
              <span
                className="dc__trade-thumb"
                style={{ left: `${Math.max(0, Math.min(100, p.tradeoff.position * 100))}%` }}
              />
            </span>
            <span className="dc__trade-side dc__trade-side--right">
              <span className="dc__trade-label">{p.tradeoff.right.label}</span>
              <span className="dc__trade-value">{p.tradeoff.right.value}</span>
            </span>
          </div>
        )}
        <details className="dc__why">
          <summary>why this matters</summary>
          {p.why}
        </details>
      </div>
    </div>
  );
}
