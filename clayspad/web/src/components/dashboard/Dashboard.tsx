"use client";

import { useAccount, useReadContract, useReadContracts, useWaitForTransactionReceipt, useWriteContract } from "wagmi";

import { PieceCard } from "@/components/shelf/PieceCard";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Stat } from "@/components/ui/Stat";
import { explorerTx } from "@/lib/chain";
import {
  CLAYSPAD_ADDRESS,
  NATIVE,
  SHELF_IS_OPEN,
  clayHookAbi,
  clayspadAbi,
  type Piece,
} from "@/lib/contracts";
import { formatEth, formatTokens } from "@/lib/format";
import { usePiecesOf } from "@/lib/shelf";

/**
 * What you launched, and what those launches owe you.
 *
 * The fee is banked in the hook as a per-currency ledger, so what is claimable
 * is one read per currency: ETH from every buy, and the token itself from every
 * sell. Both are read live; neither is estimated from events.
 */
export function Dashboard() {
  const { address, isConnected } = useAccount();
  const { ids } = usePiecesOf(address);

  const { data: hook } = useReadContract({
    address: CLAYSPAD_ADDRESS,
    abi: clayspadAbi,
    functionName: "hook",
    query: { enabled: SHELF_IS_OPEN },
  });

  const { data: pieces } = useReadContracts({
    contracts: (ids ?? []).map((id) => ({
      address: CLAYSPAD_ADDRESS,
      abi: clayspadAbi,
      functionName: "pieceAt" as const,
      args: [id],
    })),
    query: { enabled: SHELF_IS_OPEN && (ids?.length ?? 0) > 0 },
  });

  const mine = (pieces ?? [])
    .map((entry) => (entry.status === "success" ? (entry.result as Piece) : null))
    .filter((piece): piece is Piece => piece !== null);

  const currencies: `0x${string}`[] = [NATIVE, ...mine.map((piece) => piece.token)];

  const { data: owedReads } = useReadContracts({
    contracts: currencies.map((currency) => ({
      address: hook as `0x${string}` | undefined,
      abi: clayHookAbi,
      functionName: "owed" as const,
      args: address ? [address, currency] : undefined,
    })),
    query: { enabled: SHELF_IS_OPEN && Boolean(hook) && Boolean(address) },
  });

  const owed = currencies.map((currency, index) => ({
    currency,
    amount: owedReads?.[index]?.status === "success" ? (owedReads[index].result as bigint) : null,
    symbol: index === 0 ? "ETH" : mine[index - 1]?.symbol,
  }));

  const claimable = owed.filter((entry) => (entry.amount ?? 0n) > 0n);

  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isMining, isSuccess } = useWaitForTransactionReceipt({ hash });

  if (!SHELF_IS_OPEN) {
    return (
      <EmptyState title="Nothing to show yet">
        <p>Clayspad is not deployed, so there are no launches to be yours and no fees to be owed.</p>
      </EmptyState>
    );
  }

  if (!isConnected) {
    return (
      <EmptyState title="Connect a wallet">
        <p>This page reads what one address launched and what it is owed. It needs to know which address.</p>
      </EmptyState>
    );
  }

  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <h2 className="micro font-semibold text-paper-faint">What you are owed</h2>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {owed.slice(0, 6).map((entry) => (
            <Stat
              key={entry.currency}
              label={entry.symbol ? `In ${entry.symbol}` : "In tokens"}
              value={
                entry.amount === null
                  ? null
                  : entry.currency === NATIVE
                    ? formatEth(entry.amount)
                    : formatTokens(entry.amount)
              }
            />
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            tone="signal"
            disabled={claimable.length === 0 || isPending || isMining || !hook}
            onClick={() =>
              writeContract({
                address: hook as `0x${string}`,
                abi: clayHookAbi,
                functionName: "withdrawMany",
                args: [claimable.map((entry) => entry.currency)],
              })
            }
          >
            {isPending ? "Confirm in your wallet…" : isMining ? "Claiming…" : "Claim everything"}
          </Button>
          {claimable.length === 0 ? (
            <span className="text-sm text-paper-faint">
              Nothing owed yet. A fee is only charged when somebody trades.
            </span>
          ) : null}
        </div>

        {error ? <p className="text-sm text-amber-400">{error.message.split("\n")[0]}</p> : null}
        {isSuccess && hash ? (
          <p className="text-sm text-signal">
            Claimed.{" "}
            <a href={explorerTx(hash)} target="_blank" rel="noreferrer" className="underline">
              See the transaction ↗
            </a>
          </p>
        ) : null}
      </section>

      <section className="space-y-4">
        <h2 className="micro font-semibold text-paper-faint">What you fired</h2>
        {mine.length === 0 ? (
          <EmptyState title="You have not launched anything">
            <p>Nothing from this address is on the shelf yet.</p>
          </EmptyState>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {mine.map((piece) => (
              <PieceCard key={piece.id.toString()} piece={piece} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
