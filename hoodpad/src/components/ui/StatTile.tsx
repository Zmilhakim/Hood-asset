import { clsx } from "@/lib/clsx";

/**
 * One figure off the board. `value` is whatever was read from the chain —
 * when there is nothing to read it says so, it does not show a zero that
 * might be mistaken for a measurement.
 */
export function StatTile({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: string | null | undefined;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={clsx("border-2 border-ink bg-paper-dim px-3 py-2.5", className)}>
      <div className="micro text-ink-soft">{label}</div>
      <div className={clsx("mt-1 truncate text-lg font-semibold", value ? "text-ink" : "text-ink-faint")}>
        {value ?? "n/a"}
      </div>
      {hint && <div className="micro mt-0.5 text-ink-faint">{hint}</div>}
    </div>
  );
}
