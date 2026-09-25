// What the chain says about the catchment, right now. Signs nothing, needs no key.
//
// It exists because every other answer about a live pool comes from somewhere
// that might be wrong — an explorer that has not indexed a new v4 pool, a bot
// reading an aggregator that does not cover this chain, or a screenshot from an
// hour ago. The pool manager is the only thing that cannot be out of date about
// its own pools.
//
//   npm run status              # the catchment, and every runoff on it
//   WHO=0x… npm run status      # …and what that address can withdraw
import { formatEther } from "viem";

import { configAddress, loadConfig } from "./lib/config.mjs";
import { connect, fail } from "./lib/env.mjs";
import { readArtifact } from "./lib/artifacts.mjs";
import { readSlot0, drainpadPoolKey, poolId } from "./lib/pool.mjs";
import { amountsInPosition, ethPerTokenFromSqrtPrice } from "./lib/ticks.mjs";

const drainpadArtifact = readArtifact("Drainpad");
const hookArtifact = readArtifact("Grate");

const config = loadConfig();
const launchpad = configAddress(config, "deployed.launchpad", "LAUNCHPAD", {
  what: "the Drainpad launchpad — run `npm run deploy` first",
});
const poolManager = configAddress(config, "poolManager", "POOL_MANAGER", {
  what: "the Uniswap v4 PoolManager the launchpad opens pools in",
});

const { publicClient } = await connect();
if (publicClient.chain.id !== config.chainId) {
  fail(`drainpad.config.json says chain ${config.chainId}, not ${publicClient.chain.id}`);
}

const read = (functionName, args = []) =>
  publicClient.readContract({ address: launchpad, abi: drainpadArtifact.abi, functionName, args });

const [hook, sump, stats] = await Promise.all([read("grate"), read("sump"), read("catchmentStats")]);
const [tokens, lastLaunch, supply, poolBps, walletBps, feeBps, creatorBps] = stats;

console.log(`launchpad  ${launchpad}`);
console.log(`grate      ${hook}`);
console.log(`sump       ${sump}`);
console.log(`\nlaunches   ${tokens}`);
console.log(`fee        ${Number(feeBps) / 100}% of every swap — ${Number(creatorBps) / 100}% of it to the creator`);
console.log(`supply     ${(supply / 10n ** 18n).toLocaleString("en-US")} per launch, fixed`);
console.log(`split      ${Number(poolBps) / 100}% sunk into the pool, ${Number(walletBps) / 100}% to the supply wallet`);
console.log(`last       ${lastLaunch === 0n ? "nothing launched yet" : new Date(Number(lastLaunch) * 1000).toISOString()}`);

const page = await read("latest", [0n, 20n]);

for (const runoff of page) {
  const key = drainpadPoolKey({ token: runoff.token, hook, tickSpacing: runoff.tickSpacing });
  const slot0 = await readSlot0(publicClient, poolManager, poolId(key));

  console.log(`\n#${runoff.id}  ${runoff.name} ($${runoff.symbol})`);
  console.log(`  token    ${runoff.token}`);
  console.log(`  creator  ${runoff.creator}`);
  console.log(`  wallet   ${runoff.supplyWallet} holds ${(runoff.toSupplyWallet / 10n ** 18n).toLocaleString("en-US")} unlocked`);
  console.log(`  pool     ${poolId(key)}`);

  if (!slot0.initialized) {
    console.log(`  price    the pool manager has no price for this pool, which should be impossible`);
    continue;
  }

  const held = amountsInPosition(runoff.liquidity, slot0.sqrtPriceX96, runoff.tickLower, runoff.tickUpper);
  console.log(`  price    ${formatEther(ethPerTokenFromSqrtPrice(slot0.sqrtPriceX96))} ETH per token`);
  console.log(`  in pool  ${formatEther(held.eth)} ETH, ${(held.tokens / 10n ** 18n).toLocaleString("en-US")} tokens unsold`);

  const owedToCreator = await publicClient.readContract({
    address: hook,
    abi: hookArtifact.abi,
    functionName: "owed",
    args: [runoff.creator, "0x0000000000000000000000000000000000000000"],
  });
  console.log(`  unclaimed ${formatEther(owedToCreator)} ETH waiting for the creator`);
}

// ETH in the pool starting at zero is correct rather than broken: a launch opens
// with its whole range below spot, so the position is entirely token until
// somebody buys. And a pair no aggregator lists is usually a pair that has never
// traded — most create the listing on the first swap, not when the pool opens.
if (page.length === 0) {
  console.log(`\nThe catchment is empty. Anyone can post to it:`);
  console.log(`\n    NAME="…" SYMBOL="…" CONFIRM=launch npm run launch`);
}

const who = process.env.WHO;
if (who) {
  const ethOwed = await publicClient.readContract({
    address: hook,
    abi: hookArtifact.abi,
    functionName: "owed",
    args: [who, "0x0000000000000000000000000000000000000000"],
  });
  console.log(`\n${who}`);
  console.log(`  owed     ${formatEther(ethOwed)} ETH`);
  for (const runoff of page) {
    const tokenOwed = await publicClient.readContract({
      address: hook,
      abi: hookArtifact.abi,
      functionName: "owed",
      args: [who, runoff.token],
    });
    if (tokenOwed > 0n) console.log(`           ${formatEther(tokenOwed)} $${runoff.symbol}`);
  }
}
