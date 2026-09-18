// What the board looks like right now. No private key, nothing sent — every
// figure comes off the chain.
//
//   node status.mjs            every notice, newest first
//   node status.mjs 1          one notice by id
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { formatEther, formatUnits } from "viem";

import { configAddress, loadConfig } from "./lib/config.mjs";
import { connect, fail } from "./lib/env.mjs";
import { readSlot0 } from "./lib/pool.mjs";
import { amountsInPosition, ethPerTokenFromSqrtPrice } from "./lib/ticks.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const artifact = (name) => JSON.parse(readFileSync(join(here, "out", `${name}.json`), "utf8"));
const factoryArtifact = artifact("HoodpadFactory");
const hookArtifact = artifact("HoodFeeHook");
const lockerArtifact = artifact("HoodpadLocker");
const tokenArtifact = artifact("HoodToken");

const only = process.argv.slice(2).find((arg) => /^\d+$/.test(arg));

const config = loadConfig();
const factory = configAddress(config, "deployed.factory", "FACTORY", { what: "the deployed board" });
const poolManager = configAddress(config, "poolManager", "POOL_MANAGER", { what: "the Uniswap v4 PoolManager" });

const { publicClient } = await connect();
const read = (address, abi, functionName, args = []) => publicClient.readContract({ address, abi, functionName, args });

const code = await publicClient.getCode({ address: factory });
if (!code || code === "0x") fail(`there is no board at ${factory} on this chain`);

const [count, lastLaunchAt, postingFee, supply, feeBps] = await read(factory, factoryArtifact.abi, "boardStats");
const [hook, locker] = await Promise.all([
  read(factory, factoryArtifact.abi, "hook"),
  read(factory, factoryArtifact.abi, "locker"),
]);

console.log(`board      ${factory}`);
console.log(`hook       ${hook}, ${Number(feeBps) / 100}% of every swap to the poster`);
console.log(`locker     ${locker}`);
console.log(`posting    ${postingFee === 0n ? "free" : `${formatEther(postingFee)} ETH`}`);
console.log(`notices    ${count}${lastLaunchAt > 0n ? `, last at ${new Date(Number(lastLaunchAt) * 1000).toISOString()}` : ""}`);
console.log(`supply     ${Number(formatUnits(supply, 18)).toLocaleString("en-US")} per launch, fixed`);

if (count === 0n) {
  console.log("\nNothing has been posted yet.");
  process.exit(0);
}

const ids = only !== undefined ? [BigInt(only)] : [...Array(Number(count)).keys()].reverse().map(BigInt);
if (only !== undefined && BigInt(only) >= count) fail(`there are ${count} notices; #${only} is not one of them`);

for (const id of ids) {
  const [notice, key] = await Promise.all([
    read(factory, factoryArtifact.abi, "noticeAt", [id]),
    read(factory, factoryArtifact.abi, "poolKeyOf", [id]),
  ]);

  const slot0 = await readSlot0(publicClient, poolManager, notice.poolId);
  const [liquidity, inPool, [hookEth, hookToken]] = await Promise.all([
    read(locker, lockerArtifact.abi, "lockedLiquidity", [notice.poolId]),
    read(notice.token, tokenArtifact.abi, "balanceOf", [poolManager]),
    read(hook, hookArtifact.abi, "claimable", [key]),
  ]);

  const held = amountsInPosition(liquidity, slot0.sqrtPriceX96, notice.tickLower, notice.tickUpper);
  const perToken = slot0.initialized ? ethPerTokenFromSqrtPrice(slot0.sqrtPriceX96) : 0n;
  const wholeSupply = supply / 10n ** 18n;

  console.log(`\n#${id}  ${notice.name} (${notice.symbol})`);
  console.log(`  token    ${notice.token}`);
  console.log(`  poster   ${notice.poster}`);
  console.log(`  pool     ${notice.poolId}`);
  console.log(`  price    ${formatEther(perToken)} ETH per token`);
  console.log(`  mcap     ${formatEther(perToken * wholeSupply)} ETH`);
  console.log(`  unsold   ${Number(formatUnits(held.tokens, 18)).toLocaleString("en-US")} ${notice.symbol}`);
  console.log(`  taken in ${formatEther(held.eth)} ETH, locked`);
  console.log(`  hook fee ${formatEther(hookEth)} ETH + ${Number(formatUnits(hookToken, 18)).toLocaleString("en-US")} ${notice.symbol} unclaimed`);
}
