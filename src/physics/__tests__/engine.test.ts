import { describe, expect, it } from 'vitest';
import { G0 } from '../constants.ts';
import type { EngineDesign } from '../types.ts';
import { engineThrottleRange, evaluateEngine } from '../propulsion/engine.ts';
import { evaluateSolid, solidThrustAt } from '../propulsion/solid.ts';

const merlin: EngineDesign = {
  propellant: 'lox-rp1',
  mixtureRatio: 2.36,
  chamberPressure: 9.7e6,
  vacuumThrust: 981e3,
  expansionRatio: 16,
  cycle: 'gas-generator',
  count: 1,
};

describe('evaluateEngine: real-engine anchors', () => {
  it('Merlin-1D-like → Isp 282 SL / 311 vac ±3%', () => {
    const p = evaluateEngine(merlin, 111e3);
    expect(Math.abs(p.ispSL / 282 - 1)).toBeLessThan(0.03);
    expect(Math.abs(p.ispVac / 311 - 1)).toBeLessThan(0.03);
    expect(p.thrustVac).toBeCloseTo(981e3, 6); // throat sized to the target
    expect(p.thrustSL).toBeLessThan(p.thrustVac);
  });

  it('RL10-like (expander ≈ staged-combustion η bucket) → ispVac in [440, 475]', () => {
    const p = evaluateEngine(
      {
        propellant: 'lox-lh2',
        mixtureRatio: 5.5,
        chamberPressure: 4.4e6,
        vacuumThrust: 110e3,
        expansionRatio: 84,
        cycle: 'staged-combustion',
        count: 1,
      },
      20e3,
    );
    expect(p.ispVac).toBeGreaterThan(440);
    expect(p.ispVac).toBeLessThan(475);
  });

  it('Raptor-like → ispSL 330 ±3.5%', () => {
    const p = evaluateEngine(
      {
        propellant: 'lox-ch4',
        mixtureRatio: 3.6,
        chamberPressure: 30e6,
        vacuumThrust: 2.3e6,
        expansionRatio: 34,
        cycle: 'staged-combustion',
        count: 1,
      },
      1000e3,
    );
    expect(Math.abs(p.ispSL / 330 - 1)).toBeLessThan(0.035);
  });

  it('Kestrel-like pressure-fed (big ε, low pc) separates at SL; feed 1.67 MPa', () => {
    const p = evaluateEngine(
      {
        propellant: 'lox-rp1',
        mixtureRatio: 2.3,
        chamberPressure: 0.9e6,
        vacuumThrust: 31e3,
        expansionRatio: 60,
        cycle: 'pressure-fed',
        count: 1,
      },
      2.5e3,
    );
    expect(p.separationAtSL).toBe(true);
    expect(p.feedPressure).toBeCloseTo(1.3 * 0.9e6 + 0.5e6, 6); // 1.67e6
  });
});

describe('evaluateEngine: cycle bookkeeping', () => {
  it('electric-pump battery for 25 kN / 300 kg stage lands in (0, 60) kg (computes ≈5 kg)', () => {
    const p = evaluateEngine(
      {
        propellant: 'lox-rp1',
        mixtureRatio: 2.3,
        chamberPressure: 7e6,
        vacuumThrust: 25e3,
        expansionRatio: 16,
        cycle: 'electric-pump',
        count: 1,
      },
      300,
    );
    expect(p.batteryMass).toBeGreaterThan(0);
    expect(p.batteryMass).toBeLessThan(60);
  });

  it('batteryMass is 0 for non-electric cycles', () => {
    expect(evaluateEngine(merlin, 111e3).batteryMass).toBe(0);
  });

  it('gas-generator: F_vac = massFlow·g0·ispVac with the bleed folded into massFlow', () => {
    const p = evaluateEngine(merlin, 111e3);
    expect(p.massFlow * G0 * p.ispVac).toBeCloseTo(p.thrustVac, 6);
    // total flow exceeds core flow pc·At/c* by exactly the bleed fraction
    const mdotCore = (merlin.chamberPressure * p.throatArea) / p.cstar;
    expect(p.massFlow).toBeCloseTo(mdotCore / 0.979, 9);
  });

  it('throttle floors per cycle', () => {
    expect(engineThrottleRange('pressure-fed')).toBe(0.4);
    expect(engineThrottleRange('gas-generator')).toBe(0.6);
    expect(engineThrottleRange('electric-pump')).toBe(0.3);
    expect(engineThrottleRange('staged-combustion')).toBe(0.55);
    expect(evaluateEngine(merlin, 111e3).throttleFloor).toBe(0.6);
  });

  it('fills every EnginePerformance field with finite numbers', () => {
    const p = evaluateEngine(merlin, 111e3);
    for (const [k, v] of Object.entries(p)) {
      if (typeof v === 'number') expect(Number.isFinite(v), k).toBe(true);
    }
    expect(p.exitArea).toBeCloseTo(16 * p.throatArea, 12);
    expect(p.engineMass).toBeGreaterThan(8);
  });
});

describe('solidThrustAt', () => {
  it('all three profiles integrate to 1 ±2% (trapz, 200 samples)', () => {
    for (const profile of ['progressive', 'neutral', 'regressive'] as const) {
      const n = 200;
      let sum = 0;
      for (let i = 0; i < n; i++) {
        const a = solidThrustAt(profile, i / n);
        const b = solidThrustAt(profile, (i + 1) / n);
        sum += ((a + b) / 2) * (1 / n);
      }
      expect(Math.abs(sum - 1), profile).toBeLessThan(0.02);
    }
  });

  it('clamps tFrac to [0, 1] and matches the ramp endpoints', () => {
    expect(solidThrustAt('progressive', -1)).toBeCloseTo(0.75, 12);
    expect(solidThrustAt('progressive', 2)).toBeCloseTo(1.25, 12);
    expect(solidThrustAt('regressive', 0)).toBeCloseTo(1.25, 12);
    expect(solidThrustAt('neutral', 0.5)).toBeCloseTo(1.03, 12);
  });
});

describe('evaluateSolid', () => {
  it('24 kg APCP / 6 s / ε 8 / steel-4130 / d 0.10 m → mid-power numbers', () => {
    const p = evaluateSolid(
      {
        propellantMass: 24,
        burnTime: 6,
        thrustProfile: 'neutral',
        expansionRatio: 8,
        caseMaterial: 'steel-4130',
      },
      0.1,
    );
    expect(p.ispSL).toBeGreaterThan(210);
    expect(p.ispSL).toBeLessThan(245);
    expect(p.caseMass).toBeGreaterThan(1);
    expect(p.caseMass).toBeLessThan(8);
    expect(p.massFlowAvg).toBeCloseTo(4, 12);
    // F = ṁ·Isp_SL·g0 consistency
    expect(p.thrustAvg).toBeCloseTo(p.massFlowAvg * p.ispSL * G0, 6);
    expect(p.ispVac).toBeGreaterThan(p.ispSL);
    expect(p.motorLength).toBeGreaterThan(p.nozzleLength);
    expect(p.exitDiameter).toBeLessThan(0.11); // fits the 0.10 m body (+margin)
  });
});
