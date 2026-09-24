"use client";

import { encodeAbiParameters, keccak256, parseAbiParameters, toHex } from "viem";
import { useReadContract } from "wagmi";

/**
 * Reading a pool from outside.
 *
 * There is no pool contract to call in Uniswap v4 — one manager holds every
 * pool — so a reader computes the pool's id from its key and pulls the state
 * out of the manager's storage with `extsload`. The slot number and the bit
 * layout below are v4-core's own `StateLibrary`, not ours.
 */

const DEFAULT_POOL_MANAGER = "0x8366a39CC670B4001A1121B8F6A443A643e40951";

const configured = process.env.NEXT_PUBLIC_POOL_MANAGER?.trim() || DEFAULT_POOL_MANAGER;

export const POOL_MANAGER = /^0x[0-9a-fA-F]{40}$/.test(configured)
  ? (configured as `0x${string}`)
  : (DEFAULT_POOL_MANAGER as `0x${string}`);

/** StateLibrary.POOLS_SLOT — where `mapping(PoolId => Pool.State) _pools` lives. */
const POOLS_SLOT = 6n;

export const extsloadAbi = [
  {
    type: "function",
    name: "extsload",
    inputs: [{ type: "bytes32" }],
    outputs: [{ type: "bytes32" }],
    stateMutability: "view",
  },
] as const;

export type PoolKey = {
  currency0: `0x${string}`;
  currency1: `0x${string}`;
  fee: number;
  tickSpacing: number;
  hooks: `0x${string}`;
};

/** PoolIdLibrary.toId: keccak256 over the five words of the key. */
export function poolId(key: PoolKey): `0x${string}` {
  return keccak256(
    encodeAbiParameters(
      parseAbiParameters("address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks"),
      [key.currency0, key.currency1, key.fee, key.tickSpacing, key.hooks],
    ),
  );
}

/** StateLibrary._getPoolStateSlot: the first word of that pool's state. */
export function poolStateSlot(id: `0x${string}`): `0x${string}` {
  return keccak256(encodeAbiParameters(parseAbiParameters("bytes32, bytes32"), [id, toHex(POOLS_SLOT, { size: 32 })]));
}

export type Slot0 = {
  sqrtPriceX96: bigint;
  tick: number;
  protocolFee: number;
  lpFee: number;
  initialized: boolean;
};

/**
 * Unpacks the manager's slot0 word.
 *
 *   0x000000 | lpFee | protocolFee | tick | sqrtPriceX96
 *
 * A `sqrtPriceX96` of zero means the pool was never initialised, which is the
 * one thing worth distinguishing from a price of nearly nothing.
 */
export function decodeSlot0(word: `0x${string}`): Slot0 {
  const value = BigInt(word);
  const sqrtPriceX96 = value & ((1n << 160n) - 1n);

  // tick is an int24, so the top of those 24 bits is a sign.
  let tick = Number((value >> 160n) & 0xffffffn);
  if (tick >= 0x800000) tick -= 0x1000000;

  return {
    sqrtPriceX96,
    tick,
    protocolFee: Number((value >> 184n) & 0xffffffn),
    lpFee: Number((value >> 208n) & 0xffffffn),
    initialized: sqrtPriceX96 !== 0n,
  };
}

/** slot0 for one pool, straight out of the manager's storage. */
export function useSlot0(id: `0x${string}` | undefined) {
  const query = useReadContract({
    address: POOL_MANAGER,
    abi: extsloadAbi,
    functionName: "extsload",
    args: id ? [poolStateSlot(id)] : undefined,
    query: { enabled: Boolean(id) },
  });

  return { ...query, slot0: query.data ? decodeSlot0(query.data as `0x${string}`) : null };
}
