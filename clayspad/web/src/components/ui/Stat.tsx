import type { ReactNode } from "react";

/**
 * One figure, with what it is underneath it.
 *
 * `value` is null whenever the figure could not be read. That renders an em
 * dash rather than a zero: a launchpad showing "0" for something it simply
 * could not fetch has told the reader something false.
 */
export function Stat({ label, value, hint }: { label: string; value: ReactNode | null; hint?: string }) {
  return (
    <div className="clay-panel rounded-sm px-4 py-3">
      <div className="micro text-paper-faint">{label}</div>
      <div className="mt-1 font-display text-xl font-bold text-paper tabular-nums">
        {value ?? <span className="text-clay">—</span>}
      </div>
      {hint ? <div className="mt-0.5 text-xs text-paper-faint">{hint}</div> : null}
    </div>
  );
}
