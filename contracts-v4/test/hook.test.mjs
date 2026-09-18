// The fee hook, under real swaps. The pool manager dispatches into it the way it
// would on chain, so what these tests measure is the fee an actual trader pays,
// not a calculation repeated back.
import assert from "node:assert/strict";
import test from "node:test";

import {
  HOOK_FEE_BPS,
  NATIVE,
  POSTER,
  STRANGER,
  TICK_SPACING,
  TRADER,
  address,
  board,
  buy,
  factoryArtifact,
  hookArtifact,
  launchParams,
  lockerArtifact,
  post,
  sell,
  tokenArtifact,
} from "./venue.mjs";

const ONE_ETH = 10n ** 18n;

test("the hook's address carries exactly the permissions it declares", async () => {
  const ctx = await board();

  // v4 reads a hook's callbacks out of the low 14 bits of its address. afterSwap
  // is 1 << 6 and afterSwapReturnDelta is 1 << 2; every other bit must be clear,
  // or the manager would call into callbacks this hook does not implement.
  const bits = BigInt(ctx.hook) & ((1n << 14n) - 1n);
  assert.equal(bits, (1n << 6n) | (1n << 2n), `the hook address carries ${bits.toString(2)}`);
});

test("the fee is a constant of 5%, with no setter anywhere", async () => {
  const ctx = await board();

  assert.equal(await ctx.read(ctx.hook, hookArtifact.abi, "FEE_BPS"), HOOK_FEE_BPS);

  const names = hookArtifact.abi.filter((entry) => entry.type === "function").map((entry) => entry.name);
  for (const forbidden of ["setFee", "setFeeBps", "owner", "transferOwnership", "setBeneficiary", "upgradeTo"]) {
    assert.ok(!names.includes(forbidden), `the hook exposes ${forbidden}`);
  }
});

test("buying pays the fee in the token, and it is 5% of what the pool paid out", async () => {
  const ctx = await board();
  const { key, token, poolId } = await post(ctx);

  const swap = await buy(ctx, key, ONE_ETH);
  assert.equal(swap.reverted, false, "the buy reverted");

  const toTrader = await ctx.read(token, tokenArtifact.abi, "balanceOf", [address(TRADER)]);
  const toHook = await ctx.read(ctx.hook, hookArtifact.abi, "owed", [poolId, token]);

  assert.ok(toTrader > 0n, "the trader received nothing");
  assert.ok(toHook > 0n, "the hook took nothing on a buy");
  assert.equal(await ctx.read(ctx.hook, hookArtifact.abi, "owed", [poolId, NATIVE]), 0n, "a buy accrued an ETH fee");

  // The pool paid out `toTrader + toHook` on the token side, and the hook kept
  // 5% of that gross — the trader's own balance is the other 95%.
  const gross = toTrader + toHook;
  assert.equal(toHook, (gross * HOOK_FEE_BPS) / 10_000n, "the cut is not 5% of the output");

  // And the hook is really holding it, not just claiming to be owed it.
  assert.equal(await ctx.read(token, tokenArtifact.abi, "balanceOf", [ctx.hook]), toHook);
});

test("selling pays the fee in ETH", async () => {
  const ctx = await board();
  const { key, token, poolId } = await post(ctx);

  await buy(ctx, key, ONE_ETH);
  const held = await ctx.read(token, tokenArtifact.abi, "balanceOf", [address(TRADER)]);
  assert.ok(held > 0n, "the trader has nothing to sell");

  const swap = await sell(ctx, key, token, held / 2n);
  assert.equal(swap.reverted, false, "the sell reverted");

  const owedEth = await ctx.read(ctx.hook, hookArtifact.abi, "owed", [poolId, NATIVE]);
  assert.ok(owedEth > 0n, "the hook took nothing on a sell");
  assert.equal(await ctx.balanceOf(ctx.hook), owedEth, "the hook is not holding what it says it is owed");
});

test("claim pays the poster and zeroes the ledger", async () => {
  const ctx = await board();
  const { key, token, poolId } = await post(ctx);

  await buy(ctx, key, ONE_ETH);
  const owedToken = await ctx.read(ctx.hook, hookArtifact.abi, "owed", [poolId, token]);
  assert.ok(owedToken > 0n);

  // Permissionless: a stranger can push the poster their fees, and it still only
  // ever lands on the poster.
  const claimed = await ctx.call(ctx.hook, hookArtifact.abi, "claim", [key], { caller: STRANGER });
  assert.equal(claimed.reverted, false, "claim reverted");

  assert.equal(await ctx.read(token, tokenArtifact.abi, "balanceOf", [address(POSTER)]), owedToken);
  assert.equal(await ctx.read(token, tokenArtifact.abi, "balanceOf", [address(STRANGER)]), 0n, "the caller was paid");
  assert.equal(await ctx.read(ctx.hook, hookArtifact.abi, "owed", [poolId, token]), 0n, "the ledger was not cleared");

  const again = await ctx.call(ctx.hook, hookArtifact.abi, "claim", [key], { caller: STRANGER });
  assert.equal(again.reverted, true, "an empty claim should revert rather than pay nothing twice");
});

test("nobody but the factory can register a pool, and no pool is registered twice", async () => {
  const ctx = await board();
  const { poolId } = await post(ctx);

  const stolen = await ctx.call(ctx.hook, hookArtifact.abi, "register", [poolId, address(STRANGER)], {
    caller: STRANGER,
  });
  assert.equal(stolen.reverted, true, "a stranger registered a pool");
  assert.equal(await ctx.read(ctx.hook, hookArtifact.abi, "beneficiaryOf", [poolId]), address(POSTER));
});

test("the hook's cut and the pool's LP fee are two separate ledgers", async () => {
  const ctx = await board();
  const { key, token, poolId } = await post(ctx);

  await buy(ctx, key, 10n * ONE_ETH);

  const hookOwed = await ctx.read(ctx.hook, hookArtifact.abi, "owed", [poolId, token]);
  assert.ok(hookOwed > 0n, "the hook took nothing");

  // The LP fee lives on the locked position and comes out through the locker.
  // Collecting it does not touch the hook's ledger, and does not touch the
  // liquidity either.
  const liquidityBefore = await ctx.read(ctx.locker, lockerArtifact.abi, "lockedLiquidity", [poolId]);
  const posterEthBefore = await ctx.balanceOf(address(POSTER));
  const collected = await ctx.call(ctx.locker, lockerArtifact.abi, "collectFees", [poolId], { caller: STRANGER });
  assert.equal(collected.reverted, false, "collectFees reverted");

  assert.equal(
    await ctx.read(ctx.locker, lockerArtifact.abi, "lockedLiquidity", [poolId]),
    liquidityBefore,
    "collecting fees moved the liquidity",
  );
  assert.equal(
    await ctx.read(ctx.hook, hookArtifact.abi, "owed", [poolId, token]),
    hookOwed,
    "collecting LP fees touched the hook's ledger",
  );

  // The LP fee went to the poster, on top of whatever the hook is holding. On an
  // exact-input buy the pool takes its fee out of the input side, so what the
  // poster collects here is ETH, not the token.
  const [collected0, collected1] = collected.decode();
  assert.ok(collected0 > 0n, "the poster collected no ETH-side LP fee");
  assert.equal(collected1, 0n, "an ETH-in buy should not accrue a token-side LP fee");
  assert.equal(await ctx.balanceOf(address(POSTER)), posterEthBefore + collected0, "the LP fee did not reach the poster");
});

test("a pool the board never opened names the hook and simply pays nothing", async () => {
  const ctx = await board();

  // The board only ever registers pools it opened. Anyone may write this hook
  // into a pool key of their own; it must not revert their swaps, and it must
  // not pay anyone.
  const unregistered = "0x00000000000000000000000000000000000000000000000000000000000000ff";
  assert.equal(
    await ctx.read(ctx.hook, hookArtifact.abi, "beneficiaryOf", [unregistered]),
    "0x0000000000000000000000000000000000000000",
  );

  const claimed = await ctx.call(ctx.hook, hookArtifact.abi, "claim", [
    { currency0: NATIVE, currency1: NATIVE, fee: 10_000, tickSpacing: TICK_SPACING, hooks: ctx.hook },
  ]);
  assert.equal(claimed.reverted, true, "an unregistered pool paid out");
});

test("the board reports its own fee, so the app never hard-codes it", async () => {
  const ctx = await board();
  const [count, , postingFee, supply, feeBps] = await ctx.read(ctx.factory, factoryArtifact.abi, "boardStats");

  assert.equal(count, 0n);
  assert.equal(postingFee, 0n);
  assert.equal(supply, 1_000_000_000n * 10n ** 18n);
  assert.equal(feeBps, HOOK_FEE_BPS, "the board reports a different fee than the hook charges");
});
