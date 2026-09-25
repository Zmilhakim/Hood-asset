"use client";

import Link from "next/link";

import { Panel, PanelHead } from "@/components/ui/Panel";
import { Pill } from "@/components/ui/Pill";
import { Stat } from "@/components/ui/Stat";
import { explorerAddress } from "@/lib/chain";
import { GLACIER, NATIVE } from "@/lib/contracts";
import { formatEth, formatTokens, shortAddress, timeAgo } from "@/lib/format";
import { amountsInPosition, rangeProgress, weiPerTokenFromSqrtPrice } from "@/lib/pool";
import { poolId, useSlot0, type PoolKey } from "@/lib/poolManager";
import { useDrift } from "@/lib/snowfield";
import { SNOW_HOOK } from "@/lib/contracts";

export function DriftDetail({ id }: { id: bigint }) {
  const { drift, isLoading, isError } = useDrift(id);

  const key: PoolKey | undefined = drift
    ? {
        currency0: NATIVE,
        currency1: drift.token,
        fee: 0,
        tickSpacing: drift.tickSpacing,
        hooks: SNOW_HOOK,
      }
    : undefined;

  const { slot0 } = useSlot0(key ? poolId(key) : undefined);

  if (isLoading) return <p className="text-sm text-stone-soft">Reading the chain…</p>;
  if (isError || !drift) {
    return (
      <Panel className="px-5 py-8">
        <p className="text-sm text-crevasse">
          There is no drift #{id.toString()} on this launchpad — or the chain did not answer.
        </p>
        <Link href="/snowfield" className="mt-3 inline-block text-sm text-melt underline underline-offset-2">
          Back to the snowfield
        </Link>
      </Panel>
    );
  }

  const weiPerToken = slot0 ? weiPerTokenFromSqrtPrice(slot0.sqrtPriceX96) : null;
  const held = slot0
    ? amountsInPosition(drift.liquidity, slot0.sqrtPriceX96, drift.tickLower, drift.tickUpper)
    : null;
  const progress = slot0 ? rangeProgress(slot0.sqrtPriceX96, drift.tickLower, drift.tickUpper) : null;

  return (
    <div className="space-y-8">
      <header>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl md:text-3xl">{drift.name}</h1>
          <Pill tone="melt">${drift.symbol}</Pill>
          <span className="figure text-xs text-stone-faint">drift #{drift.id.toString()}</span>
        </div>
        {drift.blurb ? <p className="mt-3 max-w-2xl text-[0.9375rem] text-stone-soft">{drift.blurb}</p> : null}
        <p className="mt-3 figure text-xs text-stone-faint">
          <a href={explorerAddress(drift.token)} target="_blank" rel="noreferrer" className="hover:text-melt">
            {drift.token} ↗
          </a>
          {" · launched "}
          {timeAgo(drift.launchedAt)}
        </p>
      </header>

      <Panel className="px-5 py-5">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3">
          <Stat
            value={weiPerToken === null ? "—" : `${formatEth(weiPerToken)} ETH`}
            label="Price per token"
            tone="melt"
          />
          <Stat value={held ? `${formatEth(held.eth)} ETH` : "—"} label="ETH in the pool" hint="paid in by buyers" />
          <Stat value={held ? formatTokens(held.tokens) : "—"} label="Tokens left in the pool" />
        </dl>

        {progress !== null ? (
          <div className="mt-6">
            <div className="flex items-baseline justify-between">
              <span className="label">Through its range</span>
              <span className="figure text-xs text-stone-soft">{(progress * 100).toFixed(1)}%</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-field-deep">
              <div className="h-full rounded-full bg-melt" style={{ width: `${Math.min(progress * 100, 100)}%` }} />
            </div>
          </div>
        ) : null}
      </Panel>

      <Panel>
        <PanelHead title="Where the supply went" note="split in the token’s constructor, in one transaction" />
        <dl className="divide-y divide-rime text-sm">
          <Row
            label="Buried in the glacier"
            value="one position"
            note="added once, with no function anywhere that takes it back out"
            href={explorerAddress(GLACIER)}
          />
          <Row
            label="To the supply wallet"
            value={shortAddress(drift.supplyWallet)}
            note="liquid from the first block — not vested, not cliffed, not locked"
            href={explorerAddress(drift.supplyWallet)}
            hrefLabel="the wallet"
            warn
          />
          <Row
            label="Launched by"
            value={shortAddress(drift.creator)}
            note="the creator’s share of every swap fee on this pool is theirs"
            href={explorerAddress(drift.creator)}
          />
        </dl>
      </Panel>

      <Panel accent className="px-5 py-5">
        <h2 className="text-base">On the liquid share</h2>
        <p className="mt-2 text-sm leading-relaxed text-stone-soft">
          Nothing in these contracts restrains the supply wallet, and none of them pretends to. Whoever holds it
          can sell into any bid that appears. What it cannot do on day one is sell into a pool that holds no ETH
          — the whole position is still token until somebody buys, so it becomes sellable only as the pool fills.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-stone-soft">
          How large that share is, and what every swap pays, are constants in the launchpad and the hook. Read
          them there.
        </p>
      </Panel>
    </div>
  );
}

function Row({
  label,
  value,
  note,
  href,
  hrefLabel,
  warn = false,
}: {
  label: string;
  value: string;
  note: string;
  href: string;
  hrefLabel?: string;
  warn?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 px-5 py-4">
      <div className="min-w-0">
        <p className="font-medium">{label}</p>
        <p className={`mt-0.5 text-xs leading-relaxed ${warn ? "text-crevasse" : "text-stone-faint"}`}>{note}</p>
      </div>
      <div className="text-right">
        <p className="figure">{value}</p>
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="figure text-xs text-stone-faint transition hover:text-melt"
        >
          {hrefLabel ?? "on the explorer"} ↗
        </a>
      </div>
    </div>
  );
}
