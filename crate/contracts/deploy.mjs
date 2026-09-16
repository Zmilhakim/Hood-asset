// Deploys CratePacker to Robinhood Chain. This does not pack the crate — it puts
// the machine that packs it on chain, and `pack.mjs` pulls the lever once.
//
// The pool manager is not hardcoded on purpose: point this at whichever Uniswap
// v4 deployment you intend to launch into, and check it yourself before you
// spend gas.
//
//   DEPLOYER_KEY=0x…    the account that pays, and the only one that may pack
//   POOL_MANAGER=0x…    the Uniswap v4 PoolManager
//   RPC_URL=https://…   defaults to Robinhood's own public endpoint
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createWalletClient, formatEther, http } from "viem";

import { checkPoolManager, connect, fail, requireAddress, requireDeployerKey, requireEnv } from "./lib/env.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const artifact = JSON.parse(readFileSync(join(here, "out", "CratePacker.json"), "utf8"));

requireEnv(["DEPLOYER_KEY", "POOL_MANAGER"]);
const poolManager = requireAddress("POOL_MANAGER");

const account = requireDeployerKey();
const { chain, publicClient } = await connect();
await checkPoolManager(publicClient, poolManager);

console.log(`deployer   ${account.address}`);
console.log(`balance    ${formatEther(await publicClient.getBalance({ address: account.address }))} ETH`);

const wallet = createWalletClient({ account, chain, transport: http() });
const hash = await wallet.deployContract({
  abi: artifact.abi,
  bytecode: `0x${artifact.evm.bytecode.object}`,
  args: [poolManager],
});

console.log(`tx         ${hash}`);
const receipt = await publicClient.waitForTransactionReceipt({ hash });
if (receipt.status !== "success") fail("deployment reverted");

const packer = receipt.contractAddress;
const seal = await publicClient.readContract({ address: packer, abi: artifact.abi, functionName: "seal" });

console.log(`\npacker     ${packer}`);
console.log(`seal       ${seal}`);
console.log(`\nNothing is packed yet. When the price is decided:\n`);
console.log(`    export PACKER=${packer}`);
console.log(`    FLOOR_ETH=… CEIL_ETH=… npm run pack`);
