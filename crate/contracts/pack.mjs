// Packs the crate. This runs once in the life of the project: it mints the whole
// supply, opens the pool with all of it, and seals the liquidity where nobody
// can reach it again. There is no undo, so it prints the entire plan and refuses
// to broadcast until CONFIRM=pack says to.
//
//   DEPLOYER_KEY=0x…   must be the account that deployed the packer
//   PACKER=0x…         the CratePacker address deploy.mjs printed
//   FLOOR_ETH=…        what the whole supply is worth where selling starts
//   CEIL_ETH=…         what it is worth at the far end of the range
//   RPC_URL=https://…  defaults to Robinhood's own public endpoint
//   FEE=10000          the pool's LP fee, in hundredths of a bip
//   TICK_SPACING=200   the grid the range has to line up with
//   CONFIRM=pack       actually send it
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createWalletClient, formatEther, getContractAddress, http, parseEventLogs } from "viem";

import { checkPoolManager, connect, fail, requireAddress, requireDeployerKey, requireEnv } from "./lib/env.mjs";
import { cratePoolKey, poolId, readSlot0 } from "./lib/pool.mjs";
import { launchRange, parseDecimal } from "./lib/ticks.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const abi = JSON.parse(readFileSync(join(here, "out", "CratePacker.json"), "utf8")).abi;

requireEnv(["DEPLOYER_KEY", "PACKER", "FLOOR_ETH", "CEIL_ETH"]);
const packerAddress = requireAddress("PACKER");

const fee = Number(process.env.FEE ?? 10_000);
if (!Number.isInteger(fee) || fee <= 0 || fee > 1_000_000) fail(`FEE is not an LP fee: ${process.env.FEE}`);

const tickSpacing = Number(process.env.TICK_SPACING ?? 200);
if (!Number.isInteger(tickSpacing) || tickSpacing <= 0) fail(`TICK_SPACING is not a spacing: ${process.env.TICK_SPACING}`);

const account = requireDeployerKey();
const { chain, publicClient } = await connect();

const read = (functionName, args = []) =>
  publicClient.readContract({ address: packerAddress, abi, functionName, args });

const code = await publicClient.getCode({ address: packerAddress });
if (!code || code === "0x") fail(`PACKER (${packerAddress}) has no code on this chain — check the address`);

let crate;
try {
  const [packed, owner, poolManager, seal, supply, name, symbol] = await Promise.all([
    read("packed"),
    read("packer"),
    read("poolManager"),
    read("seal"),
    read("SUPPLY"),
    read("TOKEN_NAME"),
    read("TOKEN_SYMBOL"),
  ]);
  crate = { packed, owner, poolManager, seal, supply, name, symbol };
} catch {
  fail(`PACKER (${packerAddress}) does not answer like a CratePacker — check the address`);
}

if (crate.packed) {
  const [token, id, seal, tickLower, tickUpper, packedAt] = await read("crate");
  fail(
    "this crate is already packed, and a crate is only packed once.",
    "",
    `  token       ${token}`,
    `  pool        ${id}`,
    `  seal        ${seal}`,
    `  range       ${tickLower} … ${tickUpper}`,
    `  packed at   ${new Date(Number(packedAt) * 1000).toISOString()}`,
  );
}

if (crate.owner.toLowerCase() !== account.address.toLowerCase()) {
  fail(
    `this packer only takes orders from ${crate.owner}, and DEPLOYER_KEY is ${account.address}`,
    "Use the key that deployed it. Nobody else can pack this crate, which is the point.",
  );
}

await checkPoolManager(publicClient, crate.poolManager);

// The prices are given as what the whole supply is worth, because that is how
// anyone actually thinks about a launch. The pool wants a price per token, and
// one divided by the other rarely has an exact decimal form — so it is carried
// as a fraction the whole way to the tick.
const wholeSupply = crate.supply / 10n ** 18n;
const pricePerToken = (marketCapEth) => {
  const { num, den } = parseDecimal(marketCapEth);
  return { num, den: den * wholeSupply };
};

let range;
try {
  range = launchRange({
    floorEthPerToken: pricePerToken(process.env.FLOOR_ETH),
    ceilEthPerToken: pricePerToken(process.env.CEIL_ETH),
    tickSpacing,
  });
} catch (error) {
  fail(
    `cannot build a range from FLOOR_ETH=${process.env.FLOOR_ETH} CEIL_ETH=${process.env.CEIL_ETH}`,
    `  ${error.message}`,
  );
}

// The packer deploys the token itself, so its address is whatever its next
// CREATE produces — and therefore so is the pool. Both are worth printing before
// they exist, and the pool has to be checked in case somebody else got there.
const nonce = await publicClient.getTransactionCount({ address: packerAddress });
const token = getContractAddress({ from: packerAddress, nonce: BigInt(nonce) });
const key = cratePoolKey({ token, fee, tickSpacing });
const id = poolId(key);

let spotTick = range.currentTick;
const slot0 = await readSlot0(publicClient, crate.poolManager, id);
if (slot0.initialized) {
  spotTick = slot0.tick;
  console.log(`pool       ${id} already exists, priced at tick ${spotTick}`);

  if (range.tickUpper > spotTick) {
    fail(
      "",
      "someone opened and priced this pool first, and the range these prices",
      "describe now reaches above their price. Packing into it would ask the",
      "seal for ETH it does not have, so it would revert.",
      "",
      `  their tick    ${spotTick}`,
      `  your range    ${range.tickLower} … ${range.tickUpper}`,
      "",
      "Move FLOOR_ETH/CEIL_ETH so the whole range sits under their price.",
    );
  }
}

const params = {
  fee,
  tickSpacing,
  sqrtPriceX96: range.sqrtPriceX96,
  tickLower: range.tickLower,
  tickUpper: range.tickUpper,
};

// The last check that costs nothing: run the whole thing against the node's
// state before paying for it.
try {
  await publicClient.simulateContract({ account, address: packerAddress, abi, functionName: "pack", args: [params] });
} catch (error) {
  fail("pack would revert:", `  ${error.shortMessage ?? error.message?.split("\n")[0] ?? error}`);
}

console.log("");
console.log(`token      ${crate.name} (${crate.symbol}) at ${token}`);
console.log(`supply     ${wholeSupply} ${crate.symbol}, all of it into the pool`);
console.log(`pair       native ETH / ${crate.symbol}, no hook, no WETH`);
console.log(`pool       ${id}`);
console.log(`fee        ${fee / 10_000}% (tick spacing ${tickSpacing})`);
console.log(`range      ticks ${range.tickLower} … ${range.tickUpper}, spot at ${spotTick}`);
console.log(`prices     ${process.env.FLOOR_ETH} ETH to ${process.env.CEIL_ETH} ETH for the whole supply`);
console.log(`seal       ${crate.seal}`);
console.log(`payer      ${account.address} (${formatEther(await publicClient.getBalance({ address: account.address }))} ETH)`);

if (process.env.CONFIRM !== "pack") {
  console.log("\nNothing was sent. This is the only time these numbers can still be changed.");
  console.log("Re-run with CONFIRM=pack to pack the crate.");
  process.exit(0);
}

const wallet = createWalletClient({ account, chain, transport: http() });
const hash = await wallet.writeContract({ address: packerAddress, abi, functionName: "pack", args: [params] });
console.log(`\ntx         ${hash}`);

const receipt = await publicClient.waitForTransactionReceipt({ hash });
if (receipt.status !== "success") fail("pack reverted");

const [packed] = parseEventLogs({ abi, eventName: "Packed", logs: receipt.logs });
console.log(`\ntoken      ${packed.args.token}`);
console.log(`pool       ${packed.args.poolId}`);
console.log(`liquidity  ${packed.args.liquidity} — held by ${crate.seal}, permanently`);
console.log(`\nThe crate is packed. It cannot be packed again.`);
