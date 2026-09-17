"use client";

import { useMemo } from "react";
import { useReadContract } from "wagmi";
import { Panel, Row } from "@/components/ui/Panel";
import {
  PACKER_ADDRESS,
  POOL_MANAGER,
  ROUTER_ADDRESS,
  SUPPLY,
  TICKER,
  TOKEN_ADDRESS,
} from "@/lib/addresses";
import { explorerAddress } from "@/lib/chain";
import { cratePoolKey, decodeSlot0, ethPerToken, extsloadAbi, poolId, poolStateSlot } from "@/lib/pool";
import { crateSealAbi } from "@/lib/abi/crateSeal";
import { cratePackerAbi } from "@/lib/abi/cratePacker";
import { shortAddress } from "@/lib/format";

function Link({ address, children }: { address: string; children?: React.ReactNode }) {
  return (
    <a href={explorerAddress(address)} target="_blank" rel="noreferrer" className="underline underline-offset-2">
      {children ?? shortAddress(address)} ↗
    </a>
  );
}

/** The live price, and the two figures anyone actually asks for. */
export function Price() {
  const token = TOKEN_ADDRESS!;
  const key = useMemo(() => cratePoolKey(token), [token]);
  const slot = useMemo(() => poolStateSlot(poolId(key)), [key]);

  const word = useReadContract({
    address: POOL_MANAGER,
    abi: extsloadAbi,
    functionName: "extsload",
    args: [slot],
    query: { refetchInterval: 12_000 },
  });

  const seal = useReadContract({
    address: PACKER_ADDRESS ?? undefined,
    abi: cratePackerAbi,
    functionName: "seal",
    query: { enabled: Boolean(PACKER_ADDRESS) },
  });

  const liquidity = useReadContract({
    address: seal.data as `0x${string}` | undefined,
    abi: crateSealAbi,
    functionName: "sealedLiquidity",
    query: { enabled: Boolean(seal.data), refetchInterval: 30_000 },
  });

  const slot0 = word.data ? decodeSlot0(word.data) : null;
  const price = slot0 ? ethPerToken(slot0.sqrtPriceX96) : 0;
  const marketCap = price * Number(SUPPLY);

  return (
    <Panel>
      <div className="grid gap-5 sm:grid-cols-3">
        <div>
          <div className="stencil text-[11px] text-ink-soft">Price</div>
          <div className="numeric mt-1 text-lg">
            {price === 0 ? "—" : `${price.toExponential(3)} ETH`}
          </div>
        </div>
        <div>
          <div className="stencil text-[11px] text-ink-soft">Valuation</div>
          <div className="numeric mt-1 text-lg">
            {marketCap === 0 ? "—" : `${marketCap.toLocaleString("en-US", { maximumFractionDigits: 2 })} ETH`}
          </div>
        </div>
        <div>
          <div className="stencil text-[11px] text-ink-soft">Sealed liquidity</div>
          <div className="numeric mt-1 text-lg">
            {liquidity.data ? "locked" : slot0?.initialized ? "locked" : "—"}
          </div>
        </div>
      </div>
      {slot0 && !slot0.initialized && (
        <p className="mt-4 text-xs text-ink-soft">
          The pool has not been priced yet. Nothing here is estimated — these read straight from the pool manager.
        </p>
      )}
    </Panel>
  );
}

/** The shipping manifest: what this is, in addresses you can check yourself. */
export function Manifest() {
  const token = TOKEN_ADDRESS;
  const key = token ? cratePoolKey(token) : null;

  const seal = useReadContract({
    address: PACKER_ADDRESS ?? undefined,
    abi: cratePackerAbi,
    functionName: "seal",
    query: { enabled: Boolean(PACKER_ADDRESS) },
  });

  return (
    <Panel>
      <h2 className="stencil mb-3 text-sm">Shipping manifest</h2>
      <Row label="Contents">{SUPPLY.toLocaleString("en-US")} ${TICKER}</Row>
      <Row label="Route">Robinhood Chain · 4663</Row>
      <Row label="Paired with">Native ETH — no WETH, no hook</Row>
      {token && <Row label="Token"><Link address={token} /></Row>}
      {key && <Row label="Pool"><span title={poolId(key)}>{shortAddress(poolId(key))}</span></Row>}
      {seal.data ? <Row label="Seal"><Link address={seal.data as string} /></Row> : null}
      {ROUTER_ADDRESS && <Row label="Router"><Link address={ROUTER_ADDRESS} /></Row>}
      <Row label="Opened">Never</Row>
    </Panel>
  );
}

/** What the page says before there is anything to buy. */
export function NotLaunched() {
  return (
    <Panel className="text-center">
      <div className="mx-auto mb-4 h-3 w-3 rounded-full seal-dot" />
      <h2 className="stencil text-lg">Not packed yet</h2>
      <p className="mx-auto mt-3 max-w-md text-sm text-ink-soft">
        The crate has not been sealed, so there is nothing to buy and no price to show. This page will not pretend
        otherwise — when the pool exists it will read it straight from the chain.
      </p>
    </Panel>
  );
}
