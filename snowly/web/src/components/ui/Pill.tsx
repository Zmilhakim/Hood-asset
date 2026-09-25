import type { ReactNode } from "react";

import { cx } from "@/lib/cx";

export function Pill({ children, tone = "ice" }: { children: ReactNode; tone?: "ice" | "melt" | "warn" }) {
  return (
    <span
      className={cx(
        "figure inline-flex items-center rounded-full px-2 py-0.5 text-[0.6875rem] font-medium",
        tone === "melt" && "bg-melt-wash text-melt-deep",
        tone === "ice" && "bg-field-deep text-stone-soft",
        tone === "warn" && "bg-crevasse/10 text-crevasse",
      )}
    >
      {children}
    </span>
  );
}
