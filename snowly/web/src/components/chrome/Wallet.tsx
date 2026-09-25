"use client";

import { useAccount, useChainId, useConnect, useDisconnect, useSwitchChain } from "wagmi";

import { Button } from "@/components/ui/Button";
import { ROBINHOOD_CHAIN_ID } from "@/lib/chain";
import { shortAddress } from "@/lib/format";

/**
 * Connect, and nothing else.
 *
 * Injected wallets only — no modal, no project id, nothing to sign up for. If
 * the browser has no wallet at all, this says so rather than opening a chooser
 * with nothing in it.
 */
export function Wallet() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();

  const injected = connectors.find((connector) => connector.type === "injected");

  if (!isConnected) {
    return (
      <Button
        variant="quiet"
        className="w-full"
        disabled={!injected || isPending}
        onClick={() => injected && connect({ connector: injected })}
      >
        {injected ? (isPending ? "Connecting…" : "Connect wallet") : "No wallet found"}
      </Button>
    );
  }

  if (chainId !== ROBINHOOD_CHAIN_ID) {
    return (
      <Button variant="quiet" className="w-full" onClick={() => switchChain({ chainId: ROBINHOOD_CHAIN_ID })}>
        Switch to Robinhood Chain
      </Button>
    );
  }

  return (
    <button
      onClick={() => disconnect()}
      title="Disconnect"
      className="figure w-full rounded-md border border-rime bg-surface px-3 py-2 text-left text-xs text-stone-soft transition hover:border-melt hover:text-melt"
    >
      <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-melt align-middle" />
      {shortAddress(address)}
    </button>
  );
}
