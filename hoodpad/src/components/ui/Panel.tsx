import type { ReactNode } from "react";
import { clsx } from "@/lib/clsx";

type PanelProps = {
  /** The micro-caption printed across the header batten. */
  label?: string;
  /** Anything that belongs on the right of the batten — a status, a count. */
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
};

/** A sheet of paper nailed to the board. Every surface on the site is one. */
export function Panel({ label, aside, children, className, bodyClassName }: PanelProps) {
  return (
    <section className={clsx("paper-grain pin-shadow border-2 border-ink bg-paper text-ink", className)}>
      {(label || aside) && (
        <header className="flex items-center justify-between gap-3 border-b-2 border-ink bg-paper-dim px-3 py-1.5">
          {label ? <span className="micro text-ink-soft">{label}</span> : <span />}
          {aside}
        </header>
      )}
      <div className={clsx("p-4 sm:p-5", bodyClassName)}>{children}</div>
    </section>
  );
}
