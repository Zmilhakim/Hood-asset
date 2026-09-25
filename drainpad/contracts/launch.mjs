// Puts one token on the catchment: mints the supply, opens its pool, sinks three
// quarters of the supply into it for good, and sends the remaining quarter to
// the supply wallet. One transaction, no posting fee.
//
//   NAME="Some Token" SYMBOL=SOME npm run launch                 # prints the plan
//   NAME="Some Token" SYMBOL=SOME CONFIRM=launch npm run launch  # sends it
//
// IMAGE, BLURB and LINK are optional and go on the runoff. FLOOR_ETH, CEIL_ETH
// and SUPPLY_WALLET override the config for one run.
//
// Do not chain these with `&&`. A dry run is a success, so the first command
// exits 0 without sending anything and the next one in the chain would run
// against a launch that never happened.
import { createWalletClient, formatEther, http, parseEventLogs } from "viem";

import { configAddress, configNumber, configPrice, loadConfig } from "./lib/config.mjs";
import { rpcTransport, connect, fail, requireDeployerKey, requireEnv } from "./lib/env.mjs";
import { readArtifact } from "./lib/artifacts.mjs";
import { drainpadPoolKey } from "./lib/pool.mjs";
import { amountsInPosition, ethPerTokenFromSqrtPrice, launchRange, pricePerToken } from "./lib/ticks.mjs";

const drainpadArtifact = readArtifact("Drainpad");

requireEnv(["DEPLOYER_KEY", "NAME", "SYMBOL"]);

const config = loadConfig();
const launchpad = configAddress(config, "deployed.launchpad", "LAUNCHPAD", {
  what: "the Drainpad launchpad — run `npm run deploy` first",
});
const tickSpacing = configNumber(config, "launch.tickSpacing", "TICK_SPACING", 200);
const floorEth = configPrice(config, "launch.floorEth", "FLOOR_ETH", {
  what: "what the whole supply is worth where selling starts",
});
const ceilEth = configPrice(config, "launch.ceilEth", "CEIL_ETH", {
  what: "what the whole supply is worth at the far end of the range",
});
const supplyWallet = configAddress(config, "supplyWallet", "SUPPLY_WALLET", {
  what: "where the quarter of the supply that is not sunk into the pool is sent",
});

const account = requireDeployerKey();
const { chain, publicClient, rpcUrl } = await connect();
if (chain.id !== config.chainId) fail(`drainpad.config.json says chain ${config.chainId}, not ${chain.id}`);

const WHOLE_SUPPLY = 1_000_000_000n;
const range = launchRange({
  floorEthPerToken: pricePerToken(floorEth, WHOLE_SUPPLY),
  ceilEthPerToken: pricePerToken(ceilEth, WHOLE_SUPPLY),
  tickSpacing,
});

const params = {
  name: process.env.NAME,
  symbol: process.env.SYMBOL,
  imageURI: process.env.IMAGE ?? "",
  blurb: process.env.BLURB ?? "",
  link: process.env.LINK ?? "",
  supplyWallet,
  tickSpacing,
  sqrtPriceX96: range.sqrtPriceX96,
  tickLower: range.tickLower,
  tickUpper: range.tickUpper,
};

console.log(`launchpad  ${launchpad}`);
console.log(`creator    ${account.address}`);
console.log(`balance    ${formatEther(await publicClient.getBalance({ address: account.address }))} ETH`);
console.log(`\ntoken      ${params.name} ($${params.symbol})`);
console.log(`supply     1,000,000,000`);
console.log(`  pool     750,000,000 (75%) sunk into the pool, not coming back out`);
console.log(`  wallet   250,000,000 (25%) to ${supplyWallet} — liquid immediately`);
console.log(`range      ${floorEth} ETH at the floor, ${ceilEth} ETH at the ceiling (whole supply)`);
console.log(`ticks      ${range.tickLower} … ${range.tickUpper}, spacing ${tickSpacing}`);
console.log(`fee        4% of every swap, 75% of it to ${account.address}`);

// The quarter is the one number in this plan that somebody else has to live
// with, so it is checked against the launchpad rather than printed from here.
const [chainToPool, chainToWallet] = await publicClient.readContract({
  address: launchpad,
  abi: drainpadArtifact.abi,
  functionName: "supplyShares",
});
if (chainToPool !== 750_000_000n * 10n ** 18n || chainToWallet !== 250_000_000n * 10n ** 18n) {
  fail(
    `the launchpad splits the supply ${chainToPool} / ${chainToWallet}, which is not the 75/25 printed above.`,
    "Rewrite this script before launching anything into it.",
  );
}

// Simulated against the node before anything is broadcast: a launch that would
// revert is better learned about here than from a receipt.
const { request, result } = await publicClient
  .simulateContract({
    address: launchpad,
    abi: drainpadArtifact.abi,
    functionName: "launch",
    args: [params],
    account,
  })
  .catch((error) => {
    fail(
      "the launch would revert:",
      `  ${error.shortMessage ?? error.message?.split("\n")[0] ?? error}`,
      "",
      "A pool that already exists for this token, or a range that does not sit",
      "entirely below the opening price, are the two that come up.",
    );
  });

const [, token] = result;
console.log(`\nwould deploy the token at ${token}`);

if (process.env.CONFIRM !== "launch") {
  console.log(`\nNothing was sent. To send it:\n`);
  console.log(`    NAME="${params.name}" SYMBOL="${params.symbol}" CONFIRM=launch npm run launch`);
  process.exit(0);
}

const wallet = createWalletClient({ account, chain, transport: rpcTransport(rpcUrl) });
const hash = await wallet.writeContract(request);
console.log(`\ntx         ${hash}`);

const receipt = await publicClient.waitForTransactionReceipt({ hash });
if (receipt.status !== "success") fail("the launch reverted");

const [launched] = parseEventLogs({ abi: drainpadArtifact.abi, eventName: "Launched", logs: receipt.logs });
const runoff = await publicClient.readContract({
  address: launchpad,
  abi: drainpadArtifact.abi,
  functionName: "runoffAt",
  args: [launched.args.id],
});

const key = drainpadPoolKey({
  token: runoff.token,
  hook: await publicClient.readContract({ address: launchpad, abi: drainpadArtifact.abi, functionName: "grate" }),
  tickSpacing: runoff.tickSpacing,
});
const inPosition = amountsInPosition(runoff.liquidity, range.sqrtPriceX96, runoff.tickLower, runoff.tickUpper);

console.log(`\nrunoff      #${launched.args.id}`);
console.log(`token      ${runoff.token}`);
console.log(`pool       ${key.currency0} / ${key.currency1}, fee ${key.fee}, hook ${key.hooks}`);
console.log(`sunk       ${inPosition.tokens / 10n ** 18n} tokens, ${formatEther(inPosition.eth)} ETH`);
console.log(`wallet     ${runoff.toSupplyWallet / 10n ** 18n} tokens to ${runoff.supplyWallet}`);
console.log(`price      ${formatEther(ethPerTokenFromSqrtPrice(range.sqrtPriceX96))} ETH per token, to start`);
console.log(`\nThe sunk liquidity is in the sump and is not coming back out. What you own`);
console.log(`is 75% of the 4% fee, which you take with \`npm run collect\` — and whatever`);
console.log(`the supply wallet does with its quarter, which nothing here restrains.`);
