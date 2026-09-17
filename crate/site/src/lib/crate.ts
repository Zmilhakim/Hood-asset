"use client";

import { useMemo } from "react";
import { useBlockNumber, useReadContract } from "wagmi";
import { PACKER_ADDRESS, POOL_MANAGER, SUPPLY, TOKEN_ADDRESS } from "./addresses";
import { cratePoolKey, decodeSlot0, ethPerToken, extsloadAbi, poolId, poolStateSlot } from "./pool";
import { ethInPosition } from "./ticks";
import { cratePackerAbi } from "./abi/cratePacker";
import { crateSealAbi } from "./abi/crateSeal";

/**
 * Everything the dock displays, read from the chain.
 *
 * The page this replaces took its price, market cap and liquidity from an
 * indexer, which means waiting for that indexer to notice a brand-new v4 pool
 * on a young chain — and showing "not listed yet" until it does. These come
 * from the pool manager's own storage instead, so they are right in the block
 * the pool is created and cannot be wrong later.
 */
export function useCrate() {
  const token = TOKEN_ADDRESS;
  const key = useMemo(() => (token ? cratePoolKey(token) : null), [token]);
  const id = useMemo(() => (key ? poolId(key) : null), [key]);

  const slot0Word = useReadContract({
    address: POOL_MANAGER,
    abi: extsloadAbi,
    functionName: "extsload",
    args: id ? [poolStateSlot(id)] : undefined,
    query: { enabled: Boolean(id), refetchInterval: 12_000 },
  });

  const seal = useReadContract({
    address: PACKER_ADDRESS ?? undefined,
    abi: cratePackerAbi,
    functionName: "seal",
    query: { enabled: Boolean(PACKER_ADDRESS) },
  });

  const tickLower = useReadContract({
    address: PACKER_ADDRESS ?? undefined,
    abi: cratePackerAbi,
    functionName: "tickLower",
    query: { enabled: Boolean(PACKER_ADDRESS) },
  });

  const tickUpper = useReadContract({
    address: PACKER_ADDRESS ?? undefined,
    abi: cratePackerAbi,
    functionName: "tickUpper",
    query: { enabled: Boolean(PACKER_ADDRESS) },
  });

  const liquidity = useReadContract({
    address: (seal.data as `0x${string}` | undefined) ?? undefined,
    abi: crateSealAbi,
    functionName: "sealedLiquidity",
    query: { enabled: Boolean(seal.data), refetchInterval: 24_000 },
  });

  const slot0 = slot0Word.data ? decodeSlot0(slot0Word.data) : null;
  const price = slot0 ? ethPerToken(slot0.sqrtPriceX96) : 0;

  const ethLocked =
    slot0 && liquidity.data !== undefined && tickLower.data !== undefined && tickUpper.data !== undefined
      ? ethInPosition(liquidity.data as bigint, slot0.sqrtPriceX96, tickLower.data as number, tickUpper.data as number)
      : null;

  return {
    poolId: id,
    sealAddress: (seal.data as `0x${string}` | undefined) ?? null,
    initialized: slot0?.initialized ?? false,
    tick: slot0?.tick ?? null,
    price,
    marketCap: price * Number(SUPPLY),
    ethLocked,
    loading: slot0Word.isLoading,
  };
}

/** The heartbeat on the steel strap: proof the page is reading a live chain. */
export function useBlockHeight() {
  const { data, isError } = useBlockNumber({ watch: true, query: { refetchInterval: 12_000 } });
  return { height: data ?? null, live: !isError && data !== undefined };
}
