// What the chain says about the crate, right now.
//
//   npm run status
//
// No key, no signing, nothing sent — this only reads. It exists because every
// other answer about a live pool comes from somewhere that might be wrong: an
// explorer that has not indexed a new v4 pool, a bot reading an aggregator that
// does not cover this chain, or a screenshot from an hour ago. The pool manager
// is the only thing that cannot be out of date about its own pool.
//
//   RPC_URL=https://…  defaults to Robinhood's own public endpoint
import { formatEther, formatUnits } from "viem";

import { connect, fail } from "./lib/env.mjs";
import { configAddress, loadConfig } from "./lib/config.mjs";
import { cratePoolKey, extsloadAbi, poolId, poolStateSlot, readSlot0 } from "./lib/pool.mjs";
import { amountsInPosition, ethPerTokenFromSqrtPrice, getSqrtPriceAtTick } from "./lib/ticks.mjs";

const packerAbi = [
  { type: "function", name: "packed", inputs: [], outputs: [{ type: "bool" }], stateMutability: "view" },
  { type: "function", name: "seal", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" },
  { type: "function", name: "SUPPLY", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  {
    type: "function",
    name: "crate",
    inputs: [],
    outputs: [
      { name: "token", type: "address" },
      { name: "poolId", type: "bytes32" },
      { name: "seal", type: "address" },
      { name: "tickLower", type: "int24" },
      { name: "tickUpper", type: "int24" },
      { name: "packedAt", type: "uint64" },
    ],
    stateMutability: "view",
  },
];

const sealAbi = [
  { type: "function", name: "feeBeneficiary", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" },
];

const erc20Abi = [
  { type: "function", name: "balanceOf", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "totalSupply", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "symbol", inputs: [], outputs: [{ type: "string" }], stateMutability: "view" },
];

/// Pool.State lays liquidity out four words in: slot0, then the two fee
/// growths, then it. v4-core's StateLibrary uses the same offset.
const LIQUIDITY_OFFSET = 3n;

const config = loadConfig();
const poolManager = configAddress(config, "poolManager", "POOL_MANAGER", { what: "the pool manager" });
const packerAddress = configAddress(config, "deployed.packer", "PACKER", { what: "the CratePacker" });

const { publicClient } = await connect();

const read = (address, abi, functionName, args = []) =>
  publicClient.readContract({ address, abi, functionName, args });

const packed = await read(packerAddress, packerAbi, "packed").catch(() => {
  fail(`${packerAddress} does not answer like a CratePacker — check deployed.packer`);
});

if (!packed) {
  console.log("");
  console.log("The crate is not packed. There is no pool, no token and nothing to price.");
  console.log("Run `npm run pack` to open it.");
  process.exit(0);
}

const [token, storedPoolId, seal, tickLower, tickUpper, packedAt] = await read(packerAddress, packerAbi, "crate");

const fee = config.launch?.fee ?? 10_000;
const tickSpacing = config.launch?.tickSpacing ?? 200;
const id = poolId(cratePoolKey({ token, fee, tickSpacing }));

// The key is rebuilt from the config rather than trusted, because a mismatch
// here means the config describes a different pool than the one that was packed
// — and every figure below would then be about the wrong pool.
if (id.toLowerCase() !== storedPoolId.toLowerCase()) {
  fail(
    "the pool this config describes is not the pool that was packed.",
    "",
    `  packed    ${storedPoolId}`,
    `  config    ${id}`,
    "",
    `launch.fee (${fee}) or launch.tickSpacing (${tickSpacing}) does not match the launch.`,
  );
}

const slot0 = await readSlot0(publicClient, poolManager, id);
if (!slot0.initialized) fail(`pool ${id} is not initialised, which should be impossible for a packed crate`);

const liquidityWord = await publicClient.readContract({
  address: poolManager,
  abi: extsloadAbi,
  functionName: "extsload",
  args: [`0x${(BigInt(poolStateSlot(id)) + LIQUIDITY_OFFSET).toString(16).padStart(64, "0")}`],
});
const liquidity = BigInt(liquidityWord) & ((1n << 128n) - 1n);

const held = amountsInPosition(liquidity, slot0.sqrtPriceX96, tickLower, tickUpper);

const [symbol, supply, beneficiary, managerEth, sealTokens] = await Promise.all([
  read(token, erc20Abi, "symbol"),
  read(token, erc20Abi, "totalSupply"),
  read(seal, sealAbi, "feeBeneficiary"),
  publicClient.getBalance({ address: poolManager }),
  read(token, erc20Abi, "balanceOf", [seal]),
]);

const ethPerToken = ethPerTokenFromSqrtPrice(slot0.sqrtPriceX96);
const wholeSupply = supply / 10n ** 18n;
const valuation = ethPerToken * wholeSupply;

const startPrice = getSqrtPriceAtTick(tickUpper);
const traded = slot0.sqrtPriceX96 !== startPrice;

console.log("");
console.log(`token      ${symbol} at ${token}`);
console.log(`supply     ${formatUnits(supply, 18)} ${symbol}`);
console.log(`pool       ${id}`);
console.log(`fee        ${fee / 10_000}% to ${beneficiary}`);
console.log(`packed     ${new Date(Number(packedAt) * 1000).toISOString()}`);
console.log("");
console.log(`price      ${formatEther(ethPerToken)} ETH per ${symbol}`);
console.log(`valuation  ${formatEther(valuation)} ETH for the whole supply`);
console.log(`tick       ${slot0.tick}, range ${tickLower} … ${tickUpper}`);
console.log("");
console.log(`in pool    ${formatEther(held.eth)} ETH`);
console.log(`           ${formatUnits(held.tokens, 18)} ${symbol} still on the shelf`);
console.log(`liquidity  ${liquidity}, held by ${seal} permanently`);
console.log("");
console.log(`treasury   ${beneficiary}`);
console.log(`           ${formatEther(await publicClient.getBalance({ address: beneficiary }))} ETH`);
console.log(`           ${formatUnits(await read(token, erc20Abi, "balanceOf", [beneficiary]), 18)} ${symbol}`);
console.log("");

if (!traded) {
  console.log("  Nobody has bought yet. The price is exactly where the crate was packed,");
  console.log("  the pool holds no ETH, and the whole supply is still in it.");
  console.log("");
  console.log("  This is also why aggregators and Telegram bots show nothing: most of them");
  console.log("  list a pair on its first swap, not when the pool is created. The token is");
  console.log("  real and tradeable — there is simply no trade to index.");
} else {
  const sold = supply - held.tokens - sealTokens;
  console.log(`  Trading. ${formatUnits(sold > 0n ? sold : 0n, 18)} ${symbol} has left the pool,`);
  console.log(`  and ${formatEther(held.eth)} ETH has gone into it and cannot come out.`);
}

// A cross-check that costs one call: the manager should hold at least the ETH
// this position accounts for. Less would mean the arithmetic above is wrong,
// which is worth knowing before anyone quotes it.
if (managerEth < held.eth) {
  console.log("");
  console.log(`  WARNING: the pool manager holds ${formatEther(managerEth)} ETH, less than the`);
  console.log("  ETH this position is calculated to hold. Do not quote these figures.");
}
