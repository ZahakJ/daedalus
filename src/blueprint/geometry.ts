/**
 * Pure design → cutaway geometry. Everything is computed in REAL METERS in a
 * drawing frame: x = radial offset from the vehicle centerline (x=0), y = 0 at
 * the nose tip growing downward to the nozzle exit. The SVG viewBox maps this
 * frame directly; one place (Blueprint.tsx) sets scale.
 *
 * This module never imports React or physics — the physics-derived sizes it
 * needs (tank lengths, nozzle contours) arrive as inputs, so it stays testable
 * with mock reports and reusable by the flight-view silhouette layer.
 */
import type { FinSet, RocketDesign, TankReport } from '../physics/types.ts';

export interface EngineGeomInput {
  throatDiameter: number;
  exitDiameter: number;
  nozzleLength: number;
  count: number;
}

export interface SolidGeomInput {
  motorLength: number;
  exitDiameter: number;
  nozzleLength: number;
}

export interface StageGeomInput {
  tank?: TankReport;
  engine?: EngineGeomInput;
  solid?: SolidGeomInput;
}

export interface BlueprintInputs {
  design: RocketDesign;
  /** Parallel to design.stages. */
  stages: StageGeomInput[];
  /** CG / CP from nose tip, m (sounding missions). */
  cg?: number;
  cp?: number;
  /** 0–1 propellant remaining, drawn as liquid level (default 1). */
  propellantFraction?: number;
}

export type PartKind =
  | 'nose'
  | 'fairing'
  | 'payload'
  | 'avionics'
  | 'tank-ox'
  | 'tank-fuel'
  | 'solid-grain'
  | 'intertank'
  | 'thrust-structure'
  | 'engine'
  | 'interstage'
  | 'fin'
  | 'chute';

export interface BpPart {
  id: string;
  label: string;
  kind: PartKind;
  /** Closed SVG path in drawing meters. */
  outline: string;
  /** Material hatch pattern id ('' = none). */
  hatch: string;
  /** Stage index (-1 for stack-level parts). */
  stage: number;
  /** Liquid fill: y of the surface and the tank's inner extents. */
  liquid?: { surfaceY: number; bottomY: number; halfWidth: number; kind: 'ox' | 'fuel' };
}

export interface BpDimension {
  id: string;
  /** Equation binding id this dimension mirrors (cross-highlight). */
  bind?: string;
  label: string;
  /** Endpoints in drawing meters. */
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Which side the extension offset points. */
  orient: 'v' | 'h';
  /** Offset of the dimension line from the measured points, m. */
  offset: number;
}

export interface BpMarker {
  id: 'cg' | 'cp';
  y: number;
}

export interface BpGhost {
  outline: string;
  label: string;
  y: number;
}

export interface BpLeader {
  partId: string;
  /** Anchor point on the part. */ x: number;
  y: number;
  label: string;
}

export interface BlueprintGeometry {
  parts: BpPart[];
  dims: BpDimension[];
  markers: BpMarker[];
  leaders: BpLeader[];
  ghosts: BpGhost[];
  totalLength: number;
  maxRadius: number;
  /**
   * True half-extent of everything drawn, in meters: the body radius plus the
   * fin span (and the static-margin dimension stack on the left). maxRadius is
   * the BODY only — sizing the viewBox or placing callouts off it puts fins and
   * labels on top of each other.
   */
  halfWidth: number;
  /** Flight-view silhouette: one closed outline of the whole stack. */
  silhouette: string;
}

const f = (n: number): string => Number(n.toFixed(4)).toString();

/** Left-hand standoff for the static-margin dimension, m. halfWidth covers it. */
const SM_DIM_MARGIN = 0.15;

/** Capsule (cylinder + 2:1 domes) tank outline centred on x=0. */
function capsulePath(r: number, yTop: number, yBottom: number): string {
  const h = r / 2; // 2:1 ellipse semi-minor
  return [
    `M ${f(-r)} ${f(yTop)}`,
    `A ${f(r)} ${f(h)} 0 0 1 ${f(r)} ${f(yTop)}`, // top dome (bulge up)
    `L ${f(r)} ${f(yBottom)}`,
    `A ${f(r)} ${f(h)} 0 0 1 ${f(-r)} ${f(yBottom)}`, // bottom dome (bulge down)
    'Z',
  ].join(' ');
}

function rect(r: number, yTop: number, yBottom: number): string {
  return `M ${f(-r)} ${f(yTop)} L ${f(r)} ${f(yTop)} L ${f(r)} ${f(yBottom)} L ${f(-r)} ${f(yBottom)} Z`;
}

/** Nose profile: ogive/von-karman rendered as a power-series curve, cone as lines. */
function nosePath(r: number, length: number, shape: RocketDesign['noseShape']): string {
  if (shape === 'conical') {
    return `M 0 0 L ${f(r)} ${f(length)} L ${f(-r)} ${f(length)} Z`;
  }
  // Haack/ogive-ish profile: radius(y) = r·(y/L)^k with k 0.6 (vK) / 0.72 (ogive).
  const k = shape === 'von-karman' ? 0.6 : 0.72;
  const nPts = 14;
  const right: string[] = [];
  const left: string[] = [];
  for (let i = 1; i <= nPts; i++) {
    const t = i / nPts;
    const y = t * length;
    const x = r * Math.pow(t, k);
    right.push(`L ${f(x)} ${f(y)}`);
    left.unshift(`L ${f(-x)} ${f(y)}`);
  }
  return `M 0 0 ${right.join(' ')} L ${f(-r)} ${f(length)} ${left.join(' ')} Z`;
}

/** 80% bell: quadratic bezier from throat to exit lip on each side. */
function bellPath(rThroat: number, rExit: number, length: number, yThroat: number): string {
  const yExit = yThroat + length;
  const cY = yThroat + length * 0.35; // control point pulls the bell shape
  return [
    `M ${f(-rThroat)} ${f(yThroat)}`,
    `Q ${f(-rExit * 0.9)} ${f(cY)} ${f(-rExit)} ${f(yExit)}`,
    `L ${f(rExit)} ${f(yExit)}`,
    `Q ${f(rExit * 0.9)} ${f(cY)} ${f(rThroat)} ${f(yThroat)}`,
    'Z',
  ].join(' ');
}

function finPath(fins: FinSet, r: number, yRootTop: number, side: 1 | -1): string {
  const tipX = side * (r + fins.span);
  const sweepDrop = fins.span * Math.tan(fins.sweep);
  return [
    `M ${f(side * r)} ${f(yRootTop)}`,
    `L ${f(tipX)} ${f(yRootTop + sweepDrop)}`,
    `L ${f(tipX)} ${f(yRootTop + sweepDrop + fins.tipChord)}`,
    `L ${f(side * r)} ${f(yRootTop + fins.rootChord)}`,
    'Z',
  ].join(' ');
}

const HATCH_BY_MATERIAL: Record<string, string> = {
  'al-2219': 'hatch-metal',
  'al-li-2195': 'hatch-metal',
  'ss-304l': 'hatch-metal',
  'ss-301fh': 'hatch-metal',
  'ti-6al4v': 'hatch-metal',
  'steel-4130': 'hatch-metal',
  cfrp: 'hatch-composite',
};

export function computeBlueprint(inp: BlueprintInputs): BlueprintGeometry {
  const { design, stages } = inp;
  const fillFrac = inp.propellantFraction ?? 1;
  const parts: BpPart[] = [];
  const dims: BpDimension[] = [];
  const leaders: BpLeader[] = [];
  const ghosts: BpGhost[] = [];

  const nStages = design.stages.length;
  const topStage = design.stages[nStages - 1]!;
  const topR = topStage.diameter / 2;
  let maxRadius = 0;
  for (const s of design.stages) maxRadius = Math.max(maxRadius, s.diameter / 2);

  let y = 0;

  // ————— nose / fairing —————
  const noseLength = design.noseFineness * topStage.diameter;
  parts.push({
    id: 'nose',
    label: design.fairing ? 'PAYLOAD FAIRING' : 'NOSE CONE',
    kind: design.fairing ? 'fairing' : 'nose',
    outline: nosePath(topR, noseLength, design.noseShape),
    hatch: 'hatch-composite',
    stage: -1,
  });
  leaders.push({ partId: 'nose', x: topR * 0.5, y: noseLength * 0.55, label: design.fairing ? 'FAIRING · CFRP' : `NOSE · ${design.noseShape.toUpperCase()}` });
  y += noseLength;

  // ————— payload bay —————
  const payloadLen = Math.max(0.25, 0.5 * topStage.diameter);
  parts.push({
    id: 'payload',
    label: 'PAYLOAD',
    kind: 'payload',
    outline: rect(topR * 0.82, y + payloadLen * 0.12, y + payloadLen * 0.88),
    hatch: '',
    stage: -1,
  });
  leaders.push({ partId: 'payload', x: 0, y: y + payloadLen / 2, label: `PAYLOAD · ${design.payloadMass.toFixed(0)} kg` });
  y += payloadLen;

  // ————— avionics ring —————
  const avLen = Math.max(0.08, 0.12 * topStage.diameter);
  parts.push({
    id: 'avionics',
    label: 'AVIONICS',
    kind: 'avionics',
    outline: rect(topR, y, y + avLen),
    hatch: 'hatch-metal',
    stage: -1,
  });
  y += avLen;

  // ————— chute bay (recovery) —————
  if (design.recovery) {
    const chuteLen = Math.max(0.1, 0.35 * topStage.diameter);
    parts.push({
      id: 'chute',
      label: 'RECOVERY',
      kind: 'chute',
      outline: rect(topR * 0.9, y + 0.01, y + chuteLen - 0.01),
      hatch: 'hatch-soft',
      stage: -1,
    });
    leaders.push({ partId: 'chute', x: -topR * 0.4, y: y + chuteLen / 2, label: `MAIN CHUTE · ${design.recovery.chuteArea.toFixed(1)} m²` });
    y += chuteLen;
  }

  // ————— stages, top → bottom (reverse index order) —————
  let finsRootTop = 0;
  for (let si = nStages - 1; si >= 0; si--) {
    const stage = design.stages[si]!;
    const geo = stages[si];
    const r = stage.diameter / 2;

    if (stage.propulsion.kind === 'liquid') {
      const tank = geo?.tank;
      const oxLen = tank ? tank.oxLength : stage.diameter * 1.2;
      const fuelLen = tank ? tank.fuelLength : stage.diameter * 0.9;
      const common = stage.tanks?.commonBulkhead ?? false;
      const domeH = r / 2;

      // Ox tank (on top by convention — denser propellant nearer CG).
      const oxCylTop = y + domeH;
      const oxCylBottom = oxCylTop + Math.max(0.05, oxLen - 2 * domeH);
      const oxSurface = oxCylBottom - (oxCylBottom - (y + domeH * 0.2)) * fillFrac;
      parts.push({
        id: `s${si}-ox`,
        label: 'OXIDIZER TANK',
        kind: 'tank-ox',
        outline: capsulePath(r, oxCylTop, oxCylBottom),
        hatch: HATCH_BY_MATERIAL[stage.tanks?.material ?? 'al-2219'] ?? 'hatch-metal',
        stage: si,
        liquid: { surfaceY: oxSurface, bottomY: oxCylBottom + domeH, halfWidth: r, kind: 'ox' },
      });
      leaders.push({ partId: `s${si}-ox`, x: r * 0.5, y: (oxCylTop + oxCylBottom) / 2, label: `LOX TANK · ${(stage.tanks?.material ?? '').toUpperCase()}` });
      y = oxCylBottom + domeH;

      // Intertank (skipped for common bulkhead).
      if (!common) {
        const itLen = Math.max(0.12, 0.3 * stage.diameter);
        parts.push({
          id: `s${si}-intertank`,
          label: 'INTERTANK',
          kind: 'intertank',
          outline: rect(r, y - domeH, y - domeH + itLen + domeH),
          hatch: '',
          stage: si,
        });
        y += itLen;
      } else {
        y -= domeH; // shared dome
      }

      // Fuel tank.
      const fuCylTop = y + domeH;
      const fuCylBottom = fuCylTop + Math.max(0.05, fuelLen - 2 * domeH);
      const fuSurface = fuCylBottom - (fuCylBottom - (y + domeH * 0.2)) * fillFrac;
      parts.push({
        id: `s${si}-fuel`,
        label: 'FUEL TANK',
        kind: 'tank-fuel',
        outline: capsulePath(r, fuCylTop, fuCylBottom),
        hatch: HATCH_BY_MATERIAL[stage.tanks?.material ?? 'al-2219'] ?? 'hatch-metal',
        stage: si,
        liquid: { surfaceY: fuSurface, bottomY: fuCylBottom + domeH, halfWidth: r, kind: 'fuel' },
      });
      y = fuCylBottom + domeH;

      // Thrust structure.
      const tsLen = Math.max(0.15, 0.3 * stage.diameter);
      parts.push({
        id: `s${si}-thrust`,
        label: 'THRUST STRUCTURE',
        kind: 'thrust-structure',
        outline: rect(r, y, y + tsLen),
        hatch: 'hatch-metal',
        stage: si,
      });
      y += tsLen;

      // Engine(s): chamber + bell. Draw a single centered bell for count 1,
      // or count bells spread across the base.
      const eng = geo?.engine;
      const rThroat = eng ? eng.throatDiameter / 2 : r * 0.12;
      const rExit = eng ? Math.min(eng.exitDiameter / 2, r * 0.92) : r * 0.35;
      const bellLen = eng ? eng.nozzleLength : stage.diameter * 0.6;
      const count = eng?.count ?? 1;
      const chamberLen = Math.max(0.1, bellLen * 0.4);
      const spread = count > 1 ? (r * 1.6) / count : 0;
      for (let ei = 0; ei < count; ei++) {
        const cx = count > 1 ? -((count - 1) * spread) / 2 + ei * spread : 0;
        const scale = count > 1 ? Math.min(1, spread / (2 * rExit)) : 1;
        const rT = rThroat * scale;
        const rE = rExit * scale;
        const chamber = `M ${f(cx - rT * 1.8)} ${f(y)} L ${f(cx + rT * 1.8)} ${f(y)} L ${f(cx + rT)} ${f(y + chamberLen)} L ${f(cx - rT)} ${f(y + chamberLen)} Z`;
        const bell = bellPath(rT, rE, bellLen * scale, y + chamberLen)
          .split('M ')[1]!;
        parts.push({
          id: `s${si}-engine${ei}`,
          label: `ENGINE ${ei + 1}`,
          kind: 'engine',
          outline: `${chamber} M ${offsetPathX(bell, cx)}`,
          hatch: 'hatch-metal',
          stage: si,
        });
      }
      if (count >= 1) {
        leaders.push({ partId: `s${si}-engine0`, x: rExit * 0.6, y: y + chamberLen + bellLen * 0.55, label: `${stage.propulsion.engine.cycle.toUpperCase()} ×${count}` });
      }
      const engineBottom = y + chamberLen + bellLen;

      // Nozzle exit diameter dimension (the ε lesson made visible).
      dims.push({
        id: `s${si}-exit-dia`,
        bind: si === 0 ? 'exitDiameter' : undefined,
        label: `⌀ ${(2 * rExit).toFixed(2)} m`,
        x1: -rExit,
        y1: engineBottom,
        x2: rExit,
        y2: engineBottom,
        orient: 'h',
        offset: 0.35,
      });

      if (si === 0) finsRootTop = y - tsLen - Math.max(0, (design.fins?.rootChord ?? 0) - tsLen);
      y = engineBottom;
    } else {
      // Solid stage: airframe tube (mostly empty — matches the mass model's
      // AIRFRAME_TUBE_LD), then case + integrated bell.
      const tubeLen = 3 * stage.diameter;
      parts.push({
        id: `s${si}-tube`,
        label: 'AIRFRAME',
        kind: 'intertank',
        outline: rect(r, y, y + tubeLen),
        hatch: '',
        stage: si,
      });
      y += tubeLen;
      // SolidPerformance.motorLength = case cylinder + nozzle; the bell is
      // drawn separately below, so the case is motorLength − nozzleLength.
      const solid = geo?.solid;
      const caseLen = solid
        ? Math.max(stage.diameter * 0.6, solid.motorLength - solid.nozzleLength)
        : stage.diameter * 4;
      const caseTop = y;
      const caseBottom = y + caseLen;
      parts.push({
        id: `s${si}-grain`,
        label: 'SOLID MOTOR',
        kind: 'solid-grain',
        outline: rect(r, caseTop, caseBottom),
        hatch: 'hatch-grain',
        stage: si,
      });
      leaders.push({ partId: `s${si}-grain`, x: r * 0.4, y: (caseTop + caseBottom) / 2, label: 'APCP GRAIN' });
      const rExit = solid ? Math.min(solid.exitDiameter / 2, r * 0.9) : r * 0.5;
      const bellLen = solid ? solid.nozzleLength : stage.diameter * 0.5;
      parts.push({
        id: `s${si}-engine0`,
        label: 'NOZZLE',
        kind: 'engine',
        outline: bellPath(r * 0.25, rExit, bellLen, caseBottom),
        hatch: 'hatch-metal',
        stage: si,
      });
      dims.push({
        id: `s${si}-exit-dia`,
        label: `⌀ ${(2 * rExit).toFixed(2)} m`,
        x1: -rExit,
        y1: caseBottom + bellLen,
        x2: rExit,
        y2: caseBottom + bellLen,
        orient: 'h',
        offset: 0.3,
      });
      if (si === 0) finsRootTop = caseBottom - (design.fins?.rootChord ?? 0);
      y = caseBottom + bellLen;
    }

    // Interstage below this stage (between si and si-1) — the skirt wraps the
    // upper stage's engines, so it spans backwards from the current y.
    if (si > 0) {
      const rBelow = design.stages[si - 1]!.diameter / 2;
      const isLen = design.stages[si]!.interstageLength || 0.6;
      parts.push({
        id: `s${si}-interstage`,
        label: 'INTERSTAGE',
        kind: 'interstage',
        outline: rect(Math.max(r, rBelow), y - isLen, y),
        hatch: '',
        stage: si,
      });
    }
  }

  const totalLength = y;

  // ————— fins —————
  if (design.fins) {
    const r0 = design.stages[0]!.diameter / 2;
    const rootTop = Math.min(finsRootTop, totalLength - design.fins.rootChord - 0.05);
    for (const side of [1, -1] as const) {
      parts.push({
        id: side === 1 ? 'fin-r' : 'fin-l',
        label: 'FIN',
        kind: 'fin',
        outline: finPath(design.fins, r0, rootTop, side),
        hatch: HATCH_BY_MATERIAL[design.fins.material] ?? 'hatch-composite',
        stage: 0,
      });
    }
    leaders.push({ partId: 'fin-r', x: r0 + design.fins.span * 0.7, y: finsRootTop + design.fins.rootChord * 0.5, label: `FIN ×${design.fins.count} · t ${(design.fins.thickness * 1e3).toFixed(1)} mm` });
  }

  // ————— stack-level dimensions —————
  dims.push({
    id: 'overall-length',
    bind: 'totalLength',
    label: `${totalLength.toFixed(2)} m`,
    x1: maxRadius + (design.fins?.span ?? 0),
    y1: 0,
    x2: maxRadius + (design.fins?.span ?? 0),
    y2: totalLength,
    orient: 'v',
    offset: 0.45,
  });
  dims.push({
    id: 'diameter',
    bind: 'diameter',
    label: `⌀ ${(maxRadius * 2).toFixed(2)} m`,
    x1: -maxRadius,
    y1: totalLength * 0.42,
    x2: maxRadius,
    y2: totalLength * 0.42,
    orient: 'h',
    offset: -totalLength * 0.42 + noseLength * 0.75,
  });

  // ————— CG/CP markers + static-margin dimension —————
  const markers: BpMarker[] = [];
  if (inp.cg !== undefined) markers.push({ id: 'cg', y: inp.cg });
  if (inp.cp !== undefined) markers.push({ id: 'cp', y: inp.cp });
  if (inp.cg !== undefined && inp.cp !== undefined) {
    dims.push({
      id: 'static-margin',
      bind: 'staticMargin',
      label: `SM ${(((inp.cp - inp.cg) / (2 * maxRadius)) || 0).toFixed(2)} cal`,
      // Anchor on the body edge and step left by a fixed margin, clear of the
      // CG/CP markers.
      x1: -maxRadius,
      y1: inp.cg,
      x2: -maxRadius,
      y2: inp.cp,
      orient: 'v',
      offset: -SM_DIM_MARGIN,
    });
  }

  // ————— silhouette (flight view) —————
  const silhouette = buildSilhouette(design, noseLength, totalLength, maxRadius);
  const halfWidth = maxRadius + Math.max(design.fins?.span ?? 0, SM_DIM_MARGIN);

  return { parts, dims, markers, leaders, ghosts, totalLength, maxRadius, halfWidth, silhouette };
}

/** Shift a path's x coordinates by dx (only for the simple bell paths we emit). */
function offsetPathX(path: string, dx: number): string {
  if (dx === 0) return path;
  return path.replace(/(-?\d+\.?\d*) (-?\d+\.?\d*)/g, (_, x: string, yv: string) => {
    return `${Number(Number(x) + dx).toFixed(4)} ${yv}`;
  });
}

function buildSilhouette(
  design: RocketDesign,
  noseLength: number,
  totalLength: number,
  r: number,
): string {
  const finSpan = design.fins?.span ?? 0;
  const finRoot = design.fins?.rootChord ?? 0;
  const bodyBottom = totalLength * 0.94;
  const pts: Array<[number, number]> = [
    [0, 0],
    [r, noseLength],
    [r, bodyBottom],
  ];
  if (finSpan > 0) {
    pts.push([r + finSpan, totalLength - finRoot * 0.2]);
    pts.push([r + finSpan, totalLength]);
    pts.push([r * 0.4, bodyBottom]);
  }
  pts.push([r * 0.5, totalLength]);
  const right = pts.map(([x, yy]) => `L ${f(x)} ${f(yy)}`);
  const left = pts
    .slice()
    .reverse()
    .map(([x, yy]) => `L ${f(-x)} ${f(yy)}`);
  return `M 0 0 ${right.join(' ')} ${left.join(' ')} Z`;
}
