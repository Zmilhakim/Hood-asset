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
  const response = await fetch(url, { method: "POST", body });
  const text = await response.text();

  if (response.ok) return { ok: true, message: "submitted" };

  // Already-verified is a success as far as anyone reading the explorer cares.
  if (/already verified/i.test(text)) return { ok: true, message: "already verified" };

  return { ok: false, message: `${response.status} ${text.slice(0, 200)}` };
}

async function isVerified(contract) {
  try {
    const response = await fetch(`${explorer}/api/v2/smart-contracts/${contract.address}`);
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

for (const contract of CONTRACTS) {
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
    console.log(`  FAIL   ${contract.name.padEnd(13)} ${contract.address}`);
    console.log(`         ${result.message}`);
    failures += 1;
    continue;
  }

  // Blockscout compiles in the background, so a submission is not yet an
  // answer. Wait for one rather than reporting a job as a result.
  let verified = false;
  for (let attempt = 0; attempt < 15 && !verified; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 4000));
    verified = await isVerified(contract);
  }

  console.log(
    verified
      ? `  ok     ${contract.name.padEnd(13)} ${contract.address} verified`
      : `  slow   ${contract.name.padEnd(13)} ${contract.address} submitted, still compiling — check the explorer`,
  );
}

console.log("");
if (failures > 0) {
  console.log(`  ${failures} contract${failures === 1 ? "" : "s"} did not verify. The source on the explorer is what`);
  console.log("  makes this project's claims checkable, so this is worth fixing before announcing.");
  process.exit(1);
}
console.log("  Source is published. The seal can be read rather than taken on trust.");
