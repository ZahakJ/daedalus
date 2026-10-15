/** Per-view help: the keys and hover behaviour of each view. */
import type { Route } from '../router.ts';

type Entry = { what: string; how: string; kbd?: boolean };
type Panel = { title: string; blurb: string; entries: Entry[] };

const GLOBAL: Entry[] = [
  { what: 'Toggle this help', how: '?', kbd: true },
  { what: 'Close', how: 'Esc', kbd: true },
];

const NAV: Entry[] = [
  { what: 'Campaign map', how: '#/campaign' },
  { what: 'Engineering handbook', how: '#/handbook' },
  { what: 'Fleet museum', how: '#/museum' },
];

const PANELS: Record<Route['view'], Panel> = {
  campaign: {
    title: 'flight program',
    blurb: 'Eight missions on a log altitude ladder. The frontier is the only node you can fly.',
    entries: [
      { what: 'Read a dossier', how: 'click any mission node' },
      { what: 'Locked missions', how: 'complete the one before it' },
      { what: 'Open a concept', how: 'click a chip under NEW CONCEPTS' },
      { what: 'Start designing', how: 'ENTER DESIGN BUREAU' },
    ],
  },
  bureau: {
    title: 'design bureau',
    blurb: 'Every slider re-runs the physics. The blueprint, the readouts and the equations are three views of one vehicle.',
    entries: [
      { what: 'Change a parameter', how: 'drag a slider or pick a chip' },
      { what: 'Highlight a part', how: 'hover a decision card → blueprint' },
      { what: 'Find the card for a part', how: 'hover the blueprint → card' },
      { what: 'Trace a symbol', how: 'hover a term in an equation' },
      { what: 'Undo your edits', how: 'reset to preset' },
      { what: 'Copy a link to this design', how: 'share' },
      { what: 'Go to review', how: 'FLIGHT READINESS' },
    ],
  },
  frr: {
    title: 'flight readiness review',
    blurb: 'A GO / NO-GO poll against the sizing envelope. NO-GO blocks commit until you accept the risk.',
    entries: [
      { what: 'Overrule a NO-GO', how: 'ACCEPT ANYWAY on the row' },
      { what: 'Fix it instead', how: 'back to the bureau' },
      { what: 'Commit the vehicle', how: 'COMMIT & FLY' },
    ],
  },
  flight: {
    title: 'range',
    blurb: 'Playback of a committed flight. The trajectory is already flown — you are reading the tape.',
    entries: [
      { what: 'Pause / resume', how: 'Space', kbd: true },
      { what: 'Scrub ±5 s', how: '← →', kbd: true },
      { what: 'Jump to a moment', how: 'click the scrub bar' },
      { what: 'Time compression', how: '1× … 100×' },
      { what: 'Read the report', how: 'DEBRIEF' },
    ],
  },
  debrief: {
    title: 'post-flight',
    blurb: 'The flight report, its margin timeline, and the findings that indict a specific decision.',
    entries: [
      { what: 'Jump to the blamed card', how: 'click a finding' },
      { what: 'Watch it again', how: 'REPLAY FLIGHT' },
      { what: 'Bank the result', how: 'ACCEPT & CONTINUE' },
    ],
  },
  handbook: {
    title: 'engineering handbook',
    blurb: 'Forty sections; equations typeset live against your current design. Sections unlock as missions introduce them.',
    entries: [
      { what: 'Open a section', how: 'click it in the contents' },
      { what: 'Locked sections', how: 'reach the mission that teaches it' },
    ],
  },
  museum: {
    title: 'fleet museum',
    blurb: 'Every vehicle you retired, drawn to one common scale so the program’s growth is legible.',
    entries: [{ what: 'Inspect a vehicle', how: 'hover a plinth' }],
  },
  shared: {
    title: 'shared design',
    blurb: 'Someone else’s vehicle, read-only. The physics is deterministic, so you see exactly what they flew.',
    entries: [
      { what: 'Copy it into your campaign', how: 'MAKE IT MINE' },
      { what: 'Pass it on', how: 'SHARE' },
    ],
  },
};

function Rows({ entries }: { entries: Entry[] }) {
  return (
    <>
      {entries.map((e) => (
        <div className="ms-help__row" key={e.what}>
          <span>{e.what}</span>
          <span className={e.kbd ? 'ms-kbd' : 'ms-help__how'}>{e.how}</span>
        </div>
      ))}
    </>
  );
}

export function HelpOverlay({ view, onClose }: { view: Route['view']; onClose: () => void }) {
  const panel = PANELS[view];
  return (
    <div className="ms-help__scrim" onClick={onClose}>
      <div className="ms-help" onClick={(e) => e.stopPropagation()}>
        <h2>DAEDALUS — {panel.title}</h2>
        <p className="ms-help__blurb">{panel.blurb}</p>

        <div className="ms-help__group mono">this view</div>
        <Rows entries={panel.entries} />

        <div className="ms-help__group mono">everywhere</div>
        <Rows entries={GLOBAL} />

        <div className="ms-help__group mono">go to</div>
        <Rows entries={NAV} />
      </div>
    </div>
  );
}
