"use client";

import { useReadContract, useReadContracts } from "wagmi";
import { BOARD_IS_OPEN, FACTORY_ADDRESS, hoodpadFactoryAbi, type Notice } from "./contracts";
import { ROBINHOOD_CHAIN_ID } from "./chain";

const base = {
  address: FACTORY_ADDRESS,
  abi: hoodpadFactoryAbi,
  chainId: ROBINHOOD_CHAIN_ID,
} as const;

/** The four figures across the top of the board. */
export function useBoardStats() {
  const query = useReadContract({
    ...base,
    functionName: "boardStats",
    query: { enabled: BOARD_IS_OPEN },
  });

  const data = query.data as readonly [bigint, bigint, bigint, bigint] | undefined;

  return {
    ...query,
    stats: data
      ? { tokens: data[0], lastLaunch: data[1], postingFee: data[2], fixedSupply: data[3] }
      : undefined,
  };
}

/** A page of the feed, newest first. */
export function useLatestNotices(limit = 30) {
  const query = useReadContract({
    ...base,
    functionName: "latest",
    args: [0n, BigInt(limit)],
    query: { enabled: BOARD_IS_OPEN },
  });

  return { ...query, notices: query.data as readonly Notice[] | undefined };
}

/** Everything a single address has posted. */
export function useNoticesOf(poster?: `0x${string}`) {
  const ids = useReadContract({
    ...base,
    functionName: "noticesOf",
    args: poster ? [poster] : undefined,
    query: { enabled: BOARD_IS_OPEN && Boolean(poster) },
  });

  const idList = (ids.data as readonly bigint[] | undefined) ?? [];

  const details = useReadContracts({
    contracts: idList.map((id) => ({ ...base, functionName: "noticeAt", args: [id] })),
    query: { enabled: BOARD_IS_OPEN && idList.length > 0 },
  });

  const notices = details.data
    ?.map((entry) => (entry.status === "success" ? (entry.result as Notice) : null))
    .filter((notice): notice is Notice => notice !== null)
    .reverse();

  return {
    notices,
    isLoading: ids.isLoading || details.isLoading,
    isError: ids.isError || details.isError,
  };
}
