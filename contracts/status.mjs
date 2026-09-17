// Reads the board and every notice on it. No key, no signing, nothing sent.
//
//   node status.mjs            # the whole board
//   node status.mjs 1          # one notice by id
//
//   FACTORY=0x…        the board (defaults to the deployed one)
//   RPC_URL=https://…  defaults to Robinhood's own endpoint
//   WATCH=0x…          whose gas balance and unclaimed fees to report
//                      (defaults to each notice's own poster)
//
// Uncollected fees are read by simulating the collect the beneficiary would
// send, rather than by reading tokensOwed off the position — those only update
// when the position is touched, so a quiet pool reports zero long after it has
// earned something.
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createPublicClient, defineChain, formatEther, formatUnits, http, isAddress } from "viem";

const here = dirname(fileURLToPath(import.meta.url));

const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 22 || (major === 22 && minor < 18)) {
  console.error(`this script needs Node 22.18 or newer (you have ${process.versions.node})`);
  process.exit(1);
}

const { hoodpadFactoryAbi } = await import(join(here, "..", "hoodpad", "src", "lib", "abi", "hoodpadFactory.ts"));
const { positionLockerAbi } = await import(join(here, "..", "hoodpad", "src", "lib", "abi", "positionLocker.ts"));

const erc20Abi = [
  { type: "function", name: "balanceOf", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "totalSupply", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "symbol", inputs: [], outputs: [{ type: "string" }], stateMutability: "view" },
];

const poolAbi = [
  {
    type: "function",
    name: "slot0",
    inputs: [],
    outputs: [
      { name: "sqrtPriceX96", type: "uint160" },
      { name: "tick", type: "int24" },
      { name: "observationIndex", type: "uint16" },
      { name: "observationCardinality", type: "uint16" },
      { name: "observationCardinalityNext", type: "uint16" },
      { name: "feeProtocol", type: "uint8" },
      { name: "unlocked", type: "bool" },
    ],
    stateMutability: "view",
  },
  { type: "function", name: "token0", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" },
];

const DEPLOYED_FACTORY = "0xC935a139AbB08a2eF8480d8E793CCD5c68a7c739";
const factoryAddress = (process.env.FACTORY ?? DEPLOYED_FACTORY).trim();

if (!isAddress(factoryAddress)) {
  console.error(`FACTORY is not an address: ${factoryAddress}`);
  process.exit(1);
}

const watch = process.env.WATCH?.trim();
if (watch && !isAddress(watch)) {
  console.error(`WATCH is not an address: ${watch}`);
  process.exit(1);
}

const only = process.argv[2] === undefined ? null : Number(process.argv[2]);
if (only !== null && !Number.isInteger(only)) {
  console.error(`notice id must be a whole number, got ${process.argv[2]}`);
  process.exit(1);
}

const rpcUrl = process.env.RPC_URL || "https://rpc.mainnet.chain.robinhood.com";

const robinhood = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
});

const client = createPublicClient({ chain: robinhood, transport: http() });

let chainId;
try {
  chainId = await client.getChainId();
} catch (error) {
  console.error(`cannot reach the RPC at ${rpcUrl}`);
  console.error(`  ${error.shortMessage ?? error.message?.split("\n")[0] ?? error}`);
  console.error("");
  console.error("Point this at another endpoint and re-run:");
  console.error("");
  console.error("    export RPC_URL=https://…");
  process.exit(1);
}

const board = { address: factoryAddress, abi: hoodpadFactoryAbi };

let weth;
let locker;
let positionManager;
let stats;
try {
  [weth, locker, positionManager, stats] = await Promise.all([
    client.readContract({ ...board, functionName: "weth" }),
    client.readContract({ ...board, functionName: "locker" }),
    client.readContract({ ...board, functionName: "positionManager" }),
    client.readContract({ ...board, functionName: "boardStats" }),
  ]);
} catch {
  console.error(`there is no Hoodpad board at ${factoryAddress} on chain ${chainId}`);
  process.exit(1);
}

const [count, lastLaunch, fee, supplyLaunched] = stats;

const short = (address) => `${address.slice(0, 6)}…${address.slice(-4)}`;
const num = (value, digits = 0) =>
  Number(value).toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits });

function ago(seconds) {
  if (seconds === 0n) return "never";
  const delta = Math.floor(Date.now() / 1000) - Number(seconds);
  if (delta < 90) return `${delta}s ago`;
  if (delta < 5400) return `${Math.round(delta / 60)}m ago`;
  if (delta < 172800) return `${Math.round(delta / 3600)}h ago`;
  return `${Math.round(delta / 86400)}d ago`;
}

console.log(`board      ${factoryAddress} (chain ${chainId})`);
console.log(`notices    ${count} posted · ${num(formatUnits(supplyLaunched, 18))} tokens launched · last ${ago(lastLaunch)}`);
console.log(`posting    ${formatEther(fee)} ETH`);

if (watch) {
  console.log(`watching   ${watch} · ${formatEther(await client.getBalance({ address: watch }))} ETH for gas`);
}

if (count === 0n) {
  console.log("");
  console.log("Nothing has been posted yet.");
  process.exit(0);
}

const ids = only !== null ? [BigInt(only)] : [...Array(Number(count)).keys()].map((i) => BigInt(i)).reverse();

if (only !== null && (only < 0 || BigInt(only) >= count)) {
  console.error(`there is no notice #${only} — the board has ${count}`);
  process.exit(1);
}

for (const id of ids) {
  const notice = await client.readContract({ ...board, functionName: "noticeAt", args: [id] });

  console.log("");
  console.log(`#${notice.id}  ${notice.name} ($${notice.symbol})   ${ago(notice.postedAt)}`);
  console.log(`    token    ${notice.token}`);
  console.log(`    poster   ${notice.poster}`);

  if (notice.pool === "0x0000000000000000000000000000000000000000") {
    console.log("    pool     none — this notice has no pool");
    continue;
  }

  const [slot0, token0, inPool, wethInPool, totalSupply] = await Promise.all([
    client.readContract({ address: notice.pool, abi: poolAbi, functionName: "slot0" }),
    client.readContract({ address: notice.pool, abi: poolAbi, functionName: "token0" }),
    client.readContract({ address: notice.token, abi: erc20Abi, functionName: "balanceOf", args: [notice.pool] }),
    client.readContract({ address: weth, abi: erc20Abi, functionName: "balanceOf", args: [notice.pool] }),
    client.readContract({ address: notice.token, abi: erc20Abi, functionName: "totalSupply" }),
  ]);

  // slot0 prices token1 in token0. Both sides are 18 decimals here, so the
  // only thing that matters is which side the token landed on.
  const ratio = (Number(slot0[0]) / 2 ** 96) ** 2;
  const ethPerToken = token0.toLowerCase() === notice.token.toLowerCase() ? ratio : 1 / ratio;
  const supply = Number(formatUnits(totalSupply, 18));

  // Uncollected fees sit in the pool's own balance until someone collects them,
  // so they have to come out before the balance means "still buyable". Reading
  // them first is what stops this from reporting an untouched pool and a pile
  // of fees in the same breath.
  //
  // Only the beneficiary may collect, so the simulation is sent as them. It is
  // a call, not a transaction — nothing moves.
  const beneficiary = watch ?? notice.poster;
  let tokenFees = null;
  let ethFees = null;
  try {
    const { result } = await client.simulateContract({
      address: locker,
      abi: positionLockerAbi,
      functionName: "collectFees",
      args: [notice.positionId],
      account: beneficiary,
    });

    [tokenFees, ethFees] =
      token0.toLowerCase() === notice.token.toLowerCase() ? [result[0], result[1]] : [result[1], result[0]];
  } catch {
    // Not the beneficiary, or not this locker's position. Either way the figure
    // is not this address's to read, and the reserves below stay gross.
  }

  const liquidToken = inPool - (tokenFees ?? 0n);
  const liquidWeth = wethInPool - (ethFees ?? 0n);

  const remaining = Number(formatUnits(liquidToken, 18));
  const share = supply > 0 ? (remaining / supply) * 100 : 0;

  // What is actually out in the world, which is not the same as what has left
  // the liquidity: tokens taken as fees have left the liquidity but nobody
  // holds them, and a buy that was sold straight back leaves nothing behind.
  const held = Number(formatUnits(totalSupply - inPool, 18));

  console.log(`    pool     ${notice.pool}`);
  console.log(`    price    ${ethPerToken.toExponential(4)} ETH per token`);
  console.log(`    mcap     ${num(ethPerToken * supply, 4)} ETH`);
  console.log(
    `    buyable  ${num(remaining)} ${notice.symbol} (${share.toFixed(4)}%) + ${formatEther(liquidWeth)} WETH` +
      (tokenFees === null ? "  — fees not readable here, so this is gross" : ""),
  );
  console.log(`    held     ${held > 0 ? `${num(held)} ${notice.symbol} outside the pool` : "nothing outside the pool"}`);

  if (tokenFees === null) {
    console.log(`    fees     not readable as ${short(beneficiary)} — only the poster can`);
  } else if (tokenFees === 0n && ethFees === 0n) {
    console.log("    fees     nothing yet");
  } else {
    console.log(
      `    fees     ${formatEther(ethFees)} WETH + ${num(formatUnits(tokenFees, 18))} ${notice.symbol} unclaimed` +
        `  ->  claim at hoodpad.site/dashboard as ${short(beneficiary)}`,
    );
  }
}
