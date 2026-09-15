import assert from "node:assert/strict";
import test from "node:test";

import { getSqrtRatioAtTick, getTickAtPrice, MAX_TICK, MIN_TICK, planLaunch, snapTick } from "./pool.ts";

/** log of a bigint too large for Number, via its top 53 bits. */
function logOf(value: bigint) {
  const bits = value.toString(2).length;
  const shift = BigInt(Math.max(0, bits - 53));
  return Math.log(Number(value >> shift)) + Number(shift) * Math.LN2;
}

const LN_10001 = Math.log(1.0001);

test("getSqrtRatioAtTick agrees with sqrt(1.0001^tick) * 2^96 across the whole range", () => {
  const ticks = [
    MIN_TICK, -800000, -500000, -250000, -207233, -100000, -13864, -887, -1, 0, 1, 887, 13864, 100000, 207233,
    250000, 500000, 800000, MAX_TICK,
  ];

  for (const tick of ticks) {
    const expected = 0.5 * tick * LN_10001 + 96 * Math.LN2;
    const actual = logOf(getSqrtRatioAtTick(tick));
    assert.ok(
      Math.abs(actual - expected) < 1e-6,
      `tick ${tick}: log mismatch ${actual} vs ${expected} — a TickMath constant is wrong`,
    );
  }
});

test("getSqrtRatioAtTick is strictly increasing, so a price pins down exactly one tick", () => {
  for (const base of [-207400, -13900, -200, 0, 200, 13900, 207400]) {
    for (let tick = base; tick < base + 40; tick++) {
      assert.ok(
        getSqrtRatioAtTick(tick) < getSqrtRatioAtTick(tick + 1),
        `not monotonic between ${tick} and ${tick + 1}`,
      );
    }
  }
});

test("a price round-trips back to its own tick", () => {
  for (const tick of [-207200, -13800, -600, 0, 600, 13800, 207200]) {
    assert.equal(getTickAtPrice(1.0001 ** tick), tick);
  }
});

test("snapTick lands on the grid and never leaves the legal range", () => {
  const spacing = 200;
  const lowestOnGrid = Math.ceil(MIN_TICK / spacing) * spacing;
  const highestOnGrid = Math.floor(MAX_TICK / spacing) * spacing;

  for (const tick of [-207233, -1, 0, 1, 207233]) {
    const snapped = snapTick(tick, spacing);
    // JS hands back -0 for a negative multiple, so test divisibility, not the remainder's sign.
    assert.ok(Number.isInteger(snapped / spacing), `${snapped} is not on the ${spacing} grid`);
    assert.ok(snapped <= tick, "snapping rounds down");
    assert.ok(snapped >= lowestOnGrid && snapped <= highestOnGrid);
  }

  // At the extremes the legal grid wins: there is no tick below MIN_TICK to
  // round down to, so the result moves up instead of off the end.
  assert.equal(snapTick(MIN_TICK, spacing), lowestOnGrid);
  assert.ok(lowestOnGrid > MIN_TICK);
  assert.equal(snapTick(MAX_TICK, spacing), highestOnGrid);
  assert.ok(Object.is(snapTick(-1, spacing), -spacing));
});

test("planLaunch opens the pool exactly on the boundary tick, both orderings", () => {
  const spacing = 200;
  const openingPrice = 1e-9; // ETH per token — a 1 ETH opening on a 1B supply
  const ceilingPrice = 1e-7;

  for (const tokenIsToken0 of [true, false]) {
    const plan = planLaunch({ tokenIsToken0, openingPrice, ceilingPrice, spacing });

    assert.ok(Number.isInteger(plan.tickLower / spacing), `${plan.tickLower} is not on the grid`);
    assert.ok(Number.isInteger(plan.tickUpper / spacing), `${plan.tickUpper} is not on the grid`);
    assert.ok(plan.tickLower < plan.tickUpper, "range must be non-empty");

    // The contract reads the pool's tick and requires the range to sit entirely
    // on the token's side of it. Initialising at the boundary's own sqrt price
    // makes the pool report exactly that tick.
    const boundary = tokenIsToken0 ? plan.tickLower : plan.tickUpper;
    assert.equal(plan.sqrtPriceX96, getSqrtRatioAtTick(boundary));
    assert.ok(plan.sqrtPriceX96 < getSqrtRatioAtTick(boundary + 1));
  }
});

test("planLaunch keeps the effective prices within one tick-spacing of what was asked", () => {
  const spacing = 200;
  const slack = 1.0001 ** spacing;

  for (const tokenIsToken0 of [true, false]) {
    const plan = planLaunch({ tokenIsToken0, openingPrice: 5e-9, ceilingPrice: 5e-7, spacing });

    assert.ok(plan.effectiveOpeningPrice > 5e-9 / slack && plan.effectiveOpeningPrice < 5e-9 * slack);
    assert.ok(plan.effectiveCeilingPrice > 5e-7 / slack && plan.effectiveCeilingPrice < 5e-7 * slack);
    assert.ok(plan.effectiveCeilingPrice > plan.effectiveOpeningPrice);
  }
});

test("planLaunch refuses a range that is not a range", () => {
  assert.throws(() => planLaunch({ tokenIsToken0: true, openingPrice: 1e-9, ceilingPrice: 1e-9, spacing: 200 }));
  assert.throws(() => planLaunch({ tokenIsToken0: true, openingPrice: 1e-7, ceilingPrice: 1e-9, spacing: 200 }));
  assert.throws(() =>
    planLaunch({ tokenIsToken0: true, openingPrice: 1e-9, ceilingPrice: 1.0001e-9, spacing: 200 }),
  );
});
