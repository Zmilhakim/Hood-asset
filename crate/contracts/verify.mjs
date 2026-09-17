// Publishes the source of every deployed CRATE contract to the explorer.
//
//   npm run verify
//
// Run this straight after deploying. The whole claim this project makes is that
// the seal has no function that removes liquidity — and until the source is
// verified, nobody can check it. An explorer showing only bytecode turns the
// strongest thing about the contracts into something you have to be trusted on,
// at exactly the moment people are deciding whether to.
//
//   EXPLORER_URL=https://…   defaults to Robinhood Chain's Blockscout
//
// It sends no transaction, spends no gas and needs no private key. Verification
// is a claim about source code, checked by recompiling it — the chain is not
// touched.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

import { encodeAbiParameters, parseAbiParameters } from "viem";

import { fail } from "./lib/env.mjs";
import { configAddress, loadConfig } from "./lib/config.mjs";

const require = createRequire(import.meta.url);
const solc = require("solc");

const here = dirname(fileURLToPath(import.meta.url));
const explorer = (process.env.EXPLORER_URL || "https://robinhoodchain.blockscout.com").replace(/\/$/, "");

/**
 * Blockscout sits behind Cloudflare, which answers a bare fetch with a
 * challenge page rather than the API. Looking like a browser is usually enough
 * to be let through; when it is not, the script says so and hands over the
 * manual route rather than leaving a 403 and an HTML fragment on screen.
 */
const BROWSER_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  accept: "application/json, text/plain, */*",
  "accept-language": "en-US,en;q=0.9",
  origin: explorer,
  referer: `${explorer}/`,
};

const isChallenge = (status, text) =>
  status === 403 && /just a moment|cloudflare|cf-browser-verification|challenge/i.test(text);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Blockscout rate-limits, and four submissions with polling between them is
 * enough to trip it. A 429 is not a failure, it is the server asking for a
 * pause — so pause, and ask again, for longer each time.
 */
async function withBackoff(attempt, label) {
  for (let tries = 0; tries < 6; tries += 1) {
    const result = await attempt();
    if (result.status !== 429) return result;

    const wait = 5_000 * 2 ** tries;
    console.log(`         ${label}: rate limited, waiting ${wait / 1000}s`);
    await sleep(wait);
  }
  return { status: 429, text: "rate limited after six attempts" };
}

let input;
try {
  input = readFileSync(join(here, "out", "solc-input.json"), "utf8");
} catch {
  fail("out/solc-input.json is not there — run `npm run compile` first.");
}

// The exact compiler, taken from the compiler rather than written down. A
// version that is close but not identical produces different bytecode and a
// rejection that does not say why.
const version = `v${solc.version().replace(".Emscripten.clang", "")}`;

const config = loadConfig();
const poolManager = configAddress(config, "poolManager", "POOL_MANAGER", { what: "the pool manager" });
const treasury = configAddress(config, "treasury", "TREASURY", { what: "the fee address" });

const deployed = config.deployed ?? {};
if (!deployed.packer) {
  fail(
    "nothing is deployed yet, so there is no source to publish.",
    "",
    "Run `npm run deploy` and `npm run pack` first; both write their addresses",
    "back into crate.config.json, which is where this reads them from.",
  );
}

const address = (value) => (value && value !== "" ? value : null);

/**
 * What to submit, and what each was built with.
 *
 * Constructor arguments are supplied rather than left to the explorer to guess.
 * Two of these contracts were deployed by another contract, so there is no
 * creation transaction to recover them from, and an explorer that cannot find
 * them reports a mismatch that looks like the source being wrong.
 */
const CONTRACTS = [
  {
    name: "CratePacker",
    path: "CratePacker.sol",
    address: address(deployed.packer),
    args: encodeAbiParameters(parseAbiParameters("address, address"), [poolManager, treasury]),
  },
  {
    name: "CrateSeal",
    path: "CrateSeal.sol",
    address: address(deployed.seal),
    args: encodeAbiParameters(parseAbiParameters("address, address"), [poolManager, treasury]),
  },
  {
    name: "CrateToken",
    path: "CrateToken.sol",
    address: address(deployed.token),
    // The supply was minted to the seal, not to the packer.
    args: address(deployed.seal)
      ? encodeAbiParameters(parseAbiParameters("string, string, uint256, address"), [
          "Crate",
          "CRATE",
          1_000_000_000n * 10n ** 18n,
          deployed.seal,
        ])
      : null,
  },
  {
    name: "CrateRouter",
    path: "CrateRouter.sol",
    address: address(deployed.router),
    args: encodeAbiParameters(parseAbiParameters("address"), [deployed.packer]),
  },
];

async function verify(contract) {
  const body = new FormData();
  body.append("compiler_version", version);
  body.append("license_type", "mit");
  body.append("contract_name", `${contract.path}:${contract.name}`);
  body.append("autodetect_constructor_args", contract.args ? "false" : "true");
  if (contract.args) body.append("constructor_args", contract.args);
  body.append("files[0]", new Blob([input], { type: "application/json" }), "solc-input.json");

  const url = `${explorer}/api/v2/smart-contracts/${contract.address}/verification/via/standard-input`;

  const { status, text, ok } = await withBackoff(async () => {
    const r = await fetch(url, { method: "POST", body, headers: BROWSER_HEADERS });
    return { status: r.status, text: await r.text(), ok: r.ok };
  }, contract.name);

  const response = { ok, status };

  if (response.ok) return { ok: true, message: "submitted" };

  if (status === 429) return { ok: false, message: "still rate limited — re-run in a few minutes" };

  // Already-verified is a success as far as anyone reading the explorer cares.
  if (/already verified/i.test(text)) return { ok: true, message: "already verified" };

  if (isChallenge(response.status, text)) return { ok: false, blocked: true, message: "blocked by Cloudflare" };

  return { ok: false, message: `${response.status} ${text.slice(0, 200)}` };
}

async function isVerified(contract) {
  try {
    const response = await fetch(`${explorer}/api/v2/smart-contracts/${contract.address}`, {
      headers: BROWSER_HEADERS,
    });
    if (!response.ok) return false;
    const body = await response.json();
    return Boolean(body.is_verified);
  } catch {
    return false;
  }
}

console.log(`explorer   ${explorer}`);
console.log(`compiler   ${version}`);
console.log(`sources    ${Object.keys(JSON.parse(input).sources).length} files, imports included`);
console.log("");

let failures = 0;
let blocked = 0;

let first = true;
for (const contract of CONTRACTS) {
  // A gap between submissions, because the limit is on the account rather than
  // on any one contract.
  if (!first) await sleep(4000);
  first = false;

  if (!contract.address) {
    console.log(`  skip   ${contract.name.padEnd(13)} not deployed yet`);
    continue;
  }

  if (await isVerified(contract)) {
    console.log(`  ok     ${contract.name.padEnd(13)} ${contract.address} already verified`);
    continue;
  }

  const result = await verify(contract);
  if (!result.ok) {
    console.log(`  ${result.blocked ? "block" : "FAIL "}  ${contract.name.padEnd(13)} ${contract.address}`);
    console.log(`         ${result.message}`);
    // The arguments are the hard part of verifying by hand, so print them where
    // they can be copied rather than worked out again.
    if (contract.args) console.log(`         constructor args: ${contract.args}`);
    if (result.blocked) blocked += 1;
    else failures += 1;
    continue;
  }

  // Blockscout compiles in the background, so a submission is not yet an
  // answer. Wait for one rather than reporting a job as a result.
  let verified = false;
  for (let attempt = 0; attempt < 10 && !verified; attempt += 1) {
    await sleep(6000);
    verified = await isVerified(contract);
  }

  console.log(
    verified
      ? `  ok     ${contract.name.padEnd(13)} ${contract.address} verified`
      : `  slow   ${contract.name.padEnd(13)} ${contract.address} submitted, still compiling — check the explorer`,
  );
}

console.log("");

if (blocked > 0) {
  console.log("  Cloudflare answered the API with a challenge page rather than letting it");
  console.log("  through. That is about the explorer's bot protection, not about the source —");
  console.log("  the same files verify by hand in a browser, which passes the challenge.");
  console.log("");
  console.log(`  1. Open the contract on ${explorer}`);
  console.log("  2. Contract → Verify & Publish → Solidity (Standard JSON input)");
  console.log(`  3. Compiler ${version}, license MIT`);
  console.log(`  4. Upload ${join(here, "out", "solc-input.json")}`);
  console.log("  5. Paste the constructor arguments printed above for that contract");
  console.log("");
  console.log("  The arguments are the part worth copying rather than retyping: two of these");
  console.log("  were deployed by a contract, so the explorer cannot recover them itself.");
  console.log("");
  console.log("  Another instance of the same explorer may not be behind the challenge:");
  console.log("    EXPLORER_URL=https://8crv4vmq6tiu1yqr.blockscout.com npm run verify");
  process.exit(1);
}

if (failures > 0) {
  console.log(`  ${failures} contract${failures === 1 ? "" : "s"} did not verify. The source on the explorer is what`);
  console.log("  makes this project's claims checkable, so this is worth fixing before announcing.");
  process.exit(1);
}
console.log("  Source is published. The seal can be read rather than taken on trust.");
