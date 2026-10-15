/**
 * Flown-path trail: the trajectory table up to "now", decimated to ≤ ~700
 * points, phase-colored (powered stage 0 / powered upper / coast) with a soft
 * additive glow pass under a crisp core pass.
 */
import { indexAt, type FrameSample } from '../sample.ts';
import { worldToScreen, type Camera } from '../camera.ts';
import { framePose, type FlightScene } from '../playback.ts';

/** Phase → stroke color prefix (alpha appended per pass). */
const PHASE_RGB: string[] = [
  '255,138,64', // stage 0 burn — ignition orange (the accent: your engine)
  '255,196,120', // upper-stage burn
  '255,222,168', // third burn, if ever
  '124,152,192', // coast / descent — cold steel
];

function phaseOf(stage: number, thrust: number): number {
  if (stage >= 0 && thrust > 0) return Math.min(stage, 2);
  return 3;
}

export function drawTrail(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  frame: FrameSample,
  scene: FlightScene,
  w: number,
  h: number,
): void {
  const table = scene.result.table;
  const iNow = indexAt(table, frame.t);
  if (iNow < 2) return;
  const step = Math.max(1, Math.floor(iNow / 700));

  // Precompute screen points + phases for the decimated set (+ live endpoint).
  const xs: number[] = [];
  const ys: number[] = [];
  const ph: number[] = [];
  for (let i = 0; i <= iNow; i += step) {
    const [sx, sy] = worldToScreen(cam, scene.gx[i]!, scene.gy[i]!, w, h);
    xs.push(sx);
    ys.push(sy);
    ph.push(phaseOf(table.stage[i]!, table.thrust[i]!));
  }
  const pose = framePose(scene, frame);
  const [ex, ey] = worldToScreen(cam, pose.x, pose.y, w, h);
  xs.push(ex);
  ys.push(ey);
  ph.push(phaseOf(frame.stage, frame.thrust));

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (const pass of [0, 1] as const) {
    ctx.lineWidth = pass === 0 ? 4 : 1.4;
    if (pass === 0) ctx.globalCompositeOperation = 'lighter';
    let runPhase = -1;
    for (let i = 1; i < xs.length; i++) {
      const p = ph[i - 1]!;
      if (p !== runPhase) {
        if (runPhase !== -1) ctx.stroke();
        runPhase = p;
        const alpha = pass === 0 ? (p === 3 ? 0.05 : 0.13) : p === 3 ? 0.55 : 0.9;
        ctx.strokeStyle = `rgba(${PHASE_RGB[p]!},${alpha})`;
        ctx.beginPath();
        ctx.moveTo(xs[i - 1]!, ys[i - 1]!);
      }
      ctx.lineTo(xs[i]!, ys[i]!);
    }
    if (runPhase !== -1) ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.restore();
}
