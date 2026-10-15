import { describe, expect, it } from 'vitest';
import { MISSIONS } from '../src/campaign/catalog.ts';
import { GOLDEN } from '../src/campaign/golden.ts';
import { parseHash, routeHash } from '../src/router.ts';
import { decodeShare, encodeShare, MAX_PAYLOAD_CHARS, SHARE_VERSION, shareHash } from '../src/share.ts';

/** Share links must stay short enough to paste anywhere (chat, issue, tweet). */
const SIZE_BUDGET = 900;

function golden(id: (typeof MISSIONS)[number]['id']) {
  const m = MISSIONS.find((x) => x.id === id)!;
  const d = m.preset();
  GOLDEN[m.id](d);
  return d;
}

function b64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}

async function deflate(json: string): Promise<Uint8Array> {
  const cs = new CompressionStream('deflate-raw');
  const out = new Response(new Blob([json]).stream().pipeThrough(cs));
  return new Uint8Array(await out.arrayBuffer());
}

async function rawPayload(version: number, json: string): Promise<string> {
  const body = await deflate(json);
  const bytes = new Uint8Array(body.length + 1);
  bytes[0] = version;
  bytes.set(body, 1);
  return b64url(bytes);
}

describe('share links', () => {
  for (const m of MISSIONS) {
    it(`${m.id}: golden design round-trips exactly, within the size budget`, async () => {
      const design = golden(m.id);
      const payload = await encodeShare({ missionId: m.id, design, rev: 'C' });
      expect(payload.length).toBeLessThanOrEqual(SIZE_BUDGET);
      const hash = shareHash(m.id, 'design', payload);
      const route = parseHash(hash);
      expect(route).toEqual({ view: 'shared', missionId: m.id, kind: 'design', payload });
      expect(routeHash(route)).toBe(hash);
      const back = await decodeShare(m.id, payload);
      // Strict and bit-exact: every float survives, so the flight is identical.
      expect(back).toStrictEqual({ ok: true, missionId: m.id, design, rev: 'C' });
    });
  }

  it('the rev letter is optional', async () => {
    const design = golden('first-flight');
    const back = await decodeShare('first-flight', await encodeShare({ missionId: 'first-flight', design }));
    expect(back).toEqual({ ok: true, missionId: 'first-flight', design });
  });

  it('flight and report routes parse; malformed share routes fall back to the campaign', () => {
    expect(parseHash('#/m/karman-line/f/AQID')).toEqual({ view: 'shared', missionId: 'karman-line', kind: 'flight', payload: 'AQID' });
    expect(parseHash('#/m/karman-line/r/AQID')).toEqual({ view: 'shared', missionId: 'karman-line', kind: 'report', payload: 'AQID' });
    for (const h of ['#/m/karman-line/x/AQID', '#/m/karman-line/d', '#/m/karman-line/d/a+b', '#/m/KARMAN/d/AQID', '#/m/karman-line/d/AQID/extra', `#/m/karman-line/d/${'A'.repeat(MAX_PAYLOAD_CHARS + 1)}`]) {
      expect(parseHash(h), h).toEqual({ view: 'campaign' });
    }
  });

  describe('rejects tampered payloads', () => {
    it('every single-character edit is rejected or decodes to a schema-valid design', async () => {
      const design = golden('two-steps');
      const payload = await encodeShare({ missionId: 'two-steps', design });
      const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
      let rejected = 0;
      for (let i = 0; i < payload.length; i += 7) {
        const c = alphabet[(alphabet.indexOf(payload[i]!) + 17) % 64]!;
        const r = await decodeShare('two-steps', payload.slice(0, i) + c + payload.slice(i + 1));
        if (!r.ok) rejected++;
        else expect(r.missionId).toBe('two-steps');
      }
      expect(rejected).toBeGreaterThan(0);
    });

    it('a truncated payload', async () => {
      const payload = await encodeShare({ missionId: 'liquid-fire', design: golden('liquid-fire') });
      expect((await decodeShare('liquid-fire', payload.slice(0, payload.length >> 1))).ok).toBe(false);
    });

    it('a mission that does not match the path', async () => {
      const payload = await encodeShare({ missionId: 'liquid-fire', design: golden('liquid-fire') });
      const r = await decodeShare('high-energy', payload);
      expect(r).toEqual({ ok: false, error: 'This link does not match its mission.' });
    });

    it('old and future versions', async () => {
      const json = JSON.stringify({ m: 'first-flight', d: golden('first-flight') });
      const old = await decodeShare('first-flight', await rawPayload(SHARE_VERSION - 1, json));
      expect(old.ok).toBe(false);
      expect(!old.ok && old.error).toMatch(/older version/);
      const future = await decodeShare('first-flight', await rawPayload(SHARE_VERSION + 1, json));
      expect(!future.ok && future.error).toMatch(/newer version/);
    });

    it('a well-formed payload holding an invalid design', async () => {
      const d = golden('first-flight') as unknown as Record<string, unknown>;
      const cases = [
        { m: 'first-flight', d: { ...d, stages: [] } },
        { m: 'first-flight', d: { ...d, noseFineness: 'long' } },
        { m: 'first-flight', d, extra: 1 },
        { m: 'no-such-mission', d },
        [1, 2, 3],
      ];
      for (const c of cases) {
        const r = await decodeShare('first-flight', await rawPayload(SHARE_VERSION, JSON.stringify(c)));
        expect(r.ok, JSON.stringify(c).slice(0, 60)).toBe(false);
      }
    });

    it('garbage, non-JSON and decompression bombs', async () => {
      for (const p of ['', '!!!!', 'A', b64url(new Uint8Array([SHARE_VERSION, 1, 2, 3, 4, 5]))]) {
        expect((await decodeShare('first-flight', p)).ok).toBe(false);
      }
      expect((await decodeShare('first-flight', await rawPayload(SHARE_VERSION, 'not json'))).ok).toBe(false);
      const bomb = await rawPayload(SHARE_VERSION, `{"m":"first-flight","d":"${' '.repeat(1_000_000)}"}`);
      expect(bomb.length).toBeLessThan(MAX_PAYLOAD_CHARS);
      expect((await decodeShare('first-flight', bomb)).ok).toBe(false);
    });
  });
});
