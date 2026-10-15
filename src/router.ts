// Tiny hash router — no deps. The URL is owned here; views read useRoute and
// call navigate(). Mission ids are validated as slugs here and against the
// campaign catalog by route guards in App.tsx.
import { create } from 'zustand';
import { KIND_SEGMENT, MAX_PAYLOAD_CHARS, type ShareKind } from './share.ts';

export type Route =
  | { view: 'campaign' }
  | { view: 'bureau'; missionId: string }
  | { view: 'frr'; missionId: string }
  | { view: 'flight'; missionId: string }
  | { view: 'debrief'; missionId: string }
  | { view: 'handbook'; conceptId?: string }
  | { view: 'museum' }
  | { view: 'shared'; missionId: string; kind: ShareKind; payload: string };

const SHARE_KINDS: Record<string, ShareKind> = { d: 'design', f: 'flight', r: 'report' };
const PAYLOAD = /^[A-Za-z0-9_-]+$/;

const SLUG = /^[a-z0-9-]+$/;

/** Pure: any hash string → a Route. Garbage falls back to the campaign map. */
export function parseHash(raw: string): Route {
  const h = raw.startsWith('#') ? raw.slice(1) : raw;
  const seg = h.split('/').filter(Boolean);
  switch (seg[0]) {
    case undefined:
    case 'campaign':
      return { view: 'campaign' };
    case 'bureau':
    case 'frr':
    case 'flight':
    case 'debrief': {
      const missionId = seg[1];
      if (missionId && SLUG.test(missionId)) return { view: seg[0], missionId };
      return { view: 'campaign' };
    }
    case 'handbook': {
      const conceptId = seg[1];
      return conceptId && SLUG.test(conceptId)
        ? { view: 'handbook', conceptId }
        : { view: 'handbook' };
    }
    case 'museum':
      return { view: 'museum' };
    case 'm': {
      // #/m/<mission>/<d|f|r>/<payload>
      const [, missionId, k, payload] = seg;
      const kind = k !== undefined ? SHARE_KINDS[k] : undefined;
      if (
        seg.length === 4 &&
        missionId &&
        SLUG.test(missionId) &&
        kind &&
        payload &&
        payload.length <= MAX_PAYLOAD_CHARS &&
        PAYLOAD.test(payload)
      ) {
        return { view: 'shared', missionId, kind, payload };
      }
      return { view: 'campaign' };
    }
    default:
      return { view: 'campaign' };
  }
}

/** Pure inverse of parseHash for every canonical Route. */
export function routeHash(r: Route): string {
  switch (r.view) {
    case 'campaign':
      return '#/campaign';
    case 'bureau':
    case 'frr':
    case 'flight':
    case 'debrief':
      return `#/${r.view}/${r.missionId}`;
    case 'handbook':
      return r.conceptId ? `#/handbook/${r.conceptId}` : '#/handbook';
    case 'museum':
      return '#/museum';
    case 'shared':
      return `#/m/${r.missionId}/${KIND_SEGMENT[r.kind]}/${r.payload}`;
  }
}

export const useRoute = create<{ route: Route }>()(() => ({
  route: { view: 'campaign' } as Route,
}));

export function navigate(r: Route, replace = false): void {
  const hash = routeHash(r);
  if (location.hash === hash) return;
  if (replace) {
    history.replaceState(null, '', hash);
    useRoute.setState({ route: parseHash(hash) });
  } else {
    location.hash = hash; // fires hashchange → store update
  }
}

/** Parse the current hash, canonicalize, subscribe. Returns cleanup. */
export function initRouter(): () => void {
  const apply = () => {
    const route = parseHash(location.hash);
    const canonical = routeHash(route);
    if (location.hash !== canonical) history.replaceState(null, '', canonical);
    useRoute.setState({ route });
  };
  apply();
  window.addEventListener('hashchange', apply);
  return () => window.removeEventListener('hashchange', apply);
}
