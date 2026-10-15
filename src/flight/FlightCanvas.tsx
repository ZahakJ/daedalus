/**
 * The range view: full-bleed canvas compositing the five layers at 60 fps,
 * reading the playback clock directly (no React in the frame path). Camera
 * log-tracks altitude+speed (wheel = user zoom bias); thrust shakes it.
 */
import { useEffect, useRef } from 'react';
import { useCanvas } from './useCanvas.ts';
import { createCamera, targetLogScale, updateCamera } from './camera.ts';
import { sampleAt } from './sample.ts';
import { framePose, type FlightScene, type Playback } from './playback.ts';
import { drawAtmosphere } from './layers/atmosphere.ts';
import { drawGround } from './layers/ground.ts';
import { drawTrail } from './layers/trail.ts';
import { drawRocket } from './layers/rocket.ts';
import { drawPlume, flickerNoise, shakeAmplitude } from './layers/plume.ts';
import { fmtSIUnit } from '../components/bureau/fmt.ts';
import { R_EARTH } from '../physics/index.ts';

export function fmtMET(tSec: number): string {
  const t = Math.max(0, tSec);
  const mm = Math.floor(t / 60);
  const ss = t - mm * 60;
  return `T+${String(mm).padStart(2, '0')}:${ss < 10 ? '0' : ''}${ss.toFixed(1)}`;
}

interface HudCtx {
  f: ReturnType<typeof sampleAt>;
  /** Ground-relative downrange arc, m (the table's channel is inertial). */
  rng: number;
}
const HUD_ROWS: Array<{ label: string; value: (c: HudCtx) => string }> = [
  { label: 'ALT', value: (c) => fmtSIUnit(c.f.altitude, 'm') },
  { label: 'VEL', value: (c) => `${c.f.airspeed.toFixed(0)} m/s` },
  { label: 'MACH', value: (c) => c.f.mach.toFixed(2) },
  { label: 'Q', value: (c) => `${(c.f.q / 1e3).toFixed(1)} kPa` },
  { label: 'ACC', value: (c) => `${(c.f.accel / 9.80665).toFixed(1)} g` },
  {
    label: 'RNG',
    value: (c) =>
      Math.abs(c.rng) < 1 ? '0 m' : `${fmtSIUnit(Math.abs(c.rng), 'm')} ${c.rng >= 0 ? 'E' : 'W'}`,
  },
];

export function FlightCanvas({ playback, scene }: { playback: Playback; scene: FlightScene }) {
  const camRef = useRef(createCamera());
  const lastMsRef = useRef(0);
  const initRef = useRef(false);

  const ref = useCanvas((ctx, w, h, tMs) => {
    const dt = lastMsRef.current === 0 ? 16 : Math.min(tMs - lastMsRef.current, 100);
    lastMsRef.current = tMs;
    const clock = playback.clockRef.current;
    const t = clock.now() / 1000;
    const frame = sampleAt(scene.result.table, t);
    const pose = framePose(scene, frame);
    const cam = camRef.current;

    // AIRSPEED, not inertial speed — the pad frame carries ~465·cos(lat) m/s
    // of Earth rotation that must not zoom the camera out at liftoff.
    const targetLog = targetLogScale(frame.altitude, frame.airspeed);
    if (!initRef.current) {
      initRef.current = true;
      cam.cx = pose.x;
      cam.cy = pose.y;
      cam.logScale = targetLog;
    }
    updateCamera(cam, pose.x, pose.y, targetLog, dt);

    // camera shake while burning, scaled by sensed accel
    const amp = shakeAmplitude(frame);
    const shx = amp * (flickerNoise(t, 11) * 2 - 1);
    const shy = amp * (flickerNoise(t, 23) * 2 - 1);

    ctx.save();
    ctx.translate(shx, shy);
    drawAtmosphere(ctx, cam, frame, scene, w, h);
    drawGround(ctx, cam, frame, scene, w, h);
    drawTrail(ctx, cam, frame, scene, w, h);
    drawRocket(ctx, cam, frame, scene, w, h);
    drawPlume(ctx, cam, frame, scene, w, h);
    ctx.restore();

    const rng = Math.atan2(pose.x, pose.y) * R_EARTH;
    drawHudBlock(ctx, { f: frame, rng }, t);
  });

  // wheel zoom bias (non-passive so we can preventDefault)
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      const cam = camRef.current;
      cam.userBias = Math.max(-3.5, Math.min(4, cam.userBias - e.deltaY * 0.0016));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [ref]);

  return <canvas ref={ref} className="fl-canvas" />;
}

/** Top-left live telemetry block, drawn every frame. */
function drawHudBlock(ctx: CanvasRenderingContext2D, c: HudCtx, t: number): void {
  const x = 14;
  let y = 14;
  const lh = 15;
  ctx.save();
  ctx.fillStyle = 'rgba(4, 6, 10, 0.55)';
  ctx.fillRect(x - 8, y - 8, 158, lh * (HUD_ROWS.length + 1) + 14);
  ctx.font = '11px "JetBrains Mono Variable", monospace';
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(255, 138, 64, 0.95)';
  ctx.fillText(fmtMET(t), x, y);
  y += lh + 3;
  for (const row of HUD_ROWS) {
    ctx.fillStyle = 'rgba(92, 101, 112, 1)';
    ctx.fillText(row.label, x, y);
    ctx.fillStyle = 'rgba(230, 235, 242, 0.92)';
    ctx.textAlign = 'right';
    ctx.fillText(row.value(c), x + 142, y);
    ctx.textAlign = 'left';
    y += lh;
  }
  ctx.restore();
}
