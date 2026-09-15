"use client";

import { useEffect, useState } from "react";
import { useConnect, useConnection, useDisconnect, useSwitchChain } from "wagmi";
import { Button } from "@/components/ui/Button";
import { ROBINHOOD_CHAIN_ID } from "@/lib/chain";
import { shortAddress } from "@/lib/format";

export function ConnectControl() {
  const { address, chainId, isConnected } = useConnection();
  const { connect, connectors, status } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();

  // Whether a wallet is injected is only knowable in the browser, so the
  // first paint has to match the server's.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const injected = connectors[0];

  if (!mounted) {
    return (
      <Button tone="quiet" disabled>
        Connect
      </Button>
    );
  }

  if (!isConnected) {
    const available = injected && (injected.type !== "injected" || "ethereum" in window);

    if (!available) {
      return (
        <Button
          tone="quiet"
          disabled
          title="Hoodpad connects to any browser wallet. Install one to post a notice."
        >
          No wallet
        </Button>
      );
    }

    return (
      <Button tone="quiet" onClick={() => connect({ connector: injected })} disabled={status === "pending"}>
        {status === "pending" ? "Connecting…" : "Connect"}
      </Button>
    );
  }

  if (chainId !== ROBINHOOD_CHAIN_ID) {
    return (
      <Button tone="flame" onClick={() => switchChain({ chainId: ROBINHOOD_CHAIN_ID })} disabled={isSwitching}>
        {isSwitching ? "Switching…" : "Wrong chain"}
      </Button>
    );
  }

  return (
    <Button tone="quiet" onClick={() => disconnect()} title="Disconnect">
      {shortAddress(address)}
    </Button>
  );
}
