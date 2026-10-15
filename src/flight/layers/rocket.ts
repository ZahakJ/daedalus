/**
 * Vehicle layer: the actual blueprint silhouette (computeBlueprint) of the
 * currently-attached stack, scaled by the camera and rotated to the commanded
 * pitch; below ~6 px of drawn length it degrades to an oriented chevron.
 */
import { pxPerMeter, worldToScreen, type Camera } from '../camera.ts';
import type { FrameSample } from '../sample.ts';
import { configIndexAt, framePose, type FlightScene } from '../playback.ts';

const BODY = '#dfe6ef';

export function drawRocket(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  frame: FrameSample,
  scene: FlightScene,
  w: number,
  h: number,
): void {
  const pose = framePose(scene, frame);
  const [sx, sy] = worldToScreen(cam, pose.x, pose.y, w, h);
  if (sx < -100 || sx > w + 100 || sy < -100 || sy > h + 100) return;
  const s = pxPerMeter(cam);
  const cfg = scene.configs[configIndexAt(scene, frame.t)] ?? scene.configs[0]!;

  // screen-space body axis (world y up → screen y down)
  const ux = pose.axx;
  const uy = -pose.axy;

  // canopy overhead once the chute is out (and until touchdown)
  if (
    scene.chuteTime !== null &&
    frame.t >= scene.chuteTime &&
    frame.altitude > 1 &&
    frame.thrust <= 0
  ) {
    drawCanopy(ctx, sx, sy, pose.upx, -pose.upy, Math.max(10, Math.min(26, cfg.length * s * 2)));
  }

  const Lpx = cfg.length * s;
  if (Lpx < 6 || !cfg.path) {
    // oriented chevron: still tells you which way she points
    const len = 4.5;
    const half = 2.6;
    const px = -uy; // perpendicular
    const py = ux;
    ctx.fillStyle = BODY;
    ctx.beginPath();
    ctx.moveTo(sx + ux * len, sy + uy * len);
    ctx.lineTo(sx - ux * len + px * half, sy - uy * len + py * half);
    ctx.lineTo(sx - ux * len - px * half, sy - uy * len - py * half);
    ctx.closePath();
    ctx.fill();
    return;
  }

  // silhouette local frame: y=0 nose, +y aft; we want +y along −axis.
  const th = Math.atan2(ux, -uy);
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(th);
  ctx.scale(s, s);
  ctx.translate(0, -cfg.length / 2);
  ctx.fillStyle = BODY;
  ctx.fill(cfg.path);
  ctx.restore();
}

/** Small canopy arc + shrouds along local up (screen dir upx,upy). */
function drawCanopy(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  upx: number,
  upy: number,
  r: number,
): void {
  const cx = sx + upx * r * 2.2;
  const cy = sy + upy * r * 2.2;
  const base = Math.atan2(upy, upx); // screen angle of "up"
  ctx.save();
  ctx.strokeStyle = 'rgba(223, 230, 239, 0.85)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(cx, cy, r, base - Math.PI * 0.5 - 0.35, base + Math.PI * 0.5 + 0.35);
  ctx.stroke();
  // shroud lines from canopy skirt to the vehicle
  ctx.lineWidth = 0.8;
  ctx.globalAlpha = 0.6;
  for (const a of [-0.5, 0, 0.5]) {
    const th2 = base + Math.PI + a; // skirt-side angles
    const px = cx + Math.cos(th2 + Math.PI) * r;
    const py = cy + Math.sin(th2 + Math.PI) * r;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(sx, sy);
    ctx.stroke();
  }
  ctx.restore();
}
