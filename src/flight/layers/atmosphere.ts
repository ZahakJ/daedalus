/**
 * Sky layer: a vertical gradient whose color is the actual USSA-76 density at
 * each screen row's altitude — sea-level blue thins to indigo and is gone by
 * ~80 km — plus a deterministic starfield that fades in above ~55 km.
 */
import { atmosphere, R_EARTH } from '../../physics/index.ts';
import { rngFrom } from '../../sim/rng.ts';
import { pxPerMeter, type Camera } from '../camera.ts';
import type { FrameSample } from '../sample.ts';
import type { FlightScene } from '../playback.ts';

/** Sea-level sky (deep drafting-table blue, not daylight). */
const SKY: [number, number, number] = [13, 30, 58];
/** Space. Not pure black — the panel around it is #04060a. */
const SPACE: [number, number, number] = [2, 3, 8];
const RHO0 = 1.225;

function skyColor(alt: number): string {
  const rho = atmosphere(Math.max(0, alt)).density / RHO0;
  const t = Math.pow(Math.min(1, Math.max(0, rho)), 0.42);
  const r = SPACE[0] + (SKY[0] - SPACE[0]) * t;
  const g = SPACE[1] + (SKY[1] - SPACE[1]) * t;
  const b = SPACE[2] + (SKY[2] - SPACE[2]) * t;
  return `rgb(${r.toFixed(0)},${g.toFixed(0)},${b.toFixed(0)})`;
}

interface Star {
  x: number;
  y: number;
  r: number;
  a: number;
}
let STARS: Star[] | null = null;
function stars(): Star[] {
  if (!STARS) {
    const rng = rngFrom('stars');
    STARS = [];
    for (let i = 0; i < 170; i++) {
      STARS.push({
        x: rng(),
        y: rng(),
        r: rng() < 0.12 ? 1.5 : 1,
        a: 0.25 + rng() * 0.7,
      });
    }
  }
  return STARS;
}

export function drawAtmosphere(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  _frame: FrameSample,
  _scene: FlightScene,
  w: number,
  h: number,
): void {
  const s = pxPerMeter(cam);
  const camAlt = Math.hypot(cam.cx, cam.cy) - R_EARTH;
  // Approximate altitude along the local radial for a screen row.
  const altAt = (yPx: number): number => camAlt + (h * 0.62 - yPx) / s;

  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, skyColor(altAt(0)));
  grad.addColorStop(0.38, skyColor(altAt(h * 0.38)));
  grad.addColorStop(0.62, skyColor(altAt(h * 0.62)));
  grad.addColorStop(1, skyColor(altAt(h)));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Starfield: fixed to the sky (screen space), fading in with thin air.
  const fade = Math.min(1, Math.max(0, (camAlt - 55e3) / 45e3));
  if (fade > 0.01) {
    ctx.save();
    for (const st of stars()) {
      ctx.globalAlpha = st.a * fade;
      ctx.fillStyle = '#cfd8e6';
      ctx.fillRect(st.x * w, st.y * h, st.r, st.r);
    }
    ctx.restore();
  }
}
