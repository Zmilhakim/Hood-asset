// Verifies on Blockscout from inside a real browser.
//
//   npm run verify:browser              # the launchpad, the hook, the sump
//   npm run verify:browser -- --id 3    # one launched token
//
// This chain's explorer sits behind Cloudflare's JavaScript challenge. It
// answers 403 to a request from a program however that request is dressed —
// carrying the clearance cookie is not enough, because the challenge is also
// judging the connection itself. What satisfies it is a browser, so this uses
// one, and submits the form from inside the loaded page.
//
// The submission is the same submission `verify.mjs` makes: the same standard
// JSON input, the same constructor arguments, the same MIT licence. Only the
// thing doing the POST is different. Both read the list from lib/targets.mjs,
// so there is one description of what is being claimed about which address.
//
// It sends no transaction and needs no private key.
//
// CHROME overrides where the browser is; any Chrome or Chromium will do, and no
// Playwright browser download is needed.
import { existsSync } from "node:fs";
import { createRequire } from "node:module";

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

const require = createRequire(import.meta.url);

/** Where a browser tends to be, in the order worth trying. */
const CHROME_CANDIDATES = [
  process.env.CHROME,
  "/root/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux-arm64/chrome-headless-shell",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
].filter(Boolean);

const executablePath = CHROME_CANDIDATES.find((path) => existsSync(path));
if (!executablePath) {
  console.error("no browser found. Set CHROME=/path/to/chrome, or install one.");
  process.exit(1);
}

let chromium;
try {
  ({ chromium } = require("playwright-core"));
} catch {
  console.error("playwright-core is not installed here: npm install -D playwright-core");
  process.exit(1);
}

const idFlag = process.argv.indexOf("--id");
const onlyId = idFlag === -1 ? null : BigInt(process.argv[idFlag + 1] ?? "");

const input = standardInput();
const targets = await verificationTargets({ onlyId });

console.log(`browser    ${executablePath}`);
console.log(`explorer   ${EXPLORER}`);
console.log(`compiler   ${COMPILER}`);
console.log(`input      out/solc-input.json (${Object.keys(JSON.parse(input).sources).length} sources)\n`);

/**
 * Whether the explorer already holds verified source for an address.
 *
 * Asked before every submission, because a submission that was already accepted
 * is the expensive way to find that out: the explorer rate-limits verification
 * hard, and spending that budget re-claiming something it already has can starve
 * the contract that still needs it. A read costs almost nothing by comparison.
 */
async function alreadyVerified(page, address) {
  return page.evaluate(async (addr) => {
    const response = await fetch(`/api/v2/smart-contracts/${addr}`, { headers: { accept: "application/json" } });
    if (response.status !== 200) return null;
    const body = await response.json();
    return body.is_verified ? { license: body.license_type, compiler: body.compiler_version } : false;
  }, address);
}

/** Between submissions, and after a rate-limited one. */
const PAUSE_MS = Number(process.env.PAUSE_MS ?? 20_000);
const RETRIES = Number(process.env.RETRIES ?? 4);

/**
 * One submission, made from inside the loaded page so the challenge is
 * satisfied by the browser that earned it.
 *
 * A 429 is retried rather than reported: the explorer is saying "not yet", which
 * is a different thing from refusing the claim, and giving up on it would leave
 * a contract unverified for a reason that resolves itself by waiting.
 */
async function submit(page, target) {
  let result;

  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    if (attempt > 0) {
      console.log(`${indent} rate-limited, waiting ${(PAUSE_MS * attempt) / 1000}s (attempt ${attempt + 1})`);
      await page.waitForTimeout(PAUSE_MS * attempt);
    }

    result = await page.evaluate(
      async ({ url, compiler, license, args }) => {
        const form = new FormData();
        form.append("compiler_version", compiler);
        form.append("license_type", license);
        form.append("constructor_args", args);
        form.append("autodetect_constructor_args", "false");
        form.append("files[0]", new Blob([window.__solcInput], { type: "application/json" }), "solc-input.json");

        const response = await fetch(url, { method: "POST", body: form });
        return { status: response.status, ok: response.ok, body: (await response.text()).slice(0, 400) };
      },
      {
        url: verificationUrl(target.address),
        compiler: COMPILER,
        license: LICENSE,
        args: target.args.slice(2),
      },
    );

    if (result.status !== 429) return result;
  }

  return result;
}

const browser = await chromium.launch({ executablePath, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
let failures = 0;

try {
  const page = await browser.newPage();
  await page.goto(`${EXPLORER}/`, { waitUntil: "domcontentloaded", timeout: 120_000 });

  // The challenge replaces the page once it is satisfied. Waiting on the title
  // rather than a fixed sleep means a fast clearance is not paid for.
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (!/just a moment|attention required/i.test(await page.title())) break;
    await page.waitForTimeout(1_500);
  }
  if (/just a moment|attention required/i.test(await page.title())) {
    console.error("the challenge did not clear — the explorer is still asking.");
    process.exit(1);
  }

  // Proof rather than assumption: the API is what the submissions use, so the
  // API is what gets tested before anything is submitted against it.
  const probe = await page.evaluate(async () => (await fetch("/api/v2/stats")).status);
  if (probe !== 200) {
    console.error(`the page loaded but its API still answers ${probe}`);
    process.exit(1);
  }
  console.log("challenge cleared, the API answers from inside the page\n");

  // The input goes over once and stays on the page, rather than being shipped
  // again for every address.
  await page.evaluate((text) => {
    window.__solcInput = text;
  }, input);

  let submitted = 0;

  for (const target of targets) {
    describe(target);

    const standing = await alreadyVerified(page, target.address);
    if (standing) {
      console.log(`${indent} already verified, licence ${standing.license ?? "none"} — nothing to send\n`);
      continue;
    }

    // Blockscout rate-limits verification by IP, and a standard-JSON submission
    // is expensive enough at its end that two in a row can trip it. Pausing
    // between them is not a workaround for the limit, it is staying inside it.
    if (submitted > 0) await page.waitForTimeout(PAUSE_MS);
    submitted++;

    const result = await submit(page, target);

    if (result.ok) {
      console.log(`${indent} submitted — ${EXPLORER}/address/${target.address}#code\n`);
      continue;
    }

    // "Already verified" is not a failure. It is the explorer saying the claim
    // this script is making was already accepted.
    if (/already verified/i.test(result.body)) {
      console.log(`${indent} already verified — ${EXPLORER}/address/${target.address}#code\n`);
      continue;
    }

    failures++;
    console.error(`${indent} rejected (${result.status}): ${result.body}\n`);
  }
} finally {
  await browser.close();
}

if (failures > 0) {
  console.error(`${failures} submission(s) were rejected.`);
  process.exit(1);
}

console.log("Blockscout has the source, with the MIT licence recorded.");
console.log("Sourcify next, and only now — it is imported back without a licence:\n");
console.log("    npm run verify:sourcify");
