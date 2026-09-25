// Verifies the deployed contracts on Blockscout. Sends no transaction and needs
// no key — verification is a claim about source, not a change to the chain.
//
//   npm run verify              # the launchpad, the hook, the sump, and every
//                               # token launched through it
//   npm run verify -- --id 3    # one launched token, by its runoff number
//   npm run verify -- --print   # print what would be submitted, send nothing
//
// It submits the *standard JSON input* that `npm run compile` already wrote and
// already proved compiles to the same bytecode. That check matters: an explorer
// rejects an input that produces different bytecode, and finding that out here
// is faster than finding it out from a rejection.
//
// **If the explorer answers a bot challenge, use `npm run verify:browser`.**
// This chain's Blockscout sits behind Cloudflare, which refuses a request from
// a program however it is dressed. That script runs a real browser and submits
// from inside the page; everything else about the submission is identical.
import {
  COMPILER,
  EXPLORER,
  LICENSE,
  describe,
  indent,
  standardInput,
  verificationTargets,
  verificationUrl,
} from "./lib/targets.mjs";

const printOnly = process.argv.includes("--print");

/** `--id 3` verifies one launched token and nothing else. */
const idFlag = process.argv.indexOf("--id");
const onlyId = idFlag === -1 ? null : BigInt(process.argv[idFlag + 1] ?? "");

const input = standardInput();
const targets = await verificationTargets({ onlyId });

console.log(`explorer   ${EXPLORER}`);
console.log(`compiler   ${COMPILER}`);
console.log(`input      out/solc-input.json (${Object.keys(JSON.parse(input).sources).length} sources)\n`);

let challenged = false;

for (const target of targets) {
  describe(target);

  // Blockscout wants the constructor arguments without the 0x.
  const args = target.args.slice(2);

  if (printOnly) {
    console.log(`${indent} 0x${args}\n`);
    continue;
  }

  const form = new FormData();
  form.append("compiler_version", COMPILER);
  form.append("license_type", LICENSE);
  form.append("constructor_args", args);
  form.append("autodetect_constructor_args", "false");
  form.append("files[0]", new Blob([input], { type: "application/json" }), "solc-input.json");

  let response;
  try {
    response = await fetch(verificationUrl(target.address), { method: "POST", body: form });
  } catch (error) {
    console.error(`${indent} could not reach the explorer: ${error.message}\n`);
    continue;
  }

  const body = await response.text();

  if (response.ok) {
    console.log(`${indent} submitted — ${EXPLORER}/address/${target.address}#code\n`);
    continue;
  }

  // Blockscout sits behind a bot challenge on some networks, which answers HTML
  // rather than JSON. That is not a verification failure and should not read
  // like one.
  if (body.trimStart().startsWith("<")) {
    challenged = true;
    console.error(`${indent} the explorer answered a bot challenge, not the API.\n`);
    continue;
  }

  console.error(`${indent} rejected (${response.status}): ${body.slice(0, 300)}\n`);
}

if (challenged) {
  console.log("The explorer is behind a bot challenge. Submit through a real browser:\n");
  console.log("    npm run verify:browser\n");
  console.log("Or by hand, one address at a time:");
  console.log(`  1. open ${EXPLORER}/address/<address>/contract-verification`);
  console.log("  2. choose Solidity (standard JSON input)");
  console.log(`  3. compiler ${COMPILER}, licence MIT, upload out/solc-input.json`);
  console.log("  4. paste the constructor arguments printed by `npm run verify -- --print`");
}
