import type { Address } from "viem";

/**
 * One launch, as the catchment recorded it.
 *
 * The launchpad returns more than this — the supply, the two shares it was
 * split into, the ticks and the liquidity. They are read here because the
 * struct arrives whole, and then they are left alone: those are constants and
 * positions in the verified contract, and the contract is where they are worth
 * reading. Nothing in this app renders them.
 */
export type Runoff = {
  id: bigint;
  token: Address;
  creator: Address;
  supplyWallet: Address;
  name: string;
  symbol: string;
  imageURI: string;
  blurb: string;
  link: string;
  launchedAt: bigint;
};

/** Anything a launcher typed is a string from a stranger. Treat it as one. */
export const safeText = (value: string, limit: number) => value.replace(/\s+/g, " ").trim().slice(0, limit);

/**
 * An http(s) link, or nothing at all.
 *
 * `javascript:` and `data:` are the two that matter, and an allow-list of two
 * protocols is a shorter thing to be sure about than a list of what to block.
 */
export function safeUrl(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** A launched token's own colour, derived from its address so it is stable. */
export function tokenHue(address: string) {
  let hash = 0;
  for (let i = 2; i < address.length; i++) hash = (hash * 31 + address.charCodeAt(i)) % 360;
  return hash;
}
