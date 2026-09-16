// The launch itself, run against a real Uniswap v3 deployment inside a local
// EVM. Everything else in this suite checks rules Hoodpad enforces on its own;
// this file checks the one claim the site makes that only a working venue can
// settle — that posting a token mints it, opens a pool with the whole supply,
// and leaves the position somewhere nobody can take it back from.
import assert from "node:assert/strict";
import test from "node:test";

import { getAddress, keccak256, toHex } from "viem";

import { planLaunch } from "../../hoodpad/src/lib/pool.ts";
import {
  bootVenue,
  FACTORY_ARTIFACT,
  FEE_TIER,
  FIXED_SUPPLY,
  LOCKER_ARTIFACT,
  POSITION_MANAGER,
  POSTER,
  TICK_SPACING,
  TOKEN_ARTIFACT,
  UNISWAP_V3_POOL,
} from "./venue.mjs";

// What the launch form offers by default: a one-ETH opening valuation and a
// hundred-ETH ceiling, over a billion tokens.
const SUPPLY = 1_000_000_000;
const OPENING = 1 / SUPPLY;
const CEILING = 100 / SUPPLY;

const NAME = "Test Hood";
const SYMBOL = "TESTHOOD";

// Checksummed, because that is the casing every contract return value carries.
const poster = getAddress(POSTER.toString());

/// The token's address decides which side of the pool it sits on, and that
/// flips the entire tick axis — so both orderings have to be exercised, and
/// the only way to pick one is to hunt for a salt that produces it.
async function saltFor(venue, wantToken0) {
  for (let i = 0; i < 500; i += 1) {
    const salt = keccak256(toHex(`hoodpad-test-${i}`));
    const token = await venue.read(venue.hoodpad, FACTORY_ARTIFACT.abi, "predictToken", [NAME, SYMBOL, salt]);
    if (token.toLowerCase() < venue.weth.toLowerCase() === wantToken0) return { salt, token };
  }
  throw new Error(`no salt in 500 tries put the token on the ${wantToken0 ? "token0" : "token1"} side`);
}

async function launch(venue, { salt, token }, overrides = {}) {
  const plan = planLaunch({
    tokenIsToken0: token.toLowerCase() < venue.weth.toLowerCase(),
    openingPrice: OPENING,
    ceilingPrice: CEILING,
    spacing: TICK_SPACING,
  });

  const params = {
    salt,
    name: NAME,
    symbol: SYMBOL,
    imageURI: "ipfs://a-picture",
    blurb: "a launch that only exists inside a test",
    link: "https://hoodpad.site",
    sqrtPriceX96: plan.sqrtPriceX96,
    tickLower: plan.tickLower,
    tickUpper: plan.tickUpper,
    fee: FEE_TIER,
    ...overrides,
  };

  return { plan, params, outcome: await venue.tryCall(venue.hoodpad, FACTORY_ARTIFACT.abi, "postToken", [params]) };
}

test("the published Uniswap artifacts still agree with each other", () => {
  // The position manager does not ask the factory where a pool is — it derives
  // the address from a hash baked in at compile time. If these packages ever
  // ship a recompiled pool, every mint below would be aimed at an address that
  // does not exist, and the suite would be testing nothing.
  assert.equal(
    keccak256(UNISWAP_V3_POOL.bytecode),
    "0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54",
    "the pool init code hash no longer matches the one the position manager assumes",
  );
});

test("posting a token mints it, opens a pool, and locks the position away", async () => {
  const venue = await bootVenue();
  const target = await saltFor(venue, false);

  const { plan, outcome } = await launch(venue, target);
  assert.equal(outcome.reverted, false, outcome.reason ?? "");

  const [id, token, positionId] = outcome.decode();
  assert.equal(token, target.token, "the token did not land on the address predictToken promised");

  const notice = await venue.read(venue.hoodpad, FACTORY_ARTIFACT.abi, "noticeAt", [id]);
  const balanceOf = (who) => venue.read(token, TOKEN_ARTIFACT.abi, "balanceOf", [who]);

  // Every token that exists is in the pool. Not most of them.
  const totalSupply = await venue.read(token, TOKEN_ARTIFACT.abi, "totalSupply");
  assert.equal(await balanceOf(notice.pool), totalSupply, "the pool does not hold the entire supply");
  assert.equal(await balanceOf(venue.hoodpad), 0n, "the factory kept tokens back");
  assert.equal(await balanceOf(venue.locker), 0n, "the locker kept tokens back");
  assert.equal(await balanceOf(poster), 0n, "the poster kept tokens back");

  // Rounding dust is burnt rather than parked somewhere, so supply only ever
  // comes in under the mint, never over.
  assert.ok(totalSupply <= FIXED_SUPPLY, "supply grew past the fixed mint");
  assert.ok(FIXED_SUPPLY - totalSupply < 10n ** 9n, "more than dust went missing");

  // The position exists, is real liquidity, and belongs to the locker.
  assert.equal(
    await venue.read(venue.positionManager, POSITION_MANAGER.abi, "ownerOf", [positionId]),
    venue.locker,
    "the LP position did not end up with the locker",
  );

  const position = await venue.read(venue.positionManager, POSITION_MANAGER.abi, "positions", [positionId]);
  assert.ok(position[7] > 0n, "the position was minted with no liquidity");
  assert.equal(position[5], plan.tickLower, "the position's lower tick is not the one that was planned");
  assert.equal(position[6], plan.tickUpper, "the position's upper tick is not the one that was planned");

  // The poster is on the notice and on the lock, and neither is a claim on the
  // principal — only on fees.
  assert.equal(notice.poster, poster);
  assert.equal(notice.token, token);
  assert.equal(notice.supply, FIXED_SUPPLY);
  assert.equal(
    await venue.read(venue.locker, LOCKER_ARTIFACT.abi, "beneficiaryOf", [positionId]),
    poster,
    "the fee beneficiary is not the poster",
  );

  const [count, , , supplyLaunched] = await venue.read(venue.hoodpad, FACTORY_ARTIFACT.abi, "boardStats");
  assert.equal(count, 1n);
  assert.equal(supplyLaunched, FIXED_SUPPLY);
});

test("the pool opens at the price the launch asked for", async () => {
  const venue = await bootVenue();
  const target = await saltFor(venue, false);

  const { plan, outcome } = await launch(venue, target);
  assert.equal(outcome.reverted, false, outcome.reason ?? "");

  const [id] = outcome.decode();
  const notice = await venue.read(venue.hoodpad, FACTORY_ARTIFACT.abi, "noticeAt", [id]);
  const slot0 = await venue.read(notice.pool, UNISWAP_V3_POOL.abi, "slot0");

  assert.equal(slot0[0], plan.sqrtPriceX96, "the pool did not initialize at the planned price");
  assert.equal(
    await venue.read(notice.pool, UNISWAP_V3_POOL.abi, "fee"),
    FEE_TIER,
    "the pool is not on the fee tier the launch asked for",
  );
});

test("the web app's planner works on both sides of the pool", async () => {
  // Two launches, one on each ordering, with the tick maths the site ships.
  // A sign error in either direction would revert here rather than on mainnet.
  for (const tokenIsToken0 of [true, false]) {
    const venue = await bootVenue();
    const target = await saltFor(venue, tokenIsToken0);

    const { outcome } = await launch(venue, target);
    assert.equal(
      outcome.reverted,
      false,
      `a ${tokenIsToken0 ? "token0" : "token1"} launch ${outcome.reason ?? "reverted"}`,
    );

    const [, token] = outcome.decode();
    const notice = await venue.read(venue.hoodpad, FACTORY_ARTIFACT.abi, "noticeAt", [0n]);
    assert.equal(
      await venue.read(token, TOKEN_ARTIFACT.abi, "balanceOf", [notice.pool]),
      await venue.read(token, TOKEN_ARTIFACT.abi, "totalSupply"),
      `a ${tokenIsToken0 ? "token0" : "token1"} launch left tokens outside the pool`,
    );
  }
});

test("a range that straddles spot is refused rather than half-funded", async () => {
  // A range spanning the current tick would need ETH as well as tokens, and a
  // launch has none to give. Uniswap would happily mint a smaller position and
  // hand the rest back; Hoodpad stops first.
  for (const tokenIsToken0 of [true, false]) {
    const venue = await bootVenue();
    const target = await saltFor(venue, tokenIsToken0);

    // The pool opens exactly at the near edge of the range, so moving that edge
    // one spacing across spot is the smallest possible straddle.
    const straddle = tokenIsToken0
      ? { tickLower: planFor(venue, target).tickLower - TICK_SPACING }
      : { tickUpper: planFor(venue, target).tickUpper + TICK_SPACING };

    const { outcome } = await launch(venue, target, straddle);
    assert.equal(outcome.reverted, true, "a straddling range was accepted");
    assert.match(outcome.reason, /NotSingleSided/, `unexpected refusal: ${outcome.reason}`);
  }

  function planFor(venue, target) {
    return planLaunch({
      tokenIsToken0: target.token.toLowerCase() < venue.weth.toLowerCase(),
      openingPrice: OPENING,
      ceilingPrice: CEILING,
      spacing: TICK_SPACING,
    });
  }
});

test("the locker is handed the position and has nowhere to send it", async () => {
  const venue = await bootVenue();
  const target = await saltFor(venue, false);

  const { outcome } = await launch(venue, target);
  assert.equal(outcome.reverted, false, outcome.reason ?? "");
  const [, , positionId] = outcome.decode();

  // Not "the locker refuses to transfer" — it has no function that could.
  const surface = LOCKER_ARTIFACT.abi.filter((entry) => entry.type === "function").map((entry) => entry.name);
  assert.deepEqual(
    [...surface].sort(),
    ["beneficiaryOf", "collectFees", "factory", "lock", "onERC721Received", "positionManager"],
    "the locker grew a function since this test was written — check it cannot move the position",
  );

  // And the position manager still says the locker owns it, so the lock is the
  // owner's silence rather than an unenforced promise.
  assert.equal(await venue.read(venue.positionManager, POSITION_MANAGER.abi, "ownerOf", [positionId]), venue.locker);

  // Re-locking someone else's position id is not a way back in either.
  const relock = await venue.tryCall(venue.locker, LOCKER_ARTIFACT.abi, "lock", [positionId, poster]);
  assert.equal(relock.reverted, true, "anyone can call lock");
});
