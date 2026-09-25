"use client";

import Link from "next/link";
import { useReadContract } from "wagmi";

import { drainpadAbi } from "@/lib/abi/drainpad";
import { DRAINPAD } from "@/lib/contracts";
import type { Runoff } from "@/lib/catchment";
import { RunoffCard } from "./RunoffCard";

/**
 * The newest launches, read straight off the launchpad.
 *
 * `latest` returns them newest first, which is the order the list reads in, so
 * nothing is sorted here — the contract's answer is the answer.
 */
export function LatestRunoffs({ limit = 6, showAll = true }: { limit?: number; showAll?: boolean }) {
  const { data, isLoading, isError } = useReadContract({
    address: DRAINPAD,
    abi: drainpadAbi,
    functionName: "latest",
    args: [0n, BigInt(limit)],
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="slab h-[88px] animate-pulse opacity-60" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <p className="slab p-5 text-sm text-grit">
        The chain did not answer. That is the node, not the catchment — the launches are still where they were.
      </p>
    );
  }

  const runoffs = (data ?? []) as unknown as Runoff[];

  if (runoffs.length === 0) {
    return (
      <div className="slab p-6">
        <p className="text-sm leading-relaxed text-grit">
          Nothing has been poured yet. The first one becomes runoff zero, permanently.
        </p>
        <Link
          href="/pour"
          className="mt-4 inline-block border border-paint px-4 py-2 font-display text-xs font-bold uppercase tracking-[0.14em] text-paint transition-colors hover:bg-paint hover:text-asphalt-deep"
        >
          Pour the first
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {runoffs.map((runoff) => (
        <RunoffCard key={runoff.token} runoff={runoff} />
      ))}
      {showAll ? (
        <Link href="/catchment" className="stencil-dim inline-block pt-2 transition-colors hover:text-paint">
          The whole catchment →
        </Link>
      ) : null}
    </div>
  );
}
