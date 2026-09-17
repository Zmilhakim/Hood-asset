import type { Address } from "viem";
import { isAddress } from "viem";

/**
 * Where everything is, and — just as importantly — whether it is anywhere yet.
 *
 * Until the crate is packed there is no token and no router, and the honest
 * thing for the page to do is say so. So these are read as "maybe", and the
 * page branches on `LAUNCHED` rather than rendering a swap box that could only
 * fail.
 */
function fromEnv(value: string | undefined): Address | null {
  const trimmed = (value ?? "").trim();
  return isAddress(trimmed) ? (trimmed as Address) : null;
}

export const TOKEN_ADDRESS = fromEnv(process.env.NEXT_PUBLIC_TOKEN_ADDRESS);
export const ROUTER_ADDRESS = fromEnv(process.env.NEXT_PUBLIC_ROUTER_ADDRESS);
export const PACKER_ADDRESS = fromEnv(process.env.NEXT_PUBLIC_PACKER_ADDRESS);

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
