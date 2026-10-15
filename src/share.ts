/**
 * Shareable design links. A design travels in the URL fragment as
 *
 *   #/m/<mission>/<kind>/<payload>     kind: d = design, f = flight, r = report
 *
 * payload = base64url( [SHARE_VERSION] ++ deflate-raw( JSON {m, d, r?} ) )
 *
 * The engine is deterministic and the weather depends only on the mission, so
 * the design (plus the revision letter, for the seed label) reproduces the
 * flight exactly. Decoding validates the version, the size, the mission in the
 * path against the one inside the payload, and the design against the zod
 * schema used for localStorage.
 */
import { z } from 'zod';
import type { RocketDesign } from './physics/types.ts';
import { missionIdSchema, rocketDesignSchema, type MissionId } from './schema.ts';

/** Bump when the payload layout changes; older links are then rejected. */
export const SHARE_VERSION = 1;

/** Longest payload accepted (characters of base64url). */
export const MAX_PAYLOAD_CHARS = 4096;
/** Largest inflated JSON accepted (bytes), against deflate bombs. */
const MAX_JSON_BYTES = 32 * 1024;

export type ShareKind = 'design' | 'flight' | 'report';
export const KIND_SEGMENT: Record<ShareKind, string> = { design: 'd', flight: 'f', report: 'r' };

const payloadSchema = z
  .object({
    m: missionIdSchema,
    d: rocketDesignSchema,
    r: z.string().regex(/^[A-Z]$/).optional(),
  })
  .strict();

export interface SharedDesign {
  missionId: MissionId;
  design: RocketDesign;
  /** Revision letter of the flight this link was shared from, if any. */
  rev?: string;
}

export type DecodeResult = ({ ok: true } & SharedDesign) | { ok: false; error: string };

// ————— base64url —————

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) return null;
  try {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

// ————— deflate-raw via the platform's CompressionStream —————

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream, cap: number) {
  const writer = stream.writable.getWriter();
  void writer.write(bytes as Uint8Array<ArrayBuffer>).catch(() => {});
  void writer.close().catch(() => {});
  const reader = stream.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > cap) {
      await reader.cancel();
      throw new Error('payload too large');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

// ————— public API —————

export async function encodeShare(s: SharedDesign): Promise<string> {
  const json = JSON.stringify(s.rev !== undefined ? { m: s.missionId, d: s.design, r: s.rev } : { m: s.missionId, d: s.design });
  const deflated = await pipe(new TextEncoder().encode(json), new CompressionStream('deflate-raw'), Infinity);
  const bytes = new Uint8Array(deflated.length + 1);
  bytes[0] = SHARE_VERSION;
  bytes.set(deflated, 1);
  return toBase64Url(bytes);
}

export async function decodeShare(missionId: string, payload: string): Promise<DecodeResult> {
  const bad = (error: string): DecodeResult => ({ ok: false, error });
  if (payload.length === 0 || payload.length > MAX_PAYLOAD_CHARS) return bad('This link is damaged.');
  const bytes = fromBase64Url(payload);
  if (!bytes || bytes.length < 2) return bad('This link is damaged.');
  if (bytes[0] !== SHARE_VERSION) {
    return bad(
      bytes[0]! < SHARE_VERSION
        ? 'This link was made by an older version of daedalus and can no longer be opened.'
        : 'This link was made by a newer version of daedalus.',
    );
  }
  let json: unknown;
  try {
    const raw = await pipe(bytes.subarray(1), new DecompressionStream('deflate-raw'), MAX_JSON_BYTES);
    json = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw));
  } catch {
    return bad('This link is damaged.');
  }
  const parsed = payloadSchema.safeParse(json);
  if (!parsed.success) return bad('This link does not hold a valid design.');
  if (parsed.data.m !== missionId) return bad('This link does not match its mission.');
  return {
    ok: true,
    missionId: parsed.data.m,
    design: parsed.data.d,
    ...(parsed.data.r !== undefined ? { rev: parsed.data.r } : {}),
  };
}

/** Fragment for a shared design, e.g. `#/m/karman-line/d/AXW…`. */
export function shareHash(missionId: string, kind: ShareKind, payload: string): string {
  return `#/m/${missionId}/${KIND_SEGMENT[kind]}/${payload}`;
}

/** Absolute URL for a fragment, keeping the deploy subpath (e.g. /daedalus/). */
export function shareUrl(hash: string): string {
  return `${location.origin}${location.pathname}${location.search}${hash}`;
}
