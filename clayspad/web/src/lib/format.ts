/** Formatting helpers. Anything that cannot be derived returns null, never a stand-in zero. */

export function shortAddress(address?: string | null) {
  if (!address || address.length < 10) return null;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

const UNITS: Array<[label: string, seconds: number]> = [
  ["d", 86_400],
  ["h", 3_600],
  ["m", 60],
];

/** "3h ago" from a unix timestamp. Null for the zero timestamp, which means never. */
export function timeAgo(unixSeconds: bigint | number | null | undefined, now = Date.now()) {
  if (unixSeconds === null || unixSeconds === undefined) return null;
  const seconds = Number(unixSeconds);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;

  const elapsed = Math.max(0, Math.floor(now / 1000) - seconds);
  for (const [label, size] of UNITS) {
    if (elapsed >= size) return `${Math.floor(elapsed / size)}${label} ago`;
  }
  return "just now";
}

const COMPACT = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 });
const PLAIN = new Intl.NumberFormat("en-US");

export function formatCount(value: bigint | number | null | undefined) {
  if (value === null || value === undefined) return null;
  return PLAIN.format(typeof value === "bigint" ? Number(value) : value);
}

/** Token amounts arrive as 18-decimal integers; show them the way a reader reads them. */
export function formatTokens(raw: bigint | null | undefined, decimals = 18) {
  if (raw === null || raw === undefined) return null;
  return COMPACT.format(Number(raw / 10n ** BigInt(decimals)));
}

export function formatEth(wei: bigint | null | undefined) {
  if (wei === null || wei === undefined) return null;
  if (wei === 0n) return "0 ETH";
  const eth = Number(wei) / 1e18;
  if (eth < 0.0001) return `${eth.toExponential(2)} ETH`;
  return `${eth.toFixed(4).replace(/0+$/, "").replace(/\.$/, "")} ETH`;
}

/**
 * A price per token, which on a fresh launch is a very small number of ETH.
 *
 * Shown in gwei below the point where ETH stops being readable, because
 * "0.0000000017 ETH" is a number nobody can compare against another one.
 */
export function formatPrice(weiPerToken: bigint | null | undefined) {
  if (weiPerToken === null || weiPerToken === undefined || weiPerToken <= 0n) return null;
  const eth = Number(weiPerToken) / 1e18;
  if (eth >= 0.0001) return `${eth.toPrecision(3)} ETH`;
  return `${(Number(weiPerToken) / 1e9).toPrecision(3)} gwei`;
}

/**
 * A market cap: the price of one token across a whole supply.
 *
 * Both numbers are read from the chain — the price from the pool, the supply
 * from the token — so this is derived rather than declared anywhere.
 */
export function marketCap(weiPerToken: bigint | null | undefined, totalSupply: bigint | null | undefined) {
  if (!weiPerToken || !totalSupply) return null;
  return (weiPerToken * totalSupply) / 10n ** 18n;
}

/** Basis points as a percentage, for figures read off the chain. */
export function formatBps(bps: bigint | number | null | undefined) {
  if (bps === null || bps === undefined) return null;
  return `${Number(bps) / 100}%`;
}
