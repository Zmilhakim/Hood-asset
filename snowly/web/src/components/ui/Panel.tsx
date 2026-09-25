import type { ReactNode } from "react";

import { cx } from "@/lib/cx";

export function Panel({
  children,
  className,
  accent = false,
}: {
  children: ReactNode;
  className?: string;
  accent?: boolean;
}) {
  return <section className={cx("snow-panel", accent && "melt-rule", className)}>{children}</section>;
}

export function PanelHead({ title, note }: { title: string; note?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-rime px-5 py-3.5">
      <h2 className="text-base">{title}</h2>
      {note ? <p className="text-sm text-stone-soft">{note}</p> : null}
    </header>
  );
}
