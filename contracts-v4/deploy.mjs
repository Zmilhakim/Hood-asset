// Puts the Hoodpad v4 board on chain: the factory, and with it the hook and the
// locker its constructor deploys.
//
// The hook is the awkward part, and it is awkward for a reason worth knowing.
// Uniswap v4 reads a hook's permissions out of the low bits of its own address,
// so the hook has to *land* on an address carrying the right bits. That means
// CREATE2 with a mined salt — and the CREATE2 is run by the factory, which does
// not exist yet. So the factory's address is predicted from this account's
// nonce, the salt is mined against that prediction, and the nonce is then pinned
// on the transaction so the prediction cannot come untrue between here and the
// chain.
//
// If it came untrue anyway, the hook's own constructor rejects the address and
// the whole deployment reverts. A wrong salt costs gas, never a broken board.
//
//   DEPLOYER_KEY=0x…    the key for the address hoodpad.config.json names
//   RPC_URL=https://…   defaults to Robinhood's own public endpoint
//
//   node deploy.mjs        simulate, print the addresses, spend nothing
//   node deploy.mjs --go   actually deploy
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createWalletClient, encodeDeployData, formatEther, http } from "viem";

import { configAddress, loadConfig, recordDeployed } from "./lib/config.mjs";
import { checkPoolManager, connect, fail, requireDeployerKey, requireEnv } from "./lib/env.mjs";
import { hasRequiredFlags, hookInitCode, mineHookSalt, predictFactoryAddress } from "./lib/hook.mjs";

const here = dirname(fileURLToPath(import.meta.url));

function readArtifact(name) {
  try {
    return JSON.parse(readFileSync(join(here, "out", `${name}.json`), "utf8"));
  } catch {
    fail(
      `out/${name}.json is not there, so there is nothing to deploy.`,
      "",
      "Run `npm run compile` first. out/ is built rather than committed, and a",
      "checkout that predates a contract will not have it.",
    );
  }
}

const factoryArtifact = readArtifact("HoodpadFactory");
const hookArtifact = readArtifact("HoodFeeHook");

const go = process.argv.includes("--go");

requireEnv(["DEPLOYER_KEY"]);

const config = loadConfig();
const poolManager = configAddress(config, "poolManager", "POOL_MANAGER", {
  what: "the Uniswap v4 PoolManager this board launches into",
});
const treasury = configAddress(config, "treasury", "TREASURY", {
  what: "where the posting fee goes; immutable once deployed",
});

const postingFee = BigInt(process.env.POSTING_FEE ?? config.postingFee ?? "0");
const account = requireDeployerKey();

// The config names the deployer when it has been decided. When it has not, this
// is the run that decides it, and saying so beats a silent mismatch later.
const intended = (process.env.DEPLOYER ?? config.deployer ?? "").trim();
if (intended !== "" && intended.toLowerCase() !== account.address.toLowerCase()) {
  fail(
    `hoodpad.config.json expects to deploy from ${intended}`,
    `but DEPLOYER_KEY controls ${account.address}.`,
    "",
    "Load the other key, or change the deployer in the config if this is the one",
    "you meant. The deployer holds no privilege after this runs, but it is the",
    "address the board will forever be traceable to.",
  );
}

const { chain, publicClient } = await connect();
await checkPoolManager(publicClient, poolManager);

const balance = await publicClient.getBalance({ address: account.address });
const nonce = await publicClient.getTransactionCount({ address: account.address });

// Where the factory will land, and therefore what the hook's salt must be mined
// against. Pinned as the transaction's nonce below so nothing can shift it.
const factoryAddress = predictFactoryAddress({ deployer: account.address, nonce });
const initCode = hookInitCode({ bytecode: hookArtifact.evm.bytecode.object, poolManager });

const mined = mineHookSalt({ factory: factoryAddress, initCode });
if (!hasRequiredFlags(mined.address)) fail("the mined address does not carry the hook flags — this is a bug");

const deployData = {
  abi: factoryArtifact.abi,
  bytecode: `0x${factoryArtifact.evm.bytecode.object}`,
  args: [poolManager, treasury, postingFee, mined.salt],
  account,
  nonce,
};

// Estimated against live state, so a constructor that would revert — a bad
// treasury, a salt that no longer fits the predicted address — is found here
// rather than after the gas is gone.
const data = encodeDeployData(deployData);

let gas;
try {
  gas = await publicClient.estimateGas({ account, data });
} catch (error) {
  fail(
    "the deployment reverts against live state:",
    `  ${error.shortMessage ?? error.message?.split("\n")[0] ?? error}`,
    "",
    "A revert in the constructor is almost always the hook salt: the address it",
    "was mined for is no longer the address the factory will land on.",
  );
}

const gasPrice = await publicClient.getGasPrice();

console.log(`deployer   ${account.address}`);
console.log(`balance    ${formatEther(balance)} ETH, nonce ${nonce}`);
console.log(`treasury   ${treasury}`);
console.log(`posting    ${postingFee === 0n ? "free" : `${formatEther(postingFee)} ETH per notice`}`);
console.log(`factory    ${factoryAddress} (predicted from the nonce above)`);
console.log(`hook       ${mined.address}`);
console.log(`hook salt  ${mined.salt} (found in ${mined.tries.toLocaleString("en-US")} tries)`);
console.log(`hook fee   5% of every swap, to the poster; a constant in the hook`);
console.log(`gas        ~${gas} at ${formatEther(gasPrice)} ETH, about ${formatEther(gas * gasPrice)} ETH`);

if (balance < gas * gasPrice) {
  fail("", `the deployer holds ${formatEther(balance)} ETH, which does not cover that.`);
}

if (!go) {
  console.log("\nNothing was sent. Re-run with --go to deploy.");
  console.log("The salt is mined against the nonce above; a transaction from this account");
  console.log("in the meantime changes it, and the next run mines a new one.");
  process.exit(0);
}

const wallet = createWalletClient({ account, chain, transport: http() });
const hash = await wallet.deployContract(deployData);
console.log(`\ntx         ${hash}`);

const receipt = await publicClient.waitForTransactionReceipt({ hash });
if (receipt.status !== "success") fail("the deployment reverted");

const deployed = receipt.contractAddress;
if (deployed.toLowerCase() !== factoryAddress.toLowerCase()) {
  fail(`the factory landed on ${deployed}, not the predicted ${factoryAddress} — do not use this deployment`);
}

// Read the two children back off the chain rather than trusting the prediction.
const [hook, locker] = await Promise.all([
  publicClient.readContract({ address: deployed, abi: factoryArtifact.abi, functionName: "hook" }),
  publicClient.readContract({ address: deployed, abi: factoryArtifact.abi, functionName: "locker" }),
]);

if (hook.toLowerCase() !== mined.address.toLowerCase()) fail(`the hook landed on ${hook}, not ${mined.address}`);
if (!hasRequiredFlags(hook)) fail(`the deployed hook at ${hook} does not carry the v4 permission bits`);

console.log(`\nfactory    ${deployed}`);
console.log(`hook       ${hook}`);
console.log(`locker     ${locker}`);

recordDeployed(config, { factory: deployed, hook, locker, hookSalt: mined.salt });

console.log("\nPut this in hoodpad/.env.local, or in the Vercel project's environment:");
console.log(`  NEXT_PUBLIC_V4_FACTORY_ADDRESS=${deployed}`);
