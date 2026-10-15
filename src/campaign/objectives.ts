/** Objective constructors — small, composable success predicates over FlightResult. */
import type { Objective } from './types.ts';

const km = (m: number): string => `${(m / 1000).toFixed(1)} km`;

export function apogeeAtLeast(target: number): Objective {
  return {
    id: 'apogee',
    label: `Reach ${km(target)}`,
    evaluate: (r) => ({
      pass: r.summary.apogee >= target,
      actual: km(r.summary.apogee),
      target: `≥ ${km(target)}`,
    }),
  };
}

export function landingAtMost(speed: number): Objective {
  return {
    id: 'landing',
    label: `Recover the vehicle (touchdown < ${speed} m/s)`,
    evaluate: (r) => ({
      pass: r.summary.landingSpeed !== undefined && r.summary.landingSpeed <= speed,
      actual:
        r.summary.landingSpeed !== undefined
          ? `${r.summary.landingSpeed.toFixed(1)} m/s`
          : 'not recovered',
      target: `≤ ${speed} m/s`,
    }),
  };
}

export function downrangeAtLeast(target: number): Objective {
  return {
    id: 'downrange',
    label: `Downrange ${km(target)}`,
    evaluate: (r) => ({
      pass: r.summary.downrange >= target,
      actual: km(r.summary.downrange),
      target: `≥ ${km(target)}`,
    }),
  };
}

export function vehicleIntact(): Objective {
  return {
    id: 'intact',
    label: 'No loss of vehicle',
    evaluate: (r) => {
      const lov = r.failures.filter((f) => f.severity === 'loss-of-vehicle');
      return {
        pass: lov.length === 0,
        actual: lov.length === 0 ? 'nominal' : (lov[0]?.id ?? 'lost'),
        target: 'nominal flight',
      };
    },
  };
}

export function orbitCircular(altitude: number, tolerance: number, eccMax: number): Objective {
  return {
    id: 'orbit',
    label: `${km(altitude)} circular orbit`,
    evaluate: (r) => {
      const o = r.orbit;
      const pass =
        o !== null &&
        o.periapsisAlt > 140e3 &&
        Math.abs((o.apoapsisAlt + o.periapsisAlt) / 2 - altitude) <= tolerance &&
        o.eccentricity <= eccMax;
      return {
        pass,
        actual: o
          ? `${km(o.periapsisAlt)} × ${km(o.apoapsisAlt)}, e=${o.eccentricity.toFixed(3)}`
          : 'no orbit',
        target: `${km(altitude)} ± ${km(tolerance)}, e ≤ ${eccMax}`,
      };
    },
  };
}

export function gtoReached(apoTarget: number, apoTol: number, periMin: number): Objective {
  return {
    id: 'gto',
    label: 'Geostationary transfer orbit',
    evaluate: (r) => {
      const o = r.orbit;
      const pass =
        o !== null &&
        Math.abs(o.apoapsisAlt - apoTarget) <= apoTol &&
        o.periapsisAlt >= periMin;
      return {
        pass,
        actual: o ? `${km(o.periapsisAlt)} × ${km(o.apoapsisAlt)}` : 'no orbit',
        target: `≥ ${km(periMin)} × ${km(apoTarget)} ± ${km(apoTol)}`,
      };
    },
  };
}

export function costAtMost(cap: number): Objective {
  return {
    id: 'cost',
    label: `Program cost ≤ ${cap.toFixed(0)} cost units`,
    evaluate: (_r, _d, derived) => ({
      pass: derived.cost <= cap,
      actual: derived.cost.toFixed(0),
      target: `≤ ${cap.toFixed(0)}`,
    }),
  };
}
