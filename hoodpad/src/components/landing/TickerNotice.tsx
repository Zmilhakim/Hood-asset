import Link from "next/link";

import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import { BOARD_IS_OPEN } from "@/lib/contracts";
import { HPAD_POOL, HPAD_POSTER, HPAD_TOKEN, TICKER } from "@/lib/brand";
import { explorerAddress } from "@/lib/chain";

export function TickerNotice() {
  return (
    <Panel
      label="The board's own notice"
      aside={<Badge tone={BOARD_IS_OPEN ? "live" : "idle"}>{BOARD_IS_OPEN ? "Live" : "Not live yet"}</Badge>}
    >
      <div className="grid gap-6 md:grid-cols-[auto_1fr] md:items-center">
        <div className="border-2 border-ink bg-ink px-6 py-5 text-center text-paper">
          <div className="font-display text-4xl leading-none">{TICKER}</div>
          <div className="micro mt-2 text-paper/60">Hoodpad</div>
        </div>

        <div>
          <p className="max-w-prose text-sm leading-6 text-ink-soft">
            {TICKER} went through Hoodpad like anything else: one billion supply, the whole of it in a pool nobody can
            unlock, nothing held back for whoever built it. It is on the board as a notice you can read for yourself —
            which is the only reason to believe any of the above.
          </p>
          <dl className="mt-4 grid gap-1 font-mono text-xs text-ink-soft">
            <div className="flex flex-wrap gap-x-2">
              <dt className="text-ink-soft/60">token</dt>
              <dd className="break-all">{HPAD_TOKEN}</dd>
            </div>
            <div className="flex flex-wrap gap-x-2">
              <dt className="text-ink-soft/60">pool</dt>
              <dd className="break-all">{HPAD_POOL}</dd>
            </div>
            <div className="flex flex-wrap gap-x-2">
              <dt className="text-ink-soft/60">posted by</dt>
              <dd className="break-all">{HPAD_POSTER}</dd>
            </div>
          </dl>
          <p className="mt-3 max-w-prose text-xs leading-5 text-ink-soft/70">
            That last address posted this notice and deployed the board. None of the supply was held back for it —
            the whole billion went into the pool and stayed there. What it does hold is trading fees the pool has
            paid out, which is the one thing any poster keeps. Both of those are balances anyone can look up, which
            is the only useful form a sentence like &ldquo;the team holds nothing&rdquo; can take.
          </p>
          <div className="mt-4 flex flex-wrap gap-2.5">
            <Link href="/board" className={buttonClasses("quiet")}>
              Read the notice
            </Link>
            <a
              href={explorerAddress(HPAD_TOKEN)}
              target="_blank"
              rel="noreferrer"
              className={buttonClasses("quiet")}
            >
              Token contract ↗
            </a>
          </div>
        </div>
      </div>
    </Panel>
  );
}
