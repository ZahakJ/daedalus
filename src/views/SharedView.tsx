/**
 * A design opened from a share link (#/m/<mission>/<d|f|r>/<payload>). The
 * payload is decoded and validated, then shown read-only in the bureau, the
 * range or the debrief. Nothing is written to local state until the viewer
 * presses MAKE IT MINE.
 */
import { useEffect, useMemo, useState } from 'react';
import { Hud } from '../components/Hud.tsx';
import { ShareButton } from '../components/ShareButton.tsx';
import { navigate } from '../router.ts';
import { useStore } from '../store.ts';
import { missionById } from '../campaign/catalog.ts';
import { isMissionUnlocked } from '../campaign/unlocks.ts';
import { simulateFlight } from '../physics/index.ts';
import type { FlightRecord, MissionId } from '../schema.ts';
import { decodeShare, type DecodeResult, type ShareKind, type SharedDesign } from '../share.ts';
import { BureauView } from './BureauView.tsx';
import { FlightView } from './FlightView.tsx';
import { DebriefView } from './DebriefView.tsx';

export interface SharedContext {
  payload: string;
  /** Toolbar for the shared view: read-only tag, MAKE IT MINE, SHARE. */
  bar: React.ReactNode;
}

export function SharedView({ missionId, kind, payload }: { missionId: string; kind: ShareKind; payload: string }) {
  const [state, setState] = useState<DecodeResult | null>(null);
  useEffect(() => {
    let alive = true;
    setState(null);
    void decodeShare(missionId, payload).then((r) => {
      if (alive) setState(r);
    });
    return () => {
      alive = false;
    };
  }, [missionId, payload]);

  if (state === null) return null;
  if (!state.ok || !missionById(state.missionId)) {
    return (
      <Hud sub="shared design">
        <div className="ms-empty" style={{ height: '100%' }} data-shared-error>
          <div className="ms-empty__title">CANNOT OPEN THIS LINK</div>
          <div>{state.ok ? 'Unknown mission.' : state.error}</div>
          <button className="ms-btn" onClick={() => navigate({ view: 'campaign' })}>
            CAMPAIGN MAP
          </button>
        </div>
      </Hud>
    );
  }
  return <SharedBody shared={state} kind={kind} payload={payload} />;
}

function SharedBody({ shared, kind, payload }: { shared: SharedDesign; kind: ShareKind; payload: string }) {
  const { missionId, design, rev } = shared;
  const mission = missionById(missionId)!;
  const unlocked = useStore((s) => isMissionUnlocked(s.campaign, missionId));
  const current = useStore((s) => s.designs[missionId]);
  const setDesign = useStore((s) => s.setDesign);

  const makeMine = (): void => {
    if (current && JSON.stringify(current) !== JSON.stringify(design)) {
      if (!window.confirm(`Replace your current ${mission.title} design with this one?`)) return;
    }
    setDesign(missionId, design);
    navigate({ view: 'bureau', missionId });
  };

  const bar = (
    <>
      <span className="ms-shared-tag" data-shared-ready>
        SHARED · READ-ONLY
      </span>
      {unlocked ? (
        <button className="ms-btn ms-btn--primary" onClick={makeMine} title="Copy this design into your campaign">
          MAKE IT MINE
        </button>
      ) : (
        <span className="ms-shared-note">unlock {mission.title} to make it yours</span>
      )}
      <ShareButton missionId={missionId} design={design} {...(rev !== undefined ? { rev } : {})} kind={kind} />
    </>
  );
  const ctx: SharedContext = { payload, bar };

  const record = useMemo((): FlightRecord | null => {
    if (kind === 'design') return null;
    const r = rev ?? 'A';
    const seed = `${missionId}:${r}`;
    const res = simulateFlight(design, { weatherSeed: seed });
    return {
      rev: r,
      seed,
      design,
      at: '',
      outcome: res.summary.outcome,
      apogee: res.summary.apogee,
      maxQ: res.summary.maxQ.value,
      failureIds: res.failures.map((f) => f.id),
      waivedRisks: [],
      diff: '',
    };
  }, [kind, rev, missionId, design]);

  if (kind === 'design') {
    return <BureauView missionId={missionId} shared={{ ...ctx, design, ...(rev !== undefined ? { rev } : {}) }} />;
  }
  if (kind === 'flight') return <FlightView missionId={missionId} shared={{ ...ctx, record: record! }} />;
  return <DebriefView missionId={missionId as MissionId} shared={{ ...ctx, record: record! }} />;
}
