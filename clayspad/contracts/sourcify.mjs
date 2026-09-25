// Verifies on Sourcify, for chains whose Blockscout sits behind a bot challenge.
//
//   npm run verify:sourcify
//
// Sourcify is a separate, public verification service — not a mirror of an
// explorer. A contract verified there is verified permanently and checkably by
// anyone, and most Blockscout instances import its results.
//
// It takes the same standard JSON input `npm run compile` already wrote and
// already proved compiles to identical bytecode, so nothing here is a second
// description of the contracts.
//
// ## Run `npm run verify` first, and mean it
//
// Blockscout imports Sourcify's result automatically within a few minutes — and
// that import does not carry the licence. Once a contract is verified by any
// route, Blockscout refuses to verify it again ("Already verified") and offers
// no endpoint to change the licence afterwards, so the field is stuck on `none`
// for good.
//
// So the order is not a preference: **Blockscout first, with the licence, then
// Sourcify.** Getting it backwards costs the MIT label permanently.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { encodeAbiParameters, parseAbiParameters } from "viem";

import { configAddress, loadConfig } from "./lib/config.mjs";
import { fail } from "./lib/env.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const SERVER = (process.env.SOURCIFY_URL || "https://sourcify.dev/server").replace(/\/$/, "");
const CHAIN_ID = 4663;
const COMPILER = "0.8.26+commit.8a97fa7a";

const config = loadConfig();
const deployed = config.deployed ?? {};
if (!deployed.launchpad) fail("nothing deployed yet — run `npm run deploy` first");

const poolManager = configAddress(config, "poolManager", "POOL_MANAGER", { what: "the v4 PoolManager" });
const treasury = configAddress(config, "treasury", "TREASURY", { what: "where the treasury's share goes" });

const stdJsonInput = JSON.parse(readFileSync(join(here, "out", "solc-input.json"), "utf8"));

const TARGETS = [
  {
    id: "Clayspad.sol:Clayspad",
    address: deployed.launchpad,
    args: encodeAbiParameters(parseAbiParameters("address, address, bytes32"), [
      poolManager,
      treasury,
      deployed.hookSalt,
    ]),
  },
  {
    id: "ClayHook.sol:ClayHook",
    address: deployed.hook,
    args: encodeAbiParameters(parseAbiParameters("address, address"), [poolManager, treasury]),
  },
  {
    id: "Kiln.sol:Kiln",
    address: deployed.kiln,
    args: encodeAbiParameters(parseAbiParameters("address"), [poolManager]),
  },
].filter((t) => Boolean(t.address));

/** Sourcify answers a job id and verifies asynchronously; this waits for the verdict. */
async function awaitJob(verificationId) {
  for (let i = 0; i < 40; i++) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const response = await fetch(`${SERVER}/v2/verify/${verificationId}`);
    if (!response.ok) return { error: `job read failed: ${response.status}` };

    const job = await response.json();
    if (!job.isJobCompleted) continue;
    return job;
  }
  return { error: "still running after two minutes" };
}

console.warn("Reminder: `npm run verify` (Blockscout, with the MIT licence) should already have run.");
console.warn("Sourcify's result gets imported by Blockscout without a licence, and that cannot be undone.\n");

console.log(`sourcify   ${SERVER}`);
console.log(`chain      ${CHAIN_ID}`);
console.log(`compiler   ${COMPILER}\n`);

let failures = 0;

for (const target of TARGETS) {
  console.log(`${target.id.padEnd(24)} ${target.address}`);

  const response = await fetch(`${SERVER}/v2/verify/${CHAIN_ID}/${target.address}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      stdJsonInput,
      compilerVersion: COMPILER,
      contractIdentifier: target.id,
      creationTransactionHash: deployed.creationTx,
    }),
  });

  const body = await response.json().catch(() => ({}));

  // Already verified is a success, not a failure: the point is the state, not
  // who put it there.
  if (response.status === 409 || body.customCode === "already_verified") {
    console.log(`${"".padEnd(24)} already verified\n`);
    continue;
  }

  if (!response.ok || !body.verificationId) {
    console.error(`${"".padEnd(24)} rejected (${response.status}): ${JSON.stringify(body).slice(0, 220)}\n`);
    failures++;
    continue;
  }

  const job = await awaitJob(body.verificationId);

  if (job.error) {
    console.error(`${"".padEnd(24)} ${job.error}\n`);
    failures++;
  } else if (job.error_id || job.errorId) {
    console.error(`${"".padEnd(24)} failed: ${job.errorId ?? job.error_id} ${job.message ?? ""}\n`);
    failures++;
  } else {
    const match = job.contract?.match ?? job.match ?? "verified";
    console.log(`${"".padEnd(24)} ${match}`);
    console.log(`${"".padEnd(24)} https://repo.sourcify.dev/${CHAIN_ID}/${target.address}\n`);
  }
}

process.exitCode = failures > 0 ? 1 : 0;
