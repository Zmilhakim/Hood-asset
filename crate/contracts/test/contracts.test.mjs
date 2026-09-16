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

const SUPPLY = 1_000_000_000n * 10n ** 18n;
const NAME = "Crate";
const SYMBOL = "CRATE";
const FEE = 10_000; // 1%
const TICK_SPACING = 200;
const GAS = 200_000_000n;

const MIN_SQRT_PRICE = 4295128739n;
const MAX_SQRT_PRICE = 1461446703485210103287273052203988822378723970342n;
const NATIVE = "0x0000000000000000000000000000000000000000";

const PACKER = new Address(hexToBytes("0x00000000000000000000000000000000000000f0"));
const STRANGER = new Address(hexToBytes("0x00000000000000000000000000000000000000f1"));
const TRADER = new Address(hexToBytes("0x00000000000000000000000000000000000000f2"));

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

  for (const account of [PACKER, STRANGER, TRADER]) {
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

  const call = async (to, abi, functionName, args = [], { caller = PACKER, value = 0n } = {}) => {
    const result = await evm.runCall({
      caller,
      to: new Address(hexToBytes(to)),
      data: hexToBytes(encodeFunctionData({ abi, functionName, args })),
      gasLimit: GAS,
      value,
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

  return { evm, deploy, call, read, balanceOf };
}

/** A pool manager, an unpacked crate, and something that can trade against it. */
async function venue() {
  const ctx = await fresh();

  const manager = await ctx.deploy(managerArtifact, "address", [address(PACKER)]);
  const packer = await ctx.deploy(packerArtifact, "address", [manager]);
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

test("fees earned by the crate go back into the crate, and nowhere else", async () => {
  const ctx = await venue();
  const { token } = await pack(ctx);
  const key = await ctx.read(ctx.packer, packerArtifact.abi, "poolKey");

  // Trade both ways, so a fee accrues on each side of the pool.
  assert.equal((await buy(ctx, key, 10n ** 17n)).reverted, false);
  const bought = await ctx.read(token, tokenArtifact.abi, "balanceOf", [address(TRADER)]);
  assert.equal((await sell(ctx, key, token, bought / 2n)).reverted, false);

  const before = await ctx.read(ctx.seal, sealArtifact.abi, "sealedLiquidity");

  // Permissionless: a stranger pays the gas and gets nothing for it.
  const strangerEthBefore = await ctx.balanceOf(address(STRANGER));
  const compounded = await ctx.call(ctx.seal, sealArtifact.abi, "compound", [], { caller: STRANGER });
  assert.equal(compounded.reverted, false, "compound reverted");

  const after = await ctx.read(ctx.seal, sealArtifact.abi, "sealedLiquidity");
  assert.ok(after > before, `liquidity did not grow: ${before} -> ${after}`);

  // The caller is out of pocket by the gas and up by nothing.
  assert.ok((await ctx.balanceOf(address(STRANGER))) <= strangerEthBefore);
  assert.equal(await ctx.read(token, tokenArtifact.abi, "balanceOf", [address(STRANGER)]), 0n);

  // Here the ETH side earned far more than the CRATE side, and a position in
  // range can only take the two together. So most of the ETH fee could not be
  // paired, and it is still in the seal — which is the only place it can be.
  assert.ok((await ctx.balanceOf(ctx.seal)) > 0n, "the unpaired fee left the seal");

  // With nothing new earned, there is nothing to do.
  const again = await ctx.call(ctx.seal, sealArtifact.abi, "compound", [], { caller: STRANGER });
  assert.equal(again.reverted, true, "compounding twice over should find nothing to add");
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

test("the seal has no way out, and the packer has no way back in", () => {
  const sealFunctions = sealArtifact.abi.filter((f) => f.type === "function").map((f) => f.name);

  const escapes = sealFunctions.filter((name) =>
    /remove|decrease|withdraw|rescue|sweep|recover|transfer|approve|burn|renounce|owner|donate|modify/i.test(name),
  );
  assert.deepEqual(escapes, [], "an exit appeared on the seal");

  // In v4 a position is not a token, so there is nothing to receive or send on.
  assert.equal(JSON.stringify(sealArtifact.abi).match(/721|6909/i), null, "a transferable position appeared");

  // The packer keeps no lever over the token or the pool after packing.
  const packerFunctions = packerArtifact.abi.filter((f) => f.type === "function").map((f) => f.name);
  const levers = packerFunctions.filter((name) =>
    /mint|withdraw|rescue|sweep|recover|setFee|owner|renounce|upgrade/i.test(name),
  );
  assert.deepEqual(levers, [], "a lever appeared on the packer");
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

test("the packer refuses a pool manager that is not there", async () => {
  const ctx = await fresh();

  const data = concatHex([
    `0x${packerArtifact.evm.bytecode.object}`,
    encodeAbiParameters(parseAbiParameters("address"), ["0x0000000000000000000000000000000000000000"]),
  ]);
  const result = await ctx.evm.runCall({ caller: PACKER, to: undefined, data: hexToBytes(data), gasLimit: GAS });
  assert.notEqual(result.execResult.exceptionError, undefined, "a zero pool manager should revert the deploy");
});
