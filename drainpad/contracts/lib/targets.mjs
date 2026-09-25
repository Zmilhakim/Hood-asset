// What gets verified, and the constructor arguments it was deployed with.
//
// Two scripts submit these — `verify.mjs` over plain HTTP, and
// `verify-browser.mjs` from inside a real browser when the explorer is behind a
// bot challenge. Working the list out lives here so there is one answer to
// "what are we claiming about which address", rather than two that can drift apart.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { encodeAbiParameters, parseAbiParameters } from "viem";

import { configAddress, loadConfig } from "./config.mjs";
import { connect, fail } from "./env.mjs";
import { readArtifact } from "./artifacts.mjs";

const here = dirname(dirname(fileURLToPath(import.meta.url)));
const inputPath = join(here, "out", "solc-input.json");

export const EXPLORER = (process.env.EXPLORER_URL || "https://robinhoodchain.blockscout.com").replace(/\/$/, "");
export const COMPILER = "v0.8.26+commit.8a97fa7a";

/**
 * MIT, and it is set here or never.
 *
 * A contract's licence can only be recorded while it is being verified. Once it
 * is verified by any route the explorer answers "Already verified" to every
 * further attempt, and it exposes no endpoint for changing the licence
 * afterwards. Blockscout also imports Sourcify's results automatically, and that
 * import carries no licence — which is why Blockscout goes first.
 */
export const LICENSE = "mit";

/** The standard JSON input `npm run compile` wrote, and proved compiles clean. */
export function standardInput() {
  if (!existsSync(inputPath)) {
    fail(
      "out/solc-input.json is not there, so there is nothing to submit.",
      "",
      "Run `npm run compile` first. out/ is built rather than committed.",
    );
  }
  return readFileSync(inputPath, "utf8");
}

/**
 * Every address to verify.
 *
 * `onlyId` asks about one launched token, in which case the launchpad's own
 * three contracts are not what was asked for and are left out.
 */
export async function verificationTargets({ onlyId = null } = {}) {
  const config = loadConfig();
  const deployed = config.deployed ?? {};

  if (!deployed.launchpad) {
    fail(
      "drainpad.config.json has no deployed launchpad, so there is no address to verify.",
      "",
      "Deploy first:  npm run deploy",
      "Verification is a claim about an address. Until one exists there is nothing to claim.",
    );
  }

  const poolManager = configAddress(config, "poolManager", "POOL_MANAGER", { what: "the v4 PoolManager" });
  const treasury = configAddress(config, "treasury", "TREASURY", { what: "where the treasury's share goes" });

  if (!deployed.hookSalt) {
    fail(
      "drainpad.config.json has no hookSalt, and the launchpad cannot be verified without it.",
      "",
      "It is the third constructor argument, and it was mined against a nonce that has",
      "since moved — so it cannot be recovered by re-running `npm run mine`. Find it in",
      "the deploy transaction's input data.",
    );
  }

  // Blockscout can often work these out on its own, but "often" is not a
  // property worth relying on: a wrong guess produces a rejected submission with
  // no useful message. These are encoded from the values the deploy used.
  const own = [
    {
      name: "Drainpad",
      address: deployed.launchpad,
      path: "Drainpad.sol",
      args: encodeAbiParameters(parseAbiParameters("address, address, bytes32"), [
        poolManager,
        treasury,
        deployed.hookSalt,
      ]),
    },
    {
      name: "Grate",
      address: deployed.hook,
      path: "Grate.sol",
      args: encodeAbiParameters(parseAbiParameters("address, address"), [poolManager, treasury]),
    },
    {
      name: "Sump",
      address: deployed.sump,
      path: "Sump.sol",
      args: encodeAbiParameters(parseAbiParameters("address"), [poolManager]),
    },
  ].filter((target) => {
    if (!target.address) console.warn(`skipping ${target.name}: no address in the config`);
    return Boolean(target.address);
  });

  const tokens = await launchedTokens({ deployed, onlyId });

  return onlyId === null ? [...own, ...tokens] : tokens;
}

/**
 * Every token the launchpad has minted, and the arguments it minted them with.
 *
 * None of this is typed here or kept in a file. A launched token's constructor
 * took six values, and all six are in the runoff the launchpad recorded — so the
 * arguments are read back out of the chain that has them rather than out of a
 * note somebody had to remember to write.
 */
async function launchedTokens({ deployed, onlyId }) {
  const { publicClient } = await connect();
  const abi = readArtifact("Drainpad").abi;
  const launchpad = deployed.launchpad;

  const read = (functionName, args = []) => publicClient.readContract({ address: launchpad, abi, functionName, args });

  const sump = deployed.sump ?? (await read("sump"));
  const count = await read("runoffCount");

  if (count === 0n) {
    console.log("the catchment is empty, so there are no launched tokens to verify\n");
    return [];
  }

  const ids = onlyId === null ? Array.from({ length: Number(count) }, (_, i) => BigInt(i)) : [onlyId];

  const targets = [];
  for (const id of ids) {
    if (id >= count) fail(`there is no runoff ${id} — the catchment holds ${count}`);

    const runoff = await read("runoffAt", [id]);
    targets.push({
      name: "DrainToken",
      label: `DrainToken #${id} (${runoff.symbol})`,
      address: runoff.token,
      path: "DrainToken.sol",
      args: encodeAbiParameters(parseAbiParameters("string, string, address, uint256, address, uint256"), [
        runoff.name,
        runoff.symbol,
        sump,
        runoff.toPool,
        runoff.supplyWallet,
        runoff.toSupplyWallet,
      ]),
    });
  }

  return targets;
}

/** The API this submits to, for one address. */
export function verificationUrl(address) {
  return `${EXPLORER}/api/v2/smart-contracts/${address}/verification/via/standard-input`;
}

/** How a submission prints, so both scripts report the same shape. */
export function describe(target) {
  console.log(`${(target.label ?? target.name).padEnd(22)} ${target.address}`);
  console.log(`${"".padEnd(22)} ${target.path}:${target.name}`);
  console.log(`${"".padEnd(22)} constructor args ${(target.args.length - 2) / 2} bytes`);
}

export const indent = "".padEnd(22);
