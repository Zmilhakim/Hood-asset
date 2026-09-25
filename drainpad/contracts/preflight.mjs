// Everything worth knowing before a launch, checked against the chain.
//
//   npm run preflight
//
// Sends nothing and needs no private key. It reads the deployed contracts, works
// out the range the way `launch.mjs` would, and then simulates the launch itself
// against the live launchpad — a simulation runs the real code in the node's EVM,
// so a launch that would revert fails here instead of in a receipt.
//
// SUPPLY_WALLET, NAME and SYMBOL override what is simulated, the same way they
// override a real launch. The defaults simulate a test launch.
import { formatEther } from "viem";

import { configAddress, configNumber, configPrice, loadConfig } from "./lib/config.mjs";
import { connect, fail } from "./lib/env.mjs";
import { readArtifact } from "./lib/artifacts.mjs";
import { hasFlags, flagsOf } from "./lib/hooks.mjs";
import { launchRange, pricePerToken } from "./lib/ticks.mjs";

const drainpadArtifact = readArtifact("Drainpad");
const hookArtifact = readArtifact("Grate");
const sumpArtifact = readArtifact("Sump");

const config = loadConfig();
const deployed = config.deployed ?? {};
if (!deployed.launchpad) fail("nothing deployed yet — run `npm run deploy` first");

const poolManager = configAddress(config, "poolManager", "POOL_MANAGER", { what: "the v4 PoolManager" });
const treasury = configAddress(config, "treasury", "TREASURY", { what: "where the treasury's share goes" });
const deployer = configAddress(config, "deployer", "DEPLOYER", { what: "the address that deploys and launches" });
const supplyWallet = configAddress(config, "supplyWallet", "SUPPLY_WALLET", { what: "where the liquid share goes" });

const tickSpacing = configNumber(config, "launch.tickSpacing", "TICK_SPACING", 200);
const floorEth = configPrice(config, "launch.floorEth", "FLOOR_ETH", { what: "the opening price" });
const ceilEth = configPrice(config, "launch.ceilEth", "CEIL_ETH", { what: "the far end of the range" });

const { chain, publicClient } = await connect();

let failures = 0;
let warnings = 0;

/** One line per check. A check that cannot answer is a failure, not a blank. */
function check(label, ok, detail) {
  if (ok === "warn") {
    warnings++;
    console.log(`  ~  ${label.padEnd(44)} ${detail}`);
    return;
  }
  if (!ok) failures++;
  console.log(`  ${ok ? "ok" : "FAIL"} ${label.padEnd(44)} ${detail}`);
}

const read = (address, abi, functionName, args = []) =>
  publicClient.readContract({ address, abi, functionName, args });

console.log(`\nchain      ${chain.name} (${chain.id})`);
console.log(`launchpad  ${deployed.launchpad}\n`);

// --- the contracts are where the config says, and point at each other --------

console.log("the deployment");

const [hook, sump, launchpadTreasury] = await Promise.all([
  read(deployed.launchpad, drainpadArtifact.abi, "grate"),
  read(deployed.launchpad, drainpadArtifact.abi, "sump"),
  read(deployed.launchpad, drainpadArtifact.abi, "treasury"),
]);

check("hook is the one in the config", hook.toLowerCase() === (deployed.hook ?? "").toLowerCase(), hook);
check("sump is the one in the config", sump.toLowerCase() === (deployed.sump ?? "").toLowerCase(), sump);

const [hookLaunchpad, sumpLaunchpad, hookTreasury] = await Promise.all([
  read(hook, hookArtifact.abi, "launchpad").catch(() => null),
  read(sump, sumpArtifact.abi, "launchpad").catch(() => null),
  read(hook, hookArtifact.abi, "treasury"),
]);

check(
  "hook answers only to this launchpad",
  hookLaunchpad?.toLowerCase() === deployed.launchpad.toLowerCase(),
  hookLaunchpad ?? "could not read",
);
check(
  "sump answers only to this launchpad",
  sumpLaunchpad?.toLowerCase() === deployed.launchpad.toLowerCase(),
  sumpLaunchpad ?? "could not read",
);

// The hook's address carries its permissions. If these bits are wrong the pool
// manager never calls it and the fee is silently never charged — which is the
// one failure that looks like success right up until the money is gone.
check("hook address carries its flags", hasFlags(hook), flagsOf(hook).join(", "));

check(
  "treasury matches the config",
  hookTreasury.toLowerCase() === treasury.toLowerCase() && launchpadTreasury.toLowerCase() === treasury.toLowerCase(),
  hookTreasury,
);

// --- the terms are what they are meant to be ---------------------------------

console.log("\nthe terms, as the chain states them");

const [supply, poolBps, walletBps, lpFee, feeBps, creatorBps, bps] = await Promise.all([
  read(deployed.launchpad, drainpadArtifact.abi, "FIXED_SUPPLY"),
  read(deployed.launchpad, drainpadArtifact.abi, "POOL_BPS"),
  read(deployed.launchpad, drainpadArtifact.abi, "SUPPLY_WALLET_BPS"),
  read(deployed.launchpad, drainpadArtifact.abi, "LP_FEE"),
  read(hook, hookArtifact.abi, "FEE_BPS"),
  read(hook, hookArtifact.abi, "CREATOR_BPS"),
  read(hook, hookArtifact.abi, "BPS"),
]);

const EXPECTED = { supply: 1_000_000_000n * 10n ** 18n, poolBps: 7_500n, walletBps: 2_500n, feeBps: 400n, creatorBps: 7_500n };

check("supply is a fixed billion", supply === EXPECTED.supply, `${supply / 10n ** 18n}`);
check("split is the one agreed", poolBps === EXPECTED.poolBps && walletBps === EXPECTED.walletBps, `${poolBps} / ${walletBps} bps`);
check("split adds up", poolBps + walletBps === bps, `${poolBps + walletBps} of ${bps}`);
check("swap fee is the one agreed", feeBps === EXPECTED.feeBps, `${feeBps} bps`);
check("creator's share of the fee", creatorBps === EXPECTED.creatorBps, `${creatorBps} bps`);
check("LP fee is zero, so the hook is the whole schedule", lpFee === 0, `${lpFee}`);

// --- the range, computed the way a launch computes it ------------------------

console.log("\nthe range");

const WHOLE_SUPPLY = 1_000_000_000n;
let range;
try {
  range = launchRange({
    floorEthPerToken: pricePerToken(floorEth, WHOLE_SUPPLY),
    ceilEthPerToken: pricePerToken(ceilEth, WHOLE_SUPPLY),
    tickSpacing,
  });
} catch (error) {
  check("the range computes", false, error.message);
}

if (range) {
  check("the range computes", true, `${floorEth} → ${ceilEth} ETH for the whole supply`);
  check("ticks are on the spacing", range.tickLower % tickSpacing === 0 && range.tickUpper % tickSpacing === 0, `${range.tickLower} … ${range.tickUpper}`);
  check("lower is below upper", range.tickLower < range.tickUpper, `${range.tickUpper - range.tickLower} ticks wide`);
}

// --- gas ---------------------------------------------------------------------

console.log("\nthe deployer");

const [balance, nonce, gasPrice] = await Promise.all([
  publicClient.getBalance({ address: deployer }),
  publicClient.getTransactionCount({ address: deployer }),
  publicClient.getGasPrice(),
]);

console.log(`  -- ${"address".padEnd(44)} ${deployer}`);
console.log(`  -- ${"nonce".padEnd(44)} ${nonce}`);
check("has a balance", balance > 0n, `${formatEther(balance)} ETH`);

// --- the launch itself, simulated against the live contract ------------------

console.log("\nthe launch, simulated against the live launchpad");

const name = process.env.NAME ?? "Drainpad Test";
const symbol = process.env.SYMBOL ?? "TDRIP";
const wallet = process.env.SUPPLY_WALLET ?? supplyWallet;

console.log(`  -- ${"name / ticker".padEnd(44)} ${name} ($${symbol})`);
console.log(`  -- ${"supply wallet".padEnd(44)} ${wallet}`);
console.log(`  -- ${"metadata".padEnd(44)} none (image, blurb and link empty)`);

if (range) {
  const params = {
    name,
    symbol,
    imageURI: "",
    blurb: "",
    link: "",
    supplyWallet: wallet,
    tickSpacing,
    sqrtPriceX96: range.sqrtPriceX96,
    tickLower: range.tickLower,
    tickUpper: range.tickUpper,
  };

  let simulated = null;
  try {
    // `account` as a plain address: the node runs the real launch in its own EVM
    // as if this address had sent it. No signature, no key, nothing broadcast.
    simulated = await publicClient.simulateContract({
      address: deployed.launchpad,
      abi: drainpadArtifact.abi,
      functionName: "launch",
      args: [params],
      account: deployer,
    });
    check("the launch would succeed", true, `token would land at ${simulated.result[1]}`);
  } catch (error) {
    check("the launch would succeed", false, error.shortMessage ?? error.message?.split("\n")[0] ?? String(error));
  }

  if (simulated) {
    try {
      const gas = await publicClient.estimateContractGas({
        address: deployed.launchpad,
        abi: drainpadArtifact.abi,
        functionName: "launch",
        args: [params],
        account: deployer,
      });
      const cost = gas * gasPrice;
      check(
        "the balance covers the gas",
        balance > cost * 2n,
        `${gas} gas ≈ ${formatEther(cost)} ETH, balance covers it ${Number(balance / (cost || 1n))}×`,
      );
    } catch (error) {
      check("gas estimates", "warn", error.shortMessage ?? "could not estimate");
    }
  }
}

// --- what already exists -----------------------------------------------------

console.log("\nthe catchment");
const runoffCount = await read(deployed.launchpad, drainpadArtifact.abi, "runoffCount");
console.log(`  -- ${"runoffs already launched".padEnd(44)} ${runoffCount}`);
if (runoffCount === 0n) console.log(`  -- ${"".padEnd(44)} the next launch becomes runoff #0, permanently`);

// --- verdict -----------------------------------------------------------------

console.log("");
if (failures > 0) {
  console.log(`${failures} check(s) failed. Do not launch until they are understood.`);
  process.exit(1);
}
console.log(warnings > 0 ? `Ready, with ${warnings} thing(s) worth reading above.` : "Ready. Everything checked answers the way it should.");
