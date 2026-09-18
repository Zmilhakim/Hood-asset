/**
 * Launch pricing on v4.
 *
 * The tick maths is the same maths — Uniswap's TickMath, in `pool.ts`, shared
 * rather than copied. What v4 removes is the question that maths was wrapped in.
 *
 * On v3 the token was paired against WETH, and which of the two came first
 * depended on how their addresses compared. That decided whether the supply sat
 * above or below spot, which decided the whole shape of the range — so the app
 * had to predict the token's address before it could price the launch, and a
 * wrong answer produced a pool that quietly asked the poster for ETH.
 *
 * In v4 the other side is native ETH, which is `address(0)` and therefore always
 * `currency0`. The token is always `currency1`. There is nothing to predict and
 * nothing to get wrong: the supply always sits below spot.
 */

import { planLaunch, type LaunchPlan } from "./pool.ts";

export type V4LaunchPlan = LaunchPlan & {
  /** Market cap in ETH the pool will really open at, after tick rounding. */
  effectiveOpeningCapEth: number;
  /** Market cap in ETH at the far end of the range, after tick rounding. */
  effectiveCeilingCapEth: number;
};

/**
 * A launch priced the way people actually talk about one: by what the whole
 * supply is worth at each end of the range, not by the price of one token.
 *
 * @param openingCapEth market cap in ETH where the sale starts. The pool opens here.
 * @param ceilingCapEth market cap in ETH at the far end of the range.
 */
export function planV4Launch({
  openingCapEth,
  ceilingCapEth,
  spacing,
  supply,
}: {
  openingCapEth: number;
  ceilingCapEth: number;
  spacing: number;
  supply: number;
}): V4LaunchPlan {
  if (!(openingCapEth > 0)) throw new RangeError("the opening market cap has to be above zero");
  if (!(ceilingCapEth > openingCapEth)) throw new RangeError("the ceiling has to sit above the opening cap");
  if (!(supply > 0)) throw new RangeError("the supply has to be above zero");

  // `tokenIsToken0: false` is not a choice here, the way it was on v3 — it is
  // what native ETH being currency0 means. It is written out rather than hidden
  // so the line reads as the fact it is.
  const plan = planLaunch({
    tokenIsToken0: false,
    openingPrice: openingCapEth / supply,
    ceilingPrice: ceilingCapEth / supply,
    spacing,
  });

  return {
    ...plan,
    effectiveOpeningCapEth: plan.effectiveOpeningPrice * supply,
    effectiveCeilingCapEth: plan.effectiveCeilingPrice * supply,
  };
}
