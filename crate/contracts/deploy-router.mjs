// Deploys CrateRouter — the contract the website trades through.
//
// This runs after `npm run pack`, not before: the router reads the pool off the
// packer in its constructor, so there has to be a pool. That is also what makes
// it safe to approve — it can only ever reach the one pool CRATE was packed
// into, and there is no function that changes that.
//
//   DEPLOYER_KEY=0x…   the key crate.config.json names as the deployer
//   RPC_URL=https://…  defaults to Robinhood's own public endpoint
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createWalletClient, formatEther, http } from "viem";

import { connect, fail, requireDeployerKey, requireEnv } from "./lib/env.mjs";
import { configAddress, loadConfig, recordDeployed } from "./lib/config.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const artifact = JSON.parse(readFileSync(join(here, "out", "CrateRouter.json"), "utf8"));

requireEnv(["DEPLOYER_KEY"]);

const config = loadConfig();
const packerAddress = configAddress(config, "deployed.packer", "PACKER", {
  what: "the CratePacker whose pool this router will trade",
});

const account = requireDeployerKey();
const { chain, publicClient } = await connect();
if (chain.id !== config.chainId) fail(`crate.config.json says chain ${config.chainId}, not ${chain.id}`);

const packerAbi = [
  { type: "function", name: "packed", inputs: [], outputs: [{ type: "bool" }], stateMutability: "view" },
  { type: "function", name: "token", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" },
];

const [packed, token] = await Promise.all([
  publicClient.readContract({ address: packerAddress, abi: packerAbi, functionName: "packed" }),
  publicClient.readContract({ address: packerAddress, abi: packerAbi, functionName: "token" }),
]);

if (!packed) {
  fail(
    "this crate is not packed yet, so there is no pool for a router to trade.",
    "",
    "Run `npm run pack` first. The router's constructor reads the pool key off",
    "the packer, and refuses to deploy without one.",
  );
}

console.log(`packer     ${packerAddress}`);
console.log(`token      ${token}`);
console.log(`deployer   ${account.address}`);
console.log(`balance    ${formatEther(await publicClient.getBalance({ address: account.address }))} ETH`);

const wallet = createWalletClient({ account, chain, transport: http() });
const hash = await wallet.deployContract({
  abi: artifact.abi,
  bytecode: `0x${artifact.evm.bytecode.object}`,
  args: [packerAddress],
});

console.log(`tx         ${hash}`);
const receipt = await publicClient.waitForTransactionReceipt({ hash });
if (receipt.status !== "success") fail("deployment reverted");

const router = receipt.contractAddress;

// Read back what it actually points at, rather than trusting the argument.
const deployedToken = await publicClient.readContract({
  address: router,
  abi: [{ type: "function", name: "token", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" }],
  functionName: "token",
});
if (deployedToken.toLowerCase() !== token.toLowerCase()) {
  fail(`the router says it trades ${deployedToken}, not ${token} — do not point the site at this one`);
}

console.log(`\nrouter     ${router}`);
console.log(`trades     ${deployedToken} against native ETH, and nothing else`);

recordDeployed(config, { router });
