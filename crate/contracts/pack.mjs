// Packs the crate. This runs once in the life of the project: it mints the
// whole supply, opens the pool with all of it, and seals the position where
// nobody can reach it again. There is no undo, so it prints the entire plan and
// refuses to broadcast until CONFIRM=pack says to.
//
//   DEPLOYER_KEY=0x…   must be the account that deployed the packer
//   PACKER=0x…         the CratePacker address deploy.mjs printed
//   FLOOR_ETH=…        what the whole supply is worth at the near edge of the range
//   CEIL_ETH=…         what it is worth at the far edge
//   RPC_URL=https://…  defaults to Robinhood's own public endpoint
//   FEE=10000          the pool tier to open, in hundredths of a bip
//   SALT=0x…           32 bytes; changes the token address, and nothing else
//   CONFIRM=pack       actually send it
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createWalletClient, formatEther, http, keccak256, parseEventLogs, stringToHex } from "viem";

import { checkVenue, connect, fail, requireAddress, requireDeployerKey, requireEnv } from "./lib/env.mjs";
import { launchRange, parseDecimal, tickAtOrBelow } from "./lib/ticks.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const packerArtifact = JSON.parse(readFileSync(join(here, "out", "CratePacker.json"), "utf8"));
const abi = packerArtifact.abi;

const poolAbi = [
  {
    type: "function",
    name: "slot0",
    inputs: [],
    outputs: [
      { type: "uint160" },
      { type: "int24" },
      { type: "uint16" },
      { type: "uint16" },
      { type: "uint16" },
      { type: "uint8" },
      { type: "bool" },
    ],
    stateMutability: "view",
  },
];
const dexAbi = [
  {
    type: "function",
    name: "getPool",
    inputs: [{ type: "address" }, { type: "address" }, { type: "uint24" }],
    outputs: [{ type: "address" }],
    stateMutability: "view",
  },
];

requireEnv(["DEPLOYER_KEY", "PACKER", "FLOOR_ETH", "CEIL_ETH"]);
const packerAddress = requireAddress("PACKER");

const fee = Number(process.env.FEE ?? 10_000);
if (!Number.isInteger(fee) || fee <= 0) fail(`FEE is not a fee tier: ${process.env.FEE}`);

const salt = process.env.SALT ?? keccak256(stringToHex("crate"));
if (!/^0x[0-9a-fA-F]{64}$/.test(salt)) fail(`SALT must be 32 bytes of hex: ${salt}`);

const account = requireDeployerKey();
const { chain, publicClient } = await connect();

const read = (functionName, args = []) =>
  publicClient.readContract({ address: packerAddress, abi, functionName, args });

const code = await publicClient.getCode({ address: packerAddress });
if (!code || code === "0x") fail(`PACKER (${packerAddress}) has no code on this chain — check the address`);

let onChain;
try {
  const [packed, owner, weth, dexFactory, positionManager, seal, supply, name, symbol] = await Promise.all([
    read("packed"),
    read("packer"),
    read("weth"),
    read("dexFactory"),
    read("positionManager"),
    read("seal"),
    read("SUPPLY"),
    read("TOKEN_NAME"),
    read("TOKEN_SYMBOL"),
  ]);
  onChain = { packed, owner, weth, dexFactory, positionManager, seal, supply, name, symbol };
} catch {
  fail(`PACKER (${packerAddress}) does not answer like a CratePacker — check the address`);
}

if (onChain.packed) {
  const [token, pool, seal, positionId, packedAt] = await read("crate");
  fail(
    "this crate is already packed, and a crate is only packed once.",
    "",
    `  token       ${token}`,
    `  pool        ${pool}`,
    `  seal        ${seal}`,
    `  position    ${positionId}`,
    `  packed at   ${new Date(Number(packedAt) * 1000).toISOString()}`,
  );
}

if (onChain.owner.toLowerCase() !== account.address.toLowerCase()) {
  fail(
    `this packer only takes orders from ${onChain.owner}, and DEPLOYER_KEY is ${account.address}`,
    "Use the key that deployed it. Nobody else can pack this crate, which is the point.",
  );
}

const { spacing } = await checkVenue(publicClient, {
  dexFactory: onChain.dexFactory,
  positionManager: onChain.positionManager,
  fee,
});

const token = await read("predictToken", [salt]);
const tokenIsToken0 = token.toLowerCase() < onChain.weth.toLowerCase();
const [token0, token1] = tokenIsToken0 ? [token, onChain.weth] : [onChain.weth, token];

// The prices are given as what the whole supply is worth, because that is how
// anyone actually thinks about a launch. The pool wants a price per token, and
// one divided by the other rarely has an exact decimal form — so it is carried
// as a fraction the whole way to the tick.
const wholeSupply = onChain.supply / 10n ** 18n;
const pricePerToken = (marketCapEth) => {
  const { num, den } = parseDecimal(marketCapEth);
  return { num, den: den * wholeSupply };
};

let range;
try {
  range = launchRange({
    tokenIsToken0,
    floorEthPerToken: pricePerToken(process.env.FLOOR_ETH),
    ceilEthPerToken: pricePerToken(process.env.CEIL_ETH),
    spacing,
  });
} catch (error) {
  fail(
    `cannot build a range from FLOOR_ETH=${process.env.FLOOR_ETH} CEIL_ETH=${process.env.CEIL_ETH}`,
    `  ${error.message}`,
  );
}

// A pool for this pair can be created and priced by anyone. If one is already
// there the packer uses the price it has, so the range has to be checked
// against that price rather than the one below.
const existingPool = await publicClient.readContract({
  address: onChain.dexFactory,
  abi: dexAbi,
  functionName: "getPool",
  args: [token0, token1, fee],
});

let spotTick = range.currentTick;
if (existingPool && existingPool !== "0x0000000000000000000000000000000000000000") {
  const [existingPrice] = await publicClient.readContract({ address: existingPool, abi: poolAbi, functionName: "slot0" });
  if (existingPrice !== 0n) {
    spotTick = tickAtOrBelow(existingPrice);
    console.log(`pool       ${existingPool} already exists and is priced at tick ${spotTick}`);

    const singleSided = tokenIsToken0 ? range.tickLower >= spotTick : range.tickUpper <= spotTick;
    if (!singleSided) {
      fail(
        "",
        "someone opened and priced this pool first, and the range these prices",
        "describe now straddles their price. Packing into it would ask this",
        "contract for ETH it does not have, so it would revert.",
        "",
        `  their tick    ${spotTick}`,
        `  your range    ${range.tickLower} … ${range.tickUpper}`,
        "",
        "Either move FLOOR_ETH/CEIL_ETH to sit past their price, or change SALT",
        "to land the token on a different address and open a pool of your own.",
      );
    }
  }
}

const params = {
  salt,
  sqrtPriceX96: range.sqrtPriceX96,
  tickLower: range.tickLower,
  tickUpper: range.tickUpper,
  fee,
};

// The last check that costs nothing: run the whole thing against the node's
// state before paying for it.
try {
  await publicClient.simulateContract({ account, address: packerAddress, abi, functionName: "pack", args: [params] });
} catch (error) {
  fail("pack would revert:", `  ${error.shortMessage ?? error.message?.split("\n")[0] ?? error}`);
}

console.log("");
console.log(`token      ${onChain.name} (${onChain.symbol}) at ${token}`);
console.log(`supply     ${onChain.supply / 10n ** 18n} ${onChain.symbol}, all of it into the pool`);
console.log(`pair       ${tokenIsToken0 ? "token0" : "token1"}, against WETH ${onChain.weth}`);
console.log(`tier       ${fee / 10_000}% (spacing ${spacing})`);
console.log(`range      ticks ${range.tickLower} … ${range.tickUpper}, spot at ${spotTick}`);
console.log(`prices     ${process.env.FLOOR_ETH} ETH to ${process.env.CEIL_ETH} ETH for the whole supply`);
console.log(`seal       ${onChain.seal}`);
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
console.log(`pool       ${packed.args.pool}`);
console.log(`position   ${packed.args.positionId} — held by ${onChain.seal}, permanently`);
console.log(`\nThe crate is packed. It cannot be packed again.`);
