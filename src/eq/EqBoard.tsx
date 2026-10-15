/**
 * Hand-built live-equation renderer. No KaTeX: there is a
 * closed set of authored equations, and every variable is a first-class DOM
 * node with a live value beneath it, a binding id for cross-highlighting, and
 * a role tint (accent = the variable this card's control drives).
 */
import { useEffect, useRef } from 'react';
import type { EqNode, EqSpec, EqValues } from './types.ts';
import { useBindingHover } from './bindings.ts';

function Sym({ text, bind, values }: { text: string; bind?: string; values: EqValues }) {
  const { highlighted, onMouseEnter, onMouseLeave } = useBindingHover(bind);
  const v = bind !== undefined ? values[bind] : undefined;
  const ref = useRef<HTMLSpanElement>(null);
  const last = useRef<string | undefined>(undefined);

  // Pulse the value cell when its text changes.
  useEffect(() => {
    if (v === undefined || ref.current === null) return;
    if (last.current !== undefined && last.current !== v.text) {
      ref.current.classList.remove('eq-pulse');
      void ref.current.offsetWidth; // restart the animation
      ref.current.classList.add('eq-pulse');
    }
    last.current = v.text;
  }, [v?.text, v]);

  const cls = [
    'eq-sym',
    v ? `eq-role-${v.role}` : '',
    highlighted ? 'eq-hl' : '',
    bind !== undefined ? 'eq-bound' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span className={cls} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      <span className="eq-sym__glyph">{text}</span>
      {v !== undefined && (
        <span className="eq-sym__value mono" ref={ref}>
          {v.text}
        </span>
      )}
    </span>
  );
}

function Nodes({ nodes, values }: { nodes: EqNode[]; values: EqValues }) {
  return (
    <>
      {nodes.map((n, i) => (
        <Node key={i} node={n} values={values} />
      ))}
    </>
  );
}

function Node({ node, values }: { node: EqNode; values: EqValues }) {
  switch (node.kind) {
    case 'sym':
      return <Sym text={node.text} bind={node.bind} values={values} />;
    case 'num':
      return <span className="eq-num mono">{node.text}</span>;
    case 'op':
      return <span className="eq-op">{node.text}</span>;
    case 'frac':
      return (
        <span className="eq-frac">
          <span className="eq-frac__num">
            <Nodes nodes={node.num} values={values} />
          </span>
          <span className="eq-frac__den">
            <Nodes nodes={node.den} values={values} />
          </span>
        </span>
      );
    case 'sup':
      return (
        <span className="eq-supwrap">
          <Node node={node.base} values={values} />
          <span className="eq-sup">
            <Nodes nodes={node.exp} values={values} />
          </span>
        </span>
      );
    case 'sub':
      return (
        <span className="eq-supwrap">
          <Node node={node.base} values={values} />
          <span className="eq-subscript">{node.sub}</span>
        </span>
      );
    case 'sqrt':
      return (
        <span className="eq-sqrt">
          <span className="eq-sqrt__radical">√</span>
          <span className="eq-sqrt__body">
            <Nodes nodes={node.body} values={values} />
          </span>
        </span>
      );
    case 'fn':
      return (
        <span className="eq-fn">
          <span className="eq-fn__name">{node.name}</span>
          <span className="eq-op">(</span>
          <Nodes nodes={node.arg} values={values} />
          <span className="eq-op">)</span>
        </span>
      );
    case 'group':
      return (
        <span className="eq-group">
          <span className="eq-op">(</span>
          <Nodes nodes={node.body} values={values} />
          <span className="eq-op">)</span>
        </span>
      );
  }
}

export function EqBoard({ spec, values }: { spec: EqSpec; values: EqValues }) {
  return (
    <div className="eq" data-eq={spec.id}>
      <Nodes nodes={spec.nodes} values={values} />
    </div>
  );
}
