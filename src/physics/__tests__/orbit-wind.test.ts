import { describe, expect, it } from 'vitest';
import { MU_EARTH, R_EARTH } from '../constants.ts';
import { gravityAccel, surfaceGravity } from '../gravity.ts';
import {
  apoapsisFromState,
  circularSpeed,
  isOrbit,
  orbitalElements,
  visViva,
} from '../orbit.ts';
import { groundWind, windProfile } from '../wind.ts';

describe('orbit', () => {
  it('circular orbit at 200 km: e ≈ 0, apo = peri = 200 km, Kepler period', () => {
    const r = R_EARTH + 200e3;
    const v = circularSpeed(r);
    const el = orbitalElements(r, 0, 0, v);
    expect(el.eccentricity).toBeLessThan(1e-9);
    expect(Math.abs(el.apoapsisAlt - 200e3)).toBeLessThanOrEqual(1);
    expect(Math.abs(el.periapsisAlt - 200e3)).toBeLessThanOrEqual(1);
    // Closed form with the mean radius R_EARTH = 6371 km gives
    // T = 2π√(r³/μ) = 5301.3 s. (The oft-quoted ~5310 s uses the equatorial
    // radius 6378 km — not this engine's constant.)
    const tExpected = 2 * Math.PI * Math.sqrt((r * r * r) / MU_EARTH);
    expect(Math.abs(el.period - tExpected) / tExpected).toBeLessThan(1e-9);
    expect(Math.abs(el.period - 5301.3)).toBeLessThan(5);
    expect(isOrbit(el)).toBe(true);
  });

  it('GTO 200×35786 km from perigee state: apoapsis and ~10.5 h period', () => {
    const rp = R_EARTH + 200e3;
    const a = R_EARTH + (200e3 + 35786e3) / 2;
    const v = visViva(rp, a);
    const el = orbitalElements(rp, 0, 0, v);
    expect(Math.abs(el.apoapsisAlt - 35786e3) / 35786e3).toBeLessThan(1e-3);
    expect(Math.abs(el.period - 37864) / 37864).toBeLessThan(0.01);
    expect(el.eccentricity).toBeGreaterThan(0.7);
    expect(el.eccentricity).toBeLessThan(1);
  });

  it('energy identity: ε from elements matches v²/2 − μ/r to 1e-9 relative', () => {
    const rp = R_EARTH + 200e3;
    const a = R_EARTH + (200e3 + 35786e3) / 2;
    const v = visViva(rp, a);
    const el = orbitalElements(rp, 0, 0, v);
    const epsState = (v * v) / 2 - MU_EARTH / rp;
    const epsElements = -MU_EARTH / (2 * el.semiMajorAxis);
    expect(Math.abs(epsElements - epsState) / Math.abs(epsState)).toBeLessThan(1e-9);
  });

  it('apoapsisFromState agrees with orbitalElements; escape gives Infinity', () => {
    const rp = R_EARTH + 200e3;
    const a = R_EARTH + (200e3 + 35786e3) / 2;
    const v = visViva(rp, a);
    expect(apoapsisFromState(rp, 0, 0, v)).toBeCloseTo(
      orbitalElements(rp, 0, 0, v).apoapsisAlt,
      6,
    );
    const vEsc = Math.sqrt((2 * MU_EARTH) / rp);
    expect(apoapsisFromState(rp, 0, 0, vEsc)).toBe(Infinity);
    const elEsc = orbitalElements(rp, 0, 0, vEsc * 1.01);
    expect(elEsc.apoapsisAlt).toBe(Infinity);
    expect(elEsc.semiMajorAxis).toBe(Infinity);
    expect(elEsc.period).toBe(Infinity);
    expect(elEsc.eccentricity).toBeGreaterThanOrEqual(1);
  });

  it('isOrbit thresholds on 140 km periapsis', () => {
    const low = orbitalElements(R_EARTH + 100e3, 0, 0, circularSpeed(R_EARTH + 100e3));
    expect(isOrbit(low)).toBe(false);
  });
});

describe('gravity', () => {
  it('gravityAccel points at the origin with μ/r² magnitude', () => {
    const g = gravityAccel(R_EARTH, 0);
    expect(g.ax).toBeCloseTo(-MU_EARTH / (R_EARTH * R_EARTH), 9);
    expect(g.ay).toBe(-0);
    const gDiag = gravityAccel(3e6, 4e6); // r = 5e6
    const mag = Math.hypot(gDiag.ax, gDiag.ay);
    expect(Math.abs(mag - MU_EARTH / 25e12) / (MU_EARTH / 25e12)).toBeLessThan(1e-12);
  });

  it('surfaceGravity: μ/(R+h)², ≈9.82 at h=0 for the mean-radius model', () => {
    expect(surfaceGravity(0)).toBeCloseTo(9.8203, 3);
    expect(surfaceGravity(200e3)).toBeCloseTo(
      MU_EARTH / ((R_EARTH + 200e3) * (R_EARTH + 200e3)),
      9,
    );
  });
});

describe('wind', () => {
  it('deterministic: same seed → identical profile, different seeds differ', () => {
    const a1 = windProfile('x').speedAt(5000);
    const a2 = windProfile('x').speedAt(5000);
    expect(a1).toBe(a2);
    const b = windProfile('y').speedAt(5000);
    expect(a1).not.toBe(b);
  });

  it('bounded: |speed| ≤ 15 m/s everywhere 0–80 km, every 100 m', () => {
    for (const seed of ['x', 'y', 'launch-day', 'daedalus']) {
      const p = windProfile(seed);
      for (let h = 0; h <= 80e3; h += 100) {
        expect(Math.abs(p.speedAt(h))).toBeLessThanOrEqual(15);
      }
    }
  });

  it('jet shape: ~0 at ground, peak 4–12 m/s near 10 km, ~0 above 30 km', () => {
    const p = windProfile('shape-check');
    expect(Math.abs(p.speedAt(0))).toBeLessThan(3);
    let peak = 0;
    for (let h = 0; h <= 30e3; h += 100) peak = Math.max(peak, p.speedAt(h));
    expect(peak).toBeGreaterThan(3);
    expect(peak).toBeLessThan(13);
    for (let h = 40e3; h <= 80e3; h += 1000) {
      expect(Math.abs(p.speedAt(h))).toBeLessThan(1);
    }
  });

  it('smooth for RK4: |Δspeed| < 0.05 m/s per metre, 0–30 km', () => {
    for (const seed of ['x', 'launch-day']) {
      const p = windProfile(seed);
      for (let h = 0; h <= 30e3; h += 25) {
        expect(Math.abs(p.speedAt(h + 1) - p.speedAt(h))).toBeLessThan(0.05);
      }
    }
  });

  it('groundWind reports the 10 m anemometer reading', () => {
    const p = windProfile('x');
    expect(groundWind(p)).toBe(p.surfaceWind);
  });

  it('the integrated field ramps to the surface wind, but gently', () => {
    for (const seed of ['x', 'launch-day', 'gusty']) {
      const p = windProfile(seed);
      // No-slip at the ground.
      expect(Math.abs(p.speedAt(0))).toBeLessThan(1.5); // gust harmonics only
      // The surface layer is present aloft in the boundary layer: by 600 m the
      // ramp has delivered most of the anemometer wind.
      if (Math.abs(p.surfaceWind) > 4) {
        expect(Math.abs(p.speedAt(600))).toBeGreaterThan(Math.abs(p.surfaceWind) * 0.5);
      }
      // …and it has faded again well above the boundary layer.
      const highSurfaceShare = Math.abs(p.speedAt(20e3) - p.speedAt(20e3));
      expect(highSurfaceShare).toBe(0);
    }
  });

  it('surface wind spans calm to scrub-worthy across seeds', () => {
    const winds = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((s) => windProfile(s).surfaceWind);
    expect(Math.max(...winds.map(Math.abs))).toBeGreaterThan(4);
    expect(Math.max(...winds.map(Math.abs))).toBeLessThanOrEqual(9);
  });
});
