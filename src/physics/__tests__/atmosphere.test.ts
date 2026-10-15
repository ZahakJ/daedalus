import { describe, expect, it } from 'vitest';
import { R_EARTH } from '../constants.ts';
import { atmosphere } from '../atmosphere.ts';

/** Assert |actual − expected| ≤ tol·|expected|. */
function relClose(actual: number, expected: number, tol: number): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(Math.abs(expected) * tol);
}

/** Geometric altitude whose geopotential altitude is exactly hgp (inverse of eq 18). */
function geometricOf(hgp: number): number {
  return (R_EARTH * hgp) / (R_EARTH - hgp);
}

describe('atmosphere: USSA76 anchors (±0.5%)', () => {
  it('sea level: 288.15 K, 101325 Pa, 1.2250 kg/m³', () => {
    const a = atmosphere(0);
    expect(a.temperature).toBe(288.15);
    expect(a.pressure).toBe(101325);
    relClose(a.density, 1.225, 0.005);
  });

  it('5,000 m: 255.68 K, 54048 Pa, 0.73643 kg/m³', () => {
    const a = atmosphere(5000);
    relClose(a.temperature, 255.68, 0.005);
    relClose(a.pressure, 54048, 0.005);
    relClose(a.density, 0.73643, 0.005);
  });

  it('11,000 m: 216.65 K, 22632 Pa', () => {
    const a = atmosphere(11000);
    relClose(a.temperature, 216.65, 0.005);
    relClose(a.pressure, 22632, 0.005);
  });

  it('20 km: 216.65 K; 5474.9 Pa at H = 20 km geopotential', () => {
    // The classic 5474.9 Pa is the 20 km *geopotential* layer base
    // (Z ≈ 20,063 m geometric). At 20,000 m geometric (H ≈ 19,937 m) the
    // official table reads ≈5529 Pa — both are checked.
    const base = atmosphere(geometricOf(20000));
    relClose(base.temperature, 216.65, 0.005);
    relClose(base.pressure, 5474.9, 0.005);
    const geo = atmosphere(20000);
    relClose(geo.temperature, 216.65, 0.005);
    relClose(geo.pressure, 5529, 0.005);
  });

  it('47 km: 270.65 K, 110.91 Pa at H = 47 km geopotential', () => {
    // Stratopause base is at H = 47 km geopotential (Z ≈ 47,349 m geometric);
    // at 47,000 m geometric the gradient layer is still active (T ≈ 269.69 K).
    const base = atmosphere(geometricOf(47000));
    relClose(base.temperature, 270.65, 0.005);
    relClose(base.pressure, 110.91, 0.005);
    relClose(atmosphere(47000).temperature, 269.69, 0.005);
  });

  it('80 km: ρ ≈ 1.846e-5 kg/m³ (±2% — high-layer tables vary by source)', () => {
    relClose(atmosphere(80000).density, 1.846e-5, 0.02);
  });

  it('speed of sound at sea level ≈ 340.29 m/s (±0.1%)', () => {
    relClose(atmosphere(0).speedOfSound, 340.29, 0.001);
  });
});

describe('atmosphere: structure', () => {
  it('p and ρ strictly decrease 0 → 150 km, sampled every 500 m', () => {
    let prev = atmosphere(0);
    for (let h = 500; h <= 150000; h += 500) {
      const cur = atmosphere(h);
      expect(cur.pressure).toBeLessThan(prev.pressure);
      expect(cur.density).toBeLessThan(prev.density);
      prev = cur;
    }
  });

  it('hard vacuum above 150 km: p = ρ = 0, T and a stay finite', () => {
    const a = atmosphere(200e3);
    expect(a.pressure).toBe(0);
    expect(a.density).toBe(0);
    expect(a.temperature).toBeGreaterThan(0);
    expect(a.speedOfSound).toBeGreaterThan(0);
  });

  it('negative altitude clamps to sea level', () => {
    expect(atmosphere(-500)).toEqual(atmosphere(0));
  });

  it('continuous across the 86 km taper boundary', () => {
    const below = atmosphere(86e3 - 1e-6);
    const above = atmosphere(86e3 + 1e-6);
    relClose(above.pressure, below.pressure, 1e-6);
    relClose(above.temperature, below.temperature, 1e-6);
  });
});
