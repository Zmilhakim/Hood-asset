// Runs the compiled contracts on a local EVM against Uniswap's own PoolManager,
// deployed as it ships. A token is really launched, really bought and sold, and
// the 4% it charges is really collected — the flash accounting, the tick
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

import { flagsOf, hasFlags, hookInitCode, mineHookSalt, predictLaunchpad, CLAY_HOOK_FLAGS } from "../lib/hooks.mjs";
import { poolId } from "../lib/pool.mjs";
import { launchRange, pricePerToken } from "../lib/ticks.mjs";

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "out");
const artifact = (name) => JSON.parse(readFileSync(join(out, `${name}.json`), "utf8"));

const clayspadArtifact = artifact("Clayspad");
const hookArtifact = artifact("ClayHook");
const kilnArtifact = artifact("Kiln");
const tokenArtifact = artifact("ClayToken");
const managerArtifact = artifact("TestPoolManager");
const routerArtifact = artifact("TestSwapRouter");

const ETH = 10n ** 18n;
const SUPPLY = 1_000_000_000n * ETH;
const WHOLE_SUPPLY = 1_000_000_000n;

/** The split, as the contract states it: three quarters fired, one quarter liquid. */
const TO_POOL = (SUPPLY * 7_500n) / 10_000n;
const TO_WALLET = SUPPLY - TO_POOL;

/** The fee, as the hook states it: 4% of the way in, three quarters of it the creator's. */
const FEE_BPS = 400n;
const CREATOR_BPS = 7_500n;
const BPS = 10_000n;

const NAME = "Clay Test";
const SYMBOL = "TCLAY";
const TICK_SPACING = 200;
const GAS = 400_000_000n;

const MIN_SQRT_PRICE = 4295128739n;
const MAX_SQRT_PRICE = 1461446703485210103287273052203988822378723970342n;
const NATIVE = "0x0000000000000000000000000000000000000000";

const OWNER = new Address(hexToBytes("0x00000000000000000000000000000000000000f0"));
const DEPLOYER = new Address(hexToBytes("0x00000000000000000000000000000000000000f1"));
const CREATOR = new Address(hexToBytes("0x00000000000000000000000000000000000000f2"));
const TRADER = new Address(hexToBytes("0x00000000000000000000000000000000000000f3"));
const TREASURY = new Address(hexToBytes("0x00000000000000000000000000000000000000f4"));
const STRANGER = new Address(hexToBytes("0x00000000000000000000000000000000000000f5"));
const SUPPLY_WALLET = new Address(hexToBytes("0x00000000000000000000000000000000000000f6"));

const address = (account) => getAddress(account.toString());

/**
 * The launch these tests use, and the one the config ships with: the whole
 * supply worth 1.7 ETH where the pool opens, 170 ETH at the far end of the
 * range. A hundredfold, quoted as a market cap because that is how anyone
 * actually thinks about a launch.
 */
const RANGE = launchRange({
  floorEthPerToken: pricePerToken("1.7", WHOLE_SUPPLY),
  ceilEthPerToken: pricePerToken("170", WHOLE_SUPPLY),
  tickSpacing: TICK_SPACING,
});

const LAUNCH_PARAMS = {
  name: NAME,
  symbol: SYMBOL,
  imageURI: "ipfs://picture",
  blurb: "a token for the tests",
  link: "https://example.invalid",
  supplyWallet: address(SUPPLY_WALLET),
  tickSpacing: TICK_SPACING,
  sqrtPriceX96: RANGE.sqrtPriceX96,
  tickLower: RANGE.tickLower,
  tickUpper: RANGE.tickUpper,
};

async function fresh() {
  // Cancun or later: the pool manager keeps its lock and its deltas in transient
  // storage, so anything older cannot run it at all.
  const evm = await createEVM({ common: new Common({ chain: Mainnet, hardfork: Hardfork.Cancun }) });

  for (const account of [OWNER, DEPLOYER, CREATOR, TRADER, TREASURY, STRANGER, SUPPLY_WALLET]) {
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
 * A pool manager, a launchpad whose hook landed on a flagged address, and
 * something that can trade.
 *
 * The salt is mined here rather than hard-coded, because the hook's address
 * depends on the launchpad's, which depends on who deploys it. Mining it in the
 * test is the same work `npm run deploy` does, against the same library.
 */
async function venue() {
  const ctx = await fresh();

  const manager = await ctx.deploy(managerArtifact, "address", [address(OWNER)], OWNER);

  // DEPLOYER has sent nothing yet, so the launchpad lands at its nonce-zero address.
  const predicted = predictLaunchpad({ deployer: address(DEPLOYER), nonce: 0 });
  const mined = mineHookSalt({
    deployer: predicted,
    initCode: hookInitCode({
      creationCode: hookArtifact.evm.bytecode.object,
      poolManager: manager,
      treasury: address(TREASURY),
    }),
  });

  const clayspad = await ctx.deploy(
    clayspadArtifact,
    "address, address, bytes32",
    [manager, address(TREASURY), mined.salt],
    DEPLOYER,
  );
  assert.equal(clayspad, predicted, "the launchpad did not land where the salt was mined against");

  const hook = await ctx.read(clayspad, clayspadArtifact.abi, "hook");
  const kiln = await ctx.read(clayspad, clayspadArtifact.abi, "kiln");
  const router = await ctx.deploy(routerArtifact, "address", [manager], OWNER);

  return { ...ctx, manager, clayspad, hook, kiln, router, salt: mined.salt };
}

async function launch(ctx, params = LAUNCH_PARAMS, caller = CREATOR) {
  const result = await ctx.call(ctx.clayspad, clayspadArtifact.abi, "launch", [params], { caller });
  if (result.reverted) return { reverted: true };

  const id = (await ctx.read(ctx.clayspad, clayspadArtifact.abi, "pieceCount")) - 1n;
  const piece = await ctx.read(ctx.clayspad, clayspadArtifact.abi, "pieceAt", [id]);
  const key = await ctx.read(ctx.clayspad, clayspadArtifact.abi, "poolKeyOf", [id]);

  return { reverted: false, id, piece, token: piece.token, key, poolId: poolId(key) };
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

/** Sell the token back for ETH, which is how the other side of the fee is earned. */
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
const heldBy = (ctx, token, who) => ctx.read(token, tokenArtifact.abi, "balanceOf", [who]);

// ---------------------------------------------------------------- the launch

test("the hook only works because its address carries the flags", async () => {
  const ctx = await venue();

  assert.ok(hasFlags(ctx.hook), `${ctx.hook} does not carry the flags: ${flagsOf(ctx.hook).join(", ")}`);
  assert.equal(await ctx.read(ctx.hook, hookArtifact.abi, "hookFlags"), CLAY_HOOK_FLAGS);
  assert.deepEqual(flagsOf(ctx.hook).sort(), [
    "AFTER_SWAP",
    "AFTER_SWAP_RETURNS_DELTA",
    "BEFORE_INITIALIZE",
    "BEFORE_SWAP",
    "BEFORE_SWAP_RETURNS_DELTA",
  ]);

  // The launchpad deployed it, and the hook took that as its one privileged caller.
  assert.equal(await ctx.read(ctx.hook, hookArtifact.abi, "launchpad"), ctx.clayspad);
  assert.equal(await ctx.read(ctx.hook, hookArtifact.abi, "treasury"), address(TREASURY));
});

test("a launch splits the supply three quarters to the pool, one quarter to the wallet", async () => {
  const ctx = await venue();
  const { reverted, token, key, poolId: id, piece } = await launch(ctx);
  assert.equal(reverted, false, "launch reverted");

  assert.equal(await ctx.read(token, tokenArtifact.abi, "name"), NAME);
  assert.equal(await ctx.read(token, tokenArtifact.abi, "symbol"), SYMBOL);

  // The two shares, as the token itself records them, and as the launchpad does.
  assert.equal(await ctx.read(token, tokenArtifact.abi, "toKiln"), TO_POOL);
  assert.equal(await ctx.read(token, tokenArtifact.abi, "toSupplyWallet"), TO_WALLET);
  assert.equal(await ctx.read(token, tokenArtifact.abi, "supplyWallet"), address(SUPPLY_WALLET));
  assert.equal(piece.toPool, TO_POOL);
  assert.equal(piece.toSupplyWallet, TO_WALLET);
  assert.equal(piece.supplyWallet, address(SUPPLY_WALLET));

  // Where the tokens actually are: the pool's share in the pool manager, the
  // wallet's share in the wallet, and the two of them are the whole supply.
  const inPool = await heldBy(ctx, token, ctx.manager);
  const inWallet = await heldBy(ctx, token, address(SUPPLY_WALLET));
  const total = await ctx.read(token, tokenArtifact.abi, "totalSupply");

  assert.equal(inWallet, TO_WALLET, "the supply wallet did not get its quarter");
  assert.equal(inPool + inWallet, total, "some of the supply is neither in the pool nor in the wallet");

  // What did not divide evenly into liquidity was burned, so the total is a
  // little under what was minted and nothing is left loose.
  assert.ok(SUPPLY - total < ETH, `${SUPPLY - total} wei was burned as dust, which is more than dust`);

  // Nothing is held anywhere it should not be. The creator is on this list: the
  // quarter went to the wallet they nominated, and they are not it.
  for (const holder of [ctx.clayspad, ctx.kiln, ctx.hook, address(CREATOR)]) {
    assert.equal(await heldBy(ctx, token, holder), 0n, `${holder} holds supply`);
  }

  // The pool is native ETH against the token, no LP fee, this hook in the key —
  // where it cannot be changed later.
  assert.equal(key.currency0, NATIVE);
  assert.equal(key.currency1, token);
  assert.equal(key.fee, 0);
  assert.equal(key.hooks, ctx.hook);

  assert.equal(piece.creator, address(CREATOR));
  assert.equal(piece.supply, SUPPLY);
  assert.ok(piece.liquidity > 0n, "the position is empty");
  assert.equal(await ctx.read(ctx.hook, hookArtifact.abi, "creatorOf", [id]), address(CREATOR));

  // The kiln's own view and the pool manager's own storage agree.
  assert.equal(await ctx.read(ctx.kiln, kilnArtifact.abi, "firedLiquidity", [id]), piece.liquidity);

  // No ETH went in, because nobody had any to put in.
  assert.equal(await ctx.balanceOf(ctx.kiln), 0n);
  assert.equal(await ctx.balanceOf(ctx.manager), 0n);
});

test("the supply wallet's quarter is liquid from the first block", async () => {
  const ctx = await venue();
  const { key, token } = await launch(ctx);

  // Liquid means unrestrained, and the test says so out loud: nothing in this
  // repository can stop the wallet moving its quarter, and it moves some in the
  // very next transaction after the launch.
  const moved = TO_WALLET / 100n;
  const sent = await ctx.call(token, tokenArtifact.abi, "transfer", [address(STRANGER), moved], {
    caller: SUPPLY_WALLET,
  });
  assert.equal(sent.reverted, false, "the supply wallet could not transfer — the quarter is not liquid");
  assert.equal(await heldBy(ctx, token, address(STRANGER)), moved);

  // Whether it can be *sold* is a different question, and worth being exact
  // about rather than implying either way. A pool nobody has bought from holds
  // no ETH — the whole position is still token — so there is nothing for a
  // seller to be paid with, and a sell into it fills next to nothing. The
  // quarter is unlocked from the first block; it becomes sellable as the pool
  // fills, and not before.
  assert.equal((await buy(ctx, key, 5n * ETH)).reverted, false, "the buy reverted");

  const beforeEth = await ctx.balanceOf(address(SUPPLY_WALLET));
  const slice = 1_000_000n * ETH;
  const sold = await sell(ctx, key, token, slice, SUPPLY_WALLET);
  assert.equal(sold.reverted, false, "the supply wallet could not sell");

  assert.equal(await heldBy(ctx, token, address(SUPPLY_WALLET)), TO_WALLET - moved - slice);
  assert.ok((await ctx.balanceOf(address(SUPPLY_WALLET))) > beforeEth, "the sale paid no ETH");

  // And it paid the same 4% as anybody else's sell. There is no exemption for
  // holding a quarter of the supply.
  assert.equal(await claims(ctx, token), (slice * FEE_BPS) / BPS);
});

test("a launch naming no supply wallet gives the quarter to the creator", async () => {
  const ctx = await venue();
  const { reverted, token, piece } = await launch(ctx, { ...LAUNCH_PARAMS, supplyWallet: NATIVE });
  assert.equal(reverted, false, "launch reverted");

  assert.equal(piece.supplyWallet, address(CREATOR));
  assert.equal(await heldBy(ctx, token, address(CREATOR)), TO_WALLET);

  // Never address(0): a quarter of a supply minted to nowhere is a burn dressed
  // up as an allocation, and the launchpad substitutes the caller instead.
  assert.equal(await heldBy(ctx, token, NATIVE), 0n);
});

test("the shelf records every launch, newest first", async () => {
  const ctx = await venue();

  const first = await launch(ctx);
  const second = await launch(ctx, { ...LAUNCH_PARAMS, name: "Second", symbol: "SEC" }, STRANGER);
  assert.equal(first.reverted, false);
  assert.equal(second.reverted, false);

  assert.equal(await ctx.read(ctx.clayspad, clayspadArtifact.abi, "pieceCount"), 2n);

  const page = await ctx.read(ctx.clayspad, clayspadArtifact.abi, "latest", [0n, 10n]);
  assert.equal(page.length, 2);
  assert.equal(page[0].symbol, "SEC");
  assert.equal(page[1].symbol, SYMBOL);

  assert.deepEqual(await ctx.read(ctx.clayspad, clayspadArtifact.abi, "piecesOf", [address(CREATOR)]), [0n]);
  assert.deepEqual(await ctx.read(ctx.clayspad, clayspadArtifact.abi, "piecesOf", [address(STRANGER)]), [1n]);

  // A pool can be traced back to its piece, and an unknown pool is an error
  // rather than an answer about piece zero.
  assert.equal((await ctx.read(ctx.clayspad, clayspadArtifact.abi, "pieceOfPool", [second.poolId])).symbol, "SEC");
  const unknown = await ctx.call(ctx.clayspad, clayspadArtifact.abi, "pieceOfPool", [`0x${"11".repeat(32)}`]);
  assert.equal(unknown.reverted, true, "an unknown pool must not resolve to a piece");

  // Every figure the shelf header prints, and every one of them a constant that
  // this test is the check on.
  const [tokens, , shelfSupply, poolBps, walletBps, feeBps, creatorBps] = await ctx.read(
    ctx.clayspad,
    clayspadArtifact.abi,
    "shelfStats",
  );
  assert.equal(tokens, 2n);
  assert.equal(shelfSupply, SUPPLY);
  assert.equal(poolBps, 7_500n);
  assert.equal(walletBps, 2_500n);
  assert.equal(feeBps, FEE_BPS);
  assert.equal(creatorBps, CREATOR_BPS);

  const [toPool, toWallet] = await ctx.read(ctx.clayspad, clayspadArtifact.abi, "supplyShares");
  assert.equal(toPool, TO_POOL);
  assert.equal(toWallet, TO_WALLET);
  assert.equal(toPool + toWallet, SUPPLY, "the two shares do not add up to the supply");
});

test("a range reaching above spot is refused, so the kiln is never asked for ETH", async () => {
  const ctx = await venue();

  const tooHigh = await launch(ctx, { ...LAUNCH_PARAMS, tickUpper: RANGE.tickUpper + TICK_SPACING });
  assert.equal(tooHigh.reverted, true, "a range above spot must revert");

  const offGrid = await launch(ctx, { ...LAUNCH_PARAMS, tickLower: RANGE.tickLower + 1 });
  assert.equal(offGrid.reverted, true, "ticks off the spacing grid must revert");

  const inverted = await launch(ctx, { ...LAUNCH_PARAMS, tickLower: RANGE.tickUpper, tickUpper: RANGE.tickLower });
  assert.equal(inverted.reverted, true, "an inverted range must revert");

  const nameless = await launch(ctx, { ...LAUNCH_PARAMS, symbol: "" });
  assert.equal(nameless.reverted, true, "a nameless launch must revert");

  // None of that left the shelf in a state where a good launch cannot follow.
  assert.equal(await ctx.read(ctx.clayspad, clayspadArtifact.abi, "pieceCount"), 0n);
  assert.equal((await launch(ctx)).reverted, false);
});

// ------------------------------------------------------------------- the fee

test("a buy pays 4% in ETH, split 75/25", async () => {
  const ctx = await venue();
  const { key } = await launch(ctx);

  const spend = 2n * ETH;
  const bought = await buy(ctx, key, spend);
  assert.equal(bought.reverted, false, "the buy reverted");

  const fee = (spend * FEE_BPS) / BPS;
  assert.equal(fee, (2n * ETH) / 25n); // 4% of 2 ETH is 0.08

  assert.equal(await owed(ctx, address(CREATOR), NATIVE), (fee * CREATOR_BPS) / BPS);
  assert.equal(await owed(ctx, address(TREASURY), NATIVE), fee - (fee * CREATOR_BPS) / BPS);

  // The fee is a claim against the pool manager, not cash pulled out of it
  // mid-swap: the hook holds ERC-6909, and the ETH is still where the trader
  // settled it.
  assert.equal(await claims(ctx, NATIVE), fee);
  assert.equal(await ctx.balanceOf(ctx.hook), 0n);
  assert.equal(await ctx.balanceOf(ctx.manager), spend);

  // And the fee came out of the trade rather than out of the trader: they paid
  // what they asked to pay, and the curve saw 96% of it.
  assert.equal(await ctx.balanceOf(address(TRADER)), 10_000n * ETH - spend);
});

test("a sell pays 4% in the token", async () => {
  const ctx = await venue();
  const { key, token } = await launch(ctx);

  const bought = await buy(ctx, key, ETH);
  assert.equal(bought.reverted, false);

  const held = await heldBy(ctx, token, address(TRADER));
  assert.ok(held > 0n, "the buy delivered nothing");

  const sold = await sell(ctx, key, token, held / 2n);
  assert.equal(sold.reverted, false, "the sell reverted");

  const fee = ((held / 2n) * FEE_BPS) / BPS;
  assert.equal(await owed(ctx, address(CREATOR), token), (fee * CREATOR_BPS) / BPS);
  assert.equal(await owed(ctx, address(TREASURY), token), fee - (fee * CREATOR_BPS) / BPS);
  assert.equal(await claims(ctx, token), fee);

  // The creator now has both sides of it: ETH from the buy, tokens from the sell.
  assert.ok((await owed(ctx, address(CREATOR), NATIVE)) > 0n);
});

test("an exact-output buy pays the fee on top, and it is still 4% of the total", async () => {
  const ctx = await venue();
  const { key } = await launch(ctx);

  const before = await ctx.balanceOf(address(TRADER));
  const bought = await buyExactOut(ctx, key, 1_000_000n * ETH, 100n * ETH);
  assert.equal(bought.reverted, false, "the exact-output buy reverted");

  const paid = before - (await ctx.balanceOf(address(TRADER)));
  const fee = (await owed(ctx, address(CREATOR), NATIVE)) + (await owed(ctx, address(TREASURY), NATIVE));

  assert.ok(fee > 0n, "an exact-output swap paid no fee");
  assert.equal(await claims(ctx, NATIVE), fee);

  // 4% of everything the trader parted with, to the wei the rounding allows —
  // charged at 4/96 of what the curve asked, rounded up, so it lands on 4% of
  // the total from above rather than below.
  const expected = (paid * FEE_BPS) / BPS;
  assert.ok(fee >= expected && fee - expected <= 1n, `fee ${fee} is not 4% of ${paid} (expected ~${expected})`);
});

test("the hook's own quote is the arithmetic it actually runs", async () => {
  const ctx = await venue();
  const { key } = await launch(ctx);

  const spend = 5n * ETH;
  const [quoted, toCreator, toTreasury] = await ctx.read(ctx.hook, hookArtifact.abi, "quoteFee", [spend]);
  assert.equal(toCreator + toTreasury, quoted, "the split does not add back up to the fee");

  assert.equal((await buy(ctx, key, spend)).reverted, false);
  assert.equal(await owed(ctx, address(CREATOR), NATIVE), toCreator);
  assert.equal(await owed(ctx, address(TREASURY), NATIVE), toTreasury);
});

test("a swap too small to round up to a fee still goes through", async () => {
  const ctx = await venue();
  const { key } = await launch(ctx);

  // 19 wei in: 4% of it is 0 after integer division, so the hook banks nothing
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
  const held = await heldBy(ctx, token, address(TRADER));
  await sell(ctx, key, token, held / 3n);
  await buy(ctx, key, ETH);
  await sell(ctx, key, token, TO_WALLET / 20n, SUPPLY_WALLET);

  for (const currency of [NATIVE, token]) {
    const ledger = (await owed(ctx, address(CREATOR), currency)) + (await owed(ctx, address(TREASURY), currency));
    assert.equal(ledger, await claims(ctx, currency), `the ledger and the claims disagree about ${currency}`);
  }
});

// -------------------------------------------------------------- withdrawing

test("the creator and the treasury can take what they are owed, and nothing else", async () => {
  const ctx = await venue();
  const { key, token } = await launch(ctx);

  await buy(ctx, key, 4n * ETH);
  const held = await heldBy(ctx, token, address(TRADER));
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
  assert.equal(await heldBy(ctx, token, address(CREATOR)), creatorTokens);

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

test("a stranger is owed nothing and cannot withdraw anyone else's fee", async () => {
  const ctx = await venue();
  const { key } = await launch(ctx);
  await buy(ctx, key, ETH);

  const banked = await claims(ctx, NATIVE);
  const tried = await ctx.call(ctx.hook, hookArtifact.abi, "withdraw", [NATIVE], { caller: STRANGER });
  assert.equal(tried.reverted, true, "a stranger withdrew something");
  assert.equal(await claims(ctx, NATIVE), banked, "the claims moved");

  // Holding a quarter of a supply buys no standing here either.
  const byWallet = await ctx.call(ctx.hook, hookArtifact.abi, "withdraw", [NATIVE], { caller: SUPPLY_WALLET });
  assert.equal(byWallet.reverted, true, "the supply wallet withdrew a fee it is not owed");
});

// --------------------------------------------------------------- the fences

test("only the launchpad can register a pool or open one with this hook", async () => {
  const ctx = await venue();
  const { key } = await launch(ctx);

  const registered = await ctx.call(ctx.hook, hookArtifact.abi, "register", [key, address(STRANGER)], {
    caller: STRANGER,
  });
  assert.equal(registered.reverted, true, "a stranger registered a pool");

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
  assert.equal(opened.reverted, true, "a stranger opened a pool with this hook in it");
});

test("nobody but the launchpad can fire the kiln, and nothing takes liquidity out", async () => {
  const ctx = await venue();
  const { key } = await launch(ctx);

  const byStranger = await ctx.call(
    ctx.kiln,
    kilnArtifact.abi,
    "fire",
    [key, RANGE.tickLower, RANGE.tickUpper],
    { caller: STRANGER },
  );
  assert.equal(byStranger.reverted, true, "a stranger called fire");

  // The callbacks answer only to the pool manager.
  for (const [contract, art] of [
    [ctx.kiln, kilnArtifact],
    [ctx.hook, hookArtifact],
  ]) {
    const spoofed = await ctx.call(contract, art.abi, "unlockCallback", ["0x"], { caller: STRANGER });
    assert.equal(spoofed.reverted, true, "unlockCallback answered someone other than the pool manager");
  }

  // The strongest statement about the kiln is about what is not in it. These are
  // the calls that could move a position; none of them exists.
  const functions = kilnArtifact.abi.filter((entry) => entry.type === "function").map((entry) => entry.name);
  for (const absent of ["withdraw", "collect", "modifyLiquidity", "transfer", "rescue", "sweep", "setOwner"]) {
    assert.ok(!functions.includes(absent), `the kiln has ${absent}, so the liquidity is not locked`);
  }
});

test("the hook cannot be deployed anywhere but a flagged address", async () => {
  const ctx = await venue();

  // The same launchpad, deployed with a salt that has not been mined. Its
  // constructor puts the hook somewhere the pool manager would never call, and
  // the hook refuses to exist there rather than letting the launchpad open pools
  // whose fee is silently never charged.
  const badSalt = `0x${"ab".repeat(32)}`;
  assert.notEqual(badSalt, ctx.salt);

  const data = concatHex([
    `0x${clayspadArtifact.evm.bytecode.object}`,
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
  assert.notEqual(result.execResult.exceptionError, undefined, "a launchpad with an unmined salt deployed anyway");
});
