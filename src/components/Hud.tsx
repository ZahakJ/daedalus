import type { ReactNode } from 'react';

/** Instrument-panel shell: titlebar + bracketed stage + statusbar. */
export function Hud({
  sub,
  bar,
  status,
  children,
}: {
  sub: string;
  bar?: ReactNode;
  status?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="ms-hud">
      <div className="ms-hud__titlebar">
        <div className="ms-hud__mark">
          <span className="ms-hud__app">daedalus</span>
          <span className="ms-hud__sub">{sub}</span>
        </div>
        <div className="ms-hud__spacer" />
        {bar}
      </div>
      <div className="ms-hud__main">{children}</div>
      {status !== undefined && <div className="ms-statusbar">{status}</div>}
    </div>
  );
}
