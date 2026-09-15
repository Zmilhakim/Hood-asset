import Link from "next/link";

import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import { BOARD_IS_OPEN } from "@/lib/contracts";
import { TICKER } from "@/lib/brand";

export function TickerNotice() {
  return (
    <Panel
      label="The board's own notice"
      aside={<Badge tone={BOARD_IS_OPEN ? "live" : "idle"}>{BOARD_IS_OPEN ? "Board open" : "Not live yet"}</Badge>}
    >
      <div className="grid gap-6 md:grid-cols-[auto_1fr] md:items-center">
        <div className="border-2 border-ink bg-ink px-6 py-5 text-center text-paper">
          <div className="font-display text-4xl leading-none">{TICKER}</div>
          <div className="micro mt-2 text-paper/60">Hoodpad</div>
        </div>

        <div>
          <p className="max-w-prose text-sm leading-6 text-ink-soft">
            {TICKER} goes through Hoodpad like anything else: one billion supply, the whole of it in a pool nobody can
            unlock, nothing held back for whoever built it. It is not live yet. When it is, it will show up on the
            board as a notice you can read for yourself — which is the only reason to believe any of the above.
          </p>
          <div className="mt-4 flex flex-wrap gap-2.5">
            <Link href="/board" className={buttonClasses("quiet")}>
              Watch the board
            </Link>
          </div>
        </div>
      </div>
    </Panel>
  );
}
