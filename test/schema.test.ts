import { describe, expect, it } from 'vitest';
import { MISSIONS } from '../src/campaign/catalog.ts';
import { rocketDesignSchema } from '../src/schema.ts';

describe('schema', () => {
  it('every mission preset validates against the design schema', () => {
    for (const m of MISSIONS) {
      const preset = m.preset();
      const parsed = rocketDesignSchema.safeParse(preset);
      expect(parsed.success, `${m.id}: ${JSON.stringify(parsed.success ? '' : parsed.error.issues)}`).toBe(true);
    }
  });

  it('presets survive a JSON round-trip untouched', () => {
    for (const m of MISSIONS) {
      const preset = m.preset();
      expect(JSON.parse(JSON.stringify(preset))).toEqual(preset);
    }
  });
});
