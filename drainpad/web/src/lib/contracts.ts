/**
 * Where Drainpad is, on Robinhood Chain.
 *
 * These are the deployed addresses out of `contracts/drainpad.config.json`.
 * They are recorded here rather than fetched because the app has to know where
 * to start asking — every other address on the site, including every launched
 * token, is read back out of the launchpad itself.
 *
 * An environment variable overrides each one, which is what a fork or a
 * redeployment needs. A malformed override is ignored rather than obeyed: a
 * truncated address in an env var should not turn every page blank.
 */
const DEPLOYED = {
  launchpad: "0x424aeEf840B9C4E4dCC63B949186d59Eb1C8068b",
  grate: "0xa28e1f5A414aE7C22f17D593e675ff6E44d360Cc",
  sump: "0x1cF1374612F0539A31670751BaD0867C3a330F46",
} as const;

const address = (configured: string | undefined, fallback: string) =>
  (/^0x[0-9a-fA-F]{40}$/.test(configured?.trim() ?? "") ? configured!.trim() : fallback) as `0x${string}`;

export const DRAINPAD = address(process.env.NEXT_PUBLIC_DRAINPAD, DEPLOYED.launchpad);
export const GRATE = address(process.env.NEXT_PUBLIC_GRATE, DEPLOYED.grate);
export const SUMP = address(process.env.NEXT_PUBLIC_SUMP, DEPLOYED.sump);

/** The deployer, quoted only as a signature — it holds nothing on anyone's behalf. */
export const DEPLOYER = "0xC064C11de4ED1e61B97F438FC0e1487E34eD8baD" as const;

/** Native ETH is address zero in v4, and therefore always currency0. */
export const NATIVE = "0x0000000000000000000000000000000000000000" as const;

/**
 * What the pour form needs in order to build a launch, and nothing it displays.
 *
 * The opening range is the house range: every pour opens across the same one,
 * so it is not a field on the form and not a figure on any page. The supply is
 * here only as the denominator that turns that range into a price per token.
 * Both are constants in the launchpad's verified source, which is the copy
 * worth reading.
 */
export const WHOLE_SUPPLY = 1_000_000_000n;
export const TICK_SPACING = 200;
export const RANGE_FLOOR_ETH = "1.8";
export const RANGE_CEIL_ETH = "180";
