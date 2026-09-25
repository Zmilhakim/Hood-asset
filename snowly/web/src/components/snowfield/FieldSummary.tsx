"use client";

import { Panel } from "@/components/ui/Panel";
import { Stat } from "@/components/ui/Stat";
import { useFieldStats } from "@/lib/snowfield";
import { timeAgo } from "@/lib/format";

/**
 * How much has been launched here, and when the last one was.
 *
 * Deliberately only that. The supply, the split and the fee rate are constants
 * in the contracts, which are verified with their source published — that is
 * where they are binding, and printing them here would only create a second
 * place for them to be stale or wrong.
 */
export function FieldSummary() {
  const { stats, isLoading } = useFieldStats();

  return (
    <Panel className="px-5 py-5">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-6">
        <Stat value={isLoading || !stats ? "—" : stats.drifts.toString()} label="Drifts launched" tone="melt" />
        <Stat
          value={stats && stats.lastLaunch > 0n ? timeAgo(stats.lastLaunch) : "—"}
          label="Last launch"
          hint={stats && stats.lastLaunch === 0n ? "nothing yet" : undefined}
        />
      </dl>
    </Panel>
  );
}
