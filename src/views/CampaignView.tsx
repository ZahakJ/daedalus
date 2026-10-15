/**
 * The campaign map IS a graph: missions plotted at their target altitude on a
 * full-height log-scale axis, joined by a rising trajectory curve. Selecting a
 * node opens the mission dossier (program memo, objectives, concepts, CTA).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Hud } from '../components/Hud.tsx';
import { MISSIONS } from '../campaign/catalog.ts';
import {
  campaignComplete,
  conceptsUnlocked,
  frontierMission,
  isCompleted,
  isMissionUnlocked,
} from '../campaign/unlocks.ts';
import type { Feature, Mission } from '../campaign/types.ts';
import type { MissionId } from '../schema.ts';
import { useStore } from '../store.ts';
import { navigate } from '../router.ts';
import { BRIEFINGS } from '../content/briefings.ts';
import { CONCEPTS, CONCEPT_BY_ID } from '../content/concepts.ts';
import { renderContent } from '../content/render.ts';

const FEATURE_LABELS: Record<Feature, string> = {
  'fixed-motors': 'catalog solid motors',
  recovery: 'recovery system',
  fins: 'fin design',
  'nose-shape': 'nose geometry',
  'solid-designer': 'full solid-motor design',
  'airframe-material': 'airframe materials',
  'liquid-engine': 'liquid engine design',
  'tank-design': 'tank design',
  'pump-cycles': 'pump-fed cycles',
  'throttle-bucket': 'max-Q throttle bucket',
  staging: 'second stage + fairing',
  'pitch-kick': 'pitch-kick guidance',
  'guidance-full': 'full guidance suite',
  'advanced-materials': 'advanced materials',
  'staged-combustion': 'staged combustion',
  'cost-readout': 'program cost ledger',
  'lh2-restart': 'LOX/LH2 + restart',
};

const KM = (m: number): string =>
  m >= 1e6 ? `${Math.round(m / 1e3).toLocaleString('en-US')}` : `${Math.round(m / 1e3)}`;

/** Catmull-Rom → cubic bezier through the mission nodes. */
function smoothPath(pts: Array<[number, number]>): string {
  if (pts.length < 2) return '';
  let d = `M ${pts[0]![0].toFixed(1)} ${pts[0]![1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[Math.min(pts.length - 1, i + 2)]!;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}

const TICKS_KM = [1, 3, 10, 30, 100, 300, 1000, 3000, 10000, 36000];

function AltitudeChart({
  selected,
  onSelect,
}: {
  selected: MissionId | 'free-flight' | null;
  onSelect: (id: MissionId | 'free-flight') => void;
}) {
  const campaign = useStore((s) => s.campaign);
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { w, h } = size;
  const padL = 84;
  const padR = 36;
  const padT = 42;
  const padB = 46;
  const lo = Math.log10(680);
  const hi = Math.log10(5.2e7);
  const yOf = (alt: number): number =>
    padT + (1 - (Math.log10(Math.max(alt, 700)) - lo) / (hi - lo)) * (h - padT - padB);
  const xOf = (i: number): number => padL + ((i + 0.55) / 8.4) * (w - padL - padR);

  const frontier = frontierMission(campaign);
  const done = campaignComplete(campaign);
  const bestApogee = useMemo(() => {
    let best = 0;
    for (const m of MISSIONS) {
      const c = campaign.completions[m.id];
      if (c && c.bestApogee > best) best = c.bestApogee;
    }
    return best;
  }, [campaign]);

  if (w < 100 || h < 100) return <div className="cm-chart" ref={ref} />;

  const nodes = MISSIONS.map((m) => ({ m, x: xOf(m.index), y: yOf(m.altitudeTarget) }));
  const pad0: [number, number] = [padL + 4, h - padB];
  const fi = frontier ? frontier.index : MISSIONS.length - 1;
  const flownPts: Array<[number, number]> = [
    pad0,
    ...nodes.slice(0, fi + 1).map((n) => [n.x, n.y] as [number, number]),
  ];
  const aheadPts: Array<[number, number]> = nodes
    .slice(fi)
    .map((n) => [n.x, n.y] as [number, number]);
  const freeXY: [number, number] = [Math.min(xOf(8), w - padR - 20), padT + 4];
  if (done) aheadPts.push(freeXY);
  const flownD = smoothPath(flownPts);
  const aheadD = smoothPath(done && frontier === undefined ? [] : aheadPts);
  const aheadAllD = done ? smoothPath([...flownPts, freeXY]) : '';

  const karmanY = yOf(100e3);
  const bestY = bestApogee > 700 ? yOf(bestApogee) : null;

  return (
    <div className="cm-chart" ref={ref}>
      <svg className="cm-svg" width={w} height={h}>
        {/* altitude gridlines + ticks */}
        {TICKS_KM.map((km) => {
          const y = yOf(km * 1e3);
          return (
            <g key={km}>
              <line className="cm-grid" x1={padL} y1={y} x2={w - padR} y2={y} />
              <line className="cm-tick" x1={padL - 6} y1={y} x2={padL} y2={y} />
              <text className="mono cm-tick-label" x={padL - 12} y={y + 3} textAnchor="end">
                {km.toLocaleString('en-US')}
              </text>
            </g>
          );
        })}
        <line className="cm-axis" x1={padL} y1={padT - 14} x2={padL} y2={h - padB} />
        <text className="mono cm-axis-title" x={padL - 12} y={padT - 22} textAnchor="end">
          ALT / km
        </text>

        {/* Kármán line */}
        <line className="cm-karman" x1={padL} y1={karmanY} x2={w - padR} y2={karmanY} />
        <text
          className="mono cm-karman-label"
          x={w - padR}
          y={karmanY - 6}
          textAnchor="end"
        >
          KÁRMÁN LINE · 100 km
        </text>

        {/* your best apogee — the unclimbed distance made visible */}
        {bestY !== null && (
          <g>
            <line className="cm-best" x1={padL} y1={bestY} x2={w - padR} y2={bestY} />
            <text className="mono cm-best-label" x={padL + 10} y={bestY - 6}>
              YOUR BEST APOGEE · {(bestApogee / 1e3).toFixed(1)} km
            </text>
          </g>
        )}

        {/* trajectory curve: flown (accent + glow) then ahead (ghost dashed) */}
        {done ? (
          <>
            <path className="cm-traj-glow" d={aheadAllD} />
            <path className="cm-traj" d={aheadAllD} />
          </>
        ) : (
          <>
            <path className="cm-traj-ahead" d={aheadD} />
            <path className="cm-traj-glow" d={flownD} />
            <path className="cm-traj" d={flownD} />
          </>
        )}

        {/* mission nodes */}
        {nodes.map(({ m, x, y }) => {
          const completed = isCompleted(campaign, m.id);
          const unlocked = isMissionUnlocked(campaign, m.id);
          const isFrontier = frontier?.id === m.id;
          const sel = selected === m.id;
          const completion = campaign.completions[m.id];
          const cls = completed
            ? 'cm-node cm-node--done'
            : isFrontier || unlocked
              ? 'cm-node cm-node--avail'
              : 'cm-node cm-node--locked';
          // Hand-tuned label sides for the mid-chart cluster (M5–M7 sit close).
          type Side = 'r' | 'l' | 'a' | 'b';
          const side: Side = (['r', 'r', 'r', 'r', 'l', 'r', 'a', 'l'] as Side[])[m.index] ?? 'r';
          const anchor = side === 'r' ? 'start' : side === 'l' ? 'end' : 'middle';
          const lx = side === 'r' ? x + 20 : side === 'l' ? x - 20 : x;
          const titleY = side === 'b' ? y + 27 : side === 'a' ? y - 30 : y - 8;
          const stateY = side === 'b' ? y + 40 : side === 'a' ? y - 17 : y + 7;
          const stateText =
            completed && completion
              ? `${completion.flights} FLT · BEST ${(completion.bestApogee / 1e3).toFixed(0)} km`
              : unlocked
                ? 'AVAILABLE'
                : `LOCKED · ${KM(m.altitudeTarget)} km`;
          return (
            <g key={m.id} className={cls + (sel ? ' cm-node--sel' : '')} onClick={() => onSelect(m.id)}>
              {isFrontier && <circle className="cm-node__pulse" cx={x} cy={y} r={9} />}
              {sel && <circle className="cm-node__sel" cx={x} cy={y} r={14} />}
              <circle className="cm-node__ring" cx={x} cy={y} r={9} />
              <circle className="cm-node__core" cx={x} cy={y} r={3} />
              <text x={lx} y={titleY} textAnchor={anchor}>
                <tspan className="mono cm-node__index">{String(m.index + 1).padStart(2, '0')} </tspan>
                <tspan className="cm-node__title">{m.title.toUpperCase()}</tspan>
              </text>
              <text className="mono cm-node__state" x={lx} y={stateY} textAnchor={anchor}>
                {stateText}
              </text>
              <circle className="cm-node__hit" cx={x} cy={y} r={18} />
            </g>
          );
        })}

        {/* free-flight node — appears quietly once the ledger closes */}
        {done && (
          <g
            className={'cm-node cm-node--free' + (selected === 'free-flight' ? ' cm-node--sel' : '')}
            onClick={() => onSelect('free-flight')}
          >
            {selected === 'free-flight' && (
              <circle className="cm-node__sel" cx={freeXY[0]} cy={freeXY[1]} r={14} />
            )}
            <circle className="cm-node__ring" cx={freeXY[0]} cy={freeXY[1]} r={9} />
            <circle className="cm-node__core" cx={freeXY[0]} cy={freeXY[1]} r={3} />
            <text className="cm-node__title" x={freeXY[0] - 20} y={freeXY[1] + 4} textAnchor="end">
              FREE FLIGHT
            </text>
            <circle className="cm-node__hit" cx={freeXY[0]} cy={freeXY[1]} r={18} />
          </g>
        )}
      </svg>
    </div>
  );
}

function Dossier({ mission }: { mission: Mission }) {
  const campaign = useStore((s) => s.campaign);
  const completed = isCompleted(campaign, mission.id);
  const unlocked = isMissionUnlocked(campaign, mission.id);
  const completion = campaign.completions[mission.id];
  const prev = MISSIONS[mission.index - 1];
  const payload =
    'fixed' in mission.payload
      ? `${mission.payload.fixed.toLocaleString('en-US')} kg`
      : `≥ ${mission.payload.min.toLocaleString('en-US')} kg`;

  return (
    <aside className="cm-dossier">
      <div className="cm-dossier__scroll">
        <div className="cm-dossier__kicker mono">
          {unlocked ? 'MISSION DOSSIER' : 'DOSSIER SEALED'}
          <span className={'cm-badge' + (completed ? ' cm-badge--done' : unlocked ? ' cm-badge--avail' : '')}>
            {completed ? 'COMPLETE' : unlocked ? 'AVAILABLE' : 'LOCKED'}
          </span>
        </div>
        <div className="cm-dossier__index mono">MISSION {String(mission.index + 1).padStart(2, '0')} / 08</div>
        <h2 className="cm-dossier__title">{mission.title}</h2>
        <div className="cm-dossier__tagline">{mission.tagline}</div>

        <div className="cm-dossier__stats mono">
          <div>
            <span className="cm-stat-label">TARGET</span>
            {KM(mission.altitudeTarget)} km
          </div>
          <div>
            <span className="cm-stat-label">PAYLOAD</span>
            {payload}
          </div>
          {mission.costCap !== undefined && (
            <div>
              <span className="cm-stat-label">COST CAP</span>
              {mission.costCap} cu
            </div>
          )}
        </div>

        {unlocked ? (
          <div className="cm-dossier__memo">{renderContent(BRIEFINGS[mission.id])}</div>
        ) : (
          <div className="cm-dossier__sealed">
            Program memo sealed.
            <br />
            Complete <b>{prev ? `${String(mission.index).padStart(2, '0')} · ${prev.title}` : 'the previous mission'}</b> to
            unlock.
          </div>
        )}

        <div className="cm-section">
          <div className="cm-section__head mono">OBJECTIVES</div>
          <ul className="cm-objectives">
            {mission.objectives.map((o) => (
              <li key={o.id} className={completed ? 'cm-obj cm-obj--done' : 'cm-obj'}>
                <span className="cm-obj__tick mono">{completed ? '✓' : '·'}</span>
                {o.label}
              </li>
            ))}
          </ul>
        </div>

        <div className="cm-section">
          <div className="cm-section__head mono">NEW CONCEPTS</div>
          <div className="cm-chips">
            {mission.newConcepts.map((id) => (
              <button
                key={id}
                type="button"
                className={'cm-chip' + (unlocked ? '' : ' cm-chip--locked')}
                onClick={() => unlocked && navigate({ view: 'handbook', conceptId: id })}
              >
                {CONCEPT_BY_ID[id]?.title ?? id}
              </button>
            ))}
          </div>
        </div>

        {mission.newFeatures.length > 0 && (
          <div className="cm-section">
            <div className="cm-section__head mono">BUREAU UNLOCKS</div>
            <ul className="cm-features mono">
              {mission.newFeatures.map((f) => (
                <li key={f}>{FEATURE_LABELS[f]}</li>
              ))}
            </ul>
          </div>
        )}

        {completed && completion && (
          <div className="cm-section cm-complete">
            <div className="cm-section__head mono">MISSION RECORD</div>
            <div className="cm-complete__row mono">
              <span>{completion.vehicleName}</span>
              <span>
                {completion.flights} flights · best {(completion.bestApogee / 1e3).toFixed(1)} km
              </span>
            </div>
            <div className="cm-complete__epitaph">“{completion.epitaph}”</div>
          </div>
        )}
      </div>

      <div className="cm-dossier__cta">
        {unlocked ? (
          <>
            <button
              type="button"
              className={'ms-btn ' + (completed ? '' : 'ms-btn--primary')}
              onClick={() => navigate({ view: 'bureau', missionId: mission.id })}
            >
              {completed ? 'RE-ENTER DESIGN BUREAU' : 'ENTER DESIGN BUREAU'}
            </button>
            {completed && (
              <button type="button" className="ms-btn ms-btn--ghost" onClick={() => navigate({ view: 'museum' })}>
                VIEW IN MUSEUM
              </button>
            )}
          </>
        ) : (
          <div className="cm-lock-note mono">
            complete {prev ? prev.title.toUpperCase() : 'previous mission'} to unlock
          </div>
        )}
      </div>
    </aside>
  );
}

function FreeFlightDossier() {
  return (
    <aside className="cm-dossier">
      <div className="cm-dossier__scroll">
        <div className="cm-dossier__kicker mono">PROGRAM COMPLETE</div>
        <h2 className="cm-dossier__title">Free Flight</h2>
        <div className="cm-dossier__tagline">The range is yours.</div>
        <div className="cm-dossier__memo">
          {renderContent(
            `Eight vehicles flew; eight missions closed. The board has released the range for unrestricted flight test — every engine cycle, every material, every propellant in the catalog, no objectives, no ceilings.\n\n*Sandbox operations facility under construction.*`,
          )}
        </div>
      </div>
      <div className="cm-dossier__cta">
        <button type="button" className="ms-btn" disabled>
          SANDBOX — COMING ONLINE
        </button>
      </div>
    </aside>
  );
}

export function CampaignView() {
  const campaign = useStore((s) => s.campaign);
  const revisions = useStore((s) => s.revisions);
  const settings = useStore((s) => s.settings);
  const [selected, setSelected] = useState<MissionId | 'free-flight' | null>(null);

  // Default selection: the frontier mission (or free flight when done).
  const frontier = frontierMission(campaign);
  const sel = selected ?? frontier?.id ?? 'free-flight';

  // Campaign done → quietly unlock the sandbox flag.
  useEffect(() => {
    if (campaignComplete(campaign) && !settings.sandboxUnlocked) {
      useStore.getState().unlockSandbox();
    }
  }, [campaign, settings.sandboxUnlocked]);

  const nConcepts = conceptsUnlocked(campaign).size;
  const nFlights = MISSIONS.reduce((n, m) => n + (revisions[m.id]?.length ?? 0), 0);
  const nDone = MISSIONS.filter((m) => isCompleted(campaign, m.id)).length;
  const selMission = sel !== 'free-flight' ? MISSIONS.find((m) => m.id === sel) : undefined;

  return (
    <Hud
      sub="flight program"
      bar={
        <div className="cm-nav">
          <button type="button" className="ms-btn ms-btn--ghost" onClick={() => navigate({ view: 'handbook' })}>
            HANDBOOK
          </button>
          <button type="button" className="ms-btn ms-btn--ghost" onClick={() => navigate({ view: 'museum' })}>
            MUSEUM
          </button>
        </div>
      }
      status={
        <>
          <span>
            CONCEPTS <b className="cm-status-num">{nConcepts}/{CONCEPTS.length}</b>
          </span>
          <span>
            FLIGHTS <b className="cm-status-num">{nFlights}</b>
          </span>
          <span>
            CAMPAIGN <b className="cm-status-num">{Math.round((nDone / MISSIONS.length) * 100)}%</b>
          </span>
          <span className="ms-hud__spacer" />
          <span>
            <span className="ms-kbd">?</span> help
          </span>
        </>
      }
    >
      <div className="cm">
        <AltitudeChart selected={sel} onSelect={setSelected} />
        {selMission ? <Dossier mission={selMission} /> : <FreeFlightDossier />}
      </div>
    </Hud>
  );
}
