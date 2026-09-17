// Runs the compiled contracts on a local EVM against Uniswap's own PoolManager,
// deployed as it ships. The crate is really packed, really traded against, and
// then the tests try to get something back out of it.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";

import { Common, Hardfork, Mainnet } from "@ethereumjs/common";
import { createEVM } from "@ethereumjs/evm";
import { Address, bytesToHex, createAccount, hexToBytes } from "@ethereumjs/util";
import {
  concatHex,
  decodeFunctionResult,
  encodeAbiParameters,
  encodeFunctionData,
  getAddress,
  getContractAddress,
  parseAbiParameters,
} from "viem";

import { cratePoolKey, decodeSlot0, poolId, poolStateSlot } from "../lib/pool.mjs";
import { getSqrtPriceAtTick, launchRange } from "../lib/ticks.mjs";

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "out");
const artifact = (name) => JSON.parse(readFileSync(join(out, `${name}.json`), "utf8"));

const packerArtifact = artifact("CratePacker");
const sealArtifact = artifact("CrateSeal");
const tokenArtifact = artifact("CrateToken");
const managerArtifact = artifact("TestPoolManager");
const routerArtifact = artifact("TestSwapRouter");
const crateRouterArtifact = artifact("CrateRouter");

const SUPPLY = 1_000_000_000n * 10n ** 18n;
const NAME = "Crate";
const SYMBOL = "CRATE";
const FEE = 10_000; // 1%
const TICK_SPACING = 200;
const GAS = 200_000_000n;

const MIN_SQRT_PRICE = 4295128739n;
const MAX_SQRT_PRICE = 1461446703485210103287273052203988822378723970342n;
const NATIVE = "0x0000000000000000000000000000000000000000";
const MAX_DEADLINE = 2n ** 48n;

const PACKER = new Address(hexToBytes("0x00000000000000000000000000000000000000f0"));
const STRANGER = new Address(hexToBytes("0x00000000000000000000000000000000000000f1"));
const TRADER = new Address(hexToBytes("0x00000000000000000000000000000000000000f2"));
const TREASURY = new Address(hexToBytes("0x00000000000000000000000000000000000000f3"));

const address = (account) => getAddress(account.toString());

/** The launch these tests use: one ETH of supply at the floor, a hundred at the ceiling. */
const RANGE = launchRange({
  floorEthPerToken: { num: 1n, den: 1_000_000_000n },
  ceilEthPerToken: { num: 100n, den: 1_000_000_000n },
  tickSpacing: TICK_SPACING,
});

const PACK_PARAMS = {
  fee: FEE,
  tickSpacing: TICK_SPACING,
  sqrtPriceX96: RANGE.sqrtPriceX96,
  tickLower: RANGE.tickLower,
  tickUpper: RANGE.tickUpper,
};

async function fresh() {
  // Cancun or later: the pool manager keeps its lock and its deltas in
  // transient storage, so anything older cannot run it at all.
  const evm = await createEVM({ common: new Common({ chain: Mainnet, hardfork: Hardfork.Cancun }) });

  for (const account of [PACKER, STRANGER, TRADER, TREASURY]) {
    await evm.stateManager.putAccount(account, createAccount({ nonce: 0n, balance: 1000n * 10n ** 18n }));
  }

  const deploy = async (art, types, args, caller = PACKER) => {
    const data = types
      ? concatHex([`0x${art.evm.bytecode.object}`, encodeAbiParameters(parseAbiParameters(types), args)])
      : `0x${art.evm.bytecode.object}`;
    const result = await evm.runCall({ caller, to: undefined, data: hexToBytes(data), gasLimit: GAS });
    assert.equal(result.execResult.exceptionError, undefined, "deployment reverted");
    return getAddress(result.createdAddress.toString());
  };

  const call = async (to, abi, functionName, args = [], { caller = PACKER, value = 0n, timestamp } = {}) => {
    const result = await evm.runCall({
      caller,
      to: new Address(hexToBytes(to)),
      data: hexToBytes(encodeFunctionData({ abi, functionName, args })),
      gasLimit: GAS,
      value,
      // The local EVM's block sits at timestamp 0, which no deadline is later
      // than. Anything testing expiry has to say when "now" is.
      ...(timestamp === undefined
        ? {}
        : {
            block: {
              header: {
                timestamp,
                number: 1n,
                gasLimit: 30_000_000n,
                baseFeePerGas: 0n,
                difficulty: 0n,
                prevRandao: new Uint8Array(32),
                coinbase: new Address(hexToBytes(NATIVE)),
              },
            },
          }),
    });
    return {
      reverted: result.execResult.exceptionError !== undefined,
      decode: () => decodeFunctionResult({ abi, functionName, data: bytesToHex(result.execResult.returnValue) }),
    };
  };

  const read = async (to, abi, functionName, args = []) => {
    const result = await call(to, abi, functionName, args);
    assert.equal(result.reverted, false, `${functionName} reverted`);
    return result.decode();
  };

  const balanceOf = async (who) => (await evm.stateManager.getAccount(new Address(hexToBytes(who))))?.balance ?? 0n;

  /// A bare ETH transfer, which is how anything reaches a contract's `receive`.
  const send = async (to, value, caller = TRADER) => {
    const result = await evm.runCall({ caller, to: new Address(hexToBytes(to)), data: new Uint8Array(), gasLimit: GAS, value });
    return { reverted: result.execResult.exceptionError !== undefined };
  };

  return { evm, deploy, call, read, balanceOf, send };
}

/** A pool manager, an unpacked crate, and something that can trade against it. */
async function venue() {
  const ctx = await fresh();

  const manager = await ctx.deploy(managerArtifact, "address", [address(PACKER)]);
  const packer = await ctx.deploy(packerArtifact, "address, address", [manager, address(TREASURY)]);
  const router = await ctx.deploy(routerArtifact, "address", [manager]);
  const seal = await ctx.read(packer, packerArtifact.abi, "seal");

  return { ...ctx, manager, packer, router, seal };
}

async function pack(ctx, params = PACK_PARAMS, caller = PACKER) {
  const result = await ctx.call(ctx.packer, packerArtifact.abi, "pack", [params], { caller });
  if (result.reverted) return { reverted: true };

  const token = await ctx.read(ctx.packer, packerArtifact.abi, "token");
  return { reverted: false, token };
}

/** Buy CRATE with ETH: currency0 in, currency1 out, which walks the price down. */
async function buy(ctx, key, ethIn, caller = TRADER) {
  return ctx.call(
    ctx.router,
    routerArtifact.abi,
    "swap",
    [key, { zeroForOne: true, amountSpecified: -ethIn, sqrtPriceLimitX96: MIN_SQRT_PRICE + 1n }],
    { caller, value: ethIn },
  );
}

/** Sell CRATE back for ETH, which is the only way the other side earns a fee. */
async function sell(ctx, key, token, crateIn, caller = TRADER) {
  const approved = await ctx.call(token, tokenArtifact.abi, "approve", [ctx.router, crateIn], { caller });
  assert.equal(approved.reverted, false, "approve reverted");

  return ctx.call(
    ctx.router,
    routerArtifact.abi,
    "swap",
    [key, { zeroForOne: false, amountSpecified: -crateIn, sqrtPriceLimitX96: MAX_SQRT_PRICE - 1n }],
    { caller },
  );
}

test("packing puts the whole supply into the sealed position", async () => {
  const ctx = await venue();
  const { reverted, token } = await pack(ctx);
  assert.equal(reverted, false, "pack reverted");

  assert.equal(await ctx.read(token, tokenArtifact.abi, "name"), NAME);
  assert.equal(await ctx.read(token, tokenArtifact.abi, "symbol"), SYMBOL);
  assert.equal(await ctx.read(token, tokenArtifact.abi, "totalSupply"), SUPPLY);

  // The supply is in the pool manager. What did not divide evenly into liquidity
  // is still in the seal, which is just as shut — and it is dust, not a stash.
  const inPool = await ctx.read(token, tokenArtifact.abi, "balanceOf", [ctx.manager]);
  const inSeal = await ctx.read(token, tokenArtifact.abi, "balanceOf", [ctx.seal]);
  assert.equal(inPool + inSeal, SUPPLY, "some of the supply went somewhere else");
  assert.ok(inSeal < 10n ** 18n, `the seal kept ${inSeal} wei of supply, which is not dust`);

  // Nobody else holds any, least of all the two addresses that could have.
  assert.equal(await ctx.read(token, tokenArtifact.abi, "balanceOf", [ctx.packer]), 0n);
  assert.equal(await ctx.read(token, tokenArtifact.abi, "balanceOf", [address(PACKER)]), 0n);

  assert.equal(await ctx.read(ctx.seal, sealArtifact.abi, "isSealed"), true);
  assert.ok((await ctx.read(ctx.seal, sealArtifact.abi, "sealedLiquidity")) > 0n, "the position is empty");

  const [token_, , seal_, tickLower_, tickUpper_, , supply_] = await ctx.read(
    ctx.packer,
    packerArtifact.abi,
    "crate",
  );
  assert.equal(token_, token);
  assert.equal(seal_, ctx.seal);
  assert.equal(tickLower_, RANGE.tickLower);
  assert.equal(tickUpper_, RANGE.tickUpper);
  assert.equal(supply_, SUPPLY);

  // The pool is against native ETH, with no hook and no WETH anywhere.
  const key = await ctx.read(ctx.packer, packerArtifact.abi, "poolKey");
  assert.equal(key.currency0, NATIVE);
  assert.equal(key.currency1, token);
  assert.equal(key.hooks, NATIVE);
  assert.equal(key.fee, FEE);

  // And the seal put in no ETH, because it never had any.
  assert.equal(await ctx.balanceOf(ctx.seal), 0n);
  assert.equal(await ctx.balanceOf(ctx.manager), 0n);
});

test("the crate is packed once and only by the packer", async () => {
  const ctx = await venue();

  const byStranger = await pack(ctx, PACK_PARAMS, STRANGER);
  assert.equal(byStranger.reverted, true, "a stranger must not be able to pack the crate");
  assert.equal(await ctx.read(ctx.packer, packerArtifact.abi, "packed"), false);

  const first = await pack(ctx);
  assert.equal(first.reverted, false);
  assert.equal(await ctx.read(ctx.packer, packerArtifact.abi, "packed"), true);

  const again = await pack(ctx);
  assert.equal(again.reverted, true, "the crate must not be packable twice");
  assert.equal(await ctx.read(ctx.packer, packerArtifact.abi, "token"), first.token);
});

test("a range reaching above spot is rejected, so the seal is never asked for ETH", async () => {
  const ctx = await venue();

  // Spot starts at tickUpper. Anything above it needs ETH the seal has not got.
  const tooHigh = await pack(ctx, { ...PACK_PARAMS, tickUpper: RANGE.tickUpper + TICK_SPACING });
  assert.equal(tooHigh.reverted, true, "a range above spot must revert");
  assert.equal(await ctx.read(ctx.packer, packerArtifact.abi, "packed"), false);

  // A failed attempt leaves the crate packable, so a bad range is a retry rather
  // than a dead packer.
  assert.equal((await pack(ctx)).reverted, false);
});

test("the range and the fee have to be ones the pool can actually take", async () => {
  const ctx = await venue();

  const cases = {
    "ticks off the spacing grid": { ...PACK_PARAMS, tickLower: RANGE.tickLower + 1 },
    "an upside-down range": { ...PACK_PARAMS, tickLower: RANGE.tickUpper, tickUpper: RANGE.tickLower },
    "a zero tick spacing": { ...PACK_PARAMS, tickSpacing: 0 },
    "a fee above the cap": { ...PACK_PARAMS, fee: 1_000_001 },
    // 0x800000 asks the pool to get its fee from a hook, and this pool has none.
    "a dynamic fee with no hook": { ...PACK_PARAMS, fee: 0x800000 },
  };

  for (const [what, params] of Object.entries(cases)) {
    assert.equal((await pack(ctx, params)).reverted, true, `${what} must revert`);
  }

  assert.equal(await ctx.read(ctx.packer, packerArtifact.abi, "packed"), false);
});

test("buying walks the price down into the range and hands out real supply", async () => {
  const ctx = await venue();
  const { token } = await pack(ctx);
  const key = await ctx.read(ctx.packer, packerArtifact.abi, "poolKey");

  const bought = await buy(ctx, key, 10n ** 17n); // 0.1 ETH
  assert.equal(bought.reverted, false, "the buy reverted");

  const gotCrate = await ctx.read(token, tokenArtifact.abi, "balanceOf", [address(TRADER)]);
  assert.ok(gotCrate > 0n, "the buyer got nothing");
  assert.ok(gotCrate < SUPPLY, "the buyer got everything");

  // The ETH went into the pool manager and stayed there.
  assert.ok((await ctx.balanceOf(ctx.manager)) > 0n, "the pool manager holds no ETH");
  assert.equal(await ctx.balanceOf(ctx.seal), 0n, "the seal should not be paid, ever");
});

test("trading fees are paid to the treasury, and the liquidity is not touched", async () => {
  const ctx = await venue();
  const { token } = await pack(ctx);
  const key = await ctx.read(ctx.packer, packerArtifact.abi, "poolKey");

  // Trade both ways, so a fee accrues on each side of the pool.
  assert.equal((await buy(ctx, key, 10n ** 17n)).reverted, false);
  const bought = await ctx.read(token, tokenArtifact.abi, "balanceOf", [address(TRADER)]);
  assert.equal((await sell(ctx, key, token, bought / 2n)).reverted, false);

  const liquidityBefore = await ctx.read(ctx.seal, sealArtifact.abi, "sealedLiquidity");
  const treasuryEthBefore = await ctx.balanceOf(address(TREASURY));
  // The seal is holding the dust left from packing, and that is not a fee.
  const sealCrateBefore = await ctx.read(token, tokenArtifact.abi, "balanceOf", [ctx.seal]);

  // Permissionless, because permission would change nothing: the destination is
  // immutable, so a stranger calling it still pays the treasury.
  const collected = await ctx.call(ctx.seal, sealArtifact.abi, "collectFees", [], { caller: STRANGER });
  assert.equal(collected.reverted, false, "collectFees reverted");

  const treasuryEth = (await ctx.balanceOf(address(TREASURY))) - treasuryEthBefore;
  const treasuryCrate = await ctx.read(token, tokenArtifact.abi, "balanceOf", [address(TREASURY)]);
  assert.ok(treasuryEth > 0n, "the treasury got no ETH fee");
  assert.ok(treasuryCrate > 0n, "the treasury got no CRATE fee");

  // A 1% pool on a 0.1 ETH buy is a 0.001 ETH fee. Within rounding, that is what
  // arrived — the treasury earns the fee, not the money people paid for supply.
  assert.ok(treasuryEth <= 10n ** 15n, `the treasury took ${treasuryEth} wei, more than the fee on the trade`);

  // The caller is out of pocket by the gas and up by nothing.
  assert.equal(await ctx.read(token, tokenArtifact.abi, "balanceOf", [address(STRANGER)]), 0n);

  // Fees are a separate ledger: paying them out leaves the position alone.
  assert.equal(await ctx.read(ctx.seal, sealArtifact.abi, "sealedLiquidity"), liquidityBefore);

  // And they never pass through the seal on the way: it holds exactly what it
  // held before, which is the packing dust and nothing else.
  assert.equal(await ctx.balanceOf(ctx.seal), 0n, "ETH fees went through the seal");
  assert.equal(
    await ctx.read(token, tokenArtifact.abi, "balanceOf", [ctx.seal]),
    sealCrateBefore,
    "CRATE fees went through the seal",
  );

  // Nothing new earned, nothing to collect.
  const again = await ctx.call(ctx.seal, sealArtifact.abi, "collectFees", [], { caller: STRANGER });
  assert.equal(again.reverted, true, "collecting twice over should find nothing");
});

test("compound pays the fees out first, so none is swallowed into the position", async () => {
  const ctx = await venue();
  const { token } = await pack(ctx);
  const key = await ctx.read(ctx.packer, packerArtifact.abi, "poolKey");

  assert.equal((await buy(ctx, key, 10n ** 17n)).reverted, false);
  const bought = await ctx.read(token, tokenArtifact.abi, "balanceOf", [address(TRADER)]);
  assert.equal((await sell(ctx, key, token, bought / 2n)).reverted, false);

  // Somebody sends the crate a gift. That is not a fee, and it can only go one
  // way: into the position.
  const gift = 10n ** 16n;
  assert.equal((await ctx.send(ctx.seal, gift)).reverted, false, "the seal would not take ETH");
  const giftCrate = bought / 4n;
  assert.equal(
    (await ctx.call(token, tokenArtifact.abi, "transfer", [ctx.seal, giftCrate], { caller: TRADER })).reverted,
    false,
  );

  const liquidityBefore = await ctx.read(ctx.seal, sealArtifact.abi, "sealedLiquidity");
  const treasuryEthBefore = await ctx.balanceOf(address(TREASURY));

  const compounded = await ctx.call(ctx.seal, sealArtifact.abi, "compound", [], { caller: STRANGER });
  assert.equal(compounded.reverted, false, "compound reverted");

  // In v4 every modifyLiquidity settles the position's fees into the caller's
  // delta, so an add could quietly absorb them. It did not: they were paid out
  // in the same transaction.
  assert.ok((await ctx.balanceOf(address(TREASURY))) > treasuryEthBefore, "the fee was swallowed by the add");
  assert.ok((await ctx.read(token, tokenArtifact.abi, "balanceOf", [address(TREASURY)])) > 0n);

  // And the gift is now liquidity nobody can withdraw.
  assert.ok((await ctx.read(ctx.seal, sealArtifact.abi, "sealedLiquidity")) > liquidityBefore, "the gift did not go in");
});

test("the treasury is fixed at deployment and cannot be pointed anywhere else", async () => {
  const ctx = await venue();
  await pack(ctx);

  assert.equal(await ctx.read(ctx.seal, sealArtifact.abi, "feeBeneficiary"), address(TREASURY));

  // No setter, under any spelling.
  const setters = sealArtifact.abi
    .filter((f) => f.type === "function")
    .map((f) => f.name)
    .filter((name) => /^set|beneficiary/i.test(name) && name !== "feeBeneficiary");
  assert.deepEqual(setters, [], "the beneficiary can be moved");

  // Being the beneficiary buys nothing beyond the fees: the liquidity is as far
  // out of its reach as anyone else's.
  const liquidity = await ctx.read(ctx.seal, sealArtifact.abi, "sealedLiquidity");
  for (const caller of [TREASURY, PACKER, STRANGER]) {
    assert.equal((await ctx.call(ctx.seal, sealArtifact.abi, "sealIn", [
      await ctx.read(ctx.packer, packerArtifact.abi, "poolKey"),
      RANGE.tickLower,
      RANGE.tickUpper,
    ], { caller })).reverted, true);
  }
  assert.equal(await ctx.read(ctx.seal, sealArtifact.abi, "sealedLiquidity"), liquidity);
});

test("a pool somebody else opened first is used at the price it already has", async () => {
  const ctx = await venue();

  // The token is deployed by the packer, so its address is predictable — and a
  // pool can be initialised for a token that does not exist yet.
  const token = getContractAddress({ from: ctx.packer, nonce: 2n });
  const key = { currency0: NATIVE, currency1: token, fee: FEE, tickSpacing: TICK_SPACING, hooks: NATIVE };

  const theirTick = RANGE.tickUpper - 10 * TICK_SPACING;
  const jumped = await ctx.call(ctx.manager, managerArtifact.abi, "initialize", [key, getSqrtPriceAtTick(theirTick)], {
    caller: STRANGER,
  });
  assert.equal(jumped.reverted, false, "the front-runner could not open the pool");

  // Our range now reaches above their price, which would need ETH the seal has
  // not got. It is refused rather than half-launched.
  assert.equal((await pack(ctx)).reverted, true, "a range above their price must revert");

  // Recomputed to sit under their price it packs — and into their pool, at their
  // price. The proof is that it works at all: initialising twice would revert,
  // and a range ending at their tick would fail the check against ours.
  const underneath = { ...PACK_PARAMS, tickUpper: theirTick, sqrtPriceX96: getSqrtPriceAtTick(0) };
  const packed = await pack(ctx, underneath);
  assert.equal(packed.reverted, false, "packing into the existing pool reverted");
  assert.equal(packed.token, token, "the token did not land where it was predicted to");
  assert.ok((await ctx.read(ctx.seal, sealArtifact.abi, "sealedLiquidity")) > 0n);
});

test("the reader computes the same pool id and price the manager has", async () => {
  const ctx = await venue();
  const { token } = await pack(ctx);

  const key = cratePoolKey({ token, fee: FEE, tickSpacing: TICK_SPACING });
  const id = poolId(key);

  // What lib/pool.mjs derives off-chain against what the packer derived on it.
  const [, onChainId] = await ctx.read(ctx.packer, packerArtifact.abi, "crate");
  assert.equal(id, onChainId, "the off-chain pool id does not match the contract's");

  // And the same for the price, read out of the manager's storage the way a
  // script with only an RPC has to read it.
  const word = await ctx.read(ctx.manager, managerArtifact.abi, "extsload", [poolStateSlot(id)]);
  const slot0 = decodeSlot0(word);
  assert.equal(slot0.initialized, true);
  assert.equal(slot0.sqrtPriceX96, RANGE.sqrtPriceX96);
  assert.equal(slot0.tick, RANGE.tickUpper, "the pool should start at the top of the range");
  assert.equal(slot0.lpFee, FEE);

  // A pool that was never opened reads as uninitialised rather than as zero-priced.
  const otherKey = cratePoolKey({ token, fee: 3000, tickSpacing: 60 });
  const empty = decodeSlot0(await ctx.read(ctx.manager, managerArtifact.abi, "extsload", [poolStateSlot(poolId(otherKey))]));
  assert.equal(empty.initialized, false);
});

test("the seal takes its position once, from the packer, and from nobody else", async () => {
  const ctx = await venue();
  const key = await ctx.read(ctx.packer, packerArtifact.abi, "poolKey");

  // Before packing: not even a well-formed call gets in, because it is not the packer.
  const early = await ctx.call(ctx.seal, sealArtifact.abi, "sealIn", [key, RANGE.tickLower, RANGE.tickUpper], {
    caller: STRANGER,
  });
  assert.equal(early.reverted, true, "a stranger must not be able to fill the crate");

  await pack(ctx);

  const packed = await ctx.read(ctx.packer, packerArtifact.abi, "poolKey");
  for (const caller of [STRANGER, PACKER]) {
    const again = await ctx.call(ctx.seal, sealArtifact.abi, "sealIn", [packed, RANGE.tickLower, RANGE.tickUpper], {
      caller,
    });
    assert.equal(again.reverted, true, "the crate must not be fillable twice");
  }
});

test("only the pool manager can drive the seal's callback", async () => {
  const ctx = await venue();
  await pack(ctx);

  for (const caller of [STRANGER, PACKER]) {
    const forged = await ctx.call(ctx.seal, sealArtifact.abi, "unlockCallback", ["0x00"], { caller });
    assert.equal(forged.reverted, true, "the callback answered someone who is not the pool manager");
  }
});

test("the liquidity has no way out, and the packer has no way back in", () => {
  const sealFunctions = sealArtifact.abi.filter((f) => f.type === "function").map((f) => f.name);

  // `collectFees` is the one function that pays anything outward, and it pays a
  // fixed address. Everything on this list would be a second one.
  const escapes = sealFunctions.filter((name) =>
    /remove|decrease|withdraw|rescue|sweep|recover|transfer|approve|burn|renounce|owner|donate|modify|unwind|exit|claim/i
      .test(name),
  );
  assert.deepEqual(escapes, [], "a second way out appeared on the seal");

  // Which leaves exactly the surface the design describes, and nothing else.
  assert.deepEqual(sealFunctions.filter((n) => /fee/i.test(n)).sort(), ["collectFees", "feeBeneficiary"]);

  // In v4 a position is not a token, so there is nothing to receive or send on.
  assert.equal(JSON.stringify(sealArtifact.abi).match(/721|6909/i), null, "a transferable position appeared");

  // The packer keeps no lever over the token or the pool after packing.
  const packerFunctions = packerArtifact.abi.filter((f) => f.type === "function").map((f) => f.name);
  const levers = packerFunctions.filter((name) =>
    /mint|withdraw|rescue|sweep|recover|setFee|owner|renounce|upgrade/i.test(name),
  );
  assert.deepEqual(levers, [], "a lever appeared on the packer");
});

test("the router buys and sells, and keeps nothing on the way through", async () => {
  const ctx = await venue();
  const { token } = await pack(ctx);

  const router = await ctx.deploy(crateRouterArtifact, "address", [ctx.packer]);

  // It knows exactly one pool, read off the packer rather than passed in.
  assert.equal(await ctx.read(router, crateRouterArtifact.abi, "token"), token);
  assert.equal(await ctx.read(router, crateRouterArtifact.abi, "fee"), FEE);
  assert.equal(await ctx.read(router, crateRouterArtifact.abi, "poolManager"), ctx.manager);

  const ethIn = 10n ** 17n;
  const bought = await ctx.call(router, crateRouterArtifact.abi, "buy", [0n, MAX_DEADLINE], {
    caller: TRADER,
    value: ethIn,
  });
  assert.equal(bought.reverted, false, "buy reverted");

  const held = await ctx.read(token, tokenArtifact.abi, "balanceOf", [address(TRADER)]);
  assert.ok(held > 0n, "the buyer got no CRATE");

  // Nothing sticks to the router.
  assert.equal(await ctx.balanceOf(router), 0n, "the router kept ETH");
  assert.equal(await ctx.read(token, tokenArtifact.abi, "balanceOf", [router]), 0n, "the router kept CRATE");

  // And back the other way, which needs an allowance rather than a permit.
  const sellAmount = held / 2n;
  assert.equal(
    (await ctx.call(token, tokenArtifact.abi, "approve", [router, sellAmount], { caller: TRADER })).reverted,
    false,
  );

  const ethBefore = await ctx.balanceOf(address(TRADER));
  const sold = await ctx.call(router, crateRouterArtifact.abi, "sell", [sellAmount, 0n, MAX_DEADLINE], {
    caller: TRADER,
  });
  assert.equal(sold.reverted, false, "sell reverted");
  assert.ok((await ctx.balanceOf(address(TRADER))) > ethBefore, "the seller got no ETH back");

  assert.equal(await ctx.balanceOf(router), 0n);
  assert.equal(await ctx.read(token, tokenArtifact.abi, "balanceOf", [router]), 0n);
});

test("the router refuses a fill worse than asked for, or later than asked for", async () => {
  const ctx = await venue();
  const { token } = await pack(ctx);
  const router = await ctx.deploy(crateRouterArtifact, "address", [ctx.packer]);

  // Slippage: demand more CRATE than 0.1 ETH can possibly buy.
  const greedy = await ctx.call(router, crateRouterArtifact.abi, "buy", [SUPPLY, MAX_DEADLINE], {
    caller: TRADER,
    value: 10n ** 17n,
  });
  assert.equal(greedy.reverted, true, "an impossible minimum should revert");
  assert.equal(await ctx.read(token, tokenArtifact.abi, "balanceOf", [address(TRADER)]), 0n);

  // Deadline: the same trade, at a time after it expires.
  const late = await ctx.call(router, crateRouterArtifact.abi, "buy", [0n, 1_000n], {
    caller: TRADER,
    value: 10n ** 17n,
    timestamp: 2_000n,
  });
  assert.equal(late.reverted, true, "a stale deadline should revert");

  // The same call inside the deadline goes through, so it is the clock that
  // stopped it and not something else.
  const intime = await ctx.call(router, crateRouterArtifact.abi, "buy", [0n, 5_000n], {
    caller: TRADER,
    value: 10n ** 17n,
    timestamp: 2_000n,
  });
  assert.equal(intime.reverted, false, "a live deadline should not revert");

  // And an empty trade is not a trade.
  assert.equal((await ctx.call(router, crateRouterArtifact.abi, "buy", [0n, MAX_DEADLINE], { caller: TRADER })).reverted, true);
  assert.equal(
    (await ctx.call(router, crateRouterArtifact.abi, "sell", [0n, 0n, MAX_DEADLINE], { caller: TRADER })).reverted,
    true,
  );
});

test("ETH the pool could not take comes back to the buyer", async () => {
  const ctx = await venue();
  const { token } = await pack(ctx);
  const router = await ctx.deploy(crateRouterArtifact, "address", [ctx.packer]);

  // Far more than the whole supply is worth, so the swap stops at the end of the
  // range with most of it unspent.
  const absurd = 500n * 10n ** 18n;
  const before = await ctx.balanceOf(address(TRADER));
  const bought = await ctx.call(router, crateRouterArtifact.abi, "buy", [0n, MAX_DEADLINE], {
    caller: TRADER,
    value: absurd,
  });
  assert.equal(bought.reverted, false);

  const spent = before - (await ctx.balanceOf(address(TRADER)));
  assert.ok(spent < absurd / 10n, `the buyer was charged ${spent} of ${absurd} — change was not returned`);
  assert.equal(await ctx.balanceOf(router), 0n, "the change stayed in the router");

  // They did get the supply they paid for.
  const held = await ctx.read(token, tokenArtifact.abi, "balanceOf", [address(TRADER)]);
  assert.ok(held > (SUPPLY * 9n) / 10n, "an absurd buy should clear nearly the whole range");
});

test("the router cannot be aimed anywhere else, and answers only the manager", async () => {
  const ctx = await venue();

  // Before the crate is packed there is no pool to point at, so there is no
  // router either.
  const early = await ctx.evm.runCall({
    caller: PACKER,
    to: undefined,
    gasLimit: GAS,
    data: hexToBytes(
      concatHex([
        `0x${crateRouterArtifact.evm.bytecode.object}`,
        encodeAbiParameters(parseAbiParameters("address"), [ctx.packer]),
      ]),
    ),
  });
  assert.notEqual(early.execResult.exceptionError, undefined, "a router for an unpacked crate should not deploy");

  await pack(ctx);
  const router = await ctx.deploy(crateRouterArtifact, "address", [ctx.packer]);

  // The pool is read from the packer every time, so there is nothing to set.
  const setters = crateRouterArtifact.abi
    .filter((f) => f.type === "function")
    .map((f) => f.name)
    .filter((name) => /^set|owner|withdraw|rescue|sweep|recover|pause|upgrade/i.test(name));
  assert.deepEqual(setters, [], "a lever appeared on the router");

  for (const caller of [STRANGER, TRADER]) {
    const forged = await ctx.call(router, crateRouterArtifact.abi, "unlockCallback", ["0x00"], { caller });
    assert.equal(forged.reverted, true, "the callback answered someone who is not the pool manager");
  }
});

test("trading through the router still pays the treasury", async () => {
  const ctx = await venue();
  const { token } = await pack(ctx);
  const router = await ctx.deploy(crateRouterArtifact, "address", [ctx.packer]);

  await ctx.call(router, crateRouterArtifact.abi, "buy", [0n, MAX_DEADLINE], { caller: TRADER, value: 10n ** 17n });
  const held = await ctx.read(token, tokenArtifact.abi, "balanceOf", [address(TRADER)]);
  await ctx.call(token, tokenArtifact.abi, "approve", [router, held / 2n], { caller: TRADER });
  await ctx.call(router, crateRouterArtifact.abi, "sell", [held / 2n, 0n, MAX_DEADLINE], { caller: TRADER });

  const before = await ctx.balanceOf(address(TREASURY));
  assert.equal((await ctx.call(ctx.seal, sealArtifact.abi, "collectFees", [], { caller: STRANGER })).reverted, false);

  assert.ok((await ctx.balanceOf(address(TREASURY))) > before, "no ETH fee reached the treasury");
  assert.ok((await ctx.read(token, tokenArtifact.abi, "balanceOf", [address(TREASURY)])) > 0n, "no CRATE fee reached it");
});

test("CrateToken mints its supply once and can only ever shrink", async () => {
  const ctx = await fresh();

  const holder = address(PACKER);
  const token = await ctx.deploy(tokenArtifact, "string, string, uint256, address", [NAME, SYMBOL, SUPPLY, holder]);

  assert.equal(await ctx.read(token, tokenArtifact.abi, "totalSupply"), SUPPLY);
  assert.equal(await ctx.read(token, tokenArtifact.abi, "balanceOf", [holder]), SUPPLY);

  // There is no mint entrypoint at all.
  assert.equal(tokenArtifact.abi.some((f) => f.type === "function" && f.name === "mint"), false);

  // Burning spends the caller's own balance and nobody else's.
  assert.equal((await ctx.call(token, tokenArtifact.abi, "burn", [1n], { caller: STRANGER })).reverted, true);
  assert.equal((await ctx.call(token, tokenArtifact.abi, "burn", [SUPPLY / 2n])).reverted, false);
  assert.equal(await ctx.read(token, tokenArtifact.abi, "totalSupply"), SUPPLY / 2n);
});

test("the packer refuses a venue or a treasury that is not there", async () => {
  const ctx = await fresh();
  const manager = await ctx.deploy(managerArtifact, "address", [address(PACKER)]);

  // A zero treasury would burn every fee the crate ever earns, so it is refused
  // at the same door as a zero pool manager.
  for (const args of [
    ["0x0000000000000000000000000000000000000000", address(TREASURY)],
    [manager, "0x0000000000000000000000000000000000000000"],
  ]) {
    const data = concatHex([
      `0x${packerArtifact.evm.bytecode.object}`,
      encodeAbiParameters(parseAbiParameters("address, address"), args),
    ]);
    const result = await ctx.evm.runCall({ caller: PACKER, to: undefined, data: hexToBytes(data), gasLimit: GAS });
    assert.notEqual(result.execResult.exceptionError, undefined, `${JSON.stringify(args)} should revert the deploy`);
  }
});
