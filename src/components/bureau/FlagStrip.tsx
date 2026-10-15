/** Design-flag chips: the pre-flight findings ledger, severity-coded. */
import type { DesignFlag } from '../../physics/index.ts';

export function FlagStrip({ flags }: { flags: DesignFlag[] }) {
  if (flags.length === 0) {
    return (
      <div className="bu-flags">
        <div className="bu-flag bu-flag--clear">
          <span className="bu-flag__dot" />
          NO OPEN FINDINGS — DESIGN CLEAN
        </div>
      </div>
    );
  }
  return (
    <div className="bu-flags">
      {flags.map((f) => (
        <div key={f.id} className={`bu-flag bu-flag--${f.severity}`} title={f.message}>
          <span className="bu-flag__dot" />
          <span className="bu-flag__msg">{f.message}</span>
        </div>
      ))}
    </div>
  );
}
