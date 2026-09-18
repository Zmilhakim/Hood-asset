"use client";

import Link from "next/link";
import { useConnection, useWaitForTransactionReceipt, useWriteContract } from "wagmi";

import { NoticeCard } from "@/components/board/NoticeCard";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Panel } from "@/components/ui/Panel";
import { useV4Addresses, useV4Fees, useV4NoticesOf } from "@/lib/board-v4";
import { ROBINHOOD_CHAIN_ID } from "@/lib/chain";
import {
  hoodFeeHookAbi,
  hoodpadLockerAbi,
  poolKeyOf,
  V4_BOARD_IS_OPEN,
  type NoticeV4,
} from "@/lib/contracts-v4";
import { formatEth, formatTokenAmount } from "@/lib/format";

/**
 * The two collects, side by side, because they really are two things.
 *
 * The hook's cut is money the hook is already holding on the poster's behalf —
 * `claim` just moves it. The LP fee has not been settled anywhere yet: in v4 a
 * position's fees only crystallise when the position is touched, so
 * `collectFees` is what makes them exist as a number and pay out in the same
 * breath. Showing them as one button would imply a single balance, and there
 * isn't one.
 *
 * Both calls are permissionless and both pay the poster regardless of who sends
 * them, so neither button can send money anywhere else.
 */
function Collect({ notice, hook, locker }: { notice: NoticeV4; hook?: `0x${string}`; locker?: `0x${string}` }) {
  const fees = useV4Fees(notice, hook, locker);

  const claim = useWriteContract();
  const claimReceipt = useWaitForTransactionReceipt({ hash: claim.data });

  const collect = useWriteContract();
  const collectReceipt = useWaitForTransactionReceipt({ hash: collect.data });

  if (!hook || !locker) return null;

  const hasHookFees = (fees.hookEth ?? 0n) > 0n || (fees.hookToken ?? 0n) > 0n;
  const hookAmount = [
    (fees.hookEth ?? 0n) > 0n ? formatEth(fees.hookEth) : null,
    (fees.hookToken ?? 0n) > 0n ? `${formatTokenAmount(fees.hookToken)} ${notice.symbol}` : null,
  ]
    .filter(Boolean)
    .join(" + ");

  return (
    <div className="space-y-2.5 border-t-2 border-dashed border-ink/20 px-3 py-2.5 sm:px-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          tone="flame"
          disabled={!hasHookFees || claim.isPending || claimReceipt.isLoading}
          onClick={() =>
            claim.writeContract({
              address: hook,
              abi: hoodFeeHookAbi,
              functionName: "claim",
              chainId: ROBINHOOD_CHAIN_ID,
              args: [poolKeyOf(notice, hook)],
            })
          }
        >
          {claim.isPending
            ? "Confirm in wallet…"
            : claimReceipt.isLoading
              ? "Claiming…"
              : "Claim the swap fee"}
        </Button>
        <span className="micro text-ink-faint">
          {claimReceipt.isSuccess
            ? "Sent to you."
            : hasHookFees
              ? `${hookAmount} waiting`
              : fees.isLoading
                ? "reading…"
                : "nothing yet — the hook collects on every swap"}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          tone="quiet"
          disabled={collect.isPending || collectReceipt.isLoading}
          onClick={() =>
            collect.writeContract({
              address: locker,
              abi: hoodpadLockerAbi,
              functionName: "collectFees",
              chainId: ROBINHOOD_CHAIN_ID,
              args: [notice.poolId],
            })
          }
        >
          {collect.isPending
            ? "Confirm in wallet…"
            : collectReceipt.isLoading
              ? "Collecting…"
              : "Collect the LP fee"}
        </Button>
        <span className="micro text-ink-faint">
          {collectReceipt.isSuccess
            ? "Sent to you."
            : collect.error
              ? "Nothing has accrued on the position yet."
              : "the pool's own 1%, settled when you collect"}
        </span>
      </div>

      <p className="micro text-ink-faint">
        Liquidity {fees.lockedLiquidity?.toString() ?? "…"} — neither button can move it, and nothing else can either.
      </p>
    </div>
  );
}

export function MyNoticesV4() {
  const { address, isConnected } = useConnection();
  const { notices, isLoading } = useV4NoticesOf(address);
  const { hook, locker } = useV4Addresses();

  if (!V4_BOARD_IS_OPEN) {
    return (
      <Panel label="Your notices">
        <EmptyState title="Nothing to show yet">
          The v4 board is not deployed on Robinhood Chain, so there is no board to read your notices from.
        </EmptyState>
      </Panel>
    );
  }

  if (!isConnected) {
    return (
      <Panel label="Your notices">
        <EmptyState title="Connect to see your notices">
          This page reads the board for the address you connect with. Nothing is stored here.
        </EmptyState>
      </Panel>
    );
  }

  return (
    <Panel
      label="Your notices"
      aside={<Badge tone="live">{notices ? `${notices.length} posted` : "reading"}</Badge>}
      bodyClassName="p-3 sm:p-4"
    >
      {isLoading ? (
        <ul className="space-y-3" aria-busy>
          {[0, 1].map((row) => (
            <li key={row} className="h-28 animate-pulse border-2 border-ink/20 bg-paper-dim/60" />
          ))}
        </ul>
      ) : !notices || notices.length === 0 ? (
        <EmptyState title="You have not posted anything">
          When you launch through Hoodpad the notice shows up here, along with both of the fees it earns — the hook&apos;s
          cut of every swap, and the pool&apos;s own.{" "}
          <Link href="/launch" className="underline decoration-flame decoration-2 underline-offset-2">
            Post your first
          </Link>
          .
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {notices.map((notice) => (
            <li key={notice.token} className="border-2 border-ink bg-paper">
              <NoticeCard notice={notice} />
              <Collect notice={notice} hook={hook} locker={locker} />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
