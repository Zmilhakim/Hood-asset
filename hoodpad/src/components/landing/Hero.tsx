import Link from "next/link";

import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import { ROBINHOOD_CHAIN_ID } from "@/lib/chain";
import { TICKER } from "@/lib/brand";

const PROMISES = [
  { label: "Supply", value: "Fixed at 1,000,000,000" },
  { label: "Pool", value: "Locked, single sided" },
  { label: "Team holds", value: "Nothing" },
] as const;

export function Hero() {
  return (
    <Panel
      label={`Hoodpad · Robinhood Chain ${ROBINHOOD_CHAIN_ID}`}
      aside={<Badge tone="flame">{TICKER}</Badge>}
      bodyClassName="p-5 sm:p-8"
    >
      <h1 className="font-display max-w-[18ch] text-4xl leading-[1.1] sm:text-5xl">
        Every launch gets nailed to the board
      </h1>

      <p className="mt-4 max-w-prose text-sm leading-6 text-ink-soft sm:text-base sm:leading-7">
        Hoodpad is a launchpad on Robinhood Chain with nothing clever in it. One transaction mints the supply, opens a
        single-sided pool with all of it, and locks the position for good. Every figure you see is read back out of the
        board contract — none of it is estimated, and none of it is ours to edit.
      </p>

      <div className="mt-6 flex flex-wrap gap-2.5">
        <Link href="/launch" className={buttonClasses("flame")}>
          Post a notice
        </Link>
        <Link href="/board" className={buttonClasses("quiet")}>
          Read the board
        </Link>
        <Link href="/learn" className={buttonClasses("quiet")}>
          How it works
        </Link>
      </div>

      <dl className="mt-7 grid gap-2.5 border-t-2 border-dashed border-ink/20 pt-5 sm:grid-cols-3">
        {PROMISES.map((item) => (
          <div key={item.label} className="border-2 border-ink bg-paper-dim px-3 py-2.5">
            <dt className="micro text-ink-soft">{item.label}</dt>
            <dd className="mt-0.5 font-semibold text-ink">{item.value}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}
