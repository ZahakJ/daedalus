/**
 * Collapsible mass-budget tree. Bars are log-free, scaled against the vehicle
 * gross so the eye reads proportion directly; every number is mono.
 */
import { useState } from 'react';
import type { MassNode } from '../../physics/index.ts';
import { fmtMass } from './fmt.ts';

function Row({ node, depth, total }: { node: MassNode; depth: number; total: number }) {
  const [open, setOpen] = useState(depth < 2);
  const branch = node.children !== undefined && node.children.length > 0;
  const pct = total > 0 ? (node.mass / total) * 100 : 0;
  return (
    <>
      <button
        type="button"
        className={`mt__row${branch ? ' mt__row--branch' : ''}`}
        style={{ paddingLeft: 6 + depth * 13 }}
        onClick={() => branch && setOpen((v) => !v)}
      >
        <span className="mt__twist">{branch ? (open ? '▾' : '▸') : '·'}</span>
        <span className="mt__label">{node.label}</span>
        <span className="mt__bar">
          <span className="mt__bar-fill" style={{ width: `${Math.max(1, pct)}%` }} />
        </span>
        <span className="mt__mass mono">{fmtMass(node.mass)}</span>
      </button>
      {branch &&
        open &&
        node.children!.map((c, i) => <Row key={`${c.label}-${i}`} node={c} depth={depth + 1} total={total} />)}
    </>
  );
}

export function MassTree({ tree }: { tree: MassNode }) {
  return (
    <div className="mt">
      <Row node={tree} depth={0} total={tree.mass} />
    </div>
  );
}
