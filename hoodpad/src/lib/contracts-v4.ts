import { hoodFeeHookAbi } from "./abi/v4/hoodFeeHook";
import { hoodpadFactoryAbi as hoodpadV4FactoryAbi } from "./abi/v4/hoodpadFactory";
import { hoodpadLockerAbi } from "./abi/v4/hoodpadLocker";

export { hoodFeeHookAbi, hoodpadLockerAbi, hoodpadV4FactoryAbi };

/**
 * The v4 board: the same launchpad, with the project's fee charged by a hook on
 * every swap instead of left to whatever the pool's LP tier happens to be.
 *
 * Unlike the v3 address, this one is not baked in. The v4 board is deployed per
 * environment and the address is printed by `npm run deploy` in ../contracts-v4;
 * until it is set, the site reports honestly that the v4 board is not open
 * rather than pointing a launch form at nothing.
 */
const configured = process.env.NEXT_PUBLIC_V4_FACTORY_ADDRESS?.trim();

export const V4_FACTORY_ADDRESS =
  configured && /^0x[0-9a-fA-F]{40}$/.test(configured) ? (configured as `0x${string}`) : undefined;

export const V4_BOARD_IS_OPEN = V4_FACTORY_ADDRESS !== undefined;

/** Native ETH is address zero in v4, and therefore always currency0. */
export const NATIVE_CURRENCY = "0x0000000000000000000000000000000000000000" as const;

/** The LP tier a launch opens in: 1%, the same one the v3 board used. */
export const V4_LAUNCH_FEE_TIER = 10_000;
export const V4_LAUNCH_TICK_SPACING = 200;

/**
 * The hook's cut, for copy that has to render before a read resolves.
 *
 * Every figure the site actually acts on comes from `boardStats`, which reports
 * what the deployed hook really charges. This constant exists so a heading does
 * not flicker, and `useV4BoardStats` is what a number in a table should use — a
 * board deployed from a different commit would disagree with this, and the chain
 * is the one that is right.
 */
export const V4_HOOK_FEE_BPS = 500;

export type NoticeV4 = {
  token: `0x${string}`;
  poster: `0x${string}`;
  name: string;
  symbol: string;
  imageURI: string;
  blurb: string;
  link: string;
  supply: bigint;
  postedAt: bigint;
  poolId: `0x${string}`;
  fee: number;
  tickSpacing: number;
  tickLower: number;
  tickUpper: number;
};

export type PoolKey = {
  currency0: `0x${string}`;
  currency1: `0x${string}`;
  fee: number;
  tickSpacing: number;
  hooks: `0x${string}`;
};

/**
 * The pool key a notice launched into. In v4 there is no pool contract to link
 * to — one manager holds every pool — so this five-field struct is the pool's
 * only name, and it is what `claim` and the explorers both want.
 */
export function poolKeyOf(notice: NoticeV4, hook: `0x${string}`): PoolKey {
  return {
    currency0: NATIVE_CURRENCY,
    currency1: notice.token,
    fee: notice.fee,
    tickSpacing: notice.tickSpacing,
    hooks: hook,
  };
}
