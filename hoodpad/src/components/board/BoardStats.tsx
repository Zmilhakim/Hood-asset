"use client";

import { StatTile } from "@/components/ui/StatTile";
import { useBoardStats } from "@/lib/board";
import { BOARD_IS_OPEN } from "@/lib/contracts";
import { formatCount, formatEth, formatTokenAmount, timeAgo } from "@/lib/format";

export function BoardStats() {
  const { stats, isLoading, isError } = useBoardStats();

  // Three honest states: no board yet, still reading, and a real answer.
  const read = <T,>(value: T | undefined, render: (value: T) => string | null) => {
    if (!BOARD_IS_OPEN) return null;
    if (isLoading) return "…";
    if (isError || value === undefined) return null;
    return render(value);
  };

  return (
    <div>
      <div className="grid grid-cols-2 gap-2.5">
        <StatTile label="Notices posted" value={read(stats?.tokens, (v) => formatCount(v))} />
        <StatTile label="Supply each" value={read(stats?.fixedSupply, (v) => formatTokenAmount(v))} />
        <StatTile label="Last launch" value={read(stats?.lastLaunch, (v) => timeAgo(v))} />
        <StatTile label="Posting fee" value={read(stats?.postingFee, (v) => formatEth(v))} />
      </div>
      <p className="micro mt-2.5 text-ink-faint">
        {isError
          ? "Could not reach the chain — figures withheld rather than guessed."
          : "Notices are posted with ETH."}
      </p>
    </div>
  );
}
