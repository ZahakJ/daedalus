/** Shared instrument controls: slider, segmented picker, bound readout. */
import { useBindingHover } from '../eq/bindings.ts';

export function Slider({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
  log = false,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  /** Preformatted value text, units included. */
  display: string;
  onChange: (v: number) => void;
  /** Log-scale mapping for ranges spanning decades (thrust, pressure). */
  log?: boolean;
}) {
  const toSlider = (v: number): number => (log ? Math.log10(v) : v);
  const fromSlider = (s: number): number => (log ? Math.pow(10, s) : s);
  return (
    <label className="ms-slider">
      <span className="ms-slider__label">{label}</span>
      <input
        type="range"
        min={toSlider(min)}
        max={toSlider(max)}
        step={log ? (toSlider(max) - toSlider(min)) / 200 : step}
        value={toSlider(value)}
        onChange={(e) => {
          let v = fromSlider(Number(e.target.value));
          if (log) v = Math.round(v / step) * step;
          onChange(Math.max(min, Math.min(max, v)));
        }}
      />
      <span className="ms-slider__value">{display}</span>
    </label>
  );
}

export function Seg<T extends string>({
  options,
  value,
  onChange,
}: {
  options: ReadonlyArray<{ id: T; label: string; disabled?: boolean; title?: string }>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <span className="ms-seg">
      {options.map((o) => (
        <button
          key={o.id}
          className={`ms-seg__opt${o.id === value ? ' ms-seg__opt--active' : ''}`}
          disabled={o.disabled}
          title={o.title}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </span>
  );
}

/** StatDisplay wired into the binding cross-highlight system. */
export function Readout({
  label,
  value,
  unit,
  bind,
  accent = false,
  status,
}: {
  label: string;
  value: string;
  unit?: string;
  bind?: string;
  accent?: boolean;
  status?: 'ok' | 'warn' | 'danger';
}) {
  const { highlighted, onMouseEnter, onMouseLeave } = useBindingHover(bind);
  return (
    <div
      className={`ms-stat${highlighted ? ' eq-hl' : ''}`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <span className="ms-stat__label">{label}</span>
      <span
        className={`ms-stat__value${accent ? ' ms-stat__value--accent' : ''}`}
        style={status ? { color: `var(--${status})` } : undefined}
      >
        {value}
        {unit && <span className="ms-stat__unit">{unit}</span>}
      </span>
    </div>
  );
}
