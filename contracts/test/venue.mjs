// Boots a complete launch venue inside a local EVM: a real WETH9, the real
// Uniswap v3 factory and NonfungiblePositionManager (their published artifacts,
// not stubs), and Hoodpad on top of them.
//
// The stubbed addresses in contracts.test.mjs are enough to check the rules
// Hoodpad enforces before it touches Uniswap. They cannot answer the only
// question that matters on launch day: does postToken actually mint, open a
// pool and lock the position? That needs a venue that runs.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createEVM } from "@ethereumjs/evm";
import { Account, Address, bytesToHex, hexToBytes } from "@ethereumjs/util";
import {
  concatHex,
  decodeErrorResult,
  decodeFunctionResult,
  encodeAbiParameters,
  encodeFunctionData,
  getAddress,
  parseAbiParameters,
} from "viem";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const local = (name) => JSON.parse(readFileSync(join(here, "..", "out", `${name}.json`), "utf8"));

// The published Uniswap artifacts. Their pool init code hash is asserted
// against the canonical one in launch.test.mjs — if these packages ever ship a
// recompiled pool, the position manager would compute the wrong pool address
// and every mint here would be testing a fiction.
const uniswap = (path) => require(path);

export const UNISWAP_V3_FACTORY = uniswap(
  "@uniswap/v3-core/artifacts/contracts/UniswapV3Factory.sol/UniswapV3Factory.json",
);
export const UNISWAP_V3_POOL = uniswap("@uniswap/v3-core/artifacts/contracts/UniswapV3Pool.sol/UniswapV3Pool.json");
export const POSITION_MANAGER = uniswap(
  "@uniswap/v3-periphery/artifacts/contracts/NonfungiblePositionManager.sol/NonfungiblePositionManager.json",
);
export const SWAP_ROUTER = uniswap("@uniswap/v3-periphery/artifacts/contracts/SwapRouter.sol/SwapRouter.json");

export const FACTORY_ARTIFACT = local("HoodpadFactory");
export const TOKEN_ARTIFACT = local("HoodToken");
export const LOCKER_ARTIFACT = local("PositionLocker");
export const WETH_ARTIFACT = local("WETH9");

export const FIXED_SUPPLY = 1_000_000_000n * 10n ** 18n;
export const FEE_TIER = 10000; // 1%
export const TICK_SPACING = 200; // what the 1% tier carries on a stock Uniswap factory

const GAS = 500_000_000n; // opening a pool is expensive; this is not a gas benchmark

export const POSTER = new Address(hexToBytes("0x00000000000000000000000000000000000000f0"));
export const STRANGER = new Address(hexToBytes("0x00000000000000000000000000000000000000f1"));
export const TREASURY = "0x000000000000000000000000000000000000000b";

// Every ABI in play, so a revert can be named instead of printed as bytes.
const ALL_ERRORS = [
  ...FACTORY_ARTIFACT.abi,
  ...LOCKER_ARTIFACT.abi,
  ...TOKEN_ARTIFACT.abi,
  ...POSITION_MANAGER.abi,
  ...UNISWAP_V3_FACTORY.abi,
].filter((entry) => entry.type === "error");

function explainRevert(returnData) {
  if (!returnData || returnData === "0x") return "reverted without a reason";

  // Error(string)
  if (returnData.startsWith("0x08c379a0")) {
    try {
      const [reason] = decodeErrorResult({ abi: [], data: returnData }).args ?? [];
      return `reverted: ${reason}`;
    } catch {
      /* fall through to the custom-error attempt */
    }
  }

  try {
    const decoded = decodeErrorResult({ abi: ALL_ERRORS, data: returnData });
    return `reverted: ${decoded.errorName}(${(decoded.args ?? []).join(", ")})`;
  } catch {
    return `reverted with ${returnData.slice(0, 74)}`;
  }
}

export async function bootVenue({ postingFee = 0n, treasury = TREASURY, funding = 10n ** 20n, evm: existing } = {}) {
  // An EVM can be passed in so the same state can be driven from somewhere else
  // as well — the local JSON-RPC node in tools/ runs transactions against it.
  const evm = existing ?? (await createEVM());

  for (const account of [POSTER, STRANGER]) {
    await evm.stateManager.putAccount(account, new Account(0n, funding));
  }

  const run = async ({ to, data, caller = POSTER, value = 0n }) => {
    const result = await evm.runCall({
      caller,
      to: to === undefined ? undefined : new Address(hexToBytes(to)),
      data: hexToBytes(data),
      value,
      gasLimit: GAS,
    });

    return {
      result,
      reverted: result.execResult.exceptionError !== undefined,
      returnData: bytesToHex(result.execResult.returnValue),
      gasUsed: result.execResult.executionGasUsed,
    };
  };

  const deploy = async (artifact, types, args, caller = POSTER) => {
    const bytecode = artifact.bytecode ?? `0x${artifact.evm.bytecode.object}`;
    const data = types ? concatHex([bytecode, encodeAbiParameters(parseAbiParameters(types), args)]) : bytecode;

    const { result, reverted, returnData } = await run({ to: undefined, data, caller });
    if (reverted) throw new Error(`deployment ${explainRevert(returnData)}`);

    return getAddress(result.createdAddress.toString());
  };

  // A view, or a state change whose revert is the caller's problem to inspect.
  const tryCall = async (address, abi, functionName, args = [], { caller = POSTER, value = 0n } = {}) => {
    const { reverted, returnData, gasUsed } = await run({
      to: address,
      data: encodeFunctionData({ abi, functionName, args }),
      caller,
      value,
    });

    return {
      reverted,
      returnData,
      gasUsed,
      reason: reverted ? explainRevert(returnData) : null,
      decode: () => decodeFunctionResult({ abi, functionName, data: returnData }),
    };
  };

  // The same, but a revert is a test failure rather than a result.
  const call = async (address, abi, functionName, args = [], options = {}) => {
    const outcome = await tryCall(address, abi, functionName, args, options);
    if (outcome.reverted) throw new Error(`${functionName} ${outcome.reason}`);
    return outcome;
  };

  const read = async (address, abi, functionName, args = [], options = {}) =>
    (await call(address, abi, functionName, args, options)).decode();

  const weth = await deploy(WETH_ARTIFACT);
  const dexFactory = await deploy(UNISWAP_V3_FACTORY);
  const positionManager = await deploy(
    POSITION_MANAGER,
    "address, address, address",
    [dexFactory, weth, "0x0000000000000000000000000000000000000000"],
  );

  const hoodpad = await deploy(
    FACTORY_ARTIFACT,
    "address, address, address, address, uint256",
    [weth, dexFactory, positionManager, treasury, postingFee],
  );

  const locker = await read(hoodpad, FACTORY_ARTIFACT.abi, "locker");

  return { evm, run, deploy, call, tryCall, read, weth, dexFactory, positionManager, hoodpad, locker };
}
