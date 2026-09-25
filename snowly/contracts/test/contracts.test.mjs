// Runs the compiled contracts on a local EVM against Uniswap's own PoolManager,
// deployed as it ships. A token is really launched, really bought and sold, and
// the 4.5% it charges is really collected — the flash accounting, the tick
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
  decodeAbiParameters,
  encodeAbiParameters,
  encodeFunctionData,
  getAddress,
  parseAbiParameters,
} from "viem";

import { flagsOf, hasFlags, hookInitCode, mineHookSalt, predictLaunchpad, SNOW_HOOK_FLAGS } from "../lib/hooks.mjs";
import { poolId } from "../lib/pool.mjs";
import { launchRange, pricePerToken } from "../lib/ticks.mjs";

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "out");
const artifact = (name) => JSON.parse(readFileSync(join(out, `${name}.json`), "utf8"));

const snowlyArtifact = artifact("Snowly");
const hookArtifact = artifact("SnowHook");
const glacierArtifact = artifact("Glacier");
const tokenArtifact = artifact("SnowToken");
const managerArtifact = artifact("TestPoolManager");
const routerArtifact = artifact("TestSwapRouter");

const ETH = 10n ** 18n;
const SUPPLY = 1_000_000_000n * ETH;
const WHOLE_SUPPLY = 1_000_000_000n;

/** The split, as the contract states it: four fifths buried, one fifth liquid. */
const TO_POOL = (SUPPLY * 8_000n) / 10_000n;
const TO_WALLET = SUPPLY - TO_POOL;

/** The fee, as the hook states it: 4.5% of the way in, three quarters of it the creator's. */
const FEE_BPS = 450n;
const CREATOR_BPS = 7_500n;
const BPS = 10_000n;

const NAME = "Snow Test";
const SYMBOL = "TSNOW";
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

  const snowly = await ctx.deploy(
    snowlyArtifact,
    "address, address, bytes32",
    [manager, address(TREASURY), mined.salt],
    DEPLOYER,
  );
  assert.equal(snowly, predicted, "the launchpad did not land where the salt was mined against");

  const hook = await ctx.read(snowly, snowlyArtifact.abi, "hook");
  const glacier = await ctx.read(snowly, snowlyArtifact.abi, "glacier");
  const router = await ctx.deploy(routerArtifact, "address", [manager], OWNER);

  return { ...ctx, manager, snowly, hook, glacier, router, salt: mined.salt };
}

async function launch(ctx, params = LAUNCH_PARAMS, caller = CREATOR) {
  const result = await ctx.call(ctx.snowly, snowlyArtifact.abi, "launch", [params], { caller });
  if (result.reverted) return { reverted: true };

  const id = (await ctx.read(ctx.snowly, snowlyArtifact.abi, "driftCount")) - 1n;
  const drift = await ctx.read(ctx.snowly, snowlyArtifact.abi, "driftAt", [id]);
  const key = await ctx.read(ctx.snowly, snowlyArtifact.abi, "poolKeyOf", [id]);

  return { reverted: false, id, drift, token: drift.token, key, poolId: poolId(key) };
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
  assert.equal(await ctx.read(ctx.hook, hookArtifact.abi, "hookFlags"), SNOW_HOOK_FLAGS);
  assert.deepEqual(flagsOf(ctx.hook).sort(), [
    "AFTER_SWAP",
    "AFTER_SWAP_RETURNS_DELTA",
    "BEFORE_INITIALIZE",
    "BEFORE_SWAP",
    "BEFORE_SWAP_RETURNS_DELTA",
  ]);

  // The launchpad deployed it, and the hook took that as its one privileged caller.
  assert.equal(await ctx.read(ctx.hook, hookArtifact.abi, "launchpad"), ctx.snowly);
  assert.equal(await ctx.read(ctx.hook, hookArtifact.abi, "treasury"), address(TREASURY));
});

test("a launch splits the supply four fifths to the pool, one fifth to the wallet", async () => {
  const ctx = await venue();
  const { reverted, token, key, poolId: id, drift } = await launch(ctx);
  assert.equal(reverted, false, "launch reverted");

  assert.equal(await ctx.read(token, tokenArtifact.abi, "name"), NAME);
  assert.equal(await ctx.read(token, tokenArtifact.abi, "symbol"), SYMBOL);

  // The two shares, as the token itself records them, and as the launchpad does.
  assert.equal(await ctx.read(token, tokenArtifact.abi, "toGlacier"), TO_POOL);
  assert.equal(await ctx.read(token, tokenArtifact.abi, "toSupplyWallet"), TO_WALLET);
  assert.equal(await ctx.read(token, tokenArtifact.abi, "supplyWallet"), address(SUPPLY_WALLET));
  assert.equal(drift.toPool, TO_POOL);
  assert.equal(drift.toSupplyWallet, TO_WALLET);
  assert.equal(drift.supplyWallet, address(SUPPLY_WALLET));

  // Where the tokens actually are: the pool's share in the pool manager, the
  // wallet's share in the wallet, and the two of them are the whole supply.
  const inPool = await heldBy(ctx, token, ctx.manager);
  const inWallet = await heldBy(ctx, token, address(SUPPLY_WALLET));
  const total = await ctx.read(token, tokenArtifact.abi, "totalSupply");

  assert.equal(inWallet, TO_WALLET, "the supply wallet did not get its fifth");
  assert.equal(inPool + inWallet, total, "some of the supply is neither in the pool nor in the wallet");

  // What did not divide evenly into liquidity was burned, so the total is a
  // little under what was minted and nothing is left loose.
  assert.ok(SUPPLY - total < ETH, `${SUPPLY - total} wei was burned as dust, which is more than dust`);

  // Nothing is held anywhere it should not be. The creator is on this list: the
  // fifth went to the wallet they nominated, and they are not it.
  for (const holder of [ctx.snowly, ctx.glacier, ctx.hook, address(CREATOR)]) {
    assert.equal(await heldBy(ctx, token, holder), 0n, `${holder} holds supply`);
  }

  // The pool is native ETH against the token, no LP fee, this hook in the key —
  // where it cannot be changed later.
  assert.equal(key.currency0, NATIVE);
  assert.equal(key.currency1, token);
  assert.equal(key.fee, 0);
  assert.equal(key.hooks, ctx.hook);

  assert.equal(drift.creator, address(CREATOR));
  assert.equal(drift.supply, SUPPLY);
  assert.ok(drift.liquidity > 0n, "the position is empty");
  assert.equal(await ctx.read(ctx.hook, hookArtifact.abi, "creatorOf", [id]), address(CREATOR));

  // The glacier's own view and the pool manager's own storage agree.
  assert.equal(await ctx.read(ctx.glacier, glacierArtifact.abi, "compactedLiquidity", [id]), drift.liquidity);

  // No ETH went in, because nobody had any to put in.
  assert.equal(await ctx.balanceOf(ctx.glacier), 0n);
  assert.equal(await ctx.balanceOf(ctx.manager), 0n);
});

test("the supply wallet's fifth is liquid from the first block", async () => {
  const ctx = await venue();
  const { key, token } = await launch(ctx);

  // Liquid means unrestrained, and the test says so out loud: nothing in this
  // repository can stop the wallet moving its fifth, and it moves some in the
  // very next transaction after the launch.
  const moved = TO_WALLET / 100n;
  const sent = await ctx.call(token, tokenArtifact.abi, "transfer", [address(STRANGER), moved], {
    caller: SUPPLY_WALLET,
  });
  assert.equal(sent.reverted, false, "the supply wallet could not transfer — the fifth is not liquid");
  assert.equal(await heldBy(ctx, token, address(STRANGER)), moved);

  // Whether it can be *sold* is a different question, and worth being exact
  // about rather than implying either way. A pool nobody has bought from holds
  // no ETH — the whole position is still token — so there is nothing for a
  // seller to be paid with, and a sell into it fills next to nothing. The
  // fifth is unlocked from the first block; it becomes sellable as the pool
  // fills, and not before.
  assert.equal((await buy(ctx, key, 5n * ETH)).reverted, false, "the buy reverted");

  const beforeEth = await ctx.balanceOf(address(SUPPLY_WALLET));
  const slice = 1_000_000n * ETH;
  const sold = await sell(ctx, key, token, slice, SUPPLY_WALLET);
  assert.equal(sold.reverted, false, "the supply wallet could not sell");

  assert.equal(await heldBy(ctx, token, address(SUPPLY_WALLET)), TO_WALLET - moved - slice);
  assert.ok((await ctx.balanceOf(address(SUPPLY_WALLET))) > beforeEth, "the sale paid no ETH");

  // And it paid the same 4.5% as anybody else's sell. There is no exemption for
  // holding a fifth of the supply.
  assert.equal(await claims(ctx, token), (slice * FEE_BPS) / BPS);
});

test("a launch naming no supply wallet gives the fifth to the creator", async () => {
  const ctx = await venue();
  const { reverted, token, drift } = await launch(ctx, { ...LAUNCH_PARAMS, supplyWallet: NATIVE });
  assert.equal(reverted, false, "launch reverted");

  assert.equal(drift.supplyWallet, address(CREATOR));
  assert.equal(await heldBy(ctx, token, address(CREATOR)), TO_WALLET);

  // Never address(0): a fifth of a supply minted to nowhere is a burn dressed
  // up as an allocation, and the launchpad substitutes the caller instead.
  assert.equal(await heldBy(ctx, token, NATIVE), 0n);
});

test("the snowfield records every launch, newest first", async () => {
  const ctx = await venue();

  const first = await launch(ctx);
  const second = await launch(ctx, { ...LAUNCH_PARAMS, name: "Second", symbol: "SEC" }, STRANGER);
  assert.equal(first.reverted, false);
  assert.equal(second.reverted, false);

  assert.equal(await ctx.read(ctx.snowly, snowlyArtifact.abi, "driftCount"), 2n);

  const page = await ctx.read(ctx.snowly, snowlyArtifact.abi, "latest", [0n, 10n]);
  assert.equal(page.length, 2);
  assert.equal(page[0].symbol, "SEC");
  assert.equal(page[1].symbol, SYMBOL);

  assert.deepEqual(await ctx.read(ctx.snowly, snowlyArtifact.abi, "driftsOf", [address(CREATOR)]), [0n]);
  assert.deepEqual(await ctx.read(ctx.snowly, snowlyArtifact.abi, "driftsOf", [address(STRANGER)]), [1n]);

  // A pool can be traced back to its drift, and an unknown pool is an error
  // rather than an answer about drift zero.
  assert.equal((await ctx.read(ctx.snowly, snowlyArtifact.abi, "driftOfPool", [second.poolId])).symbol, "SEC");
  const unknown = await ctx.call(ctx.snowly, snowlyArtifact.abi, "driftOfPool", [`0x${"11".repeat(32)}`]);
  assert.equal(unknown.reverted, true, "an unknown pool must not resolve to a drift");

  // Every figure the snowfield header prints, and every one of them a constant that
  // this test is the check on.
  const [tokens, , fieldSupply, poolBps, walletBps, feeBps, creatorBps] = await ctx.read(
    ctx.snowly,
    snowlyArtifact.abi,
    "fieldStats",
  );
  assert.equal(tokens, 2n);
  assert.equal(fieldSupply, SUPPLY);
  assert.equal(poolBps, 8_000n);
  assert.equal(walletBps, 2_000n);
  assert.equal(feeBps, FEE_BPS);
  assert.equal(creatorBps, CREATOR_BPS);

  const [toPool, toWallet] = await ctx.read(ctx.snowly, snowlyArtifact.abi, "supplyShares");
  assert.equal(toPool, TO_POOL);
  assert.equal(toWallet, TO_WALLET);
  assert.equal(toPool + toWallet, SUPPLY, "the two shares do not add up to the supply");
});

test("a range reaching above spot is refused, so the glacier is never asked for ETH", async () => {
  const ctx = await venue();

  const tooHigh = await launch(ctx, { ...LAUNCH_PARAMS, tickUpper: RANGE.tickUpper + TICK_SPACING });
  assert.equal(tooHigh.reverted, true, "a range above spot must revert");

  const offGrid = await launch(ctx, { ...LAUNCH_PARAMS, tickLower: RANGE.tickLower + 1 });
  assert.equal(offGrid.reverted, true, "ticks off the spacing grid must revert");

  const inverted = await launch(ctx, { ...LAUNCH_PARAMS, tickLower: RANGE.tickUpper, tickUpper: RANGE.tickLower });
  assert.equal(inverted.reverted, true, "an inverted range must revert");

  const nameless = await launch(ctx, { ...LAUNCH_PARAMS, symbol: "" });
  assert.equal(nameless.reverted, true, "a nameless launch must revert");

  // None of that left the snowfield in a state where a good launch cannot follow.
  assert.equal(await ctx.read(ctx.snowly, snowlyArtifact.abi, "driftCount"), 0n);
  assert.equal((await launch(ctx)).reverted, false);
});

// ------------------------------------------------------------------- the fee

test("a buy pays 4.5% in ETH, split 75/25", async () => {
  const ctx = await venue();
  const { key } = await launch(ctx);

  const spend = 2n * ETH;
  const bought = await buy(ctx, key, spend);
  assert.equal(bought.reverted, false, "the buy reverted");

  const fee = (spend * FEE_BPS) / BPS;
  assert.equal(fee, (9n * ETH) / 100n); // 4.5% of 2 ETH is 0.09

  assert.equal(await owed(ctx, address(CREATOR), NATIVE), (fee * CREATOR_BPS) / BPS);
  assert.equal(await owed(ctx, address(TREASURY), NATIVE), fee - (fee * CREATOR_BPS) / BPS);

  // The fee is a claim against the pool manager, not cash pulled out of it
  // mid-swap: the hook holds ERC-6909, and the ETH is still where the trader
  // settled it.
  assert.equal(await claims(ctx, NATIVE), fee);
  assert.equal(await ctx.balanceOf(ctx.hook), 0n);
  assert.equal(await ctx.balanceOf(ctx.manager), spend);

  // And the fee came out of the trade rather than out of the trader: they paid
  // what they asked to pay, and the curve saw 95.5% of it.
  assert.equal(await ctx.balanceOf(address(TRADER)), 10_000n * ETH - spend);
});

test("a sell pays 4.5% in the token", async () => {
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

test("an exact-output buy pays the fee on top, and it is still 4.5% of the total", async () => {
  const ctx = await venue();
  const { key } = await launch(ctx);

  const before = await ctx.balanceOf(address(TRADER));
  const bought = await buyExactOut(ctx, key, 1_000_000n * ETH, 100n * ETH);
  assert.equal(bought.reverted, false, "the exact-output buy reverted");

  const paid = before - (await ctx.balanceOf(address(TRADER)));
  const fee = (await owed(ctx, address(CREATOR), NATIVE)) + (await owed(ctx, address(TREASURY), NATIVE));

  assert.ok(fee > 0n, "an exact-output swap paid no fee");
  assert.equal(await claims(ctx, NATIVE), fee);

  // 4.5% of everything the trader parted with, to the wei the rounding allows —
  // charged at 4.5/95.5 of what the curve asked, rounded up, so it lands on
  // 4.5% of the total from above rather than below.
  const expected = (paid * FEE_BPS) / BPS;
  assert.ok(fee >= expected && fee - expected <= 1n, `fee ${fee} is not 4.5% of ${paid} (expected ~${expected})`);
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

  // 19 wei in: 4.5% of it is 0 after integer division, so the hook banks nothing
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

test("a launched token's constructor arguments can be rebuilt from the chain alone", async () => {
  const ctx = await venue();
  const { drift, token } = await launch(ctx);

  // This is exactly what verify.mjs does: it never stores what a token was
  // deployed with, it reads the drift back and reconstructs the six values.
  // If that reconstruction is wrong, Blockscout rejects the submission with
  // nothing useful to say — so the check belongs here instead.
  const rebuilt = {
    name: drift.name,
    symbol: drift.symbol,
    glacier: ctx.glacier,
    glacierAmount: drift.toPool,
    supplyWallet: drift.supplyWallet,
    supplyWalletAmount: drift.toSupplyWallet,
  };

  // What the token itself says it was built with.
  assert.equal(await ctx.read(token, tokenArtifact.abi, "name"), rebuilt.name);
  assert.equal(await ctx.read(token, tokenArtifact.abi, "symbol"), rebuilt.symbol);
  assert.equal(await ctx.read(token, tokenArtifact.abi, "toGlacier"), rebuilt.glacierAmount);
  assert.equal(await ctx.read(token, tokenArtifact.abi, "toSupplyWallet"), rebuilt.supplyWalletAmount);
  assert.equal(await ctx.read(token, tokenArtifact.abi, "supplyWallet"), rebuilt.supplyWallet);

  // And the glacier really is where that share went, which is the one argument the
  // token does not record as an address.
  assert.equal(await heldBy(ctx, token, rebuilt.glacier), 0n, "the glacier should have put its share in the pool");

  // The encoding round-trips. A silently truncated string here is the kind of
  // thing that only surfaces as a rejected verification.
  const encoded = encodeAbiParameters(
    parseAbiParameters("string, string, address, uint256, address, uint256"),
    [rebuilt.name, rebuilt.symbol, rebuilt.glacier, rebuilt.glacierAmount, rebuilt.supplyWallet, rebuilt.supplyWalletAmount],
  );
  const [name, symbol, glacier, glacierAmount, wallet, walletAmount] = decodeAbiParameters(
    parseAbiParameters("string, string, address, uint256, address, uint256"),
    encoded,
  );

  assert.equal(name, rebuilt.name);
  assert.equal(symbol, rebuilt.symbol);
  assert.equal(getAddress(glacier), rebuilt.glacier);
  assert.equal(glacierAmount, rebuilt.glacierAmount);
  assert.equal(getAddress(wallet), rebuilt.supplyWallet);
  assert.equal(walletAmount, rebuilt.supplyWalletAmount);
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

  // Holding a fifth of a supply buys no standing here either.
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

test("nobody but the launchpad can compact the glacier, and nothing takes liquidity out", async () => {
  const ctx = await venue();
  const { key } = await launch(ctx);

  const byStranger = await ctx.call(
    ctx.glacier,
    glacierArtifact.abi,
    "compact",
    [key, RANGE.tickLower, RANGE.tickUpper],
    { caller: STRANGER },
  );
  assert.equal(byStranger.reverted, true, "a stranger called compact");

  // The callbacks answer only to the pool manager.
  for (const [contract, art] of [
    [ctx.glacier, glacierArtifact],
    [ctx.hook, hookArtifact],
  ]) {
    const spoofed = await ctx.call(contract, art.abi, "unlockCallback", ["0x"], { caller: STRANGER });
    assert.equal(spoofed.reverted, true, "unlockCallback answered someone other than the pool manager");
  }

  // The strongest statement about the glacier is about what is not in it. These are
  // the calls that could move a position; none of them exists.
  const functions = glacierArtifact.abi.filter((entry) => entry.type === "function").map((entry) => entry.name);
  for (const absent of ["withdraw", "collect", "modifyLiquidity", "transfer", "rescue", "sweep", "setOwner"]) {
    assert.ok(!functions.includes(absent), `the glacier has ${absent}, so the liquidity is not locked`);
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
    `0x${snowlyArtifact.evm.bytecode.object}`,
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
