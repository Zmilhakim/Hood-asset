// Collects the trading fees a locked position has earned, from the command
// line, for whoever posted the notice.
//
// The dashboard does the same thing, but the dashboard needs a browser with an
// injected wallet — which on a phone means a wallet's own browser. This needs
// a terminal and the key that is already there.
//
//   DEPLOYER_KEY=0x…   the poster's account (the only one that may collect)
//   FACTORY=0x…        the board (defaults to the deployed one)
//   RPC_URL=https://…  defaults to Robinhood's own endpoint
//
//   node collect.mjs 1        # show what notice #1 would pay out, send nothing
//   node collect.mjs 1 --go   # actually collect it
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createPublicClient, createWalletClient, defineChain, formatEther, formatUnits, http, isAddress } from "viem";

import { accountFromEnv } from "./lib/key.mjs";

const here = dirname(fileURLToPath(import.meta.url));

const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 22 || (major === 22 && minor < 18)) {
  console.error(`this script needs Node 22.18 or newer (you have ${process.versions.node})`);
  process.exit(1);
}

const { hoodpadFactoryAbi } = await import(join(here, "..", "hoodpad", "src", "lib", "abi", "hoodpadFactory.ts"));
const { positionLockerAbi } = await import(join(here, "..", "hoodpad", "src", "lib", "abi", "positionLocker.ts"));

const GO = process.argv.includes("--go");
const raw = process.argv.slice(2).find((arg) => !arg.startsWith("--"));

if (raw === undefined) {
  console.error("which notice? Pass its id — status.mjs lists them.");
  console.error("");
  console.error("    node collect.mjs 1");
  process.exit(1);
}

const noticeId = Number(raw);
if (!Number.isInteger(noticeId) || noticeId < 0) {
  console.error(`notice id must be a whole number, got ${raw}`);
  process.exit(1);
}

const DEPLOYED_FACTORY = "0xC935a139AbB08a2eF8480d8E793CCD5c68a7c739";
const factoryAddress = (process.env.FACTORY ?? DEPLOYED_FACTORY).trim();

if (!isAddress(factoryAddress)) {
  console.error(`FACTORY is not an address: ${factoryAddress}`);
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

let chainId;
try {
  chainId = await publicClient.getChainId();
} catch (error) {
  console.error(`cannot reach the RPC at ${rpcUrl}`);
  console.error(`  ${error.shortMessage ?? error.message?.split("\n")[0] ?? error}`);
  console.error("");
  console.error("Point this at another endpoint and re-run:");
  console.error("");
  console.error("    export RPC_URL=https://…");
  process.exit(1);
}

if (chainId !== robinhood.id) {
  console.error(`${rpcUrl} is chain ${chainId}, not Robinhood Chain (${robinhood.id})`);
  process.exit(1);
}

const board = { address: factoryAddress, abi: hoodpadFactoryAbi };

let weth;
let locker;
let count;
try {
  [weth, locker, count] = await Promise.all([
    publicClient.readContract({ ...board, functionName: "weth" }),
    publicClient.readContract({ ...board, functionName: "locker" }),
    publicClient.readContract({ ...board, functionName: "tokenCount" }),
  ]);
} catch {
  console.error(`there is no Hoodpad board at ${factoryAddress} on chain ${chainId}`);
  process.exit(1);
}

if (BigInt(noticeId) >= count) {
  console.error(`there is no notice #${noticeId} — the board has ${count}`);
  process.exit(1);
}

const notice = await publicClient.readContract({ ...board, functionName: "noticeAt", args: [BigInt(noticeId)] });

console.log(`rpc        ${rpcUrl} (chain ${chainId})`);
console.log(`notice     #${notice.id} ${notice.name} ($${notice.symbol})`);
console.log(`token      ${notice.token}`);
console.log(`collector  ${account.address}`);

// The locker pays the poster and nobody else, so a mismatch is worth saying
// plainly rather than letting the revert explain it.
if (notice.poster.toLowerCase() !== account.address.toLowerCase()) {
  console.error("");
  console.error(`this notice was posted by ${notice.poster}`);
  console.error("Only that address can collect its fees. DEPLOYER_KEY is a different account.");
  process.exit(1);
}

let request;
let amount0;
let amount1;
try {
  const simulated = await publicClient.simulateContract({
    address: locker,
    abi: positionLockerAbi,
    functionName: "collectFees",
    args: [notice.positionId],
    account,
  });

  request = simulated.request;
  [amount0, amount1] = simulated.result;
} catch (error) {
  console.error("");
  console.error("the collect would revert — nothing was sent");
  for (const line of [error.shortMessage, error.cause?.shortMessage, error.details]) {
    if (line && !String(line).includes("Docs:")) console.error(`  ${line}`);
  }
  process.exit(1);
}

// Which side is which depends on the address ordering the pool was opened with.
const [tokenFees, ethFees] = notice.token.toLowerCase() < weth.toLowerCase() ? [amount0, amount1] : [amount1, amount0];

console.log(`waiting    ${formatEther(ethFees)} WETH`);
console.log(`           ${Number(formatUnits(tokenFees, 18)).toLocaleString("en-US")} ${notice.symbol}`);

if (tokenFees === 0n && ethFees === 0n) {
  console.log("");
  console.log("There is nothing to collect yet.");
  process.exit(0);
}

const gas = await publicClient.estimateContractGas({
  address: locker,
  abi: positionLockerAbi,
  functionName: "collectFees",
  args: [notice.positionId],
  account,
});
const gasPrice = await publicClient.getGasPrice();
const balance = await publicClient.getBalance({ address: account.address });

console.log(`gas        ${gas} ≈ ${formatEther(gas * gasPrice)} ETH, you hold ${formatEther(balance)} ETH`);

if (balance < gas * gasPrice) {
  console.error("");
  console.error("Not enough ETH to pay for the collect. Top the account up and re-run.");
  process.exit(1);
}

if (!GO) {
  console.log("");
  console.log("Nothing was sent. Re-run with --go to collect:");
  console.log("");
  console.log(`    node collect.mjs ${noticeId} --go`);
  process.exit(0);
}

const wallet = createWalletClient({ account, chain: robinhood, transport: http() });
const hash = await wallet.writeContract(request);

console.log("");
console.log(`tx         ${hash}`);

const receipt = await publicClient.waitForTransactionReceipt({ hash });
if (receipt.status !== "success") {
  console.error("the collect reverted on chain");
  process.exit(1);
}

console.log("collected  sent to " + account.address);
console.log("");
console.log(`  https://robinhoodchain.blockscout.com/tx/${hash}`);
console.log("");
console.log("The WETH is wrapped ETH — unwrap it in a wallet if you want plain ETH.");
console.log("The liquidity itself is untouched, as it always will be.");
