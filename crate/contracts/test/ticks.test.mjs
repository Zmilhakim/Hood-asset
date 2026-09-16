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
  getSqrtRatioAtTick,
  launchRange,
  parseDecimal,
  sqrtBigInt,
  sqrtPriceX96FromRatio,
  tickAtOrBelow,
} from "../lib/ticks.mjs";

const SPACING = 200;

test("getSqrtRatioAtTick agrees with Uniswap at the points everyone publishes", () => {
  assert.equal(getSqrtRatioAtTick(0), Q96);
  assert.equal(getSqrtRatioAtTick(MIN_TICK), 4295128739n); // MIN_SQRT_RATIO
  assert.equal(getSqrtRatioAtTick(MAX_TICK), 1461446703485210103287273052203988822378723970342n); // MAX_SQRT_RATIO

  assert.throws(() => getSqrtRatioAtTick(MIN_TICK - 1), RangeError);
  assert.throws(() => getSqrtRatioAtTick(MAX_TICK + 1), RangeError);
});

test("a tick survives the round trip through its price", () => {
  for (const tick of [MIN_TICK, -400_001, -184_200, -1, 0, 1, 200, 60_000, 887_271, MAX_TICK]) {
    assert.equal(tickAtOrBelow(getSqrtRatioAtTick(tick)), tick, `tick ${tick} did not come back`);
  }

  // And the price really is monotonic in the tick, which is what the search
  // above leans on.
  for (const tick of [-100_000, -1, 0, 1, 100_000]) {
    assert.ok(getSqrtRatioAtTick(tick) < getSqrtRatioAtTick(tick + 1));
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
  assert.equal(alignUp(400, SPACING), 400);
  assert.equal(alignDown(400, SPACING), 400);
});

test("a launch range satisfies the rule the packer enforces, whichever side the token lands on", () => {
  const prices = [
    ["0.00000001", "0.000001"],
    ["0.000000001", "0.0001"],
    ["1", "50"],
  ];

  for (const tokenIsToken0 of [true, false]) {
    for (const [floorEthPerToken, ceilEthPerToken] of prices) {
      const range = launchRange({ tokenIsToken0, floorEthPerToken, ceilEthPerToken, spacing: SPACING });

      assert.ok(range.tickLower < range.tickUpper, "the range is upside down");
      // `=== 0` rather than assert.equal: a negative tick divides to -0.
      assert.ok(range.tickLower % SPACING === 0, "tickLower is off the spacing grid");
      assert.ok(range.tickUpper % SPACING === 0, "tickUpper is off the spacing grid");

      // This is the pool's own reading of the price it will be initialised at.
      const poolTick = tickAtOrBelow(range.sqrtPriceX96);
      assert.equal(poolTick, range.currentTick, "the pool would not report the tick we aimed at");

      // CratePacker: the whole range must sit on the token's side of spot.
      if (tokenIsToken0) assert.ok(range.tickLower >= poolTick, "range dips below spot");
      else assert.ok(range.tickUpper <= poolTick, "range reaches above spot");
    }
  }
});

test("an exact ratio describes the same range as the decimal it came from", () => {
  const spacing = SPACING;
  const asText = launchRange({
    tokenIsToken0: true,
    floorEthPerToken: "0.00000001",
    ceilEthPerToken: "0.000001",
    spacing,
  });
  // What pack.mjs does: a market cap in ETH divided across the whole supply,
  // which has no exact decimal form and so is carried as a fraction.
  const asRatio = launchRange({
    tokenIsToken0: true,
    floorEthPerToken: { num: 1n, den: 100_000_000n },
    ceilEthPerToken: { num: 1n, den: 1_000_000n },
    spacing,
  });
  assert.deepEqual(asRatio, asText);
});

test("the same prices describe the same range from either side of the pool", () => {
  const args = { floorEthPerToken: "0.00000002", ceilEthPerToken: "0.000002", spacing: SPACING };
  const asToken0 = launchRange({ ...args, tokenIsToken0: true });
  const asToken1 = launchRange({ ...args, tokenIsToken0: false });

  // Inverting the price mirrors the tick, so the two ranges are reflections.
  assert.equal(asToken0.tickLower, -asToken1.tickUpper);
  assert.equal(asToken0.tickUpper, -asToken1.tickLower);
});

test("a range that cannot be built is refused rather than rounded into shape", () => {
  const spacing = SPACING;
  assert.throws(() => launchRange({ tokenIsToken0: true, floorEthPerToken: "1", ceilEthPerToken: "1", spacing }));
  assert.throws(() => launchRange({ tokenIsToken0: true, floorEthPerToken: "2", ceilEthPerToken: "1", spacing }));
  // Two prices a hair apart land on one tick, and a zero-width range is not a
  // launch. Say so instead of shipping it.
  assert.throws(
    () => launchRange({ tokenIsToken0: true, floorEthPerToken: "1", ceilEthPerToken: "1.000001", spacing }),
    /widen the range/,
  );
});
