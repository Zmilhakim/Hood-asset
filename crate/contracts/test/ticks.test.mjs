// The off-chain half of a launch. If these are wrong the packer refuses the
// transaction rather than launching something lopsided, so what is checked here
// is that the numbers it hands over satisfy the rule it enforces.
import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_TICK,
  MIN_TICK,
  Q96,
  alignDown,
  alignUp,
  getSqrtPriceAtTick,
  launchRange,
  parseDecimal,
  pricePerToken,
  sqrtBigInt,
  sqrtPriceX96FromRatio,
  tickAtOrBelow,
} from "../lib/ticks.mjs";

const SPACING = 200;

test("getSqrtPriceAtTick agrees with Uniswap at the points everyone publishes", () => {
  assert.equal(getSqrtPriceAtTick(0), Q96);
  assert.equal(getSqrtPriceAtTick(MIN_TICK), 4295128739n); // TickMath.MIN_SQRT_PRICE
  assert.equal(getSqrtPriceAtTick(MAX_TICK), 1461446703485210103287273052203988822378723970342n); // MAX_SQRT_PRICE

  assert.throws(() => getSqrtPriceAtTick(MIN_TICK - 1), RangeError);
  assert.throws(() => getSqrtPriceAtTick(MAX_TICK + 1), RangeError);
});

test("a tick survives the round trip through its price", () => {
  for (const tick of [MIN_TICK, -400_001, -184_200, -1, 0, 1, 200, 60_000, 207_200, 887_271, MAX_TICK]) {
    assert.equal(tickAtOrBelow(getSqrtPriceAtTick(tick)), tick, `tick ${tick} did not come back`);
  }

  // And the price really is monotonic in the tick, which is what the search
  // above leans on.
  for (const tick of [-100_000, -1, 0, 1, 100_000]) {
    assert.ok(getSqrtPriceAtTick(tick) < getSqrtPriceAtTick(tick + 1));
  }
});

test("prices are read as decimals, not as floats", () => {
  assert.deepEqual(parseDecimal("0.0000001"), { num: 1n, den: 10_000_000n });
  assert.deepEqual(parseDecimal("1"), { num: 1n, den: 1n });
  assert.deepEqual(parseDecimal("12.5"), { num: 125n, den: 10n });

  for (const bad of ["", "-1", "1e-7", "abc", "0", "0.000"]) {
    assert.throws(() => parseDecimal(bad), `${JSON.stringify(bad)} should not parse`);
  }

  assert.equal(sqrtBigInt(0n), 0n);
  assert.equal(sqrtBigInt(1n), 1n);
  assert.equal(sqrtBigInt(10n ** 40n), 10n ** 20n);
  assert.equal(sqrtPriceX96FromRatio({ num: 1n, den: 1n }), Q96);
});

test("alignment moves to the grid, never off it", () => {
  assert.equal(alignUp(-184_207, SPACING), -184_200);
  assert.equal(alignDown(-184_207, SPACING), -184_400);
  assert.equal(alignDown(207_232, SPACING), 207_200);
  assert.equal(alignUp(400, SPACING), 400);
  assert.equal(alignDown(400, SPACING), 400);
});

test("a launch range satisfies the rule the packer enforces", () => {
  const prices = [
    ["0.000000001", "0.0000001"],
    ["0.00000000001", "0.00001"],
    ["0.5", "50"],
  ];

  for (const [floorEthPerToken, ceilEthPerToken] of prices) {
    const range = launchRange({ floorEthPerToken, ceilEthPerToken, tickSpacing: SPACING });

    assert.ok(range.tickLower < range.tickUpper, "the range is upside down");
    // `=== 0` rather than assert.equal: a negative tick divides to -0.
    assert.ok(range.tickLower % SPACING === 0, "tickLower is off the spacing grid");
    assert.ok(range.tickUpper % SPACING === 0, "tickUpper is off the spacing grid");

    // This is the pool's own reading of the price it will be initialised at.
    const poolTick = tickAtOrBelow(range.sqrtPriceX96);
    assert.equal(poolTick, range.currentTick, "the pool would not report the tick we aimed at");

    // CratePacker: the range must sit at or below spot, because CRATE is always
    // currency1 and the seal has no ETH to put in.
    assert.ok(range.tickUpper <= poolTick, "range reaches above spot");
  }
});

test("a dearer token is a lower tick, because the pool counts the other way", () => {
  const cheap = launchRange({ floorEthPerToken: "0.000000001", ceilEthPerToken: "0.0000001", tickSpacing: SPACING });
  const dear = launchRange({ floorEthPerToken: "0.00000001", ceilEthPerToken: "0.000001", tickSpacing: SPACING });

  assert.ok(dear.tickUpper < cheap.tickUpper, "a ten-times dearer floor should sit ten times lower in tick terms");
  // ln(10)/ln(1.0001) is about 23026 ticks, aligned down to the 200 grid.
  assert.equal(cheap.tickUpper - dear.tickUpper, 23_000);
});

test("a market cap divides across the supply without becoming a float", () => {
  const supply = 1_000_000_000n;

  // 1 ETH across a billion tokens is 1e-9 each, which a decimal can hold…
  assert.deepEqual(pricePerToken("1", supply), { num: 1n, den: 1_000_000_000n });
  // …and 300 across a billion is 3e-7, which is where a float starts lying.
  assert.deepEqual(pricePerToken("300", supply), { num: 300n, den: 1_000_000_000n });
  // A cap with its own decimals keeps both denominators.
  assert.deepEqual(pricePerToken("2.5", supply), { num: 25n, den: 10_000_000_000n });

  // And it lands where the equivalent per-token price does.
  assert.deepEqual(
    launchRange({ floorEthPerToken: pricePerToken("1", supply), ceilEthPerToken: pricePerToken("100", supply), tickSpacing: SPACING }),
    launchRange({ floorEthPerToken: "0.000000001", ceilEthPerToken: "0.0000001", tickSpacing: SPACING }),
  );
});

test("an exact ratio describes the same range as the decimal it came from", () => {
  const asText = launchRange({
    floorEthPerToken: "0.00000001",
    ceilEthPerToken: "0.000001",
    tickSpacing: SPACING,
  });
  // What pack.mjs does: a market cap in ETH divided across the whole supply,
  // which has no exact decimal form and so is carried as a fraction.
  const asRatio = launchRange({
    floorEthPerToken: { num: 1n, den: 100_000_000n },
    ceilEthPerToken: { num: 1n, den: 1_000_000n },
    tickSpacing: SPACING,
  });
  assert.deepEqual(asRatio, asText);
});

test("a range that cannot be built is refused rather than rounded into shape", () => {
  const tickSpacing = SPACING;
  assert.throws(() => launchRange({ floorEthPerToken: "1", ceilEthPerToken: "1", tickSpacing }));
  assert.throws(() => launchRange({ floorEthPerToken: "2", ceilEthPerToken: "1", tickSpacing }));
  // Two prices close enough together land in the same slot of the spacing grid,
  // and a zero-width range is not a launch. Say so instead of shipping it.
  assert.throws(
    () => launchRange({ floorEthPerToken: "0.99", ceilEthPerToken: "0.9999", tickSpacing }),
    /widen the range/,
  );
});
