// Sweeps a notice's fees to its poster. There are two of them and they come from
// two different places, which is the thing this script exists to make plain:
//
//   the hook's 5% of every swap, held on HoodFeeHook and paid by `claim`;
//   the pool's own LP fee, accrued on the locked position and paid by the
//   locker's `collectFees`.
//
// Both are permissionless — the destination is the poster either way, and no
// argument moves it — so anyone can push a poster their fees. All a caller
// decides is whether to spend the gas.
//
//   node collect.mjs 1        show what notice #1 would pay out, send nothing
//   node collect.mjs 1 --go   collect it
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createWalletClient, formatEther, formatUnits, http } from "viem";

import { configAddress, loadConfig } from "./lib/config.mjs";
import { connect, fail, requireDeployerKey, requireEnv } from "./lib/env.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const artifact = (name) => JSON.parse(readFileSync(join(here, "out", `${name}.json`), "utf8"));
const factoryArtifact = artifact("HoodpadFactory");
const hookArtifact = artifact("HoodFeeHook");
const lockerArtifact = artifact("HoodpadLocker");

const go = process.argv.includes("--go");
const id = process.argv.slice(2).find((arg) => /^\d+$/.test(arg));
if (id === undefined) fail("which notice? usage: node collect.mjs <id> [--go]");

requireEnv(["DEPLOYER_KEY"]);

const config = loadConfig();
const factory = configAddress(config, "deployed.factory", "FACTORY", { what: "the deployed board" });
const account = requireDeployerKey();
const { chain, publicClient } = await connect();

const read = (address, abi, functionName, args = []) =>
  publicClient.readContract({ address, abi, functionName, args });

const count = await read(factory, factoryArtifact.abi, "tokenCount");
if (BigInt(id) >= count) fail(`there are ${count} notices on this board; #${id} is not one of them`);

const [notice, key, hook, locker] = await Promise.all([
  read(factory, factoryArtifact.abi, "notice", [BigInt(id)]),
  read(factory, factoryArtifact.abi, "poolKeyOf", [BigInt(id)]),
  read(factory, factoryArtifact.abi, "hook"),
  read(factory, factoryArtifact.abi, "locker"),
]);

const [hookEth, hookToken] = await read(hook, hookArtifact.abi, "claimable", [key]);

// The LP fee is not a number the pool stores anywhere readable — it only settles
// when the position is touched. So it is read by simulating the collect, which
// is the same thing the dashboard does.
let lpEth = 0n;
let lpToken = 0n;
try {
  const { result } = await publicClient.simulateContract({
    address: locker,
    abi: lockerArtifact.abi,
    functionName: "collectFees",
    args: [notice.poolId],
    account,
  });
  [lpEth, lpToken] = result;
} catch {
  // NothingToCollect is the ordinary answer on a pool that has not traded.
}

const tokens = (amount) => `${Number(formatUnits(amount, 18)).toLocaleString("en-US")} ${notice.symbol}`;

console.log(`notice     #${id} — ${notice.name} (${notice.symbol})`);
console.log(`token      ${notice.token}`);
console.log(`poster     ${notice.poster}`);
console.log(`\nhook fee   ${formatEther(hookEth)} ETH + ${tokens(hookToken)}`);
console.log(`lp fee     ${formatEther(lpEth)} ETH + ${tokens(lpToken)}`);

if (hookEth === 0n && hookToken === 0n && lpEth === 0n && lpToken === 0n) {
  console.log("\nNothing has accrued yet — nobody has traded this pool.");
  process.exit(0);
}

console.log(`\nAll of it goes to ${notice.poster}, whoever sends this transaction.`);

if (!go) {
  console.log("Nothing was sent. Re-run with --go to collect.");
  process.exit(0);
}

const wallet = createWalletClient({ account, chain, transport: http() });

if (hookEth > 0n || hookToken > 0n) {
  const hash = await wallet.writeContract({ address: hook, abi: hookArtifact.abi, functionName: "claim", args: [key] });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`hook fee   ${receipt.status === "success" ? "collected" : "REVERTED"}  ${hash}`);
}

if (lpEth > 0n || lpToken > 0n) {
  const hash = await wallet.writeContract({
    address: locker,
    abi: lockerArtifact.abi,
    functionName: "collectFees",
    args: [notice.poolId],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`lp fee     ${receipt.status === "success" ? "collected" : "REVERTED"}  ${hash}`);
}

// The claim that matters most is the one about what did *not* move.
const liquidity = await read(locker, lockerArtifact.abi, "lockedLiquidity", [notice.poolId]);
console.log(`\nliquidity  ${liquidity} — unchanged, and there is no call that changes it`);
