// Runs the compiled contracts on a local EVM. No network, no fork — just the
// invariants that would break every launch if they were wrong.
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

const factoryArtifact = artifact("HoodpadFactory");
const tokenArtifact = artifact("HoodToken");
const lockerArtifact = artifact("PositionLocker");

const FIXED_SUPPLY = 1_000_000_000n * 10n ** 18n;
const GAS = 60_000_000n;

const DEPLOYER = new Address(hexToBytes("0x00000000000000000000000000000000000000f0"));
const STRANGER = new Address(hexToBytes("0x00000000000000000000000000000000000000f1"));
const WETH = "0x000000000000000000000000000000000000000e";
const DEX_FACTORY = "0x000000000000000000000000000000000000000d";
const POSITION_MANAGER = "0x000000000000000000000000000000000000000c";
const TREASURY = "0x000000000000000000000000000000000000000b";
const POSTING_FEE = 10n ** 15n; // 0.001 ETH

async function fresh() {
  const evm = await createEVM();

  const deploy = async (art, types, args, caller = DEPLOYER) => {
    const data = types
      ? concatHex([`0x${art.evm.bytecode.object}`, encodeAbiParameters(parseAbiParameters(types), args)])
      : `0x${art.evm.bytecode.object}`;
    const result = await evm.runCall({ caller, to: undefined, data: hexToBytes(data), gasLimit: GAS });
    assert.equal(result.execResult.exceptionError, undefined, "deployment reverted");
    return getAddress(result.createdAddress.toString());
  };

  const call = async (address, abi, functionName, args = [], caller = DEPLOYER) => {
    const result = await evm.runCall({
      caller,
      to: new Address(hexToBytes(address)),
      data: hexToBytes(encodeFunctionData({ abi, functionName, args })),
      gasLimit: GAS,
    });
    return {
      reverted: result.execResult.exceptionError !== undefined,
      returnData: bytesToHex(result.execResult.returnValue),
      decode: () =>
        decodeFunctionResult({ abi, functionName, data: bytesToHex(result.execResult.returnValue) }),
    };
  };

  return { evm, deploy, call };
}

test("predictToken matches the address CREATE2 will actually produce", async () => {
  const { deploy, call } = await fresh();

  const factory = await deploy(
    factoryArtifact,
    "address, address, address, address, uint256",
    [WETH, DEX_FACTORY, POSITION_MANAGER, TREASURY, POSTING_FEE],
  );

  const name = "Panda Hood";
  const symbol = "PANDA";
  const salt = keccak256("0x686f6f64706164");

  const onChain = await call(factory, factoryArtifact.abi, "predictToken", [name, symbol, salt]);
  assert.equal(onChain.reverted, false);

  // Recomputed independently from the standalone HoodToken artifact: if solc
  // embedded different creation code inside the factory, these diverge.
  const initCode = concatHex([
    `0x${tokenArtifact.evm.bytecode.object}`,
    encodeAbiParameters(parseAbiParameters("string, string, uint256, address"), [
      name,
      symbol,
      FIXED_SUPPLY,
      factory,
    ]),
  ]);
  const expected = getCreate2Address({ from: factory, salt, bytecodeHash: keccak256(initCode) });

  assert.equal(onChain.decode(), expected);
});

test("predictToken is sensitive to salt, name and symbol", async () => {
  const { deploy, call } = await fresh();
  const factory = await deploy(
    factoryArtifact,
    "address, address, address, address, uint256",
    [WETH, DEX_FACTORY, POSITION_MANAGER, TREASURY, POSTING_FEE],
  );

  const base = await call(factory, factoryArtifact.abi, "predictToken", ["Panda Hood", "PANDA", keccak256("0x01")]);
  const otherSalt = await call(factory, factoryArtifact.abi, "predictToken", ["Panda Hood", "PANDA", keccak256("0x02")]);
  const otherName = await call(factory, factoryArtifact.abi, "predictToken", ["Falcon Hood", "PANDA", keccak256("0x01")]);
  const otherSymbol = await call(factory, factoryArtifact.abi, "predictToken", ["Panda Hood", "FALCON", keccak256("0x01")]);

  const addresses = new Set([base, otherSalt, otherName, otherSymbol].map((r) => r.decode()));
  assert.equal(addresses.size, 4, "different arguments must predict different addresses");
});

test("a fresh board reports empty figures rather than guesses", async () => {
  const { deploy, call } = await fresh();
  const factory = await deploy(
    factoryArtifact,
    "address, address, address, address, uint256",
    [WETH, DEX_FACTORY, POSITION_MANAGER, TREASURY, POSTING_FEE],
  );

  assert.equal((await call(factory, factoryArtifact.abi, "noticeCount")).decode(), 0n);
  assert.deepEqual((await call(factory, factoryArtifact.abi, "latest", [0n, 20n])).decode(), []);

  const [tokens, drops, lastLaunch, fee, supply] = (
    await call(factory, factoryArtifact.abi, "boardStats")
  ).decode();
  assert.equal(tokens, 0n);
  assert.equal(drops, 0n);
  assert.equal(lastLaunch, 0n);
  assert.equal(fee, POSTING_FEE);
  assert.equal(supply, FIXED_SUPPLY);
});

test("the factory refuses zero addresses for the venue it launches into", async () => {
  const { evm } = await fresh();
  const data = concatHex([
    `0x${factoryArtifact.evm.bytecode.object}`,
    encodeAbiParameters(parseAbiParameters("address, address, address, address, uint256"), [
      "0x0000000000000000000000000000000000000000",
      DEX_FACTORY,
      POSITION_MANAGER,
      TREASURY,
      POSTING_FEE,
    ]),
  ]);
  const result = await evm.runCall({ caller: DEPLOYER, to: undefined, data: hexToBytes(data), gasLimit: GAS });
  assert.notEqual(result.execResult.exceptionError, undefined, "zero WETH should revert the deploy");
});

test("HoodToken mints the whole fixed supply once and can only shrink", async () => {
  const { deploy, call } = await fresh();

  const token = await deploy(tokenArtifact, "string, string, uint256, address", [
    "Panda Hood",
    "PANDA",
    FIXED_SUPPLY,
    DEPLOYER.toString(),
  ]);

  assert.equal((await call(token, tokenArtifact.abi, "totalSupply")).decode(), FIXED_SUPPLY);
  assert.equal(
    (await call(token, tokenArtifact.abi, "balanceOf", [getAddress(DEPLOYER.toString())])).decode(),
    FIXED_SUPPLY,
  );

  // There is no mint entrypoint at all.
  assert.equal(
    factoryArtifact.abi.concat(tokenArtifact.abi).some((f) => f.type === "function" && f.name === "mint"),
    false,
  );

  const burn = await call(token, tokenArtifact.abi, "burn", [FIXED_SUPPLY / 2n]);
  assert.equal(burn.reverted, false);
  assert.equal((await call(token, tokenArtifact.abi, "totalSupply")).decode(), FIXED_SUPPLY / 2n);
});

test("the locker only takes orders from its factory and never releases principal", async () => {
  const { deploy, call } = await fresh();

  // Deployed directly here, so the caller of the constructor is the "factory".
  const locker = await deploy(lockerArtifact, "address", [POSITION_MANAGER]);

  const byStranger = await call(locker, lockerArtifact.abi, "lock", [1n, getAddress(STRANGER.toString())], STRANGER);
  assert.equal(byStranger.reverted, true, "a stranger must not be able to register a position");

  const byFactory = await call(locker, lockerArtifact.abi, "lock", [1n, getAddress(STRANGER.toString())], DEPLOYER);
  assert.equal(byFactory.reverted, false);
  assert.equal(
    (await call(locker, lockerArtifact.abi, "beneficiaryOf", [1n])).decode(),
    getAddress(STRANGER.toString()),
  );

  const twice = await call(locker, lockerArtifact.abi, "lock", [1n, getAddress(DEPLOYER.toString())], DEPLOYER);
  assert.equal(twice.reverted, true, "a position must not be re-registered to someone else");

  // The surface itself is the guarantee: nothing here can move the position out.
  const escapes = lockerArtifact.abi
    .filter((f) => f.type === "function")
    .map((f) => f.name)
    .filter((n) => /decreaseLiquidity|transfer|approve|withdraw|setBeneficiary|burn/i.test(n));
  assert.deepEqual(escapes, []);
});
