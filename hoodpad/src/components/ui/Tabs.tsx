"use client";

import { clsx } from "@/lib/clsx";

export type TabKey = string;

export function Tabs<T extends TabKey>({
  tabs,
  active,
  onChange,
}: {
  tabs: ReadonlyArray<{ key: T; label: string; count?: number | null }>;
  active: T;
  onChange: (key: T) => void;
}) {
  return (
    <div role="tablist" aria-label="Board sections" className="flex gap-1">
      {tabs.map((tab) => {
        const selected = tab.key === active;
        return (
          <button
            key={tab.key}
            role="tab"
            type="button"
            aria-selected={selected}
            onClick={() => onChange(tab.key)}
            className={clsx(
              "micro border-2 border-b-0 px-3 py-1.5 font-semibold",
              selected
                ? "border-ink bg-paper text-ink"
                : "border-ink bg-paper-deep text-ink-soft hover:bg-paper-dim hover:text-ink",
            )}
          >
            {tab.label}
            {typeof tab.count === "number" && <span className="ml-1.5 text-ink-faint">{tab.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
