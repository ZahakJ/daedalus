/**
 * Mini-markdown renderer for handbook/briefing content — no deps, ~80 lines.
 * Supports: **bold**, *italic*, `code`, paragraphs, "- " lists, "## " headings,
 * and two live directives:
 *   {eq:<id>}   → <EqBoard> with values from HandbookValuesContext;
 *   {term:<id>} → accent chip linking to that handbook entry.
 */
import { createContext, createElement, useContext, type ReactNode } from 'react';
import { EqBoard } from '../eq/EqBoard.tsx';
import { EQUATIONS } from '../eq/specs/index.ts';
import type { EqValues } from '../eq/types.ts';
import { navigate } from '../router.ts';
import { CONCEPT_BY_ID } from './concepts.ts';

/** Live numbers flowing into {eq:} directives (HandbookProvider supplies). */
export const HandbookValuesContext = createContext<EqValues>({});

export function LiveEq({ id }: { id: string }) {
  const values = useContext(HandbookValuesContext);
  const spec = EQUATIONS[id];
  if (!spec) return null;
  return createElement('div', { className: 'md-eq' }, createElement(EqBoard, { spec, values }));
}

function TermChip({ id }: { id: string }) {
  const c = CONCEPT_BY_ID[id];
  return createElement(
    'button',
    {
      className: 'md-term',
      type: 'button',
      onClick: () => navigate({ view: 'handbook', conceptId: id }),
    },
    c ? c.title : id,
  );
}

/**
 * Inline grammar. Two guards against silent corruption:
 *  - An italic run may NOT open on an asterisk that directly follows an
 *    alphanumeric (CommonMark's right-flanking rule). Without this, the bare
 *    star in `c*` pairs with the next emphasis marker in the block and eats
 *    everything between them — invisibly, with no error.
 *  - `\*` (and \` and \{) escape to a literal character.
 */
const INLINE =
  /(\\[*`{]|\*\*[^*]+\*\*|(?<![A-Za-z0-9])\*[^*\n]+\*|`[^`]+`|\{term:[a-z0-9-]+\}|\{eq:[a-z0-9-]+\})/g;

function renderInline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  text.split(INLINE).forEach((p, i) => {
    if (!p) return;
    if (p.length === 2 && p.startsWith('\\')) {
      out.push(p[1]);
    } else if (p.startsWith('**') && p.endsWith('**')) {
      out.push(createElement('strong', { key: i }, p.slice(2, -2)));
    } else if (p.startsWith('`') && p.endsWith('`')) {
      out.push(createElement('code', { key: i, className: 'mono md-code' }, p.slice(1, -1)));
    } else if (p.startsWith('{term:')) {
      out.push(createElement(TermChip, { key: i, id: p.slice(6, -1) }));
    } else if (p.startsWith('{eq:')) {
      out.push(createElement(LiveEq, { key: i, id: p.slice(4, -1) }));
    } else if (p.startsWith('*') && p.endsWith('*') && p.length > 2) {
      out.push(createElement('em', { key: i }, p.slice(1, -1)));
    } else {
      out.push(p);
    }
  });
  return out;
}

/** Mini-markdown → React nodes. Blocks are separated by blank lines. */
export function renderContent(src: string): ReactNode {
  const blocks = src.trim().split(/\n\s*\n/);
  return createElement(
    'div',
    { className: 'md' },
    blocks.map((b, i) => {
      const t = b.trim();
      const eqOnly = /^\{eq:([a-z0-9-]+)\}$/.exec(t);
      if (eqOnly) return createElement(LiveEq, { key: i, id: eqOnly[1]! });
      if (t.startsWith('## ')) {
        return createElement('h3', { key: i, className: 'md-h' }, renderInline(t.slice(3)));
      }
      const lines = t.split('\n');
      if (lines.every((l) => l.trimStart().startsWith('- '))) {
        return createElement(
          'ul',
          { key: i, className: 'md-list' },
          lines.map((l, j) => createElement('li', { key: j }, renderInline(l.trimStart().slice(2)))),
        );
      }
      return createElement('p', { key: i, className: 'md-p' }, renderInline(t.replace(/\n/g, ' ')));
    }),
  );
}
