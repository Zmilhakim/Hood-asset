// Deploys CratePacker to Robinhood Chain. This does not pack the crate — it puts
// the machine that packs it on chain, and `pack.mjs` pulls the lever once.
//
// The addresses come from crate.config.json, which is where they can be read
// back and reviewed. Run `npm run preflight` first; this repeats its checks but
// preflight is the one that costs nothing to fail.
//
//   DEPLOYER_KEY=0x…    the key for the address crate.config.json names
//   RPC_URL=https://…   defaults to Robinhood's own public endpoint
//
// POOL_MANAGER and TREASURY still work as one-off overrides of the file.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createWalletClient, formatEther, http } from "viem";

import { checkPoolManager, connect, fail, requireDeployerKey, requireEnv } from "./lib/env.mjs";
import { configAddress, loadConfig, recordDeployed } from "./lib/config.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const artifact = JSON.parse(readFileSync(join(here, "out", "CratePacker.json"), "utf8"));

requireEnv(["DEPLOYER_KEY"]);

const config = loadConfig();
const poolManager = configAddress(config, "poolManager", "POOL_MANAGER", {
  what: "the Uniswap v4 PoolManager this launches into",
});
const treasury = configAddress(config, "treasury", "TREASURY", {
  what: "where the trading fees go, forever",
});
const intendedDeployer = configAddress(config, "deployer", "DEPLOYER", {
  what: "the address that will deploy and pack",
});

const account = requireDeployerKey();

// The config names an address; the environment supplies a key. If they disagree,
// the wrong one is about to become `packer` — and only that one may pack.
if (account.address.toLowerCase() !== intendedDeployer.toLowerCase()) {
  fail(
    `crate.config.json expects to deploy from ${intendedDeployer}`,
    `but DEPLOYER_KEY controls ${account.address}.`,
    "",
    "Load the other key, or change the deployer in the config if this is the one",
    "you meant.",
  );
}

const { chain, publicClient } = await connect();
if (chain.id !== config.chainId) fail(`crate.config.json says chain ${config.chainId}, not ${chain.id}`);

await checkPoolManager(publicClient, poolManager);

console.log(`deployer   ${account.address}`);
console.log(`balance    ${formatEther(await publicClient.getBalance({ address: account.address }))} ETH`);
console.log(`treasury   ${treasury}`);

// The treasury is written into the seal as an immutable. There is no function
// anywhere that changes it, so a typo here is a typo forever — every fee the
// crate ever earns would go to whatever address this is.
if (treasury.toLowerCase() === account.address.toLowerCase()) {
  console.log("");
  console.log("           note: that is the deployer's own address. It works, but the");
  console.log("           key that signs deploys is a poor place to accumulate fees.");
}

const wallet = createWalletClient({ account, chain, transport: http() });
const hash = await wallet.deployContract({
  abi: artifact.abi,
  bytecode: `0x${artifact.evm.bytecode.object}`,
  args: [poolManager, treasury],
});

console.log(`tx         ${hash}`);
const receipt = await publicClient.waitForTransactionReceipt({ hash });
if (receipt.status !== "success") fail("deployment reverted");

const packer = receipt.contractAddress;
const seal = await publicClient.readContract({ address: packer, abi: artifact.abi, functionName: "seal" });

// Read the treasury back off the chain rather than trusting what was sent: this
// is the last moment it can still be changed, and changing it means redeploying.
const storedTreasury = await publicClient.readContract({
  address: seal,
  abi: [{ type: "function", name: "feeBeneficiary", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" }],
  functionName: "feeBeneficiary",
});
if (storedTreasury.toLowerCase() !== treasury.toLowerCase()) {
  fail(`the seal says its treasury is ${storedTreasury}, not ${treasury} — do not pack this one`);
}

console.log(`\npacker     ${packer}`);
console.log(`seal       ${seal}`);
console.log(`treasury   ${storedTreasury} (confirmed on chain, immutable)`);

recordDeployed(config, { packer, seal });

console.log(`\nNothing is packed yet. Check it over, then pack:\n`);
console.log(`    npm run preflight`);
console.log(`    npm run pack               # prints the plan, sends nothing`);
console.log(`    CONFIRM=pack npm run pack  # sends it`);
