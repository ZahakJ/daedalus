/**
 * Hand-rolled localStorage persistence. Each slice is stored independently
 * under daedalus:v1:<slice> as { v, data }; loads run the migration chain then
 * a Zod safeParse. Corrupt payloads are backed up, never destroyed.
 */
import type { z } from 'zod';
import { PERSIST_VERSION } from './schema.ts';

const PREFIX = 'daedalus';

/** v→v+1 migration steps, indexed by FROM version. Empty until v2 exists. */
const MIGRATIONS: Array<(old: unknown) => unknown> = [];

function key(slice: string): string {
  return `${PREFIX}:v${PERSIST_VERSION}:${slice}`;
}

export function loadSlice<T>(slice: string, schema: z.ZodType<T>, fallback: T): T {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(key(slice));
  } catch {
    return fallback; // storage unavailable (private mode etc.)
  }
  if (raw === null) return fallback;
  try {
    const envelope = JSON.parse(raw) as { v?: number; data?: unknown };
    let data = envelope.data;
    let v = envelope.v ?? 1;
    while (v < PERSIST_VERSION) {
      const step = MIGRATIONS[v - 1];
      if (!step) break;
      data = step(data);
      v++;
    }
    const parsed = schema.safeParse(data);
    if (parsed.success) return parsed.data;
    console.warn(`daedalus: corrupt ${slice} slice — backed up, using defaults`, parsed.error);
    localStorage.setItem(`${PREFIX}:corrupt-backup:${slice}`, raw);
    return fallback;
  } catch (err) {
    console.warn(`daedalus: unreadable ${slice} slice — backed up, using defaults`, err);
    try {
      localStorage.setItem(`${PREFIX}:corrupt-backup:${slice}`, raw);
    } catch {
      /* ignore */
    }
    return fallback;
  }
}

const pending = new Map<string, unknown>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function flush(): void {
  flushTimer = null;
  for (const [slice, data] of pending) {
    try {
      localStorage.setItem(key(slice), JSON.stringify({ v: PERSIST_VERSION, data }));
    } catch (err) {
      console.warn(`daedalus: failed to persist ${slice}`, err);
    }
  }
  pending.clear();
}

/** Debounced (300 ms trailing) per-slice write; slices persist independently. */
export function saveSlice(slice: string, data: unknown): void {
  pending.set(slice, data);
  if (flushTimer !== null) clearTimeout(flushTimer);
  flushTimer = setTimeout(flush, 300);
}

/** Flush immediately (visibilitychange → hidden). Safe to call anytime. */
export function flushNow(): void {
  if (flushTimer !== null) clearTimeout(flushTimer);
  flush();
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushNow();
  });
}
