"use client";

import { useReadContract } from "wagmi";

import { snowlyAbi } from "./abi/snowly";
import { snowHookAbi } from "./abi/snowHook";
import { SNOWLY, SNOW_HOOK } from "./contracts";

/** One launch, as the launchpad records it. */
export type Drift = {
  id: bigint;
  token: `0x${string}`;
  creator: `0x${string}`;
  supplyWallet: `0x${string}`;
  name: string;
  symbol: string;
  imageURI: string;
  blurb: string;
  link: string;
  supply: bigint;
  toPool: bigint;
  toSupplyWallet: bigint;
  launchedAt: bigint;
  tickSpacing: number;
  tickLower: number;
  tickUpper: number;
  liquidity: bigint;
};

/**
 * The header figures, in one call.
 *
 * Every one of them is a constant in the contracts, but they are read rather
 * than written down here: a number typed into a web page is a claim about a
 * contract, and a claim that nothing checks is one that goes stale quietly.
 */
export function useFieldStats() {
  const { data, ...rest } = useReadContract({
    address: SNOWLY,
    abi: snowlyAbi,
    functionName: "fieldStats",
  });

  const stats = data
    ? {
        drifts: data[0],
        lastLaunch: data[1],
        supply: data[2],
        poolBps: data[3],
        supplyWalletBps: data[4],
        feeBps: data[5],
        creatorBps: data[6],
      }
    : undefined;

  return { stats, ...rest };
}

/** A page of the snowfield, newest first. */
export function useDrifts({ offset = 0n, limit = 50n }: { offset?: bigint; limit?: bigint } = {}) {
  const { data, ...rest } = useReadContract({
    address: SNOWLY,
    abi: snowlyAbi,
    functionName: "latest",
    args: [offset, limit],
  });

  return { drifts: data as readonly Drift[] | undefined, ...rest };
}

/** One drift, by its number. */
export function useDrift(id: bigint | undefined) {
  const { data, ...rest } = useReadContract({
    address: SNOWLY,
    abi: snowlyAbi,
    functionName: "driftAt",
    args: id === undefined ? undefined : [id],
    query: { enabled: id !== undefined },
  });

  return { drift: data as Drift | undefined, ...rest };
}

/** What an address can withdraw from the hook, in one currency. */
export function useOwed(account: `0x${string}` | undefined, currency: `0x${string}`) {
  return useReadContract({
    address: SNOW_HOOK,
    abi: snowHookAbi,
    functionName: "owed",
    args: account ? [account, currency] : undefined,
    query: { enabled: Boolean(account) },
  });
}
