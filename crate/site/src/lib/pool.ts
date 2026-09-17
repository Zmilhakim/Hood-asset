import { encodeAbiParameters, keccak256, parseAbiParameters, toHex, type Address, type Hex } from "viem";
import { FEE, NATIVE, TICK_SPACING } from "./addresses";

/**
 * Reading a v4 pool from a browser.
 *
 * There is no pool contract to call in v4 — one manager holds every pool — so a
 * reader computes the pool's id from its key and pulls the state out of the
 * manager's storage with `extsload`. This mirrors v4-core's own `PoolIdLibrary`
 * and `StateLibrary`, which is why the slot number and the bit layout are
 * theirs rather than ours. The same code exists in contracts/lib/pool.mjs,
 * where a test checks it against the id and price the manager really has.
 */

/** StateLibrary.POOLS_SLOT — where `mapping(PoolId => Pool.State) _pools` lives. */
const POOLS_SLOT = 6n;

const poolKeyParameters = parseAbiParameters(
  "address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks",
);

export type PoolKey = {
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
};

/** The pool a crate is packed into: native ETH against the token, and no hook. */
export function cratePoolKey(token: Address): PoolKey {
  return { currency0: NATIVE, currency1: token, fee: FEE, tickSpacing: TICK_SPACING, hooks: NATIVE };
}

/** PoolIdLibrary.toId: keccak256 over the five words of the key. */
export function poolId(key: PoolKey): Hex {
  return keccak256(
    encodeAbiParameters(poolKeyParameters, [key.currency0, key.currency1, key.fee, key.tickSpacing, key.hooks]),
  );
}

/** StateLibrary._getPoolStateSlot: the first word of that pool's state. */
export function poolStateSlot(id: Hex): Hex {
  return keccak256(encodeAbiParameters(parseAbiParameters("bytes32, bytes32"), [id, toHex(POOLS_SLOT, { size: 32 })]));
}

export type Slot0 = {
  sqrtPriceX96: bigint;
  tick: number;
  lpFee: number;
  initialized: boolean;
};

/**
 * Unpacks the manager's slot0 word:
 *
 *   0x000000 | lpFee | protocolFee | tick | sqrtPriceX96
 *
 * A `sqrtPriceX96` of zero means the pool was never initialised, which is the
 * one thing the page most needs to know before showing a price.
 */
export function decodeSlot0(word: Hex): Slot0 {
  const value = BigInt(word);
  const sqrtPriceX96 = value & ((1n << 160n) - 1n);

  // tick is an int24, so the top of those 24 bits is a sign.
  let tick = Number((value >> 160n) & 0xffffffn);
  if (tick >= 0x800000) tick -= 0x1000000;

  return {
    sqrtPriceX96,
    tick,
    lpFee: Number((value >> 208n) & 0xffffffn),
    initialized: sqrtPriceX96 !== 0n,
  };
}

const Q96 = 2n ** 96n;

/**
 * ETH per token, as a float, for display only.
 *
 * The pool prices currency1 in currency0, which here is CRATE per ETH — the
 * opposite way round to how anyone quotes a token. Inverting it needs real
 * division, so this is the one place a float is allowed: nothing is signed
 * against it, and every number that matters goes through the quoter instead.
 */
export function ethPerToken(sqrtPriceX96: bigint): number {
  if (sqrtPriceX96 === 0n) return 0;
  const ratio = Number(Q96) / Number(sqrtPriceX96);
  return ratio * ratio;
}

export const extsloadAbi = [
  {
    type: "function",
    name: "extsload",
    inputs: [{ type: "bytes32" }],
    outputs: [{ type: "bytes32" }],
    stateMutability: "view",
  },
] as const;

/** V4Quoter.quoteExactInputSingle — not a view, but safe to eth_call. */
export const quoterAbi = [
  {
    type: "function",
    name: "quoteExactInputSingle",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          {
            name: "poolKey",
            type: "tuple",
            components: [
              { name: "currency0", type: "address" },
              { name: "currency1", type: "address" },
              { name: "fee", type: "uint24" },
              { name: "tickSpacing", type: "int24" },
              { name: "hooks", type: "address" },
            ],
          },
          { name: "zeroForOne", type: "bool" },
          { name: "exactAmount", type: "uint128" },
          { name: "hookData", type: "bytes" },
        ],
      },
    ],
    outputs: [
      { name: "amountOut", type: "uint256" },
      { name: "gasEstimate", type: "uint256" },
    ],
  },
] as const;

export const erc20Abi = [
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ type: "address" }],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "allowance",
    inputs: [{ type: "address" }, { type: "address" }],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "approve",
    inputs: [{ type: "address" }, { type: "uint256" }],
    outputs: [{ type: "bool" }],
    stateMutability: "nonpayable",
  },
  { type: "function", name: "totalSupply", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
] as const;
