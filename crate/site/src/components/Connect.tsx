"use client";

import { useEffect, useState } from "react";
import { useConnect, useConnection, useDisconnect, useSwitchChain } from "wagmi";
import { ROBINHOOD_CHAIN_ID } from "@/lib/chain";
import { shortAddress } from "@/lib/format";

export function Connect() {
  const { address, chainId, isConnected } = useConnection();
  const { connect, connectors, status } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();

  // Whether a wallet is injected is only knowable in the browser, so the first
  // paint has to match the server's.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const injected = connectors[0];

  if (!mounted) {
    return (
      <button className="btn plain" disabled>
        Connect
      </button>
    );
  }

  if (!isConnected) {
    const available = injected && (injected.type !== "injected" || "ethereum" in window);
    if (!available) {
      return (
        <button className="btn plain" disabled title="Any browser wallet works. Install one to buy.">
          No wallet
        </button>
      );
    }
    return (
      <button
        className="btn plain"
        onClick={() => connect({ connector: injected })}
        disabled={status === "pending"}
      >
        {status === "pending" ? "Connecting" : "Connect"}
      </button>
    );
  }

  if (chainId !== ROBINHOOD_CHAIN_ID) {
    return (
      <button className="btn" onClick={() => switchChain({ chainId: ROBINHOOD_CHAIN_ID })} disabled={isSwitching}>
        {isSwitching ? "Switching" : "Wrong chain"}
      </button>
    );
  }

  return (
    <button className="btn plain" onClick={() => disconnect()} title="Disconnect">
      {shortAddress(address)}
    </button>
  );
}
