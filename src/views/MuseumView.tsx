/**
 * The fleet museum: every completed mission's vehicle preserved as a blueprint
 * silhouette drawn to one common scale, plus the program records board.
 */
import { useMemo } from 'react';
import { Hud } from '../components/Hud.tsx';
import { MISSIONS } from '../campaign/catalog.ts';
import { useStore } from '../store.ts';
import { navigate } from '../router.ts';
import {
  computeDerived,
  evaluateEngine,
  evaluateSolid,
  simulateFlight,
  sizeStageTanks,
} from '../physics/index.ts';
import type { RocketDesign } from '../physics/types.ts';
import { computeBlueprint, type StageGeomInput } from '../blueprint/geometry.ts';
import type { CompletionRecord, FlightRecord, MissionId } from '../schema.ts';
import { fmtSIUnit } from '../components/bureau/fmt.ts';
import type { Mission } from '../campaign/types.ts';

function geomInputs(design: RocketDesign): StageGeomInput[] {
  return design.stages.map((s) => {
    try {
      if (s.propulsion.kind === 'liquid') {
        const perf = evaluateEngine(s.propulsion.engine, s.propulsion.propellantMass);
        const tank = s.tanks ? sizeStageTanks(s, perf.feedPressure) : undefined;
        return {
          tank,
          engine: {
            throatDiameter: perf.throatDiameter,
            exitDiameter: perf.exitDiameter,
            nozzleLength: perf.nozzleLength,
            count: s.propulsion.engine.count,
          },
        };
      }
      const sp = evaluateSolid(s.propulsion.motor, s.diameter);
      return {
        solid: {
          motorLength: sp.motorLength,
          exitDiameter: sp.exitDiameter,
          nozzleLength: sp.nozzleLength,
        },
      };
    } catch {
      return {};
    }
  });
}

interface Exhibit {
  mission: Mission;
  completion: CompletionRecord;
  silhouette: string;
  totalLength: number;
  halfWidth: number;
  glow: number;
  deltaV: number;
}

interface ProgramRecord {
  label: string;
  value: string;
  holder: string;
}

function fmtKm(m: number): string {
  return `${(m / 1e3).toFixed(1)} km`;
}

export function MuseumView() {
  const campaign = useStore((s) => s.campaign);
  const revisions = useStore((s) => s.revisions);

  const exhibits = useMemo<Exhibit[]>(() => {
    const out: Exhibit[] = [];
    for (const m of MISSIONS) {
      const completion = campaign.completions[m.id];
      if (!completion) continue;
      try {
        const design = completion.vehicle;
        const bp = computeBlueprint({ design, stages: geomInputs(design) });
        const derived = computeDerived(design);
        out.push({
          mission: m,
          completion,
          silhouette: bp.silhouette,
          totalLength: bp.totalLength,
          halfWidth: bp.maxRadius + (design.fins?.span ?? 0),
          glow: derived.glow,
          deltaV: derived.totalDeltaV,
        });
      } catch {
        /* un-renderable vehicle: skip the plinth, keep the museum standing */
      }
    }
    return out;
  }, [campaign]);

  const allFlights = useMemo<Array<{ id: MissionId; rec: FlightRecord }>>(() => {
    const out: Array<{ id: MissionId; rec: FlightRecord }> = [];
    for (const m of MISSIONS) for (const rec of revisions[m.id] ?? []) out.push({ id: m.id, rec });
    return out;
  }, [revisions]);

  const records = useMemo<ProgramRecord[]>(() => {
    if (allFlights.length === 0) return [];
    const rows: ProgramRecord[] = [];
    const name = (f: { rec: FlightRecord }): string => `${f.rec.design.name} rev ${f.rec.rev}`;

    const bestApo = allFlights.reduce((a, b) => (b.rec.apogee > a.rec.apogee ? b : a));
    rows.push({ label: 'BEST APOGEE', value: fmtKm(bestApo.rec.apogee), holder: name(bestApo) });

    // Max velocity: re-derive from the deterministic sim (successes only).
    const successes = allFlights.filter((f) => f.rec.outcome === 'success');
    let vMax = 0;
    let vHolder = '—';
    for (const f of successes.slice(-24)) {
      try {
        const r = simulateFlight(f.rec.design, { weatherSeed: f.rec.seed });
        let v = 0;
        for (let i = 0; i < r.table.speed.length; i++) if (r.table.speed[i]! > v) v = r.table.speed[i]!;
        if (v > vMax) {
          vMax = v;
          vHolder = name(f);
        }
      } catch {
        /* ignore */
      }
    }
    if (vMax > 0) {
      rows.push({ label: 'MAX VELOCITY', value: `${(vMax / 1e3).toFixed(2)} km/s`, holder: vHolder });
    }

    if (successes.length > 0) {
      const heavy = successes.reduce((a, b) => (b.rec.design.payloadMass > a.rec.design.payloadMass ? b : a));
      rows.push({
        label: 'HEAVIEST PAYLOAD',
        value: `${heavy.rec.design.payloadMass.toLocaleString('en-US')} kg`,
        holder: name(heavy),
      });

      let dvTotal = 0;
      for (const f of successes) {
        try {
          dvTotal += computeDerived(f.rec.design).totalDeltaV;
        } catch {
          /* ignore */
        }
      }
      rows.push({
        label: 'TOTAL Δv FLOWN',
        value: `${(dvTotal / 1e3).toFixed(1)} km/s`,
        holder: `${successes.length} successful flights`,
      });

      const closest = successes.reduce((a, b) => (b.rec.maxQ > a.rec.maxQ ? b : a));
      rows.push({
        label: 'HIGHEST MAX-Q SURVIVED',
        value: `${(closest.rec.maxQ / 1e3).toFixed(1)} kPa`,
        holder: name(closest),
      });
    }
    return rows;
  }, [allFlights]);

  // Common scale: the tallest preserved stack sets meters-per-pixel for ALL.
  const drawH = 470; // px band for the tallest vehicle
  const maxLen = Math.max(...exhibits.map((e) => e.totalLength), 1);
  const pxPerM = drawH / maxLen;

  const nFlights = allFlights.length;

  return (
    <Hud
      sub="fleet museum"
      bar={
        <div className="cm-nav">
          <button type="button" className="ms-btn ms-btn--ghost" onClick={() => navigate({ view: 'campaign' })}>
            CAMPAIGN
          </button>
          <button type="button" className="ms-btn ms-btn--ghost" onClick={() => navigate({ view: 'handbook' })}>
            HANDBOOK
          </button>
        </div>
      }
      status={
        <>
          <span>
            PRESERVED <b className="cm-status-num">{exhibits.length}</b>
          </span>
          <span>
            FLIGHTS LOGGED <b className="cm-status-num">{nFlights}</b>
          </span>
          {exhibits.length > 0 && <span>SCALE 1 px = {fmtSIUnit(1 / pxPerM, 'm', 2)}</span>}
          <span className="ms-hud__spacer" />
          <span>
            <span className="ms-kbd">?</span> help
          </span>
        </>
      }
    >
      <div className="mu">
        <div className="mu-hall">
          {exhibits.length === 0 ? (
            <div className="mu-empty">
              <div className="mu-empty__title">NO VEHICLES PRESERVED</div>
              <div className="mu-empty__sub">Fly something.</div>
              <button
                type="button"
                className="ms-btn ms-btn--primary"
                onClick={() => navigate({ view: 'campaign' })}
              >
                OPEN CAMPAIGN MAP
              </button>
            </div>
          ) : (
            <div className="mu-row">
              <div className="mu-ruler" style={{ height: drawH + 3 }}>
                <svg width={46} height={drawH + 3}>
                  {Array.from({ length: Math.floor(maxLen) + 1 }, (_, m) => {
                    const y = drawH + 1 - m * pxPerM;
                    const every = maxLen > 24 ? 10 : maxLen > 10 ? 5 : 1;
                    const major = m % every === 0;
                    return (
                      <g key={m}>
                        <line
                          className={major ? 'mu-ruler__tick mu-ruler__tick--major' : 'mu-ruler__tick'}
                          x1={major ? 34 : 40}
                          y1={y}
                          x2={45}
                          y2={y}
                        />
                        {major && (
                          <text className="mono mu-ruler__label" x={30} y={y + 3} textAnchor="end">
                            {m}
                          </text>
                        )}
                      </g>
                    );
                  })}
                  <line className="mu-ruler__spine" x1={45} y1={drawH + 1 - maxLen * pxPerM} x2={45} y2={drawH + 1} />
                  <text className="mono mu-ruler__label" x={30} y={12} textAnchor="end">
                    m
                  </text>
                </svg>
              </div>
              {exhibits.map((e) => {
                const wM = Math.max(e.halfWidth * 2.4, 0.6);
                const wPx = Math.max(wM * pxPerM, 56);
                const hPx = e.totalLength * pxPerM;
                return (
                  <figure key={e.mission.id} className="mu-plinth">
                    <div className="mu-draw" style={{ height: drawH }}>
                      <svg
                        className="mu-svg"
                        width={wPx}
                        height={Math.max(hPx, 8)}
                        viewBox={`${-wM / 2} 0 ${wM} ${e.totalLength}`}
                        preserveAspectRatio="xMidYMax meet"
                      >
                        <path className="mu-sil" d={e.silhouette} />
                      </svg>
                    </div>
                    <div className="mu-floor" />
                    <figcaption className="mu-plaque">
                      <div className="mu-plaque__name mono">{e.completion.vehicleName}</div>
                      <div className="mu-plaque__mission">
                        M{e.mission.index + 1} · {e.mission.title}
                      </div>
                      {/* one stat per row: a fixed-width plaque wraps a shared
                          line mid-pair, divorcing "Δv" from its number. */}
                      <dl className="mu-plaque__stats mono">
                        <div>
                          <dt>GLOW</dt>
                          <dd>{e.glow >= 1000 ? `${(e.glow / 1000).toFixed(1)} t` : `${e.glow.toFixed(0)} kg`}</dd>
                        </div>
                        <div>
                          <dt>Δv</dt>
                          <dd>{(e.deltaV / 1e3).toFixed(1)} km/s</dd>
                        </div>
                        <div>
                          <dt>APOGEE</dt>
                          <dd>{fmtKm(e.completion.bestApogee)}</dd>
                        </div>
                        <div>
                          <dt>LOA</dt>
                          <dd>{e.totalLength.toFixed(1)} m</dd>
                        </div>
                        <div>
                          <dt>FLIGHTS</dt>
                          <dd>{e.completion.flights}</dd>
                        </div>
                      </dl>
                      <div className="mu-plaque__epitaph">“{e.completion.epitaph}”</div>
                    </figcaption>
                  </figure>
                );
              })}
            </div>
          )}
        </div>

        <aside className="mu-records">
          <div className="mu-records__head mono">PROGRAM RECORDS</div>
          {records.length === 0 ? (
            <div className="mu-records__empty">No flights on the books.</div>
          ) : (
            <div>
              {records.map((r) => (
                <div className="mu-rec" key={r.label}>
                  <div className="mu-rec__top">
                    <span className="mu-rec__label">{r.label}</span>
                    <span className="mu-rec__value mono">{r.value}</span>
                  </div>
                  <div className="mu-rec__holder mono">{r.holder}</div>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
    </Hud>
  );
}
