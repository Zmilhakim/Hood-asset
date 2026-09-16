// Deploys CratePacker to Robinhood Chain. This does not pack the crate — it puts
// the machine that packs it on chain, and `pack.mjs` pulls the lever once.
//
// The pool manager is not hardcoded on purpose: point this at whichever Uniswap
// v4 deployment you intend to launch into, and check it yourself before you
// spend gas.
//
//   DEPLOYER_KEY=0x…    the account that pays, and the only one that may pack
//   POOL_MANAGER=0x…    the Uniswap v4 PoolManager
//   TREASURY=0x…        where trading fees go, forever — this cannot be changed
//   RPC_URL=https://…   defaults to Robinhood's own public endpoint
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createWalletClient, formatEther, http } from "viem";

import { checkPoolManager, connect, fail, requireAddress, requireDeployerKey, requireEnv } from "./lib/env.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const artifact = JSON.parse(readFileSync(join(here, "out", "CratePacker.json"), "utf8"));

requireEnv(["DEPLOYER_KEY", "POOL_MANAGER", "TREASURY"]);
const poolManager = requireAddress("POOL_MANAGER");
const treasury = requireAddress("TREASURY");

const account = requireDeployerKey();
const { chain, publicClient } = await connect();
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
console.log(`\nNothing is packed yet. When the price is decided:\n`);
console.log(`    export PACKER=${packer}`);
console.log(`    FLOOR_ETH=… CEIL_ETH=… npm run pack`);
