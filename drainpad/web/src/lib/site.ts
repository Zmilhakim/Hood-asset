export const SITE = {
  name: "Drainpad",
  domain: "drainpad.fun",
  url: process.env.NEXT_PUBLIC_SITE_URL || "https://drainpad.fun",
  tagline: "Water finds the lowest point and stays there.",
  description:
    "A launchpad on Robinhood Chain. One transaction mints a token, opens its pool and sinks the pool's share into a contract with no way to pump it back out.",
} as const;

/** `0x1234…abcd`, for the places a full address would break the line. */
export const shortAddress = (address: string, lead = 6, tail = 4) =>
  address.length > lead + tail + 2 ? `${address.slice(0, lead)}…${address.slice(-tail)}` : address;

export const shortDate = (seconds: bigint | number) =>
  new Date(Number(seconds) * 1000).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
