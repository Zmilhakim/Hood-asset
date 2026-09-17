import { formatUnits } from "viem";

export function shortAddress(address?: string) {
  if (!address) return "";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/**
 * Token amounts, rounded to something a person can read.
 *
 * Big numbers get thousands separators and no decimals — nobody needs to see
 * 90,536,384.052347715596882291 CRATE. Small ones keep enough digits to stay
 * distinguishable from zero, because on a fresh pool a real balance can be
 * very small indeed.
 */
export function formatAmount(value: bigint, decimals = 18) {
  const asNumber = Number(formatUnits(value, decimals));
  if (asNumber === 0) return "0";
  if (asNumber >= 1_000) return asNumber.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (asNumber >= 1) return asNumber.toLocaleString("en-US", { maximumFractionDigits: 4 });
  if (asNumber >= 0.0001) return asNumber.toFixed(6);
  return asNumber.toExponential(2);
}

/** ETH, where the interesting digits are all after the point. */
export function formatEthAmount(value: bigint) {
  const asNumber = Number(formatUnits(value, 18));
  if (asNumber === 0) return "0";
  if (asNumber >= 1) return asNumber.toLocaleString("en-US", { maximumFractionDigits: 4 });
  if (asNumber >= 0.000001) return asNumber.toFixed(6);
  return asNumber.toExponential(2);
}

/** Parses what somebody typed, without trusting it to be a number at all. */
export function parseAmount(text: string, decimals = 18): bigint | null {
  const trimmed = text.trim();
  if (!/^\d*\.?\d*$/.test(trimmed) || trimmed === "" || trimmed === ".") return null;

  const [whole, fraction = ""] = trimmed.split(".");
  if (fraction.length > decimals) return null;

  try {
    return BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, "0") || "0");
  } catch {
    return null;
  }
}

/** Slippage as a fraction of the quote, floored so it can only ever be safer. */
export function applySlippage(amount: bigint, percent: number) {
  const basisPoints = BigInt(Math.round(percent * 100));
  return (amount * (10_000n - basisPoints)) / 10_000n;
}
