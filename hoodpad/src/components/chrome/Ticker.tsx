import { clsx } from "@/lib/clsx";

/**
 * The arrivals batten under the header. It repeats its contents twice so the
 * drift animation can loop seamlessly; the copy is duplicated visually, not
 * for screen readers.
 */
export function Ticker({ label, items }: { label: string; items: string[] }) {
  const run = items.length > 0 ? items : ["Nothing posted yet"];

  return (
    <div className="flex items-stretch border-b-2 border-ink bg-paper-deep text-ink">
      <span className="micro flex shrink-0 items-center border-r-2 border-ink bg-flame px-3 font-semibold">
        {label}
      </span>
      <div className="relative flex-1 overflow-hidden">
        <div className="drifting flex w-max">
          {[0, 1].map((copy) => (
            <ul key={copy} className="flex shrink-0" aria-hidden={copy === 1}>
              {run.map((item, index) => (
                <li key={`${copy}-${index}`} className={clsx("micro flex items-center gap-3 px-4 py-1.5")}>
                  <span className="text-ink-faint">◇</span>
                  <span className="text-ink-soft">{item}</span>
                </li>
              ))}
            </ul>
          ))}
        </div>
      </div>
    </div>
  );
}
