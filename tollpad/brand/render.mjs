// Renders the Tollpad brand kit.
//
//   node render.mjs
//
// Vector marks go straight through sharp; the banner and the cards are laid out
// in HTML and screenshotted, because they are typography, not geometry.
// Everything here is reproducible — edit the source, re-run, commit the output.
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

import { gateBodySvg, gateSvg, lockupSvg, wordmarkSvg, PALETTE } from "./lib/marks.mjs";

const require = createRequire(import.meta.url);
const sharp = require("sharp");
const { chromium } = require("playwright");

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "out");
const contracts = join(here, "..", "contracts", "src");

// --- the things you would change -------------------------------------------
export const BRAND = {
  ticker: "$TOLL",
  chain: "ROBINHOOD CHAIN 4663",
  venue: "UNISWAP V4",
  promise: "5% TOLL · 80% TO THE CREATOR",
  tagline: "LAUNCH A TOKEN. CHARGE A TOLL.",
  line: "One hook, one fee, both directions. The supply is all in the pool and the pool is locked — what a launch earns is the toll.",
};

// No domain and no handle on any of this art. The profile shows both already,
// and an image that repeats them is one more thing that can go stale or turn out
// to belong to somebody else. Nothing gets printed as pixels until it is
// registered — see X-PROFILE.md.

/**
 * The rates, read out of the contract rather than typed here.
 *
 * A card that prints "5%" is a claim about a deployed contract, and it is worth
 * exactly as much as the check behind it. These come from the source the hook is
 * compiled from, and the render fails rather than shipping a number the contract
 * does not agree with.
 */
function constantFrom(file, name) {
  const source = readFileSync(join(contracts, file), "utf8");
  // Solidity writes 1_000_000_000e18, so the exponent is part of the literal and
  // not optional to read: dropping it is how a supply of a billion prints as
  // nothing at all.
  const match = source.match(new RegExp(`constant\\s+${name}\\s*=\\s*([0-9_]+)(?:e(\\d+))?\\s*;`));
  if (!match) throw new Error(`${file} no longer declares ${name} — the cards cannot state a rate it does not have`);
  return BigInt(match[1].replaceAll("_", "")) * 10n ** BigInt(match[2] ?? 0);
}

const TOLL_BPS = Number(constantFrom("TollHook.sol", "TOLL_BPS"));
const CREATOR_BPS = Number(constantFrom("TollHook.sol", "CREATOR_BPS"));
const SUPPLY = constantFrom("TollpadFactory.sol", "FIXED_SUPPLY");
const LP_FEE = Number(constantFrom("TollpadFactory.sol", "LP_FEE"));

const RATE = {
  toll: `${TOLL_BPS / 100}%`,
  creator: `${CREATOR_BPS / 100}%`,
  treasury: `${(10_000 - CREATOR_BPS) / 100}%`,
  supply: (SUPPLY / 10n ** 18n).toLocaleString("en-US"),
};

// The three figures the cards print, checked against what they are supposed to
// be. A render that would put a wrong number on an image fails instead.
if (TOLL_BPS !== 500 || CREATOR_BPS !== 8_000 || SUPPLY !== 1_000_000_000n * 10n ** 18n) {
  throw new Error(`the contracts now say toll ${TOLL_BPS}bps, creator ${CREATOR_BPS}bps, supply ${SUPPLY} — rewrite the copy before re-rendering`);
}

if (LP_FEE !== 0) {
  throw new Error(`the pool's LP fee is now ${LP_FEE}, so "one fee" is no longer true — rewrite the copy first`);
}

/**
 * The locker's whole claim is a negative: there is no way out. Assert it against
 * the source, so a card saying "locked forever" cannot outlive the contract that
 * made it true.
 */
const lockerSource = readFileSync(join(contracts, "TollLocker.sol"), "utf8");
const FORBIDDEN = [/function\s+withdraw/, /function\s+collect/, /function\s+rescue/, /liquidityDelta:\s*-/];
for (const pattern of FORBIDDEN) {
  if (pattern.test(lockerSource)) {
    throw new Error(`TollLocker.sol now matches ${pattern} — the lock card would be a lie`);
  }
}
// ---------------------------------------------------------------------------

mkdirSync(out, { recursive: true });

const CSS_URL = "https://fonts.googleapis.com/css2?family=Archivo+Black&family=IBM+Plex+Mono:wght@400;600&display=swap";
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const fontCache = join(here, ".fonts");

/**
 * Fetches the webfonts in Node and inlines them as data URIs.
 *
 * The headless browser does not inherit this environment's HTTP proxy, so a
 * <link> to Google Fonts silently fetches nothing and every render lands in a
 * fallback face. Node does have the proxy, so it does the fetching; the browser
 * then needs no network at all, which also makes a re-render reproducible.
 */
async function inlineFonts() {
  mkdirSync(fontCache, { recursive: true });

  const cssPath = join(fontCache, "faces.css");
  let css;
  if (existsSync(cssPath)) {
    css = readFileSync(cssPath, "utf8");
  } else {
    const response = await fetch(CSS_URL, { headers: { "User-Agent": UA } });
    if (!response.ok) throw new Error(`could not fetch font css: ${response.status}`);
    css = await response.text();
    writeFileSync(cssPath, css);
  }

  const urls = [...new Set([...css.matchAll(/url\((https:[^)]+)\)/g)].map((m) => m[1]))];
  const inlined = await Promise.all(
    urls.map(async (url) => {
      const file = join(fontCache, url.split("/").pop());
      let bytes;
      if (existsSync(file)) {
        bytes = readFileSync(file);
      } else {
        const response = await fetch(url, { headers: { "User-Agent": UA } });
        if (!response.ok) throw new Error(`could not fetch ${url}: ${response.status}`);
        bytes = Buffer.from(await response.arrayBuffer());
        writeFileSync(file, bytes);
      }
      const type = url.endsWith(".woff2") ? "font/woff2" : "font/ttf";
      return [url, `data:${type};base64,${bytes.toString("base64")}`];
    }),
  );

  let embedded = css;
  for (const [url, dataUri] of inlined) embedded = embedded.split(url).join(dataUri);
  return `<style>${embedded}</style>`;
}

const FONTS = await inlineFonts();

const BASE = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: "IBM Plex Mono", ui-monospace, monospace; color: ${PALETTE.paper}; }
  .asphalt {
    background-color: ${PALETTE.ground};
    background-image:
      repeating-linear-gradient(135deg, rgb(255 255 255 / .022) 0 2px, transparent 2px 9px),
      radial-gradient(rgb(255 255 255 / .05) .5px, transparent .5px);
    background-size: auto, 13px 13px;
  }
  .hazard { height: 14px; background-image: repeating-linear-gradient(135deg, ${PALETTE.signal} 0 14px, ${PALETTE.ink} 14px 28px); }
  .micro { font-size: 13px; letter-spacing: .18em; text-transform: uppercase; color: ${PALETTE.inkFaint}; }
  .chip {
    display: inline-flex; align-items: center; border: 2px solid ${PALETTE.signal};
    padding: 7px 13px; font-size: 12px; font-weight: 600; letter-spacing: .14em;
    text-transform: uppercase; color: ${PALETTE.signal};
  }
  .chip.solid { background: ${PALETTE.signal}; color: ${PALETTE.ink}; border-color: ${PALETTE.signal}; }
  .ticket { border: 3px solid ${PALETTE.signal}; background: ${PALETTE.groundDeep}; }
  .row { display: flex; justify-content: space-between; gap: 18px; padding: 10px 18px; border-bottom: 1px solid rgb(245 197 24 / .22); font-size: 15px; }
  .row:last-child { border-bottom: 0; }
  .row span { color: ${PALETTE.inkFaint}; }
  .row b { font-weight: 600; color: ${PALETTE.paper}; }
  .display { font-family: "Archivo Black", sans-serif; letter-spacing: -.01em; }
`;

function tollTicket({ width }) {
  return `
  <div class="ticket" style="width:${width}px">
    <div style="display:flex;justify-content:space-between;background:${PALETTE.signal};color:${PALETTE.ink};padding:9px 18px;font-size:12px;font-weight:600;letter-spacing:.18em">
      <span>TOLL TICKET</span><span>${BRAND.venue}</span>
    </div>
    <div class="row"><span>Every swap</span><b>${RATE.toll}</b></div>
    <div class="row"><span>To the creator</span><b>${RATE.creator} of it</b></div>
    <div class="row"><span>Pool fee</span><b>None</b></div>
    <div class="row"><span>Supply</span><b>${RATE.supply}</b></div>
    <div class="row"><span>Liquidity</span><b>Locked, permanently</b></div>
  </div>`;
}

const banner = `<!doctype html><html><head><meta charset="utf-8">${FONTS}<style>${BASE}
  body { width: 1500px; height: 500px; overflow: hidden; }
  .sheet { width: 1500px; height: 500px; display: flex; flex-direction: column; }
</style></head><body>
  <div class="sheet asphalt">
    <div class="hazard"></div>
    <div style="flex:1;display:flex;align-items:center;gap:54px;padding:0 60px">
      <div style="flex:1">
        ${lockupSvg({ unit: 7, color: PALETTE.paper })}
        <div class="micro" style="margin-top:20px;color:${PALETTE.signal}">${BRAND.tagline}</div>
        <div style="margin-top:14px;font-size:17px;line-height:1.55;color:${PALETTE.inkFaint};max-width:580px">${BRAND.line}</div>
        <div style="margin-top:22px;display:flex;gap:10px">
          <span class="chip solid">${RATE.toll} TOLL</span>
          <span class="chip">${RATE.creator} TO THE CREATOR</span>
          <span class="chip">LIQUIDITY LOCKED</span>
        </div>
      </div>
      ${tollTicket({ width: 440 })}
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;padding:13px 60px;border-top:2px solid rgb(245 197 24 / .3);background:${PALETTE.groundDeep}">
      <span class="micro" style="color:${PALETTE.signal};font-weight:600">${BRAND.ticker}</span>
      <span class="micro" style="color:${PALETTE.signal};font-weight:600">${BRAND.venue}</span>
      <span class="micro" style="color:${PALETTE.signal};font-weight:600">${BRAND.chain}</span>
    </div>
  </div>
</body></html>`;

const og = `<!doctype html><html><head><meta charset="utf-8">${FONTS}<style>${BASE}
  body { width: 1200px; height: 630px; overflow: hidden; background: ${PALETTE.ink}; }
  .frame { width: 1200px; height: 630px; padding: 42px; }
  .panel { width: 100%; height: 100%; border: 3px solid ${PALETTE.signal}; display: flex; flex-direction: column; }
</style></head><body>
  <div class="frame asphalt">
    <div class="panel">
      <div style="display:flex;justify-content:space-between;padding:11px 26px;background:${PALETTE.signal};color:${PALETTE.ink};font-size:12px;font-weight:600;letter-spacing:.18em">
        <span>${BRAND.venue} · ${BRAND.chain}</span>
        <span>${BRAND.ticker}</span>
      </div>
      <div style="flex:1;min-height:0;padding:30px 46px;display:flex;flex-direction:column;justify-content:center">
        ${lockupSvg({ unit: 5, color: PALETTE.paper })}
        <h1 class="display" style="font-size:58px;line-height:1.08;margin-top:24px;max-width:15ch;color:${PALETTE.paper}">Every swap pays a toll</h1>
        <p style="margin-top:18px;font-size:19px;line-height:1.55;color:${PALETTE.inkFaint};max-width:60ch">
          ${RATE.toll} of everything paid into the pool, in either direction. ${RATE.creator} of it goes to whoever launched the token, and the rate is in the pool's key — so it is the same on the last day as on the first.
        </p>
        <div style="margin-top:24px;display:flex;gap:10px">
          <span class="chip solid">SUPPLY ALL IN</span>
          <span class="chip">POOL LOCKED</span>
          <span class="chip">NO TEAM BAG</span>
        </div>
      </div>
    </div>
  </div>
</body></html>`;

const tollCard = `<!doctype html><html><head><meta charset="utf-8">${FONTS}<style>${BASE}
  body { width: 1600px; height: 900px; overflow: hidden; background: ${PALETTE.ink}; }
  .frame { width: 1600px; height: 900px; padding: 50px; }
  .panel { width: 100%; height: 100%; border: 4px solid ${PALETTE.signal}; display: flex; flex-direction: column; }
  .split { display: flex; justify-content: space-between; align-items: baseline; gap: 24px; padding: 17px 0; border-bottom: 1px solid rgb(245 197 24 / .22); }
  .split:last-child { border-bottom: 0; }
  .split span { font-size: 20px; letter-spacing: .1em; text-transform: uppercase; color: ${PALETTE.inkFaint}; }
  .split b { font-size: 29px; font-weight: 600; color: ${PALETTE.paper}; }
</style></head><body>
  <div class="frame asphalt">
    <div class="panel">
      <div style="display:flex;justify-content:space-between;background:${PALETTE.signal};color:${PALETTE.ink};padding:15px 34px;font-size:17px;font-weight:600;letter-spacing:.18em">
        <span>THE WHOLE FEE SCHEDULE</span>
        <span>${BRAND.chain}</span>
      </div>

      <div style="flex:1;min-height:0;display:flex;align-items:center;gap:56px;padding:36px 48px">
        <div style="flex:0 0 auto;display:flex;flex-direction:column;align-items:center;gap:22px">
          ${gateSvg({ size: 240 })}
          <div class="display" style="font-size:78px;line-height:1;color:${PALETTE.signal}">${RATE.toll}</div>
          <div class="micro" style="font-size:16px">OF EVERY SWAP</div>
        </div>
        <div style="flex:1;min-width:0">
          <div class="split"><span>To the creator</span><b>${RATE.creator} of the toll</b></div>
          <div class="split"><span>To the treasury</span><b>${RATE.treasury} of the toll</b></div>
          <div class="split"><span>To liquidity providers</span><b>Nothing — there is no pool fee</b></div>
          <div class="split"><span>To launch</span><b>Nothing but gas</b></div>
          <div class="split"><span>Held back at launch</span><b>None of the supply</b></div>
        </div>
      </div>

      <div style="padding:26px 48px;border-top:3px solid ${PALETTE.signal};background:${PALETTE.groundDeep}">
        <div style="font-size:21px;line-height:1.55;color:${PALETTE.paper};max-width:88ch">
          The rate lives in the hook, and the hook is part of the pool's key — it cannot be swapped, raised or switched off later. The liquidity is in a contract with no function that takes any out.
        </div>
        <div style="margin-top:16px;display:flex;justify-content:space-between;align-items:center">
          <span class="micro" style="color:${PALETTE.signal};font-weight:600">${BRAND.ticker}</span>
          <span class="micro" style="color:${PALETTE.signal};font-weight:600">${BRAND.promise}</span>
        </div>
      </div>
    </div>
  </div>
</body></html>`;

// --- vector marks -----------------------------------------------------------
writeFileSync(join(out, "logo-mark.svg"), gateSvg({ size: 512 }));
writeFileSync(join(out, "logo-wordmark.svg"), wordmarkSvg({ unit: 12 }));
writeFileSync(join(out, "logo-lockup.svg"), lockupSvg({ unit: 12 }));
writeFileSync(join(out, "logo-lockup-dark.svg"), lockupSvg({ unit: 12, color: PALETTE.paper }));

for (const size of [256, 512, 1024]) {
  await sharp(Buffer.from(gateSvg({ size }))).png().toFile(join(out, `logo-mark-${size}.png`));
}

// Avatar: full-bleed signal yellow, because X crops a profile picture to a
// circle and a centred mark on a paper square loses its corners to the crop.
// The padding is wider than the logo's: the crop is a circle, and the end of the
// arm is the part of this mark furthest from the middle.
const AVATAR_PAD = 3;
const avatarSpan = 12 + AVATAR_PAD * 2;
const avatar = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${avatarSpan} ${avatarSpan}" width="1000" height="1000" shape-rendering="crispEdges">
  <rect width="${avatarSpan}" height="${avatarSpan}" fill="${PALETTE.signal}"/>
  ${gateBodySvg({ pad: AVATAR_PAD })}
</svg>`;
await sharp(Buffer.from(avatar)).png().toFile(join(out, "avatar-1000.png"));

// --- typography-heavy pieces ------------------------------------------------
// Playwright insists on the exact Chromium build its version pins, and an
// environment that ships a different one has a working browser sitting right
// there. Use it rather than downloading a second copy, but only when the pinned
// build is genuinely absent.
const pinned = chromium.executablePath();
const fallback = process.env.PLAYWRIGHT_BROWSERS_PATH ? join(process.env.PLAYWRIGHT_BROWSERS_PATH, "chromium") : null;
const executablePath = existsSync(pinned) || !fallback || !existsSync(fallback) ? undefined : fallback;

if (executablePath) console.log(`using the environment's chromium at ${executablePath}`);

const browser = await chromium.launch(executablePath ? { executablePath } : {});
const tmp = join(out, ".render");
mkdirSync(tmp, { recursive: true });

for (const { name, html, size, faces } of [
  { name: "banner-1500x500", html: banner, size: { width: 1500, height: 500 }, faces: ["IBM Plex Mono"] },
  { name: "og-1200x630", html: og, size: { width: 1200, height: 630 }, faces: ["Archivo Black", "IBM Plex Mono"] },
  { name: "toll-1600x900", html: tollCard, size: { width: 1600, height: 900 }, faces: ["Archivo Black", "IBM Plex Mono"] },
]) {
  // Written to disk and opened over file:// — setContent leaves the base URL at
  // about:blank, where a relative or remote font is never fetched at all.
  const page = join(tmp, `${name}.html`);
  writeFileSync(page, html);

  const tab = await browser.newPage({ viewport: size, deviceScaleFactor: 1 });
  await tab.goto(pathToFileURL(page).href, { waitUntil: "networkidle" });

  // document.fonts.check() answers true for a family the page never loaded, so
  // it proves nothing. Ask for each face by name first — a face nothing on the
  // page uses is never fetched otherwise — then measure: if it is missing, the
  // text lands on the fallback and matches it exactly.
  const missing = await tab.evaluate(async (families) => {
    await Promise.all(families.map((family) => document.fonts.load(`400 64px '${family}'`)));
    await document.fonts.ready;

    const measure = (stack) => {
      const el = document.createElement("span");
      el.textContent = "Every swap pays a toll";
      el.style.cssText = `position:absolute;visibility:hidden;white-space:nowrap;font-size:64px;font-family:${stack}`;
      document.body.appendChild(el);
      const width = el.getBoundingClientRect().width;
      el.remove();
      return width;
    };

    const fallbackWidth = measure("serif");
    return families.filter((family) => measure(`'${family}',serif`) === fallbackWidth);
  }, faces);

  if (missing.length > 0) throw new Error(`${name}: webfont did not apply — ${missing.join(", ")} fell back`);

  const overflow = await tab.evaluate(() => ({
    x: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    y: document.documentElement.scrollHeight - document.documentElement.clientHeight,
  }));
  if (overflow.x > 0 || overflow.y > 0) {
    throw new Error(`${name}: content overflows the canvas by ${overflow.x}x${overflow.y}px`);
  }

  await tab.screenshot({ path: join(out, `${name}.png`) });
  await tab.close();
}
await browser.close();
rmSync(tmp, { recursive: true, force: true });

console.log(`brand kit written to out/ — toll ${RATE.toll}, creator ${RATE.creator}, checked against the contracts`);
