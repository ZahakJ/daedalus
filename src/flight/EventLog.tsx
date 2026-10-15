/**
 * Horizontal mission-event ticker: past events lit, the next event dimmed
 * with a live countdown, failures in --danger with their detail. Follows the
 * 10 Hz playback mirror in the store; auto-scrolls to keep "next" in view.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useStore } from '../store.ts';
import type { FlightScene } from './playback.ts';
import { fmtMET } from './FlightCanvas.tsx';

interface Item {
  t: number;
  label: string;
  failure: boolean;
  detail?: string;
}

export function EventLog({ scene }: { scene: FlightScene }) {
  const tSec = useStore((s) => s.playback.tSec);
  const boxRef = useRef<HTMLDivElement>(null);

  const items = useMemo<Item[]>(() => {
    const evs: Item[] = scene.result.events.map((e) => ({
      t: e.t,
      label: e.label,
      failure: false,
    }));
    for (const f of scene.result.failures) {
      evs.push({ t: f.t, label: f.detail, failure: true });
    }
    evs.sort((a, b) => a.t - b.t);
    return evs;
  }, [scene]);

  const nextIdx = items.findIndex((it) => it.t > tSec + 1e-9);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const focus = nextIdx === -1 ? items.length - 1 : nextIdx;
    const el = box.children[focus] as HTMLElement | undefined;
    if (el) {
      box.scrollTo({ left: Math.max(0, el.offsetLeft - box.clientWidth * 0.38), behavior: 'smooth' });
    }
  }, [nextIdx, items]);

  return (
    <div className="fl-eventlog">
      <span className="fl-eventlog__title mono">SEQ</span>
      <div className="fl-eventlog__track" ref={boxRef}>
        {items.map((it, i) => {
          const past = it.t <= tSec + 1e-9;
          const isNext = i === nextIdx;
          const cls = [
            'fl-ev',
            it.failure ? 'fl-ev--failure' : '',
            past ? 'fl-ev--past' : isNext ? 'fl-ev--next' : 'fl-ev--future',
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <div key={`${it.t}-${i}`} className={cls} title={it.detail ?? it.label}>
              <span className="fl-ev__t mono">{fmtMET(it.t)}</span>
              <span className="fl-ev__label">{it.label}</span>
              {isNext && <span className="fl-ev__count mono">−{Math.max(0, it.t - tSec).toFixed(1)} s</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
