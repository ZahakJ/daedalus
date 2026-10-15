/**
 * The decision-card registry. Each entry
 * turns (design, derived, stability, warnings, preview) into DecisionCard
 * props: a control wired through update.ts, a live equation with correct
 * roles, a margin line judged from real numbers, a tradeoff bar, and a blunt
 * why. Cards are gated by featureAvailable() and collapse to inherited rows
 * two missions after their feature is introduced.
 */
import type { ReactNode } from 'react';
import type {
  DerivedPerformance,
  DesignFlag,
  EngineCycle,
  EngineDesign,
  EnginePerformance,
  FlightResult,
  LiquidPropellantId,
  MaterialId,
  NoseShape,
  RocketDesign,
  StabilityReport,
  StageDesign,
  StagePerf,
  ThrustProfile,
  VehicleMass,
} from '../physics/index.ts';
import {
  atmosphere,
  evaluateEngine,
  G0,
  MU_EARTH,
  OMEGA_EARTH,
  P0,
  R_EARTH,
  RESTARTS_ALLOWED,
  material,
  sizeStageTanks,
} from '../physics/index.ts';
import { bulkDensity, combustionState, cstarIdeal, propellantDensities } from '../physics/propulsion/propellants.ts';
import { boiloffRate } from '../physics/tanks.ts';
import { radToDeg, degToRad } from '../physics/units.ts';
import { EQUATIONS } from '../eq/specs/index.ts';
import type { EqSpec, EqValue, EqValues } from '../eq/types.ts';
import { Seg, Slider } from '../components/controls.tsx';
import { clamp01, fmtKm, fmtMass, fmtN, fmtPa, fmtSpeed } from '../components/bureau/fmt.ts';
import type { DecisionCardProps, MarginStatus } from '../components/DecisionCard.tsx';
import { MISSIONS } from '../campaign/catalog.ts';
import { featureAvailable } from '../campaign/unlocks.ts';
import type { Feature, Mission } from '../campaign/types.ts';
import {
  patchEngine,
  patchFins,
  patchGuidance,
  patchLaunch,
  patchRecovery,
  patchSolid,
  patchStage,
  patchTanks,
  setNoseBallast,
  setStagePropellant,
} from './update.ts';

// ————— context —————

export interface CardCtx {
  mission: Mission;
  design: RocketDesign;
  derived: DerivedPerformance;
  vm: VehicleMass;
  stability: StabilityReport;
  warnings: DesignFlag[];
  preview: FlightResult | null;
  setDesign: (d: RocketDesign) => void;
}

interface BuiltCard {
  partId?: string;
  lessonId: string;
  control: ReactNode;
  equation?: { spec: EqSpec; values: EqValues };
  margin?: DecisionCardProps['margin'];
  tradeoff?: DecisionCardProps['tradeoff'];
  why: string;
  /** One-line mono summary shown when the card is mastered + collapsed. */
  summary: string;
}

interface CardDef {
  /** Stable id other modules (the debrief) cite instead of a DC-NN code. */
  id: string;
  /** Card heading; with the registry position, the single source of the DC-NN label. */
  title: string;
  feature: Feature;
  group: string;
  build(ctx: CardCtx): BuiltCard | null;
}

// ————— formatting (display edge only) —————

const V = (value: number, text: string, role: EqValue['role']): EqValue => ({ value, text, role });

// ————— shared sub-controls —————

function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" className={`bu-toggle ms-toggle${on ? ' ms-toggle--on' : ''}`} onClick={() => onChange(!on)}>
      <span className="ms-toggle__track">
        <span className="ms-toggle__thumb" />
      </span>
      <span>{label}</span>
    </button>
  );
}

function KV({ k, v, status }: { k: string; v: string; status?: MarginStatus }) {
  return (
    <div className="bu-kv">
      <span className="bu-kv__k">{k}</span>
      <span className="bu-kv__v mono" style={status ? { color: `var(--${status})` } : undefined}>
        {v}
      </span>
    </div>
  );
}

// ————— shared evaluators —————

/** Crude mission Δv requirement for margin lines — the sim is the truth. */
export function dvRequirement(m: Mission): number {
  if (m.id === 'gravity-turn') return 9300;
  if (m.id === 'every-kilogram') return 9400;
  if (m.id === 'high-energy') return 11_700;
  return Math.sqrt(2 * G0 * m.altitudeTarget) * 1.35;
}

function liquid0(ctx: CardCtx): { stage: StageDesign; engine: EngineDesign; perf: EnginePerformance } | null {
  const s = ctx.design.stages[0];
  if (!s || s.propulsion.kind !== 'liquid') return null;
  const perf = ctx.vm.stages[0]?.engine;
  if (!perf) return null;
  return { stage: s, engine: s.propulsion.engine, perf };
}

function maxAirspeed(preview: FlightResult | null): number {
  if (!preview) return NaN;
  let v = 0;
  const a = preview.table.airspeed;
  for (let i = 0; i < a.length; i++) if (a[i]! > v) v = a[i]!;
  return v;
}

/** Max-Q verdict: danger only when the sim actually breaks something; the
    35 kPa program envelope is a guideline, not a wall. */
export function maxQStatus(preview: FlightResult | null): MarginStatus {
  if (!preview) return 'ok';
  const broke = preview.failures.some((f) => f.id === 'maxq-structural' || f.id === 'fin-flutter');
  if (broke) return 'danger';
  return preview.summary.maxQ.value > 35e3 ? 'warn' : 'ok';
}

function maxQMargin(ctx: CardCtx): DecisionCardProps['margin'] {
  const q = ctx.preview?.summary.maxQ.value;
  if (q === undefined) return { label: 'max-Q', text: 'sim pending…', status: 'ok' };
  return {
    label: 'max-Q',
    text: `${(q / 1e3).toFixed(1)} kPa / 35 kPa guideline`,
    status: maxQStatus(ctx.preview),
  };
}

const smStatus = (sm: number): MarginStatus =>
  sm >= 1 && sm <= 2 ? 'ok' : sm >= 0.5 && sm <= 3 ? 'warn' : 'danger';

function tsiolkovskyValues(sp: StagePerf, input: 'm0' | 'mf' | 'none' = 'm0'): EqValues {
  const ve = sp.ispVac * G0;
  return {
    dv: V(sp.deltaV, fmtSpeed(sp.deltaV), 'result'),
    ve: V(ve, fmtSpeed(ve), 'derived'),
    m0: V(sp.ignitionMass, fmtMass(sp.ignitionMass), input === 'm0' ? 'input' : 'derived'),
    mf: V(sp.burnoutMass, fmtMass(sp.burnoutMass), input === 'mf' ? 'input' : 'derived'),
  };
}

function staticMarginValues(ctx: CardCtx, input: 'cp' | 'cg'): EqValues {
  const st = ctx.stability;
  const d = ctx.design.stages[0]!.diameter;
  return {
    staticMargin: V(st.marginCalibers, `${st.marginCalibers.toFixed(2)} cal`, 'result'),
    cp: V(st.cp, `${st.cp.toFixed(2)} m`, input === 'cp' ? 'input' : 'derived'),
    cg: V(st.cg, `${st.cg.toFixed(2)} m`, input === 'cg' ? 'input' : 'derived'),
    diameter: V(d, `${d.toFixed(2)} m`, 'derived'),
  };
}

/** Vandenkerckhove function Γ(γ). */
const vdk = (g: number): number => Math.sqrt(g) * Math.pow(2 / (g + 1), (g + 1) / (2 * (g - 1)));

const MR_RANGE: Record<LiquidPropellantId, [number, number]> = {
  'lox-rp1': [1.8, 3.2],
  'lox-ch4': [2.6, 4.2],
  'lox-lh2': [4.5, 7.0],
  'nto-mmh': [1.4, 2.6],
};
const MR_DEFAULT: Record<LiquidPropellantId, number> = {
  'lox-rp1': 2.3,
  'lox-ch4': 3.6,
  'lox-lh2': 5.8,
  'nto-mmh': 1.9,
};

function cstarPeakMr(prop: LiquidPropellantId, pc: number): { mr: number; cstar: number } {
  const [lo, hi] = MR_RANGE[prop];
  let best = lo;
  let bestC = 0;
  for (let k = 0; k <= 40; k++) {
    const mr = lo + ((hi - lo) * k) / 40;
    const c = cstarIdeal(combustionState(prop, mr, pc));
    if (c > bestC) {
      bestC = c;
      best = mr;
    }
  }
  return { mr: best, cstar: bestC };
}

const CYCLE_LABEL: Record<EngineCycle, string> = {
  'pressure-fed': 'PRESS-FED',
  'gas-generator': 'GAS-GEN',
  'electric-pump': 'E-PUMP',
  'staged-combustion': 'STAGED',
};

// ————— the registry —————

const P = 'PROPULSION';
const STG = 'STAGING';
const STR = 'STRUCTURES';
const AER = 'AERO & STABILITY';
const REC = 'RECOVERY';
const GDN = 'GUIDANCE & LAUNCH';
const PRG = 'PROGRAM';

export const GROUP_ORDER = [P, STG, STR, AER, REC, GDN, PRG];

const CARD_DEFS = [
  // —— DC-01 MOTOR SELECT (fixed catalog solids, M1 only) ——
  {
    id: 'motor-select',
    title: 'MOTOR SELECT',
    feature: 'fixed-motors',
    group: P,
    build(ctx) {
      const s0 = ctx.design.stages[0];
      if (!s0 || s0.propulsion.kind !== 'solid') return null;
      if (featureAvailable('solid-designer', ctx.mission.id)) return null;
      const motor = s0.propulsion.motor;
      const sizes = [
        { id: 'S' as const, label: 'S · 4 kg', mp: 4, tb: 3 },
        { id: 'M' as const, label: 'M · 6 kg', mp: 6, tb: 4 },
        { id: 'L' as const, label: 'L · 9 kg', mp: 9, tb: 5.5 },
      ];
      const current = sizes.reduce((a, b) =>
        Math.abs(b.mp - motor.propellantMass) < Math.abs(a.mp - motor.propellantMass) ? b : a,
      );
      const sp = ctx.derived.stages[0]!;
      const req = dvRequirement(ctx.mission);
      const dvStatus: MarginStatus = sp.deltaV >= req ? 'ok' : sp.deltaV >= 0.8 * req ? 'warn' : 'danger';
      return {
        partId: 's0-grain',
        lessonId: 'tsiolkovsky',
        control: (
          <div className="bu-controls">
            <Seg
              options={sizes.map((s) => ({ id: s.id, label: s.label }))}
              value={current.id}
              onChange={(id) => {
                const s = sizes.find((x) => x.id === id)!;
                ctx.setDesign(patchSolid(ctx.design, 0, { propellantMass: s.mp, burnTime: s.tb }));
              }}
            />
            <KV k="burn time" v={`${motor.burnTime.toFixed(1)} s`} />
          </div>
        ),
        equation: { spec: EQUATIONS['tsiolkovsky']!, values: tsiolkovskyValues(sp) },
        margin: { label: 'Δv', text: `${fmtSpeed(sp.deltaV)} / req ≈ ${fmtSpeed(req)}`, status: dvStatus },
        tradeoff: {
          left: { label: 'liftoff mass', value: fmtMass(ctx.derived.glow) },
          right: { label: 'Δv', value: fmtSpeed(sp.deltaV) },
          position: clamp01((motor.propellantMass - 4) / 5),
        },
        why: 'Bigger motors buy Δv, but every kilogram of grain must first lift itself. The ln() in Tsiolkovsky means the second half of the propellant buys less than the first.',
        summary: `${current.id} · ${motor.propellantMass.toFixed(0)} kg · Δv ${fmtSpeed(sp.deltaV)}`,
      };
    },
  },

  // —— DC-02 SOLID MOTOR (full grain design, M2+) ——
  {
    id: 'solid-motor',
    title: 'SOLID MOTOR',
    feature: 'solid-designer',
    group: P,
    build(ctx) {
      const s0 = ctx.design.stages[0];
      if (!s0 || s0.propulsion.kind !== 'solid') return null;
      const motor = s0.propulsion.motor;
      const solid = ctx.vm.stages[0]?.solid;
      const sp = ctx.derived.stages[0]!;
      return {
        partId: 's0-grain',
        lessonId: 'mass-fraction',
        control: (
          <div className="bu-controls">
            <Slider
              label="grain mass"
              value={motor.propellantMass}
              min={40}
              max={600}
              step={5}
              display={`${motor.propellantMass.toFixed(0)} kg`}
              onChange={(v) => ctx.setDesign(patchSolid(ctx.design, 0, { propellantMass: v }))}
            />
            <Slider
              label="burn time"
              value={motor.burnTime}
              min={5}
              max={40}
              step={0.5}
              display={`${motor.burnTime.toFixed(1)} s`}
              onChange={(v) => ctx.setDesign(patchSolid(ctx.design, 0, { burnTime: v }))}
            />
            <Seg
              options={(['progressive', 'neutral', 'regressive'] as ThrustProfile[]).map((p) => ({
                id: p,
                label: p.slice(0, 4).toUpperCase(),
              }))}
              value={motor.thrustProfile}
              onChange={(p) => ctx.setDesign(patchSolid(ctx.design, 0, { thrustProfile: p }))}
            />
          </div>
        ),
        equation: { spec: EQUATIONS['tsiolkovsky']!, values: tsiolkovskyValues(sp) },
        margin: maxQMargin(ctx),
        tradeoff: {
          left: { label: 'avg thrust', value: fmtN(solid ? solid.thrustAvg : sp.thrustSL) },
          right: { label: 'burn time', value: `${motor.burnTime.toFixed(1)} s` },
          position: clamp01((motor.burnTime - 5) / 35),
        },
        why: 'Total impulse is fixed by the grain; burn time decides where the violence happens. Short burns spike thrust and max-Q. Long burns hand the gain back to gravity.',
        summary: `${motor.propellantMass.toFixed(0)} kg / ${motor.burnTime.toFixed(0)} s ${motor.thrustProfile.slice(0, 4)}`,
      };
    },
  },

  // —— DC-03 CASE & NOZZLE (M2+) ——
  {
    id: 'case-nozzle',
    title: 'CASE & NOZZLE',
    feature: 'solid-designer',
    group: P,
    build(ctx) {
      const s0 = ctx.design.stages[0];
      if (!s0 || s0.propulsion.kind !== 'solid') return null;
      const motor = s0.propulsion.motor;
      const solid = ctx.vm.stages[0]?.solid;
      const sp = ctx.derived.stages[0]!;
      const mats: MaterialId[] = ['steel-4130', 'al-2219', 'ti-6al4v', 'cfrp'];
      const zeta = sp.propellantMassFraction;
      const zStatus: MarginStatus = zeta >= 0.78 ? 'ok' : zeta >= 0.7 ? 'warn' : 'danger';
      const stageM0 = sp.dryMass + sp.propellantMass;
      return {
        partId: 's0-engine0',
        lessonId: 'mass-fraction',
        control: (
          <div className="bu-controls">
            <Seg
              options={mats.map((m) => ({ id: m, label: material(m).name.split(' ')[0]!.toUpperCase() }))}
              value={motor.caseMaterial}
              onChange={(m) => ctx.setDesign(patchSolid(ctx.design, 0, { caseMaterial: m }))}
            />
            <Slider
              label="expansion ε"
              value={motor.expansionRatio}
              min={4}
              max={20}
              step={0.5}
              display={`ε ${motor.expansionRatio.toFixed(1)}`}
              onChange={(v) => ctx.setDesign(patchSolid(ctx.design, 0, { expansionRatio: v }))}
            />
          </div>
        ),
        equation: {
          spec: EQUATIONS['mass-fraction']!,
          values: {
            pmf: V(zeta, zeta.toFixed(3), 'result'),
            mp: V(sp.propellantMass, fmtMass(sp.propellantMass), 'derived'),
            m0: V(stageM0, fmtMass(stageM0), 'input'),
          },
        },
        margin: {
          label: 'mass fraction',
          text: `ζ ${zeta.toFixed(2)} · case ${fmtMass(solid?.caseMass ?? 0)}`,
          status: zStatus,
        },
        tradeoff: {
          left: { label: 'case mass', value: fmtMass(solid?.caseMass ?? 0) },
          right: { label: 'Isp vac', value: `${sp.ispVac.toFixed(0)} s` },
          position: clamp01((motor.expansionRatio - 4) / 16),
        },
        why: 'The case is a pressure vessel holding 9 MPa. Steel forgives; it also weighs. Above 100 km the mass fraction ζ is the whole game — case kilograms are Δv you never see.',
        summary: `${motor.caseMaterial} · ε ${motor.expansionRatio.toFixed(0)} · ζ ${zeta.toFixed(2)}`,
      };
    },
  },

  // —— DC-04 MIXTURE RATIO (M3+) ——
  {
    id: 'mixture-ratio',
    title: 'MIXTURE RATIO',
    feature: 'liquid-engine',
    group: P,
    build(ctx) {
      const l = liquid0(ctx);
      if (!l) return null;
      const { engine, perf } = l;
      const [lo, hi] = MR_RANGE[engine.propellant];
      const peak = cstarPeakMr(engine.propellant, engine.chamberPressure);
      const hereIdeal = cstarIdeal(combustionState(engine.propellant, engine.mixtureRatio, engine.chamberPressure));
      const offPeak = 1 - hereIdeal / peak.cstar;
      const rho = bulkDensity(engine.propellant, engine.mixtureRatio);
      const rspec = 8314.462 / perf.molarMass;
      return {
        partId: 's0-engine0',
        lessonId: 'mixture-ratio',
        control: (
          <div className="bu-controls">
            <Slider
              label="O/F ratio"
              value={engine.mixtureRatio}
              min={lo}
              max={hi}
              step={0.02}
              display={`MR ${engine.mixtureRatio.toFixed(2)}`}
              onChange={(v) => ctx.setDesign(patchEngine(ctx.design, 0, { mixtureRatio: v }))}
            />
          </div>
        ),
        equation: {
          spec: EQUATIONS['cstar']!,
          values: {
            cstar: V(perf.cstar, `${perf.cstar.toFixed(0)} m/s`, 'result'),
            gamma: V(perf.gamma, perf.gamma.toFixed(3), 'derived'),
            rspec: V(rspec, `${rspec.toFixed(0)} J/kg·K`, 'derived'),
            tc: V(perf.chamberTemp, `${perf.chamberTemp.toFixed(0)} K`, 'input'),
            vdk: V(vdk(perf.gamma), vdk(perf.gamma).toFixed(3), 'derived'),
          },
        },
        margin: {
          label: 'c* peak',
          text: `c* ${perf.cstar.toFixed(0)} m/s · peak near MR ${peak.mr.toFixed(2)}`,
          status: offPeak < 0.015 ? 'ok' : offPeak < 0.04 ? 'warn' : 'danger',
        },
        tradeoff: {
          left: { label: 'Isp vac', value: `${perf.ispVac.toFixed(1)} s` },
          right: { label: 'bulk ρ', value: `${rho.toFixed(0)} kg/m³` },
          position: clamp01((engine.mixtureRatio - lo) / (hi - lo)),
        },
        why: 'Stoichiometric burns hottest, but heavy molecules exhaust slow. Run fuel-rich: c* peaks where temperature and molar mass trade best. Chase the peak — it is the number.',
        summary: `MR ${engine.mixtureRatio.toFixed(2)} · c* ${perf.cstar.toFixed(0)}`,
      };
    },
  },

  // —— DC-05 CHAMBER PRESSURE (M3+) ——
  {
    id: 'chamber-pressure',
    title: 'CHAMBER PRESSURE',
    feature: 'liquid-engine',
    group: P,
    build(ctx) {
      const l = liquid0(ctx);
      if (!l) return null;
      const { engine, perf } = l;
      const tank = ctx.vm.stages[0]?.tank;
      const pf = engine.cycle === 'pressure-fed';
      const cfV = perf.thrustVac / (engine.chamberPressure * perf.throatArea);
      const status: MarginStatus = !pf ? 'ok' : engine.chamberPressure > 3.5e6 ? 'danger' : engine.chamberPressure > 2.2e6 ? 'warn' : 'ok';
      return {
        partId: 's0-engine0',
        lessonId: pf ? 'pressure-fed' : 'thrust-coefficient',
        control: (
          <div className="bu-controls">
            <Slider
              label="pc"
              value={engine.chamberPressure}
              min={0.7e6}
              max={25e6}
              step={5e4}
              log
              display={`${(engine.chamberPressure / 1e6).toFixed(2)} MPa`}
              onChange={(v) => ctx.setDesign(patchEngine(ctx.design, 0, { chamberPressure: v }))}
            />
          </div>
        ),
        equation: {
          spec: EQUATIONS['thrust']!,
          values: {
            thrust: V(perf.thrustVac, fmtN(perf.thrustVac), 'result'),
            cf: V(cfV, cfV.toFixed(3), 'derived'),
            pc: V(engine.chamberPressure, fmtPa(engine.chamberPressure), 'input'),
            at: V(perf.throatArea, `${(perf.throatArea * 1e4).toFixed(1)} cm²`, 'derived'),
          },
        },
        margin: {
          label: pf ? 'tank MEOP' : 'feed',
          text: pf ? `feed ${fmtPa(perf.feedPressure)} sizes the walls` : `pump inlet ${fmtPa(perf.feedPressure)}`,
          status,
        },
        tradeoff: {
          left: { label: 'tank mass', value: fmtMass(tank?.totalMass ?? 0) },
          right: { label: 'Isp vac', value: `${perf.ispVac.toFixed(1)} s` },
          position: clamp01(Math.log(engine.chamberPressure / 0.7e6) / Math.log(25 / 0.7)),
        },
        why: 'Higher pc shrinks the throat and deepens expansion — free Isp, until the plumbing pays. A pressure-fed tank must beat pc by 30%; wall mass follows. That spiral is why turbopumps exist.',
        summary: `pc ${(engine.chamberPressure / 1e6).toFixed(1)} MPa`,
      };
    },
  },

  // —— DC-06 NOZZLE EXPANSION (M3+) ——
  {
    id: 'nozzle-expansion',
    title: 'NOZZLE EXPANSION',
    feature: 'liquid-engine',
    group: P,
    build(ctx) {
      const l = liquid0(ctx);
      if (!l) return null;
      const { engine, perf } = l;
      const cfV = perf.thrustVac / (engine.chamberPressure * perf.throatArea);
      const sepFloor = 0.35 * P0;
      const status: MarginStatus = perf.separationAtSL ? 'danger' : perf.exitPressure < 0.5 * P0 ? 'warn' : 'ok';
      return {
        partId: 's0-engine0',
        lessonId: 'nozzle-expansion',
        control: (
          <div className="bu-controls">
            <Slider
              label="ε = Ae/At"
              value={engine.expansionRatio}
              min={2}
              max={120}
              step={1}
              log
              display={`ε ${engine.expansionRatio.toFixed(0)}`}
              onChange={(v) => ctx.setDesign(patchEngine(ctx.design, 0, { expansionRatio: v }))}
            />
          </div>
        ),
        equation: {
          spec: EQUATIONS['isp']!,
          values: {
            isp: V(perf.ispVac, `${perf.ispVac.toFixed(1)} s`, 'result'),
            cstar: V(perf.cstar, `${perf.cstar.toFixed(0)} m/s`, 'derived'),
            cf: V(cfV, cfV.toFixed(3), 'input'),
            g0: V(G0, '9.807', 'const'),
          },
        },
        margin: {
          label: 'separation',
          text: `pe ${fmtPa(perf.exitPressure)} / floor ${fmtPa(sepFloor)}`,
          status,
        },
        tradeoff: {
          left: { label: 'Isp SL', value: `${perf.ispSL.toFixed(1)} s` },
          right: { label: 'Isp vac', value: `${perf.ispVac.toFixed(1)} s` },
          position: clamp01(Math.log(engine.expansionRatio / 2) / Math.log(60)),
        },
        why: 'The bell trades pressure for velocity; area ratio buys vacuum Isp. Overexpand a sea-level nozzle past pe ≈ 0.35 atm and the flow separates — asymmetric side loads that break engines.',
        summary: `ε ${engine.expansionRatio.toFixed(0)} · Isp ${perf.ispSL.toFixed(0)}/${perf.ispVac.toFixed(0)} s`,
      };
    },
  },

  // —— DC-07 THRUST CLASS (M3+) ——
  {
    id: 'thrust-class',
    title: 'THRUST CLASS',
    feature: 'liquid-engine',
    group: P,
    build(ctx) {
      const l = liquid0(ctx);
      if (!l) return null;
      const { engine, perf } = l;
      const sp = ctx.derived.stages[0]!;
      const twr = sp.twrIgnition;
      const status: MarginStatus = twr < 1.05 ? 'danger' : twr < 1.25 ? 'warn' : 'ok';
      return {
        partId: 's0-engine0',
        lessonId: 'twr',
        control: (
          <div className="bu-controls">
            <Slider
              label="F vac /engine"
              value={engine.vacuumThrust}
              min={5e3}
              max={3e6}
              step={5e3}
              log
              display={fmtN(engine.vacuumThrust)}
              onChange={(v) => ctx.setDesign(patchEngine(ctx.design, 0, { vacuumThrust: v }))}
            />
          </div>
        ),
        equation: {
          spec: EQUATIONS['twr']!,
          values: {
            twr: V(twr, twr.toFixed(2), 'result'),
            thrust: V(sp.thrustSL, fmtN(sp.thrustSL), 'input'),
            m0: V(ctx.derived.glow, fmtMass(ctx.derived.glow), 'derived'),
            g0: V(G0, '9.807', 'const'),
          },
        },
        margin: {
          label: 'liftoff T/W',
          text: `${twr.toFixed(2)} (guideline ≥ 1.25)`,
          status,
        },
        tradeoff: {
          left: { label: 'engine mass', value: fmtMass(perf.engineMass * engine.count) },
          right: { label: 'T/W', value: twr.toFixed(2) },
          position: clamp01((twr - 0.8) / 1.4),
        },
        why: 'T/W 1.0 hovers, burning propellant to stand still. Gravity loss is g·sin γ integrated over the burn — thrust shortens the bill, but the engine and its structure grow with the class.',
        summary: `${fmtN(engine.vacuumThrust)} · T/W ${twr.toFixed(2)}`,
      };
    },
  },

  // —— DC-08 ENGINE CYCLE (M4+) ——
  {
    id: 'engine-cycle',
    title: 'ENGINE CYCLE',
    feature: 'pump-cycles',
    group: P,
    build(ctx) {
      const l = liquid0(ctx);
      if (!l) return null;
      const { stage, engine, perf } = l;
      const propMass = stage.propulsion.kind === 'liquid' ? stage.propulsion.propellantMass : 0;
      const cycles: EngineCycle[] = ['pressure-fed', 'gas-generator', 'electric-pump'];
      if (featureAvailable('staged-combustion', ctx.mission.id)) cycles.push('staged-combustion');
      // evaluateEngine per cycle for the annotation table — cheap, pure.
      return {
        partId: 's0-engine0',
        lessonId: 'engine-cycles',
        control: (
          <div className="bu-cycles">
            <div className="bu-cycles__head">
              <span>cycle</span>
              <span>meop</span>
              <span>engine</span>
              <span>isp</span>
              <span>batt</span>
            </div>
            {cycles.map((c) => {
              const p = evalCycle(engine, c, propMass);
              const active = c === engine.cycle;
              return (
                <button
                  key={c}
                  type="button"
                  className={`bu-cycles__row${active ? ' bu-cycles__row--active' : ''}`}
                  onClick={() => ctx.setDesign(patchEngine(ctx.design, 0, { cycle: c }))}
                >
                  <span className="bu-cycles__name">{CYCLE_LABEL[c]}</span>
                  <span className="mono">{fmtPa(Math.max(p.feedPressure, 0.25e6))}</span>
                  <span className="mono">{fmtMass(p.engineMass)}</span>
                  <span className="mono">{p.ispVac.toFixed(0)} s</span>
                  <span className="mono">{p.batteryMass > 0 ? fmtMass(p.batteryMass) : '—'}</span>
                </button>
              );
            })}
          </div>
        ),
        margin: {
          label: 'cycle',
          text: `${CYCLE_LABEL[engine.cycle]} · restarts ${RESTARTS_ALLOWED[engine.cycle] ?? 0}`,
          status: engine.cycle === 'pressure-fed' && perf.feedPressure > 2e6 ? 'warn' : 'ok',
        },
        why: 'The pump moves the pressure problem from tank walls to a machine. Gas-generator dumps ~2% of flow overboard as turbine exhaust; electric pumps carry their power as battery. Nothing is free.',
        summary: CYCLE_LABEL[engine.cycle],
      };
    },
  },

  // —— DC-09 HIGH-ENERGY UPPER STAGE (M8) ——
  {
    id: 'upper-stage-propellant',
    title: 'UPPER-STAGE PROPELLANT',
    feature: 'lh2-restart',
    group: P,
    build(ctx) {
      const n = ctx.design.stages.length;
      if (n < 2) return null;
      const i = n - 1;
      const s = ctx.design.stages[i]!;
      if (s.propulsion.kind !== 'liquid' || !s.tanks) return null;
      const engine = s.propulsion.engine;
      const perf = ctx.vm.stages[i]?.engine;
      const isLh2 = engine.propellant === 'lox-lh2';
      const fuelMass = s.propulsion.propellantMass / (1 + engine.mixtureRatio);
      const boilPerHour = isLh2 ? boiloffRate(fuelMass, s.tanks.insulated) * 3600 : 0;
      const props: Array<{ id: LiquidPropellantId; label: string }> = [
        { id: 'lox-rp1', label: 'RP-1' },
        { id: 'lox-ch4', label: 'CH₄' },
        { id: 'lox-lh2', label: 'LH₂' },
      ];
      const status: MarginStatus = isLh2 && !s.tanks.insulated ? 'danger' : 'ok';
      return {
        partId: `s${i}-fuel`,
        lessonId: 'high-energy-propellant',
        control: (
          <div className="bu-controls">
            <Seg
              options={props}
              value={engine.propellant}
              onChange={(p) =>
                ctx.setDesign(patchEngine(ctx.design, i, { propellant: p, mixtureRatio: MR_DEFAULT[p] }))
              }
            />
            <Toggle
              label="cryo insulation"
              on={s.tanks.insulated}
              onChange={(v) => ctx.setDesign(patchTanks(ctx.design, i, { insulated: v }))}
            />
            {isLh2 && <KV k="boiloff" v={`${boilPerHour.toFixed(1)} kg/h`} status={status} />}
          </div>
        ),
        margin: {
          label: 'Isp vac',
          text: `${(perf?.ispVac ?? 0).toFixed(0)} s · ${isLh2 ? `boiloff ${boilPerHour.toFixed(1)} kg/h` : 'storable-adjacent'}`,
          status,
        },
        tradeoff: {
          left: { label: 'bulk ρ', value: `${bulkDensity(engine.propellant, engine.mixtureRatio).toFixed(0)} kg/m³` },
          right: { label: 'Isp vac', value: `${(perf?.ispVac ?? 0).toFixed(0)} s` },
          position: engine.propellant === 'lox-lh2' ? 1 : engine.propellant === 'lox-ch4' ? 0.55 : 0.2,
        },
        why: 'Hydrogen buys 450 s and charges you everywhere else: balloon tanks, mandatory insulation, and a propellant that leaves while you coast. High energy is a schedule problem.',
        summary: `${engine.propellant.toUpperCase()} · ${s.tanks.insulated ? 'insulated' : 'bare'}`,
      };
    },
  },

  // —— DC-10 STAGE 1 · BOOST (M5+) ——
  {
    id: 'stage-1-boost',
    title: 'STAGE 1 · BOOST',
    feature: 'staging',
    group: STG,
    build(ctx) {
      if (ctx.design.stages.length < 2) return null;
      const s = ctx.design.stages[0]!;
      if (s.propulsion.kind !== 'liquid') return null;
      const sp = ctx.derived.stages[0]!;
      const total = ctx.derived.totalDeltaV;
      const req = dvRequirement(ctx.mission);
      const status: MarginStatus = total >= req ? 'ok' : total >= 0.85 * req ? 'warn' : 'danger';
      return {
        partId: 's0-ox',
        lessonId: 'delta-v-split',
        control: (
          <div className="bu-controls">
            <Slider
              label="propellant"
              value={s.propulsion.propellantMass}
              min={2000}
              max={80_000}
              step={100}
              log
              display={fmtMass(s.propulsion.propellantMass)}
              onChange={(v) => ctx.setDesign(setStagePropellant(ctx.design, 0, v))}
            />
            <Slider
              label="diameter"
              value={s.diameter}
              min={0.8}
              max={3.6}
              step={0.05}
              display={`${s.diameter.toFixed(2)} m`}
              onChange={(v) => ctx.setDesign(patchStage(ctx.design, 0, { diameter: v }))}
            />
            <Slider
              label="interstage"
              value={s.interstageLength}
              min={0.5}
              max={3}
              step={0.1}
              display={`${s.interstageLength.toFixed(1)} m`}
              onChange={(v) => ctx.setDesign(patchStage(ctx.design, 0, { interstageLength: v }))}
            />
            <Slider
              label="sep delay"
              value={s.separationDelay}
              min={0}
              max={10}
              step={0.5}
              display={`${s.separationDelay.toFixed(1)} s`}
              onChange={(v) => ctx.setDesign(patchStage(ctx.design, 0, { separationDelay: v }))}
            />
          </div>
        ),
        equation: { spec: EQUATIONS['tsiolkovsky']!, values: tsiolkovskyValues(sp) },
        margin: {
          label: 'Δv split',
          text: `S1 ${fmtSpeed(sp.deltaV)} · Σ ${fmtSpeed(total)} / req ≈ ${fmtSpeed(req)}`,
          status,
        },
        tradeoff: {
          left: { label: 'S1 share', value: fmtSpeed(sp.deltaV) },
          right: { label: 'S2 share', value: fmtSpeed(total - sp.deltaV) },
          position: clamp01(sp.deltaV / Math.max(1, total)),
        },
        why: 'The booster fights gravity and drag through the soup — give it thrust and mass fraction, then throw it away at speed. Staging is the only honest answer to the log.',
        summary: `${fmtMass(s.propulsion.propellantMass)} · Δv ${fmtSpeed(sp.deltaV)}`,
      };
    },
  },

  // —— DC-11 STAGE 2 · UPPER (M5+) ——
  {
    id: 'stage-2-upper',
    title: 'STAGE 2 · UPPER',
    feature: 'staging',
    group: STG,
    build(ctx) {
      if (ctx.design.stages.length < 2) return null;
      const s = ctx.design.stages[1]!;
      if (s.propulsion.kind !== 'liquid') return null;
      const sp = ctx.derived.stages[1]!;
      const total = ctx.derived.totalDeltaV;
      const req = dvRequirement(ctx.mission);
      const status: MarginStatus = total >= req ? 'ok' : total >= 0.85 * req ? 'warn' : 'danger';
      return {
        partId: 's1-ox',
        lessonId: 'delta-v-split',
        control: (
          <div className="bu-controls">
            <Slider
              label="propellant"
              value={s.propulsion.propellantMass}
              min={400}
              max={20_000}
              step={50}
              log
              display={fmtMass(s.propulsion.propellantMass)}
              onChange={(v) => ctx.setDesign(setStagePropellant(ctx.design, 1, v))}
            />
            <Slider
              label="diameter"
              value={s.diameter}
              min={0.8}
              max={3.6}
              step={0.05}
              display={`${s.diameter.toFixed(2)} m`}
              onChange={(v) => ctx.setDesign(patchStage(ctx.design, 1, { diameter: v }))}
            />
            <Slider
              label="ign delay"
              value={s.ignitionDelay}
              min={0}
              max={15}
              step={0.5}
              display={`${s.ignitionDelay.toFixed(1)} s`}
              onChange={(v) => ctx.setDesign(patchStage(ctx.design, 1, { ignitionDelay: v }))}
            />
          </div>
        ),
        equation: { spec: EQUATIONS['tsiolkovsky']!, values: tsiolkovskyValues(sp) },
        margin: {
          label: 'Δv split',
          text: `S2 ${fmtSpeed(sp.deltaV)} · Σ ${fmtSpeed(total)} / req ≈ ${fmtSpeed(req)}`,
          status,
        },
        tradeoff: {
          left: { label: 'S2 dry', value: fmtMass(sp.dryMass) },
          right: { label: 'S2 Δv', value: fmtSpeed(sp.deltaV) },
          position: clamp01(sp.deltaV / Math.max(1, total)),
        },
        why: 'The upper stage flies in vacuum on a big bell. Every kilogram here rode stage one the whole way up — its dry mass is the most expensive mass on the vehicle.',
        summary: `${fmtMass(s.propulsion.propellantMass)} · Δv ${fmtSpeed(sp.deltaV)}`,
      };
    },
  },

  // —— DC-12 TANK STRUCTURE (M3+) ——
  {
    id: 'tank-structure',
    title: 'TANK STRUCTURE',
    feature: 'tank-design',
    group: STR,
    build(ctx) {
      const s0 = ctx.design.stages[0];
      if (!s0 || s0.propulsion.kind !== 'liquid' || !s0.tanks) return null;
      const tanks = s0.tanks;
      const tank = ctx.vm.stages[0]?.tank;
      if (!tank) return null;
      const r = s0.diameter / 2;
      const stress = (tank.meop * r) / tank.oxWall;
      const adv = featureAvailable('advanced-materials', ctx.mission.id);
      const mats: Array<{ id: MaterialId; label: string; disabled?: boolean; title?: string }> = [
        { id: 'al-2219', label: 'AL-2219' },
        { id: 'ss-304l', label: '304L' },
        ...(adv
          ? [
              { id: 'al-li-2195' as MaterialId, label: 'AL-LI' },
              { id: 'ss-301fh' as MaterialId, label: '301FH' },
            ]
          : []),
      ];
      const sf = tanks.safetyFactor;
      const status: MarginStatus = sf < 1.15 ? 'danger' : sf < 1.25 ? 'warn' : 'ok';
      const shellMass = tank.oxMass + tank.fuelMass;
      return {
        partId: 's0-ox',
        lessonId: 'hoop-stress',
        control: (
          <div className="bu-controls">
            <Seg options={mats} value={tanks.material} onChange={(m) => ctx.setDesign(patchTanks(ctx.design, 0, { material: m }))} />
            <Slider
              label="safety factor"
              value={sf}
              min={1.1}
              max={2.5}
              step={0.01}
              display={`SF ${sf.toFixed(2)}`}
              onChange={(v) => ctx.setDesign(patchTanks(ctx.design, 0, { safetyFactor: v }))}
            />
          </div>
        ),
        equation: {
          spec: EQUATIONS['hoop-stress']!,
          values: {
            stress: V(stress, fmtPa(stress), 'result'),
            meop: V(tank.meop, fmtPa(tank.meop), 'derived'),
            radius: V(r, `${r.toFixed(2)} m`, 'derived'),
            wall: V(tank.oxWall, `${(tank.oxWall * 1e3).toFixed(2)} mm`, 'input'),
          },
        },
        margin: {
          label: 'safety factor',
          text: `SF ${sf.toFixed(2)} / 1.15 weld floor · burst ${fmtPa(tank.burstPressure)}`,
          status,
        },
        tradeoff: {
          left: { label: 'shell mass', value: fmtMass(shellMass) },
          right: { label: 'margin', value: `SF ${sf.toFixed(2)}` },
          position: clamp01((sf - 1.1) / 1.4),
        },
        why: 'Thinner walls save mass; the tank is also 4 atmospheres trying to become a bomb. σ = p·r/t decides who wins — below SF 1.15 the weld seams stop forgiving you.',
        summary: `${tanks.material} · SF ${sf.toFixed(2)}`,
      };
    },
  },

  // —— DC-13 PRESSURANT (M3+) ——
  {
    id: 'pressurant',
    title: 'PRESSURANT',
    feature: 'tank-design',
    group: STR,
    build(ctx) {
      const s0 = ctx.design.stages[0];
      if (!s0 || s0.propulsion.kind !== 'liquid' || !s0.tanks) return null;
      const tank = ctx.vm.stages[0]?.tank;
      if (!tank) return null;
      const engine = s0.propulsion.engine;
      const dens = propellantDensities(engine.propellant);
      const mr = engine.mixtureRatio;
      const mp = s0.propulsion.propellantMass;
      const vol = ((mp * mr) / (1 + mr) / dens.ox + mp / (1 + mr) / dens.fuel) * 1.04;
      const heSystem = tank.pressurantMass + tank.copvMass;
      const frac = heSystem / Math.max(1, ctx.derived.stages[0]!.dryMass);
      return {
        partId: 's0-ox',
        lessonId: 'pressure-fed',
        control: (
          <div className="bu-controls">
            <KV k="helium" v={fmtMass(tank.pressurantMass)} />
            <KV k="COPV" v={fmtMass(tank.copvMass)} />
            <KV k="tank MEOP" v={fmtPa(tank.meop)} />
          </div>
        ),
        equation: {
          spec: EQUATIONS['pressurant']!,
          values: {
            heMass: V(tank.pressurantMass, fmtMass(tank.pressurantMass), 'result'),
            meop: V(tank.meop, fmtPa(tank.meop), 'input'),
            tankVolume: V(vol, `${vol.toFixed(2)} m³`, 'derived'),
            rhe: V(2077, '2077 J/kg·K', 'const'),
            the: V(250, '250 K', 'const'),
          },
        },
        margin: {
          label: 'He system',
          text: `${fmtMass(heSystem)} · ${(frac * 100).toFixed(0)}% of stage dry`,
          status: frac > 0.2 ? 'warn' : 'ok',
        },
        why: 'Helium does the pushing: MEOP times volume over RT, then a COPV to store it at 310 bar. Pressure-fed pays this twice — heavy walls AND heavy gas. Watch the fraction.',
        summary: `He+COPV ${fmtMass(heSystem)}`,
      };
    },
  },

  // —— DC-14 COMMON BULKHEAD (M7+) ——
  {
    id: 'common-bulkhead',
    title: 'COMMON BULKHEAD',
    feature: 'advanced-materials',
    group: STR,
    build(ctx) {
      const s0 = ctx.design.stages[0];
      if (!s0 || s0.propulsion.kind !== 'liquid' || !s0.tanks) return null;
      const feed = ctx.vm.stages[0]?.engine?.feedPressure ?? 0.25e6;
      const on = sizeStageTanks({ ...s0, tanks: { ...s0.tanks, commonBulkhead: true } }, feed).totalMass;
      const off = sizeStageTanks({ ...s0, tanks: { ...s0.tanks, commonBulkhead: false } }, feed).totalMass;
      const credit = off - on;
      const thermal = ctx.warnings.find((w) => w.id === 'cb-thermal-s0');
      return {
        partId: 's0-ox',
        lessonId: 'common-bulkhead',
        control: (
          <div className="bu-controls">
            <Toggle
              label="merge inter-propellant domes"
              on={s0.tanks.commonBulkhead}
              onChange={(v) => ctx.setDesign(patchTanks(ctx.design, 0, { commonBulkhead: v }))}
            />
            <KV k="mass credit" v={`−${fmtMass(credit)}`} />
            {thermal && <KV k="thermal" v="cryo short across dome" status="warn" />}
          </div>
        ),
        margin: {
          label: 'credit',
          text: s0.tanks.commonBulkhead ? `−${fmtMass(credit)} taken · +30 cu manufacturing` : `−${fmtMass(credit)} available`,
          status: thermal ? 'warn' : 'ok',
        },
        why: 'Merge the domes: one dome pair and the intertank vanish — tonnes on a big stage. The price is a cryo joint, manufacturing hell in the weld, and one wall between mixing propellants.',
        summary: s0.tanks.commonBulkhead ? `merged · −${fmtMass(credit)}` : 'separate domes',
      };
    },
  },

  // —— DC-15 FINS (M1+) ——
  {
    id: 'fins',
    title: 'FINS',
    feature: 'fins',
    group: AER,
    build(ctx) {
      const fins = ctx.design.fins;
      if (!fins) return null;
      const sm = ctx.stability.marginCalibers;
      return {
        partId: 'fin-r',
        lessonId: 'static-stability',
        control: (
          <div className="bu-controls">
            <Slider
              label="span"
              value={fins.span}
              min={0.05}
              max={0.6}
              step={0.005}
              display={`${(fins.span * 100).toFixed(1)} cm`}
              onChange={(v) => ctx.setDesign(patchFins(ctx.design, { span: v }))}
            />
            <Slider
              label="root chord"
              value={fins.rootChord}
              min={0.1}
              max={1.2}
              step={0.01}
              display={`${(fins.rootChord * 100).toFixed(0)} cm`}
              onChange={(v) => ctx.setDesign(patchFins(ctx.design, { rootChord: v, tipChord: v * 0.45 }))}
            />
            <Slider
              label="thickness"
              value={fins.thickness}
              min={0.002}
              max={0.02}
              step={0.0005}
              display={`${(fins.thickness * 1e3).toFixed(1)} mm`}
              onChange={(v) => ctx.setDesign(patchFins(ctx.design, { thickness: v }))}
            />
          </div>
        ),
        equation: { spec: EQUATIONS['static-margin']!, values: staticMarginValues(ctx, 'cp') },
        margin: {
          label: 'static margin',
          text: `${sm.toFixed(2)} cal / band 1–2 cal`,
          status: smStatus(sm),
        },
        tradeoff: {
          left: { label: 'fin mass', value: fmtMass(ctx.vm.finsMass) },
          right: { label: 'SM', value: `${sm.toFixed(2)} cal` },
          position: clamp01(sm / 3),
        },
        why: 'Fins drag the center of pressure aft of the CG so the airstream corrects instead of amplifies. Under 1 caliber it tumbles; past 3 it weathercocks into every gust.',
        summary: `${fins.count}× ${(fins.span * 100).toFixed(0)} cm · SM ${sm.toFixed(1)} cal`,
      };
    },
  },

  // —— DC-16 FIN STOCK (M2+) ——
  {
    id: 'fin-stock',
    title: 'FIN STOCK',
    feature: 'airframe-material',
    group: AER,
    build(ctx) {
      const fins = ctx.design.fins;
      if (!fins) return null;
      const vf = ctx.stability.flutterSpeed;
      const vmax = maxAirspeed(ctx.preview);
      const status: MarginStatus = !Number.isFinite(vmax)
        ? 'ok'
        : vf > 1.25 * vmax
          ? 'ok'
          : vf > vmax
            ? 'warn'
            : 'danger';
      const mats: MaterialId[] = ['cfrp', 'al-2219', 'ti-6al4v', 'steel-4130'];
      return {
        partId: 'fin-r',
        lessonId: 'fin-flutter',
        control: (
          <div className="bu-controls">
            <Seg
              options={mats.map((m) => ({ id: m, label: material(m).name.split(' ')[0]!.toUpperCase() }))}
              value={fins.material}
              onChange={(m) => ctx.setDesign(patchFins(ctx.design, { material: m }))}
            />
            <Slider
              label="thickness"
              value={fins.thickness}
              min={0.002}
              max={0.02}
              step={0.0005}
              display={`${(fins.thickness * 1e3).toFixed(1)} mm`}
              onChange={(v) => ctx.setDesign(patchFins(ctx.design, { thickness: v }))}
            />
          </div>
        ),
        margin: {
          label: 'flutter',
          text: Number.isFinite(vmax)
            ? `Vf ${vf.toFixed(0)} / Vmax ${vmax.toFixed(0)} m/s`
            : `Vf ${vf.toFixed(0)} m/s · sim pending`,
          status,
        },
        tradeoff: {
          left: { label: 'fin mass', value: fmtMass(ctx.vm.finsMass) },
          right: { label: 'Vf', value: `${vf.toFixed(0)} m/s` },
          position: Number.isFinite(vmax) ? clamp01(vf / (2 * vmax)) : 0.5,
        },
        why: 'Flutter is aeroelastic resonance: the fin bends, the load flips, the bend feeds back until the fin leaves. The boundary scales with thickness cubed — 2 mm of plate beats any alloy swap.',
        summary: `${fins.material} · ${(fins.thickness * 1e3).toFixed(0)} mm · Vf ${vf.toFixed(0)}`,
      };
    },
  },

  // —— DC-17 NOSE (M1+) ——
  {
    id: 'nose-profile',
    title: 'NOSE PROFILE',
    feature: 'nose-shape',
    group: AER,
    build(ctx) {
      const d = ctx.design;
      const top = d.stages[d.stages.length - 1]!;
      const shapes: Array<{ id: NoseShape; label: string }> = [
        { id: 'conical', label: 'CONE' },
        { id: 'ogive', label: 'OGIVE' },
        { id: 'von-karman', label: 'VON KÁRMÁN' },
      ];
      const cdBase: Record<NoseShape, number> = { conical: 0.58, ogive: 0.48, 'von-karman': 0.42 };
      const cd = cdBase[d.noseShape] * (1 + (4 - d.noseFineness) * 0.04);
      const q = ctx.preview?.summary.maxQ.value ?? 0.5 * 1.225 * 100 * 100;
      const refArea = Math.PI * (top.diameter / 2) ** 2;
      const drag = q * cd * refArea;
      const noseMass = ctx.vm.upperDry - d.payloadMass - (d.noseBallast ?? 0) - (d.recovery ? d.recovery.chuteArea * 0.12 + 1.5 : 0);
      return {
        partId: 'nose',
        lessonId: 'drag',
        control: (
          <div className="bu-controls">
            <Seg options={shapes} value={d.noseShape} onChange={(s) => ctx.setDesign({ ...d, noseShape: s })} />
            <Slider
              label="fineness L/D"
              value={d.noseFineness}
              min={1.5}
              max={7}
              step={0.25}
              display={`${d.noseFineness.toFixed(2)}`}
              onChange={(v) => ctx.setDesign({ ...d, noseFineness: v })}
            />
          </div>
        ),
        equation: {
          spec: EQUATIONS['drag']!,
          values: {
            dragForce: V(drag, fmtN(drag), 'result'),
            q: V(q, fmtPa(q), 'derived'),
            cd: V(cd, `≈${cd.toFixed(2)}`, 'input'),
            refArea: V(refArea, `${refArea.toFixed(3)} m²`, 'derived'),
          },
        },
        margin: {
          label: 'drag @ max-Q',
          text: `≈${fmtN(drag)} on ${fmtMass(noseMass)} of shell`,
          status: 'ok',
        },
        tradeoff: {
          left: { label: 'nose mass', value: fmtMass(noseMass) },
          right: { label: 'CD', value: `≈${cd.toFixed(2)}` },
          position: clamp01((d.noseFineness - 1.5) / 5.5),
        },
        why: "Blunt noses shove air; long noses weigh. Von Kármán's profile is the calculus answer — least drag for the volume. Past fineness ~5 you buy grams of drag with kilograms of shell.",
        summary: `${d.noseShape} · L/D ${d.noseFineness.toFixed(1)}`,
      };
    },
  },

  // —— DC-18 NOSE BALLAST (M1+, sounding vehicles) ——
  {
    id: 'nose-ballast',
    title: 'NOSE BALLAST',
    feature: 'fins',
    group: AER,
    build(ctx) {
      if (!ctx.design.fins) return null;
      const ballast = ctx.design.noseBallast ?? 0;
      const sm = ctx.stability.marginCalibers;
      return {
        partId: 'nose',
        lessonId: 'static-stability',
        control: (
          <div className="bu-controls">
            <Slider
              label="ballast"
              value={ballast}
              min={0}
              max={20}
              step={0.5}
              display={`${ballast.toFixed(1)} kg`}
              onChange={(v) => ctx.setDesign(setNoseBallast(ctx.design, v))}
            />
          </div>
        ),
        equation: { spec: EQUATIONS['static-margin']!, values: staticMarginValues(ctx, 'cg') },
        margin: {
          label: 'static margin',
          text: `${sm.toFixed(2)} cal / band 1–2 cal`,
          status: smStatus(sm),
        },
        tradeoff: {
          left: { label: 'dead mass', value: `${ballast.toFixed(1)} kg` },
          right: { label: 'SM', value: `${sm.toFixed(2)} cal` },
          position: clamp01(ballast / 20),
        },
        why: 'Lead in the nose buys nothing but geometry: CG forward, margin up, apogee down. The cheapest stability fix in the shop — and the most honest tax on it.',
        summary: `${ballast.toFixed(1)} kg forward`,
      };
    },
  },

  // —— DC-19 RECOVERY (M1+) ——
  {
    id: 'recovery',
    title: 'RECOVERY',
    feature: 'recovery',
    group: REC,
    build(ctx) {
      const rec = ctx.design.recovery;
      if (!rec) return null;
      const n = ctx.design.stages.length;
      const mLand = ctx.derived.stages[n - 1]!.burnoutMass;
      const vDescent = Math.sqrt((2 * mLand * G0) / (1.225 * 1.75 * rec.chuteArea));
      const status: MarginStatus = vDescent <= 8 ? 'ok' : vDescent <= 9.5 ? 'warn' : 'danger';
      const chuteMass = rec.chuteArea * 0.12 + 1.5;
      const deployId = rec.deploy === 'apogee' ? 'apogee' : 'altitude';
      return {
        partId: 'chute',
        lessonId: 'drag',
        control: (
          <div className="bu-controls">
            <Slider
              label="canopy area"
              value={rec.chuteArea}
              min={0.5}
              max={12}
              step={0.1}
              display={`${rec.chuteArea.toFixed(1)} m²`}
              onChange={(v) => ctx.setDesign(patchRecovery(ctx.design, { chuteArea: v }))}
            />
            <Seg
              options={[
                { id: 'apogee' as const, label: 'AT APOGEE' },
                { id: 'altitude' as const, label: '450 M AGL' },
              ]}
              value={deployId}
              onChange={(v) =>
                ctx.setDesign(patchRecovery(ctx.design, { deploy: v === 'apogee' ? 'apogee' : { altitude: 450 } }))
              }
            />
          </div>
        ),
        margin: {
          label: 'descent',
          text: `${vDescent.toFixed(1)} m/s / need ≤ 8 m/s`,
          status,
        },
        tradeoff: {
          left: { label: 'chute mass', value: fmtMass(chuteMass) },
          right: { label: 'touchdown', value: `${vDescent.toFixed(1)} m/s` },
          position: clamp01(vDescent / 16),
        },
        why: 'The canopy must shed the energy the motor bought. Touchdown speed scales with √(m/A): double the area, get only √2 slower. Deploy at apogee, where q is kindest to nylon.',
        summary: `${rec.chuteArea.toFixed(1)} m² · ${vDescent.toFixed(1)} m/s`,
      };
    },
  },

  // —— DC-20 LAUNCH RAIL (M1+, rail vehicles) ——
  {
    id: 'launch-rail',
    title: 'LAUNCH RAIL',
    feature: 'fixed-motors',
    group: GDN,
    build(ctx) {
      const L = ctx.design.launch.railLength;
      if (L <= 0) return null;
      const vExit = ctx.stability.railExitSpeed;
      const twr = ctx.derived.stages[0]!.twrIgnition;
      const status: MarginStatus = vExit >= 30 ? 'ok' : vExit >= 22 ? 'warn' : 'danger';
      return {
        lessonId: 'rail-exit',
        control: (
          <div className="bu-controls">
            <Slider
              label="rail length"
              value={L}
              min={3}
              max={30}
              step={0.5}
              display={`${L.toFixed(1)} m`}
              onChange={(v) => ctx.setDesign(patchLaunch(ctx.design, { railLength: v }))}
            />
          </div>
        ),
        equation: {
          spec: EQUATIONS['rail-exit']!,
          values: {
            railExit: V(vExit, `${vExit.toFixed(1)} m/s`, 'result'),
            twr: V(twr, twr.toFixed(2), 'derived'),
            g0: V(G0, '9.807', 'const'),
            railLength: V(L, `${L.toFixed(1)} m`, 'input'),
          },
        },
        margin: {
          label: 'rail exit',
          text: `${vExit.toFixed(1)} m/s / need ≥ 30 m/s`,
          status,
        },
        tradeoff: {
          left: { label: 'rail', value: `${L.toFixed(1)} m` },
          right: { label: 'exit speed', value: `${vExit.toFixed(1)} m/s` },
          position: clamp01((L - 3) / 27),
        },
        why: 'Fins are dead weight until air moves over them. The rail holds you straight while speed builds — leave it under 30 m/s and the first gust owns your trajectory.',
        summary: `${L.toFixed(0)} m · exit ${vExit.toFixed(0)} m/s`,
      };
    },
  },

  // —— DC-21 PITCH KICK (M5+) ——
  {
    id: 'pitch-kick',
    title: 'PITCH KICK',
    feature: 'pitch-kick',
    group: GDN,
    build(ctx) {
      const g = ctx.design.guidance;
      const angleDeg = radToDeg(g.pitchKick.angle);
      const atSpeed = g.pitchKick.atSpeed > 1e6 ? 50 : g.pitchKick.atSpeed;
      return {
        lessonId: 'pitch-kick',
        control: (
          <div className="bu-controls">
            <Slider
              label="kick angle"
              value={angleDeg}
              min={0}
              max={25}
              step={0.25}
              display={`${angleDeg.toFixed(2)}°`}
              onChange={(v) =>
                ctx.setDesign(
                  patchGuidance(ctx.design, {
                    pitchKick: { atSpeed, angle: degToRad(v) },
                    verticalUntilSpeed: atSpeed,
                  }),
                )
              }
            />
            <Slider
              label="at speed"
              value={atSpeed}
              min={20}
              max={120}
              step={1}
              display={`${atSpeed.toFixed(0)} m/s`}
              onChange={(v) =>
                ctx.setDesign(
                  patchGuidance(ctx.design, {
                    pitchKick: { atSpeed: v, angle: g.pitchKick.angle },
                    verticalUntilSpeed: v,
                  }),
                )
              }
            />
          </div>
        ),
        margin: maxQMargin(ctx),
        tradeoff: {
          left: { label: 'loft (steep)', value: `${angleDeg.toFixed(1)}°` },
          right: { label: 'downrange (flat)', value: fmtKm(ctx.preview?.summary.downrange ?? 0) },
          position: clamp01(angleDeg / 25),
        },
        why: 'The kick seeds the gravity turn: tip a few degrees early and let gravity steer from there. Too steep lofts and falls back; too flat bites at max-Q and never reaches orbital speed.',
        summary: `${angleDeg.toFixed(1)}° @ ${atSpeed.toFixed(0)} m/s`,
      };
    },
  },

  // —— DC-22 THROTTLE BUCKET (M4+) ——
  {
    id: 'throttle-bucket',
    title: 'THROTTLE BUCKET',
    feature: 'throttle-bucket',
    group: GDN,
    build(ctx) {
      const l = liquid0(ctx);
      if (!l) return null;
      const g = ctx.design.guidance;
      const b = g.throttleBucket;
      const floor = l.perf.throttleFloor;
      const q = ctx.preview?.summary.maxQ;
      const rho = q ? atmosphere(q.altitude).density : 0.4;
      const airspeed = q ? Math.sqrt((2 * q.value) / rho) : 0;
      return {
        lessonId: 'throttle-bucket',
        control: (
          <div className="bu-controls">
            <Seg
              options={[
                { id: 'off' as const, label: 'OFF' },
                { id: 'on' as const, label: 'ON' },
              ]}
              value={b ? 'on' : 'off'}
              onChange={(v) =>
                ctx.setDesign(
                  patchGuidance(ctx.design, {
                    throttleBucket: v === 'on' ? (b ?? { fromQ: 30e3, toQ: 25e3, level: Math.max(floor, 0.75) }) : undefined,
                  }),
                )
              }
            />
            {b && (
              <>
                <Slider
                  label="enter at q"
                  value={b.fromQ}
                  min={15e3}
                  max={45e3}
                  step={500}
                  display={`${(b.fromQ / 1e3).toFixed(1)} kPa`}
                  onChange={(v) => ctx.setDesign(patchGuidance(ctx.design, { throttleBucket: { ...b, fromQ: v } }))}
                />
                <Slider
                  label="exit at q"
                  value={b.toQ}
                  min={8e3}
                  max={40e3}
                  step={500}
                  display={`${(b.toQ / 1e3).toFixed(1)} kPa`}
                  onChange={(v) => ctx.setDesign(patchGuidance(ctx.design, { throttleBucket: { ...b, toQ: v } }))}
                />
                <Slider
                  label="level"
                  value={b.level}
                  min={floor}
                  max={1}
                  step={0.01}
                  display={`${(b.level * 100).toFixed(0)}%`}
                  onChange={(v) => ctx.setDesign(patchGuidance(ctx.design, { throttleBucket: { ...b, level: v } }))}
                />
              </>
            )}
          </div>
        ),
        equation: {
          spec: EQUATIONS['dynamic-pressure']!,
          values: {
            q: V(q?.value ?? NaN, q ? fmtPa(q.value) : '—', 'result'),
            rho: V(rho, `${rho.toFixed(3)} kg/m³`, 'derived'),
            airspeed: V(airspeed, `${airspeed.toFixed(0)} m/s`, 'derived'),
          },
        },
        margin: maxQMargin(ctx),
        tradeoff: {
          left: { label: 'gravity loss', value: b ? `+${((1 - b.level) * 8).toFixed(0)} s deep` : '0 s' },
          right: { label: 'max-Q', value: q ? fmtPa(q.value) : '—' },
          position: b ? clamp01((1 - b.level) / (1 - floor)) : 0,
        },
        why: 'Ease the throttle through the thickest air: q drops with v², so a brief deep bucket buys the airframe out of max-Q. You pay in gravity loss — seconds spent slower. Buy margin, not apogee.',
        summary: b ? `${(b.level * 100).toFixed(0)}% @ ${(b.fromQ / 1e3).toFixed(0)}→${(b.toQ / 1e3).toFixed(0)} kPa` : 'off',
      };
    },
  },

  // —— DC-23 ASCENT TARGET (M6+) ——
  {
    id: 'ascent-target',
    title: 'ASCENT TARGET',
    feature: 'guidance-full',
    group: GDN,
    build(ctx) {
      const g = ctx.design.guidance;
      const isApo = typeof g.cutoff === 'object';
      const target = isApo && typeof g.cutoff === 'object' ? g.cutoff.apoapsisTarget : ctx.mission.altitudeTarget;
      const rOrbit = R_EARTH + Math.min(target, 600e3);
      const vCirc = Math.sqrt(MU_EARTH / rOrbit);
      const o = ctx.preview?.orbit ?? null;
      const status: MarginStatus = o && o.periapsisAlt > 140e3 ? 'ok' : o && o.apoapsisAlt > 140e3 ? 'warn' : 'danger';
      return {
        lessonId: 'vis-viva',
        control: (
          <div className="bu-controls">
            <Seg
              options={[
                { id: 'depletion' as const, label: 'DEPLETION' },
                { id: 'apoapsis' as const, label: 'APOAPSIS' },
              ]}
              value={isApo ? 'apoapsis' : 'depletion'}
              onChange={(v) =>
                ctx.setDesign(
                  patchGuidance(ctx.design, {
                    cutoff: v === 'depletion' ? 'depletion' : { apoapsisTarget: target },
                  }),
                )
              }
            />
            {isApo && (
              <Slider
                label="target apo"
                value={target / 1e3}
                min={150}
                max={600}
                step={5}
                display={`${(target / 1e3).toFixed(0)} km`}
                onChange={(v) => ctx.setDesign(patchGuidance(ctx.design, { cutoff: { apoapsisTarget: v * 1e3 } }))}
              />
            )}
            <Toggle
              label="circularize at apoapsis"
              on={g.circularizeAtApoapsis === true}
              onChange={(v) => ctx.setDesign(patchGuidance(ctx.design, { circularizeAtApoapsis: v }))}
            />
          </div>
        ),
        equation: {
          spec: EQUATIONS['vis-viva']!,
          values: {
            orbitalSpeed: V(vCirc, fmtSpeed(vCirc), 'result'),
            mu: V(MU_EARTH, '3.99e14', 'const'),
            orbitalRadius: V(rOrbit, fmtKm(rOrbit), 'input'),
            sma: V(rOrbit, fmtKm(rOrbit), 'derived'),
          },
        },
        margin: {
          label: 'orbit',
          text: o
            ? `${fmtKm(o.periapsisAlt)} × ${fmtKm(o.apoapsisAlt)} · e ${o.eccentricity.toFixed(3)}`
            : 'no orbit — falls back',
          status,
        },
        why: "Orbit is a speed, not an altitude: vis-viva says 7.8 km/s at 200 km. Cut off on the target apoapsis, coast to the top, circularize there — the burn you skip falls back.",
        summary: isApo ? `apo ${(target / 1e3).toFixed(0)} km${g.circularizeAtApoapsis ? ' + circ' : ''}` : 'burn to depletion',
      };
    },
  },

  // —— DC-24 LAUNCH SITE (M6+) ——
  {
    id: 'launch-site',
    title: 'LAUNCH SITE',
    feature: 'guidance-full',
    group: GDN,
    build(ctx) {
      const latDeg = radToDeg(ctx.design.launch.latitude);
      const bonus = OMEGA_EARTH * R_EARTH * Math.cos(ctx.design.launch.latitude);
      return {
        lessonId: 'earth-rotation',
        control: (
          <div className="bu-controls">
            <Slider
              label="latitude"
              value={latDeg}
              min={0}
              max={60}
              step={0.5}
              display={`${latDeg.toFixed(1)}°N`}
              onChange={(v) => ctx.setDesign(patchLaunch(ctx.design, { latitude: degToRad(v) }))}
            />
            <KV k="ωE·R·cos φ" v={`+${bonus.toFixed(0)} m/s east`} />
          </div>
        ),
        margin: {
          label: 'rotation bonus',
          text: `${bonus.toFixed(0)} m/s of orbital speed, free`,
          status: 'ok',
        },
        tradeoff: {
          left: { label: 'equator', value: '+465 m/s' },
          right: { label: 'pole', value: '+0 m/s' },
          position: clamp01(latDeg / 60),
        },
        why: 'The planet spins you east at 465·cos(latitude) m/s before ignition. Launch low and Earth pays the first half-kilometer per second of your orbit. Range safety picks the rest.',
        summary: `${latDeg.toFixed(1)}°N · +${bonus.toFixed(0)} m/s`,
      };
    },
  },

  // —— DC-25 GTO INJECTION (M8) ——
  {
    id: 'gto-injection',
    title: 'GTO INJECTION',
    feature: 'lh2-restart',
    group: GDN,
    build(ctx) {
      const n = ctx.design.stages.length;
      const top = ctx.design.stages[n - 1]!;
      if (top.propulsion.kind !== 'liquid') return null;
      const g = ctx.design.guidance;
      const raiseKm = (g.raiseApoapsisTo ?? 35_786e3) / 1e3;
      const cycle = top.propulsion.engine.cycle;
      const restarts = RESTARTS_ALLOWED[cycle] ?? 0;
      const o = ctx.preview?.orbit ?? null;
      const status: MarginStatus =
        o && Math.abs(o.apoapsisAlt - 35_786e3) <= 2000e3 ? 'ok' : o && o.apoapsisAlt > 1000e3 ? 'warn' : 'danger';
      // Circularize + raise = 2 restarts after the ascent burn.
      const needed = g.circularizeAtApoapsis ? 2 : 1;
      return {
        lessonId: 'oberth',
        control: (
          <div className="bu-controls">
            <Toggle
              label="raise apoapsis after circularization"
              on={g.raiseApoapsisTo !== undefined}
              onChange={(v) =>
                ctx.setDesign(patchGuidance(ctx.design, { raiseApoapsisTo: v ? 35_786e3 : undefined }))
              }
            />
            {g.raiseApoapsisTo !== undefined && (
              <Slider
                label="target apo"
                value={raiseKm}
                min={5000}
                max={40_000}
                step={1}
                display={`${raiseKm.toFixed(0)} km`}
                onChange={(v) => ctx.setDesign(patchGuidance(ctx.design, { raiseApoapsisTo: v * 1e3 }))}
              />
            )}
            <KV
              k="restarts"
              v={`${CYCLE_LABEL[cycle]} allows ${restarts} · plan needs ${needed}`}
              status={restarts >= needed ? 'ok' : 'danger'}
            />
          </div>
        ),
        margin: {
          label: 'apoapsis',
          text: o ? `${fmtKm(o.apoapsisAlt)} / GTO 35786 ± 2000 km` : 'no orbit yet',
          status,
        },
        why: 'Burn again at perigee, where you are fastest: Oberth pays extra apoapsis for the same propellant. Your cycle must relight to collect — count the starts before you count the Δv.',
        summary: g.raiseApoapsisTo !== undefined ? `raise to ${raiseKm.toFixed(0)} km` : 'no injection burn',
      };
    },
  },

  // —— DC-26 PROGRAM COST (M7+) ——
  {
    id: 'program-cost',
    title: 'PROGRAM COST',
    feature: 'cost-readout',
    group: PRG,
    build(ctx) {
      const cost = ctx.derived.cost;
      const cap = ctx.mission.costCap;
      const status: MarginStatus = cap === undefined ? 'ok' : cost <= cap ? 'ok' : cost <= cap * 1.1 ? 'warn' : 'danger';
      return {
        lessonId: 'margin-cost-triangle',
        control: (
          <div className="bu-controls">
            <KV k="bill of materials" v={`${cost.toFixed(0)} cu`} status={status} />
            {cap !== undefined && <KV k="mission cap" v={`${cap.toFixed(0)} cu`} />}
          </div>
        ),
        margin: {
          label: 'cost',
          text: cap !== undefined ? `${cost.toFixed(0)} / cap ${cap.toFixed(0)} cu` : `${cost.toFixed(0)} cu`,
          status,
        },
        tradeoff:
          cap !== undefined
            ? {
                left: { label: 'spent', value: `${cost.toFixed(0)} cu` },
                right: { label: 'cap', value: `${cap.toFixed(0)} cu` },
                position: clamp01(cost / cap),
              }
            : undefined,
        why: 'Margin, mass, money — pick two, then pick again. Staged combustion buys Isp at 4× the engine cost; Al-Li buys mass fraction at 7× the sheet price. The cap decides which excellence you afford.',
        summary: cap !== undefined ? `${cost.toFixed(0)} / ${cap.toFixed(0)} cu` : `${cost.toFixed(0)} cu`,
      };
    },
  },
] as const satisfies readonly CardDef[];

export type CardId = (typeof CARD_DEFS)[number]['id'];

const cardCode = (idx: number): string => `DC-${String(idx + 1).padStart(2, '0')}`;

/** id → bureau code/title/label, derived from registry order — the one numbering. */
export const CARDS: Readonly<Record<CardId, { code: string; title: string; label: string }>> =
  Object.fromEntries(
    CARD_DEFS.map((def, idx) => {
      const code = cardCode(idx);
      return [def.id, { code, title: def.title, label: `${code} · ${def.title}` }];
    }),
  ) as Record<CardId, { code: string; title: string; label: string }>;

/** Per-cycle evaluation for the cycle table — pure, ~µs per call. */
function evalCycle(engine: EngineDesign, cycle: EngineCycle, propMass: number): EnginePerformance {
  return evaluateEngine({ ...engine, cycle }, propMass);
}

// ————— assembly —————

const FEATURE_INTRO = new Map<Feature, number>();
for (const m of MISSIONS) {
  for (const feat of m.newFeatures) if (!FEATURE_INTRO.has(feat)) FEATURE_INTRO.set(feat, m.index);
}

export interface BuiltGroup {
  name: string;
  cards: DecisionCardProps[];
}

/**
 * Build the mission's card list, grouped by subsystem. `expanded`/`toggle`
 * drive the mastered-card collapse (features introduced ≥2 missions ago).
 */
export function buildCards(
  ctx: CardCtx,
  expanded: Record<string, boolean>,
  toggle: (code: string) => void,
): BuiltGroup[] {
  const groups = new Map<string, DecisionCardProps[]>();
  CARD_DEFS.forEach((def: CardDef, idx) => {
    if (!featureAvailable(def.feature, ctx.mission.id)) return;
    const built = def.build(ctx);
    if (built === null) return;
    const code = cardCode(idx);
    const intro = FEATURE_INTRO.get(def.feature) ?? 0;
    const mastered = ctx.mission.index - intro >= 2;
    const props: DecisionCardProps = {
      code,
      title: def.title,
      lessonId: built.lessonId,
      control: built.control,
      why: built.why,
      ...(built.partId !== undefined ? { partId: built.partId } : {}),
      ...(built.equation !== undefined ? { equation: built.equation } : {}),
      ...(built.margin !== undefined ? { margin: built.margin } : {}),
      ...(built.tradeoff !== undefined ? { tradeoff: built.tradeoff } : {}),
      ...(mastered
        ? {
            inherited: {
              summary: built.summary,
              expanded: expanded[code] === true,
              onToggle: () => toggle(code),
            },
          }
        : {}),
    };
    const list = groups.get(def.group);
    if (list) list.push(props);
    else groups.set(def.group, [props]);
  });
  return GROUP_ORDER.filter((g) => groups.has(g)).map((name) => ({ name, cards: groups.get(name)! }));
}
