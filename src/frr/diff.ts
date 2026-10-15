/**
 * Human-readable one-line design diff for the FRR document and flight records:
 * "fins.span 0.14→0.18 · ballast +4 kg". Pure recursive compare of two
 * serializable RocketDesigns — no schema knowledge beyond a few label
 * shorthands, so new design fields diff for free.
 */
import type { RocketDesign } from '../physics/types.ts';

/** Compact number: 3 significant digits, no trailing zeros, no exponent soup. */
function num(v: number): string {
  if (!Number.isFinite(v)) return String(v);
  const a = Math.abs(v);
  if (a !== 0 && (a >= 1e6 || a < 1e-3)) {
    // engineering-ish: 45e3 → 45k, 1.8e6 → 1.8M
    if (a >= 1e9) return trim((v / 1e9).toPrecision(3)) + 'G';
    if (a >= 1e6) return trim((v / 1e6).toPrecision(3)) + 'M';
    if (a >= 1e3) return trim((v / 1e3).toPrecision(3)) + 'k';
    return v.toExponential(1);
  }
  if (a >= 1e3) return trim((v / 1e3).toPrecision(3)) + 'k';
  return trim(v.toPrecision(3));
}
function trim(s: string): string {
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
}

/** Path prettifier: stages.0.propulsion.engine.chamberPressure → s1.engine.pc */
const SEGMENT_ALIASES: Record<string, string | null> = {
  propulsion: null, // drop — s1.engine.x reads better than s1.propulsion.engine.x
  guidance: 'gdn',
  chamberPressure: 'pc',
  mixtureRatio: 'MR',
  expansionRatio: 'ε',
  vacuumThrust: 'thrust',
  propellantMass: 'prop',
  safetyFactor: 'SF',
  interstageLength: 'interstage',
  separationDelay: 'sepDelay',
  ignitionDelay: 'ignDelay',
  verticalUntilSpeed: 'vertUntil',
  noseFineness: 'fineness',
  noseShape: 'nose',
  chuteArea: 'chute',
  payloadMass: 'payload',
  caseMaterial: 'case',
  thrustProfile: 'profile',
  commonBulkhead: 'commonBlkhd',
  railLength: 'rail',
};

function joinPath(parts: string[]): string {
  return parts.filter((p) => p.length > 0).join('.');
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function walk(prev: unknown, next: unknown, parts: string[], out: string[]): void {
  if (Object.is(prev, next)) return;
  if (typeof prev === 'number' && typeof next === 'number') {
    if (Math.abs(prev - next) <= 1e-12 * Math.max(1, Math.abs(prev))) return;
    // Ballast reads best as a delta — the classic "+4 kg" fix.
    if (parts[parts.length - 1] === 'noseBallast') {
      const d = next - prev;
      out.push(`ballast ${d >= 0 ? '+' : '−'}${num(Math.abs(d))} kg`);
      return;
    }
    out.push(`${joinPath(parts)} ${num(prev)}→${num(next)}`);
    return;
  }
  if (prev === undefined && next !== undefined) {
    if (parts[parts.length - 1] === 'noseBallast' && typeof next === 'number') {
      out.push(`ballast +${num(next)} kg`);
      return;
    }
    out.push(`+${joinPath(parts)}`);
    return;
  }
  if (prev !== undefined && next === undefined) {
    out.push(`−${joinPath(parts)}`);
    return;
  }
  if (Array.isArray(prev) && Array.isArray(next)) {
    const n = Math.max(prev.length, next.length);
    const isStages = parts[parts.length - 1] === 'stages';
    for (let i = 0; i < n; i++) {
      const seg = isStages ? `s${i + 1}` : String(i);
      const base = isStages ? parts.slice(0, -1) : parts;
      walk(prev[i], next[i], [...base, seg], out);
    }
    return;
  }
  if (isRecord(prev) && isRecord(next)) {
    const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
    for (const k of keys) {
      const alias = k in SEGMENT_ALIASES ? SEGMENT_ALIASES[k] : k;
      walk(prev[k], next[k], alias === null ? parts : [...parts, alias ?? k], out);
    }
    return;
  }
  // string / boolean / mixed-type change
  out.push(`${joinPath(parts)} ${String(prev)}→${String(next)}`);
}

/**
 * One-line human diff of the design vs the previous revision's design.
 * `prev === undefined` → baseline (REV A). Caps at 5 entries + "+n more".
 */
export function designDiff(prev: RocketDesign | undefined, next: RocketDesign): string {
  if (!prev) return 'baseline revision';
  const out: string[] = [];
  walk(prev as unknown, next as unknown, [], out);
  if (out.length === 0) return 'no change';
  const MAX = 5;
  if (out.length > MAX) {
    return [...out.slice(0, MAX), `+${out.length - MAX} more`].join(' · ');
  }
  return out.join(' · ');
}
