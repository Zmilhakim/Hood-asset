// Verifies the deployed contracts on Blockscout. Sends no transaction and needs
// no key — verification is a claim about source, not a change to the chain.
//
//   npm run verify              # the launchpad, the hook, the kiln, and every
//                               # token launched through it
//   npm run verify -- --id 3    # one launched token, by its piece number
//   npm run verify -- --print   # print what would be submitted, send nothing
//
// It submits the *standard JSON input* that `npm run compile` already wrote and
// already proved compiles to the same bytecode. That check matters: an explorer
// rejects an input that produces different bytecode, and finding that out here
// is faster than finding it out from a rejection.
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { encodeAbiParameters, parseAbiParameters } from "viem";

import { configAddress, loadConfig } from "./lib/config.mjs";
import { connect, fail } from "./lib/env.mjs";
import { readArtifact } from "./lib/artifacts.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const inputPath = join(here, "out", "solc-input.json");

const EXPLORER = (process.env.EXPLORER_URL || "https://robinhoodchain.blockscout.com").replace(/\/$/, "");
const COMPILER = "v0.8.26+commit.8a97fa7a";
const LICENSE = "mit";

const printOnly = process.argv.includes("--print");

/** `--id 3` verifies one launched token and nothing else. */
const idFlag = process.argv.indexOf("--id");
const onlyId = idFlag === -1 ? null : BigInt(process.argv[idFlag + 1] ?? "");

if (!existsSync(inputPath)) {
  fail(
    "out/solc-input.json is not there, so there is nothing to submit.",
    "",
    "Run `npm run compile` first. out/ is built rather than committed.",
  );
}

const config = loadConfig();
const deployed = config.deployed ?? {};

if (!deployed.launchpad) {
  fail(
    "clayspad.config.json has no deployed launchpad, so there is no address to verify.",
    "",
    "Deploy first:  npm run deploy",
    "Verification is a claim about an address. Until one exists there is nothing to claim.",
  );
}

const poolManager = configAddress(config, "poolManager", "POOL_MANAGER", { what: "the v4 PoolManager" });
const treasury = configAddress(config, "treasury", "TREASURY", { what: "where the treasury's share goes" });

if (!deployed.hookSalt) {
  fail(
    "clayspad.config.json has no hookSalt, and the launchpad cannot be verified without it.",
    "",
    "It is the third constructor argument, and it was mined against a nonce that has",
    "since moved — so it cannot be recovered by re-running `npm run mine`. Find it in",
    "the deploy transaction's input data, or read it off the chain: the launchpad has",
    "no getter for it, but the deployment calldata ends with it.",
  );
}

/**
 * Each contract, and the constructor arguments it was deployed with.
 *
 * Blockscout can often work these out on its own, but "often" is not a property
 * worth relying on: a wrong guess produces a rejected submission with no useful
 * message. These are encoded from the same values the deploy used.
 */
const TARGETS = [
  {
    name: "Clayspad",
    address: deployed.launchpad,
    path: "Clayspad.sol",
    args: encodeAbiParameters(parseAbiParameters("address, address, bytes32"), [
      poolManager,
      treasury,
      deployed.hookSalt,
    ]),
  },
  {
    name: "ClayHook",
    address: deployed.hook,
    path: "ClayHook.sol",
    args: encodeAbiParameters(parseAbiParameters("address, address"), [poolManager, treasury]),
  },
  {
    name: "Kiln",
    address: deployed.kiln,
    path: "Kiln.sol",
    args: encodeAbiParameters(parseAbiParameters("address"), [poolManager]),
  },
].filter((target) => {
  if (!target.address) console.warn(`skipping ${target.name}: no address in the config`);
  return Boolean(target.address);
});

/**
 * Every token the launchpad has minted, and the arguments it minted them with.
 *
 * None of this is typed here or kept in a file. A launched token's constructor
 * took six values, and all six are in the piece the launchpad recorded — so the
 * arguments are read back out of the chain that has them rather than out of a
 * note somebody had to remember to write.
 */
async function launchedTokens() {
  const { publicClient } = await connect();
  const abi = readArtifact("Clayspad").abi;
  const launchpad = deployed.launchpad;

  const read = (functionName, args = []) => publicClient.readContract({ address: launchpad, abi, functionName, args });

  const kiln = deployed.kiln ?? (await read("kiln"));
  const count = await read("pieceCount");

  if (count === 0n) {
    console.log("the shelf is empty, so there are no launched tokens to verify\n");
    return [];
  }

  const ids = onlyId === null ? Array.from({ length: Number(count) }, (_, i) => BigInt(i)) : [onlyId];

  const targets = [];
  for (const id of ids) {
    if (id >= count) fail(`there is no piece ${id} — the shelf holds ${count}`);

    const piece = await read("pieceAt", [id]);
    targets.push({
      name: "ClayToken",
      label: `ClayToken #${id} (${piece.symbol})`,
      address: piece.token,
      path: "ClayToken.sol",
      args: encodeAbiParameters(parseAbiParameters("string, string, address, uint256, address, uint256"), [
        piece.name,
        piece.symbol,
        kiln,
        piece.toPool,
        piece.supplyWallet,
        piece.toSupplyWallet,
      ]),
    });
  }

  return targets;
}

// `--id` asks about one launched token, so the launchpad's own three are not
// what was asked for.
if (onlyId !== null) TARGETS.length = 0;
TARGETS.push(...(await launchedTokens()));

if (TARGETS.length === 0) fail("nothing to verify");

const standardInput = readFileSync(inputPath, "utf8");

console.log(`explorer   ${EXPLORER}`);
console.log(`compiler   ${COMPILER}`);
console.log(`input      out/solc-input.json (${Object.keys(JSON.parse(standardInput).sources).length} sources)\n`);

for (const target of TARGETS) {
  // Blockscout wants the constructor arguments without the 0x, and empty rather
  // than "0x" when there are none.
  const args = target.args.slice(2);

  console.log(`${(target.label ?? target.name).padEnd(22)} ${target.address}`);
  console.log(`${"".padEnd(22)} ${target.path}:${target.name}`);
  console.log(`${"".padEnd(22)} constructor args ${args.length / 2} bytes`);

  if (printOnly) {
    console.log(`${"".padEnd(22)} 0x${args}\n`);
    continue;
  }

  const form = new FormData();
  form.append("compiler_version", COMPILER);
  form.append("license_type", LICENSE);
  form.append("constructor_args", args);
  form.append("autodetect_constructor_args", "false");
  form.append("files[0]", new Blob([standardInput], { type: "application/json" }), "solc-input.json");

  const url = `${EXPLORER}/api/v2/smart-contracts/${target.address}/verification/via/standard-input`;

  let response;
  try {
    response = await fetch(url, { method: "POST", body: form });
  } catch (error) {
    console.error(`${"".padEnd(22)} could not reach the explorer: ${error.message}\n`);
    continue;
  }

  const body = await response.text();

  if (response.ok) {
    console.log(`${"".padEnd(22)} submitted — ${EXPLORER}/address/${target.address}#code\n`);
    continue;
  }

  // Blockscout sits behind a bot challenge on some networks, which answers HTML
  // rather than JSON. That is not a verification failure and should not read
  // like one.
  if (body.trimStart().startsWith("<")) {
    console.error(`${"".padEnd(22)} the explorer answered a bot challenge, not the API.`);
    console.error(`${"".padEnd(22)} Verify this one by hand — see the note at the end.\n`);
    continue;
  }

  console.error(`${"".padEnd(22)} rejected (${response.status}): ${body.slice(0, 300)}\n`);
}

console.log("If the API refused, every submission above can be made by hand:");
console.log(`  1. open ${EXPLORER}/address/<address>/contract-verification`);
console.log("  2. choose Solidity (standard JSON input)");
console.log(`  3. compiler ${COMPILER}, upload out/solc-input.json`);
console.log("  4. paste the constructor arguments printed by `npm run verify -- --print`");
