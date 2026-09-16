import { hoodpadFactoryAbi } from "./abi/hoodpadFactory";
import { positionLockerAbi } from "./abi/positionLocker";

export { hoodpadFactoryAbi, positionLockerAbi };

/**
 * The board contract, live on Robinhood Chain since 2026-09-16.
 *
 * Kept in the repo rather than only in a dashboard environment variable: the
 * address is public, the factory is ownerless and immutable, and a build should
 * not depend on config that can go missing. NEXT_PUBLIC_FACTORY_ADDRESS still
 * overrides it, which is how a testnet or a fork gets pointed at its own board.
 */
const DEPLOYED_FACTORY = "0xC935a139AbB08a2eF8480d8E793CCD5c68a7c739";

const configured = process.env.NEXT_PUBLIC_FACTORY_ADDRESS?.trim() || DEPLOYED_FACTORY;

export const FACTORY_ADDRESS =
  configured && /^0x[0-9a-fA-F]{40}$/.test(configured) ? (configured as `0x${string}`) : undefined;

export const BOARD_IS_OPEN = FACTORY_ADDRESS !== undefined;

/** Fee tier the launch form opens pools in: 1%, the usual tier for a fresh memecoin. */
export const LAUNCH_FEE_TIER = 10_000;
export const LAUNCH_TICK_SPACING = 200;

export type Notice = {
  id: bigint;
  token: `0x${string}`;
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
