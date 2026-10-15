import { describe, expect, it } from 'vitest';
import { material } from '../materials';
import { boiloffRate, sizeStageTanks, wallThickness } from '../tanks';
import { axialCapability, bucklingStress, jointLoads, jointMargin } from '../structures';
import type { MaterialId, StageDesign } from '../types';

/** Liquid lox-rp1 stage factory — only the fields sizeStageTanks reads matter. */
function liquidStage(over: {
  propellantMass: number;
  diameter: number;
  material: MaterialId;
  safetyFactor: number;
  mixtureRatio?: number;
  commonBulkhead?: boolean;
  insulated?: boolean;
}): StageDesign {
  return {
    diameter: over.diameter,
    propulsion: {
      kind: 'liquid',
      propellantMass: over.propellantMass,
      engine: {
        propellant: 'lox-rp1',
        mixtureRatio: over.mixtureRatio ?? 2.3,
        chamberPressure: 7e6,
        vacuumThrust: 100e3,
        expansionRatio: 16,
        cycle: 'gas-generator',
        count: 1,
      },
    },
    tanks: {
      material: over.material,
      safetyFactor: over.safetyFactor,
      commonBulkhead: over.commonBulkhead ?? false,
      insulated: over.insulated ?? false,
    },
    interstageLength: 0,
    separationDelay: 0,
    ignitionDelay: 0,
  };
}

describe('wallThickness', () => {
  it('hoop closed form exact: t = MEOP·r·SF/σ_y (SF applied inside)', () => {
    const w = wallThickness(0.3e6, 1.0, 1.5, material('al-2219'));
    // 0.3e6·1·1.5/393e6 = 1.1450…e-3 m
    expect(Math.abs(w.cylinder - (0.3e6 * 1.0 * 1.5) / 393e6)).toBeLessThan(1e-9);
    expect(w.minGaugeLimited).toBe(false);
    // dome t/2 = 0.5725 mm is below the 0.9 mm gauge → clamped, but the
    // cylinder governs the flag.
    expect(w.dome).toBe(0.9e-3);
  });

  it('min gauge clamps a tiny tank and sets the flag', () => {
    const w = wallThickness(0.15e6, 0.15, 1.25, material('ss-304l'));
    expect(w.cylinder).toBe(0.4e-3);
    expect(w.dome).toBe(0.4e-3);
    expect(w.minGaugeLimited).toBe(true);
  });
});

describe('sizeStageTanks', () => {
  const base = { propellantMass: 1000, diameter: 1.2, material: 'al-2219' as const, safetyFactor: 1.5 };

  it('throws for solid stages', () => {
    const solid: StageDesign = {
      diameter: 0.5,
      propulsion: {
        kind: 'solid',
        motor: {
          propellantMass: 500,
          burnTime: 30,
          thrustProfile: 'neutral',
          expansionRatio: 8,
          caseMaterial: 'steel-4130',
        },
      },
      interstageLength: 0,
      separationDelay: 0,
      ignitionDelay: 0,
    };
    expect(() => sizeStageTanks(solid, 1e6)).toThrow();
  });

  it('pressure-fed mass spiral: 1000 kg lox-rp1 @ 1.8 MPa lands in [40,160] kg with visible pressurant system', () => {
    const rep = sizeStageTanks(liquidStage(base), 1.8e6);
    expect(rep.meop).toBe(1.8e6);
    expect(rep.totalMass).toBeGreaterThan(40);
    expect(rep.totalMass).toBeLessThan(160);
    expect(rep.pressurantMass + rep.copvMass).toBeGreaterThan(8);
    expect(rep.minGaugeLimited).toBe(false);
    // burst = actual t·σ_y/r = MEOP·SF when not gauge-limited.
    expect(rep.burstPressure).toBeCloseTo(1.8e6 * 1.5, 3);
    // report internally consistent
    expect(rep.totalMass).toBeCloseTo(
      rep.oxMass + rep.fuelMass + rep.pressurantMass + rep.copvMass + rep.insulationMass,
      9,
    );
    expect(rep.oxLength).toBeGreaterThan(rep.fuelLength);
  });

  it('pump-fed (0.25 MPa floor) is at least 2.5× lighter than pressure-fed', () => {
    const pressureFed = sizeStageTanks(liquidStage(base), 1.8e6);
    const pumpFed = sizeStageTanks(liquidStage(base), 0.25e6);
    expect(pumpFed.meop).toBe(0.25e6);
    expect(pressureFed.totalMass).toBeGreaterThan(2.5 * pumpFed.totalMass);
  });

  it('MEOP floor applies below 0.25 MPa', () => {
    const rep = sizeStageTanks(liquidStage(base), 0.1e6);
    expect(rep.meop).toBe(0.25e6);
  });

  it('common bulkhead credits one dome pair of mass; lengths unchanged', () => {
    const separate = sizeStageTanks(liquidStage(base), 1.8e6);
    const common = sizeStageTanks(liquidStage({ ...base, commonBulkhead: true }), 1.8e6);
    const r = base.diameter / 2;
    const domePairMass =
      2 * 1.38 * Math.PI * r * r * separate.oxWall * material('al-2219').density * 1.12;
    expect(separate.totalMass - common.totalMass).toBeCloseTo(domePairMass, 6);
    expect(common.oxLength).toBe(separate.oxLength);
    expect(common.fuelLength).toBe(separate.fuelLength);
  });

  it('insulation adds 1.5 kg/m² of wetted area', () => {
    const bare = sizeStageTanks(liquidStage(base), 1.8e6);
    const insulated = sizeStageTanks(liquidStage({ ...base, insulated: true }), 1.8e6);
    expect(bare.insulationMass).toBe(0);
    expect(insulated.insulationMass).toBeGreaterThan(0);
    expect(insulated.totalMass - bare.totalMass).toBeCloseTo(insulated.insulationMass, 9);
  });

  // "ss-304l tank mass < al-2219 tank mass" on a small stage does not hold
  // with this material catalog at any pressure: steel's min-gauge areal mass
  // (0.4 mm·7900 = 3.16 kg/m²) exceeds aluminum's (0.9 mm·2840 = 2.556 kg/m²),
  // and above min gauge steel's ρ/σ_y is worse. The true form of the min-gauge
  // lesson this model supports: aluminum pays a far larger min-gauge PENALTY
  // (actual/required thickness) than thin-gauge steel, so steel wastes almost
  // no material where aluminum carries 4× what the pressure needs.
  it('min-gauge lesson: thin-gauge steel is far less gauge-penalized than aluminum on a small stage', () => {
    const small = { propellantMass: 120, diameter: 0.45, safetyFactor: 1.5 };
    const r = small.diameter / 2;
    const meop = 0.25e6; // pump-fed floor
    const alu = sizeStageTanks(liquidStage({ ...small, material: 'al-2219' }), meop);
    const steel = sizeStageTanks(liquidStage({ ...small, material: 'ss-304l' }), meop);
    expect(alu.minGaugeLimited).toBe(true);
    expect(steel.minGaugeLimited).toBe(true);
    // steel wall is physically thinner
    expect(steel.oxWall).toBeLessThan(alu.oxWall);
    // gauge penalty = actual t / structurally required t
    const required = (mat: MaterialId): number =>
      (meop * r * small.safetyFactor) / material(mat).yieldStrength;
    const aluPenalty = alu.oxWall / required('al-2219');
    const steelPenalty = steel.oxWall / required('ss-304l');
    expect(steelPenalty).toBeLessThan(aluPenalty);
    expect(aluPenalty).toBeGreaterThan(3);
  });
});

describe('boiloffRate', () => {
  it('0.2 %/hr insulated, 5× uninsulated', () => {
    expect(boiloffRate(1000, true)).toBeCloseTo((0.002 / 3600) * 1000, 12);
    expect(boiloffRate(1000, false)).toBeCloseTo((5 * 0.002 * 1000) / 3600, 12);
    expect(boiloffRate(0, true)).toBe(0);
  });
});

describe('structures', () => {
  const al = material('al-2219');

  it('jointLoads: axial = m·a, bending = q·α·CNα·S·l', () => {
    const lc = jointLoads(2000, 40, 30e3, 0.05, 4, 1.13, 6);
    expect(lc.axialForce).toBeCloseTo(80000, 9);
    expect(lc.bendingMoment).toBeCloseTo(30e3 * 0.05 * 4 * 1.13 * 6, 9);
  });

  it('bucklingStress: pressurization credit raises capability', () => {
    const unpressurized = bucklingStress(al, 2e-3, 0.6, 0);
    const pressurized = bucklingStress(al, 2e-3, 0.6, 0.3e6);
    expect(pressurized).toBeGreaterThan(unpressurized);
    expect(unpressurized).toBeCloseTo((0.3 * 73e9 * 2e-3) / 0.6, 3);
    expect(pressurized).toBeCloseTo((0.3 * 73e9 * 2e-3) / 0.6 + (0.3e6 * 0.6) / (2 * 2e-3), 3);
  });

  it('bucklingStress caps at 0.9·σ_y', () => {
    expect(bucklingStress(al, 2e-3, 0.6, 50e6)).toBe(0.9 * 393e6);
  });

  it('axialCapability = σ_cr·2πrt', () => {
    const t = 2e-3;
    const r = 0.6;
    expect(axialCapability(al, t, r, 0.3e6)).toBeCloseTo(
      bucklingStress(al, t, r, 0.3e6) * 2 * Math.PI * r * t,
      6,
    );
  });

  it('jointMargin is exactly 0 when capability equals equivalent axial load', () => {
    const load = { axialForce: 1e5, bendingMoment: 2e4, label: 'max-q' };
    const r = 0.5;
    const equivalent = 1e5 + (2 * 2e4) / r; // F + 2M/r = 1.8e5
    expect(jointMargin(equivalent, load, r)).toBe(0);
    expect(jointMargin(2 * equivalent, load, r)).toBeCloseTo(1, 12);
    expect(jointMargin(0.5 * equivalent, load, r)).toBeLessThan(0);
  });
});
