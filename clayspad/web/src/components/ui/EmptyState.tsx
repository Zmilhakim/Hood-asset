import type { ReactNode } from "react";

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="clay-panel rounded-sm px-6 py-12 text-center">
      <p className="font-display text-lg font-bold text-paper">{title}</p>
      {children ? <div className="mx-auto mt-2 max-w-prose text-sm leading-relaxed text-paper-faint">{children}</div> : null}
    </div>
  );
}
