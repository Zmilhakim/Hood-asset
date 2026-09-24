/**
 * Reading a Uniswap v4 position from the outside.
 *
 * The same arithmetic as `contracts/lib/ticks.mjs`, in TypeScript, because the
 * app has to answer the two questions a reader actually asks — what is one token
 * worth, and how much of the pool is left — and neither is stored anywhere. Both
 * are derived from the pool's price and the position's liquidity.
 */

export const Q96 = 2n ** 96n;

const MIN_TICK = -887272;
const MAX_TICK = 887272;
const MAX_UINT256 = 2n ** 256n - 1n;

const MAGIC: Array<[bigint, bigint]> = [
  [0x2n, 0xfff97272373d413259a46990580e213an],
  [0x4n, 0xfff2e50f5f656932ef12357cf3c7fdccn],
  [0x8n, 0xffe5caca7e10e4e61c3624eaa0941cd0n],
  [0x10n, 0xffcb9843d60f6159c9db58835c926644n],
  [0x20n, 0xff973b41fa98c081472e6896dfb254c0n],
  [0x40n, 0xff2ea16466c96a3843ec78b326b52861n],
  [0x80n, 0xfe5dee046a99a2a811c461f1969c3053n],
  [0x100n, 0xfcbe86c7900a88aedcffc83b479aa3a4n],
  [0x200n, 0xf987a7253ac413176f2b074cf7815e54n],
  [0x400n, 0xf3392b0822b70005940c7a398e4b70f3n],
  [0x800n, 0xe7159475a2c29b7443b29c7fa6e889d9n],
  [0x1000n, 0xd097f3bdfd2022b8845ad8f792aa5825n],
  [0x2000n, 0xa9f746462d870fdf8a65dc1f90e061e5n],
  [0x4000n, 0x70d869a156d2a1b890bb3df62baf32f7n],
  [0x8000n, 0x31be135f97d08fd981231505542fcfa6n],
  [0x10000n, 0x9aa508b5b7a84e1c677de54f3e99bc9n],
  [0x20000n, 0x5d6af8dedb81196699c329225ee604n],
  [0x40000n, 0x2216e584f5fa1ea926041bedfe98n],
  [0x80000n, 0x48a170391f7dc42444e8fa2n],
];

/** Uniswap's TickMath, transliterated rather than approximated. */
export function getSqrtPriceAtTick(tick: number): bigint {
  if (!Number.isInteger(tick) || tick < MIN_TICK || tick > MAX_TICK) {
    throw new RangeError(`tick out of range: ${tick}`);
  }

  const absTick = BigInt(Math.abs(tick));
  let ratio = (absTick & 0x1n) !== 0n ? 0xfffcb933bd6fad37aa2d162d1a594001n : 0x100000000000000000000000000000000n;
  for (const [bit, factor] of MAGIC) {
    if ((absTick & bit) !== 0n) ratio = (ratio * factor) >> 128n;
  }

  if (tick > 0) ratio = MAX_UINT256 / ratio;

  return (ratio >> 32n) + (ratio % (1n << 32n) === 0n ? 0n : 1n);
}

/**
 * What one whole token is worth in wei, from the pool's own price.
 *
 * A v4 pool prices currency1 in currency0, and native ETH is address zero and so
 * always currency0 — what the pool quotes is *tokens per ETH*, and the number
 * anyone wants is its reciprocal. Getting that backwards produces a figure that
 * looks plausible and is wrong by a factor of 10^18, which is exactly the kind
 * of number that ends up in a screenshot.
 */
export function weiPerTokenFromSqrtPrice(sqrtPriceX96: bigint): bigint | null {
  if (sqrtPriceX96 <= 0n) return null;
  return (Q96 * Q96 * 10n ** 18n) / (sqrtPriceX96 * sqrtPriceX96);
}

/**
 * What a position holds right now, in both currencies.
 *
 * `eth` is the money that has gone into the pool and cannot come out. `tokens`
 * is what is still on the shelf. A launch opens with the price above its whole
 * range, which is the same as saying the position is all token — so `eth` of
 * zero means nobody has bought yet, not that something is broken.
 *
 *   amount0 = L · (1/√P − 1/√Pb)   the ETH side
 *   amount1 = L · (√P − √Pa)       the token side
 */
export function amountsInPosition(
  liquidity: bigint,
  sqrtPriceX96: bigint,
  tickLower: number,
  tickUpper: number,
): { eth: bigint; tokens: bigint } {
  if (liquidity === 0n || sqrtPriceX96 === 0n) return { eth: 0n, tokens: 0n };
  if (tickLower >= tickUpper) throw new RangeError(`tickLower ${tickLower} is not below tickUpper ${tickUpper}`);

  const sqrtA = getSqrtPriceAtTick(tickLower);
  const sqrtB = getSqrtPriceAtTick(tickUpper);
  const sqrtP = sqrtPriceX96 < sqrtA ? sqrtA : sqrtPriceX96 > sqrtB ? sqrtB : sqrtPriceX96;

  return {
    eth: sqrtP >= sqrtB ? 0n : (liquidity * Q96 * (sqrtB - sqrtP)) / (sqrtP * sqrtB),
    tokens: sqrtP <= sqrtA ? 0n : (liquidity * (sqrtP - sqrtA)) / Q96,
  };
}

/** How far through its range a pool has travelled, 0 to 1. Null before it has a price. */
export function rangeProgress(sqrtPriceX96: bigint, tickLower: number, tickUpper: number): number | null {
  if (sqrtPriceX96 <= 0n) return null;

  const a = Number(getSqrtPriceAtTick(tickLower));
  const b = Number(getSqrtPriceAtTick(tickUpper));
  const p = Math.min(Math.max(Number(sqrtPriceX96), a), b);

  // The token gets dearer as the pool's price falls, so the range runs backwards.
  const travelled = (b - p) / (b - a);
  return Number.isFinite(travelled) ? travelled : null;
}

// --- opening a pool ---------------------------------------------------------

/** "1.7" -> { num: 17n, den: 10n }, without going through a float. */
export function parseDecimal(text: string): { num: bigint; den: bigint } | null {
  const trimmed = text.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;

  const [whole, fraction = ""] = trimmed.split(".");
  const num = BigInt(whole + fraction);
  if (num === 0n) return null;
  return { num, den: 10n ** BigInt(fraction.length) };
}

function sqrtBigInt(value: bigint): bigint {
  if (value < 2n) return value;
  let guess = 1n << (BigInt(value.toString(2).length) / 2n + 1n);
  let next = (guess + value / guess) >> 1n;
  while (next < guess) {
    guess = next;
    next = (guess + value / guess) >> 1n;
  }
  return guess;
}

/** sqrt(num/den) in Q64.96, the form a pool is initialised with. */
export function sqrtPriceX96FromRatio({ num, den }: { num: bigint; den: bigint }): bigint {
  return sqrtBigInt((num * Q96 * Q96) / den);
}

/** The highest tick whose price is at or below `sqrtPriceX96`. */
export function tickAtOrBelow(sqrtPriceX96: bigint): number {
  let low = MIN_TICK;
  let high = MAX_TICK;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (getSqrtPriceAtTick(mid) <= sqrtPriceX96) low = mid;
    else high = mid - 1;
  }
  return low;
}

const alignDown = (tick: number, spacing: number) => Math.floor(tick / spacing) * spacing;

/**
 * The launch range for a market cap floor and ceiling.
 *
 * Prices are quoted as what the whole supply is worth, because that is how
 * anyone thinks about a launch — but the pool wants a price per token, and one
 * divided by the other rarely has an exact decimal form. So it is never turned
 * into one: the division is carried as a fraction the whole way to the tick.
 *
 * A v4 pool prices currency1 in currency0, and native ETH is address zero and
 * therefore always currency0 — so what the pool counts is tokens per ETH, which
 * runs the opposite way to the price being quoted. A dearer token is a *lower*
 * tick, so the floor market cap is the top of the range and the ceiling is the
 * bottom.
 */
export function launchRange({
  floorEth,
  ceilEth,
  wholeSupply,
  tickSpacing,
}: {
  floorEth: string;
  ceilEth: string;
  wholeSupply: bigint;
  tickSpacing: number;
}): { tickLower: number; tickUpper: number; sqrtPriceX96: bigint } | null {
  const floor = parseDecimal(floorEth);
  const ceil = parseDecimal(ceilEth);
  if (!floor || !ceil) return null;

  const perToken = ({ num, den }: { num: bigint; den: bigint }) => ({ num, den: den * wholeSupply });
  const low = perToken(floor);
  const high = perToken(ceil);
  if (low.num * high.den >= high.num * low.den) return null;

  // Inverted on the way in, because the pool counts tokens per ETH.
  const tickOf = ({ num, den }: { num: bigint; den: bigint }) =>
    tickAtOrBelow(sqrtPriceX96FromRatio({ num: den, den: num }));

  const tickUpper = alignDown(tickOf(low), tickSpacing);
  const tickLower = alignDown(tickOf(high), tickSpacing);
  if (tickLower >= tickUpper) return null;

  return { tickLower, tickUpper, sqrtPriceX96: getSqrtPriceAtTick(tickUpper) };
}
