// Posts one token to the board: mints the supply, opens its pool, and locks the
// whole supply into it. One transaction, no posting fee, nothing held back.
//
//   NAME="Some Token" SYMBOL=SOME npm run launch                 # prints the plan
//   NAME="Some Token" SYMBOL=SOME CONFIRM=launch npm run launch  # sends it
//
// IMAGE, BLURB and LINK are optional and go on the notice. FLOOR_ETH and
// CEIL_ETH override the range in the config for one run.
//
// Do not chain these with `&&`. A dry run is a success, so the first command
// exits 0 without sending anything and the next one in the chain would run
// against a launch that never happened.
import { createWalletClient, formatEther, http, parseEventLogs } from "viem";

import { configAddress, configNumber, configPrice, loadConfig } from "./lib/config.mjs";
import { connect, fail, requireDeployerKey, requireEnv } from "./lib/env.mjs";
import { readArtifact } from "./lib/artifacts.mjs";
import { toollpadPoolKey } from "./lib/pool.mjs";
import { amountsInPosition, ethPerTokenFromSqrtPrice, launchRange, pricePerToken } from "./lib/ticks.mjs";

const factoryArtifact = readArtifact("ToollpadFactory");

requireEnv(["DEPLOYER_KEY", "NAME", "SYMBOL"]);

const config = loadConfig();
const factory = configAddress(config, "deployed.factory", "FACTORY", {
  what: "the Toollpad factory — run `npm run deploy` first",
});
const tickSpacing = configNumber(config, "launch.tickSpacing", "TICK_SPACING", 200);
const floorEth = configPrice(config, "launch.floorEth", "FLOOR_ETH", {
  what: "what the whole supply is worth where selling starts",
});
const ceilEth = configPrice(config, "launch.ceilEth", "CEIL_ETH", {
  what: "what the whole supply is worth at the far end of the range",
});

const account = requireDeployerKey();
const { chain, publicClient } = await connect();
if (chain.id !== config.chainId) fail(`toollpad.config.json says chain ${config.chainId}, not ${chain.id}`);

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
  tickSpacing,
  sqrtPriceX96: range.sqrtPriceX96,
  tickLower: range.tickLower,
  tickUpper: range.tickUpper,
};

console.log(`factory    ${factory}`);
console.log(`creator    ${account.address}`);
console.log(`balance    ${formatEther(await publicClient.getBalance({ address: account.address }))} ETH`);
console.log(`\ntoken      ${params.name} ($${params.symbol})`);
console.log(`supply     1,000,000,000 — all of it into the pool, none to anyone`);
console.log(`range      ${floorEth} ETH at the floor, ${ceilEth} ETH at the ceiling (whole supply)`);
console.log(`ticks      ${range.tickLower} … ${range.tickUpper}, spacing ${tickSpacing}`);
console.log(`toll       5% of every swap, 80% of it to ${account.address}`);

// Simulated against the node before anything is broadcast: a launch that would
// revert is better learned about here than from a receipt.
const { request, result } = await publicClient
  .simulateContract({
    address: factory,
    abi: factoryArtifact.abi,
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

const [launched] = parseEventLogs({ abi: factoryArtifact.abi, eventName: "Launched", logs: receipt.logs });
const notice = await publicClient.readContract({
  address: factory,
  abi: factoryArtifact.abi,
  functionName: "noticeAt",
  args: [launched.args.id],
});

const key = toollpadPoolKey({
  token: notice.token,
  hook: await publicClient.readContract({ address: factory, abi: factoryArtifact.abi, functionName: "hook" }),
  tickSpacing: notice.tickSpacing,
});
const inPosition = amountsInPosition(notice.liquidity, range.sqrtPriceX96, notice.tickLower, notice.tickUpper);

console.log(`\nnotice     #${launched.args.id}`);
console.log(`token      ${notice.token}`);
console.log(`pool       ${key.currency0} / ${key.currency1}, fee ${key.fee}, hook ${key.hooks}`);
console.log(`locked     ${inPosition.tokens / 10n ** 18n} tokens, ${formatEther(inPosition.eth)} ETH`);
console.log(`price      ${formatEther(ethPerTokenFromSqrtPrice(range.sqrtPriceX96))} ETH per token, to start`);
console.log(`\nThe liquidity is in the locker and is not coming back out. What you own is`);
console.log(`80% of the toll, which you take with \`npm run collect\`.`);
