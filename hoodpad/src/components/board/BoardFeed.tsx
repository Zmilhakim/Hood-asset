"use client";

import Link from "next/link";

import { NoticeCard } from "./NoticeCard";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Panel } from "@/components/ui/Panel";
import { buttonClasses } from "@/components/ui/Button";
import { useLatestNotices } from "@/lib/board";
import { useV4Notices } from "@/lib/board-v4";
import { BOARD_IS_OPEN } from "@/lib/contracts";
import { V4_BOARD_IS_OPEN } from "@/lib/contracts-v4";
import type { BoardNotice } from "@/lib/notice";

export function BoardFeed() {
  // Both readers run and each gates its own request on its board being
  // configured, so only one of them ever reaches the chain.
  const v3 = useLatestNotices(40);
  const v4 = useV4Notices(40);

  const { notices, isLoading, isError } = V4_BOARD_IS_OPEN ? v4 : v3;
  const rows: readonly BoardNotice[] = notices ?? [];
  const boardOpen = V4_BOARD_IS_OPEN || BOARD_IS_OPEN;

  return (
    <div>
      <Panel
        label="Notices, newest first"
        aside={rows.length > 0 ? <Badge tone="live">{rows.length} posted</Badge> : undefined}
        bodyClassName="p-3 sm:p-4"
      >
        {!boardOpen ? (
          <EmptyState title="The board opens soon">
            Hoodpad is not live on Robinhood Chain yet. The first notice lands here the moment a token launches — and
            it will be read from the chain, not typed in.
          </EmptyState>
        ) : isLoading ? (
          <ul className="space-y-3" aria-busy>
            {[0, 1, 2].map((row) => (
              <li key={row} className="h-28 animate-pulse border-2 border-ink/20 bg-paper-dim/60" />
            ))}
          </ul>
        ) : isError ? (
          <EmptyState title="The board is out of reach">
            The RPC endpoint did not answer. Nothing is shown here rather than something stale — reload once the
            connection is back.
          </EmptyState>
        ) : rows.length === 0 ? (
          <EmptyState title="Nothing posted yet">
            No token has launched through Hoodpad so far.{" "}
            <Link href="/launch" className="underline decoration-flame decoration-2 underline-offset-2">
              Post the first one
            </Link>
            .
          </EmptyState>
        ) : (
          <ul className="space-y-3">
            {rows.map((notice) => (
              <li key={notice.token}>
                <NoticeCard notice={notice} />
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {boardOpen && rows.length > 0 && (
        <div className="mt-4 flex justify-center">
          <Link href="/launch" className={buttonClasses("quiet")}>
            Post a notice
          </Link>
        </div>
      )}
    </div>
  );
}
