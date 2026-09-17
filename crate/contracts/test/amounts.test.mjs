import assert from "node:assert/strict";
import test from "node:test";
import {
  amountsInPosition,
  ethPerTokenFromSqrtPrice,
  getSqrtPriceAtTick,
  launchRange,
  pricePerToken,
} from "../lib/ticks.mjs";

const SUPPLY = 1_000_000_000n;
const range = launchRange({
  floorEthPerToken: pricePerToken("2", SUPPLY),
  ceilEthPerToken: pricePerToken("200", SUPPLY),
  tickSpacing: 200,
});

test("at the launch price the crate is all token and no ETH", () => {
  const at = amountsInPosition(10n ** 20n, getSqrtPriceAtTick(range.tickUpper), range.tickLower, range.tickUpper);
  assert.equal(at.eth, 0n, "nobody has bought, so there is no ETH in the pool");
  assert.ok(at.tokens > 0n, "and the whole shelf is still stocked");
});

test("at the far end the crate is all ETH and no token", () => {
  const at = amountsInPosition(10n ** 20n, getSqrtPriceAtTick(range.tickLower), range.tickLower, range.tickUpper);
  assert.ok(at.eth > 0n);
  assert.equal(at.tokens, 0n, "every token has been bought");
});

test("in the middle it holds some of each", () => {
  const middle = Math.round((range.tickLower + range.tickUpper) / 2);
  const at = amountsInPosition(10n ** 20n, getSqrtPriceAtTick(middle), range.tickLower, range.tickUpper);
  assert.ok(at.eth > 0n && at.tokens > 0n);
});

test("a price outside the range is clamped, not extrapolated", () => {
  const below = amountsInPosition(10n ** 20n, getSqrtPriceAtTick(range.tickLower - 5000), range.tickLower, range.tickUpper);
  const atEdge = amountsInPosition(10n ** 20n, getSqrtPriceAtTick(range.tickLower), range.tickLower, range.tickUpper);
  assert.deepEqual(below, atEdge);
});

test("no liquidity holds nothing, and a bad range is refused", () => {
  assert.deepEqual(amountsInPosition(0n, getSqrtPriceAtTick(0), -200, 200), { eth: 0n, tokens: 0n });
  assert.throws(() => amountsInPosition(1n, getSqrtPriceAtTick(0), 200, 200), RangeError);
});

test("the price the pool quotes reads back as the price the launch asked for", () => {
  // launchRange put spot at tickUpper, which is the floor price — what the whole
  // supply is worth where selling starts. That is the round trip: the number
  // that went into crate.config.json should come back out of the pool.
  const ethPerToken = ethPerTokenFromSqrtPrice(getSqrtPriceAtTick(range.tickUpper));
  const valuation = ethPerToken * SUPPLY;

  const asked = 2n * 10n ** 18n; // "2" ETH for the whole supply

  // Not exact, and cannot be: the tick is aligned down to the spacing, and a
  // lower tick is a dearer token — the pool quotes CRATE per ETH, so the two
  // run opposite ways. The direction is the promise worth testing. Rounding
  // must never open the sale *under* the floor the config asked for.
  assert.ok(valuation >= asked, `floor opened at ${valuation} wei, below the ${asked} asked for`);

  // And it must not overshoot by more than one step of the grid, which at a
  // spacing of 200 is 1.0001^200, a little over 2%.
  assert.ok((valuation - asked) * 48n < asked, `floor overshot to ${valuation} wei, more than one tick step`);
});

test("a pool with no price is refused rather than divided by", () => {
  assert.throws(() => ethPerTokenFromSqrtPrice(0n), RangeError);
});
