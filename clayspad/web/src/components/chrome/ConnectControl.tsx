"use client";

import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { Button } from "@/components/ui/Button";
import { robinhoodChain } from "@/lib/chain";
import { shortAddress } from "@/lib/format";

/**
 * Connect, and nothing else.
 *
 * Injected connectors only: no WalletConnect project id, no third-party modal,
 * nothing to sign up for. If the browser has no wallet at all, this says so
 * rather than opening something that cannot work.
 */
export function ConnectControl() {
  const { address, isConnected, chainId } = useAccount();
  const { connectors, connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();

  const injected = connectors.find((connector) => connector.type === "injected");

  if (!isConnected) {
    if (!injected) {
      return (
        <span className="micro text-paper-faint">
          No wallet in this browser
        </span>
      );
    }

    return (
      <Button tone="signal" onClick={() => connect({ connector: injected })} disabled={isPending}>
        {isPending ? "Connecting…" : "Connect wallet"}
      </Button>
    );
  }

  if (chainId !== robinhoodChain.id) {
    return (
      <Button tone="signal" onClick={() => switchChain({ chainId: robinhoodChain.id })}>
        Switch to Robinhood Chain
      </Button>
    );
  }

  return (
    <Button tone="quiet" onClick={() => disconnect()} title={address}>
      <span className="size-1.5 rounded-full bg-signal embering" aria-hidden="true" />
      {shortAddress(address)}
    </Button>
  );
}
