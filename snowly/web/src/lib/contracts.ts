/**
 * Where Snowly is, on Robinhood Chain.
 *
 * These are the deployed addresses out of `contracts/snowly.config.json`. They
 * are recorded here rather than fetched because the app has to know where to
 * start asking — every other address on the site, including every launched
 * token, is read back out of the launchpad itself.
 *
 * An environment variable overrides each one, which is what a fork or a
 * redeployment needs. A malformed override is ignored rather than obeyed: a
 * truncated address in an env var should not turn every page blank.
 */
const DEPLOYED = {
  launchpad: "0x0D4841BA415b329Fc24f8De3464D430d2C393890",
  hook: "0xAEE7acF3d68a88C35e2d97743fa8f3742f8ae0Cc",
  glacier: "0x41d7B78cB5Cfce16509D4B8fFf0e572EC43a7C7A",
} as const;

const address = (configured: string | undefined, fallback: string) =>
  (/^0x[0-9a-fA-F]{40}$/.test(configured?.trim() ?? "") ? configured!.trim() : fallback) as `0x${string}`;

export const SNOWLY = address(process.env.NEXT_PUBLIC_SNOWLY, DEPLOYED.launchpad);
export const SNOW_HOOK = address(process.env.NEXT_PUBLIC_SNOW_HOOK, DEPLOYED.hook);
export const GLACIER = address(process.env.NEXT_PUBLIC_GLACIER, DEPLOYED.glacier);

/** Native ETH is address zero in v4, and therefore always currency0. */
export const NATIVE = "0x0000000000000000000000000000000000000000" as const;

/**
 * The denominator the launch form works in.
 *
 * It is the launchpad's `FIXED_SUPPLY`, needed here only to turn a figure for
 * the whole supply into a price per token. It is not printed anywhere: the supply,
 * the split and the fee are constants in the contract, and that is where they
 * are worth reading.
 */
export const WHOLE_SUPPLY = 1_000_000_000n;
export const TICK_SPACING = 200;
