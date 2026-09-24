import assert from "node:assert/strict";
import test from "node:test";

import { amountsInPosition, getSqrtPriceAtTick, rangeProgress, weiPerTokenFromSqrtPrice, Q96 } from "./pool.ts";

test("tick zero is price one", () => {
  assert.equal(getSqrtPriceAtTick(0), Q96);
});

test("a tick and its negative are reciprocals, to rounding", () => {
  const up = getSqrtPriceAtTick(20_000);
  const down = getSqrtPriceAtTick(-20_000);
  const product = (up * down) / Q96;
  // Both round up, so the product lands just above Q96 rather than on it.
  assert.ok(product >= Q96 && product - Q96 < Q96 / 1_000_000n, `${product} is not ~${Q96}`);
});

test("the price per token is the reciprocal of what the pool quotes", () => {
  // A pool quoting 1 token per ETH prices one token at one ETH.
  const price = weiPerTokenFromSqrtPrice(Q96);
  assert.equal(price, 10n ** 18n);
});

test("a pool with no price has no price", () => {
  assert.equal(weiPerTokenFromSqrtPrice(0n), null);
});

test("a position above its range is all token and holds no ETH", () => {
  const tickLower = -2_000;
  const tickUpper = 2_000;
  const above = getSqrtPriceAtTick(tickUpper + 10);

  const held = amountsInPosition(10n ** 18n, above, tickLower, tickUpper);
  assert.equal(held.eth, 0n, "a launch that nobody has bought from holds no ETH");
  assert.ok(held.tokens > 0n, "the whole position should still be token");
});

test("a position below its range is all ETH and has no token left", () => {
  const tickLower = -2_000;
  const tickUpper = 2_000;
  const below = getSqrtPriceAtTick(tickLower - 10);

  const held = amountsInPosition(10n ** 18n, below, tickLower, tickUpper);
  assert.ok(held.eth > 0n, "everything paid in should be there");
  assert.equal(held.tokens, 0n, "nothing should be left on the shelf");
});

test("progress runs from nothing sold to sold out", () => {
  const tickLower = -2_000;
  const tickUpper = 2_000;

  assert.equal(rangeProgress(getSqrtPriceAtTick(tickUpper), tickLower, tickUpper), 0);
  assert.equal(rangeProgress(getSqrtPriceAtTick(tickLower), tickLower, tickUpper), 1);

  const halfway = rangeProgress(getSqrtPriceAtTick(0), tickLower, tickUpper);
  assert.ok(halfway !== null && halfway > 0 && halfway < 1, `${halfway} is not inside the range`);
});

test("a pool with no price has no progress, rather than zero progress", () => {
  assert.equal(rangeProgress(0n, -100, 100), null);
});
