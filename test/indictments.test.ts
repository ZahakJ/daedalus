import { describe, expect, it } from 'vitest';
import { CARDS } from '../src/design/cards.tsx';
import { INDICTMENTS, indictedCard } from '../src/debrief/report.ts';
import { MISSIONS } from '../src/campaign/catalog.ts';
import { GOLDEN } from '../src/campaign/golden.ts';
import type { FailureId } from '../src/physics/types.ts';

describe('debrief indictments cite real bureau cards', () => {
  it('codes and labels come from the registry numbering', () => {
    for (const [id, c] of Object.entries(CARDS)) {
      expect(c.code, id).toMatch(/^DC-\d{2}$/);
      expect(c.label).toBe(`${c.code} · ${c.title}`);
    }
    expect(CARDS['fins'].code).toBe('DC-15');
    expect(CARDS['nozzle-expansion'].code).toBe('DC-06');
  });

  it('every INDICTMENTS entry resolves to an existing card with the same code', () => {
    const designs = MISSIONS.flatMap((m) => {
      const golden = m.preset();
      GOLDEN[m.id](golden);
      return [
        { m, d: m.preset() },
        { m, d: golden },
      ];
    });
    for (const failureId of Object.keys(INDICTMENTS) as FailureId[]) {
      for (const { m, d } of designs) {
        const cardId = indictedCard(failureId, d, m);
        const card = CARDS[cardId];
        expect(card, `${failureId} @ ${m.id} → ${cardId}`).toBeDefined();
        const codes = Object.values(CARDS).filter((c) => c.code === card.code);
        expect(codes, `${failureId}: code ${card.code} is unique`).toHaveLength(1);
        expect(codes[0]!.title).toBe(card.title);
      }
    }
  });
});
