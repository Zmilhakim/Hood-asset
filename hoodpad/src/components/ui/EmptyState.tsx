import type { ReactNode } from "react";

/**
 * What the board shows when there is genuinely nothing on it. It says the
 * board is empty rather than dressing the gap up with placeholder rows.
 */
export function EmptyState({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-2 border-dashed border-ink-faint bg-paper-dim/40 px-5 py-10 text-center">
      <h3 className="font-display text-xl text-ink">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-ink-soft">{children}</p>
    </div>
  );
}
