export type ClockListener = (nowMs: number) => void;

/**
 * A scrubbabe simulation clock: epoch + multiplier, driven externally by
 * advance(realDtMs) from the sim loop. Multiplier may be huge (up to ~1e7).
 */
export class SimClock {
  private simNowMs: number;
  private listeners = new Set<ClockListener>();
  multiplier = 1;
  paused = false;

  constructor(epochMs: number = Date.now()) {
    this.simNowMs = epochMs;
  }

  now(): number {
    return this.simNowMs;
  }

  nowDate(): Date {
    return new Date(this.simNowMs);
  }

  /** Advance sim time by a real-time delta (ms), scaled by the multiplier. */
  advance(realDtMs: number): void {
    if (this.paused) return;
    this.simNowMs += realDtMs * this.multiplier;
    this.emit();
  }

  /** Jump straight to an absolute sim time (scrubbing). */
  scrubTo(simMs: number): void {
    this.simNowMs = simMs;
    this.emit();
  }

  subscribe(fn: ClockListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn(this.simNowMs);
  }
}
