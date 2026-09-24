// What the chain says about the shelf, right now. Signs nothing, needs no key.
//
// It exists because every other answer about a live pool comes from somewhere
// that might be wrong — an explorer that has not indexed a new v4 pool, a bot
// reading an aggregator that does not cover this chain, or a screenshot from an
// hour ago. The pool manager is the only thing that cannot be out of date about
// its own pools.
//
//   npm run status              # the shelf, and every piece on it
//   WHO=0x… npm run status      # …and what that address can withdraw
import { formatEther } from "viem";

import { configAddress, loadConfig } from "./lib/config.mjs";
import { connect, fail } from "./lib/env.mjs";
import { readArtifact } from "./lib/artifacts.mjs";
import { readSlot0, clayspadPoolKey, poolId } from "./lib/pool.mjs";
import { amountsInPosition, ethPerTokenFromSqrtPrice } from "./lib/ticks.mjs";

const clayspadArtifact = readArtifact("Clayspad");
const hookArtifact = readArtifact("ClayHook");

const config = loadConfig();
const launchpad = configAddress(config, "deployed.launchpad", "LAUNCHPAD", {
  what: "the Clayspad launchpad — run `npm run deploy` first",
});
const poolManager = configAddress(config, "poolManager", "POOL_MANAGER", {
  what: "the Uniswap v4 PoolManager the launchpad opens pools in",
});

const { publicClient } = await connect();
if (publicClient.chain.id !== config.chainId) {
  fail(`clayspad.config.json says chain ${config.chainId}, not ${publicClient.chain.id}`);
}

const read = (functionName, args = []) =>
  publicClient.readContract({ address: launchpad, abi: clayspadArtifact.abi, functionName, args });

const [hook, kiln, stats] = await Promise.all([read("hook"), read("kiln"), read("shelfStats")]);
const [tokens, lastLaunch, supply, poolBps, walletBps, feeBps, creatorBps] = stats;

console.log(`launchpad  ${launchpad}`);
console.log(`hook       ${hook}`);
console.log(`kiln       ${kiln}`);
console.log(`\nlaunches   ${tokens}`);
console.log(`fee        ${Number(feeBps) / 100}% of every swap — ${Number(creatorBps) / 100}% of it to the creator`);
console.log(`supply     ${(supply / 10n ** 18n).toLocaleString("en-US")} per launch, fixed`);
console.log(`split      ${Number(poolBps) / 100}% fired into the pool, ${Number(walletBps) / 100}% to the supply wallet`);
console.log(`last       ${lastLaunch === 0n ? "nothing launched yet" : new Date(Number(lastLaunch) * 1000).toISOString()}`);

const page = await read("latest", [0n, 20n]);

for (const piece of page) {
  const key = clayspadPoolKey({ token: piece.token, hook, tickSpacing: piece.tickSpacing });
  const slot0 = await readSlot0(publicClient, poolManager, poolId(key));

  console.log(`\n#${piece.id}  ${piece.name} ($${piece.symbol})`);
  console.log(`  token    ${piece.token}`);
  console.log(`  creator  ${piece.creator}`);
  console.log(`  wallet   ${piece.supplyWallet} holds ${(piece.toSupplyWallet / 10n ** 18n).toLocaleString("en-US")} unlocked`);
  console.log(`  pool     ${poolId(key)}`);

  if (!slot0.initialized) {
    console.log(`  price    the pool manager has no price for this pool, which should be impossible`);
    continue;
  }

  const held = amountsInPosition(piece.liquidity, slot0.sqrtPriceX96, piece.tickLower, piece.tickUpper);
  console.log(`  price    ${formatEther(ethPerTokenFromSqrtPrice(slot0.sqrtPriceX96))} ETH per token`);
  console.log(`  in pool  ${formatEther(held.eth)} ETH, ${(held.tokens / 10n ** 18n).toLocaleString("en-US")} tokens unsold`);

  const owedToCreator = await publicClient.readContract({
    address: hook,
    abi: hookArtifact.abi,
    functionName: "owed",
    args: [piece.creator, "0x0000000000000000000000000000000000000000"],
  });
  console.log(`  unclaimed ${formatEther(owedToCreator)} ETH waiting for the creator`);
}

// ETH in the pool starting at zero is correct rather than broken: a launch opens
// with its whole range below spot, so the position is entirely token until
// somebody buys. And a pair no aggregator lists is usually a pair that has never
// traded — most create the listing on the first swap, not when the pool opens.
if (page.length === 0) {
  console.log(`\nThe shelf is empty. Anyone can post to it:`);
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
  for (const piece of page) {
    const tokenOwed = await publicClient.readContract({
      address: hook,
      abi: hookArtifact.abi,
      functionName: "owed",
      args: [who, piece.token],
    });
    if (tokenOwed > 0n) console.log(`           ${formatEther(tokenOwed)} $${piece.symbol}`);
  }
}
