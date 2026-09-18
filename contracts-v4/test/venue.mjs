// The venue the tests run against: a local EVM carrying Uniswap's own
// PoolManager, deployed as it ships, with the Hoodpad board on top of it.
//
// Nothing here is a mock of Uniswap. A launch in these tests really mints, really
// opens a pool, really dispatches into the hook on every swap, and really locks
// the position — so the suite can assert the things only a working venue can
// settle, rather than the things a stand-in was written to agree with.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

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

import { hookInitCode, mineHookSalt, predictFactoryAddress } from "../lib/hook.mjs";
import { hoodPoolKey } from "../lib/pool.mjs";
import { planLaunch } from "../lib/ticks.mjs";

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "out");
export const artifact = (name) => JSON.parse(readFileSync(join(out, `${name}.json`), "utf8"));

export const factoryArtifact = artifact("HoodpadFactory");
export const hookArtifact = artifact("HoodFeeHook");
export const lockerArtifact = artifact("HoodpadLocker");
export const tokenArtifact = artifact("HoodToken");
export const managerArtifact = artifact("TestPoolManager");
export const routerArtifact = artifact("TestSwapRouter");

export const SUPPLY = 1_000_000_000n * 10n ** 18n;
export const FEE = 10_000; // 1% LP fee, the same tier the v3 board used
export const TICK_SPACING = 200;
export const HOOK_FEE_BPS = 500n; // 5%, and a constant in the hook
export const GAS = 500_000_000n;

export const MIN_SQRT_PRICE = 4295128739n;
export const MAX_SQRT_PRICE = 1461446703485210103287273052203988822378723970342n;
export const NATIVE = "0x0000000000000000000000000000000000000000";

export const DEPLOYER = new Address(hexToBytes("0x00000000000000000000000000000000000000f0"));
export const POSTER = new Address(hexToBytes("0x00000000000000000000000000000000000000f1"));
export const TRADER = new Address(hexToBytes("0x00000000000000000000000000000000000000f2"));
export const TREASURY = new Address(hexToBytes("0x00000000000000000000000000000000000000f3"));
export const STRANGER = new Address(hexToBytes("0x00000000000000000000000000000000000000f4"));

export const address = (account) => getAddress(account.toString());

/** The launch these tests use: the same 1 ETH -> 100 ETH the v3 board defaults to. */
export const PLAN = planLaunch({ openingEth: 1, ceilingEth: 100, tickSpacing: TICK_SPACING });

export const launchParams = (overrides = {}) => ({
  name: "Test Hood",
  symbol: "TESTHOOD",
  imageURI: "ipfs://image",
  blurb: "a test notice",
  link: "https://example.invalid",
  sqrtPriceX96: PLAN.sqrtPriceX96,
  tickLower: PLAN.tickLower,
  tickUpper: PLAN.tickUpper,
  tickSpacing: TICK_SPACING,
  fee: FEE,
  ...overrides,
});

async function fresh() {
  // Cancun or later: the pool manager keeps its lock and its deltas in transient
  // storage, so anything older cannot run it at all.
  const evm = await createEVM({ common: new Common({ chain: Mainnet, hardfork: Hardfork.Cancun }) });

  for (const account of [DEPLOYER, POSTER, TRADER, TREASURY, STRANGER]) {
    await evm.stateManager.putAccount(account, createAccount({ nonce: 0n, balance: 10_000n * 10n ** 18n }));
  }

  const nonceOf = async (account) => (await evm.stateManager.getAccount(account))?.nonce ?? 0n;

  const deploy = async (art, types, args, caller = DEPLOYER) => {
    const data = types
      ? concatHex([`0x${art.evm.bytecode.object}`, encodeAbiParameters(parseAbiParameters(types), args)])
      : `0x${art.evm.bytecode.object}`;
    const result = await evm.runCall({ caller, to: undefined, data: hexToBytes(data), gasLimit: GAS });
    assert.equal(result.execResult.exceptionError, undefined, "deployment reverted");
    return getAddress(result.createdAddress.toString());
  };

  const call = async (to, abi, functionName, args = [], { caller = DEPLOYER, value = 0n } = {}) => {
    const result = await evm.runCall({
      caller,
      to: new Address(hexToBytes(to)),
      data: hexToBytes(encodeFunctionData({ abi, functionName, args })),
      gasLimit: GAS,
      value,
    });
    return {
      reverted: result.execResult.exceptionError !== undefined,
      returnValue: bytesToHex(result.execResult.returnValue),
      decode: () => decodeFunctionResult({ abi, functionName, data: bytesToHex(result.execResult.returnValue) }),
    };
  };

  const read = async (to, abi, functionName, args = []) => {
    const result = await call(to, abi, functionName, args);
    assert.equal(result.reverted, false, `${functionName} reverted`);
    return result.decode();
  };

  const balanceOf = async (who) => (await evm.stateManager.getAccount(new Address(hexToBytes(who))))?.balance ?? 0n;

  return { evm, nonceOf, deploy, call, read, balanceOf };
}

/**
 * A pool manager, a deployed board, and something that can trade against it.
 *
 * The hook's salt is mined here rather than hard-coded, because the address it
 * has to hit depends on the factory's address, which depends on the deployer's
 * nonce in this particular EVM. Mining it the way `deploy.mjs` does is also the
 * only way the suite proves that path works at all.
 */
export async function board() {
  const ctx = await fresh();

  const manager = await ctx.deploy(managerArtifact, "address", [address(DEPLOYER)]);
  const router = await ctx.deploy(routerArtifact, "address", [manager]);

  const predicted = predictFactoryAddress({ deployer: address(DEPLOYER), nonce: await ctx.nonceOf(DEPLOYER) });
  const { salt, address: expectedHook } = mineHookSalt({
    factory: predicted,
    initCode: hookInitCode({ bytecode: hookArtifact.evm.bytecode.object, poolManager: manager }),
  });

  const factory = await ctx.deploy(factoryArtifact, "address, address, uint256, bytes32", [
    manager,
    address(TREASURY),
    0n,
    salt,
  ]);
  assert.equal(factory, predicted, "the factory did not land where the salt was mined for");

  const hook = await ctx.read(factory, factoryArtifact.abi, "hook");
  const locker = await ctx.read(factory, factoryArtifact.abi, "locker");
  assert.equal(hook, expectedHook, "the hook did not land on the mined address");

  return { ...ctx, manager, router, factory, hook, locker, salt };
}

/** Post a notice. Returns the token and the pool key it opened. */
export async function post(ctx, params = launchParams(), caller = POSTER, value = 0n) {
  const result = await ctx.call(ctx.factory, factoryArtifact.abi, "postToken", [params], { caller, value });
  if (result.reverted) return { reverted: true };

  const id = (await ctx.read(ctx.factory, factoryArtifact.abi, "tokenCount")) - 1n;
  const notice = await ctx.read(ctx.factory, factoryArtifact.abi, "noticeAt", [id]);
  const key = hoodPoolKey({ token: notice.token, fee: notice.fee, tickSpacing: notice.tickSpacing, hook: ctx.hook });

  return { reverted: false, id, notice, token: notice.token, key, poolId: notice.poolId };
}

/** Buy the token with ETH: currency0 in, currency1 out, which walks the price down. */
export async function buy(ctx, key, ethIn, caller = TRADER) {
  return ctx.call(
    ctx.router,
    routerArtifact.abi,
    "swap",
    [key, { zeroForOne: true, amountSpecified: -ethIn, sqrtPriceLimitX96: MIN_SQRT_PRICE + 1n }],
    { caller, value: ethIn },
  );
}

/** Sell the token back for ETH, which is the only way the ETH side earns anything. */
export async function sell(ctx, key, token, amountIn, caller = TRADER) {
  const approved = await ctx.call(token, tokenArtifact.abi, "approve", [ctx.router, amountIn], { caller });
  assert.equal(approved.reverted, false, "approve reverted");

  return ctx.call(
    ctx.router,
    routerArtifact.abi,
    "swap",
    [key, { zeroForOne: false, amountSpecified: -amountIn, sqrtPriceLimitX96: MAX_SQRT_PRICE - 1n }],
    { caller },
  );
}
