import { describe, expect, it } from 'vitest';
import {
  areaRatioFromMach,
  exitMachFromAreaRatio,
  exitPressureRatio,
  nozzleGeometry,
  thrustCoefficient,
  vandenkerckhove,
} from '../propulsion/nozzle.ts';
import {
  bulkDensity,
  combustionState,
  cstarIdeal,
  propellantDensities,
  propellantInfo,
  SOLID_DENSITY,
} from '../propulsion/propellants.ts';

describe('nozzle: area ratio ↔ Mach', () => {
  it('round-trips on the supersonic branch (γ=1.2)', () => {
    for (const M of [1.5, 2.5, 4, 6]) {
      const eps = areaRatioFromMach(M, 1.2);
      expect(Math.abs(M - exitMachFromAreaRatio(eps, 1.2))).toBeLessThan(1e-6);
    }
  });

  it('returns sonic for eps ≤ 1', () => {
    expect(exitMachFromAreaRatio(1, 1.2)).toBe(1);
    expect(exitMachFromAreaRatio(0.5, 1.2)).toBe(1);
  });
});

describe('nozzle: thrust coefficient', () => {
  it('matches Sutton vacuum CF chart at γ=1.2 (±2%)', () => {
    const pc = 7e6;
    const cases: Array<[number, number]> = [
      [10, 1.72],
      [25, 1.834],
      [50, 1.891],
    ];
    for (const [eps, expected] of cases) {
      const Me = exitMachFromAreaRatio(eps, 1.2);
      const pe = pc * exitPressureRatio(Me, 1.2);
      const cf = thrustCoefficient(pc, pe, 0, eps, 1.2);
      expect(Math.abs(cf / expected - 1)).toBeLessThan(0.02);
    }
  });

  it('matched (pe=pa) CF equals the momentum term alone', () => {
    const pc = 7e6;
    const gamma = 1.2;
    const eps = 10;
    const Me = exitMachFromAreaRatio(eps, gamma);
    const pe = pc * exitPressureRatio(Me, gamma);
    const matched = thrustCoefficient(pc, pe, pe, eps, gamma);
    const momentum = Math.sqrt(
      ((2 * gamma * gamma) / (gamma - 1)) *
        Math.pow(2 / (gamma + 1), (gamma + 1) / (gamma - 1)) *
        (1 - Math.pow(pe / pc, (gamma - 1) / gamma)),
    );
    expect(Math.abs(matched - momentum)).toBeLessThan(1e-12);
  });
});

describe('nozzle: geometry', () => {
  it('computes 80% bell dimensions from throat area and eps', () => {
    const At = 0.01;
    const eps = 16;
    const g = nozzleGeometry(At, eps);
    const rt = Math.sqrt(At / Math.PI);
    expect(g.throatDiameter).toBeCloseTo(2 * rt, 12);
    expect(g.exitDiameter).toBeCloseTo(2 * rt * 4, 12); // √16 = 4
    expect(g.length).toBeCloseTo((0.8 * (4 * rt - rt)) / Math.tan((15 * Math.PI) / 180), 12);
  });
});

describe('propellants: c* ideal', () => {
  it('lox-rp1 @ MR 2.3, pc 7 MPa → 1800 ± 3% m/s', () => {
    const cstar = cstarIdeal(combustionState('lox-rp1', 2.3, 7e6));
    expect(Math.abs(cstar / 1800 - 1)).toBeLessThan(0.03);
  });

  it('lox-lh2 @ MR 6.0 → 2350 ± 3% m/s', () => {
    const cstar = cstarIdeal(combustionState('lox-lh2', 6.0, 7e6));
    expect(Math.abs(cstar / 2350 - 1)).toBeLessThan(0.03);
  });

  it('apcp → 1580 ± 3% m/s', () => {
    const cstar = cstarIdeal(combustionState('apcp', 0, 7e6));
    expect(Math.abs(cstar / 1580 - 1)).toBeLessThan(0.03);
  });
});

describe('propellants: combustion state', () => {
  it('lox-rp1 Tc peaks in the grid interior near MR 2.3', () => {
    const tc = (mr: number) => combustionState('lox-rp1', mr, 7e6).chamberTemp;
    expect(tc(2.3)).toBeGreaterThan(tc(1.9));
    expect(tc(2.3)).toBeGreaterThan(tc(2.7));
  });

  it('molar mass rises with MR', () => {
    const mm = (mr: number) => combustionState('lox-rp1', mr, 7e6).molarMass;
    expect(mm(2.0)).toBeLessThan(mm(2.3));
    expect(mm(2.3)).toBeLessThan(mm(2.7));
  });

  it('clamps MR to the grid', () => {
    expect(combustionState('lox-rp1', 0.1, 7e6)).toEqual(combustionState('lox-rp1', 1.8, 7e6));
    expect(combustionState('lox-rp1', 99, 7e6)).toEqual(combustionState('lox-rp1', 2.8, 7e6));
  });

  it('pc correction raises Tc with pc and clamps at ±4%', () => {
    const ref = combustionState('lox-rp1', 2.3, 7e6).chamberTemp;
    expect(combustionState('lox-rp1', 2.3, 14e6).chamberTemp).toBeGreaterThan(ref);
    expect(combustionState('lox-rp1', 2.3, 1e3).chamberTemp).toBeCloseTo(0.96 * ref, 9);
    expect(combustionState('lox-rp1', 2.3, 1e12).chamberTemp).toBeCloseTo(1.04 * ref, 9);
  });

  it('apcp ignores mixture ratio', () => {
    expect(combustionState('apcp', 1, 7e6)).toEqual(combustionState('apcp', 8, 7e6));
    expect(combustionState('apcp', 1, 7e6).chamberTemp).toBe(3200);
  });
});

describe('propellants: densities and info', () => {
  it('bulk density lox-rp1 @ 2.3 ≈ 1030 ± 3%', () => {
    expect(Math.abs(bulkDensity('lox-rp1', 2.3) / 1030 - 1)).toBeLessThan(0.03);
  });

  it('bulk density lox-lh2 @ 6.0 ≈ 360 ± 5%', () => {
    expect(Math.abs(bulkDensity('lox-lh2', 6.0) / 360 - 1)).toBeLessThan(0.05);
  });

  it('exposes per-propellant densities and cryo flags', () => {
    const d = propellantDensities('lox-lh2');
    expect(d.ox).toBe(1141);
    expect(d.fuel).toBe(71);
    expect(d.oxCryo).toBe(true);
    expect(d.fuelCryo).toBe(true);
    expect(propellantDensities('nto-mmh').oxCryo).toBe(false);
    expect(SOLID_DENSITY).toBe(1800);
  });

  it('provides display name and cost index for every combo', () => {
    for (const id of ['apcp', 'lox-rp1', 'lox-ch4', 'lox-lh2', 'nto-mmh'] as const) {
      const info = propellantInfo(id);
      expect(info.name.length).toBeGreaterThan(0);
      expect(info.costIndex).toBeGreaterThan(0);
    }
  });
});

describe('determinism', () => {
  it('identical args → identical results (===)', () => {
    const a = combustionState('lox-ch4', 3.4, 9e6);
    const b = combustionState('lox-ch4', 3.4, 9e6);
    expect(a.chamberTemp === b.chamberTemp).toBe(true);
    expect(a.molarMass === b.molarMass).toBe(true);
    expect(a.gamma === b.gamma).toBe(true);
    expect(cstarIdeal(a) === cstarIdeal(b)).toBe(true);
    expect(exitMachFromAreaRatio(37.3, 1.17) === exitMachFromAreaRatio(37.3, 1.17)).toBe(true);
    expect(bulkDensity('nto-mmh', 1.9) === bulkDensity('nto-mmh', 1.9)).toBe(true);
    expect(
      thrustCoefficient(7e6, 4e4, 101325, 16, 1.21) ===
        thrustCoefficient(7e6, 4e4, 101325, 16, 1.21),
    ).toBe(true);
    expect(vandenkerckhove(1.2) === vandenkerckhove(1.2)).toBe(true);
  });
});
