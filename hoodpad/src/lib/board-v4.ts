"use client";

import { useReadContract, useReadContracts } from "wagmi";

import { ROBINHOOD_CHAIN_ID } from "./chain";
import {
  hoodFeeHookAbi,
  hoodpadLockerAbi,
  hoodpadV4FactoryAbi,
  poolKeyOf,
  V4_BOARD_IS_OPEN,
  V4_FACTORY_ADDRESS,
  type NoticeV4,
} from "./contracts-v4";

const base = {
  address: V4_FACTORY_ADDRESS,
  abi: hoodpadV4FactoryAbi,
  chainId: ROBINHOOD_CHAIN_ID,
} as const;

/**
 * The board's own addresses, read off the factory rather than configured.
 *
 * The hook and the locker are deployed by the factory's constructor, so the
 * chain already knows both and there is no second environment variable to get
 * wrong. It also means the site cannot end up pointing at a hook that belongs to
 * a different board.
 */
export function useV4Addresses() {
  const query = useReadContracts({
    contracts: [
      { ...base, functionName: "hook" },
      { ...base, functionName: "locker" },
    ],
    query: { enabled: V4_BOARD_IS_OPEN },
  });

  const [hook, locker] = query.data ?? [];

  return {
    ...query,
    hook: hook?.status === "success" ? (hook.result as `0x${string}`) : undefined,
    locker: locker?.status === "success" ? (locker.result as `0x${string}`) : undefined,
  };
}

/** The figures across the top of the board, the hook's live fee among them. */
export function useV4BoardStats() {
  const query = useReadContract({
    ...base,
    functionName: "boardStats",
    query: { enabled: V4_BOARD_IS_OPEN },
  });

  const data = query.data as readonly [bigint, bigint, bigint, bigint, bigint] | undefined;

  return {
    ...query,
    stats: data
      ? {
          tokens: data[0],
          lastLaunch: data[1],
          postingFee: data[2],
          fixedSupply: data[3],
          // What the deployed hook actually charges, in hundredths of a percent.
          // Read rather than assumed: a board deployed from a different commit
          // would disagree with anything the app hard-coded, and the chain is
          // the one that is right.
          hookFeeBps: data[4],
        }
      : undefined,
  };
}

/** A page of the feed, newest first. */
export function useV4Notices(limit = 30) {
  const query = useReadContract({
    ...base,
    functionName: "latest",
    args: [0n, BigInt(limit)],
    query: { enabled: V4_BOARD_IS_OPEN },
  });

  return { ...query, notices: query.data as readonly NoticeV4[] | undefined };
}

/** Everything a single address has posted to the v4 board. */
export function useV4NoticesOf(poster?: `0x${string}`) {
  const ids = useReadContract({
    ...base,
    functionName: "noticesOf",
    args: poster ? [poster] : undefined,
    query: { enabled: V4_BOARD_IS_OPEN && Boolean(poster) },
  });

  const idList = (ids.data as readonly bigint[] | undefined) ?? [];

  const details = useReadContracts({
    contracts: idList.map((id) => ({ ...base, functionName: "noticeAt", args: [id] })),
    query: { enabled: V4_BOARD_IS_OPEN && idList.length > 0 },
  });

  const notices = details.data
    ?.map((entry) => (entry.status === "success" ? (entry.result as NoticeV4) : null))
    .filter((notice): notice is NoticeV4 => notice !== null)
    .reverse();

  return {
    notices,
    isLoading: ids.isLoading || details.isLoading,
    isError: ids.isError || details.isError,
  };
}

/**
 * What a notice has earned and not yet collected — both kinds, kept apart.
 *
 * The hook's cut is a plain ledger read: the contract is holding it and says so.
 * The LP fee is not readable at all until the position is touched, because v4
 * settles a position's fees only when it is modified. So it is read the way the
 * chain will actually pay it: by simulating the collect. `useSimulateContract`
 * is deliberately not used here — the locker's `collectFees` reverts with
 * `NothingToCollect` on a pool nobody has traded, which is the ordinary answer
 * rather than an error worth showing anyone.
 */
export function useV4Fees(notice?: NoticeV4, hook?: `0x${string}`, locker?: `0x${string}`) {
  const key = notice && hook ? poolKeyOf(notice, hook) : undefined;

  const hookFees = useReadContract({
    address: hook,
    abi: hoodFeeHookAbi,
    chainId: ROBINHOOD_CHAIN_ID,
    functionName: "claimable",
    args: key ? [key] : undefined,
    query: { enabled: Boolean(key) },
  });

  const liquidity = useReadContract({
    address: locker,
    abi: hoodpadLockerAbi,
    chainId: ROBINHOOD_CHAIN_ID,
    functionName: "lockedLiquidity",
    args: notice ? [notice.poolId] : undefined,
    query: { enabled: Boolean(locker && notice) },
  });

  const claimable = hookFees.data as readonly [bigint, bigint] | undefined;

  return {
    /** Unclaimed hook fees: ETH first, then the token. */
    hookEth: claimable?.[0],
    hookToken: claimable?.[1],
    /** The locked position's liquidity. It only ever goes up. */
    lockedLiquidity: liquidity.data as bigint | undefined,
    isLoading: hookFees.isLoading || liquidity.isLoading,
    isError: hookFees.isError || liquidity.isError,
    refetch: () => {
      void hookFees.refetch();
      void liquidity.refetch();
    },
  };
}
