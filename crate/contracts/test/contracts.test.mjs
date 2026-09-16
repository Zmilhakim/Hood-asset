// Runs the compiled contracts on a local EVM against a Uniswap stand-in. No
// network, no fork — the crate is actually packed here, and then the tests try
// to get something back out of it.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";

import { createEVM } from "@ethereumjs/evm";
import { Address, hexToBytes, bytesToHex } from "@ethereumjs/util";
import {
  concatHex,
  decodeFunctionResult,
  encodeAbiParameters,
  encodeFunctionData,
  getAddress,
  getCreate2Address,
  keccak256,
  parseAbiParameters,
} from "viem";

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "out");
const artifact = (name) => JSON.parse(readFileSync(join(out, `${name}.json`), "utf8"));

const packerArtifact = artifact("CratePacker");
const sealArtifact = artifact("CrateSeal");
const tokenArtifact = artifact("CrateToken");
const erc20Artifact = artifact("MockERC20");
const dexArtifact = artifact("MockDexFactory");
const managerArtifact = artifact("MockPositionManager");

const SUPPLY = 1_000_000_000n * 10n ** 18n;
const NAME = "Crate";
const SYMBOL = "CRATE";
const FEE = 10_000; // 1%, tick spacing 200
const SPACING = 200;
const PRICE_1_1 = 79228162514264337593543950336n; // sqrt(1) << 96
const GAS = 60_000_000n;

const PACKER = new Address(hexToBytes("0x00000000000000000000000000000000000000f0"));
const STRANGER = new Address(hexToBytes("0x00000000000000000000000000000000000000f1"));
const ZERO = "0x0000000000000000000000000000000000000000";

async function fresh() {
  const evm = await createEVM();

  const deploy = async (art, types, args, caller = PACKER) => {
    const data = types
      ? concatHex([`0x${art.evm.bytecode.object}`, encodeAbiParameters(parseAbiParameters(types), args)])
      : `0x${art.evm.bytecode.object}`;
    const result = await evm.runCall({ caller, to: undefined, data: hexToBytes(data), gasLimit: GAS });
    assert.equal(result.execResult.exceptionError, undefined, "deployment reverted");
    return getAddress(result.createdAddress.toString());
  };

  const call = async (address, abi, functionName, args = [], caller = PACKER) => {
    const result = await evm.runCall({
      caller,
      to: new Address(hexToBytes(address)),
      data: hexToBytes(encodeFunctionData({ abi, functionName, args })),
      gasLimit: GAS,
    });
    return {
      reverted: result.execResult.exceptionError !== undefined,
      decode: () => decodeFunctionResult({ abi, functionName, data: bytesToHex(result.execResult.returnValue) }),
    };
  };

  const read = async (address, abi, functionName, args = []) => {
    const result = await call(address, abi, functionName, args);
    assert.equal(result.reverted, false, `${functionName} reverted`);
    return result.decode();
  };

  return { evm, deploy, call, read };
}

/** A packer wired to the mock venue, with nothing packed yet. */
async function venue({ tick = 0 } = {}) {
  const ctx = await fresh();

  const weth = await ctx.deploy(erc20Artifact, "string, string", ["Wrapped Ether", "WETH"]);
  const dex = await ctx.deploy(dexArtifact, null, null);
  const manager = await ctx.deploy(managerArtifact, null, null);

  await ctx.call(dex, dexArtifact.abi, "setNextTick", [tick]);

  const packer = await ctx.deploy(packerArtifact, "address, address, address", [weth, dex, manager]);
  const seal = await ctx.read(packer, packerArtifact.abi, "seal");

  return { ...ctx, weth, dex, manager, packer, seal };
}

/**
 * Ticks that sit entirely on the token's side of `tick`, which is the only
 * shape the packer accepts — and which side that is depends on whether the
 * token address sorts below WETH.
 */
function singleSidedRange(token, weth, tick = 0) {
  const aligned = Math.trunc(tick / SPACING) * SPACING;
  return token.toLowerCase() < weth.toLowerCase()
    ? { tickLower: aligned + SPACING, tickUpper: aligned + 100 * SPACING }
    : { tickLower: aligned - 100 * SPACING, tickUpper: aligned - SPACING };
}

async function packOnce(ctx, { salt = keccak256("0x6372617465"), tick = 0, range } = {}) {
  const token = await ctx.read(ctx.packer, packerArtifact.abi, "predictToken", [salt]);
  const ticks = range ?? singleSidedRange(token, ctx.weth, tick);
  const result = await ctx.call(ctx.packer, packerArtifact.abi, "pack", [
    { salt, sqrtPriceX96: PRICE_1_1, fee: FEE, ...ticks },
  ]);
  return { token, ticks, result };
}

test("predictToken matches the address CREATE2 will actually produce", async () => {
  const ctx = await venue();

  const salt = keccak256("0x6372617465");
  const onChain = await ctx.read(ctx.packer, packerArtifact.abi, "predictToken", [salt]);

  // Recomputed from the standalone CrateToken artifact: if solc embedded
  // different creation code inside the packer, these diverge.
  const initCode = concatHex([
    `0x${tokenArtifact.evm.bytecode.object}`,
    encodeAbiParameters(parseAbiParameters("string, string, uint256, address"), [NAME, SYMBOL, SUPPLY, ctx.packer]),
  ]);
  assert.equal(onChain, getCreate2Address({ from: ctx.packer, salt, bytecodeHash: keccak256(initCode) }));

  const other = await ctx.read(ctx.packer, packerArtifact.abi, "predictToken", [keccak256("0x02")]);
  assert.notEqual(other, onChain, "a different salt must predict a different address");
});

test("packing mints the whole supply straight into the sealed pool", async () => {
  const ctx = await venue();
  const { token, result } = await packOnce(ctx);
  assert.equal(result.reverted, false, "pack reverted");

  assert.equal(await ctx.read(ctx.packer, packerArtifact.abi, "token"), token);
  assert.equal(await ctx.read(token, tokenArtifact.abi, "name"), NAME);
  assert.equal(await ctx.read(token, tokenArtifact.abi, "symbol"), SYMBOL);
  assert.equal(await ctx.read(token, tokenArtifact.abi, "totalSupply"), SUPPLY);

  // Every last unit is in the pool. Not the packer, not the caller, not a
  // treasury — there is nowhere else for it to be.
  assert.equal(await ctx.read(token, tokenArtifact.abi, "balanceOf", [ctx.manager]), SUPPLY);
  assert.equal(await ctx.read(token, tokenArtifact.abi, "balanceOf", [ctx.packer]), 0n);
  assert.equal(await ctx.read(token, tokenArtifact.abi, "balanceOf", [ctx.seal]), 0n);
  assert.equal(await ctx.read(token, tokenArtifact.abi, "balanceOf", [getAddress(PACKER.toString())]), 0n);

  // And the position that represents it belongs to the seal.
  const positionId = await ctx.read(ctx.packer, packerArtifact.abi, "positionId");
  assert.equal(await ctx.read(ctx.manager, managerArtifact.abi, "ownerOf", [positionId]), ctx.seal);
  assert.equal(await ctx.read(ctx.seal, sealArtifact.abi, "isSealed"), true);
  assert.equal(await ctx.read(ctx.seal, sealArtifact.abi, "positionId"), positionId);

  // No allowance is left standing after the mint.
  assert.equal(await ctx.read(token, tokenArtifact.abi, "allowance", [ctx.packer, ctx.manager]), 0n);

  const [token_, pool_, seal_, positionId_, packedAt_, supply_] = await ctx.read(
    ctx.packer,
    packerArtifact.abi,
    "crate",
  );
  assert.equal(token_, token);
  assert.notEqual(pool_, ZERO);
  assert.equal(seal_, ctx.seal);
  assert.equal(positionId_, positionId);
  assert.equal(packedAt_, 0n); // the local EVM's block timestamp, not a claim about time
  assert.equal(supply_, SUPPLY);
});

test("the crate is packed once and only by the packer", async () => {
  const ctx = await venue();

  const salt = keccak256("0x6372617465");
  const token = await ctx.read(ctx.packer, packerArtifact.abi, "predictToken", [salt]);
  const ticks = singleSidedRange(token, ctx.weth);
  const params = { salt, sqrtPriceX96: PRICE_1_1, fee: FEE, ...ticks };

  const byStranger = await ctx.call(ctx.packer, packerArtifact.abi, "pack", [params], STRANGER);
  assert.equal(byStranger.reverted, true, "a stranger must not be able to pack the crate");
  assert.equal(await ctx.read(ctx.packer, packerArtifact.abi, "packed"), false);

  assert.equal((await ctx.call(ctx.packer, packerArtifact.abi, "pack", [params])).reverted, false);
  assert.equal(await ctx.read(ctx.packer, packerArtifact.abi, "packed"), true);

  // A second salt would be a second token. There is no second token.
  const again = await ctx.call(ctx.packer, packerArtifact.abi, "pack", [
    { ...params, salt: keccak256("0x02") },
  ]);
  assert.equal(again.reverted, true, "the crate must not be packable twice");

  const stillTheSame = await ctx.read(ctx.packer, packerArtifact.abi, "token");
  assert.equal(stillTheSame, token);
});

test("a range that straddles spot is rejected, so the pool can never be given ETH", async () => {
  const ctx = await venue({ tick: 0 });
  const salt = keccak256("0x6372617465");
  const token = await ctx.read(ctx.packer, packerArtifact.abi, "predictToken", [salt]);

  const straddling = { tickLower: -100 * SPACING, tickUpper: 100 * SPACING };
  const result = await ctx.call(ctx.packer, packerArtifact.abi, "pack", [
    { salt, sqrtPriceX96: PRICE_1_1, fee: FEE, ...straddling },
  ]);
  assert.equal(result.reverted, true, "a range across spot must revert");
  assert.equal(await ctx.read(ctx.packer, packerArtifact.abi, "packed"), false);

  // The wrong side of spot is rejected too — that is the side that would make
  // the position manager ask for ETH this launch does not have.
  const right = singleSidedRange(token, ctx.weth);
  const wrongSide = { tickLower: -right.tickUpper, tickUpper: -right.tickLower };
  const flipped = await ctx.call(ctx.packer, packerArtifact.abi, "pack", [
    { salt, sqrtPriceX96: PRICE_1_1, fee: FEE, ...wrongSide },
  ]);
  assert.equal(flipped.reverted, true, "the far side of spot must revert too");

  // And a failed attempt leaves the crate packable, so a bad range is a retry
  // rather than a dead packer.
  const ok = await packOnce(ctx, { salt });
  assert.equal(ok.result.reverted, false);
});

test("the range has to line up with the tier it is opened in", async () => {
  const ctx = await venue();
  const salt = keccak256("0x6372617465");
  const token = await ctx.read(ctx.packer, packerArtifact.abi, "predictToken", [salt]);
  const { tickLower, tickUpper } = singleSidedRange(token, ctx.weth);

  const unaligned = await ctx.call(ctx.packer, packerArtifact.abi, "pack", [
    { salt, sqrtPriceX96: PRICE_1_1, fee: FEE, tickLower: tickLower + 1, tickUpper },
  ]);
  assert.equal(unaligned.reverted, true, "ticks off the spacing grid must revert");

  const inverted = await ctx.call(ctx.packer, packerArtifact.abi, "pack", [
    { salt, sqrtPriceX96: PRICE_1_1, fee: FEE, tickLower: tickUpper, tickUpper: tickLower },
  ]);
  assert.equal(inverted.reverted, true, "an upside-down range must revert");

  const unknownTier = await ctx.call(ctx.packer, packerArtifact.abi, "pack", [
    { salt, sqrtPriceX96: PRICE_1_1, fee: 1234, tickLower, tickUpper },
  ]);
  assert.equal(unknownTier.reverted, true, "a fee tier the venue does not run must revert");
});

test("a pool somebody else opened first is used at the price it already has", async () => {
  const ctx = await venue({ tick: 0 });

  const salt = keccak256("0x6372617465");
  const token = await ctx.read(ctx.packer, packerArtifact.abi, "predictToken", [salt]);

  // A front-runner creates and prices the pool before the packer gets there,
  // moving spot past the range the packer had computed. Which direction that is
  // depends on which side of the pool the token sorts onto.
  const tokenIsToken0 = token.toLowerCase() < ctx.weth.toLowerCase();
  const jumpedTick = tokenIsToken0 ? 100 * SPACING : -100 * SPACING;
  await ctx.call(ctx.dex, dexArtifact.abi, "setNextTick", [jumpedTick], STRANGER);
  const [token0, token1] = tokenIsToken0 ? [token, ctx.weth] : [ctx.weth, token];
  await ctx.call(ctx.dex, dexArtifact.abi, "createPool", [token0, token1, FEE], STRANGER);
  const preexisting = await ctx.read(ctx.dex, dexArtifact.abi, "getPool", [token0, token1, FEE]);
  await ctx.call(preexisting, [{ type: "function", name: "initialize", inputs: [{ type: "uint160" }], outputs: [], stateMutability: "nonpayable" }], "initialize", [PRICE_1_1], STRANGER);

  // The range computed for the old price is now on the wrong side of theirs.
  const stale = await ctx.call(ctx.packer, packerArtifact.abi, "pack", [
    { salt, sqrtPriceX96: PRICE_1_1, fee: FEE, ...singleSidedRange(token, ctx.weth, 0) },
  ]);
  assert.equal(stale.reverted, true, "a range computed for a different price must revert");

  // Recomputed against the price that is actually there, it packs — into the
  // pool that already existed, rather than a second one.
  const { result } = await packOnce(ctx, { salt, tick: jumpedTick });
  assert.equal(result.reverted, false);
  assert.equal(await ctx.read(ctx.packer, packerArtifact.abi, "pool"), preexisting);
});

test("the seal takes the position once, from the packer, and never re-labels it", async () => {
  const ctx = await venue();
  await packOnce(ctx);

  const byStranger = await ctx.call(ctx.seal, sealArtifact.abi, "sealPosition", [7n, ctx.weth, ctx.weth], STRANGER);
  assert.equal(byStranger.reverted, true, "a stranger must not be able to point the seal at a position");

  // Not even the packer gets a second go: the crate is shut.
  const byPacker = await ctx.call(ctx.seal, sealArtifact.abi, "sealPosition", [7n, ctx.weth, ctx.weth], PACKER);
  assert.equal(byPacker.reverted, true, "the position must not be re-registered");

  assert.equal(await ctx.read(ctx.seal, sealArtifact.abi, "positionId"), 1n);
});

test("fees collected by the seal go back into the position, not out of it", async () => {
  const ctx = await venue();
  const { token } = await packOnce(ctx);

  const positionId = await ctx.read(ctx.packer, packerArtifact.abi, "positionId");
  const before = await ctx.read(ctx.manager, managerArtifact.abi, "liquidityOf", [positionId]);

  // The venue owes the position fees on both sides. It can pay the CRATE side
  // out of the supply it already holds; the WETH side is minted to it here.
  const fee0 = 10n ** 18n;
  const fee1 = 5n * 10n ** 17n;
  await ctx.call(ctx.weth, erc20Artifact.abi, "mint", [ctx.manager, fee1]);
  const [amount0, amount1] =
    token.toLowerCase() < ctx.weth.toLowerCase() ? [fee0, fee1] : [fee1, fee0];
  await ctx.call(ctx.manager, managerArtifact.abi, "accrueFees", [positionId, amount0, amount1]);

  // Permissionless: a stranger pays the gas and gets nothing for it.
  const compounded = await ctx.call(ctx.seal, sealArtifact.abi, "compound", [], STRANGER);
  assert.equal(compounded.reverted, false, "compound reverted");

  const after = await ctx.read(ctx.manager, managerArtifact.abi, "liquidityOf", [positionId]);
  assert.equal(after, before + amount0 + amount1, "the fees did not end up in the position");

  // Nothing stuck to anyone on the way through.
  assert.equal(await ctx.read(token, tokenArtifact.abi, "balanceOf", [ctx.seal]), 0n);
  assert.equal(await ctx.read(ctx.weth, erc20Artifact.abi, "balanceOf", [ctx.seal]), 0n);
  assert.equal(await ctx.read(ctx.weth, erc20Artifact.abi, "balanceOf", [getAddress(STRANGER.toString())]), 0n);
  assert.equal(await ctx.read(token, tokenArtifact.abi, "balanceOf", [getAddress(STRANGER.toString())]), 0n);
  assert.equal(await ctx.read(ctx.weth, erc20Artifact.abi, "allowance", [ctx.seal, ctx.manager]), 0n);

  // With nothing owed, there is nothing to do.
  assert.equal((await ctx.call(ctx.seal, sealArtifact.abi, "compound", [], STRANGER)).reverted, true);
});

test("what one side of a compound cannot absorb stays inside the seal", async () => {
  const ctx = await venue();
  const { token } = await packOnce(ctx);

  // A position sitting entirely on one side of spot only takes token0.
  await ctx.call(ctx.manager, managerArtifact.abi, "setConsumeToken1", [false]);

  const positionId = await ctx.read(ctx.packer, packerArtifact.abi, "positionId");
  const fee = 10n ** 18n;
  await ctx.call(ctx.weth, erc20Artifact.abi, "mint", [ctx.manager, fee]);
  await ctx.call(ctx.manager, managerArtifact.abi, "accrueFees", [positionId, fee, fee]);

  assert.equal((await ctx.call(ctx.seal, sealArtifact.abi, "compound", [], STRANGER)).reverted, false);

  const [token0] = token.toLowerCase() < ctx.weth.toLowerCase() ? [token, ctx.weth] : [ctx.weth, token];
  const leftover = token0 === token ? ctx.weth : token;
  const leftoverAbi = leftover === token ? tokenArtifact.abi : erc20Artifact.abi;

  assert.equal(await ctx.read(leftover, leftoverAbi, "balanceOf", [ctx.seal]), fee, "the unused side left the seal");
  assert.equal(await ctx.read(leftover, leftoverAbi, "allowance", [ctx.seal, ctx.manager]), 0n);
});

test("the seal has no way out, and the packer has no way back in", () => {
  const sealFunctions = sealArtifact.abi.filter((f) => f.type === "function").map((f) => f.name);

  const escapes = sealFunctions.filter((name) =>
    /decreaseLiquidity|transfer|withdraw|rescue|sweep|recover|setApproval|burn|renounce|owner/i.test(name),
  );
  assert.deepEqual(escapes, [], "an exit appeared on the seal");

  // `approve` exists only inside compound, around the position manager call —
  // it is not something an outsider can reach.
  assert.equal(sealFunctions.includes("approve"), false);
  assert.deepEqual(sealFunctions.filter((n) => /721/i.test(n)), ["onERC721Received"]);

  // And the packer keeps no lever over the token or the pool after packing.
  const packerFunctions = packerArtifact.abi.filter((f) => f.type === "function").map((f) => f.name);
  const levers = packerFunctions.filter((name) =>
    /mint|withdraw|rescue|sweep|recover|setFee|owner|renounce|upgrade/i.test(name),
  );
  assert.deepEqual(levers, [], "a lever appeared on the packer");
});

test("CrateToken mints its supply once and can only ever shrink", async () => {
  const ctx = await fresh();

  const holder = getAddress(PACKER.toString());
  const token = await ctx.deploy(tokenArtifact, "string, string, uint256, address", [NAME, SYMBOL, SUPPLY, holder]);

  assert.equal(await ctx.read(token, tokenArtifact.abi, "totalSupply"), SUPPLY);
  assert.equal(await ctx.read(token, tokenArtifact.abi, "balanceOf", [holder]), SUPPLY);

  // There is no mint entrypoint at all.
  assert.equal(tokenArtifact.abi.some((f) => f.type === "function" && f.name === "mint"), false);

  // Burning spends the caller's own balance and nobody else's.
  assert.equal((await ctx.call(token, tokenArtifact.abi, "burn", [1n], STRANGER)).reverted, true);
  assert.equal((await ctx.call(token, tokenArtifact.abi, "burn", [SUPPLY / 2n])).reverted, false);
  assert.equal(await ctx.read(token, tokenArtifact.abi, "totalSupply"), SUPPLY / 2n);
});

test("the packer refuses a venue that is not there", async () => {
  const ctx = await fresh();
  const weth = await ctx.deploy(erc20Artifact, "string, string", ["Wrapped Ether", "WETH"]);
  const dex = await ctx.deploy(dexArtifact, null, null);
  const manager = await ctx.deploy(managerArtifact, null, null);

  for (const args of [
    [ZERO, dex, manager],
    [weth, ZERO, manager],
    [weth, dex, ZERO],
  ]) {
    const data = concatHex([
      `0x${packerArtifact.evm.bytecode.object}`,
      encodeAbiParameters(parseAbiParameters("address, address, address"), args),
    ]);
    const result = await ctx.evm.runCall({ caller: PACKER, to: undefined, data: hexToBytes(data), gasLimit: GAS });
    assert.notEqual(result.execResult.exceptionError, undefined, `zero address in ${JSON.stringify(args)} should revert`);
  }
});
