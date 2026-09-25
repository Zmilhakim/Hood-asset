"use client";

import Link from "next/link";

import { Panel, PanelHead } from "@/components/ui/Panel";
import { Pill } from "@/components/ui/Pill";
import { useDrifts, type Drift } from "@/lib/snowfield";
import { formatTokens, shortAddress, timeAgo } from "@/lib/format";

/**
 * The snowfield, as a table.
 *
 * A table rather than a grid of cards: every drift carries the same six facts,
 * and facts that line up in columns can be compared down the page. Cards make
 * each one look like a different kind of thing, which is exactly what these are
 * not — the split and the fee are identical for every launch by construction.
 */
export function DriftList({ limit = 50n }: { limit?: bigint }) {
  const { drifts, isLoading, isError } = useDrifts({ limit });

  return (
    <Panel>
      <PanelHead
        title="The snowfield"
        note={drifts ? `${drifts.length} ${drifts.length === 1 ? "drift" : "drifts"}` : undefined}
      />

      {isLoading ? <Empty>Reading the chain…</Empty> : null}
      {isError ? <Empty tone="warn">The chain did not answer. It may just be busy — this page retries.</Empty> : null}

      {drifts && drifts.length === 0 ? (
        <Empty>
          Nothing has been launched yet. The snowfield is empty because it is empty, not because this page is
          broken.{" "}
          <Link href="/launch" className="text-melt underline underline-offset-2">
            Launch the first one
          </Link>
          .
        </Empty>
      ) : null}

      {drifts && drifts.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-rime text-left">
                <Th>Token</Th>
                <Th className="text-right">Buried</Th>
                <Th className="text-right">Liquid</Th>
                <Th className="text-right">Creator</Th>
                <Th className="text-right">Launched</Th>
              </tr>
            </thead>
            <tbody>
              {drifts.map((drift: Drift) => (
                <tr key={drift.id.toString()} className="border-b border-rime/60 last:border-0 hover:bg-field-deep/60">
                  <td className="px-5 py-3">
                    <Link href={`/drift/${drift.id}`} className="group flex items-baseline gap-2">
                      <span className="font-medium text-stone group-hover:text-melt">{drift.name}</span>
                      <Pill tone="melt">${drift.symbol}</Pill>
                    </Link>
                  </td>
                  <td className="figure px-5 py-3 text-right text-stone-soft">{formatTokens(drift.toPool)}</td>
                  <td className="figure px-5 py-3 text-right text-stone-soft">{formatTokens(drift.toSupplyWallet)}</td>
                  <td className="figure px-5 py-3 text-right text-stone-faint">{shortAddress(drift.creator)}</td>
                  <td className="px-5 py-3 text-right text-stone-faint">{timeAgo(drift.launchedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </Panel>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <th className={`label px-5 py-2.5 font-semibold ${className}`}>{children}</th>;
}

function Empty({ children, tone = "plain" }: { children: React.ReactNode; tone?: "plain" | "warn" }) {
  return (
    <p className={`px-5 py-8 text-sm ${tone === "warn" ? "text-crevasse" : "text-stone-soft"}`}>{children}</p>
  );
}
