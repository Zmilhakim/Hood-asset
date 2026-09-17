import type { Address } from "viem";
import { isAddress } from "viem";

/**
 * Where everything is.
 *
 * These were unknown while the crate sat unpacked, so they arrived as build-time
 * variables and the page honestly said there was nothing to buy until somebody
 * set them. The crate is packed now, and nothing here can move again: the token
 * is minted, the pool is open, and CrateSeal holds the liquidity permanently.
 * So they are written down, next to the fee tier and the tick spacing they were
 * always as fixed as.
 *
 * That is not tidiness. A deployment that forgets one of these variables does
 * not fail — it quietly builds a page telling visitors the token does not
 * exist, which is the one thing this site must never say once it does. Written
 * down, the page is right by default and a variable can only override it.
 *
 * Packed on Robinhood Chain (4663); the same addresses are recorded in
 * `../../contracts/crate.config.json`.
 */
const PACKED = {
  token: "0x1be2723C92F0ead9f2494C6D211aA33D4551326C",
  router: "0x3080e7B4514754479F2bfd03b34f2b3d33ba598F",
  packer: "0x418Dc283213d251C945d97EBcc0E4b918E868eff",
} as const;

/**
 * The environment still wins where it is set, so a fork or a test chain needs no
 * edit here. `none` is how the unlaunched page is asked for on purpose, which
 * is the only way to reach it now — it has to be spelled out rather than
 * happening because somebody forgot something.
 */
function address(override: string | undefined, packed: string): Address | null {
  const value = (override ?? "").trim();
  if (value === "") {
    // The literals above carry an EIP-55 checksum, so a character mistyped into
    // one fails the build rather than sending buyers somewhere that is not the
    // pool. Nothing catches that later: a wrong address is a page that looks
    // entirely normal.
    if (!isAddress(packed)) throw new Error(`addresses.ts holds a bad address: ${packed}`);
    return packed;
  }
  if (value.toLowerCase() === "none") return null;
  return isAddress(value) ? (value as Address) : null;
}

export const TOKEN_ADDRESS = address(process.env.NEXT_PUBLIC_TOKEN_ADDRESS, PACKED.token);
export const ROUTER_ADDRESS = address(process.env.NEXT_PUBLIC_ROUTER_ADDRESS, PACKED.router);
export const PACKER_ADDRESS = address(process.env.NEXT_PUBLIC_PACKER_ADDRESS, PACKED.packer);

/** Uniswap v4 on Robinhood Chain, from Uniswap's deployment record for 4663. */
export const POOL_MANAGER = "0x8366a39CC670B4001A1121B8F6A443A643e40951" as Address;
export const V4_QUOTER = "0x8dc178efb8111bb0973dd9d722ebeff267c98f94" as Address;

export const NATIVE = "0x0000000000000000000000000000000000000000" as Address;

/** The pool's fee tier and grid, fixed when the crate was packed. */
export const FEE = 10_000;
export const TICK_SPACING = 200;

/** Trading needs both: something to trade, and something to trade through. */
export const LAUNCHED = TOKEN_ADDRESS !== null && ROUTER_ADDRESS !== null;

export const TICKER = "CRATE";
export const SUPPLY = 1_000_000_000n;
