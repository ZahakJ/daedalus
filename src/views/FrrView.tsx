/**
 * Flight Readiness Review: the go/no-go poll. A full-screen mono document of
 * REAL computed margins — structures, propulsion, recovery, range weather,
 * trajectory — each polled ● GO / ◐ MARGINAL / ● NO-GO. Marginal and no-go
 * lines demand an explicit waiver before the launch button arms; the waivers
 * ride along in the FlightRecord.
 */
import { useEffect, useMemo, useState } from 'react';
import { Hud } from '../components/Hud.tsx';
import { navigate } from '../router.ts';
import { revLetter, useStore } from '../store.ts';
import { missionById } from '../campaign/catalog.ts';
import type { FlightRecord, MissionId } from '../schema.ts';
import {
  FAILURES,
  P0,
  computeDerived,
  computeVehicleMass,
  designWarnings,
  simulateFlight,
  stabilityReport,
  structuralMargins,
  windProfile,
  type FlightResult,
  type RocketDesign,
} from '../physics/index.ts';
import { designDiff } from '../frr/diff.ts';
import { indexAt } from '../flight/sample.ts';
import { fmtSIUnit } from '../components/bureau/fmt.ts';

type RowStatus = 'go' | 'marginal' | 'nogo' | 'info';

interface FrrRow {
  id: string;
  metric: string;
  value: string;
  criterion: string;
  status: RowStatus;
  note?: string;
}

interface FrrSection {
  title: string;
  rows: FrrRow[];
}

const pct = (m: number): string => {
  const v = Math.abs(m * 100);
  if (m >= 0 && v > 999) return '> +999%';
  return `${m >= 0 ? '+' : '−'}${v.toFixed(0)}%`;
};

function buildSections(
  mission: NonNullable<ReturnType<typeof missionById>>,
  design: RocketDesign,
  seed: string,
  sim: FlightResult,
): FrrSection[] {
  const derived = computeDerived(design);
  const vm = computeVehicleMass(design);
  const stab = stabilityReport(design, 1);
  const sections: FrrSection[] = [];

  // ————— STRUCTURES —————
  const st: FrrRow[] = [];
  for (const m of structuralMargins(design)) {
    st.push({
      id: `str:${m.joint}:${m.phase}`,
      // 'max-q' is a physics load-case id; on the page it must read max-Q like
      // the predicted-max-Q row and the PRED. MAX-Q tile above it.
      metric: `${m.joint.replace('-', ' ')} · ${m.phase.replace(/max-q$/, 'max-Q')}`,
      value: pct(m.margin),
      criterion: '≥ +15%',
      status: m.margin < 0 ? 'nogo' : m.margin < 0.15 ? 'marginal' : 'go',
    });
  }
  st.push({
    id: 'str:maxq',
    metric: 'predicted max-Q',
    value: `${(sim.summary.maxQ.value / 1e3).toFixed(1)} kPa`,
    criterion: 'margins sized @ 35 kPa',
    status: 'info',
    note:
      sim.summary.maxQ.value > 35e3
        ? 'exceeds the sizing envelope — the wall margins above understate loads'
        : undefined,
  });
  if (design.fins && Number.isFinite(stab.flutterSpeed)) {
    // conservative check: SL flutter boundary vs peak airspeed in dense air
    const table = sim.table;
    let vMax = 0;
    for (let i = 0; i < table.t.length; i++) {
      if (table.altitude[i]! < 40e3) vMax = Math.max(vMax, table.airspeed[i]!);
    }
    const margin = stab.flutterSpeed / Math.max(1, vMax) - 1;
    st.push({
      id: 'str:flutter',
      metric: 'fin flutter boundary (SL)',
      value: `Vf ${stab.flutterSpeed.toFixed(0)} vs ${vMax.toFixed(0)} m/s`,
      criterion: '≥ +15%',
      status: margin < 0 ? 'nogo' : margin < 0.15 ? 'marginal' : 'go',
      note: 'boundary rises with altitude — sim is the truth',
    });
  }
  if (design.fins) {
    st.push({
      id: 'str:static-margin',
      metric: 'static margin (loaded)',
      value: `${stab.marginCalibers.toFixed(2)} cal`,
      criterion: '0.5 – 3.0 cal',
      status:
        stab.marginCalibers < 0.5
          ? 'nogo'
          : stab.marginCalibers < 1 || stab.marginCalibers > 3
            ? 'marginal'
            : 'go',
      note:
        stab.marginCalibers < 0.5
          ? 'CP ahead of CG under load — tumble off the rail predicted'
          : stab.marginCalibers < 1
            ? 'thin margin — CP walks forward transonic'
            : stab.marginCalibers > 3
              ? 'over-stable — will weathercock into wind'
              : undefined,
    });
  }
  sections.push({ title: 'STRUCTURES', rows: st });

  // ————— PROPULSION —————
  const pr: FrrRow[] = [];
  const twr0 = derived.stages[0]!.twrIgnition;
  pr.push({
    id: 'prop:twr',
    metric: 'liftoff thrust/weight',
    value: twr0.toFixed(2),
    criterion: '≥ 1.25',
    status: twr0 < 1.05 ? 'nogo' : twr0 < 1.25 ? 'marginal' : 'go',
    note: twr0 < 1.05 ? 'vehicle will crawl or sit burning on the pad' : undefined,
  });
  for (let i = 0; i < design.stages.length; i++) {
    const s = design.stages[i]!;
    if (s.propulsion.kind !== 'liquid') continue;
    const e = vm.stages[i]!.engine!;
    if (i === 0) {
      pr.push({
        id: `prop:sep:s${i}`,
        metric: `S${i + 1} nozzle exit pressure`,
        value: `pe ${(e.exitPressure / 1e3).toFixed(1)} kPa`,
        criterion: `≥ 0.35·p₀ (${((0.35 * P0) / 1e3).toFixed(1)} kPa)`,
        status: e.separationAtSL ? 'nogo' : 'go',
        note: e.separationAtSL ? 'Summerfield flow separation — side loads at ignition' : undefined,
      });
    }
    const sf = s.tanks?.safetyFactor ?? 0;
    pr.push({
      id: `prop:sf:s${i}`,
      metric: `S${i + 1} tank SF vs weld floor`,
      value: sf.toFixed(2),
      criterion: '≥ 1.15 floor · 1.25 gd',
      status: sf < 1.15 ? 'nogo' : sf < 1.25 ? 'marginal' : 'go',
      note: sf < 1.15 ? 'burst at pressurization predicted' : undefined,
    });
  }
  sections.push({ title: 'PROPULSION', rows: pr });

  // ————— RECOVERY —————
  if (design.recovery) {
    const rc: FrrRow[] = [];
    const deploy = sim.events.find((e) => e.id === 'chute-deploy');
    if (deploy) {
      const i = indexAt(sim.table, deploy.t);
      const q = sim.table.q[i]!;
      rc.push({
        id: 'rec:deploy-q',
        metric: 'dynamic pressure at deploy',
        value: `${(q / 1e3).toFixed(2)} kPa`,
        criterion: '≤ 1.20 kPa canopy limit',
        status: q > 1.2e3 ? 'nogo' : q > 0.9e3 ? 'marginal' : 'go',
        note: q > 1.2e3 ? 'canopy shreds — ballistic return' : undefined,
      });
    } else {
      rc.push({
        id: 'rec:deploy-q',
        metric: 'dynamic pressure at deploy',
        value: '—',
        criterion: '≤ 1.20 kPa canopy limit',
        status: 'nogo',
        note: 'no deployment in predicted trajectory',
      });
    }
    rc.push({
      id: 'rec:mode',
      metric: 'deployment mode',
      value:
        design.recovery.deploy === 'apogee'
          ? 'apogee'
          : `${fmtSIUnit(design.recovery.deploy.altitude, 'm')} desc.`,
      criterion: `${design.recovery.chuteArea.toFixed(1)} m² canopy`,
      status: 'info',
    });
    sections.push({ title: 'RECOVERY', rows: rc });
  }

  // ————— RANGE (the launch-day weather the crew is committing to) —————
  const wind = windProfile(seed);
  // The anemometer reading, not the integrated field: speedAt() deliberately
  // ramps the surface layer in over ~200 m so RK4 can see it (see wind.ts).
  const v10 = wind.surfaceWind;
  const vJet = wind.speedAt(10e3);
  const rg: FrrRow[] = [];
  rg.push({
    id: 'range:pad-wind',
    metric: 'pad wind @ 10 m',
    value: `${Math.abs(v10).toFixed(1)} m/s ${v10 >= 0 ? 'tail' : 'head'}`,
    criterion: '≤ 8 m/s',
    status: Math.abs(v10) > 8 ? 'nogo' : Math.abs(v10) > 5 ? 'marginal' : 'go',
  });
  rg.push({
    id: 'range:jet',
    metric: 'jet stream @ 10 km',
    value: `${Math.abs(vJet).toFixed(1)} m/s ${vJet >= 0 ? 'tail' : 'head'}`,
    criterion: '≤ 12 m/s',
    status: Math.abs(vJet) > 12 ? 'nogo' : Math.abs(vJet) > 9 ? 'marginal' : 'go',
    note: 'max-Q AoA driver',
  });
  if (design.launch.railLength > 0 && Number.isFinite(stab.railExitSpeed)) {
    rg.push({
      id: 'range:rail-exit',
      metric: `rail exit speed (${design.launch.railLength.toFixed(0)} m rail)`,
      value: `${stab.railExitSpeed.toFixed(1)} m/s`,
      criterion: '≥ 20 m/s',
      status: stab.railExitSpeed < 15 ? 'nogo' : stab.railExitSpeed < 20 ? 'marginal' : 'go',
      note: 'slow exit = wind owns the AoA',
    });
  }
  sections.push({ title: 'RANGE · WEATHER', rows: rg });

  // ————— TRAJECTORY —————
  const tj: FrrRow[] = [];
  tj.push({
    id: 'traj:dv',
    metric: 'Δv budget (vac, staged)',
    value: fmtSIUnit(derived.totalDeltaV, 'm/s'),
    criterion: 'mission profile',
    status: 'info',
  });
  for (const o of mission.objectives) {
    const res = o.evaluate(sim, design, derived);
    tj.push({
      id: `traj:obj:${o.id}`,
      // poll rows speak lowercase instrument voice; objective labels are
      // sentence-case for the campaign dossier, so lower just the first letter
      // (interior acronyms like AoA / SL survive).
      metric: o.label.charAt(0).toLowerCase() + o.label.slice(1),
      value: res.actual,
      criterion: res.target,
      status: res.pass ? 'go' : 'nogo',
    });
  }
  for (const f of sim.failures) {
    tj.push({
      id: `traj:failure:${f.id}`,
      metric: FAILURES[f.id]?.title ?? f.id,
      value: `T+${f.t.toFixed(1)} s`,
      criterion: 'none predicted',
      status: f.severity === 'warning' ? 'marginal' : 'nogo',
      note: f.detail,
    });
  }
  sections.push({ title: 'TRAJECTORY · SIMULATION', rows: tj });

  return sections;
}

const STATUS_META: Record<RowStatus, { glyph: string; label: string; cls: string }> = {
  go: { glyph: '●', label: 'GO', cls: 'frr-status--go' },
  marginal: { glyph: '◐', label: 'MARGINAL', cls: 'frr-status--marginal' },
  nogo: { glyph: '●', label: 'NO-GO', cls: 'frr-status--nogo' },
  info: { glyph: '·', label: 'NOTED', cls: 'frr-status--info' },
};

const COUNT_CHIPS = ['STRUCT', 'PROP', 'RANGE', 'RECOV', 'GNC', 'WX'];

export function FrrView({ missionId }: { missionId: string }) {
  const mission = missionById(missionId);
  const mid = missionId as MissionId;
  const stored = useStore((s) => s.designs[mid]);
  const revisions = useStore((s) => s.revisions);
  const commitLaunch = useStore((s) => s.commitLaunch);
  const [waived, setWaived] = useState<ReadonlySet<string>>(() => new Set<string>());
  const [count, setCount] = useState<number | null>(null);

  const design = useMemo(() => stored ?? mission?.preset() ?? null, [stored, mission]);
  const rev = revLetter(revisions, mid);
  const seed = `${missionId}:${rev}`;

  const data = useMemo(() => {
    if (!mission || !design) return null;
    const sim = simulateFlight(design, { weatherSeed: seed });
    return {
      sim,
      derived: computeDerived(design),
      warnings: designWarnings(design),
      sections: buildSections(mission, design, seed, sim),
    };
  }, [mission, design, seed]);

  // countdown driver
  useEffect(() => {
    if (count === null) return;
    if (count < 0) {
      navigate({ view: 'flight', missionId });
      return;
    }
    const id = setTimeout(() => setCount((c) => (c === null ? null : c - 1)), 330);
    return () => clearTimeout(id);
  }, [count, missionId]);

  if (!mission || !design || !data) {
    return (
      <Hud sub="flight readiness review">
        <div className="frr-root" />
      </Hud>
    );
  }

  const waivable = data.sections.flatMap((s) =>
    s.rows.filter((r) => r.status === 'marginal' || r.status === 'nogo'),
  );
  const waivedCount = waivable.filter((r) => waived.has(r.id)).length;
  const armed = waivedCount === waivable.length;
  const prevDesign = revisions[mid]?.[revisions[mid]!.length - 1]?.design;
  const diff = designDiff(prevDesign, design);
  const nogoCount = waivable.filter((r) => r.status === 'nogo').length;

  const toggleWaive = (id: string): void => {
    setWaived((prev) => {
      const nextSet = new Set(prev);
      if (nextSet.has(id)) nextSet.delete(id);
      else nextSet.add(id);
      return nextSet;
    });
  };

  const commit = (): void => {
    const record: FlightRecord = {
      rev,
      seed,
      design,
      at: new Date().toISOString(),
      outcome: data.sim.summary.outcome,
      apogee: data.sim.summary.apogee,
      maxQ: data.sim.summary.maxQ.value,
      failureIds: data.sim.failures.map((f) => f.id),
      waivedRisks: [...waived],
      diff,
    };
    commitLaunch(mid, record);
    setCount(10);
  };

  const today = new Date().toISOString().slice(0, 10);

  return (
    <Hud
      sub={`flight readiness review · ${mission.title.toLowerCase()}`}
      bar={
        <span className="frr-bar__poll mono">
          POLL · {waivable.length - waivedCount} OPEN · {nogoCount} NO-GO
        </span>
      }
    >
      <div className="frr-root">
        <div className="frr-doc mono">
          {/* ————— letterhead ————— */}
          <header className="frr-head">
            <div className="frr-head__left">
              <div className="frr-head__title">FLIGHT READINESS REVIEW</div>
              <div className="frr-head__sub">
                DAEDALUS PROGRAM · MISSION {String(mission.index + 1).padStart(2, '0')} —{' '}
                {mission.title.toUpperCase()}
              </div>
              <div className="frr-head__sub frr-head__sub--dim">
                VEHICLE {design.name || 'UNNAMED'} · REV {rev} · {diff.toUpperCase()}
              </div>
            </div>
            <div className="frr-head__right">
              <div>
                DOC{' '}
                <span>
                  FRR-{String(mission.index + 1).padStart(2, '0')}-{rev}
                </span>
              </div>
              <div>
                DATE <span>{today}</span>
              </div>
              <div>
                WX SEED <span>{seed}</span>
              </div>
            </div>
          </header>

          {/* ————— vehicle summary strip ————— */}
          <div className="frr-stats">
            <div className="frr-stat">
              <span className="frr-stat__label">GLOW</span>
              <span className="frr-stat__value">
                {data.derived.glow >= 1e3
                  ? `${(data.derived.glow / 1e3).toFixed(1)} t`
                  : `${data.derived.glow.toFixed(0)} kg`}
              </span>
            </div>
            <div className="frr-stat">
              <span className="frr-stat__label">Δv TOTAL</span>
              <span className="frr-stat__value">{fmtSIUnit(data.derived.totalDeltaV, 'm/s')}</span>
            </div>
            <div className="frr-stat">
              <span className="frr-stat__label">PRED. APOGEE</span>
              <span className="frr-stat__value">{fmtSIUnit(data.sim.summary.apogee, 'm')}</span>
            </div>
            <div className="frr-stat">
              <span className="frr-stat__label">PRED. MAX-Q</span>
              <span className="frr-stat__value">
                {(data.sim.summary.maxQ.value / 1e3).toFixed(1)} kPa
              </span>
            </div>
            <div className="frr-stat">
              <span className="frr-stat__label">DESIGN FLAGS</span>
              <span className="frr-stat__value">
                {data.warnings.length === 0 ? 'NONE' : data.warnings.length}
              </span>
            </div>
          </div>

          {/* ————— go/no-go poll ————— */}
          <div className="frr-poll-title">GO / NO-GO POLL — ALL SYSTEMS</div>
          {data.sections.map((sec) => (
            <section className="frr-section" key={sec.title}>
              <div className="frr-section__title">{sec.title}</div>
              {sec.rows.map((row) => {
                const meta = STATUS_META[row.status];
                const isWaived = waived.has(row.id);
                const needsWaiver = row.status === 'marginal' || row.status === 'nogo';
                return (
                  <div className={`frr-row${isWaived ? ' frr-row--waived' : ''}`} key={row.id}>
                    <span className={`frr-status ${meta.cls}`}>
                      <span className="frr-status__glyph">{meta.glyph}</span> {meta.label}
                    </span>
                    <span className="frr-row__metric">
                      {row.metric}
                      {row.note && <span className="frr-row__note">{row.note}</span>}
                    </span>
                    <span className="frr-row__value">{row.value}</span>
                    <span className="frr-row__criterion">{row.criterion}</span>
                    <span className="frr-row__action">
                      {needsWaiver &&
                        (isWaived ? (
                          <button
                            className="frr-waive frr-waive--on"
                            onClick={() => toggleWaive(row.id)}
                          >
                            RISK ACCEPTED ✓
                          </button>
                        ) : (
                          <button
                            className={`frr-waive${row.status === 'nogo' ? ' frr-waive--nogo' : ''}`}
                            onClick={() => toggleWaive(row.id)}
                          >
                            {row.status === 'nogo' ? 'ACCEPT ANYWAY' : 'ACCEPT RISK'}
                          </button>
                        ))}
                    </span>
                  </div>
                );
              })}
            </section>
          ))}

          {/* ————— sign-off ————— */}
          <footer className="frr-foot">
            <button className="ms-btn" onClick={() => navigate({ view: 'bureau', missionId })}>
              ← HOLD · BACK TO BUREAU
            </button>
            <span className="frr-foot__ledger">
              {waivable.length === 0
                ? 'ALL SYSTEMS GO — RANGE IS CLEAR'
                : `${waivedCount}/${waivable.length} RISKS ACCEPTED${armed ? ' — RANGE IS CLEAR' : ''}`}
            </span>
            <button
              className="ms-btn ms-btn--primary frr-commit"
              disabled={!armed}
              title={armed ? 'freeze the design and fly it' : 'waive every open risk line first'}
              onClick={commit}
            >
              COMMIT TO LAUNCH
            </button>
          </footer>
        </div>
      </div>

      {/* ————— terminal count overlay ————— */}
      {count !== null && (
        <div className="frr-count" onClick={() => navigate({ view: 'flight', missionId })}>
          <div className="frr-count__label mono">TERMINAL COUNT — AUTO SEQUENCE START</div>
          <div className="frr-count__t mono">T−{String(Math.max(0, count)).padStart(2, '0')}</div>
          <div className="frr-count__chips">
            {COUNT_CHIPS.map((c, i) => (
              <span
                key={c}
                className="frr-count__chip mono"
                style={{ animationDelay: `${0.25 + i * 0.42}s` }}
              >
                {c}
              </span>
            ))}
          </div>
          <div className="frr-count__skip mono">click to skip</div>
        </div>
      )}
    </Hud>
  );
}
