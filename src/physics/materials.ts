/**
 * Structural materials catalog. Room-temperature minimum (A-basis-ish) allowables
 * from MIL-HDBK-5/MMPDS ranges; densities and moduli are handbook values. These
 * feed tank wall sizing, fin flutter, and cost/margin tradeoffs.
 */

import type { MaterialId } from './types';

export interface Material {
  id: MaterialId;
  name: string;
  /** Density, kg/m³. */
  density: number;
  /** Yield strength (0.2% offset), Pa. */
  yieldStrength: number;
  /** Ultimate tensile strength, Pa. */
  ultimateStrength: number;
  /** Young's modulus, Pa. */
  modulus: number;
  /** Retains ductility at cryogenic temperature (LOX/LH2 contact OK). */
  cryoOk: boolean;
  /** Relative manufacturing cost, 1 (cheap) – 10 (exotic). */
  costIndex: number;
  /** Minimum manufacturable wall gauge, m. */
  minGauge: number;
}

/**
 * Baked values. Provenance:
 * - al-2219-T87: Saturn/SLS tank alloy; σ_y 393 MPa, weldable, cryo-tough.
 * - al-li-2195: Super-lightweight ET / Falcon 9 alloy; ~5% lighter, ~27% stronger than 2219.
 * - ss-304l: annealed austenitic stainless (Starship-adjacent); low yield, high elongation.
 * - ss-301 full-hard: Atlas/Centaur balloon-tank skin; cold-work raises σ_y to ~965 MPa.
 * - ti-6al4v: annealed; COPV liners, high-value fittings.
 * - cfrp: quasi-isotropic IM laminate allowable ~600 MPa (not fiber strength);
 *   cryoOk false = microcracking/permeation demands a liner — flagged upstream.
 * - steel-4130: normalized chromoly; sounding-rocket cases and rail hardware.
 */
export const MATERIALS: Record<MaterialId, Material> = {
  'al-2219': {
    id: 'al-2219',
    name: 'Aluminum 2219-T87',
    density: 2840,
    yieldStrength: 393e6,
    ultimateStrength: 476e6,
    modulus: 73e9,
    cryoOk: true,
    costIndex: 3,
    minGauge: 0.9e-3,
  },
  'al-li-2195': {
    id: 'al-li-2195',
    name: 'Aluminum–Lithium 2195',
    density: 2700,
    yieldStrength: 500e6,
    ultimateStrength: 565e6,
    modulus: 76e9,
    cryoOk: true,
    costIndex: 7,
    minGauge: 0.9e-3,
  },
  'ss-304l': {
    id: 'ss-304l',
    name: 'Stainless 304L (annealed)',
    density: 7900,
    yieldStrength: 240e6,
    ultimateStrength: 564e6,
    modulus: 193e9,
    cryoOk: true,
    costIndex: 2,
    minGauge: 0.4e-3,
  },
  'ss-301fh': {
    id: 'ss-301fh',
    name: 'Stainless 301 full-hard',
    density: 7880,
    yieldStrength: 965e6,
    ultimateStrength: 1276e6,
    modulus: 193e9,
    cryoOk: true,
    costIndex: 5,
    minGauge: 0.4e-3,
  },
  'ti-6al4v': {
    id: 'ti-6al4v',
    name: 'Titanium Ti-6Al-4V',
    density: 4430,
    yieldStrength: 880e6,
    ultimateStrength: 950e6,
    modulus: 114e9,
    cryoOk: true,
    costIndex: 8,
    minGauge: 0.6e-3,
  },
  cfrp: {
    id: 'cfrp',
    name: 'Carbon fiber laminate',
    density: 1600,
    yieldStrength: 600e6,
    ultimateStrength: 700e6,
    modulus: 70e9,
    cryoOk: false,
    costIndex: 6,
    minGauge: 1.2e-3,
  },
  'steel-4130': {
    id: 'steel-4130',
    name: 'Steel 4130 chromoly',
    density: 7850,
    yieldStrength: 435e6,
    ultimateStrength: 670e6,
    modulus: 205e9,
    cryoOk: true,
    costIndex: 2,
    minGauge: 0.5e-3,
  },
};

/** Catalog lookup — total over MaterialId, so it never misses. */
export function material(id: MaterialId): Material {
  return MATERIALS[id];
}
