// Deploys HoodpadFactory to Robinhood Chain.
//
// The venue addresses are not hardcoded on purpose: point this at whichever
// Uniswap v3 deployment you intend to launch into, and check them yourself
// before you spend gas.
//
//   DEPLOYER_KEY=0x…      the account that pays and becomes nothing special
//   RPC_URL=https://…     defaults to Robinhood's own public endpoint
//   DEX_FACTORY=0x…       IUniswapV3Factory
//   POSITION_MANAGER=0x…  INonfungiblePositionManager
//   TREASURY=0x…          receives the posting fee
//   POSTING_FEE=0         in wei
//   WETH=0x…              optional; read off the position manager when omitted
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createPublicClient, createWalletClient, defineChain, http, isAddress, formatEther } from "viem";

import { accountFromEnv } from "./lib/key.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const artifact = JSON.parse(readFileSync(join(here, "out", "HoodpadFactory.json"), "utf8"));

const required = ["DEPLOYER_KEY", "DEX_FACTORY", "POSITION_MANAGER", "TREASURY"];
const missing = required.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error(`missing: ${missing.join(", ")}`);
  process.exit(1);
}

for (const key of ["DEX_FACTORY", "POSITION_MANAGER", "TREASURY"]) {
  if (!isAddress(process.env[key])) {
    console.error(`${key} is not an address: ${process.env[key]}`);
    process.exit(1);
  }
}
if (process.env.WETH && !isAddress(process.env.WETH)) {
  console.error(`WETH is not an address: ${process.env.WETH}`);
  process.exit(1);
}

const rpcUrl = process.env.RPC_URL || "https://rpc.mainnet.chain.robinhood.com";

const robinhood = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
});

const account = accountFromEnv("DEPLOYER_KEY");

const publicClient = createPublicClient({ chain: robinhood, transport: http() });
const wallet = createWalletClient({ account, chain: robinhood, transport: http() });

const postingFee = BigInt(process.env.POSTING_FEE ?? "0");

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
  console.error("Deploying against the wrong chain would put the board somewhere nobody is looking.");
  process.exit(1);
}

console.log(`rpc        ${rpcUrl} (chain ${liveChainId})`);

// Each of these is a contract the factory will call for the life of the board,
// and a wrong one is not recoverable. An empty address is the easy case; a
// wrong-but-real address is the dangerous one, so the venue is cross-checked
// against itself rather than against a documentation page.
for (const [label, address] of [
  ["DEX_FACTORY", process.env.DEX_FACTORY],
  ["POSITION_MANAGER", process.env.POSITION_MANAGER],
]) {
  const code = await publicClient.getCode({ address });
  if (!code || code === "0x") {
    console.error(`${label} (${address}) has no code on chain ${robinhood.id} — check the address`);
    process.exit(1);
  }
}

const positionManagerAbi = [
  { type: "function", name: "factory", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" },
  { type: "function", name: "WETH9", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" },
];

// The position manager knows which factory and which WETH it was deployed
// against. Reading them back is the difference between "a doc said so" and
// "the chain says so".
let declaredFactory;
let declaredWeth;
try {
  [declaredFactory, declaredWeth] = await Promise.all([
    publicClient.readContract({ address: process.env.POSITION_MANAGER, abi: positionManagerAbi, functionName: "factory" }),
    publicClient.readContract({ address: process.env.POSITION_MANAGER, abi: positionManagerAbi, functionName: "WETH9" }),
  ]);
} catch {
  console.error(
    `POSITION_MANAGER (${process.env.POSITION_MANAGER}) does not answer factory()/WETH9() — it is not a Uniswap v3 position manager`,
  );
  process.exit(1);
}

if (declaredFactory.toLowerCase() !== process.env.DEX_FACTORY.toLowerCase()) {
  console.error(`the position manager belongs to factory ${declaredFactory}, not ${process.env.DEX_FACTORY}`);
  console.error("these two must be from the same deployment or every launch will revert");
  process.exit(1);
}

const weth = process.env.WETH ?? declaredWeth;
if (weth.toLowerCase() !== declaredWeth.toLowerCase()) {
  console.error(`WETH ${weth} is not the WETH this position manager uses (${declaredWeth})`);
  process.exit(1);
}

// The launch form opens 1% pools; if that tier is not enabled here, every
// launch reverts with UnsupportedFee after the token is already deployed.
const spacing = await publicClient.readContract({
  address: process.env.DEX_FACTORY,
  abi: [{ type: "function", name: "feeAmountTickSpacing", inputs: [{ type: "uint24" }], outputs: [{ type: "int24" }], stateMutability: "view" }],
  functionName: "feeAmountTickSpacing",
  args: [10000],
});
if (spacing !== 200) {
  console.error(`the 1% fee tier reports tick spacing ${spacing}, expected 200 — the app's LAUNCH_TICK_SPACING would be wrong`);
  process.exit(1);
}

console.log(`venue      factory and position manager agree, WETH ${weth}, 1% tier spacing ${spacing}`);

console.log(`deployer   ${account.address}`);
console.log(`balance    ${formatEther(await publicClient.getBalance({ address: account.address }))} ETH`);
console.log(`fee        ${formatEther(postingFee)} ETH per notice`);

const hash = await wallet.deployContract({
  abi: artifact.abi,
  bytecode: `0x${artifact.evm.bytecode.object}`,
  args: [
    weth,
    process.env.DEX_FACTORY,
    process.env.POSITION_MANAGER,
    process.env.TREASURY,
    postingFee,
  ],
});

console.log(`tx         ${hash}`);
const receipt = await publicClient.waitForTransactionReceipt({ hash });

if (receipt.status !== "success") {
  console.error("deployment reverted");
  process.exit(1);
}

console.log(`\nfactory    ${receipt.contractAddress}`);
console.log(`\nSet NEXT_PUBLIC_FACTORY_ADDRESS=${receipt.contractAddress} in hoodpad/.env.local`);
