/** Interpolation utilities shared by the lookup-table modules. Pure. */

export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Piecewise-linear interpolation over sorted xs. Clamps outside the domain. */
export function interpLinear(xs: readonly number[], ys: readonly number[], x: number): number {
  const n = xs.length;
  if (n === 0) throw new Error('interpLinear: empty table');
  if (x <= xs[0]!) return ys[0]!;
  if (x >= xs[n - 1]!) return ys[n - 1]!;
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid]! <= x) lo = mid;
    else hi = mid;
  }
  const t = (x - xs[lo]!) / (xs[hi]! - xs[lo]!);
  return lerp(ys[lo]!, ys[hi]!, t);
}

/**
 * Monotone cubic (Fritsch–Carlson) interpolant over sorted xs. Returns an
 * evaluator that clamps outside the domain. Preserves monotonicity of the
 * data — no overshoot between samples, which matters for physical tables
 * (Cd(M), combustion products vs mixture ratio).
 */
export function monotoneCubic(
  xs: readonly number[],
  ys: readonly number[],
): (x: number) => number {
  const n = xs.length;
  if (n < 2) throw new Error('monotoneCubic: need ≥2 points');
  // Secant slopes.
  const d: number[] = new Array(n - 1);
  for (let i = 0; i < n - 1; i++) d[i] = (ys[i + 1]! - ys[i]!) / (xs[i + 1]! - xs[i]!);
  // Tangents (Fritsch–Carlson limiting).
  const m: number[] = new Array(n);
  m[0] = d[0]!;
  m[n - 1] = d[n - 2]!;
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1]! * d[i]! <= 0) m[i] = 0;
    else m[i] = (d[i - 1]! + d[i]!) / 2;
  }
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
    } else {
      const a = m[i]! / d[i]!;
      const b = m[i + 1]! / d[i]!;
      const s = a * a + b * b;
      if (s > 9) {
        const tau = 3 / Math.sqrt(s);
        m[i] = tau * a * d[i]!;
        m[i + 1] = tau * b * d[i]!;
      }
    }
  }
  return (x: number): number => {
    if (x <= xs[0]!) return ys[0]!;
    if (x >= xs[n - 1]!) return ys[n - 1]!;
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (xs[mid]! <= x) lo = mid;
      else hi = mid;
    }
    const h = xs[hi]! - xs[lo]!;
    const t = (x - xs[lo]!) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    const h00 = 2 * t3 - 3 * t2 + 1;
    const h10 = t3 - 2 * t2 + t;
    const h01 = -2 * t3 + 3 * t2;
    const h11 = t3 - t2;
    return h00 * ys[lo]! + h10 * h * m[lo]! + h01 * ys[hi]! + h11 * h * m[hi]!;
  };
}
