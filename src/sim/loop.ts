export interface SimLoopOptions {
  /** Fixed update timestep in ms (simulation determinism). */
  fixedDtMs: number;
  /** Called zero or more times per frame with the fixed dt. */
  update: (dtMs: number) => void;
  /** Called once per animation frame with the interpolation alpha [0,1). */
  render: (alpha: number, frameDtMs: number) => void;
  /** Max updates per frame before the accumulator is clamped (spiral-of-death guard). */
  maxUpdatesPerFrame?: number;
}

export interface SimLoop {
  start(): void;
  pause(): void;
  resume(): void;
  readonly running: boolean;
  dispose(): void;
}

/** rAF-driven fixed-timestep loop with accumulator and panic clamp. */
export function createSimLoop(opts: SimLoopOptions): SimLoop {
  const { fixedDtMs, update, render, maxUpdatesPerFrame = 8 } = opts;
  let raf = 0;
  let last = 0;
  let acc = 0;
  let running = false;
  let disposed = false;

  const frame = (t: number) => {
    if (!running || disposed) return;
    const frameDt = last === 0 ? fixedDtMs : Math.min(t - last, 250);
    last = t;
    acc += frameDt;
    let n = 0;
    while (acc >= fixedDtMs && n < maxUpdatesPerFrame) {
      update(fixedDtMs);
      acc -= fixedDtMs;
      n++;
    }
    if (n === maxUpdatesPerFrame && acc >= fixedDtMs) acc = 0; // panic clamp
    render(acc / fixedDtMs, frameDt);
    raf = requestAnimationFrame(frame);
  };

  return {
    get running() {
      return running;
    },
    start() {
      if (running || disposed) return;
      running = true;
      last = 0;
      raf = requestAnimationFrame(frame);
    },
    pause() {
      running = false;
      cancelAnimationFrame(raf);
    },
    resume() {
      this.start();
    },
    dispose() {
      disposed = true;
      running = false;
      cancelAnimationFrame(raf);
    },
  };
}
