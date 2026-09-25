"use client";

import { useAccount, useWaitForTransactionReceipt, useWriteContract } from "wagmi";

import { Button } from "@/components/ui/Button";
import { Panel, PanelHead } from "@/components/ui/Panel";
import { snowHookAbi } from "@/lib/abi/snowHook";
import { explorerTx } from "@/lib/chain";
import { NATIVE, SNOW_HOOK } from "@/lib/contracts";
import { formatEth } from "@/lib/format";
import { useOwed } from "@/lib/snowfield";

/**
 * What the connected address is owed in ETH, and the button that takes it.
 *
 * The hook pays the caller and nobody else — there is no recipient argument in
 * the contract, so there is none here either. The ETH shown is everything owed
 * across every pool this address has launched, banked together.
 */
export function FeePanel() {
  const { address, isConnected } = useAccount();
  const { data: owed, refetch } = useOwed(address, NATIVE);

  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isMining, isSuccess } = useWaitForTransactionReceipt({ hash });

  if (isSuccess && owed !== undefined) void refetch();

  if (!isConnected) {
    return (
      <Panel className="px-5 py-8">
        <p className="text-sm text-stone-soft">Connect a wallet to see what it is owed.</p>
      </Panel>
    );
  }

  const amount = (owed as bigint | undefined) ?? 0n;

  return (
    <Panel>
      <PanelHead title="Owed to you, in ETH" note="across every pool you have launched" />
      <div className="flex flex-wrap items-end justify-between gap-4 px-5 py-6">
        <p className="figure text-3xl text-melt">{formatEth(amount)} ETH</p>
        <Button
          onClick={() =>
            writeContract({ address: SNOW_HOOK, abi: snowHookAbi, functionName: "withdraw", args: [NATIVE] })
          }
          disabled={amount === 0n || isPending || isMining}
        >
          {isPending ? "Confirm in your wallet…" : isMining ? "Withdrawing…" : "Withdraw"}
        </Button>
      </div>

      {amount === 0n ? (
        <p className="border-t border-rime px-5 py-4 text-sm text-stone-soft">
          Nothing yet. A pool pays its creator when somebody swaps in it — buys pay in ETH, sells pay in the
          token.
        </p>
      ) : null}

      {error ? <p className="border-t border-rime px-5 py-4 text-sm text-crevasse">{error.message.split("\n")[0]}</p> : null}

      {hash ? (
        <p className="border-t border-rime px-5 py-4 text-sm">
          <a href={explorerTx(hash)} target="_blank" rel="noreferrer" className="text-melt underline underline-offset-2">
            The transaction ↗
          </a>
        </p>
      ) : null}
    </Panel>
  );
}
