/**
 * Supplies live EqValues to {eq:} directives: the handbook's equations carry
 * the current frontier design's numbers.
 * One sync sim (~10 ms, memoized) provides the max-Q flight condition.
 */
import { useMemo, type ReactNode } from 'react';
import {
  atmosphere,
  computeDerived,
  evaluateEngine,
  evaluateSolid,
  G0,
  MU_EARTH,
  R_EARTH,
  simulateFlight,
  sizeStageTanks,
  stabilityReport,
} from '../../physics/index.ts';
import type { EqValue, EqValues } from '../../eq/types.ts';
import type { Mission } from '../../campaign/types.ts';
import { MISSIONS } from '../../campaign/catalog.ts';
import { frontierMission } from '../../campaign/unlocks.ts';
import { useStore } from '../../store.ts';
import { HandbookValuesContext } from '../../content/render.ts';

const R_HELIUM = 2077.1; // J/(kg·K)

function fmtKg(v: number): string {
  return v >= 1000 ? `${(v / 1000).toFixed(2)} t` : `${v.toFixed(v < 10 ? 1 : 0)} kg`;
}
function fmtSpeed(v: number): string {
  return v >= 1000 ? `${(v / 1000).toFixed(2)} km/s` : `${v.toFixed(0)} m/s`;
}
function fmtPa(v: number): string {
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)} MPa`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)} kPa`;
  return `${v.toFixed(0)} Pa`;
}
function fmtM(v: number): string {
  return v >= 1000 ? `${(v / 1000).toFixed(0)} km` : `${v.toFixed(2)} m`;
}

export function buildEqValues(design: ReturnType<Mission['preset']>, mission: Mission): EqValues {
  const V: EqValues = {};
  const put = (id: string, value: number, text: string, role: EqValue['role']): void => {
    if (Number.isFinite(value)) V[id] = { value, text, role };
  };

  put('g0', G0, '9.81 m/s²', 'const');

  const derived = computeDerived(design);
  const s0 = derived.stages[0];
  if (s0) {
    const thrust = s0.thrustSL > 0 ? s0.thrustSL : s0.thrustVac;
    put('m0', s0.ignitionMass, fmtKg(s0.ignitionMass), 'derived');
    put('mf', s0.burnoutMass, fmtKg(s0.burnoutMass), 'derived');
    put('mp', s0.propellantMass, fmtKg(s0.propellantMass), 'derived');
    put('pmf', s0.propellantMassFraction, s0.propellantMassFraction.toFixed(3), 'result');
    put('ve', s0.ispVac * G0, fmtSpeed(s0.ispVac * G0), 'derived');
    put('dv', s0.deltaV, fmtSpeed(s0.deltaV), 'result');
    put('thrust', thrust, `${(thrust / 1e3).toFixed(1)} kN`, 'input');
    put('twr', s0.twrIgnition, s0.twrIgnition.toFixed(2), 'result');
    put('isp', s0.ispVac, `${s0.ispVac.toFixed(0)} s`, 'result');
  }

  const stage0 = design.stages[0];
  if (stage0) {
    try {
      const stab = stabilityReport(design, 1);
      put('cg', stab.cg, `${stab.cg.toFixed(2)} m`, 'derived');
      put('cp', stab.cp, `${stab.cp.toFixed(2)} m`, 'derived');
      put('staticMargin', stab.marginCalibers, `${stab.marginCalibers.toFixed(2)} cal`, 'result');
      put('railExit', stab.railExitSpeed, fmtSpeed(stab.railExitSpeed), 'result');
    } catch {
      /* stability chain unavailable for this design */
    }
    put('diameter', stage0.diameter, `${stage0.diameter.toFixed(2)} m`, 'input');
    put('railLength', design.launch.railLength, `${design.launch.railLength.toFixed(0)} m`, 'input');
    put('refArea', Math.PI * (stage0.diameter / 2) ** 2, `${(Math.PI * (stage0.diameter / 2) ** 2).toFixed(3)} m²`, 'derived');

    if (stage0.propulsion.kind === 'liquid') {
      try {
        const e = stage0.propulsion.engine;
        const perf = evaluateEngine(e, stage0.propulsion.propellantMass);
        put('pc', e.chamberPressure, fmtPa(e.chamberPressure), 'input');
        put('cstar', perf.cstar, `${perf.cstar.toFixed(0)} m/s`, 'derived');
        const cfVac = perf.thrustVac / (e.chamberPressure * perf.throatArea);
        put('cf', cfVac, cfVac.toFixed(2), 'derived');
        put('at', perf.throatArea, `${(perf.throatArea * 1e4).toFixed(1)} cm²`, 'derived');
        put('exitDiameter', perf.exitDiameter, `${perf.exitDiameter.toFixed(2)} m`, 'derived');
        put('gamma', perf.gamma, perf.gamma.toFixed(2), 'derived');
        put('tc', perf.chamberTemp, `${perf.chamberTemp.toFixed(0)} K`, 'derived');
        const rspec = 8314.462 / perf.molarMass;
        put('rspec', rspec, `${rspec.toFixed(0)} J/kg·K`, 'derived');
        const g = perf.gamma;
        const vdk = Math.sqrt(g) * Math.pow(2 / (g + 1), (g + 1) / (2 * (g - 1)));
        put('vdk', vdk, vdk.toFixed(3), 'derived');
        if (stage0.tanks) {
          const tank = sizeStageTanks(stage0, perf.feedPressure);
          const r = stage0.diameter / 2;
          put('meop', tank.meop, fmtPa(tank.meop), 'derived');
          put('radius', r, `${r.toFixed(2)} m`, 'derived');
          put('wall', tank.oxWall, `${(tank.oxWall * 1e3).toFixed(1)} mm`, 'result');
          put('stress', (tank.meop * r) / tank.oxWall, fmtPa((tank.meop * r) / tank.oxWall), 'result');
          put('heMass', tank.pressurantMass, fmtKg(tank.pressurantMass), 'result');
          const vol = (tank.pressurantMass * R_HELIUM * 250) / (1.6 * tank.meop);
          put('tankVolume', vol, `${vol.toFixed(1)} m³`, 'derived');
          put('rhe', R_HELIUM, '2077 J/kg·K', 'const');
          put('the', 250, '250 K', 'const');
        }
      } catch {
        /* engine outside the model's envelope — symbols render without values */
      }
    } else {
      try {
        const sp = evaluateSolid(stage0.propulsion.motor, stage0.diameter);
        put('isp', sp.ispVac, `${sp.ispVac.toFixed(0)} s`, 'result');
      } catch {
        /* ignore */
      }
    }
  }

  // Flight condition at max-Q — the sim is the truth, so ask it.
  try {
    const sim = simulateFlight(design, { weatherSeed: `${mission.id}:handbook` });
    const { table } = sim;
    let qi = 0;
    for (let i = 0; i < table.q.length; i++) if (table.q[i]! > table.q[qi]!) qi = i;
    const q = table.q[qi]!;
    if (q > 0) {
      const alt = table.altitude[qi]!;
      const rho = atmosphere(alt).density;
      const vAir = table.airspeed[qi]!;
      const drag = table.drag[qi]!;
      put('q', q, fmtPa(q), 'result');
      put('rho', rho, `${rho.toFixed(3)} kg/m³`, 'derived');
      put('airspeed', vAir, fmtSpeed(vAir), 'derived');
      put('dragForce', drag, `${(drag / 1e3).toFixed(1)} kN`, 'result');
      const area = V['refArea']?.value;
      if (area !== undefined && q * area > 0) {
        put('cd', drag / (q * area), (drag / (q * area)).toFixed(2), 'derived');
      }
    }
  } catch {
    /* sim rejected the design — q-family symbols render without values */
  }

  // Target-orbit values (vis-viva at the mission's altitude target).
  const rOrbit = R_EARTH + mission.altitudeTarget;
  put('mu', MU_EARTH, '3.99e14 m³/s²', 'const');
  put('orbitalRadius', rOrbit, fmtM(rOrbit), 'derived');
  put('sma', rOrbit, fmtM(rOrbit), 'derived');
  put('orbitalSpeed', Math.sqrt(MU_EARTH / rOrbit), fmtSpeed(Math.sqrt(MU_EARTH / rOrbit)), 'result');

  return V;
}

/** Wraps handbook pages: computes the frontier design's numbers once. */
export function HandbookProvider({ children }: { children: ReactNode }) {
  const campaign = useStore((s) => s.campaign);
  const designs = useStore((s) => s.designs);
  const mission = frontierMission(campaign) ?? MISSIONS[MISSIONS.length - 1]!;
  const stored = designs[mission.id];
  const values = useMemo(
    () => buildEqValues(stored ?? mission.preset(), mission),
    [stored, mission],
  );
  return <HandbookValuesContext.Provider value={values}>{children}</HandbookValuesContext.Provider>;
}
