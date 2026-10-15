/**
 * Ground layer, camera-relative double precision throughout (see camera.ts):
 * the Earth's surface is sampled as a polyline around the sub-camera point —
 * a flat horizon at pad scale, the planet's limb arc once the camera zooms to
 * orbital scale — plus the launch complex (pad, flame trench, gantry) and
 * adaptive distance ticks along the surface.
 */
import { R_EARTH } from '../../physics/index.ts';
import { fmtSIUnit } from '../../components/bureau/fmt.ts';
import { pxPerMeter, worldToScreen, type Camera } from '../camera.ts';
import type { FrameSample } from '../sample.ts';
import type { FlightScene } from '../playback.ts';

const SURFACE = 'rgba(214, 224, 238, 0.4)';
const GROUND_FILL = '#0a0d11';
const STRUCTURE = 'rgba(196, 208, 224, 0.5)';
const TICK = 'rgba(154, 164, 178, 0.65)';

const TICK_STEPS = [100, 250, 500, 1e3, 2.5e3, 5e3, 1e4, 2.5e4, 5e4, 1e5, 2.5e5, 5e5, 1e6, 2.5e6];

export function drawGround(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  _frame: FrameSample,
  scene: FlightScene,
  w: number,
  h: number,
): void {
  const s = pxPerMeter(cam);
  const spanM = Math.hypot(w, h) / s; // meters across the screen diagonal
  const thC = Math.atan2(cam.cx, cam.cy); // sub-camera angle east of pad
  const dTh = Math.min(Math.PI * 0.92, (spanM * 1.4) / R_EARTH + 1e-7);

  // ————— surface polyline + filled interior —————
  const N = 96;
  const depth = Math.min(R_EARTH * 0.55, spanM * 2 + 200);
  ctx.beginPath();
  for (let i = 0; i <= N; i++) {
    const th = thC - dTh + (2 * dTh * i) / N;
    const [px, py] = worldToScreen(cam, R_EARTH * Math.sin(th), R_EARTH * Math.cos(th), w, h);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  for (let i = N; i >= 0; i--) {
    const th = thC - dTh + (2 * dTh * i) / N;
    const r = R_EARTH - depth;
    const [px, py] = worldToScreen(cam, r * Math.sin(th), r * Math.cos(th), w, h);
    ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = GROUND_FILL;
  ctx.fill();
  ctx.strokeStyle = SURFACE;
  ctx.lineWidth = 1;
  // re-stroke just the surface edge
  ctx.beginPath();
  for (let i = 0; i <= N; i++) {
    const th = thC - dTh + (2 * dTh * i) / N;
    const [px, py] = worldToScreen(cam, R_EARTH * Math.sin(th), R_EARTH * Math.cos(th), w, h);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();

  drawTicks(ctx, cam, w, h, s, thC, dTh);
  if (s > 0.9) drawLaunchComplex(ctx, cam, scene, w, h, s);
}

/** Downrange distance ticks along the surface, spacing adapted to zoom. */
function drawTicks(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  w: number,
  h: number,
  s: number,
  thC: number,
  dTh: number,
): void {
  let step = 0;
  for (const st of TICK_STEPS) {
    if (st * s >= 72) {
      step = st;
      break;
    }
  }
  if (step === 0) return;
  const dC = thC * R_EARTH; // sub-camera downrange arc, m
  const halfSpan = dTh * R_EARTH;
  const k0 = Math.ceil((dC - halfSpan) / step);
  const k1 = Math.floor((dC + halfSpan) / step);
  if (k1 - k0 > 40) return;
  ctx.font = '9px "JetBrains Mono Variable", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (let k = k0; k <= k1; k++) {
    const d = k * step;
    const th = d / R_EARTH;
    const sx = Math.sin(th);
    const cy = Math.cos(th);
    const [ax, ay] = worldToScreen(cam, R_EARTH * sx, R_EARTH * cy, w, h);
    if (ax < -20 || ax > w + 20 || ay < -20 || ay > h + 20) continue;
    // tick points inward along the local radial
    const [bx, by] = worldToScreen(cam, (R_EARTH - 7 / s) * sx, (R_EARTH - 7 / s) * cy, w, h);
    ctx.strokeStyle = TICK;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
    if (k !== 0) {
      ctx.fillStyle = TICK;
      ctx.fillText(fmtSIUnit(d, 'm', 3), bx, by + 2);
    }
  }
}

/** Pad slab, flame trench and gantry tower at the origin of the range. */
function drawLaunchComplex(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  scene: FlightScene,
  w: number,
  h: number,
  s: number,
): void {
  // Local pad frame: x east (m), y up (m) from the pad surface point (0, R).
  const P = (x: number, y: number): [number, number] =>
    worldToScreen(cam, x, R_EARTH + y, w, h);
  const line = (x1: number, y1: number, x2: number, y2: number): void => {
    const [a, b] = P(x1, y1);
    const [c, d] = P(x2, y2);
    ctx.beginPath();
    ctx.moveTo(a, b);
    ctx.lineTo(c, d);
    ctx.stroke();
  };
  const rect = (x1: number, y1: number, x2: number, y2: number, fill: string): void => {
    const [a, b] = P(x1, y1);
    const [c, d] = P(x2, y2);
    ctx.fillStyle = fill;
    ctx.fillRect(Math.min(a, c), Math.min(b, d), Math.abs(c - a), Math.abs(d - b));
  };

  const L = scene.stackLength;
  const rr = (scene.configs[0]?.radius ?? 0.5) + 0.4;
  const rail = scene.design.launch.railLength;

  // pad deck + flame trench
  rect(-L * 0.6, 0, L * 0.6, L * 0.05, '#11151b');
  rect(-rr * 1.4, 0, rr * 1.4, -L * 0.1, '#05070a');
  ctx.strokeStyle = STRUCTURE;
  ctx.lineWidth = 1;
  line(-L * 0.6, L * 0.05, L * 0.6, L * 0.05);

  if (rail > 0) {
    // sounding launch: the rail IS the structure — a guyed truss mast beside
    // the vehicle, exactly railLength tall (the rail-exit-speed lesson).
    const rx = -(rr + 0.25);
    line(rx, 0, rx, rail);
    line(rx - 0.35, 0, rx - 0.35, rail * 0.92);
    const bays2 = Math.max(3, Math.round(rail / 0.9));
    for (let i = 0; i <= bays2; i++) {
      const y0 = (rail * 0.92 * i) / bays2;
      const y1 = (rail * 0.92 * (i + 1)) / bays2;
      if (i < bays2) line(rx - 0.35, y0, rx, y1);
    }
    // guy wires
    line(rx - 0.35, rail * 0.88, rx - rail * 0.45, 0);
    line(rx, rail * 0.7, rx + rail * 0.5 + rr * 2, 0);
    return;
  }

  // gantry tower west of the vehicle
  const gx0 = -(rr + L * 0.06) - L * 0.075; // tower west face
  const gx1 = -(rr + L * 0.06); // tower east face
  const gh = L * 1.08;
  rect(gx0, L * 0.05, gx1, gh, 'rgba(10, 13, 17, 0.85)');
  line(gx0, L * 0.05, gx0, gh);
  line(gx1, L * 0.05, gx1, gh);
  // X-bracing
  const bays = 9;
  for (let i = 0; i < bays; i++) {
    const y0 = L * 0.05 + ((gh - L * 0.05) * i) / bays;
    const y1 = L * 0.05 + ((gh - L * 0.05) * (i + 1)) / bays;
    line(gx0, y0, gx1, y1);
    line(gx1, y0, gx0, y1);
  }
  // service arms toward the vehicle
  for (const fy of [0.32, 0.62, 0.9]) {
    line(gx1, gh * fy, -rr * 0.6, gh * fy);
  }
  // lightning mast
  line((gx0 + gx1) / 2, gh, (gx0 + gx1) / 2, gh + L * 0.22);

  // hold-down posts either side of the nozzle
  if (s > 4) {
    line(-rr, L * 0.05, -rr * 0.5, L * 0.14);
    line(rr, L * 0.05, rr * 0.5, L * 0.14);
  }
}
