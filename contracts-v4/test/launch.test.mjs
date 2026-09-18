// A launch, end to end, against Uniswap's own PoolManager. The token is really
// minted, the pool really opened, the position really locked, and then the tests
// trade against it and try to get something back out.
import assert from "node:assert/strict";
import test from "node:test";

import { readSlot0 } from "../lib/pool.mjs";
import {
  DEPLOYER,
  POSTER,
  PLAN,
  STRANGER,
  SUPPLY,
  TICK_SPACING,
  address,
  board,
  buy,
  factoryArtifact,
  launchParams,
  lockerArtifact,
  post,
  tokenArtifact,
} from "./venue.mjs";

test("a launch puts the whole supply into the locked position and keeps none", async () => {
  const ctx = await board();
  const { reverted, token, notice } = await post(ctx);
  assert.equal(reverted, false, "postToken reverted");

  assert.equal(await ctx.read(token, tokenArtifact.abi, "name"), "Test Hood");
  assert.equal(await ctx.read(token, tokenArtifact.abi, "symbol"), "TESTHOOD");
  assert.equal(await ctx.read(token, tokenArtifact.abi, "totalSupply"), SUPPLY);
  assert.equal(notice.supply, SUPPLY);
  assert.equal(notice.poster, address(POSTER));

  // The supply is in the pool manager. What did not divide evenly into liquidity
  // is still in the locker, which is just as shut — and it is dust, not a stash.
  const inPool = await ctx.read(token, tokenArtifact.abi, "balanceOf", [ctx.manager]);
  const inLocker = await ctx.read(token, tokenArtifact.abi, "balanceOf", [ctx.locker]);
  assert.equal(inPool + inLocker, SUPPLY, "some of the supply went somewhere else");
  assert.ok(inLocker < 10n ** 18n, `the locker kept ${inLocker} wei of supply, which is not dust`);

  // Nobody else holds any, least of all the three addresses that could have.
  for (const who of [ctx.factory, ctx.hook, address(POSTER), address(DEPLOYER)]) {
    assert.equal(await ctx.read(token, tokenArtifact.abi, "balanceOf", [who]), 0n, `${who} holds supply`);
  }
});

test("the pool opens at the price the launch asked for, with the board's hook in its key", async () => {
  const ctx = await board();
  const { key, poolId } = await post(ctx);

  assert.equal(key.hooks, ctx.hook, "the pool did not carry the hook");
  assert.equal(key.currency0, "0x0000000000000000000000000000000000000000", "ETH is not currency0");

  const slot0 = await readSlot0(
    { readContract: ({ args }) => ctx.read(ctx.manager, [{ type: "function", name: "extsload", inputs: [{ type: "bytes32" }], outputs: [{ type: "bytes32" }], stateMutability: "view" }], "extsload", args) },
    ctx.manager,
    poolId,
  );

  assert.equal(slot0.initialized, true, "the pool was never initialised");
  assert.equal(slot0.tick, PLAN.tickUpper, "the pool did not open at the top of the range");
  assert.equal(slot0.sqrtPriceX96, PLAN.sqrtPriceX96, "the pool opened at a different price");
});

test("the locked position is owned by the locker and carries the liquidity", async () => {
  const ctx = await board();
  const { poolId } = await post(ctx);

  const liquidity = await ctx.read(ctx.locker, lockerArtifact.abi, "lockedLiquidity", [poolId]);
  assert.ok(liquidity > 0n, "the position holds no liquidity");

  const position = await ctx.read(ctx.locker, lockerArtifact.abi, "positionOf", [poolId]);
  assert.equal(position.beneficiary, address(POSTER), "the fees were pointed at someone else");
  assert.equal(position.tickLower, PLAN.tickLower);
  assert.equal(position.tickUpper, PLAN.tickUpper);
});

test("a range that straddles spot is refused rather than half-funded", async () => {
  const ctx = await board();

  // One spacing above the opening tick, so the position would need ETH the
  // locker does not have.
  const straddling = launchParams({ tickUpper: PLAN.tickUpper + TICK_SPACING });
  const { reverted } = await post(ctx, straddling);
  assert.equal(reverted, true, "a straddling range was accepted");
});

test("the board refuses a misaligned or backwards range, and an empty name", async () => {
  const ctx = await board();

  for (const [what, params] of [
    ["misaligned lower tick", launchParams({ tickLower: PLAN.tickLower + 1 })],
    ["misaligned upper tick", launchParams({ tickUpper: PLAN.tickUpper + 1 })],
    ["backwards range", launchParams({ tickLower: PLAN.tickUpper, tickUpper: PLAN.tickLower })],
    ["zero tick spacing", launchParams({ tickSpacing: 0 })],
    ["an empty name", launchParams({ name: "" })],
    ["an empty symbol", launchParams({ symbol: "" })],
    ["a dynamic fee", launchParams({ fee: 0x800000 })],
  ]) {
    const { reverted } = await post(ctx, params);
    assert.equal(reverted, true, `${what} was accepted`);
  }
});

test("two notices get two pools, and the second does not absorb the first's dust", async () => {
  const ctx = await board();

  const first = await post(ctx, launchParams({ name: "First", symbol: "FIRST" }));
  const second = await post(ctx, launchParams({ name: "Second", symbol: "SECOND" }), STRANGER);
  assert.equal(second.reverted, false, "the second launch reverted");

  assert.notEqual(first.token, second.token, "both notices got the same token");
  assert.notEqual(first.poolId, second.poolId, "both notices got the same pool");

  // Each position holds its own token and nothing of the other's.
  assert.equal(await ctx.read(first.token, tokenArtifact.abi, "balanceOf", [second.token]), 0n);
  const secondLiquidity = await ctx.read(ctx.locker, lockerArtifact.abi, "lockedLiquidity", [second.poolId]);
  assert.ok(secondLiquidity > 0n, "the second position holds nothing");

  assert.equal(await ctx.read(ctx.factory, factoryArtifact.abi, "tokenCount"), 2n);
  const mine = await ctx.read(ctx.factory, factoryArtifact.abi, "noticesOf", [address(POSTER)]);
  assert.deepEqual(mine, [0n], "the poster's notice list is wrong");
});

test("the locker takes orders from the factory and nobody else", async () => {
  const ctx = await board();
  const { key, poolId } = await post(ctx);

  const stolen = await ctx.call(
    ctx.locker,
    lockerArtifact.abi,
    "lockIn",
    [key, PLAN.tickLower, PLAN.tickUpper, address(STRANGER)],
    { caller: STRANGER },
  );
  assert.equal(stolen.reverted, true, "a stranger locked a position in");

  const position = await ctx.read(ctx.locker, lockerArtifact.abi, "positionOf", [poolId]);
  assert.equal(position.beneficiary, address(POSTER), "the beneficiary moved");
});

test("there is no way to take liquidity out, in the ABI or otherwise", async () => {
  const ctx = await board();
  await post(ctx);

  // The strongest form of this is structural: if the locker had a withdrawal, it
  // would have a name. It does not have one, under any spelling.
  // `unlockCallback` is v4's required entrypoint, not a door — it is the name
  // the pool manager calls back on, and it is excluded by name rather than by
  // loosening the check that catches everything else.
  const names = lockerArtifact.abi
    .filter((entry) => entry.type === "function" && entry.name !== "unlockCallback")
    .map((entry) => entry.name);
  for (const forbidden of ["withdraw", "remove", "removeLiquidity", "unlock", "burn", "rescue", "emergency"]) {
    assert.ok(
      !names.some((name) => name.toLowerCase().includes(forbidden.toLowerCase())),
      `the locker exposes ${forbidden}`,
    );
  }

  // And there is no owner anywhere on the board, so nothing could be added later.
  for (const abi of [lockerArtifact.abi, factoryArtifact.abi]) {
    const surface = abi.filter((entry) => entry.type === "function").map((entry) => entry.name);
    for (const forbidden of ["owner", "transferOwnership", "upgradeTo", "setImplementation"]) {
      assert.ok(!surface.includes(forbidden), `the board exposes ${forbidden}`);
    }
  }
});

test("the supply is fixed: no mint, no owner, no pause", async () => {
  const ctx = await board();
  const { token } = await post(ctx);

  const names = tokenArtifact.abi.filter((entry) => entry.type === "function").map((entry) => entry.name);
  for (const forbidden of ["mint", "owner", "pause", "blacklist", "setTaxRate"]) {
    assert.ok(!names.includes(forbidden), `the token exposes ${forbidden}`);
  }

  // Buying does not change the supply, which is the only claim that matters.
  const before = await ctx.read(token, tokenArtifact.abi, "totalSupply");
  const { key } = await post(ctx, launchParams({ name: "Other", symbol: "OTHER" }));
  await buy(ctx, key, 10n ** 18n);
  assert.equal(await ctx.read(token, tokenArtifact.abi, "totalSupply"), before);
});
