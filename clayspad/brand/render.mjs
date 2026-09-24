// Draws the Clayspad mark, at the level the contracts set.
//
//   node render.mjs
//
// This is not the brand kit. The profile picture, the header and the link
// preview are generated elsewhere, from the prompts in PROMPTS.md. What this
// writes is the reference: the exact silhouette and the exact level, so a
// generated image has something precise to be checked against — and so the
// level is never a number somebody remembered.
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

import { potBodySvg, potSvg, lockupSvg, wordmarkSvg, PALETTE, SIZE } from "./lib/marks.mjs";

const sharp = createRequire(import.meta.url)("sharp");

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "out");
const contracts = join(here, "..", "contracts", "src");

/**
 * A constant, read out of the contract rather than typed here.
 *
 * A mark drawn at three quarters is a claim about deployed code, and it is
 * worth exactly as much as the check behind it.
 */
function constantFrom(file, name) {
  const source = readFileSync(join(contracts, file), "utf8");
  // Solidity writes 1_000_000_000e18, so the exponent is part of the literal
  // and not optional to read.
  const match = source.match(new RegExp(`constant\\s+${name}\\s*=\\s*([0-9_]+)(?:e(\\d+))?\\s*;`));
  if (!match) throw new Error(`${file} no longer declares ${name}`);
  return BigInt(match[1].replaceAll("_", "")) * 10n ** BigInt(match[2] ?? 0);
}

const POOL_BPS = Number(constantFrom("Clayspad.sol", "POOL_BPS"));
const SUPPLY_WALLET_BPS = Number(constantFrom("Clayspad.sol", "SUPPLY_WALLET_BPS"));

if (POOL_BPS + SUPPLY_WALLET_BPS !== 10_000) {
  throw new Error(`the two shares add up to ${POOL_BPS + SUPPLY_WALLET_BPS} bps, which is not a whole supply`);
}

/**
 * The kiln's whole claim is a negative: there is no way out. Assert it against
 * the source, so a mark that means *fired for good* cannot outlive the contract
 * that made it true.
 */
const kilnSource = readFileSync(join(contracts, "Kiln.sol"), "utf8");
for (const pattern of [/function\s+withdraw/, /function\s+collect/, /function\s+rescue/, /liquidityDelta:\s*-/]) {
  if (pattern.test(kilnSource)) throw new Error(`Kiln.sol now matches ${pattern} — the mark would mean something untrue`);
}

/**
 * How full the pot is: the pool's share, rounded to the mark's grid.
 *
 * This is the point of the whole file. The level is not where someone put it,
 * it is where the contract puts it — so the mark and the code cannot drift
 * apart without this script saying so.
 */
const FILL_ROWS = Math.round((SIZE * POOL_BPS) / 10_000);
if (FILL_ROWS <= SIZE / 2) {
  throw new Error(`the pool's share is now ${POOL_BPS / 100}%, which does not read as a full pot — redraw the mark`);
}

mkdirSync(out, { recursive: true });

writeFileSync(join(out, "logo-mark.svg"), potSvg({ fillRows: FILL_ROWS, size: 512 }));
writeFileSync(join(out, "logo-wordmark.svg"), wordmarkSvg({ unit: 12, color: PALETTE.paper }));
writeFileSync(join(out, "logo-lockup.svg"), lockupSvg({ fillRows: FILL_ROWS, unit: 12 }));
writeFileSync(join(out, "logo-lockup-light.svg"), lockupSvg({ fillRows: FILL_ROWS, unit: 12, color: PALETTE.ink }));

for (const size of [256, 512, 1024]) {
  await sharp(Buffer.from(potSvg({ fillRows: FILL_ROWS, size }))).png().toFile(join(out, `logo-mark-${size}.png`));
}

// Full-bleed near-black, because a circle crop takes the corners off a mark
// centred on a square. The padding is wider than the logo's: the crop is round,
// and the pot's lip is the part of this shape furthest from the middle.
const AVATAR_PAD = 3;
const span = SIZE + AVATAR_PAD * 2;
const avatar = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${span} ${span}" width="1000" height="1000" shape-rendering="crispEdges">
  <rect width="${span}" height="${span}" fill="${PALETTE.ground}"/>
  ${potBodySvg({ fillRows: FILL_ROWS, pad: AVATAR_PAD })}
</svg>`;
await sharp(Buffer.from(avatar)).png().toFile(join(out, "avatar-reference-1000.png"));

console.log(`reference marks written to out/`);
console.log(`filled to ${FILL_ROWS}/${SIZE} rows — that is POOL_BPS at ${POOL_BPS / 100}%, not a decision made here`);
console.log(`the images themselves come from PROMPTS.md`);
