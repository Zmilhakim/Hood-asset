// Puts the Clayspad launchpad on Robinhood Chain. This launches no tokens — it
// deploys the shelf, the fee hook and the kiln, and `launch.mjs` posts to it.
//
//   DEPLOYER_KEY=0x…    the key for the address clayspad.config.json names
//   RPC_URL=https://…   defaults to Robinhood's own public endpoint
//
// POOL_MANAGER and TREASURY still work as one-off overrides of the file.
import { createWalletClient, formatEther, http } from "viem";

import { configAddress, loadConfig, recordDeployed } from "./lib/config.mjs";
import { checkPoolManager, connect, fail, requireDeployerKey, requireEnv } from "./lib/env.mjs";
import { flagsOf, hasFlags, hookInitCode, mineHookSalt, predictLaunchpad } from "./lib/hooks.mjs";
import { readArtifact } from "./lib/artifacts.mjs";

const clayspadArtifact = readArtifact("Clayspad");
const hookArtifact = readArtifact("ClayHook");

requireEnv(["DEPLOYER_KEY"]);

const config = loadConfig();
const poolManager = configAddress(config, "poolManager", "POOL_MANAGER", {
  what: "the Uniswap v4 PoolManager the launchpad opens pools in",
});
const treasury = configAddress(config, "treasury", "TREASURY", {
  what: "where the treasury's share of every fee goes, forever",
});
const intendedDeployer = configAddress(config, "deployer", "DEPLOYER", {
  what: "the address that will deploy the launchpad",
});

const account = requireDeployerKey();

// The config names an address; the environment supplies a key. If they disagree,
// the hook's salt is about to be mined against the wrong address, and the
// deployment reverts — which is the good outcome, but a slow way to find out.
if (account.address.toLowerCase() !== intendedDeployer.toLowerCase()) {
  fail(
    `clayspad.config.json expects to deploy from ${intendedDeployer}`,
    `but DEPLOYER_KEY controls ${account.address}.`,
    "",
    "Load the other key, or change the deployer in the config if this is the one",
    "you meant.",
  );
}

const { chain, publicClient } = await connect();
if (chain.id !== config.chainId) fail(`clayspad.config.json says chain ${config.chainId}, not ${chain.id}`);

await checkPoolManager(publicClient, poolManager);

const nonce = await publicClient.getTransactionCount({ address: account.address });
const predictedLaunchpad = predictLaunchpad({ deployer: account.address, nonce });
const mined = mineHookSalt({
  deployer: predictedLaunchpad,
  initCode: hookInitCode({ creationCode: hookArtifact.evm.bytecode.object, poolManager, treasury }),
});

console.log(`deployer   ${account.address}`);
console.log(`balance    ${formatEther(await publicClient.getBalance({ address: account.address }))} ETH`);
console.log(`treasury   ${treasury}`);
console.log(`salt       ${mined.salt}`);
console.log(`hook       ${mined.address} (${flagsOf(mined.address).join(", ")})`);

// The treasury is written into the hook as an immutable. There is no function
// anywhere that changes it, so a typo here is a typo forever — every fee the
// launchpad's treasury side ever earns would go to whatever address this is.
if (treasury.toLowerCase() === account.address.toLowerCase()) {
  console.log("");
  console.log("           note: that is the deployer's own address. It works, but the");
  console.log("           key that signs deploys is a poor place to accumulate fees.");
}

const wallet = createWalletClient({ account, chain, transport: http() });
const hash = await wallet.deployContract({
  abi: clayspadArtifact.abi,
  bytecode: `0x${clayspadArtifact.evm.bytecode.object}`,
  args: [poolManager, treasury, mined.salt],
  nonce,
});

console.log(`tx         ${hash}`);
const receipt = await publicClient.waitForTransactionReceipt({ hash });
if (receipt.status !== "success") fail("deployment reverted — the salt was mined against a nonce that moved");

const launchpad = receipt.contractAddress;
const read = (functionName) =>
  publicClient.readContract({ address: launchpad, abi: clayspadArtifact.abi, functionName });

const [hook, kiln] = await Promise.all([read("hook"), read("kiln")]);

// Everything below is read back off the chain rather than trusted from above.
// This is the last moment any of it can still be changed, and changing it means
// redeploying the whole launchpad.
if (launchpad.toLowerCase() !== predictedLaunchpad.toLowerCase()) fail(`the launchpad landed on ${launchpad}, not ${predictedLaunchpad}`);
if (hook.toLowerCase() !== mined.address.toLowerCase()) fail(`the hook landed on ${hook}, not ${mined.address}`);
if (!hasFlags(hook)) fail(`the hook is at ${hook}, which does not carry its flags — do not launch into this one`);

const storedTreasury = await publicClient.readContract({
  address: hook,
  abi: hookArtifact.abi,
  functionName: "treasury",
});
if (storedTreasury.toLowerCase() !== treasury.toLowerCase()) {
  fail(`the hook says its treasury is ${storedTreasury}, not ${treasury} — do not launch into this one`);
}

console.log(`\nlaunchpad  ${launchpad}`);
console.log(`hook       ${hook} (flags confirmed on chain)`);
console.log(`kiln     ${kiln}`);
console.log(`treasury   ${storedTreasury} (confirmed on chain, immutable)`);

recordDeployed(config, { launchpad, hook, kiln });

console.log(`\nNothing is launched yet. The shelf is empty and anyone can post to it:\n`);
console.log(`    NAME="…" SYMBOL="…" npm run launch                  # prints the plan, sends nothing`);
console.log(`    NAME="…" SYMBOL="…" CONFIRM=launch npm run launch   # sends it`);
