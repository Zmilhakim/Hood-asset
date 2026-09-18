// Everything that can be checked before any gas is spent. Nothing here sends a
// transaction or needs a private key — it answers "would the deploy work?" for
// free, so `deploy.mjs` is not the thing that finds out.
//
//   node preflight.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { isAddress } from "viem";

import { configAddress, loadConfig } from "./lib/config.mjs";
import { checkPoolManager, connect, fail } from "./lib/env.mjs";
import { hasRequiredFlags, hookInitCode, mineHookSalt, predictFactoryAddress } from "./lib/hook.mjs";
import { planLaunch } from "./lib/ticks.mjs";

const here = dirname(fileURLToPath(import.meta.url));

let hookArtifact;
try {
  hookArtifact = JSON.parse(readFileSync(join(here, "out", "HoodFeeHook.json"), "utf8"));
} catch {
  fail("out/ is empty — run `npm run compile` first.");
}

const config = loadConfig();
const poolManager = configAddress(config, "poolManager", "POOL_MANAGER", { what: "the Uniswap v4 PoolManager" });
const treasury = configAddress(config, "treasury", "TREASURY", { what: "where the posting fee goes" });

const { publicClient } = await connect();
await checkPoolManager(publicClient, poolManager);

// The treasury is an immutable on the factory, so a typo here is permanent. A
// checksummed address that has never been seen on chain is normal for a fresh
// hardware wallet, so this reports rather than refuses.
const treasuryBalance = await publicClient.getBalance({ address: treasury });
const treasuryCode = await publicClient.getCode({ address: treasury });
console.log(
  `treasury   ${treasury} — ${treasuryCode && treasuryCode !== "0x" ? "a contract" : "an ordinary account"}, holds ${treasuryBalance} wei`,
);

const deployer = (process.env.DEPLOYER ?? config.deployer ?? "").trim();
if (deployer === "" || !isAddress(deployer, { strict: false })) {
  console.log("deployer   not decided yet — set `deployer` in hoodpad.config.json to check the hook salt");
} else {
  const nonce = await publicClient.getTransactionCount({ address: deployer });
  const balance = await publicClient.getBalance({ address: deployer });
  const factory = predictFactoryAddress({ deployer, nonce });

  const mined = mineHookSalt({
    factory,
    initCode: hookInitCode({ bytecode: hookArtifact.evm.bytecode.object, poolManager }),
  });
  if (!hasRequiredFlags(mined.address)) fail("the mined address does not carry the hook flags — this is a bug");

  console.log(`deployer   ${deployer}, nonce ${nonce}, holds ${balance} wei`);
  console.log(`factory    ${factory} (where nonce ${nonce} lands it)`);
  console.log(`hook       ${mined.address}, salt ${mined.salt}`);
  console.log(`           low 14 bits ${(BigInt(mined.address) & 0x3fffn).toString(2).padStart(14, "0")} — afterSwap + returnDelta`);

  if (balance === 0n) console.log("\nThe deployer holds nothing. Fund it before deploying.");
}

// The tick maths, run on the configured range, so a range that cannot be
// expressed at this spacing is found now rather than at the launch.
const plan = planLaunch({
  openingEth: Number(config.launch?.openingEth ?? 1),
  ceilingEth: Number(config.launch?.ceilingEth ?? 100),
  tickSpacing: Number(config.launch?.tickSpacing ?? 200),
});
console.log(`\nrange      ${plan.effectiveOpeningCapEth} ETH -> ${plan.effectiveCeilingCapEth} ETH market cap`);
console.log(`           ticks ${plan.tickLower} to ${plan.tickUpper}, opening at ${plan.tickUpper}`);
console.log(`fee        ${Number(config.launch?.fee ?? 10000) / 10_000}% LP + 5% hook = what a trader pays`);

console.log("\nNothing was sent, and nothing needed a key.");
