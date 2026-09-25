"use client";

import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";

import { robinhoodChain } from "@/lib/chain";
import { shortAddress } from "@/lib/site";

/**
 * Connect, and nothing else. Injected wallets only — no modal, no project id,
 * nothing to sign up for.
 */
export function Wallet() {
  const { address, chainId, isConnected } = useAccount();
  const { connectors, connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();

  const injected = connectors[0];

  if (!isConnected) {
    return (
      <button
        type="button"
        disabled={isPending || !injected}
        onClick={() => injected && connect({ connector: injected })}
        className="border border-paint px-3 py-2 font-display text-xs font-bold uppercase tracking-[0.14em] text-paint transition-colors hover:bg-paint hover:text-asphalt-deep disabled:opacity-50"
      >
        {isPending ? "Connecting" : "Connect"}
      </button>
    );
  }

  if (chainId !== robinhoodChain.id) {
    return (
      <button
        type="button"
        onClick={() => switchChain({ chainId: robinhoodChain.id })}
        className="border border-rust px-3 py-2 font-display text-xs font-bold uppercase tracking-[0.14em] text-rust"
      >
        Wrong network
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => disconnect()}
      title="Disconnect"
      className="figure border border-kerb px-3 py-2 text-xs text-grit transition-colors hover:border-kerb-bright hover:text-chalk"
    >
      {shortAddress(address!)}
    </button>
  );
}
