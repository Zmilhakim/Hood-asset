"use client";

import { Ticker } from "@/components/chrome/Ticker";
import { useLatestNotices } from "@/lib/board";
import { BOARD_IS_OPEN } from "@/lib/contracts";
import { timeAgo } from "@/lib/format";

export function ArrivalsTicker() {
  const { notices } = useLatestNotices(12);

  if (!BOARD_IS_OPEN) {
    return <Ticker label="Arrivals" items={["The board has not opened on Robinhood Chain yet"]} />;
  }

  const items =
    notices?.map((notice) => {
      const when = timeAgo(notice.postedAt);
      return `${notice.symbol} — ${notice.name}${when ? ` · ${when}` : ""}`;
    }) ?? [];

  return <Ticker label="Arrivals" items={items} />;
}
