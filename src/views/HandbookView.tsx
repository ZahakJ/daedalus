/**
 * The engineering handbook: a two-pane technical manual. Left, the TOC grouped
 * by mission with a progress meter; right, the entry — governing equations
 * rendered LIVE with the reader's current frontier design's numbers.
 */
import { useMemo } from 'react';
import { Hud } from '../components/Hud.tsx';
import { MISSIONS } from '../campaign/catalog.ts';
import { conceptsUnlocked } from '../campaign/unlocks.ts';
import { useStore } from '../store.ts';
import { navigate } from '../router.ts';
import { CONCEPTS, CONCEPT_BY_ID, type Concept } from '../content/concepts.ts';
import { renderContent, LiveEq } from '../content/render.ts';
import { HandbookProvider } from '../components/progress/HandbookProvider.tsx';

/** §chapter.section — chapter = mission index+1, section = position within. */
function sectionNumber(c: Concept): string {
  const mission = MISSIONS.find((m) => m.id === c.unlockedBy)!;
  const idx = mission.newConcepts.indexOf(c.id);
  return `§${mission.index + 1}.${idx + 1}`;
}

function Crest() {
  return (
    <svg className="hb-crest" viewBox="0 0 200 200" aria-hidden>
      <g fill="none" stroke="currentColor" strokeWidth="1">
        <circle cx="100" cy="100" r="92" opacity="0.5" />
        <circle cx="100" cy="100" r="86" opacity="0.9" />
        <circle cx="100" cy="100" r="58" opacity="0.35" />
        {/* dial ticks */}
        {Array.from({ length: 36 }, (_, i) => {
          const a = (i / 36) * Math.PI * 2;
          const r1 = i % 9 === 0 ? 78 : 82;
          return (
            <line
              key={i}
              x1={100 + r1 * Math.cos(a)}
              y1={100 + r1 * Math.sin(a)}
              x2={100 + 86 * Math.cos(a)}
              y2={100 + 86 * Math.sin(a)}
              opacity="0.6"
            />
          );
        })}
        {/* ascent trajectory arc */}
        <path d="M 30 150 Q 90 140 122 96 T 158 34" opacity="0.8" strokeDasharray="3 3" />
        {/* the vehicle, in line art */}
        <g strokeWidth="1.2">
          <path d="M 100 52 L 108 76 L 108 128 L 100 136 L 92 128 L 92 76 Z" />
          <path d="M 92 112 L 78 136 L 92 130" />
          <path d="M 108 112 L 122 136 L 108 130" />
          <path d="M 96 140 L 100 152 L 104 140" opacity="0.7" />
        </g>
        {/* CG / CP marks */}
        <circle cx="100" cy="96" r="3.5" opacity="0.9" />
        <line x1="86" y1="96" x2="114" y2="96" opacity="0.4" />
      </g>
    </svg>
  );
}

function Toc({ current, unlocked }: { current?: string; unlocked: Set<string> }) {
  const n = CONCEPTS.filter((c) => unlocked.has(c.id)).length;
  return (
    <aside className="hb-toc">
      <button type="button" className="hb-toc__cover mono" onClick={() => navigate({ view: 'handbook' })}>
        ENGINEERING HANDBOOK
      </button>
      <div className="hb-progress">
        <div className="hb-progress__bar">
          <div className="hb-progress__fill" style={{ width: `${(n / CONCEPTS.length) * 100}%` }} />
        </div>
        <span className="mono hb-progress__num">
          {n}/{CONCEPTS.length}
        </span>
      </div>
      <div className="hb-toc__scroll">
        {MISSIONS.map((m) => (
          <div key={m.id} className="hb-toc__group">
            <div className="hb-toc__mission mono">
              {`${m.index + 1}`.padStart(2, '0')} · {m.title.toUpperCase()}
            </div>
            {m.newConcepts.map((id) => {
              const c = CONCEPT_BY_ID[id];
              if (!c) return null;
              const isUnlocked = unlocked.has(id);
              return isUnlocked ? (
                <button
                  key={id}
                  type="button"
                  className={'hb-toc__entry' + (current === id ? ' hb-toc__entry--active' : '')}
                  onClick={() => navigate({ view: 'handbook', conceptId: id })}
                >
                  <span className="mono hb-toc__num">{sectionNumber(c)}</span>
                  {c.title}
                </button>
              ) : (
                <div key={id} className="hb-toc__entry hb-toc__entry--locked">
                  <span className="mono hb-toc__num">{sectionNumber(c)}</span>
                  {c.title}
                  <svg className="hb-lock" viewBox="0 0 10 12" aria-hidden>
                    <rect x="1" y="5" width="8" height="6" rx="1" fill="currentColor" />
                    <path d="M 3 5 V 3.5 a 2 2 0 0 1 4 0 V 5" fill="none" stroke="currentColor" />
                  </svg>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </aside>
  );
}

function Cover({ unlocked }: { unlocked: Set<string> }) {
  return (
    <div className="hb-cover">
      <Crest />
      <div className="hb-cover__name mono">DAEDALUS</div>
      <div className="hb-cover__title">Engineering Handbook</div>
      <div className="hb-cover__ed mono">FLIGHT PROGRAM EDITION · REV A</div>
      <div className="hb-cover__rule" />
      <div className="hb-cover__note">
        Equations in this manual are typeset live against the current frontier design — the numbers
        beneath every symbol are <em>your rocket&#39;s</em>.
      </div>
      <div className="hb-cover__toc">
        {MISSIONS.map((m) => (
          <div key={m.id} className="hb-cover__group">
            <div className="mono hb-cover__mission">
              CH {m.index + 1} — {m.title.toUpperCase()}
            </div>
            {m.newConcepts.map((id) => {
              const c = CONCEPT_BY_ID[id];
              if (!c) return null;
              const is = unlocked.has(id);
              return (
                <button
                  key={id}
                  type="button"
                  className={'hb-cover__entry' + (is ? '' : ' hb-cover__entry--locked')}
                  onClick={() => is && navigate({ view: 'handbook', conceptId: id })}
                >
                  <span className="mono">{sectionNumber(c)}</span> {c.title}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function Entry({ concept, unlocked }: { concept: Concept; unlocked: Set<string> }) {
  const mission = MISSIONS.find((m) => m.id === concept.unlockedBy)!;
  const idx = CONCEPTS.findIndex((c) => c.id === concept.id);
  const prev = CONCEPTS[idx - 1];
  const next = CONCEPTS[idx + 1];
  const related = useMemo(
    () =>
      CONCEPTS.filter(
        (c) => c.id !== concept.id && c.eqIds.some((e) => concept.eqIds.includes(e)),
      ),
    [concept],
  );

  if (!unlocked.has(concept.id)) {
    return (
      <div className="hb-entry hb-entry--sealed">
        <div className="hb-entry__kicker mono">{sectionNumber(concept)} · SEALED</div>
        <h1 className="hb-entry__title">{concept.title}</h1>
        <div className="hb-sealed-note">
          This section unlocks with <b>
            Mission {String(mission.index + 1).padStart(2, '0')} · {mission.title}
          </b>
          .
        </div>
      </div>
    );
  }

  return (
    <div className="hb-entry">
      <div className="hb-entry__kicker mono">
        {sectionNumber(concept)} · CH {mission.index + 1} — {mission.title.toUpperCase()}
      </div>
      <h1 className="hb-entry__title">{concept.title}</h1>
      {concept.eqIds.length > 0 && (
        <div className="hb-gov">
          <div className="hb-gov__label mono">GOVERNING {concept.eqIds.length > 1 ? 'EQUATIONS' : 'EQUATION'}</div>
          {concept.eqIds.map((id) => (
            <LiveEq key={id} id={id} />
          ))}
        </div>
      )}
      <div className="hb-body">{renderContent(concept.body)}</div>

      <div className="hb-appears">
        <span className="hb-appears__label mono">APPEARS IN</span>
        <button
          type="button"
          className="cm-chip"
          onClick={() => navigate({ view: 'campaign' })}
          title="Campaign map"
        >
          M{mission.index + 1} · {mission.title}
        </button>
        {related.map((c) => (
          <button
            key={c.id}
            type="button"
            className="cm-chip"
            onClick={() => navigate({ view: 'handbook', conceptId: c.id })}
          >
            {c.title}
          </button>
        ))}
      </div>

      <div className="hb-footer">
        {prev ? (
          <button
            type="button"
            className="hb-footer__nav"
            disabled={!unlocked.has(prev.id)}
            onClick={() => navigate({ view: 'handbook', conceptId: prev.id })}
          >
            ← <span className="mono">{sectionNumber(prev)}</span> {prev.title}
          </button>
        ) : (
          <span />
        )}
        {next ? (
          <button
            type="button"
            className="hb-footer__nav hb-footer__nav--next"
            disabled={!unlocked.has(next.id)}
            onClick={() => navigate({ view: 'handbook', conceptId: next.id })}
          >
            <span className="mono">{sectionNumber(next)}</span> {next.title} →
          </button>
        ) : (
          <span />
        )}
      </div>
    </div>
  );
}

export function HandbookView({ conceptId }: { conceptId?: string }) {
  const campaign = useStore((s) => s.campaign);
  const unlocked = useMemo(() => conceptsUnlocked(campaign), [campaign]);
  const concept = conceptId ? CONCEPT_BY_ID[conceptId] : undefined;
  const n = CONCEPTS.filter((c) => unlocked.has(c.id)).length;

  return (
    <Hud
      sub="engineering handbook"
      bar={
        <div className="cm-nav">
          <button type="button" className="ms-btn ms-btn--ghost" onClick={() => navigate({ view: 'campaign' })}>
            CAMPAIGN
          </button>
          <button type="button" className="ms-btn ms-btn--ghost" onClick={() => navigate({ view: 'museum' })}>
            MUSEUM
          </button>
        </div>
      }
      status={
        <>
          <span>
            SECTIONS <b className="cm-status-num">{n}/{CONCEPTS.length}</b>
          </span>
          <span>{concept ? `${sectionNumber(concept)} ${concept.title.toUpperCase()}` : 'COVER'}</span>
          <span className="ms-hud__spacer" />
          <span>
            <span className="ms-kbd">?</span> help
          </span>
        </>
      }
    >
      <HandbookProvider>
        <div className="hb">
          <Toc current={conceptId} unlocked={unlocked} />
          <main className="hb-page">
            {concept ? <Entry concept={concept} unlocked={unlocked} /> : <Cover unlocked={unlocked} />}
          </main>
        </div>
      </HandbookProvider>
    </Hud>
  );
}
