import { hoodpadFactoryAbi } from "./abi/hoodpadFactory";
import { positionLockerAbi } from "./abi/positionLocker";

export { hoodpadFactoryAbi, positionLockerAbi };

const configured = process.env.NEXT_PUBLIC_FACTORY_ADDRESS?.trim();

/**
 * The board contract. Undefined until Hoodpad is actually deployed — the site
 * reads that as "the board has not opened yet" and says so, rather than
 * rendering figures it cannot back up.
 */
export const FACTORY_ADDRESS =
  configured && /^0x[0-9a-fA-F]{40}$/.test(configured) ? (configured as `0x${string}`) : undefined;

export const BOARD_IS_OPEN = FACTORY_ADDRESS !== undefined;

/** Fee tier the launch form opens pools in: 1%, the usual tier for a fresh memecoin. */
export const LAUNCH_FEE_TIER = 10_000;
export const LAUNCH_TICK_SPACING = 200;

export type NoticeKind = 0 | 1;

export type Notice = {
  id: bigint;
  kind: NoticeKind;
  asset: `0x${string}`;
  poster: `0x${string}`;
  name: string;
  symbol: string;
  imageURI: string;
  blurb: string;
  link: string;
  supply: bigint;
  postedAt: bigint;
  positionId: bigint;
  pool: `0x${string}`;
};
