"use client";

import { Stat } from "@/components/ui/Stat";
import { SHELF_IS_OPEN } from "@/lib/contracts";
import { formatBps, formatCount, formatTokens, timeAgo } from "@/lib/format";
import { useShelfStats } from "@/lib/shelf";

/**
 * The shelf header.
 *
 * Every figure below comes out of `shelfStats()` on the launchpad. None of them
 * is written in this file, and none has a fallback value — a figure that could
 * not be read shows an em dash, because a zero would be a claim.
 */
export function ShelfStats() {
  const { stats, isLoading } = useShelfStats();

  if (!SHELF_IS_OPEN) return null;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Stat label="Launches" value={isLoading ? null : formatCount(stats?.tokens)} />
      <Stat label="Last fired" value={isLoading ? null : timeAgo(stats?.lastLaunch) ?? "never"} />
      <Stat
        label="Supply per launch"
        value={isLoading ? null : formatTokens(stats?.supply)}
        hint="Fixed for every token"
      />
      <Stat
        label="Fee per swap"
        value={isLoading ? null : formatBps(stats?.feeBps)}
        hint={stats ? `${formatBps(stats.creatorBps)} of it to the creator` : undefined}
      />
    </div>
  );
}
