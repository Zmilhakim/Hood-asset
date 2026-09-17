import type { ReactNode } from "react";

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`board p-5 sm:p-6 ${className}`}>{children}</section>;
}

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-[var(--line)] py-2.5 last:border-0">
      <span className="stencil shrink-0 text-[11px] text-ink-soft">{label}</span>
      <span className="numeric min-w-0 flex-1 text-right text-sm break-words">{children}</span>
    </div>
  );
}
