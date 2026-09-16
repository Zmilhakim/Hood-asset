// Deploys CratePacker to Robinhood Chain. This does not pack the crate — it
// puts the machine that packs it on chain, and `pack.mjs` pulls the lever once.
//
// The venue addresses are not hardcoded on purpose: point this at whichever
// Uniswap v3 deployment you intend to launch into, and check them yourself
// before you spend gas.
//
//   DEPLOYER_KEY=0x…      the account that pays, and is the only one that may pack
//   RPC_URL=https://…     defaults to Robinhood's own public endpoint
//   DEX_FACTORY=0x…       IUniswapV3Factory
//   POSITION_MANAGER=0x…  INonfungiblePositionManager
//   FEE=10000             the tier to check is open, in hundredths of a bip
//   WETH=0x…              optional; read off the position manager when omitted
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createWalletClient, http, formatEther } from "viem";

import { checkVenue, connect, fail, requireAddress, requireDeployerKey, requireEnv } from "./lib/env.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const artifact = JSON.parse(readFileSync(join(here, "out", "CratePacker.json"), "utf8"));

requireEnv(["DEPLOYER_KEY", "DEX_FACTORY", "POSITION_MANAGER"]);
const dexFactory = requireAddress("DEX_FACTORY");
const positionManager = requireAddress("POSITION_MANAGER");
if (process.env.WETH) requireAddress("WETH");

const fee = Number(process.env.FEE ?? 10_000);
if (!Number.isInteger(fee) || fee <= 0) fail(`FEE is not a fee tier: ${process.env.FEE}`);

const account = requireDeployerKey();
const { chain, publicClient } = await connect();
const { weth } = await checkVenue(publicClient, { dexFactory, positionManager, fee });

console.log(`deployer   ${account.address}`);
console.log(`balance    ${formatEther(await publicClient.getBalance({ address: account.address }))} ETH`);

const wallet = createWalletClient({ account, chain, transport: http() });
const hash = await wallet.deployContract({
  abi: artifact.abi,
  bytecode: `0x${artifact.evm.bytecode.object}`,
  args: [weth, dexFactory, positionManager],
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
