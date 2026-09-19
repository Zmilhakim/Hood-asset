// Runs the compiled contracts on a local EVM against Uniswap's own PoolManager,
// deployed as it ships. A token is really launched, really bought and sold, and
// the cut it charges is really collected — the flash accounting, the tick
// crossing and the ERC-6909 claims are Uniswap's, not a model of them.
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
  parseAbiParameters,
} from "viem";

import { flagsOf, hasFlags, hookInitCode, mineHookSalt, predictFactory, CUT_HOOK_FLAGS } from "../lib/hooks.mjs";
import { poolId } from "../lib/pool.mjs";
import { launchRange } from "../lib/ticks.mjs";

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "out");
const artifact = (name) => JSON.parse(readFileSync(join(out, `${name}.json`), "utf8"));

const factoryArtifact = artifact("CutpadFactory");
const hookArtifact = artifact("CutHook");
const lockerArtifact = artifact("CutLocker");
const tokenArtifact = artifact("CutToken");
const managerArtifact = artifact("TestPoolManager");
const routerArtifact = artifact("TestSwapRouter");

const SUPPLY = 1_000_000_000n * 10n ** 18n;
const NAME = "Cut Test";
const SYMBOL = "TTEST";
const TICK_SPACING = 200;
const GAS = 400_000_000n;
const ETH = 10n ** 18n;

const MIN_SQRT_PRICE = 4295128739n;
const MAX_SQRT_PRICE = 1461446703485210103287273052203988822378723970342n;
const NATIVE = "0x0000000000000000000000000000000000000000";

const OWNER = new Address(hexToBytes("0x00000000000000000000000000000000000000f0"));
const DEPLOYER = new Address(hexToBytes("0x00000000000000000000000000000000000000f1"));
const CREATOR = new Address(hexToBytes("0x00000000000000000000000000000000000000f2"));
const TRADER = new Address(hexToBytes("0x00000000000000000000000000000000000000f3"));
const TREASURY = new Address(hexToBytes("0x00000000000000000000000000000000000000f4"));
const STRANGER = new Address(hexToBytes("0x00000000000000000000000000000000000000f5"));

const address = (account) => getAddress(account.toString());

/** The launch these tests use: the whole supply worth 1 ETH at the floor, 100 at the ceiling. */
const RANGE = launchRange({
  floorEthPerToken: { num: 1n, den: 1_000_000_000n },
  ceilEthPerToken: { num: 100n, den: 1_000_000_000n },
  tickSpacing: TICK_SPACING,
});

const LAUNCH_PARAMS = {
  name: NAME,
  symbol: SYMBOL,
  imageURI: "ipfs://picture",
  blurb: "a token for the tests",
  link: "https://example.invalid",
  tickSpacing: TICK_SPACING,
  sqrtPriceX96: RANGE.sqrtPriceX96,
  tickLower: RANGE.tickLower,
  tickUpper: RANGE.tickUpper,
};

async function fresh() {
  // Cancun or later: the pool manager keeps its lock and its deltas in transient
  // storage, so anything older cannot run it at all.
  const evm = await createEVM({ common: new Common({ chain: Mainnet, hardfork: Hardfork.Cancun }) });

  for (const account of [OWNER, DEPLOYER, CREATOR, TRADER, TREASURY, STRANGER]) {
    await evm.stateManager.putAccount(account, createAccount({ nonce: 0n, balance: 10_000n * ETH }));
  }

  const deploy = async (art, types, args, caller = OWNER) => {
    const data = types
      ? concatHex([`0x${art.evm.bytecode.object}`, encodeAbiParameters(parseAbiParameters(types), args)])
      : `0x${art.evm.bytecode.object}`;
    const result = await evm.runCall({ caller, to: undefined, data: hexToBytes(data), gasLimit: GAS });
    assert.equal(result.execResult.exceptionError, undefined, "deployment reverted");
    return getAddress(result.createdAddress.toString());
  };

  const call = async (to, abi, functionName, args = [], { caller = OWNER, value = 0n } = {}) => {
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

/**
 * A pool manager, a factory whose hook landed on a flagged address, and
 * something that can trade.
 *
 * The salt is mined here rather than hard-coded, because the hook's address
 * depends on the factory's, which depends on who deploys it. Mining it in the
 * test is the same work `npm run deploy` does, against the same library.
 */
async function venue() {
  const ctx = await fresh();

  const manager = await ctx.deploy(managerArtifact, "address", [address(OWNER)], OWNER);

  // DEPLOYER has sent nothing yet, so the factory lands at its nonce-zero address.
  const predicted = predictFactory({ deployer: address(DEPLOYER), nonce: 0 });
  const mined = mineHookSalt({
    deployer: predicted,
    initCode: hookInitCode({
      creationCode: hookArtifact.evm.bytecode.object,
      poolManager: manager,
      treasury: address(TREASURY),
    }),
  });

  const factory = await ctx.deploy(
    factoryArtifact,
    "address, address, bytes32",
    [manager, address(TREASURY), mined.salt],
    DEPLOYER,
  );
  assert.equal(factory, predicted, "the factory did not land where the salt was mined against");

  const hook = await ctx.read(factory, factoryArtifact.abi, "hook");
  const locker = await ctx.read(factory, factoryArtifact.abi, "locker");
  const router = await ctx.deploy(routerArtifact, "address", [manager], OWNER);

  return { ...ctx, manager, factory, hook, locker, router, salt: mined.salt };
}

async function launch(ctx, params = LAUNCH_PARAMS, caller = CREATOR) {
  const result = await ctx.call(ctx.factory, factoryArtifact.abi, "launch", [params], { caller });
  if (result.reverted) return { reverted: true };

  const id = (await ctx.read(ctx.factory, factoryArtifact.abi, "noticeCount")) - 1n;
  const notice = await ctx.read(ctx.factory, factoryArtifact.abi, "noticeAt", [id]);
  const key = await ctx.read(ctx.factory, factoryArtifact.abi, "poolKeyOf", [id]);

  return { reverted: false, id, notice, token: notice.token, key, poolId: poolId(key) };
}

/** Buy the token with ETH: currency0 in, currency1 out, which walks the price down. */
const buy = (ctx, key, ethIn, caller = TRADER) =>
  ctx.call(
    ctx.router,
    routerArtifact.abi,
    "swap",
    [key, { zeroForOne: true, amountSpecified: -ethIn, sqrtPriceLimitX96: MIN_SQRT_PRICE + 1n }],
    { caller, value: ethIn },
  );

/** Buy an exact number of tokens, paying whatever it costs. */
const buyExactOut = (ctx, key, tokensOut, budget, caller = TRADER) =>
  ctx.call(
    ctx.router,
    routerArtifact.abi,
    "swap",
    [key, { zeroForOne: true, amountSpecified: tokensOut, sqrtPriceLimitX96: MIN_SQRT_PRICE + 1n }],
    { caller, value: budget },
  );

/** Sell the token back for ETH, which is how the other side of the cut is earned. */
async function sell(ctx, key, token, tokensIn, caller = TRADER) {
  const approved = await ctx.call(token, tokenArtifact.abi, "approve", [ctx.router, tokensIn], { caller });
  assert.equal(approved.reverted, false, "approve reverted");

  return ctx.call(
    ctx.router,
    routerArtifact.abi,
    "swap",
    [key, { zeroForOne: false, amountSpecified: -tokensIn, sqrtPriceLimitX96: MAX_SQRT_PRICE - 1n }],
    { caller },
  );
}

const owed = (ctx, who, currency) => ctx.read(ctx.hook, hookArtifact.abi, "owed", [who, currency]);
const claims = (ctx, currency) =>
  ctx.read(ctx.manager, managerArtifact.abi, "balanceOf", [ctx.hook, BigInt(currency)]);

// ---------------------------------------------------------------- the launch

test("the hook only works because its address carries the flags", async () => {
  const ctx = await venue();

  assert.ok(hasFlags(ctx.hook), `${ctx.hook} does not carry the flags: ${flagsOf(ctx.hook).join(", ")}`);
  assert.equal(await ctx.read(ctx.hook, hookArtifact.abi, "hookFlags"), CUT_HOOK_FLAGS);
  assert.deepEqual(flagsOf(ctx.hook).sort(), [
    "AFTER_SWAP",
    "AFTER_SWAP_RETURNS_DELTA",
    "BEFORE_INITIALIZE",
    "BEFORE_SWAP",
    "BEFORE_SWAP_RETURNS_DELTA",
  ]);

  // The factory deployed it, and the hook took that as its one privileged caller.
  assert.equal(await ctx.read(ctx.hook, hookArtifact.abi, "factory"), ctx.factory);
  assert.equal(await ctx.read(ctx.hook, hookArtifact.abi, "treasury"), address(TREASURY));
});

test("a launch puts the whole supply into a position nobody can take back", async () => {
  const ctx = await venue();
  const { reverted, token, key, poolId: id, notice } = await launch(ctx);
  assert.equal(reverted, false, "launch reverted");

  assert.equal(await ctx.read(token, tokenArtifact.abi, "name"), NAME);
  assert.equal(await ctx.read(token, tokenArtifact.abi, "symbol"), SYMBOL);

  // Every token that was minted is in the pool. What did not divide evenly into
  // liquidity was burned, so the supply is smaller than it was minted at and
  // there is no leftover anywhere.
  const inPool = await ctx.read(token, tokenArtifact.abi, "balanceOf", [ctx.manager]);
  const supply = await ctx.read(token, tokenArtifact.abi, "totalSupply");
  assert.equal(inPool, supply, "some of the supply is not in the pool");
  assert.ok(SUPPLY - supply < ETH, `${SUPPLY - supply} wei was burned as dust, which is more than dust`);

  for (const holder of [ctx.factory, ctx.locker, ctx.hook, address(CREATOR)]) {
    assert.equal(await ctx.read(token, tokenArtifact.abi, "balanceOf", [holder]), 0n, `${holder} holds supply`);
  }

  // The pool is native ETH against the token, with no LP fee and the cut hook
  // in the key — where it cannot be changed later.
  assert.equal(key.currency0, NATIVE);
  assert.equal(key.currency1, token);
  assert.equal(key.fee, 0);
  assert.equal(key.hooks, ctx.hook);

  assert.equal(notice.creator, address(CREATOR));
  assert.equal(notice.supply, SUPPLY);
  assert.ok(notice.liquidity > 0n, "the position is empty");
  assert.equal(await ctx.read(ctx.hook, hookArtifact.abi, "creatorOf", [id]), address(CREATOR));

  // The locker's own view and the pool manager's own storage agree.
  assert.equal(await ctx.read(ctx.locker, lockerArtifact.abi, "lockedLiquidity", [id]), notice.liquidity);

  // No ETH went in, because nobody had any to put in.
  assert.equal(await ctx.balanceOf(ctx.locker), 0n);
  assert.equal(await ctx.balanceOf(ctx.manager), 0n);
});

test("the board records every launch, newest first", async () => {
  const ctx = await venue();

  const first = await launch(ctx);
  const second = await launch(ctx, { ...LAUNCH_PARAMS, name: "Second", symbol: "SEC" }, STRANGER);
  assert.equal(first.reverted, false);
  assert.equal(second.reverted, false);

  assert.equal(await ctx.read(ctx.factory, factoryArtifact.abi, "noticeCount"), 2n);

  const page = await ctx.read(ctx.factory, factoryArtifact.abi, "latest", [0n, 10n]);
  assert.equal(page.length, 2);
  assert.equal(page[0].symbol, "SEC");
  assert.equal(page[1].symbol, SYMBOL);

  assert.deepEqual(await ctx.read(ctx.factory, factoryArtifact.abi, "noticesOf", [address(CREATOR)]), [0n]);
  assert.deepEqual(await ctx.read(ctx.factory, factoryArtifact.abi, "noticesOf", [address(STRANGER)]), [1n]);

  // A pool can be traced back to its notice, and an unknown pool is an error
  // rather than an answer about notice zero.
  assert.equal((await ctx.read(ctx.factory, factoryArtifact.abi, "noticeOfPool", [second.poolId])).symbol, "SEC");
  const unknown = await ctx.call(ctx.factory, factoryArtifact.abi, "noticeOfPool", [`0x${"11".repeat(32)}`]);
  assert.equal(unknown.reverted, true, "an unknown pool must not resolve to a notice");

  const [tokens, , boardSupply, cutBps, creatorBps] = await ctx.read(
    ctx.factory,
    factoryArtifact.abi,
    "boardStats",
  );
  assert.equal(tokens, 2n);
  assert.equal(boardSupply, SUPPLY);
  assert.equal(cutBps, 300n);
  assert.equal(creatorBps, 8000n);
});

test("a range reaching above spot is refused, so the locker is never asked for ETH", async () => {
  const ctx = await venue();

  const tooHigh = await launch(ctx, { ...LAUNCH_PARAMS, tickUpper: RANGE.tickUpper + TICK_SPACING });
  assert.equal(tooHigh.reverted, true, "a range above spot must revert");

  const offGrid = await launch(ctx, { ...LAUNCH_PARAMS, tickLower: RANGE.tickLower + 1 });
  assert.equal(offGrid.reverted, true, "ticks off the spacing grid must revert");

  const inverted = await launch(ctx, { ...LAUNCH_PARAMS, tickLower: RANGE.tickUpper, tickUpper: RANGE.tickLower });
  assert.equal(inverted.reverted, true, "an inverted range must revert");

  const nameless = await launch(ctx, { ...LAUNCH_PARAMS, symbol: "" });
  assert.equal(nameless.reverted, true, "a nameless launch must revert");

  // None of that left the board in a state where a good launch cannot follow.
  assert.equal(await ctx.read(ctx.factory, factoryArtifact.abi, "noticeCount"), 0n);
  assert.equal((await launch(ctx)).reverted, false);
});

// ------------------------------------------------------------------ the cut

test("a buy pays 3% in ETH, split 80/20", async () => {
  const ctx = await venue();
  const { key } = await launch(ctx);

  const spend = 2n * ETH;
  const bought = await buy(ctx, key, spend);
  assert.equal(bought.reverted, false, "the buy reverted");

  const cut = (spend * 300n) / 10_000n;
  assert.equal(cut, (3n * ETH) / 50n);

  assert.equal(await owed(ctx, address(CREATOR), NATIVE), (cut * 8000n) / 10_000n);
  assert.equal(await owed(ctx, address(TREASURY), NATIVE), cut - (cut * 8000n) / 10_000n);

  // The cut is a claim against the pool manager, not cash pulled out of it
  // mid-swap: the hook holds ERC-6909, and the ETH is still where the trader
  // settled it.
  assert.equal(await claims(ctx, NATIVE), cut);
  assert.equal(await ctx.balanceOf(ctx.hook), 0n);
  assert.equal(await ctx.balanceOf(ctx.manager), spend);

  // And the cut came out of the trade rather than out of the trader: they paid
  // what they asked to pay, and the curve saw 97% of it.
  assert.equal(await ctx.balanceOf(address(TRADER)), 10_000n * ETH - spend);
});

test("a sell pays 3% in the token", async () => {
  const ctx = await venue();
  const { key, token } = await launch(ctx);

  const bought = await buy(ctx, key, ETH);
  assert.equal(bought.reverted, false);

  const held = await ctx.read(token, tokenArtifact.abi, "balanceOf", [address(TRADER)]);
  assert.ok(held > 0n, "the buy delivered nothing");

  const sold = await sell(ctx, key, token, held / 2n);
  assert.equal(sold.reverted, false, "the sell reverted");

  const cut = ((held / 2n) * 300n) / 10_000n;
  assert.equal(await owed(ctx, address(CREATOR), token), (cut * 8000n) / 10_000n);
  assert.equal(await owed(ctx, address(TREASURY), token), cut - (cut * 8000n) / 10_000n);
  assert.equal(await claims(ctx, token), cut);

  // The creator now has both sides of it: ETH from the buy, tokens from the sell.
  assert.ok((await owed(ctx, address(CREATOR), NATIVE)) > 0n);
});

test("an exact-output buy pays the cut on top, and it is still 3% of the total", async () => {
  const ctx = await venue();
  const { key } = await launch(ctx);

  const before = await ctx.balanceOf(address(TRADER));
  const bought = await buyExactOut(ctx, key, 1_000_000n * ETH, 100n * ETH);
  assert.equal(bought.reverted, false, "the exact-output buy reverted");

  const paid = before - (await ctx.balanceOf(address(TRADER)));
  const cut = (await owed(ctx, address(CREATOR), NATIVE)) + (await owed(ctx, address(TREASURY), NATIVE));

  assert.ok(cut > 0n, "an exact-output swap paid no cut");
  assert.equal(await claims(ctx, NATIVE), cut);

  // 3% of everything the trader parted with, to the wei the rounding allows —
  // the cut is charged at 3/97 of what the curve asked, rounded up, so it lands
  // on 3% of the total from above rather than below.
  const expected = (paid * 300n) / 10_000n;
  assert.ok(cut >= expected && cut - expected <= 1n, `cut ${cut} is not 3% of ${paid} (expected ~${expected})`);
});

test("a swap too small to round up to a cut still goes through", async () => {
  const ctx = await venue();
  const { key } = await launch(ctx);

  // 19 wei in: 3% of it is 0 after integer division, so the hook banks nothing
  // and has to return a zero delta rather than an empty claim.
  const tiny = await buy(ctx, key, 19n);
  assert.equal(tiny.reverted, false, "a dust-sized swap must not revert");
  assert.equal(await claims(ctx, NATIVE), 0n);
  assert.equal(await owed(ctx, address(CREATOR), NATIVE), 0n);
});

test("what the hook owes is exactly what it holds claims for", async () => {
  const ctx = await venue();
  const { key, token } = await launch(ctx);

  await buy(ctx, key, 3n * ETH);
  const held = await ctx.read(token, tokenArtifact.abi, "balanceOf", [address(TRADER)]);
  await sell(ctx, key, token, held / 3n);
  await buy(ctx, key, ETH);

  for (const currency of [NATIVE, token]) {
    const ledger = (await owed(ctx, address(CREATOR), currency)) + (await owed(ctx, address(TREASURY), currency));
    assert.equal(ledger, await claims(ctx, currency), `the ledger and the claims disagree about ${currency}`);
  }
});

// ------------------------------------------------------------- withdrawing

test("the creator and the treasury can take what they are owed, and nothing else", async () => {
  const ctx = await venue();
  const { key, token } = await launch(ctx);

  await buy(ctx, key, 4n * ETH);
  const held = await ctx.read(token, tokenArtifact.abi, "balanceOf", [address(TRADER)]);
  await sell(ctx, key, token, held / 2n);

  const creatorEth = await owed(ctx, address(CREATOR), NATIVE);
  const creatorTokens = await owed(ctx, address(CREATOR), token);
  assert.ok(creatorEth > 0n && creatorTokens > 0n);

  const before = await ctx.balanceOf(address(CREATOR));
  const withdrawn = await ctx.call(ctx.hook, hookArtifact.abi, "withdrawMany", [[NATIVE, token]], {
    caller: CREATOR,
  });
  assert.equal(withdrawn.reverted, false, "withdrawMany reverted");

  assert.equal((await ctx.balanceOf(address(CREATOR))) - before, creatorEth);
  assert.equal(await ctx.read(token, tokenArtifact.abi, "balanceOf", [address(CREATOR)]), creatorTokens);

  // The ledger is settled, and a second withdrawal has nothing to pay.
  assert.equal(await owed(ctx, address(CREATOR), NATIVE), 0n);
  assert.equal(await owed(ctx, address(CREATOR), token), 0n);
  const again = await ctx.call(ctx.hook, hookArtifact.abi, "withdraw", [NATIVE], { caller: CREATOR });
  assert.equal(again.reverted, true, "an empty withdrawal must revert rather than pay nothing");

  // The treasury's share was untouched by any of that, and is still there.
  const treasuryEth = await owed(ctx, address(TREASURY), NATIVE);
  assert.ok(treasuryEth > 0n);
  assert.equal(await claims(ctx, NATIVE), treasuryEth);

  const treasuryBefore = await ctx.balanceOf(address(TREASURY));
  const swept = await ctx.call(ctx.hook, hookArtifact.abi, "withdraw", [NATIVE], { caller: TREASURY });
  assert.equal(swept.reverted, false, "the treasury could not withdraw");
  assert.equal((await ctx.balanceOf(address(TREASURY))) - treasuryBefore, treasuryEth);
  assert.equal(await claims(ctx, NATIVE), 0n);
});

test("a stranger is owed nothing and cannot withdraw anyone else's cut", async () => {
  const ctx = await venue();
  const { key } = await launch(ctx);
  await buy(ctx, key, ETH);

  const banked = await claims(ctx, NATIVE);
  const tried = await ctx.call(ctx.hook, hookArtifact.abi, "withdraw", [NATIVE], { caller: STRANGER });
  assert.equal(tried.reverted, true, "a stranger withdrew something");
  assert.equal(await claims(ctx, NATIVE), banked, "the claims moved");
});

// -------------------------------------------------------------- the fences

test("only the factory can register a pool or open one with this hook", async () => {
  const ctx = await venue();
  const { key } = await launch(ctx);

  const registered = await ctx.call(ctx.hook, hookArtifact.abi, "register", [key, address(STRANGER)], {
    caller: STRANGER,
  });
  assert.equal(registered.reverted, true, "a stranger registered a pool");

  // Nor can the factory be talked into registering the same pool twice.
  const again = await ctx.call(ctx.hook, hookArtifact.abi, "register", [key, address(STRANGER)], {
    caller: STRANGER,
  });
  assert.equal(again.reverted, true);

  // And a pool with this hook in its key cannot be initialised by anyone else:
  // a different tick spacing is a different pool, and the hook still refuses it.
  const foreign = { ...key, tickSpacing: 60 };
  const opened = await ctx.call(
    ctx.manager,
    managerArtifact.abi,
    "initialize",
    [foreign, RANGE.sqrtPriceX96],
    { caller: STRANGER },
  );
  assert.equal(opened.reverted, true, "a stranger opened a pool with the cut hook in it");
});

test("nobody but the factory can put liquidity in, and nothing takes it out", async () => {
  const ctx = await venue();
  const { key } = await launch(ctx);

  const byStranger = await ctx.call(
    ctx.locker,
    lockerArtifact.abi,
    "lockIn",
    [key, RANGE.tickLower, RANGE.tickUpper],
    { caller: STRANGER },
  );
  assert.equal(byStranger.reverted, true, "a stranger called lockIn");

  // The callbacks answer only to the pool manager.
  for (const [contract, art] of [
    [ctx.locker, lockerArtifact],
    [ctx.hook, hookArtifact],
  ]) {
    const spoofed = await ctx.call(contract, art.abi, "unlockCallback", ["0x"], { caller: STRANGER });
    assert.equal(spoofed.reverted, true, "unlockCallback answered someone other than the pool manager");
  }

  // The strongest statement about the locker is about what is not in it. These
  // are the calls that could move a position; none of them exists.
  const functions = lockerArtifact.abi.filter((entry) => entry.type === "function").map((entry) => entry.name);
  for (const absent of ["withdraw", "collect", "modifyLiquidity", "transfer", "rescue", "sweep", "setOwner"]) {
    assert.ok(!functions.includes(absent), `the locker has ${absent}, so the liquidity is not locked`);
  }
});

test("the hook cannot be deployed anywhere but a flagged address", async () => {
  const ctx = await venue();

  // The same factory, deployed with a salt that has not been mined. Its
  // constructor puts the hook somewhere the pool manager would never call, and
  // the hook refuses to exist there rather than letting the launchpad open pools
  // whose cut is silently never charged.
  const badSalt = `0x${"ab".repeat(32)}`;
  assert.notEqual(badSalt, ctx.salt);

  const data = concatHex([
    `0x${factoryArtifact.evm.bytecode.object}`,
    encodeAbiParameters(parseAbiParameters("address, address, bytes32"), [
      ctx.manager,
      address(TREASURY),
      badSalt,
    ]),
  ]);
  const result = await ctx.evm.runCall({
    caller: STRANGER,
    to: undefined,
    data: hexToBytes(data),
    gasLimit: GAS,
  });
  assert.notEqual(result.execResult.exceptionError, undefined, "a factory with an unmined salt deployed anyway");
});
