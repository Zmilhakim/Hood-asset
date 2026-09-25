import { formatEther } from "viem";

/** `0x0D48…3890` — an address short enough to read, long enough to check. */
export function shortAddress(address?: string | null) {
  if (!address || address.length < 12) return address ?? "";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/**
 * Whole tokens, grouped, with no decimals.
 *
 * Every figure this is used on is a supply or a share of one, where the wei are
 * noise: "800,000,000" is the number anybody is checking, and eighteen decimal
 * places after it only make that harder to see.
 */
export function formatTokens(wei: bigint) {
  return (wei / 10n ** 18n).toLocaleString("en-US");
}

/**
 * ETH, at a precision that suits its size.
 *
 * A pool holding 12 ETH and a price of 0.0000000017 ETH are both shown by this,
 * and a single fixed precision cannot serve both — four decimals would round the
 * price to zero, and twelve would bury the twelve.
 */
export function formatEth(wei: bigint, { maxDigits = 6 }: { maxDigits?: number } = {}) {
  if (wei === 0n) return "0";

  const value = Number(formatEther(wei));
  if (!Number.isFinite(value)) return formatEther(wei);

  if (value >= 1000) return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (value >= 1) return value.toLocaleString("en-US", { maximumFractionDigits: 4 });
  if (value >= 0.0001) return value.toLocaleString("en-US", { maximumFractionDigits: maxDigits });

  // Below that, fixed notation is all zeroes and a significant-digit form is the
  // only one that says anything.
  return value.toPrecision(3);
}

/** `4.5%` from 450 basis points, without a trailing `.0`. */
export function formatBps(bps: bigint | number) {
  const value = Number(bps) / 100;
  return `${value % 1 === 0 ? value.toFixed(0) : value.toFixed(1)}%`;
}

/** "3 minutes ago", and plain dates once that stops being useful. */
export function timeAgo(unixSeconds: bigint | number) {
  const seconds = Number(unixSeconds);
  if (!seconds) return "—";

  const delta = Math.floor(Date.now() / 1000) - seconds;
  if (delta < 60) return "just now";
  if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
  if (delta < 86400) return `${Math.floor(delta / 3600)}h ago`;
  if (delta < 7 * 86400) return `${Math.floor(delta / 86400)}d ago`;

  return new Date(seconds * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
