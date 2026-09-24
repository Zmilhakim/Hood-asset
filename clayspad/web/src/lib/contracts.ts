import { clayspadAbi } from "./abi/clayspad";
import { clayHookAbi } from "./abi/clayHook";
import { kilnAbi } from "./abi/kiln";
import { clayTokenAbi } from "./abi/clayToken";

export { clayspadAbi, clayHookAbi, kilnAbi, clayTokenAbi };

/**
 * The launchpad, once it exists.
 *
 * Clayspad is **not deployed**. There is no address to hard-code and this file
 * does not invent one: until `NEXT_PUBLIC_CLAYSPAD_ADDRESS` is set, every page
 * that would read the chain says so instead of filling the screen with sample
 * tokens. A launchpad that shows fake launches on its first day has taught its
 * readers that what it shows is not necessarily real, which is the one lesson
 * it cannot afford to teach.
 */
const configured = process.env.NEXT_PUBLIC_CLAYSPAD_ADDRESS?.trim();

export const CLAYSPAD_ADDRESS =
  configured && /^0x[0-9a-fA-F]{40}$/.test(configured) ? (configured as `0x${string}`) : undefined;

/** Whether there is anything on chain to read. Every page branches on this. */
export const SHELF_IS_OPEN = CLAYSPAD_ADDRESS !== undefined;

/** Native ETH is address zero in Uniswap v4, and therefore always currency0. */
export const NATIVE = "0x0000000000000000000000000000000000000000" as const;

/** The grid a launch's range is aligned to. Matches `launch.tickSpacing` in clayspad.config.json. */
export const LAUNCH_TICK_SPACING = 200;

export type Piece = {
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

/** What `shelfStats()` returns, named. Every one of these is read, never assumed. */
export type ShelfStats = {
  tokens: bigint;
  lastLaunch: bigint;
  supply: bigint;
  poolBps: bigint;
  supplyWalletBps: bigint;
  feeBps: bigint;
  creatorBps: bigint;
};
