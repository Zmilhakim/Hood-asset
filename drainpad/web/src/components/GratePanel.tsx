"use client";

import { formatEther } from "viem";
import { useAccount, useReadContract, useReadContracts, useWaitForTransactionReceipt, useWriteContract } from "wagmi";

import { drainpadAbi } from "@/lib/abi/drainpad";
import { grateAbi } from "@/lib/abi/grate";
import { explorerTx } from "@/lib/chain";
import { DRAINPAD, GRATE, NATIVE } from "@/lib/contracts";
import type { Runoff } from "@/lib/catchment";
import { safeText } from "@/lib/catchment";
import { shortAddress } from "@/lib/site";
import { Wallet } from "./Wallet";

/**
 * Your own ledger entry at the grate, and the button that empties it.
 *
 * A creator's launches are read off the launchpad, because what they are owed in
 * a token is keyed by that token — the ETH from buys is one entry, and each
 * launch's own token is another.
 */
export function GratePanel() {
  const { address, isConnected } = useAccount();

  const mine = useReadContract({
    address: DRAINPAD,
    abi: drainpadAbi,
    functionName: "runoffsOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) },
  });

  const ids = (mine.data as bigint[] | undefined) ?? [];

  const runoffs = useReadContracts({
    contracts: ids.map((id) => ({
      address: DRAINPAD,
      abi: drainpadAbi,
      functionName: "runoffAt" as const,
      args: [id] as const,
    })),
    query: { enabled: ids.length > 0 },
  });

  const tokens = (runoffs.data ?? [])
    .map((entry) => (entry.status === "success" ? (entry.result as unknown as Runoff) : null))
    .filter((runoff): runoff is Runoff => runoff !== null);

  const currencies = [NATIVE, ...tokens.map((runoff) => runoff.token)] as const;

  const owed = useReadContracts({
    contracts: currencies.map((currency) => ({
      address: GRATE,
      abi: grateAbi,
      functionName: "owed" as const,
      args: [address ?? NATIVE, currency] as const,
    })),
    query: { enabled: Boolean(address) },
  });

  const { writeContract, data: hash, isPending } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash });

  if (!isConnected) {
    return (
      <div className="slab p-6">
        <p className="text-sm leading-relaxed text-grit">
          Connect the wallet that poured the token. The grate keeps a ledger per address, and this page can only ask
          about the one that is connected.
        </p>
        <div className="mt-4">
          <Wallet />
        </div>
      </div>
    );
  }

  const amounts = (owed.data ?? []).map((entry) => (entry.status === "success" ? (entry.result as bigint) : 0n));
  const rows = currencies.map((currency, i) => ({
    currency,
    amount: amounts[i] ?? 0n,
    label: i === 0 ? "ETH" : safeText(tokens[i - 1]?.symbol ?? "", 16) || shortAddress(currency, 6, 4),
    isNative: i === 0,
  }));

  const withSomething = rows.filter((row) => row.amount > 0n);
  const loading = mine.isLoading || runoffs.isLoading || owed.isLoading;

  return (
    <div className="space-y-5">
      <div className="slab divide-y divide-kerb">
        {loading ? (
          <div className="h-24 animate-pulse opacity-60" />
        ) : withSomething.length === 0 ? (
          <p className="p-6 text-sm leading-relaxed text-grit">
            Nothing is waiting for this address. Either it has not poured a token yet, or nobody has traded one — the
            grate only keeps something when something crosses it.
          </p>
        ) : (
          withSomething.map((row) => (
            <div key={row.currency} className="flex items-baseline justify-between gap-4 p-4">
              <span className="font-display text-sm font-bold uppercase tracking-[0.1em] text-chalk">{row.label}</span>
              <span className="figure text-sm text-paint">
                {row.isNative ? `${formatEther(row.amount)} ETH` : formatEther(row.amount)}
              </span>
            </div>
          ))
        )}
      </div>

      {withSomething.length > 0 ? (
        <button
          type="button"
          disabled={isPending || receipt.isLoading}
          onClick={() =>
            writeContract({
              address: GRATE,
              abi: grateAbi,
              functionName: "withdrawMany",
              args: [withSomething.map((row) => row.currency)],
            })
          }
          className="w-full border border-paint bg-paint py-3 font-display text-sm font-bold uppercase tracking-[0.14em] text-asphalt-deep transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {isPending ? "Confirm in your wallet" : receipt.isLoading ? "Taking it" : "Take all of it"}
        </button>
      ) : null}

      {receipt.isSuccess && hash ? (
        <p className="slab p-4 text-sm text-grit">
          Taken.{" "}
          <a
            href={explorerTx(hash)}
            target="_blank"
            rel="noreferrer"
            className="text-paint underline decoration-kerb-bright underline-offset-4"
          >
            The transaction
          </a>
        </p>
      ) : null}

      <p className="max-w-2xl text-xs leading-relaxed text-grit-dim">
        The ledger entry is zeroed before the claim is redeemed, in the same transaction, and the address paid is the
        address that asked. Both are in the grate&apos;s verified source.
      </p>
    </div>
  );
}
