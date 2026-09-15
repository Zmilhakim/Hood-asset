// Deploys HoodpadFactory to Robinhood Chain.
//
// The venue addresses are not hardcoded on purpose: point this at whichever
// Uniswap v3 deployment you intend to launch into, and check them yourself
// before you spend gas.
//
//   DEPLOYER_KEY=0x…      the account that pays and becomes nothing special
//   RPC_URL=https://…     defaults to the public endpoint
//   WETH=0x…              wrapped native token
//   DEX_FACTORY=0x…       IUniswapV3Factory
//   POSITION_MANAGER=0x…  INonfungiblePositionManager
//   TREASURY=0x…          receives the posting fee
//   POSTING_FEE=0         in wei
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createPublicClient, createWalletClient, defineChain, http, isAddress, formatEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const here = dirname(fileURLToPath(import.meta.url));
const artifact = JSON.parse(readFileSync(join(here, "out", "HoodpadFactory.json"), "utf8"));

const required = ["DEPLOYER_KEY", "WETH", "DEX_FACTORY", "POSITION_MANAGER", "TREASURY"];
const missing = required.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error(`missing: ${missing.join(", ")}`);
  process.exit(1);
}

for (const key of ["WETH", "DEX_FACTORY", "POSITION_MANAGER", "TREASURY"]) {
  if (!isAddress(process.env[key])) {
    console.error(`${key} is not an address: ${process.env[key]}`);
    process.exit(1);
  }
}

const robinhood = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [process.env.RPC_URL || "https://rpc.nodeflare.app/robinhood/public"] } },
});

const account = privateKeyToAccount(process.env.DEPLOYER_KEY);
const publicClient = createPublicClient({ chain: robinhood, transport: http() });
const wallet = createWalletClient({ account, chain: robinhood, transport: http() });

const postingFee = BigInt(process.env.POSTING_FEE ?? "0");

// Each of these is a contract the factory will call for the life of the board;
// a typo here is not recoverable, so refuse to deploy against an empty address.
for (const [label, address] of [
  ["WETH", process.env.WETH],
  ["DEX_FACTORY", process.env.DEX_FACTORY],
  ["POSITION_MANAGER", process.env.POSITION_MANAGER],
]) {
  const code = await publicClient.getCode({ address });
  if (!code || code === "0x") {
    console.error(`${label} (${address}) has no code on chain ${robinhood.id} — check the address`);
    process.exit(1);
  }
}

console.log(`deployer   ${account.address}`);
console.log(`balance    ${formatEther(await publicClient.getBalance({ address: account.address }))} ETH`);
console.log(`fee        ${formatEther(postingFee)} ETH per notice`);

const hash = await wallet.deployContract({
  abi: artifact.abi,
  bytecode: `0x${artifact.evm.bytecode.object}`,
  args: [
    process.env.WETH,
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
