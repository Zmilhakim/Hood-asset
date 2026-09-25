"use client";

import { useState } from "react";
import { useReadContract } from "wagmi";

import { drainpadAbi } from "@/lib/abi/drainpad";
import { DRAINPAD } from "@/lib/contracts";
import type { Runoff } from "@/lib/catchment";
import { RunoffCard } from "./RunoffCard";

const PAGE = 12;

export function CatchmentFeed() {
  const [shown, setShown] = useState(PAGE);

  const count = useReadContract({ address: DRAINPAD, abi: drainpadAbi, functionName: "runoffCount" });
  const page = useReadContract({
    address: DRAINPAD,
    abi: drainpadAbi,
    functionName: "latest",
    args: [0n, BigInt(shown)],
  });

  if (page.isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="slab h-[88px] animate-pulse opacity-60" />
        ))}
      </div>
    );
  }

  if (page.isError) {
    return (
      <p className="slab p-5 text-sm text-grit">
        The chain did not answer. That is the node rather than the catchment — try again in a moment.
      </p>
    );
  }

  const runoffs = (page.data ?? []) as unknown as Runoff[];
  const total = (count.data as bigint | undefined) ?? 0n;

  if (runoffs.length === 0) {
    return (
      <p className="slab p-6 text-sm leading-relaxed text-grit">
        Nothing has been poured yet. The first one becomes runoff zero, permanently.
      </p>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {runoffs.map((runoff) => (
          <RunoffCard key={runoff.token} runoff={runoff} />
        ))}
      </div>

      {BigInt(runoffs.length) < total ? (
        <button
          type="button"
          onClick={() => setShown((was) => was + PAGE)}
          className="mt-6 w-full border border-kerb py-3 font-display text-xs font-bold uppercase tracking-[0.14em] text-chalk transition-colors hover:border-kerb-bright"
        >
          Further down
        </button>
      ) : (
        <p className="stencil-dim mt-6">That is the bottom of it</p>
      )}
    </>
  );
}
