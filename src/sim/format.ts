const SI_PREFIXES: Array<[number, string]> = [
  [1e12, 'T'],
  [1e9, 'G'],
  [1e6, 'M'],
  [1e3, 'k'],
];
const SI_SMALL: Array<[number, string]> = [
  [1e-3, 'm'],
  [1e-6, 'µ'],
  [1e-9, 'n'],
  [1e-12, 'p'],
  [1e-15, 'f'],
];

/** 12345 → "12.3k", 4.2e-9 → "4.20n" (pair with a unit, e.g. formatSI(x)+'s'). */
export function formatSI(value: number, digits = 3): string {
  if (value === 0) return '0';
  const abs = Math.abs(value);
  for (const [mag, sym] of SI_PREFIXES) {
    if (abs >= mag) return trim((value / mag).toPrecision(digits)) + sym;
  }
  if (abs >= 1) return trim(value.toPrecision(digits));
  for (const [mag, sym] of SI_SMALL) {
    if (abs >= mag) return trim((value / mag).toPrecision(digits)) + sym;
  }
  return value.toExponential(1);
}

function trim(s: string): string {
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
}

/** Milliseconds → compact human duration: "3d 4h", "12m 05s", "430ms". */
export function formatDuration(ms: number): string {
  const abs = Math.abs(ms);
  const sign = ms < 0 ? '-' : '';
  if (abs < 1000) return `${sign}${Math.round(abs)}ms`;
  const s = abs / 1000;
  if (s < 60) return `${sign}${s.toFixed(s < 10 ? 1 : 0)}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${sign}${m}m ${String(Math.floor(s % 60)).padStart(2, '0')}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${sign}${h}h ${String(m % 60).padStart(2, '0')}m`;
  const d = Math.floor(h / 24);
  return `${sign}${d}d ${h % 24}h`;
}

/** Degrees with hemisphere: formatDeg(-33.86, 'lat') → "33.86°S". */
export function formatDeg(deg: number, axis: 'lat' | 'lon', digits = 2): string {
  const hemi = axis === 'lat' ? (deg >= 0 ? 'N' : 'S') : deg >= 0 ? 'E' : 'W';
  return `${Math.abs(deg).toFixed(digits)}°${hemi}`;
}

/** Thousands-separated integer. */
export function formatInt(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}
