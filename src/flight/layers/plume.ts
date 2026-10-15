/**
 * Exhaust plume: additive teardrop anchored at the nozzle exit. Shape follows
 * the physics — narrow column at sea level, huge underexpanded bloom in
 * vacuum (pe/pa) — with deterministic time-seeded flicker. Also exports the
 * camera-shake amplitude used by FlightCanvas while thrust > 0.
 */
import { atmosphere } from '../../physics/index.ts';
import { pxPerMeter, worldToScreen, type Camera } from '../camera.ts';
import type { FrameSample } from '../sample.ts';
import { configIndexAt, framePose, type FlightScene } from '../playback.ts';

/** Deterministic 1D noise in [0,1] — harmonics of sim time, no Math.random. */
export function flickerNoise(t: number, salt = 0): number {
  const v =
    Math.sin(t * 97.31 + salt) * Math.sin(t * 151.71 + 2.09 + salt) * 0.5 +
    Math.sin(t * 61.13 + 0.71 + salt * 1.7) * 0.35 +
    Math.sin(t * 233.7 + salt * 0.4) * 0.15;
  return 0.5 + v * 0.5;
}

/** Camera shake amplitude (css px) for the current frame. */
export function shakeAmplitude(frame: FrameSample): number {
  if (frame.thrust <= 0) return 0;
  return Math.min(2.2, frame.accel / 35) * (0.6 + 0.4 * frame.throttle);
}

export function drawPlume(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  frame: FrameSample,
  scene: FlightScene,
  w: number,
  h: number,
): void {
  if (frame.thrust <= 0 || frame.throttle <= 0) return;
  const st = Math.max(0, Math.floor(frame.stage));
  const exit = scene.stageExits[st] ?? scene.stageExits[0];
  if (!exit) return;

  const pose = framePose(scene, frame);
  const cfg = scene.configs[configIndexAt(scene, frame.t)] ?? scene.configs[0]!;
  const s = pxPerMeter(cam);

  // nozzle exit point = stack center − axis·L/2 (world meters)
  const tx = pose.x - pose.axx * (cfg.length / 2);
  const ty = pose.y - pose.axy * (cfg.length / 2);
  const [sx, sy] = worldToScreen(cam, tx, ty, w, h);
  if (sx < -200 || sx > w + 200 || sy < -200 || sy > h + 200) return;

  // plume direction on screen: opposite the body axis
  const dx = -pose.axx;
  const dy = pose.axy; // world→screen y flip
  const th = Math.atan2(dx, -dy); // rotate so local +y runs down the plume

  // expansion state: pe/pa → bloom factor (1 ≈ ideally expanded column)
  const pa = atmosphere(Math.max(0, frame.altitude)).pressure;
  const pr = exit.pe / Math.max(pa, 0.02);
  const bloom = Math.min(6.5, Math.max(0.55, Math.sqrt(pr) * 0.55));

  const flick = 0.86 + 0.28 * flickerNoise(frame.t);
  const throttle = frame.throttle;
  const lenM = exit.radius * 2 * (6 + 5 * Math.min(bloom, 4.2)) * (0.45 + 0.55 * throttle) * flick;
  const widM = exit.radius * 2 * bloom * (0.8 + 0.2 * flick);

  // screen sizes, clamped so the plume stays alive when the vehicle is a dot
  const Ls = Math.min(Math.max(lenM * s, 7), h * 1.6);
  const Ws = Math.min(Math.max(widM * s, 2.5), w * 0.8);

  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(th);
  ctx.globalCompositeOperation = 'lighter';

  // outer bloom
  const outer = ctx.createLinearGradient(0, 0, 0, Ls);
  outer.addColorStop(0, `rgba(255, 214, 170, ${0.5 * throttle})`);
  outer.addColorStop(0.35, `rgba(255, 150, 80, ${0.28 * throttle})`);
  outer.addColorStop(1, 'rgba(255, 120, 60, 0)');
  teardrop(ctx, Ws / 2, Ls);
  ctx.fillStyle = outer;
  ctx.fill();

  // inner core — hotter, narrower, flickers independently
  const coreL = Ls * (0.5 + 0.12 * flickerNoise(frame.t, 5));
  const core = ctx.createLinearGradient(0, 0, 0, coreL);
  core.addColorStop(0, `rgba(255, 244, 224, ${0.85 * throttle})`);
  core.addColorStop(0.5, `rgba(255, 190, 120, ${0.4 * throttle})`);
  core.addColorStop(1, 'rgba(255, 160, 90, 0)');
  teardrop(ctx, Math.max(1.4, Ws * 0.19), coreL);
  ctx.fillStyle = core;
  ctx.fill();

  // mach diamonds when roughly ideally/over-expanded in dense air
  if (pr < 1.6 && Ls > 26 && s * exit.radius > 1.2) {
    ctx.fillStyle = `rgba(255, 240, 210, ${0.5 * throttle})`;
    const n = 3;
    for (let i = 1; i <= n; i++) {
      const y = (coreL * i) / (n + 1);
      const r = Math.max(1, Ws * 0.1 * (1 - i / (n + 2)));
      ctx.beginPath();
      ctx.ellipse(0, y, r, r * 1.9, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

/** Teardrop: bulges to ±r then converges at (0, len). Origin = nozzle exit. */
function teardrop(ctx: CanvasRenderingContext2D, r: number, len: number): void {
  ctx.beginPath();
  ctx.moveTo(-r * 0.55, 0);
  ctx.bezierCurveTo(-r, len * 0.22, -r * 0.72, len * 0.62, 0, len);
  ctx.bezierCurveTo(r * 0.72, len * 0.62, r, len * 0.22, r * 0.55, 0);
  ctx.closePath();
}
