/**
 * The Design Bureau — the app's main workspace. Three-column instrument
 * layout: decision cards (left), the general-arrangement cutaway (center),
 * vehicle rollups + live trajectory preview (right). Tier-1 evaluators run
 * synchronously on every edit; the full trajectory sim runs in the worker on
 * a 60 ms debounce with a latest-wins protocol.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { Hud } from '../components/Hud.tsx';
import { DecisionCard } from '../components/DecisionCard.tsx';
import { Readout } from '../components/controls.tsx';
import { Blueprint } from '../blueprint/Blueprint.tsx';
import { computeBlueprint, type BlueprintInputs, type StageGeomInput } from '../blueprint/geometry.ts';
import {
  computeDerived,
  computeVehicleMass,
  designWarnings,
  stabilityReport,
  type DesignFlag,
  type RocketDesign,
} from '../physics/index.ts';
import { missionById } from '../campaign/catalog.ts';
import { featureAvailable } from '../campaign/unlocks.ts';
import type { MissionId } from '../schema.ts';
import { navigate } from '../router.ts';
import { revLetter, useStore } from '../store.ts';
import { requestPreview } from '../worker/simClient.ts';
import { buildCards, dvRequirement, maxQStatus, type CardCtx } from '../design/cards.tsx';
import { FlagStrip } from '../components/bureau/FlagStrip.tsx';
import { MassTree } from '../components/bureau/MassTree.tsx';
import { TrajectoryPreview } from '../components/bureau/TrajectoryPreview.tsx';
import { fmtMass } from '../components/bureau/fmt.ts';
import { ShareButton } from '../components/ShareButton.tsx';
import type { SharedContext } from './SharedView.tsx';

/** Map danger flags to the blueprint parts they condemn. */
function failingPartIds(flags: DesignFlag[], design: RocketDesign): Set<string> {
  const out = new Set<string>();
  for (const f of flags) {
    if (f.severity !== 'danger') continue;
    if (f.id === 'unstable' || f.id === 'over-stable') {
      out.add('fin-r');
      out.add('fin-l');
    } else if (f.id === 'twr-low') {
      out.add('s0-engine0');
    } else if (f.id.startsWith('flow-sep-s')) {
      out.add(`s${f.id.slice('flow-sep-s'.length)}-engine0`);
    } else if (f.id.startsWith('sf-low-s')) {
      const i = f.id.slice('sf-low-s'.length);
      out.add(`s${i}-ox`);
      out.add(`s${i}-fuel`);
    } else if (f.id.startsWith('lh2-insulation-s')) {
      out.add(`s${f.id.slice('lh2-insulation-s'.length)}-fuel`);
    } else if (f.id.startsWith('structure-stage')) {
      // structure-stage{N}-wall-{phase} → stage index N−1
      const m = /^structure-stage(\d+)-/.exec(f.id);
      if (m) {
        const i = Number(m[1]) - 1;
        const s = design.stages[i];
        if (s?.propulsion.kind === 'solid') out.add(`s${i}-grain`);
        else {
          out.add(`s${i}-ox`);
          out.add(`s${i}-fuel`);
        }
      }
    }
  }
  return out;
}

export function BureauView({
  missionId,
  shared,
}: {
  missionId: string;
  /** Read-only view of a design opened from a share link. */
  shared?: SharedContext & { design: RocketDesign; rev?: string };
}) {
  const mission = missionById(missionId);
  const mid = missionId as MissionId;

  const savedDesign = useStore((s) => s.designs[mid]);
  const setDesignLocal = useStore((s) => s.setDesign);
  const readOnly = shared !== undefined;
  const setDesignStore = useMemo(() => (readOnly ? () => {} : setDesignLocal), [readOnly, setDesignLocal]);
  const resetToPreset = useStore((s) => s.resetToPreset);
  const revisions = useStore((s) => s.revisions);
  const preview = useStore((s) => s.preview);
  const previewStale = useStore((s) => s.previewStale);
  const setPreview = useStore((s) => s.setPreview);

  const sharedDesign = shared?.design;
  const design = useMemo(
    () => sharedDesign ?? savedDesign ?? mission?.preset(),
    [sharedDesign, savedDesign, mission],
  );
  const rev = shared ? (shared.rev ?? 'A') : revLetter(revisions, mid);
  const seed = `${mid}:${rev}`;

  // Tier-1: sync evaluators on design identity.
  const derived = useMemo(() => (design ? computeDerived(design) : null), [design]);
  const vm = useMemo(() => (design ? computeVehicleMass(design) : null), [design]);
  const stability = useMemo(() => (design ? stabilityReport(design, 1) : null), [design]);
  const warnings = useMemo(() => (design ? designWarnings(design) : []), [design]);

  // Tier-2: worker sim, debounced, latest-wins. Stale is set by setDesign; a
  // mission change clears the previous mission's preview outright.
  useEffect(() => {
    setPreview(null, true);
  }, [mid, setPreview]);
  useEffect(() => {
    if (!design) return;
    let alive = true;
    const t = setTimeout(() => {
      void requestPreview(design, { weatherSeed: seed }).then((r) => {
        if (alive) setPreview(r, false);
      });
    }, 60);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [design, seed, setPreview]);

  // Blueprint geometry from the same mass model the physics uses.
  const geometry = useMemo(() => {
    if (!design || !vm || !stability) return null;
    const stages: StageGeomInput[] = design.stages.map((s, i) => {
      const bd = vm.stages[i];
      if (!bd) return {};
      if (s.propulsion.kind === 'liquid') {
        const e = bd.engine;
        return {
          ...(bd.tank ? { tank: bd.tank } : {}),
          ...(e
            ? {
                engine: {
                  throatDiameter: e.throatDiameter,
                  exitDiameter: e.exitDiameter,
                  nozzleLength: e.nozzleLength,
                  count: s.propulsion.engine.count,
                },
              }
            : {}),
        };
      }
      const sp = bd.solid;
      return sp
        ? { solid: { motorLength: sp.motorLength, exitDiameter: sp.exitDiameter, nozzleLength: sp.nozzleLength } }
        : {};
    });
    const inputs: BlueprintInputs = {
      design,
      stages,
      ...(design.fins ? { cg: stability.cg, cp: stability.cp } : {}),
    };
    return computeBlueprint(inputs);
  }, [design, vm, stability]);

  const failing = useMemo(() => (design ? failingPartIds(warnings, design) : new Set<string>()), [warnings, design]);

  // Decision cards.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const groups = useMemo(() => {
    if (!mission || !design || !derived || !vm || !stability) return [];
    const ctx: CardCtx = {
      mission,
      design,
      derived,
      vm,
      stability,
      warnings,
      preview,
      setDesign: (d) => setDesignStore(mid, d),
    };
    return buildCards(ctx, expanded, (code) => setExpanded((p) => ({ ...p, [code]: p[code] !== true })));
  }, [mission, design, derived, vm, stability, warnings, preview, expanded, mid, setDesignStore]);

  // Blueprint part click → scroll its card into view (and expand if mastered).
  const cardsRef = useRef<HTMLDivElement>(null);
  const partToCode = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of groups) {
      for (const c of g.cards) {
        if (c.partId !== undefined && !map.has(c.partId)) map.set(c.partId, c.code);
      }
    }
    const finR = map.get('fin-r');
    if (finR !== undefined) map.set('fin-l', finR);
    return map;
  }, [groups]);

  const onStageClick = (e: ReactMouseEvent) => {
    const el = (e.target as Element).closest('[data-part]');
    if (!el) return;
    const partId = el.getAttribute('data-part');
    const code = partId !== null ? partToCode.get(partId) : undefined;
    if (code === undefined) return;
    setExpanded((p) => ({ ...p, [code]: true }));
    requestAnimationFrame(() => {
      cardsRef.current
        ?.querySelector(`[data-card-slot="${code}"]`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  };

  if (!mission || !design || !derived || !vm || !stability || !geometry) {
    return (
      <Hud sub="design bureau">
        <div className="ms-empty" style={{ height: '100%' }}>
          <div className="ms-empty__title">UNKNOWN MISSION</div>
        </div>
      </Hud>
    );
  }

  const sp0 = derived.stages[0]!;
  const dvReq = dvRequirement(mission);
  const sm = stability.marginCalibers;
  const maxQ = preview?.summary.maxQ.value;
  const dangerCount = warnings.filter((w) => w.severity === 'danger').length;
  const warnCount = warnings.filter((w) => w.severity === 'warning').length;

  return (
    <Hud
      sub={`design bureau · ${mission.title}`}
      bar={
        <>
          <span className="bu-goal" title={mission.goal}>
            {mission.goal}
          </span>
          {shared ? (
            shared.bar
          ) : (
            <>
              <ShareButton missionId={mid} design={design} kind="design" />
              <button className="ms-btn ms-btn--ghost" onClick={() => resetToPreset(mid)}>
                reset to preset
              </button>
            </>
          )}
        </>
      }
      status={
        <>
          <span className={`ms-source ${previewStale ? 'ms-source--cache' : 'ms-source--live'}`}>
            <span className="ms-source__dot" />
            {previewStale ? 'sim · recomputing' : 'sim · current'}
          </span>
          <span>
            GLOW <b>{fmtMass(derived.glow)}</b>
          </span>
          <span>
            Δv <b>{(derived.totalDeltaV / 1000).toFixed(2)} km/s</b>
          </span>
          <span>
            T/W <b>{sp0.twrIgnition.toFixed(2)}</b>
          </span>
          <span>
            LOA <b>{geometry.totalLength.toFixed(2)} m</b>
          </span>
          <span className="ms-hud__spacer" />
          <span>
            findings{' '}
            <b style={{ color: dangerCount > 0 ? 'var(--danger)' : warnCount > 0 ? 'var(--warn)' : 'var(--ok)' }}>
              {dangerCount}D / {warnCount}W
            </b>
          </span>
        </>
      }
    >
      <div className="bu">
        {/* ————— left: decisions ————— */}
        <aside className="bu__cards" ref={cardsRef}>
          <FlagStrip flags={warnings} />
          <fieldset className="bu-ro" disabled={shared !== undefined}>
          {groups.map((g) => (
            <section key={g.name} className="bu-group">
              <h3 className="bu-group__head">
                <span className="bu-group__rule" />
                {g.name}
                <span className="bu-group__rule" />
              </h3>
              {g.cards.map((c) => (
                <div key={c.code} data-card-slot={c.code}>
                  <DecisionCard {...c} />
                </div>
              ))}
            </section>
          ))}
          </fieldset>
        </aside>

        {/* ————— center: the drawing ————— */}
        <main className="bu__stage" onClick={onStageClick}>
          <Blueprint
            geometry={geometry}
            failingParts={failing}
            title={{
              vehicle: design.name,
              mission: mission.title,
              rev,
              gross: fmtMass(derived.glow),
            }}
          />
        </main>

        {/* ————— right: rollups ————— */}
        <aside className="bu__rollup">
          <div className={`bu-panel bu-readouts${previewStale ? ' bu-stale-q' : ''}`}>
            <Readout label="GLOW" value={fmtMass(derived.glow)} bind="m0" accent />
            <Readout
              label={`Δv / req ${dvReq >= 1000 ? `${(dvReq / 1000).toFixed(1)} km/s` : `${dvReq.toFixed(0)} m/s`}`}
              value={(derived.totalDeltaV / 1000).toFixed(2)}
              unit="km/s"
              bind="dv"
              status={derived.totalDeltaV >= dvReq ? 'ok' : derived.totalDeltaV >= 0.85 * dvReq ? 'warn' : 'danger'}
            />
            <Readout
              label="T/W liftoff"
              value={sp0.twrIgnition.toFixed(2)}
              bind="twr"
              status={sp0.twrIgnition >= 1.25 ? 'ok' : sp0.twrIgnition >= 1.05 ? 'warn' : 'danger'}
            />
            <Readout label="Isp SL/vac" value={`${sp0.ispSL.toFixed(0)}/${sp0.ispVac.toFixed(0)}`} unit="s" bind="isp" />
            <Readout
              label="max-Q pred"
              value={maxQ !== undefined ? (maxQ / 1e3).toFixed(1) : '—'}
              unit="kPa"
              bind="q"
              status={maxQ === undefined ? undefined : maxQStatus(preview)}
            />
            {design.fins ? (
              <Readout
                label="static margin"
                value={sm.toFixed(2)}
                unit="cal"
                bind="staticMargin"
                status={sm >= 1 && sm <= 2 ? 'ok' : sm >= 0.5 && sm <= 3 ? 'warn' : 'danger'}
              />
            ) : featureAvailable('cost-readout', mid) ? (
              <Readout
                label="program cost"
                value={derived.cost.toFixed(0)}
                unit="cu"
                status={
                  mission.costCap === undefined
                    ? undefined
                    : derived.cost <= mission.costCap
                      ? 'ok'
                      : derived.cost <= mission.costCap * 1.1
                        ? 'warn'
                        : 'danger'
                }
              />
            ) : (
              <Readout label="payload" value={design.payloadMass.toFixed(0)} unit="kg" />
            )}
          </div>

          <div className="bu-panel bu-panel--flex">
            <div className="bu-panel__head">MASS BUDGET</div>
            <MassTree tree={derived.massTree} />
          </div>

          <div className="bu-panel">
            <div className="bu-panel__head">
              TRAJECTORY PREVIEW
              <span className="bu-panel__aux mono">{seed}</span>
            </div>
            <TrajectoryPreview
              preview={preview}
              stale={previewStale}
              mission={mission}
              design={design}
              derived={derived}
            />
          </div>

          {shared ? (
            <button
              className="ms-btn ms-btn--primary bu-frr"
              onClick={() => navigate({ view: 'shared', missionId: mid, kind: 'flight', payload: shared.payload })}
            >
              WATCH THIS DESIGN FLY →
            </button>
          ) : (
            <button
              className="ms-btn ms-btn--primary bu-frr"
              onClick={() => navigate({ view: 'frr', missionId: mid })}
            >
              FLIGHT READINESS · REV {rev} →
            </button>
          )}
        </aside>
      </div>
    </Hud>
  );
}
