/**
 * Ring-buffer strip chart: the telemetry instrument. Playback fills buffers
 * from the trajectory table as the clock advances; scrubbing refills the
 * window. Drawing is O(window). Limit lines are the user's own design margins
 * — the danger hairline the trace is not supposed to kiss.
 */
export interface StripChannel {
  label: string;
  unit: string;
  /** Extract the channel value from a frame sample. */
  color: string;
  /** Dashed danger hairline (design limit), world units. */
  limit?: number;
  /** Fixed max for the y-scale; otherwise auto from window. */
  fixedMax?: number;
}

export interface StripBuffer {
  t: Float32Array;
  v: Float32Array;
  head: number;
  count: number;
  capacity: number;
}

export function createBuffer(capacity = 600): StripBuffer {
  return {
    t: new Float32Array(capacity),
    v: new Float32Array(capacity),
    head: 0,
    count: 0,
    capacity,
  };
}

export function pushSample(buf: StripBuffer, t: number, v: number): void {
  buf.t[buf.head] = t;
  buf.v[buf.head] = v;
  buf.head = (buf.head + 1) % buf.capacity;
  buf.count = Math.min(buf.count + 1, buf.capacity);
}

export function clearBuffer(buf: StripBuffer): void {
  buf.head = 0;
  buf.count = 0;
}

/** Refill a buffer for the window [t0, t1] by sampling fn at capacity points. */
export function refillBuffer(buf: StripBuffer, t0: number, t1: number, fn: (t: number) => number): void {
  clearBuffer(buf);
  const n = buf.capacity;
  for (let i = 0; i < n; i++) {
    const t = t0 + ((t1 - t0) * i) / (n - 1);
    pushSample(buf, t, fn(t));
  }
}

/** Draw one strip chart into a 2D context. Instrument grammar: hairline grid,
    mono labels, 1px trace, dashed danger limit, current value big. */
export function drawStrip(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  buf: StripBuffer,
  ch: StripChannel,
  tNow: number,
  windowSec: number,
  format: (v: number) => string,
  events?: Array<{ t: number }>,
): void {
  ctx.clearRect(0, 0, w, h);
  const padL = 6;
  const padR = 58;
  const padT = 14;
  const padB = 6;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;
  const t0 = tNow - windowSec;

  // y-scale from window (and limit, so the hairline is always visible)
  let vMax = ch.fixedMax ?? 0;
  if (ch.fixedMax === undefined) {
    for (let k = 0; k < buf.count; k++) {
      const i = (buf.head - 1 - k + buf.capacity * 2) % buf.capacity;
      if (buf.t[i]! < t0) break;
      vMax = Math.max(vMax, Math.abs(buf.v[i]!));
    }
    if (ch.limit !== undefined) vMax = Math.max(vMax, ch.limit * 1.1);
    if (vMax === 0) vMax = 1;
    vMax *= 1.12;
  }

  const xOf = (t: number): number => padL + ((t - t0) / windowSec) * plotW;
  const yOf = (v: number): number => padT + plotH - (v / vMax) * plotH;

  // grid: 3 horizontal hairlines
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  for (let g = 1; g <= 3; g++) {
    const y = padT + (plotH * g) / 4;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + plotW, y);
    ctx.stroke();
  }

  // event ticks along the top edge
  if (events) {
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    for (const e of events) {
      if (e.t < t0 || e.t > tNow) continue;
      const x = xOf(e.t);
      ctx.beginPath();
      ctx.moveTo(x, padT - 6);
      ctx.lineTo(x, padT);
      ctx.stroke();
    }
  }

  // limit hairline
  if (ch.limit !== undefined && ch.limit <= vMax) {
    ctx.save();
    ctx.strokeStyle = '#ff6b6b';
    ctx.globalAlpha = 0.75;
    ctx.setLineDash([5, 4]);
    const y = yOf(ch.limit);
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + plotW, y);
    ctx.stroke();
    ctx.restore();
  }

  // trace
  ctx.strokeStyle = ch.color;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  let started = false;
  let latest = 0;
  for (let k = buf.count - 1; k >= 0; k--) {
    const i = (buf.head - 1 - k + buf.capacity * 2) % buf.capacity;
    const t = buf.t[i]!;
    if (t < t0 || t > tNow) continue;
    const x = xOf(t);
    const y = yOf(buf.v[i]!);
    if (!started) {
      ctx.moveTo(x, y);
      started = true;
    } else {
      ctx.lineTo(x, y);
    }
    latest = buf.v[i]!;
  }
  ctx.stroke();

  // labels: channel name top-left, live value right
  ctx.font = '9px "JetBrains Mono Variable", monospace';
  ctx.fillStyle = 'rgba(154,164,178,0.9)';
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillText(`${ch.label}`, padL, 2);
  ctx.textAlign = 'right';
  ctx.fillStyle = ch.color;
  ctx.font = '11px "JetBrains Mono Variable", monospace';
  ctx.fillText(format(latest), w - 4, 2);
  ctx.fillStyle = 'rgba(92,101,112,0.9)';
  ctx.font = '8px "JetBrains Mono Variable", monospace';
  ctx.fillText(ch.unit, w - 4, 14);
}
