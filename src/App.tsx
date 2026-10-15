import { useEffect, useState } from 'react';
import { navigate, useRoute, type Route } from './router.ts';
import { useStore } from './store.ts';
import { missionById } from './campaign/catalog.ts';
import { isMissionUnlocked } from './campaign/unlocks.ts';
import type { MissionId } from './schema.ts';
import { HelpOverlay } from './components/HelpOverlay.tsx';
import { CampaignView } from './views/CampaignView.tsx';
import { BureauView } from './views/BureauView.tsx';
import { FrrView } from './views/FrrView.tsx';
import { FlightView } from './views/FlightView.tsx';
import { DebriefView } from './views/DebriefView.tsx';
import { HandbookView } from './views/HandbookView.tsx';
import { MuseumView } from './views/MuseumView.tsx';
import { SharedView } from './views/SharedView.tsx';

/** Route guards: locked missions bounce to the campaign map; flight/debrief
    without a committed launch bounce to the bureau. */
function guardRoute(route: Route): Route {
  if (
    route.view !== 'bureau' &&
    route.view !== 'frr' &&
    route.view !== 'flight' &&
    route.view !== 'debrief'
  ) {
    return route;
  }
  const mission = missionById(route.missionId);
  if (!mission) return { view: 'campaign' };
  const { campaign, committed } = useStore.getState();
  if (!isMissionUnlocked(campaign, mission.id)) return { view: 'campaign' };
  if (
    (route.view === 'flight' || route.view === 'debrief') &&
    committed[route.missionId as MissionId] === undefined
  ) {
    return { view: 'bureau', missionId: route.missionId };
  }
  return route;
}

export function App() {
  const rawRoute = useRoute((s) => s.route);
  const route = guardRoute(rawRoute);
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    if (route !== rawRoute) navigate(route, true);
  }, [route, rawRoute]);

  useEffect(() => {
    document.body.dataset.appReady = '1';
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '?' && !(e.target instanceof HTMLInputElement)) {
        setHelpOpen((v) => !v);
      }
      if (e.key === 'Escape') setHelpOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      {route.view === 'campaign' && <CampaignView />}
      {route.view === 'bureau' && <BureauView missionId={route.missionId} />}
      {route.view === 'frr' && <FrrView missionId={route.missionId} />}
      {route.view === 'flight' && <FlightView missionId={route.missionId} />}
      {route.view === 'debrief' && <DebriefView missionId={route.missionId} />}
      {route.view === 'handbook' && <HandbookView conceptId={route.conceptId} />}
      {route.view === 'museum' && <MuseumView />}
      {route.view === 'shared' && (
        <SharedView missionId={route.missionId} kind={route.kind} payload={route.payload} />
      )}
      {helpOpen && <HelpOverlay view={route.view} onClose={() => setHelpOpen(false)} />}
    </>
  );
}
