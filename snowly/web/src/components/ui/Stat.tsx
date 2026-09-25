import type { ReactNode } from "react";

import { cx } from "@/lib/cx";

/**
 * One figure and what it is.
 *
 * The label sits under the number rather than over it. A reader scanning a row
 * of these is looking for the figure first and only then asking what it was, so
 * that is the order they are printed in.
 */
export function Stat({
  value,
  label,
  hint,
  tone = "plain",
}: {
  value: ReactNode;
  label: string;
  hint?: ReactNode;
  tone?: "plain" | "melt";
}) {
  return (
    <div>
      <p className={cx("figure text-xl leading-tight", tone === "melt" ? "text-melt" : "text-stone")}>{value}</p>
      <p className="label mt-1.5">{label}</p>
      {hint ? <p className="mt-1 text-xs text-stone-faint">{hint}</p> : null}
    </div>
  );
}
