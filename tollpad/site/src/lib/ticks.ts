/**
 * Uniswap v4's TickMath, transliterated — the same code as
 * contracts/lib/ticks.mjs, which is checked against the constants Uniswap
 * publishes and against a real pool manager.
 *
 * The site needs it to turn a position’s tick bounds into prices — the ETH
 * locked into a pool and the supply still unsold are both worked out from the
 * liquidity figure the manager reports — and to price a launch before it is
 * sent.
 */
export const MIN_TICK = -887272;
export const MAX_TICK = 887272;
export const Q96 = 2n ** 96n;

const MAX_UINT256 = 2n ** 256n - 1n;

const MAGIC: [bigint, bigint][] = [
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

export function getSqrtPriceAtTick(tick: number): bigint {
  if (!Number.isInteger(tick) || tick < MIN_TICK || tick > MAX_TICK) throw new RangeError(`tick out of range: ${tick}`);

  const absTick = BigInt(Math.abs(tick));
  let ratio = (absTick & 0x1n) !== 0n ? 0xfffcb933bd6fad37aa2d162d1a594001n : 0x100000000000000000000000000000000n;
  for (const [bit, factor] of MAGIC) {
    if ((absTick & bit) !== 0n) ratio = (ratio * factor) >> 128n;
  }

  if (tick > 0) ratio = MAX_UINT256 / ratio;

  // Q128.128 down to Q128.96, rounding up so the result never sits below the
  // tick it names.
  return (ratio >> 32n) + (ratio % (1n << 32n) === 0n ? 0n : 1n);
}

/**
 * How much currency0 — here, native ETH — a position holds right now.
 *
 * This is the figure worth showing as "in the pool": not an abstract L, but the
 * ETH that has gone in and cannot come out. Above the range the position is
 * still all token and holds none.
 *
 * amount0 = L · (1/√P − 1/√Pb), in Q96 arithmetic.
 */
export function ethInPosition(liquidity: bigint, sqrtPriceX96: bigint, tickLower: number, tickUpper: number): bigint {
  if (liquidity === 0n || sqrtPriceX96 === 0n) return 0n;

  const sqrtA = getSqrtPriceAtTick(tickLower);
  const sqrtB = getSqrtPriceAtTick(tickUpper);

  // Outside the range the position is entirely one currency, so clamping is the
  // whole of the special-casing.
  const sqrtP = sqrtPriceX96 < sqrtA ? sqrtA : sqrtPriceX96 > sqrtB ? sqrtB : sqrtPriceX96;
  if (sqrtP >= sqrtB) return 0n;

  return (liquidity * Q96 * (sqrtB - sqrtP)) / (sqrtP * sqrtB);
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

export type Ratio = { num: bigint; den: bigint };

/** "0.0000001" -> { num: 1n, den: 10000000n }, without going through a float. */
export function parseDecimal(text: string): Ratio {
  const trimmed = String(text).trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) throw new Error(`not a decimal number: ${text}`);

  const [whole, fraction = ""] = trimmed.split(".");
  const num = BigInt(whole + fraction);
  if (num === 0n) throw new Error("the price has to be greater than zero");
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
export function sqrtPriceX96FromRatio({ num, den }: Ratio): bigint {
  return sqrtBigInt((num * Q96 * Q96) / den);
}

const alignDown = (tick: number, spacing: number) => Math.floor(tick / spacing) * spacing;

/**
 * A valuation in ETH spread across the whole supply, as an exact fraction.
 *
 * Prices are quoted as what the entire supply is worth, because that is how
 * anyone actually thinks about a launch — but the pool wants a price per token,
 * and one divided by the other rarely has an exact decimal form. So it is never
 * turned into one: the division is carried as a fraction the whole way to the
 * tick.
 */
export function pricePerToken(valuationEth: string, wholeSupply: bigint): Ratio {
  const { num, den } = parseDecimal(valuationEth);
  return { num, den: den * wholeSupply };
}

export type LaunchRange = {
  tickLower: number;
  tickUpper: number;
  sqrtPriceX96: bigint;
};

/**
 * The range a launch opens across.
 *
 * The other side of the pool is native ETH, which is address zero and so is
 * always currency0 — the launched token is therefore always currency1, and a
 * pool prices currency1 in currency0, which here means tokens per ETH. That runs
 * the opposite way to the price being quoted: a dearer token is a *lower* tick,
 * so the floor is the top of the range and the ceiling is the bottom.
 *
 * The whole supply goes in below spot, and spot starts at the top: the point
 * where the token is cheapest, so the first buy fills immediately and the pool
 * never asks the locker for ETH it does not have.
 *
 * The same function, in the same words, is `launchRange` in
 * contracts/lib/ticks.mjs — which is the one the launch script uses and the one
 * the tests run against.
 */
export function launchRange({
  floorEthPerToken,
  ceilEthPerToken,
  tickSpacing,
}: {
  floorEthPerToken: Ratio;
  ceilEthPerToken: Ratio;
  tickSpacing: number;
}): LaunchRange {
  const floor = floorEthPerToken;
  const ceil = ceilEthPerToken;
  if (floor.num * ceil.den >= ceil.num * floor.den) {
    throw new Error("the ceiling valuation has to be above the opening one");
  }

  // Inverted on the way in, because the pool counts tokens per ETH.
  const tickOf = ({ num, den }: Ratio) => tickAtOrBelow(sqrtPriceX96FromRatio({ num: den, den: num }));

  // Both edges round the same way, which keeps the promise the prices made: a
  // lower tick is a dearer token, so rounding down never starts the sale below
  // the floor that was asked for.
  const tickUpper = alignDown(tickOf(floor), tickSpacing);
  const tickLower = alignDown(tickOf(ceil), tickSpacing);
  if (tickLower >= tickUpper) throw new Error("those two prices land on the same tick — widen the range");

  return { tickLower, tickUpper, sqrtPriceX96: getSqrtPriceAtTick(tickUpper) };
}

/**
 * What a position still holds of the token — the supply nobody has bought yet.
 *
 * amount1 = L · (√P − √Pa), in Q96 arithmetic, with √P clamped into the range.
 */
export function tokensInPosition(
  liquidity: bigint,
  sqrtPriceX96: bigint,
  tickLower: number,
  tickUpper: number,
): bigint {
  if (liquidity === 0n || sqrtPriceX96 === 0n) return 0n;

  const sqrtA = getSqrtPriceAtTick(tickLower);
  const sqrtB = getSqrtPriceAtTick(tickUpper);
  const sqrtP = sqrtPriceX96 < sqrtA ? sqrtA : sqrtPriceX96 > sqrtB ? sqrtB : sqrtPriceX96;
  if (sqrtP <= sqrtA) return 0n;

  return (liquidity * (sqrtP - sqrtA)) / Q96;
}
