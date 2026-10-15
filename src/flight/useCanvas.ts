import { useEffect, useRef } from 'react';

/**
 * Size-aware canvas: keeps the backing store at devicePixelRatio, calls
 * `draw(ctx, cssW, cssH)` on every animation frame. Cheap for our scales
 * (≤ a few thousand marks) and gives the pulsing/flaring for free.
 */
export function useCanvas(draw: (ctx: CanvasRenderingContext2D, w: number, h: number, tMs: number) => void) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawRef = useRef(draw);
  drawRef.current = draw;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    let w = 0;
    let h = 0;
    const ro = new ResizeObserver(() => {
      const r = canvas.getBoundingClientRect();
      w = Math.max(1, Math.round(r.width));
      h = Math.max(1, Math.round(r.height));
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    });
    ro.observe(canvas);
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      if (w === 0) return;
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawRef.current(ctx, w, h, t);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return ref;
}
