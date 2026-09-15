/**
 * Launch pricing.
 *
 * The contract will not accept a range that straddles spot, so the numbers it
 * is handed have to line up exactly with Uniswap's own tick grid. That means
 * using Uniswap's TickMath, not an approximation: the price the pool is
 * initialised at is derived *from* the boundary tick, so the pool's reported
 * tick lands exactly on that boundary and the position stays single-sided.
 */

export const MIN_TICK = -887272;
export const MAX_TICK = 887272;

const Q32 = 1n << 32n;
const MAX_UINT256 = (1n << 256n) - 1n;

/** Uniswap v3 TickMath constants, one per bit of |tick|. */
const RATIOS: Array<[bit: number, ratio: bigint]> = [
  [0x2, 0xfff97272373d413259a46990580e213an],
  [0x4, 0xfff2e50f5f656932ef12357cf3c7fdccn],
  [0x8, 0xffe5caca7e10e4e61c3624eaa0941cd0n],
  [0x10, 0xffcb9843d60f6159c9db58835c926644n],
  [0x20, 0xff973b41fa98c081472e6896dfb254c0n],
  [0x40, 0xff2ea16466c96a3843ec78b326b52861n],
  [0x80, 0xfe5dee046a99a2a811c461f1969c3053n],
  [0x100, 0xfcbe86c7900a88aedcffc83b479aa3a4n],
  [0x200, 0xf987a7253ac413176f2b074cf7815e54n],
  [0x400, 0xf3392b0822b70005940c7a398e4b70f3n],
  [0x800, 0xe7159475a2c29b7443b29c7fa6e889d9n],
  [0x1000, 0xd097f3bdfd2022b8845ad8f792aa5825n],
  [0x2000, 0xa9f746462d870fdf8a65dc1f90e061e5n],
  [0x4000, 0x70d869a156d2a1b890bb3df62baf32f7n],
  [0x8000, 0x31be135f97d08fd981231505542fcfa6n],
  [0x10000, 0x9aa508b5b7a84e1c677de54f3e99bc9n],
  [0x20000, 0x5d6af8dedb81196699c329225ee604n],
  [0x40000, 0x2216e584f5fa1ea926041bedfe98n],
  [0x80000, 0x48a170391f7dc42444e8fa2n],
];

/** Q64.96 square-root price at a tick — the same value TickMath.sol returns. */
export function getSqrtRatioAtTick(tick: number): bigint {
  if (!Number.isInteger(tick) || tick < MIN_TICK || tick > MAX_TICK) {
    throw new RangeError(`tick out of range: ${tick}`);
  }

  const absTick = Math.abs(tick);
  let ratio =
    (absTick & 0x1) !== 0 ? 0xfffcb933bd6fad37aa2d162d1a594001n : 0x100000000000000000000000000000000n;

  for (const [bit, value] of RATIOS) {
    if ((absTick & bit) !== 0) ratio = (ratio * value) >> 128n;
  }

  if (tick > 0) ratio = MAX_UINT256 / ratio;

  // Q128.128 down to Q64.96, rounding up, exactly as TickMath does.
  return (ratio >> 32n) + (ratio % Q32 === 0n ? 0n : 1n);
}

/** The tick whose price is nearest `price`, where price is token1 per token0. */
export function getTickAtPrice(price: number): number {
  if (!(price > 0) || !Number.isFinite(price)) throw new RangeError(`price out of range: ${price}`);
  const tick = Math.round(Math.log(price) / Math.log(1.0001));
  return Math.min(MAX_TICK, Math.max(MIN_TICK, tick));
}

/** Round a tick down onto the pool's tick grid. */
export function snapTick(tick: number, spacing: number): number {
  const snapped = Math.floor(tick / spacing) * spacing;
  const clamped = Math.min(
    Math.floor(MAX_TICK / spacing) * spacing,
    Math.max(Math.ceil(MIN_TICK / spacing) * spacing, snapped),
  );
  // Math.floor hands back -0 just below zero; nothing downstream should ever
  // see a signed zero where an int24 is expected.
  return clamped === 0 ? 0 : clamped;
}

export type LaunchPlan = {
  sqrtPriceX96: bigint;
  tickLower: number;
  tickUpper: number;
  /** What the opening price actually becomes once snapped to the tick grid. */
  effectiveOpeningPrice: number;
  effectiveCeilingPrice: number;
};

/**
 * Turn "open here, run out of supply there" into the three numbers postToken wants.
 *
 * `openingPrice` and `ceilingPrice` are both ETH per token. Which side of the
 * pool the token lands on flips the whole tick axis, which is why the predicted
 * token address has to be known before this is called.
 */
export function planLaunch({
  tokenIsToken0,
  openingPrice,
  ceilingPrice,
  spacing,
}: {
  tokenIsToken0: boolean;
  openingPrice: number;
  ceilingPrice: number;
  spacing: number;
}): LaunchPlan {
  if (!(ceilingPrice > openingPrice)) {
    throw new RangeError("the ceiling has to sit above the opening price");
  }

  if (tokenIsToken0) {
    // Pool price is WETH per token, so the supply sits above spot.
    const tickLower = snapTick(getTickAtPrice(openingPrice), spacing);
    const tickUpper = snapTick(getTickAtPrice(ceilingPrice), spacing);
    if (tickUpper <= tickLower) throw new RangeError("the range collapses to a single tick — widen it");

    return {
      sqrtPriceX96: getSqrtRatioAtTick(tickLower),
      tickLower,
      tickUpper,
      effectiveOpeningPrice: 1.0001 ** tickLower,
      effectiveCeilingPrice: 1.0001 ** tickUpper,
    };
  }

  // Token is token1: pool price is tokens per WETH, so the axis is inverted and
  // the supply sits below spot.
  const tickUpper = snapTick(getTickAtPrice(1 / openingPrice), spacing);
  const tickLower = snapTick(getTickAtPrice(1 / ceilingPrice), spacing);
  if (tickUpper <= tickLower) throw new RangeError("the range collapses to a single tick — widen it");

  return {
    sqrtPriceX96: getSqrtRatioAtTick(tickUpper),
    tickLower,
    tickUpper,
    effectiveOpeningPrice: 1 / 1.0001 ** tickUpper,
    effectiveCeilingPrice: 1 / 1.0001 ** tickLower,
  };
}
