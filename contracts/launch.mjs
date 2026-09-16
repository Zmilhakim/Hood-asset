// Launches one token through a deployed Hoodpad board, from the command line.
//
// This does exactly what the form on hoodpad.site does — same factory, same
// tick maths, imported from the web app rather than copied — but it simulates
// the whole transaction against the live chain first and prints the contract
// address before anything is spent. Nothing is sent without --go.
//
//   DEPLOYER_KEY=0x…   the account that posts and pays gas
//   FACTORY=0x…        the Hoodpad board (defaults to the deployed one)
//   RPC_URL=https://…  defaults to Robinhood's own endpoint
//   NAME="Test Hood"   token name
//   SYMBOL=TEST        token ticker
//   IMAGE=… BLURB=… LINK=…         optional, shown on the notice
//   OPENING=1 CEILING=100          valuation in ETH at the range's two ends
//
//   node launch.mjs          # simulate, print the address, spend nothing
//   node launch.mjs --go     # actually post it
import { randomBytes } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createPublicClient, createWalletClient, defineChain, formatEther, formatGwei, http, isAddress } from "viem";

import { accountFromEnv } from "./lib/key.mjs";

const here = dirname(fileURLToPath(import.meta.url));

// The planner is the web app's, on purpose. If this script carried its own
// copy of the tick maths, a launch from the command line and a launch from the
// site could drift apart and nobody would notice until one of them reverted.
const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 22 || (major === 22 && minor < 18)) {
  console.error(`this script needs Node 22.18 or newer to read the web app's planner (you have ${process.versions.node})`);
  console.error("upgrade node, or launch from https://hoodpad.site/launch instead");
  process.exit(1);
}
const { planLaunch } = await import(join(here, "..", "hoodpad", "src", "lib", "pool.ts"));

const { hoodpadFactoryAbi } = await import(join(here, "..", "hoodpad", "src", "lib", "abi", "hoodpadFactory.ts"));

const GO = process.argv.includes("--go");

const FEE_TIER = 10_000; // 1%, the only tier the board's form offers
const TICK_SPACING = 200;
const SUPPLY = 1_000_000_000; // the fixed mint, in whole tokens

const DEPLOYED_FACTORY = "0xC935a139AbB08a2eF8480d8E793CCD5c68a7c739";
const factoryAddress = (process.env.FACTORY ?? DEPLOYED_FACTORY).trim();

if (!isAddress(factoryAddress)) {
  console.error(`FACTORY is not an address: ${factoryAddress}`);
  process.exit(1);
}

const name = (process.env.NAME ?? "").trim();
const symbol = (process.env.SYMBOL ?? "").trim().toUpperCase();

if (!name || !symbol) {
  console.error("NAME and SYMBOL are both required.");
  console.error("");
  console.error('    NAME="Test Hood" SYMBOL=TESTHOOD node launch.mjs');
  process.exit(1);
}

const opening = Number(process.env.OPENING ?? "1");
const ceiling = Number(process.env.CEILING ?? "100");

if (!(opening > 0) || !(ceiling > opening)) {
  console.error(`OPENING must be above zero and CEILING above it (got ${opening} and ${ceiling}).`);
  console.error("These are the market cap in ETH at the bottom and the top of the range.");
  process.exit(1);
}

const rpcUrl = process.env.RPC_URL || "https://rpc.mainnet.chain.robinhood.com";

const robinhood = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
});

const account = accountFromEnv();
const publicClient = createPublicClient({ chain: robinhood, transport: http() });

let liveChainId;
try {
  liveChainId = await publicClient.getChainId();
} catch (error) {
  console.error(`cannot reach the RPC at ${rpcUrl}`);
  console.error(`  ${error.shortMessage ?? error.message?.split("\n")[0] ?? error}`);
  console.error("");
  console.error("Public endpoints go down, rate-limit and get replaced. Point this at");
  console.error("another one and re-run:");
  console.error("");
  console.error("    export RPC_URL=https://…");
  process.exit(1);
}

if (liveChainId !== robinhood.id) {
  console.error(`${rpcUrl} is chain ${liveChainId}, not Robinhood Chain (${robinhood.id})`);
  process.exit(1);
}

const code = await publicClient.getCode({ address: factoryAddress });
if (!code || code === "0x") {
  console.error(`there is no contract at ${factoryAddress} on chain ${liveChainId}`);
  process.exit(1);
}

const board = { address: factoryAddress, abi: hoodpadFactoryAbi };

// A contract that is not a board will fail somewhere; better here, with a
// sentence, than four calls later inside viem.
let weth;
let postingFee;
let before;
try {
  [weth, postingFee, before] = await Promise.all([
    publicClient.readContract({ ...board, functionName: "weth" }),
    publicClient.readContract({ ...board, functionName: "postingFee" }),
    publicClient.readContract({ ...board, functionName: "tokenCount" }),
  ]);
} catch {
  console.error(`there is a contract at ${factoryAddress}, but it does not answer like a Hoodpad board`);
  console.error("Check the address — that is somebody else's contract.");
  process.exit(1);
}

console.log(`rpc        ${rpcUrl} (chain ${liveChainId})`);
console.log(`board      ${factoryAddress}, ${before} launched so far`);
console.log(`poster     ${account.address}`);
console.log(`balance    ${formatEther(await publicClient.getBalance({ address: account.address }))} ETH`);
console.log(`fee        ${formatEther(postingFee)} ETH`);

// The salt fixes the token's address, and the address decides which side of the
// pool it sits on — which flips the whole tick axis. So it has to be picked
// first and the range computed against the answer.
const salt = `0x${randomBytes(32).toString("hex")}`;
const token = await publicClient.readContract({ ...board, functionName: "predictToken", args: [name, symbol, salt] });

let plan;
try {
  plan = planLaunch({
    tokenIsToken0: token.toLowerCase() < weth.toLowerCase(),
    openingPrice: opening / SUPPLY,
    ceilingPrice: ceiling / SUPPLY,
    spacing: TICK_SPACING,
  });
} catch (error) {
  // Ticks come in steps of 200 on the 1% tier, so a range narrower than one
  // step has nowhere to sit. The planner says so; it should not arrive as a
  // stack trace.
  console.error("");
  console.error(`this range cannot be priced: ${error.message}`);
  console.error(`OPENING=${opening} and CEILING=${ceiling} land on the same tick.`);
  console.error("Put some distance between them — the default is 1 and 100.");
  process.exit(1);
}

const params = {
  salt,
  name,
  symbol,
  imageURI: (process.env.IMAGE ?? "").trim(),
  blurb: (process.env.BLURB ?? "").trim(),
  link: (process.env.LINK ?? "").trim(),
  sqrtPriceX96: plan.sqrtPriceX96,
  tickLower: plan.tickLower,
  tickUpper: plan.tickUpper,
  fee: FEE_TIER,
};

console.log("");
console.log(`token      ${name} ($${symbol})`);
console.log(`address    ${token}`);
console.log(`side       ${token.toLowerCase() < weth.toLowerCase() ? "token0" : "token1"} against WETH ${weth}`);
console.log(`supply     ${SUPPLY.toLocaleString("en-US")}, all of it into the pool`);
console.log(`range      ${plan.effectiveOpeningPrice * SUPPLY} ETH -> ${plan.effectiveCeilingPrice * SUPPLY} ETH market cap`);
console.log(`ticks      ${plan.tickLower} .. ${plan.tickUpper} on the 1% tier`);

// Simulate against live state before spending anything. A revert here is free;
// the same revert after the token is deployed is not.
const call = { ...board, functionName: "postToken", args: [params], account, value: postingFee };

let request;
let gas;
let gasPrice;
try {
  ({ request } = await publicClient.simulateContract(call));
  [gas, gasPrice] = await Promise.all([publicClient.estimateContractGas(call), publicClient.getGasPrice()]);
} catch (error) {
  // The revert reason is the whole point of running this first, so print that
  // and nothing else — viem's uncaught error is several screens of ABI.
  console.error("");
  console.error("the launch would revert — nothing was sent");
  for (const line of [error.shortMessage, error.cause?.shortMessage, error.details]) {
    if (line && !String(line).includes("Docs:")) console.error(`  ${line}`);
  }
  process.exit(1);
}

console.log(`gas        ${gas} at ${formatGwei(gasPrice)} gwei ≈ ${formatEther(gas * gasPrice)} ETH`);
console.log("");
console.log("simulated against live state: this launch goes through.");

if (!GO) {
  console.log("");
  console.log("Nothing was sent. Re-run with --go to post it for real:");
  console.log("");
  console.log("    node launch.mjs --go");
  console.log("");
  console.log("The salt is regenerated each run, so the address above will change.");
  process.exit(0);
}

const wallet = createWalletClient({ account, chain: robinhood, transport: http() });
const hash = await wallet.writeContract(request);

console.log("");
console.log(`tx         ${hash}`);

const receipt = await publicClient.waitForTransactionReceipt({ hash });
if (receipt.status !== "success") {
  console.error("the launch reverted on chain");
  process.exit(1);
}

const id = (await publicClient.readContract({ ...board, functionName: "tokenCount" })) - 1n;
const notice = await publicClient.readContract({ ...board, functionName: "noticeAt", args: [id] });

console.log(`notice     #${id}`);
console.log(`token      ${notice.token}`);
console.log(`pool       ${notice.pool}`);
console.log(`position   ${notice.positionId}, held by the locker`);
console.log("");
console.log(`  https://robinhoodchain.blockscout.com/address/${notice.token}`);
console.log(`  https://hoodpad.site/board`);
