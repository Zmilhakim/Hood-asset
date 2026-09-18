import type { Address } from "viem";
import { isAddress } from "viem";

import { tollpadFactoryAbi } from "./abi/tollpadFactory";
import { tollHookAbi } from "./abi/tollHook";
import { tollLockerAbi } from "./abi/tollLocker";
import { tollTokenAbi } from "./abi/tollToken";

export { tollpadFactoryAbi, tollHookAbi, tollLockerAbi, tollTokenAbi };

/**
 * The factory, once there is one.
 *
 * Nothing is deployed yet, so this is empty and the site says so on every page
 * rather than rendering a board of nothing that looks like a board with nothing
 * on it. `npm run deploy` in ../contracts prints the address; put it here, or in
 * NEXT_PUBLIC_FACTORY_ADDRESS, and the whole site turns on.
 *
 * It is written here rather than only in a dashboard variable because a
 * deployment that forgets a variable does not fail — it quietly builds a page
 * telling visitors the launchpad does not exist.
 */
const DEPLOYED_FACTORY = "";

const configured = process.env.NEXT_PUBLIC_FACTORY_ADDRESS?.trim() || DEPLOYED_FACTORY;

export const FACTORY_ADDRESS: Address | undefined = isAddress(configured, { strict: false })
  ? (configured as Address)
  : undefined;

/** Whether there is anything on chain to read. */
export const BOARD_IS_OPEN = FACTORY_ADDRESS !== undefined;

/** Uniswap v4 on Robinhood Chain, from Uniswap's deployment record for 4663. */
export const POOL_MANAGER = "0x8366a39CC670B4001A1121B8F6A443A643e40951" as Address;

export const NATIVE = "0x0000000000000000000000000000000000000000" as Address;

/**
 * The three numbers the contracts fix, repeated here for the copy to read.
 *
 * They are not settings and the site never reads them from a form: `TOLL_BPS`
 * and `CREATOR_BPS` are constants in TollHook, `FIXED_SUPPLY` and `LP_FEE` are
 * constants in TollpadFactory. Where a page shows them next to live data it
 * reads `boardStats()` instead, so a mismatch shows up rather than hiding.
 */
export const TOLL_BPS = 500;
export const CREATOR_BPS = 8_000;
export const LP_FEE = 0;
export const SUPPLY = 1_000_000_000n;

/** The grid a launch opens on. Wide, because a memecoin's range is wide. */
export const LAUNCH_TICK_SPACING = 200;

export const TICKER = "TOLL";

export type Notice = {
  id: bigint;
  token: Address;
  creator: Address;
  name: string;
  symbol: string;
  imageURI: string;
  blurb: string;
  link: string;
  supply: bigint;
  launchedAt: bigint;
  tickSpacing: number;
  tickLower: number;
  tickUpper: number;
  liquidity: bigint;
};
