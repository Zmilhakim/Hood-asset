// Puts one token on the snowfield: mints the supply, opens its pool, buries four
// fifths of the supply into it for good, and sends the remaining fifth to
// the supply wallet. One transaction, no posting fee.
//
//   NAME="Some Token" SYMBOL=SOME npm run launch                 # prints the plan
//   NAME="Some Token" SYMBOL=SOME CONFIRM=launch npm run launch  # sends it
//
// IMAGE, BLURB and LINK are optional and go on the drift. FLOOR_ETH, CEIL_ETH
// and SUPPLY_WALLET override the config for one run.
//
// Do not chain these with `&&`. A dry run is a success, so the first command
// exits 0 without sending anything and the next one in the chain would run
// against a launch that never happened.
import { createWalletClient, formatEther, http, parseEventLogs } from "viem";

import { configAddress, configNumber, configPrice, loadConfig } from "./lib/config.mjs";
import { connect, fail, requireDeployerKey, requireEnv } from "./lib/env.mjs";
import { readArtifact } from "./lib/artifacts.mjs";
import { snowlyPoolKey } from "./lib/pool.mjs";
import { amountsInPosition, ethPerTokenFromSqrtPrice, launchRange, pricePerToken } from "./lib/ticks.mjs";

const snowlyArtifact = readArtifact("Snowly");

requireEnv(["DEPLOYER_KEY", "NAME", "SYMBOL"]);

const config = loadConfig();
const launchpad = configAddress(config, "deployed.launchpad", "LAUNCHPAD", {
  what: "the Snowly launchpad — run `npm run deploy` first",
});
const tickSpacing = configNumber(config, "launch.tickSpacing", "TICK_SPACING", 200);
const floorEth = configPrice(config, "launch.floorEth", "FLOOR_ETH", {
  what: "what the whole supply is worth where selling starts",
});
const ceilEth = configPrice(config, "launch.ceilEth", "CEIL_ETH", {
  what: "what the whole supply is worth at the far end of the range",
});
const supplyWallet = configAddress(config, "supplyWallet", "SUPPLY_WALLET", {
  what: "where the fifth of the supply that is not buried into the pool is sent",
});

const account = requireDeployerKey();

// Which key is loaded decides two things that cannot be undone: who pays for
// this, and who the creator's share of every future fee on this pool belongs to.
// The launchpad is open to anyone, so it would accept a launch from any funded
// address — which is exactly why this is checked here rather than left to the
// chain. A launch signed by the wrong key is not an error anywhere; it is a pool
// whose fees quietly belong to somebody else.
const intendedDeployer = configAddress(config, "deployer", "DEPLOYER", {
  what: "the address that launches, and therefore earns the creator's share",
});

if (account.address.toLowerCase() !== intendedDeployer.toLowerCase()) {
  const linesForSupplyWallet =
    account.address.toLowerCase() === supplyWallet.toLowerCase()
      ? [
          "",
          "That is the supply wallet — the address a launch pays *to*, not the one",
          "it is signed by. It holds no gas and cannot send this transaction.",
        ]
      : [];

  fail(
    `snowly.config.json expects this launch to be signed by ${intendedDeployer}`,
    `but DEPLOYER_KEY belongs to ${account.address}.`,
    ...linesForSupplyWallet,
    "",
    "Load the key for the address above, or change `deployer` in the config if",
    "you really mean to launch from somewhere else — whoever signs this is who",
    "the creator's share of every fee on this pool goes to, permanently.",
  );
}

const { chain, publicClient } = await connect();
if (chain.id !== config.chainId) fail(`snowly.config.json says chain ${config.chainId}, not ${chain.id}`);

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
console.log(`  pool     800,000,000 (80%) buried into the pool, not coming back out`);
console.log(`  wallet   200,000,000 (20%) to ${supplyWallet} — liquid immediately`);
console.log(`range      ${floorEth} ETH at the floor, ${ceilEth} ETH at the ceiling (whole supply)`);
console.log(`ticks      ${range.tickLower} … ${range.tickUpper}, spacing ${tickSpacing}`);
console.log(`fee        4.5% of every swap, 75% of it to ${account.address}`);

// The fifth is the one number in this plan that somebody else has to live
// with, so it is checked against the launchpad rather than printed from here.
const [chainToPool, chainToWallet] = await publicClient.readContract({
  address: launchpad,
  abi: snowlyArtifact.abi,
  functionName: "supplyShares",
});
if (chainToPool !== 800_000_000n * 10n ** 18n || chainToWallet !== 200_000_000n * 10n ** 18n) {
  fail(
    `the launchpad splits the supply ${chainToPool} / ${chainToWallet}, which is not the 80/20 printed above.`,
    "Rewrite this script before launching anything into it.",
  );
}

// Simulated against the node before anything is broadcast: a launch that would
// revert is better learned about here than from a receipt.
const { request, result } = await publicClient
  .simulateContract({
    address: launchpad,
    abi: snowlyArtifact.abi,
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

const wallet = createWalletClient({ account, chain, transport: http() });
const hash = await wallet.writeContract(request);
console.log(`\ntx         ${hash}`);

const receipt = await publicClient.waitForTransactionReceipt({ hash });
if (receipt.status !== "success") fail("the launch reverted");

const [launched] = parseEventLogs({ abi: snowlyArtifact.abi, eventName: "Launched", logs: receipt.logs });
const drift = await publicClient.readContract({
  address: launchpad,
  abi: snowlyArtifact.abi,
  functionName: "driftAt",
  args: [launched.args.id],
});

const key = snowlyPoolKey({
  token: drift.token,
  hook: await publicClient.readContract({ address: launchpad, abi: snowlyArtifact.abi, functionName: "hook" }),
  tickSpacing: drift.tickSpacing,
});
const inPosition = amountsInPosition(drift.liquidity, range.sqrtPriceX96, drift.tickLower, drift.tickUpper);

console.log(`\ndrift      #${launched.args.id}`);
console.log(`token      ${drift.token}`);
console.log(`pool       ${key.currency0} / ${key.currency1}, fee ${key.fee}, hook ${key.hooks}`);
console.log(`buried     ${inPosition.tokens / 10n ** 18n} tokens, ${formatEther(inPosition.eth)} ETH`);
console.log(`wallet     ${drift.toSupplyWallet / 10n ** 18n} tokens to ${drift.supplyWallet}`);
console.log(`price      ${formatEther(ethPerTokenFromSqrtPrice(range.sqrtPriceX96))} ETH per token, to start`);
console.log(`\nThe buried liquidity is in the glacier and is not coming back out. What you own`);
console.log(`is 75% of the 4.5% fee, which you take with \`npm run collect\` — and whatever`);
console.log(`the supply wallet does with its fifth, which nothing here restrains.`);
