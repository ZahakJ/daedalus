/**
 * The mishap-investigation / flight-report generator: turns a committed
 * FlightRecord + its re-derived FlightResult into a typed document the
 * DebriefView typesets — synopsis, merged timeline, findings (one per
 * failure, template-substituted from the physics FAILURES catalog),
 * probable cause, recommendations that deep-link back to the bureau.
 */
import type {
  DerivedPerformance,
  FailureEvent,
  FailureId,
  FlightResult,
  RocketDesign,
} from '../physics/types.ts';
import { FAILURES, OMEGA_EARTH, R_EARTH } from '../physics/index.ts';
import type { Mission } from '../campaign/types.ts';
import { featureAvailable } from '../campaign/unlocks.ts';
import { CARDS, type CardId } from '../design/cards.tsx';
import type { FlightRecord } from '../schema.ts';
import { formatDuration, formatInt } from '../sim/format.ts';
import { computeMarginTimeline, type MarginRow } from './margins.ts';

// ————— document shape —————

export interface TimelineEntry {
  t: number;
  label: string;
  kind: 'event' | 'warning' | 'degraded' | 'loss-of-vehicle';
}

export interface Finding {
  /** 1-based finding number (FINDING 1, 2 …). */
  n: number;
  failureId: FailureId;
  title: string;
  t: number;
  severity: FailureEvent['severity'];
  /** FAILURES cause template with {placeholders} substituted. */
  cause: string;
  fixHint: string;
  lessonId: string;
  /** Decision card the finding indicts, e.g. "DC-15 · FINS" (from CARDS). */
  card: string;
  /** Blueprint part to light on arrival in the bureau (ui.selectedPartId). */
  partId: string | null;
}

export interface Recommendation {
  n: number;
  text: string;
  card: string;
  partId: string | null;
  lessonId: string;
}

export interface PerfRecord {
  label: string;
  value: string;
}

export interface ObjectiveGrade {
  id: string;
  label: string;
  pass: boolean;
  actual: string;
  target: string;
}

export interface DebriefReport {
  /** "MIR-1-A" (mishap) | "FR-1-C" (flight report). */
  docId: string;
  docTitle: string;
  outcome: 'success' | 'failure';
  objectivesMet: boolean;
  stamp: { text: string; tone: 'ok' | 'warn' | 'danger' };
  meta: Array<{ label: string; value: string }>;
  synopsis: string;
  timeline: TimelineEntry[];
  findings: Finding[];
  /** Success flights: headline performance records. */
  records: PerfRecord[];
  /** Success flights: the margin that came closest to its limit. */
  closestMargin: { label: string; callout: string; status: 'ok' | 'warn' | 'danger' } | null;
  probableCause: string;
  recommendations: Recommendation[];
  objectives: ObjectiveGrade[];
}

// ————— failure → decision-card indictment —————

/** Which bureau decision each failure indicts: card id (code + label come from
    CARDS in src/design/cards.tsx, so they cannot drift from the bureau) +
    blueprint part id (part ids follow src/blueprint/geometry.ts). */
export const INDICTMENTS: Record<
  FailureId,
  {
    card: CardId | ((d: RocketDesign, m: Mission) => CardId);
    partId: (d: RocketDesign) => string | null;
  }
> = {
  'pad-crawl': {
    card: (d, m) =>
      d.stages[0]!.propulsion.kind === 'liquid'
        ? 'thrust-class'
        : featureAvailable('solid-designer', m.id)
          ? 'solid-motor'
          : 'motor-select',
    partId: (d) => (d.stages[0]!.propulsion.kind === 'solid' ? 's0-grain' : 's0-engine0'),
  },
  'unstable-tumble': { card: 'fins', partId: (d) => (d.fins ? 'fin-r' : 'nose') },
  weathercock: { card: 'fins', partId: () => 'fin-r' },
  'maxq-structural': {
    card: (d) => (d.stages[0]!.propulsion.kind === 'liquid' ? 'tank-structure' : 'case-nozzle'),
    partId: (d) => (d.stages[0]!.propulsion.kind === 'liquid' ? 's0-ox' : 's0-tube'),
  },
  'fin-flutter': { card: 'fin-stock', partId: () => 'fin-r' },
  'tank-burst': {
    card: 'tank-structure',
    partId: (d) => {
      for (let i = 0; i < d.stages.length; i++) {
        const s = d.stages[i]!;
        if (s.propulsion.kind === 'liquid' && s.tanks && s.tanks.safetyFactor < 1.15) return `s${i}-ox`;
      }
      return 's0-ox';
    },
  },
  'flow-separation': { card: 'nozzle-expansion', partId: () => 's0-engine0' },
  cavitation: { card: 'engine-cycle', partId: () => 's0-engine0' },
  'battery-depleted': {
    card: 'engine-cycle',
    partId: (d) => `s${d.stages.length - 1}-engine0`,
  },
  'pressurant-depleted': { card: 'pressurant', partId: () => 's0-ox' },
  'chute-shred': { card: 'recovery', partId: () => 'chute' },
  'boiloff-shortfall': {
    card: 'upper-stage-propellant',
    partId: (d) => {
      for (let i = 0; i < d.stages.length; i++) {
        const s = d.stages[i]!;
        if (s.propulsion.kind === 'liquid' && s.propulsion.engine.propellant === 'lox-lh2')
          return `s${i}-fuel`;
      }
      return `s${d.stages.length - 1}-fuel`;
    },
  },
};

/** Resolve a failure's indicted card for this design + mission. */
export function indictedCard(id: FailureId, d: RocketDesign, m: Mission): CardId {
  const c = INDICTMENTS[id].card;
  return typeof c === 'function' ? c(d, m) : c;
}

// ————— formatting —————

const km = (m: number): string => `${(m / 1e3).toFixed(1)} km`;
const sec = (s: number): string => `${s.toFixed(1)} s`;

function fmtVal(key: string, v: number, failureId: FailureId): string {
  switch (key) {
    case 'q':
    case 'meop':
    case 'pe':
    case 'pa':
      return formatInt(v);
    case 'v':
    case 'vf':
    case 'wind':
      return v.toFixed(0);
    case 'margin':
      return failureId === 'maxq-structural' ? v.toFixed(0) : v.toFixed(2);
    case 'sf':
    case 'twr':
      return v.toFixed(2);
    case 'bend':
    case 'aoa':
      return v.toFixed(1);
    case 'attempt':
    case 'allowed':
    case 'lost':
    case 'dv':
      return v.toFixed(0);
    default:
      return Math.abs(v) >= 100 ? formatInt(v) : v.toFixed(2);
  }
}

/** Substitute {placeholders} from FailureEvent.data into the catalog cause
    template; fall back to the sim's own detail line when a key is missing. */
function substitutedCause(f: FailureEvent): string {
  const info = FAILURES[f.id];
  let unresolved = false;
  const text = info.cause.replace(/\{(\w+)\}/g, (_m, key: string) => {
    const v = f.data?.[key];
    if (v === undefined) {
      unresolved = true;
      return '—';
    }
    return fmtVal(key, v, f.id);
  });
  return unresolved ? `${f.detail}.` : text;
}

// ————— the generator —————

export function generateReport(
  mission: Mission,
  record: FlightRecord,
  result: FlightResult,
  derived: DerivedPerformance,
  margins?: MarginRow[],
): DebriefReport {
  const { summary, events, failures, orbit, table } = result;
  const failed = summary.outcome === 'failure';
  const missionNo = mission.index + 1;
  const docId = `${failed ? 'MIR' : 'FR'}-${missionNo}-${record.rev}`;
  const losT = table.t.length > 0 ? table.t[table.t.length - 1]! : 0;
  const marginRows = margins ?? computeMarginTimeline(result, record.design);

  // ————— objectives —————
  const objectives: ObjectiveGrade[] = mission.objectives.map((o) => {
    const r = o.evaluate(result, record.design, derived);
    return { id: o.id, label: o.label, pass: r.pass, actual: r.actual, target: r.target };
  });
  const objectivesMet = objectives.every((o) => o.pass);

  // ————— meta block —————
  const meta: DebriefReport['meta'] = [
    { label: 'VEHICLE', value: record.design.name },
    { label: 'MISSION', value: `M${missionNo} — ${mission.title.toUpperCase()}` },
    { label: 'REVISION', value: record.rev },
    { label: 'DATE', value: record.at ? record.at.slice(0, 10) : 'shared link' },
    { label: 'WX SEED', value: record.seed },
    { label: 'GLOW', value: `${formatInt(derived.glow)} kg` },
  ];
  if (record.waivedRisks.length > 0) {
    meta.push({ label: 'WAIVED RISKS', value: String(record.waivedRisks.length) });
  }

  // ————— synopsis —————
  // Ground range at end of flight (inertial downrange includes Earth
  // co-rotation, which dominates during a long chute descent and would read
  // absurdly for a sounding flight).
  const nT = table.t.length;
  const omegaEff = OMEGA_EARTH * Math.cos(record.design.launch.latitude);
  const groundEnd =
    nT > 0
      ? Math.abs(
          (Math.atan2(table.x[nT - 1]!, table.y[nT - 1]!) - omegaEff * table.t[nT - 1]!) * R_EARTH,
        )
      : 0;
  const duration =
    summary.flightTime > 120
      ? `${sec(summary.flightTime)} (${formatDuration(summary.flightTime * 1e3)})`
      : sec(summary.flightTime);

  const firstLov = failures.find((f) => f.severity === 'loss-of-vehicle');
  let synopsis: string;
  if (failed && firstLov) {
    synopsis =
      `Vehicle ${record.design.name}, revision ${record.rev}, was launched in support of ` +
      `Mission ${missionNo} (${mission.title}). The vehicle reached ${km(summary.apogee)} altitude ` +
      `before ${FAILURES[firstLov.id].title.toLowerCase()} at T+${sec(firstLov.t)}. ` +
      `Loss of signal at T+${sec(losT)}. ` +
      `${failures.length} finding${failures.length === 1 ? ' follows' : 's follow'}. All times are mission elapsed.`;
  } else {
    const degraded = failures.length;
    synopsis =
      `Vehicle ${record.design.name}, revision ${record.rev}, flew Mission ${missionNo} ` +
      `(${mission.title}) to an apogee of ${km(summary.apogee)}; total flight time ${duration}.` +
      (orbit
        ? ` Final orbit ${km(orbit.periapsisAlt)} × ${km(orbit.apoapsisAlt)}, e = ${orbit.eccentricity.toFixed(3)}.`
        : ` The vehicle came down ${km(groundEnd)} from the launch site.`) +
      (summary.landingSpeed !== undefined
        ? ` Recovered under canopy at ${summary.landingSpeed.toFixed(1)} m/s.`
        : '') +
      (degraded > 0
        ? ` ${degraded} anomal${degraded === 1 ? 'y' : 'ies'} noted in flight — see findings.`
        : ' No anomalies noted.') +
      ' All times are mission elapsed.';
  }

  // ————— timeline: events + failures merged chronologically —————
  const kindRank: Record<TimelineEntry['kind'], number> = {
    event: 0,
    warning: 1,
    degraded: 2,
    'loss-of-vehicle': 3,
  };
  const timeline: TimelineEntry[] = [
    ...events.map((e): TimelineEntry => ({ t: e.t, label: e.label, kind: 'event' })),
    ...failures.map(
      (f): TimelineEntry => ({ t: f.t, label: `${FAILURES[f.id].title} — ${f.detail}`, kind: f.severity }),
    ),
  ].sort((a, b) => a.t - b.t || kindRank[a.kind] - kindRank[b.kind]);

  // ————— findings —————
  const findings: Finding[] = failures.map((f, i) => {
    const ind = INDICTMENTS[f.id];
    return {
      n: i + 1,
      failureId: f.id,
      title: FAILURES[f.id].title,
      t: f.t,
      severity: f.severity,
      cause: substitutedCause(f),
      fixHint: FAILURES[f.id].fixHint,
      lessonId: f.lessonId,
      card: CARDS[indictedCard(f.id, record.design, mission)].label,
      partId: ind.partId(record.design),
    };
  });

  // ————— success records + closest margin —————
  const records: PerfRecord[] = failed
    ? []
    : [
        { label: 'APOGEE', value: km(summary.apogee) },
        {
          label: 'MAX-Q',
          value: `${(summary.maxQ.value / 1e3).toFixed(1)} kPa @ ${km(summary.maxQ.altitude)}`,
        },
        { label: 'MAX MACH', value: summary.maxMach.toFixed(2) },
        { label: 'PEAK ACCEL', value: `${summary.maxAccelG.toFixed(1)} g` },
        ...(orbit
          ? [{ label: 'DOWNRANGE', value: km(summary.downrange) }]
          : [{ label: 'GROUND RANGE', value: km(groundEnd) }]),
        { label: 'Δv SPENT', value: `${formatInt(summary.deltaVSpent)} m/s` },
        {
          label: 'LOSSES G/D/S',
          value: `${formatInt(summary.lossGravity)} / ${formatInt(summary.lossDrag)} / ${formatInt(summary.lossSteering)} m/s`,
        },
        ...(summary.landingSpeed !== undefined
          ? [{ label: 'TOUCHDOWN', value: `${summary.landingSpeed.toFixed(1)} m/s` }]
          : []),
        ...(orbit
          ? [
              {
                label: 'ORBIT',
                value: `${km(orbit.periapsisAlt)} × ${km(orbit.apoapsisAlt)} · e ${orbit.eccentricity.toFixed(3)}`,
              },
            ]
          : []),
      ];

  let closestMargin: DebriefReport['closestMargin'] = null;
  if (!failed && marginRows.length > 0) {
    const worstRow = marginRows.reduce((a, b) => (b.worst.proximity > a.worst.proximity ? b : a));
    closestMargin = { label: worstRow.label, callout: worstRow.callout, status: worstRow.status };
  }

  // ————— probable cause —————
  const probableCause = firstLov
    ? `The probable cause of this mishap was ${FAILURES[firstLov.id].title.toLowerCase()}: ${substitutedCause(firstLov)}`
    : 'Nominal flight. No probable cause assigned.';

  // ————— recommendations: one action per finding —————
  const recommendations: Recommendation[] = findings.map((f) => ({
    n: f.n,
    text: f.fixHint,
    card: f.card,
    partId: f.partId,
    lessonId: f.lessonId,
  }));

  const stamp: DebriefReport['stamp'] = failed
    ? { text: 'LOSS OF VEHICLE', tone: 'danger' }
    : objectivesMet
      ? { text: 'OBJECTIVES MET', tone: 'ok' }
      : { text: 'OBJECTIVES NOT MET', tone: 'warn' };

  return {
    docId,
    docTitle: failed ? 'MISHAP INVESTIGATION REPORT' : 'FLIGHT REPORT',
    outcome: summary.outcome,
    objectivesMet,
    stamp,
    meta,
    synopsis,
    timeline,
    findings,
    records,
    closestMargin,
    probableCause,
    recommendations,
    objectives,
  };
}

// ————— epitaph (museum line, derived from the revision ladder) —————

const FAILURE_NOUN: Record<FailureId, string> = {
  'unstable-tumble': 'instability',
  weathercock: 'weathercocking',
  'maxq-structural': 'max-Q',
  'fin-flutter': 'flutter',
  'tank-burst': 'a burst tank',
  'flow-separation': 'flow separation',
  cavitation: 'cavitation',
  'battery-depleted': 'a refused restart',
  'pressurant-depleted': 'pressurant starvation',
  'chute-shred': 'a shredded canopy',
  'pad-crawl': 'a pad crawl',
  'boiloff-shortfall': 'boiloff',
};

const NUMBER_WORD = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];

/** One-liner for the CompletionRecord, drawn from the mission's worst earlier
    failure across revisions: what this vehicle cost to learn. */
export function buildEpitaph(revisions: FlightRecord[]): string {
  const lost = revisions.filter((r) => r.outcome === 'failure');
  if (lost.length === 0) {
    return revisions.length <= 1
      ? 'First time, every margin held.'
      : `${NUMBER_WORD[Math.min(revisions.length, 9)]![0]!.toUpperCase()}${NUMBER_WORD[Math.min(revisions.length, 9)]!.slice(1)} flights, no airframes lost.`;
  }
  // Most frequent first-failure across the lost flights = the lesson paid for.
  const counts = new Map<string, number>();
  for (const r of lost) {
    const id = r.failureIds[0];
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  let worst: string | undefined;
  let max = 0;
  for (const [id, c] of counts) {
    if (c > max) {
      max = c;
      worst = id;
    }
  }
  const noun = (worst && FAILURE_NOUN[worst as FailureId]) || 'the sky';
  const n = lost.length;
  const airframes = n === 1 ? 'one airframe' : `${NUMBER_WORD[Math.min(n, 9)]} airframes`;
  return `Lost ${airframes} to ${noun} before clearing the line.`;
}
