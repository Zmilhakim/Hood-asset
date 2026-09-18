import assert from "node:assert/strict";
import test from "node:test";

import { getSqrtRatioAtTick } from "./pool.ts";
import { planV4Launch } from "./pool-v4.ts";

const SUPPLY = 1_000_000_000;
const SPACING = 200;

test("a launch opens at the top of its range, which is where the supply is cheapest", () => {
  const plan = planV4Launch({ openingCapEth: 1, ceilingCapEth: 100, spacing: SPACING, supply: SUPPLY });

  // The whole range sits at or below the opening tick. This is the invariant the
  // factory enforces on chain, and a plan that breaks it is a launch that reverts.
  assert.ok(plan.tickLower < plan.tickUpper, "the range collapsed");
  assert.equal(plan.sqrtPriceX96, getSqrtRatioAtTick(plan.tickUpper), "the pool would not open on the boundary tick");
});

test("both ticks land on the spacing grid", () => {
  const plan = planV4Launch({ openingCapEth: 1, ceilingCapEth: 100, spacing: SPACING, supply: SUPPLY });

  assert.equal(plan.tickLower % SPACING, 0, "the lower tick is off the grid");
  assert.equal(plan.tickUpper % SPACING, 0, "the upper tick is off the grid");
});

test("the effective caps are close to what was asked for, and reported rather than hidden", () => {
  const plan = planV4Launch({ openingCapEth: 1, ceilingCapEth: 100, spacing: SPACING, supply: SUPPLY });

  // Ticks are discrete and the spacing is coarse, so the pool never opens at
  // exactly the number typed into the form. Within a spacing's worth is the
  // honest claim; matching exactly would be a false one.
  assert.ok(Math.abs(plan.effectiveOpeningCapEth - 1) < 0.05, `opened at ${plan.effectiveOpeningCapEth}`);
  assert.ok(Math.abs(plan.effectiveCeilingCapEth - 100) < 5, `ceiling at ${plan.effectiveCeilingCapEth}`);
});

test("a backwards or zero range is refused rather than silently repaired", () => {
  for (const [what, args] of [
    ["a ceiling below the opening", { openingCapEth: 100, ceilingCapEth: 1 }],
    ["a ceiling equal to the opening", { openingCapEth: 1, ceilingCapEth: 1 }],
    ["a zero opening cap", { openingCapEth: 0, ceilingCapEth: 100 }],
  ] as const) {
    assert.throws(
      () => planV4Launch({ ...args, spacing: SPACING, supply: SUPPLY }),
      RangeError,
      `${what} was accepted`,
    );
  }
});

test("a wider supply moves the ticks but not the market caps", () => {
  const billion = planV4Launch({ openingCapEth: 1, ceilingCapEth: 100, spacing: SPACING, supply: 1_000_000_000 });
  const million = planV4Launch({ openingCapEth: 1, ceilingCapEth: 100, spacing: SPACING, supply: 1_000_000 });

  assert.notEqual(billion.tickUpper, million.tickUpper, "the price per token did not change with the supply");
  assert.ok(Math.abs(billion.effectiveOpeningCapEth - million.effectiveOpeningCapEth) < 0.05);
});
