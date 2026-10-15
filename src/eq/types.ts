/**
 * The live-equation model. Equations are authored as typed trees (never parsed
 * from TeX); every variable symbol can carry a binding id that connects it to
 * live values, cross-highlighting, and the handbook glossary.
 */

export type EqNode =
  | { kind: 'sym'; text: string; bind?: string }
  | { kind: 'num'; text: string }
  | { kind: 'op'; text: string }
  | { kind: 'frac'; num: EqNode[]; den: EqNode[] }
  | { kind: 'sup'; base: EqNode; exp: EqNode[] }
  | { kind: 'sub'; base: EqNode; sub: string }
  | { kind: 'sqrt'; body: EqNode[] }
  | { kind: 'fn'; name: string; arg: EqNode[] }
  | { kind: 'group'; body: EqNode[] };

export interface EqSpec {
  id: string;
  nodes: EqNode[];
}

/** A live value flowing through an equation. */
export interface EqValue {
  value: number;
  /** Preformatted display text (units included where sensible). */
  text: string;
  /** 'input' = bound to the card's control (accent tint); 'const' = physical
      constant (dim); 'derived' = computed upstream; 'result' = the output. */
  role: 'input' | 'const' | 'derived' | 'result';
}

export type EqValues = Record<string, EqValue>;

// ————— authoring helpers —————

export const sym = (text: string, bind?: string): EqNode => ({ kind: 'sym', text, bind });
export const num = (text: string): EqNode => ({ kind: 'num', text });
export const op = (text: string): EqNode => ({ kind: 'op', text });
export const frac = (numr: EqNode[], den: EqNode[]): EqNode => ({ kind: 'frac', num: numr, den });
export const sup = (base: EqNode, exp: EqNode[]): EqNode => ({ kind: 'sup', base, exp });
export const sub = (base: EqNode, s: string): EqNode => ({ kind: 'sub', base, sub: s });
export const sqrt = (body: EqNode[]): EqNode => ({ kind: 'sqrt', body });
export const fn = (name: string, arg: EqNode[]): EqNode => ({ kind: 'fn', name, arg });
export const grp = (body: EqNode[]): EqNode => ({ kind: 'group', body });
