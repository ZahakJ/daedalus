import { describe, expect, it } from 'vitest';
import { MATERIALS, material } from '../materials';
import type { MaterialId } from '../types';
import {
  dragCoefficient,
  dragForce,
  dynamicPressure,
  finDragIncrement,
  machNumber,
} from '../aero';

const ALL_IDS: MaterialId[] = [
  'al-2219',
  'al-li-2195',
  'ss-304l',
  'ss-301fh',
  'ti-6al4v',
  'cfrp',
  'steel-4130',
];

describe('materials', () => {
  it('al-2219 yield strength is exact', () => {
    expect(material('al-2219').yieldStrength).toBe(393e6);
  });

  it('all 7 ids present with consistent id field', () => {
    for (const id of ALL_IDS) {
      const m = MATERIALS[id];
      expect(m).toBeDefined();
      expect(m.id).toBe(id);
      expect(material(id)).toBe(m);
    }
    expect(Object.keys(MATERIALS)).toHaveLength(7);
  });

  it('physical sanity: positive minGauge, ultimate ≥ yield, positive density/modulus', () => {
    for (const id of ALL_IDS) {
      const m = material(id);
      expect(m.minGauge).toBeGreaterThan(0);
      expect(m.ultimateStrength).toBeGreaterThanOrEqual(m.yieldStrength);
      expect(m.density).toBeGreaterThan(0);
      expect(m.modulus).toBeGreaterThan(0);
    }
  });
});

describe('dragCoefficient', () => {
  it('transonic peak dominates subsonic and supersonic', () => {
    const peak = dragCoefficient(1.1, 'conical', 8);
    expect(peak).toBeGreaterThan(dragCoefficient(0.8, 'conical', 8));
    expect(peak).toBeGreaterThan(dragCoefficient(2.0, 'conical', 8));
  });

  it('subsonic ≈ 0.30 and hypersonic ≈ 0.24 at reference fineness', () => {
    expect(dragCoefficient(0.3, 'conical', 8)).toBeCloseTo(0.3, 2);
    expect(Math.abs(dragCoefficient(0.3, 'conical', 8) - 0.3)).toBeLessThanOrEqual(0.02);
    expect(Math.abs(dragCoefficient(6, 'conical', 8) - 0.24)).toBeLessThanOrEqual(0.02);
  });

  it('nose-shape ordering at M1.1: von-karman < ogive < conical', () => {
    const vk = dragCoefficient(1.1, 'von-karman', 8);
    const og = dragCoefficient(1.1, 'ogive', 8);
    const co = dragCoefficient(1.1, 'conical', 8);
    expect(vk).toBeLessThan(og);
    expect(og).toBeLessThan(co);
  });

  it('no wave drag subsonic: all nose shapes equal at M0.2', () => {
    const vk = dragCoefficient(0.2, 'von-karman', 8);
    const og = dragCoefficient(0.2, 'ogive', 8);
    const co = dragCoefficient(0.2, 'conical', 8);
    expect(Math.abs(vk - co)).toBeLessThan(1e-9);
    expect(Math.abs(og - co)).toBeLessThan(1e-9);
  });

  it('fineness correction: stubbier body drags more, correction is clamped', () => {
    expect(dragCoefficient(1.1, 'conical', 4)).toBeGreaterThan(dragCoefficient(1.1, 'conical', 12));
    // clamp bounds: factor ∈ [0.92, 1.15]
    const ref = dragCoefficient(1.1, 'conical', 8);
    expect(dragCoefficient(1.1, 'conical', -100)).toBeCloseTo(ref * 1.15, 12);
    expect(dragCoefficient(1.1, 'conical', 100)).toBeCloseTo(ref * 0.92, 12);
  });

  it('monotone cubic has no overshoot: Cd within [0.2, 0.65] over M 0→8', () => {
    for (const shape of ['conical', 'ogive', 'von-karman'] as const) {
      for (let m = 0; m <= 8.000001; m += 0.01) {
        const cd = dragCoefficient(m, shape, 8);
        expect(cd).toBeGreaterThanOrEqual(0.2);
        expect(cd).toBeLessThanOrEqual(0.65);
      }
    }
  });
});

describe('closed forms', () => {
  it('dynamicPressure(1.225, 100) is exactly 6125', () => {
    expect(dynamicPressure(1.225, 100)).toBe(6125);
  });

  it('dragForce = q·Cd·S', () => {
    expect(dragForce(6125, 0.3, 2)).toBeCloseTo(3675, 9);
  });

  it('finDragIncrement: 4 fins, S_fin/S_ref = 0.25 each → ΔCd = 0.016', () => {
    expect(finDragIncrement(0.25, 1, 4)).toBeCloseTo(0.016, 12);
    expect(finDragIncrement(0, 1, 4)).toBe(0);
  });

  it('machNumber: v/a, and 0 for a ≤ 0', () => {
    expect(machNumber(340, 340)).toBeCloseTo(1, 12);
    expect(machNumber(100, 0)).toBe(0);
    expect(machNumber(100, -1)).toBe(0);
  });
});
