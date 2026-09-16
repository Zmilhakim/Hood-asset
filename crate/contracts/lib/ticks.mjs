// Tick math, off-chain, where it belongs. The packer enforces the invariant
// that keeps a launch single-sided; it does not compute prices, so this is what
// turns "the first CRATE costs this much ETH" into the four numbers `pack`
// takes.
//
// getSqrtRatioAtTick is Uniswap's TickMath, transliterated. It is exact, which
// matters: an approximation could land the pool one tick away from the range
// edge, and the packer would refuse the launch.

export const MIN_TICK = -887272;
export const MAX_TICK = 887272;
export const Q96 = 2n ** 96n;

const MAX_UINT256 = 2n ** 256n - 1n;

const MAGIC = [
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

export function getSqrtRatioAtTick(tick) {
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

/** The highest tick whose price is at or below `sqrtPriceX96`. */
export function tickAtOrBelow(sqrtPriceX96) {
  let low = MIN_TICK;
  let high = MAX_TICK;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (getSqrtRatioAtTick(mid) <= sqrtPriceX96) low = mid;
    else high = mid - 1;
  }
  return low;
}

/** "0.0000001" -> { num: 1n, den: 10000000n }, without going through a float. */
export function parseDecimal(text) {
  const trimmed = String(text).trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) throw new Error(`not a decimal number: ${text}`);

  const [whole, fraction = ""] = trimmed.split(".");
  const num = BigInt(whole + fraction);
  if (num === 0n) throw new Error("price must be greater than zero");
  return { num, den: 10n ** BigInt(fraction.length) };
}

/** Accepts either a decimal string or an already-exact {num, den} ratio. */
export function toRatio(price) {
  return typeof price === "object" && price !== null ? price : parseDecimal(price);
}

export function sqrtBigInt(value) {
  if (value < 0n) throw new RangeError("square root of a negative");
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
export function sqrtPriceX96FromRatio({ num, den }) {
  return sqrtBigInt((num * Q96 * Q96) / den);
}

export const alignDown = (tick, spacing) => Math.floor(tick / spacing) * spacing;
export const alignUp = (tick, spacing) => Math.ceil(tick / spacing) * spacing;

/**
 * The launch range for a crate priced in ETH.
 *
 * The whole supply goes in on the token's side of spot, and spot is set exactly
 * at the near edge of that range, so the first buy fills immediately and the
 * pool never asks the packer for ETH it does not have.
 *
 * @param tokenIsToken0 whether the token address sorts below WETH.
 * @param floorEthPerToken price of one token in ETH at the near edge.
 * @param ceilEthPerToken  price of one token in ETH at the far edge.
 */
export function launchRange({ tokenIsToken0, floorEthPerToken, ceilEthPerToken, spacing }) {
  const floor = toRatio(floorEthPerToken);
  const ceil = toRatio(ceilEthPerToken);
  if (floor.num * ceil.den >= ceil.num * floor.den) throw new Error("the ceiling price must be above the floor price");

  // A pool prices token1 in token0. When the token is token1 that is tokens per
  // ETH, which runs the opposite way to the price being quoted — a dearer token
  // is a *lower* tick — and every comparison below has to follow it round.
  const poolPrice = ({ num, den }) => (tokenIsToken0 ? { num, den } : { num: den, den: num });
  const tickOf = (price) => tickAtOrBelow(sqrtPriceX96FromRatio(poolPrice(price)));

  const floorTick = tickOf(floor);
  const ceilTick = tickOf(ceil);

  // Aligning both edges the same way keeps the promise the prices made: the
  // supply never starts selling below the floor that was asked for, and never
  // runs out below the ceiling.
  const align = tokenIsToken0 ? alignUp : alignDown;
  const tickLower = align(tokenIsToken0 ? floorTick : ceilTick, spacing);
  const tickUpper = align(tokenIsToken0 ? ceilTick : floorTick, spacing);
  if (tickLower >= tickUpper) throw new Error("the two prices land on the same tick — widen the range");

  // Spot sits at the edge the supply starts from, so the position holds only
  // the token: all of it above spot if it is token0, all of it below if not.
  const currentTick = tokenIsToken0 ? tickLower : tickUpper;

  return { tickLower, tickUpper, sqrtPriceX96: getSqrtRatioAtTick(currentTick), currentTick };
}
