// Everything that can be checked before any gas is spent.
//
//   npm run preflight
//
// It sends no transaction and needs no private key. Run it after filling in
// crate.config.json, again after deploying, and once more before packing.
//
// The point is the treasury. It is an immutable in the seal, so the window in
// which a wrong address can be corrected closes at `npm run deploy` — after that
// every fee the crate ever earns belongs to whatever was typed. Everything here
// exists to use that window.
import { concatHex, encodeAbiParameters, formatEther, parseAbiParameters } from "viem";

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { checkPoolManager, connect, fail } from "./lib/env.mjs";
import { configAddress, configNumber, configPrice, loadConfig } from "./lib/config.mjs";
import { launchRange, pricePerToken } from "./lib/ticks.mjs";

const problems = [];
const warnings = [];

const ok = (label, detail) => console.log(`  ok    ${label.padEnd(12)} ${detail}`);
const warn = (label, detail, ...why) => {
  console.log(`  warn  ${label.padEnd(12)} ${detail}`);
  for (const line of why) console.log(`                     ${line}`);
  warnings.push(label);
};
const bad = (label, detail, ...why) => {
  console.log(`  BAD   ${label.padEnd(12)} ${detail}`);
  for (const line of why) console.log(`                     ${line}`);
  problems.push(label);
};

const config = loadConfig();

const poolManager = configAddress(config, "poolManager", "POOL_MANAGER", {
  what: "the Uniswap v4 PoolManager this launches into",
});
const treasury = configAddress(config, "treasury", "TREASURY", {
  what: "where the trading fees go, forever",
});
const deployer = configAddress(config, "deployer", "DEPLOYER", {
  what: "the address that will deploy and pack (its address, never its key)",
});

const fee = configNumber(config, "launch.fee", "FEE", 10_000);
const tickSpacing = configNumber(config, "launch.tickSpacing", "TICK_SPACING", 200);
const floorEth = configPrice(config, "launch.floorEth", "FLOOR_ETH", {
  what: "what the whole supply is worth where selling starts",
});
const ceilEth = configPrice(config, "launch.ceilEth", "CEIL_ETH", {
  what: "what the whole supply is worth at the far end of the range",
});

// The compiled contracts. `npm ci` does not produce these — `out/` is built,
// not committed — and deploy.mjs reads this very file, so a missing one is not
// a detail to warn about: it is the deploy failing a minute from now.
const here = dirname(fileURLToPath(import.meta.url));

// All four, not just the one this file happens to need. Checking a single
// artifact let a stale out/ — built before CrateRouter existed — pass here and
// fail two commands later, which is a bad place to learn it.
const NEEDED = ["CratePacker", "CrateSeal", "CrateToken", "CrateRouter"];
let artifact;
const missing = [];
for (const name of NEEDED) {
  try {
    const built = JSON.parse(readFileSync(join(here, "out", `${name}.json`), "utf8"));
    if (name === "CratePacker") artifact = built;
  } catch {
    missing.push(name);
  }
}

if (missing.length === 0) {
  ok("build", `all ${NEEDED.length} contracts compiled, packer is ${artifact.evm.deployedBytecode.object.length / 2} bytes`);
} else {
  bad(
    "build",
    `not compiled, or compiled before these existed: ${missing.join(", ")}`,
    "Run `npm run compile` and then this again. deploy.mjs, pack.mjs and",
    "deploy-router.mjs each read one of these, so a gap here is a failure",
    "later. On a phone the Solidity compiler takes a minute.",
  );
}

const { publicClient, chain } = await connect();
if (chain.id !== config.chainId) {
  fail(`crate.config.json says chain ${config.chainId}, but the scripts are built for ${chain.id}`);
}

console.log("");
await checkPoolManager(publicClient, poolManager);
console.log("");

// ---------------------------------------------------------------- the treasury

const [treasuryCode, treasuryBalance] = await Promise.all([
  publicClient.getCode({ address: treasury }),
  publicClient.getBalance({ address: treasury }),
]);

if (treasuryCode && treasuryCode !== "0x") {
  warn(
    "treasury",
    `${treasury} is a contract`,
    "The pool pays native ETH with a plain call, and reverts if the recipient",
    "refuses it. A contract with no payable receive would make collectFees —",
    "and compound — revert forever. Check it accepts ETH before deploying.",
  );
} else {
  ok("treasury", `${treasury} (${formatEther(treasuryBalance)} ETH, plain account)`);
}

if (treasury.toLowerCase() === deployer.toLowerCase()) {
  warn(
    "treasury",
    "same address as the deployer",
    "It works, but the key that signs deploys is a poor place to accumulate",
    "fees. A hardware wallet address here costs nothing and never signs.",
  );
}
if (treasury.toLowerCase() === poolManager.toLowerCase()) {
  bad("treasury", "is the pool manager — the fees would be paid back into the venue");
}

// ---------------------------------------------------------------- the deployer

const deployerBalance = await publicClient.getBalance({ address: deployer });
if (deployerBalance === 0n) {
  bad(
    "deployer",
    `${deployer} has no ETH`,
    "It pays for two transactions: the deploy and the pack. Fund it first.",
  );
} else {
  ok("deployer", `${deployer} (${formatEther(deployerBalance)} ETH for gas)`);
}

// What the two transactions will actually cost. Guessing is no good here: on an
// Arbitrum Orbit chain the L1 data fee is folded into the gas estimate, so it
// moves with L1 and cannot be worked out from the bytecode size alone.
if (artifact) {
  try {
    const [gas, gasPrice] = await Promise.all([
      publicClient.estimateGas({
        account: deployer,
        data: concatHex([
          `0x${artifact.evm.bytecode.object}`,
          encodeAbiParameters(parseAbiParameters("address, address"), [poolManager, treasury]),
        ]),
      }),
      publicClient.getGasPrice(),
    ]);

    const deployCost = gas * gasPrice;
    // Packing costs less than deploying — it deploys one smaller contract
    // instead of two — but the same again is the headroom worth having.
    const needed = deployCost * 2n;

    if (deployerBalance < needed) {
      bad(
        "gas",
        `deploy costs about ${formatEther(deployCost)} ETH, and ${formatEther(deployerBalance)} ETH is not enough for both steps`,
        `Top the deployer up to around ${formatEther(needed)} ETH. Nothing is lost if`,
        "it does run short — both commands can simply be run again — but a top-up",
        "now is cheaper than finding out halfway.",
      );
    } else {
      ok("gas", `deploy costs about ${formatEther(deployCost)} ETH; the balance covers both steps`);
    }
  } catch (error) {
    warn(
      "gas",
      "could not estimate what the deploy will cost",
      `  ${error.shortMessage ?? error.message?.split("\n")[0] ?? error}`,
      "Not blocking — deploy.mjs prints the transaction hash either way, and a",
      "transaction that runs short can be sent again.",
    );
  }
}

// If a key happens to be loaded, say whether it is the one this config names.
if (process.env.DEPLOYER_KEY) {
  const { requireDeployerKey } = await import("./lib/env.mjs");
  const account = requireDeployerKey();
  if (account.address.toLowerCase() === deployer.toLowerCase()) {
    ok("key", "the loaded DEPLOYER_KEY controls that address");
  } else {
    bad("key", `the loaded DEPLOYER_KEY is ${account.address}, not the deployer above`);
  }
}

// ------------------------------------------------------------------ the launch

let range;
try {
  const wholeSupply = 1_000_000_000n;
  range = launchRange({
    floorEthPerToken: pricePerToken(floorEth, wholeSupply),
    ceilEthPerToken: pricePerToken(ceilEth, wholeSupply),
    tickSpacing,
  });
  ok("range", `ticks ${range.tickLower} … ${range.tickUpper}, spot starts at ${range.tickUpper}`);
  ok("prices", `${floorEth} ETH to ${ceilEth} ETH for the whole supply, ${fee / 10_000}% fee`);
} catch (error) {
  bad("range", `these prices do not describe a range: ${error.message}`);
}

// --------------------------------------------------------------- already built

const packer = (process.env.PACKER ?? config.deployed?.packer ?? "").trim();
if (packer !== "") {
  const abi = (name, type) => [
    { type: "function", name, inputs: [], outputs: [{ type }], stateMutability: "view" },
  ];
  try {
    const [onChainPacker, packed, seal] = await Promise.all([
      publicClient.readContract({ address: packer, abi: abi("packer", "address"), functionName: "packer" }),
      publicClient.readContract({ address: packer, abi: abi("packed", "bool"), functionName: "packed" }),
      publicClient.readContract({ address: packer, abi: abi("seal", "address"), functionName: "seal" }),
    ]);
    const storedTreasury = await publicClient.readContract({
      address: seal,
      abi: abi("feeBeneficiary", "address"),
      functionName: "feeBeneficiary",
    });

    if (onChainPacker.toLowerCase() === deployer.toLowerCase()) ok("packer", `${packer} answers to the deployer`);
    else bad("packer", `${packer} answers to ${onChainPacker}, which is not the deployer above`);

    if (storedTreasury.toLowerCase() === treasury.toLowerCase()) {
      ok("committed", `fees are committed to ${storedTreasury}`);
    } else {
      bad(
        "committed",
        `the deployed seal pays ${storedTreasury}, not the treasury in this config`,
        "That cannot be changed. If the deployed one is wrong, deploy a new packer",
        "and pack that instead — this one is not worth packing.",
      );
    }

    ok("state", packed ? "already packed — there is nothing left to do" : "deployed, not packed yet");
  } catch {
    bad("packer", `${packer} does not answer like a CratePacker`);
  }
} else {
  ok("packer", "not deployed yet");
}

// ----------------------------------------------------------------- the verdict

console.log("");
if (problems.length > 0) {
  console.log(`  ${problems.length} thing${problems.length === 1 ? "" : "s"} to fix first: ${problems.join(", ")}`);
  process.exit(1);
}
if (warnings.length > 0) {
  console.log(`  Nothing blocking, but read the ${warnings.length} warning${warnings.length === 1 ? "" : "s"} above.`);
}
console.log("  Ready. The treasury address stops being changeable at `npm run deploy`.");
console.log("");
