import type { Metadata } from "next";
import Link from "next/link";

import { BoardFeed } from "@/components/board/BoardFeed";
import { BoardStats } from "@/components/board/BoardStats";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import { BOARD_IS_OPEN } from "@/lib/contracts";
import { ROBINHOOD_CHAIN_ID } from "@/lib/chain";

export const metadata: Metadata = {
  title: "Board",
  description: "Every token launched through Hoodpad, read straight from the chain.",
};

export default function BoardPage() {
  return (
    <div className="space-y-5">
      <Panel
        label={`The board · Robinhood Chain ${ROBINHOOD_CHAIN_ID}`}
        aside={<Badge tone={BOARD_IS_OPEN ? "live" : "idle"}>{BOARD_IS_OPEN ? "Reading chain" : "Not deployed"}</Badge>}
      >
        <div className="grid gap-6 md:grid-cols-[1.35fr_1fr] md:items-start">
          <div>
            <h1 className="font-display text-3xl leading-[1.15] sm:text-4xl">Every launch gets nailed to the board</h1>
            <p className="mt-3 max-w-prose text-sm leading-6 text-ink-soft">
              Every token that launches through Hoodpad is posted here as a notice. One transaction mints
              the supply, opens a single-sided pool and locks the position for good. Every figure on this page is read
              back out of the board contract — none of it is estimated.
            </p>
            <div className="mt-5 flex flex-wrap gap-2.5">
              <Link href="/launch" className={buttonClasses("flame")}>
                Post a notice
              </Link>
              <Link href="/learn" className={buttonClasses("quiet")}>
                Read the rules
              </Link>
            </div>
          </div>

          <BoardStats />
        </div>
      </Panel>

      <BoardFeed />
    </div>
  );
}
