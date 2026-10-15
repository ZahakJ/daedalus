import { describe, expect, it } from 'vitest';
import { parseHash, routeHash, type Route } from '../src/router.ts';

describe('router', () => {
  it('parseHash and routeHash are inverses for canonical routes', () => {
    const routes: Route[] = [
      { view: 'campaign' },
      { view: 'bureau', missionId: 'first-flight' },
      { view: 'frr', missionId: 'karman-line' },
      { view: 'flight', missionId: 'liquid-fire' },
      { view: 'debrief', missionId: 'high-energy' },
      { view: 'handbook' },
      { view: 'handbook', conceptId: 'tsiolkovsky' },
      { view: 'museum' },
    ];
    for (const r of routes) {
      expect(parseHash(routeHash(r))).toEqual(r);
    }
  });

  it('garbage falls back to campaign', () => {
    const garbage = ['#/nope', '#/bureau', '#/bureau/UPPER CASE', '#/flight/../x', '#garbage', ''];
    for (const h of garbage) {
      expect(parseHash(h)).toEqual({ view: 'campaign' });
    }
  });
});
