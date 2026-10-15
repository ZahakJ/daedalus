import { describe, expect, it } from 'vitest';
import { G0 } from '../constants';
import {
  finsCN,
  flutterSpeed,
  noseCN,
  railExitSpeed,
  staticMarginCalibers,
  totalCP,
  windAngleOfAttack,
} from '../stability';
import type { FinSet } from '../types';

/** Estes-Alpha-like geometry (classic Barrowman worked example). */
const alphaFins: FinSet = {
  count: 3,
  rootChord: 0.05,
  tipChord: 0.025,
  span: 0.025,
  sweep: Math.atan(1), // xSweepLE = s·tan(sweep) = 0.025
  thickness: 0.003,
  material: 'cfrp',
};
const ALPHA_D = 0.025;
const ALPHA_FIN_LE_X = 0.22;

describe('noseCN', () => {
  it('CNα = 2 for every shape; xcp fractions per Barrowman', () => {
    const L = 0.07;
    const conical = noseCN('conical', L);
    const ogive = noseCN('ogive', L);
    const vk = noseCN('von-karman', L);
    for (const c of [conical, ogive, vk]) expect(c.cnAlpha).toBe(2);
    expect(conical.xcp).toBeCloseTo((2 / 3) * L, 9);
    expect(ogive.xcp).toBeCloseTo(0.466 * L, 9);
    expect(vk.xcp).toBeCloseTo(0.5 * L, 9);
  });
});

describe('Estes-Alpha-like Barrowman check', () => {
  const nose = noseCN('ogive', 0.07);
  const fins = finsCN(alphaFins, ALPHA_D, ALPHA_FIN_LE_X);
  const total = totalCP([nose, fins]);

  it('fin CNα in the sane band and dominating the nose', () => {
    expect(fins.cnAlpha).toBeGreaterThan(5);
    expect(fins.cnAlpha).toBeLessThan(12);
    expect(fins.cnAlpha).toBeGreaterThan(2 * nose.cnAlpha);
  });

  it('total CP lands between 0.19 and 0.24 m from the nose tip', () => {
    expect(total.xcp).toBeGreaterThan(0.19);
    expect(total.xcp).toBeLessThan(0.24);
  });

  it('CP ordering: nose < total < fins', () => {
    expect(nose.xcp).toBeLessThan(total.xcp);
    expect(total.xcp).toBeLessThan(fins.xcp);
  });

  it('total CNα is the component sum', () => {
    expect(total.cnAlpha).toBeCloseTo(nose.cnAlpha + fins.cnAlpha, 12);
  });
});

describe('staticMarginCalibers', () => {
  it('(0.22 − 0.19)/0.025 = 1.2', () => {
    expect(staticMarginCalibers(0.22, 0.19, 0.025)).toBeCloseTo(1.2, 9);
  });
});

describe('flutterSpeed (NACA TN 4197)', () => {
  const G = 25e9; // Pa, aluminum-ish shear modulus
  const a = 340.294; // m/s, sea-level speed of sound
  const p = 101325;

  it('halving thickness reduces Vf by ~2^1.5 (t³ under the sqrt)', () => {
    const thick = flutterSpeed(alphaFins, G, p, a);
    const thin = flutterSpeed({ ...alphaFins, thickness: alphaFins.thickness / 2 }, G, p, a);
    const ratio = thick / thin;
    expect(ratio).toBeGreaterThan(Math.SQRT2 ** 3 * 0.97);
    expect(ratio).toBeLessThan(Math.SQRT2 ** 3 * 1.03);
  });

  it('higher ambient pressure lowers the flutter boundary', () => {
    const sl = flutterSpeed(alphaFins, G, p, a);
    const alt = flutterSpeed(alphaFins, G, p / 4, a);
    expect(sl).toBeLessThan(alt);
    expect(sl).toBeGreaterThan(0);
  });

  it('vacuum limit is Infinity, not NaN', () => {
    expect(flutterSpeed(alphaFins, G, 0, a)).toBe(Infinity);
  });
});

describe('railExitSpeed', () => {
  it('v = √(2·(twr−1)·g0·L) for twr = 4.1, L = 5', () => {
    expect(railExitSpeed(4.1, 5)).toBeCloseTo(Math.sqrt(2 * 3.1 * G0 * 5), 9);
  });

  it('0 when twr ≤ 1 (pad crawl)', () => {
    expect(railExitSpeed(0.9, 5)).toBe(0);
    expect(railExitSpeed(1, 5)).toBe(0);
  });
});

describe('windAngleOfAttack', () => {
  it('atan2 of wind over vehicle speed', () => {
    expect(windAngleOfAttack(10, 10)).toBeCloseTo(Math.PI / 4, 12);
    expect(windAngleOfAttack(0, 50)).toBe(0);
    expect(windAngleOfAttack(5, 0)).toBeCloseTo(Math.PI / 2, 12);
  });
});
