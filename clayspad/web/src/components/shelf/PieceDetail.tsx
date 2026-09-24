"use client";

import { useReadContract } from "wagmi";

import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Stat } from "@/components/ui/Stat";
import { explorerAddress } from "@/lib/chain";
import { CLAYSPAD_ADDRESS, SHELF_IS_OPEN, clayspadAbi, clayTokenAbi } from "@/lib/contracts";
import { formatEth, formatPrice, formatTokens, marketCap, shortAddress, timeAgo } from "@/lib/format";
import { amountsInPosition, rangeProgress, weiPerTokenFromSqrtPrice } from "@/lib/pool";
import { poolId, useSlot0, type PoolKey } from "@/lib/poolManager";
import { usePiece } from "@/lib/shelf";

/**
 * One launch, in as much detail as the chain will give.
 *
 * Every figure on this page is derived from two live reads — the piece as the
 * launchpad recorded it, and the pool's price as the manager holds it right
 * now. Nothing is stored here and nothing has a fallback: a figure that could
 * not be read shows an em dash rather than a zero.
 */
export function PieceDetail({ id }: { id: bigint }) {
  const { piece, isLoading } = usePiece(id);

  const { data: key } = useReadContract({
    address: CLAYSPAD_ADDRESS,
    abi: clayspadAbi,
    functionName: "poolKeyOf",
    args: [id],
    query: { enabled: SHELF_IS_OPEN },
  });

  const { slot0 } = useSlot0(key ? poolId(key as PoolKey) : undefined);

  const { data: totalSupply } = useReadContract({
    address: piece?.token,
    abi: clayTokenAbi,
    functionName: "totalSupply",
    query: { enabled: Boolean(piece?.token) },
  });

  if (!SHELF_IS_OPEN) {
    return (
      <EmptyState title="There is nothing to look up yet">
        <p>Clayspad is not deployed, so there is no launch with this number — or any number.</p>
      </EmptyState>
    );
  }

  if (isLoading) return <div className="clay-panel h-64 animate-pulse rounded-sm" />;

  if (!piece) {
    return (
      <EmptyState title="No such launch">
        <p>The shelf has no piece with that number.</p>
      </EmptyState>
    );
  }

  const price = slot0 ? weiPerTokenFromSqrtPrice(slot0.sqrtPriceX96) : null;
  const held = slot0
    ? amountsInPosition(piece.liquidity, slot0.sqrtPriceX96, piece.tickLower, piece.tickUpper)
    : null;
  const progress = slot0 ? rangeProgress(slot0.sqrtPriceX96, piece.tickLower, piece.tickUpper) : null;
  const cap = marketCap(price, (totalSupply as bigint | undefined) ?? null);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="font-display text-3xl font-bold text-paper">{piece.name}</h1>
            <Badge tone="signal">${piece.symbol}</Badge>
          </div>
          {piece.blurb ? <p className="mt-2 max-w-prose text-sm leading-relaxed text-paper-dim">{piece.blurb}</p> : null}
        </div>
        <Badge tone="clay">Piece #{piece.id.toString()}</Badge>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Price" value={formatPrice(price)} hint="One token, right now" />
        <Stat label="Market cap" value={cap ? formatEth(cap) : null} hint="Price across the whole supply" />
        <Stat label="In the pool" value={held ? formatEth(held.eth) : null} hint="Paid in, and not coming out" />
        <Stat label="Still on the shelf" value={held ? formatTokens(held.tokens) : null} hint="Tokens left in the range" />
      </div>

      {progress !== null ? (
        <div className="clay-panel rounded-sm px-5 py-4">
          <div className="flex items-baseline justify-between">
            <span className="micro text-paper-faint">Through its range</span>
            <span className="font-display text-sm font-bold tabular-nums text-signal">
              {(progress * 100).toFixed(1)}%
            </span>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ground-deep">
            <div className="h-full bg-signal" style={{ width: `${Math.min(100, progress * 100)}%` }} />
          </div>
          <p className="mt-3 text-xs leading-relaxed text-paper-faint">
            The pool opens at the bottom of its range and climbs as people buy. At the top, everything the range held
            has been sold.
          </p>
        </div>
      ) : null}

      <section className="clay-panel rounded-sm">
        <h2 className="micro border-b border-clay-dark px-5 py-3 font-semibold text-paper-faint">How this one was split</h2>
        <dl className="divide-y divide-clay-dark text-sm">
          <Row label="Fired into the pool" value={formatTokens(piece.toPool)} />
          <Row label="To the supply wallet" value={formatTokens(piece.toSupplyWallet)} hint="Liquid from the first block" />
          <Row label="Supply wallet" value={shortAddress(piece.supplyWallet)} href={explorerAddress(piece.supplyWallet)} />
          <Row label="Creator" value={shortAddress(piece.creator)} href={explorerAddress(piece.creator)} />
          <Row label="Token" value={shortAddress(piece.token)} href={explorerAddress(piece.token)} />
          <Row label="Fired" value={timeAgo(piece.launchedAt)} />
        </dl>
      </section>

      <p className="max-w-prose text-xs leading-relaxed text-clay">
        The share sent to the supply wallet is not vested, cliffed or locked, and no contract in this launchpad can
        restrain it. Whoever holds that wallet can sell into any bid that appears.
      </p>
    </div>
  );
}

function Row({ label, value, hint, href }: { label: string; value: string | null; hint?: string; href?: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-3">
      <dt className="text-paper-faint">
        {label}
        {hint ? <span className="ml-2 text-xs text-clay">{hint}</span> : null}
      </dt>
      <dd className="font-semibold tabular-nums text-paper">
        {value === null ? (
          <span className="text-clay">—</span>
        ) : href ? (
          <a href={href} target="_blank" rel="noreferrer" className="transition-colors hover:text-signal">
            {value} ↗
          </a>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}
