/**
 * Variable-binding cross-highlighting: hover m₀ anywhere and every occurrence
 * of m₀ — in other cards, the mass readouts, the blueprint rollup — lights up.
 * One store field, cheap class toggles, no DOM registry needed.
 */
import { useStore } from '../store.ts';

export function useBindingHover(bind: string | undefined): {
  highlighted: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
} {
  const highlighted = useStore((s) => bind !== undefined && s.ui.hoveredBinding === bind);
  return {
    highlighted,
    onMouseEnter: () => {
      if (bind !== undefined) useStore.getState().setUi({ hoveredBinding: bind });
    },
    onMouseLeave: () => {
      if (bind !== undefined) useStore.getState().setUi({ hoveredBinding: null });
    },
  };
}
