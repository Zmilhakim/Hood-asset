// Posts one notice through a deployed v4 board, from the command line. It does
// what the form on the site does — same factory, same tick maths, imported
// rather than copied — and simulates the whole transaction against live state
// before anything is spent.
//
//   DEPLOYER_KEY=0x…   the account that posts and pays gas. It becomes the
//                      poster, which is who the fees belong to afterwards.
//   NAME, SYMBOL       the token
//   OPENING, CEILING   market cap in ETH at the two ends of the range (1, 100)
//   IMAGE, BLURB, LINK the notice
//   FACTORY, RPC_URL   both default to hoodpad.config.json
//
//   node launch.mjs        simulate, print the plan, spend nothing
//   node launch.mjs --go   actually post it
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createWalletClient, formatEther, http } from "viem";

import { configAddress, configNumber, loadConfig } from "./lib/config.mjs";
import { connect, fail, requireDeployerKey, requireEnv } from "./lib/env.mjs";
import { ethPerTokenFromSqrtPrice, planLaunch } from "./lib/ticks.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const factoryArtifact = JSON.parse(readFileSync(join(here, "out", "HoodpadFactory.json"), "utf8"));

const SUPPLY = 1_000_000_000n; // whole tokens; the factory mints this and no other number
const go = process.argv.includes("--go");

requireEnv(["DEPLOYER_KEY", "NAME", "SYMBOL"]);

const config = loadConfig();
const factory = configAddress(config, "deployed.factory", "FACTORY", {
  what: "the deployed board to post through — run `npm run deploy` first",
});

const fee = configNumber(config, "launch.fee", "FEE", 10_000);
const tickSpacing = configNumber(config, "launch.tickSpacing", "TICK_SPACING", 200);

const opening = Number(process.env.OPENING ?? config.launch?.openingEth ?? "1");
const ceiling = Number(process.env.CEILING ?? config.launch?.ceilingEth ?? "100");
if (!(opening > 0) || !(ceiling > opening)) {
  fail(`OPENING must be above zero and CEILING above it (got ${opening} and ${ceiling}).`);
}

const name = process.env.NAME;
const symbol = process.env.SYMBOL;

const account = requireDeployerKey();
const { chain, publicClient } = await connect();

const code = await publicClient.getCode({ address: factory });
if (!code || code === "0x") fail(`there is no board at ${factory} on this chain`);

const [hook, locker, stats] = await Promise.all([
  publicClient.readContract({ address: factory, abi: factoryArtifact.abi, functionName: "hook" }),
  publicClient.readContract({ address: factory, abi: factoryArtifact.abi, functionName: "locker" }),
  publicClient.readContract({ address: factory, abi: factoryArtifact.abi, functionName: "boardStats" }),
]);
const [noticeCount, , postingFee, , feeBps] = stats;

// The tick maths the web app ships, imported rather than reimplemented. In v4
// the token is always currency1, so there is no ordering to discover first —
// which is the whole class of launch bug the v3 board had to design around.
let plan;
try {
  plan = planLaunch({ openingEth: opening, ceilingEth: ceiling, tickSpacing, wholeSupply: SUPPLY });
} catch (error) {
  fail(`${error.message}`);
}

const params = {
  name,
  symbol,
  imageURI: process.env.IMAGE ?? "",
  blurb: process.env.BLURB ?? "",
  link: process.env.LINK ?? "",
  sqrtPriceX96: plan.sqrtPriceX96,
  tickLower: plan.tickLower,
  tickUpper: plan.tickUpper,
  tickSpacing,
  fee,
};

let simulation;
try {
  simulation = await publicClient.simulateContract({
    address: factory,
    abi: factoryArtifact.abi,
    functionName: "postToken",
    args: [params],
    account,
    value: postingFee,
  });
} catch (error) {
  fail(
    "the launch reverts against live state:",
    `  ${error.shortMessage ?? error.message?.split("\n")[0] ?? error}`,
    "",
    "NotSingleSided means somebody initialised this pool at a price that would",
    "make the launch buy its own supply. Widen or lower the range and re-run.",
  );
}

const [, token] = simulation.result;
const gas = await publicClient.estimateContractGas({
  address: factory,
  abi: factoryArtifact.abi,
  functionName: "postToken",
  args: [params],
  account,
  value: postingFee,
});
const gasPrice = await publicClient.getGasPrice();
const balance = await publicClient.getBalance({ address: account.address });

const openingPrice = ethPerTokenFromSqrtPrice(plan.sqrtPriceX96);

console.log(`board      ${factory}, ${noticeCount} notice${noticeCount === 1n ? "" : "s"} so far`);
console.log(`poster     ${account.address}`);
console.log(`token      ${name} (${symbol}) -> ${token}`);
console.log(`supply     ${SUPPLY.toLocaleString("en-US")}, all of it into the pool`);
console.log(`range      ${plan.effectiveOpeningCapEth} ETH -> ${plan.effectiveCeilingCapEth} ETH market cap`);
console.log(`opens at   ${formatEther(openingPrice)} ETH per token, ticks ${plan.tickLower} to ${plan.tickUpper}`);
console.log(`pool       native ETH / ${symbol}, ${fee / 10_000}% LP fee, spacing ${tickSpacing}`);
console.log(`hook       ${hook}, taking ${Number(feeBps) / 100}% of every swap`);
console.log(`locker     ${locker} — the liquidity goes in and does not come out`);
console.log(`posting    ${postingFee === 0n ? "free" : `${formatEther(postingFee)} ETH`}`);
console.log(`gas        ~${gas}, about ${formatEther(gas * gasPrice)} ETH`);

if (balance < gas * gasPrice + postingFee) {
  fail("", `the poster holds ${formatEther(balance)} ETH, which does not cover that.`);
}

if (!go) {
  console.log("\nNothing was sent. Re-run with --go to post it.");
  console.log("The token address above is what this exact transaction produces; a launch");
  console.log("from a different nonce lands somewhere else.");
  process.exit(0);
}

const wallet = createWalletClient({ account, chain, transport: http() });
const hash = await wallet.writeContract(simulation.request);
console.log(`\ntx         ${hash}`);

const receipt = await publicClient.waitForTransactionReceipt({ hash });
if (receipt.status !== "success") fail("the launch reverted");

const id = (await publicClient.readContract({ address: factory, abi: factoryArtifact.abi, functionName: "tokenCount" })) - 1n;
const notice = await publicClient.readContract({
  address: factory,
  abi: factoryArtifact.abi,
  functionName: "noticeAt",
  args: [id],
});

console.log(`\nnotice     #${id}`);
console.log(`token      ${notice.token}`);
console.log(`pool       ${notice.poolId}`);
console.log(`\nFees accrue to ${notice.poster}. Collect them with:`);
console.log(`  node collect.mjs ${id}`);
