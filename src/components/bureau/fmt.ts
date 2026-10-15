/** Bureau display formatters — UI edge only, physics stays SI. */
import { formatSI } from '../../sim/format.ts';

/**
 * SI value + unit: a space between the number and the
 * (prefix + unit), never glued. 137500,'m' → "137.5 km", not "138km".
 */
const SI_SPLIT = /^(-?[\d.]+)([TGMkmµnpf]?)$/;
export const fmtSIUnit = (v: number, unit: string, digits = 4): string => {
  const s = formatSI(v, digits);
  const m = SI_SPLIT.exec(s);
  return m ? `${m[1]} ${m[2]}${unit}` : `${s} ${unit}`;
};

export const fmtMass = (kg: number): string =>
  kg >= 10_000 ? `${(kg / 1000).toFixed(1)} t`
  : kg >= 1000 ? `${(kg / 1000).toFixed(2)} t`
  : kg >= 100 ? `${kg.toFixed(0)} kg`
  : `${kg.toFixed(1)} kg`;

export const fmtSpeed = (v: number): string =>
  v >= 1000 ? `${(v / 1000).toFixed(2)} km/s` : `${v.toFixed(0)} m/s`;

export const fmtPa = (pa: number): string =>
  pa >= 1e6 ? `${(pa / 1e6).toFixed(2)} MPa` : `${(pa / 1e3).toFixed(1)} kPa`;

export const fmtN = (n: number): string =>
  n >= 1e6 ? `${(n / 1e6).toFixed(2)} MN` : n >= 1e3 ? `${(n / 1e3).toFixed(1)} kN` : `${n.toFixed(0)} N`;

export const fmtKm = (m: number): string => `${(m / 1e3).toFixed(0)} km`;

export const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));
