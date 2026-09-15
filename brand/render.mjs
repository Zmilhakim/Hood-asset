// Renders the Hoodpad brand kit.
//
//   node render.mjs
//
// Vector marks go straight through sharp; the banner and OG card are laid out
// in HTML and screenshotted, because they are typography, not geometry.
// Everything here is reproducible — edit the source, re-run, commit the output.
import { mkdirSync, writeFileSync, copyFileSync, rmSync, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

import { cowlSvg, lockupSvg, wordmarkSvg, PALETTE } from "./lib/marks.mjs";

const require = createRequire(import.meta.url);
const sharp = require("sharp");
const { chromium } = require("playwright");

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "out");
const publicDir = join(here, "..", "hoodpad", "public", "brand");

// --- the things you would change -------------------------------------------
export const BRAND = {
  ticker: "$HPAD",
  // The live site, baked into the OG card as pixels — the one place that does
  // not follow VERCEL_PROJECT_PRODUCTION_URL on its own. Only ever put a
  // domain here that is actually registered.
  site: "HOODPAD.SITE",
  chain: "ROBINHOOD CHAIN 4663",
  promise: "SUPPLY FIXED · POOL LOCKED",
  tagline: "PLAIN TOOLS FOR LAUNCHING ON ROBINHOOD CHAIN",
  line: "Post a notice, open a pool, keep the fees. Every figure read straight from the chain.",
};
// ---------------------------------------------------------------------------

mkdirSync(out, { recursive: true });
mkdirSync(publicDir, { recursive: true });

const CSS_URL = "https://fonts.googleapis.com/css2?family=Rye&family=IBM+Plex+Mono:wght@400;600&display=swap";
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
  body { font-family: "IBM Plex Mono", ui-monospace, monospace; color: ${PALETTE.ink}; }
  .paper {
    background-color: ${PALETTE.paper};
    background-image:
      radial-gradient(rgb(33 23 14 / .05) .5px, transparent .5px),
      radial-gradient(rgb(33 23 14 / .035) .5px, transparent .5px);
    background-size: 11px 11px, 17px 17px;
    background-position: 0 0, 5px 8px;
  }
  .rail { height: 10px; background-image: repeating-linear-gradient(90deg, ${PALETTE.ink} 0 4px, transparent 4px 12px); }
  .micro { font-size: 13px; letter-spacing: .16em; text-transform: uppercase; color: ${PALETTE.inkSoft}; }
  .chip {
    display: inline-flex; align-items: center; border: 2px solid ${PALETTE.ink};
    padding: 7px 12px; font-size: 12px; font-weight: 600; letter-spacing: .14em;
    text-transform: uppercase; box-shadow: 3px 3px 0 ${PALETTE.groundDeep};
  }
  .card { border: 3px solid ${PALETTE.ink}; background: ${PALETTE.paperDim}; box-shadow: 8px 8px 0 ${PALETTE.groundDeep}; }
  .row { display: flex; justify-content: space-between; gap: 18px; padding: 9px 16px; border-bottom: 2px solid rgb(33 23 14 / .14); font-size: 15px; }
  .row:last-child { border-bottom: 0; }
  .row b { font-weight: 600; }
`;

function noticeCard({ width }) {
  return `
  <div class="card" style="width:${width}px">
    <div style="display:flex;justify-content:space-between;background:${PALETTE.ink};color:${PALETTE.paper};padding:8px 16px;font-size:12px;letter-spacing:.16em">
      <span>NOTICE NO. 0001</span><span>ROBINHOOD CHAIN</span>
    </div>
    <div class="row"><span style="color:${PALETTE.inkSoft}">Supply</span><b>1,000,000,000</b></div>
    <div class="row"><span style="color:${PALETTE.inkSoft}">Pool</span><b>Locked, single sided</b></div>
    <div class="row"><span style="color:${PALETTE.inkSoft}">Team holds</span><b>Nothing</b></div>
    <div class="row"><span style="color:${PALETTE.inkSoft}">Figures</span><b>Read from chain</b></div>
    <div style="padding:14px 16px">
      <span class="chip" style="background:${PALETTE.flame}">POST A NOTICE</span>
    </div>
  </div>`;
}

const banner = `<!doctype html><html><head><meta charset="utf-8">${FONTS}<style>${BASE}
  body { width: 1500px; height: 500px; overflow: hidden; }
  .sheet { width: 1500px; height: 500px; display: flex; flex-direction: column; }
</style></head><body>
  <div class="sheet paper">
    <div class="rail"></div>
    <div style="flex:1;display:flex;align-items:center;gap:56px;padding:0 60px">
      <div style="flex:1">
        ${lockupSvg({ unit: 7 })}
        <div class="micro" style="margin-top:18px">${BRAND.tagline}</div>
        <div style="margin-top:14px;font-size:17px;line-height:1.5;color:${PALETTE.inkSoft};max-width:560px">${BRAND.line}</div>
        <div style="margin-top:22px;display:flex;gap:10px">
          <span class="chip" style="background:${PALETTE.flame}">POST A NOTICE</span>
          <span class="chip" style="background:${PALETTE.paper}">READ THE BOARD</span>
          <span class="chip" style="background:${PALETTE.paper}">KEEP THE FEES</span>
        </div>
      </div>
      ${noticeCard({ width: 470 })}
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 60px;border-top:3px solid ${PALETTE.ink};background:${PALETTE.paperDeep}">
      <span class="micro" style="color:${PALETTE.ink};font-weight:600">${BRAND.ticker}</span>
      <span class="micro" style="color:${PALETTE.ink};font-weight:600">${BRAND.chain}</span>
      <span class="micro" style="color:${PALETTE.ink};font-weight:600">${BRAND.promise}</span>
    </div>
  </div>
</body></html>`;

const og = `<!doctype html><html><head><meta charset="utf-8">${FONTS}<style>${BASE}
  body { width: 1200px; height: 630px; overflow: hidden; background: ${PALETTE.ground}; }
  .stripes {
    width: 1200px; height: 630px; padding: 46px;
    background-image: repeating-linear-gradient(135deg, rgb(255 255 255 / .03) 0 1px, transparent 1px 8px);
  }
  .panel { width: 100%; height: 100%; border: 3px solid ${PALETTE.ink}; box-shadow: 10px 10px 0 ${PALETTE.groundDeep}; display: flex; flex-direction: column; }
</style></head><body>
  <div class="stripes">
    <div class="panel paper">
      <div style="display:flex;justify-content:space-between;padding:10px 24px;border-bottom:3px solid ${PALETTE.ink};background:${PALETTE.paperDim}">
        <span class="micro">THE BOARD · ROBINHOOD CHAIN 4663</span>
        <span class="micro">${BRAND.ticker}</span>
      </div>
      <div style="flex:1;min-height:0;padding:28px 44px;display:flex;flex-direction:column;justify-content:center">
        ${lockupSvg({ unit: 5 })}
        <h1 style="font-family:'Rye',serif;font-size:50px;line-height:1.12;margin-top:22px;max-width:16ch">Every launch gets nailed to the board</h1>
        <p style="margin-top:16px;font-size:18px;line-height:1.5;color:${PALETTE.inkSoft};max-width:64ch">
          One transaction mints the supply, opens a single-sided pool with all of it, and locks the position for good.
        </p>
        <div style="margin-top:22px;display:flex;gap:10px">
          <span class="chip" style="background:${PALETTE.flame}">SUPPLY FIXED</span>
          <span class="chip" style="background:${PALETTE.paper}">POOL LOCKED</span>
          <span class="chip" style="background:${PALETTE.paper}">NO TEAM BAG</span>
        </div>
      </div>
      <div style="padding:12px 24px;border-top:3px solid ${PALETTE.ink};background:${PALETTE.paperDeep}">
        <span class="micro" style="color:${PALETTE.ink};font-weight:600">${BRAND.site}</span>
      </div>
    </div>
  </div>
</body></html>`;

// --- vector marks -----------------------------------------------------------
writeFileSync(join(out, "logo-mark.svg"), cowlSvg({ size: 512 }));
writeFileSync(join(out, "logo-wordmark.svg"), wordmarkSvg({ unit: 12 }));
writeFileSync(join(out, "logo-lockup.svg"), lockupSvg({ unit: 12 }));

for (const size of [256, 512, 1024]) {
  await sharp(Buffer.from(cowlSvg({ size }))).png().toFile(join(out, `logo-mark-${size}.png`));
}

// Avatar: full-bleed flame so a circular crop lands on the disc, not the corners.
const avatar = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="1000" height="1000" shape-rendering="crispEdges">
  <rect width="16" height="16" fill="${PALETTE.flame}"/>
  ${cowlSvg({ pad: 2 }).split("\n").slice(2, -1).join("\n")}
</svg>`;
await sharp(Buffer.from(avatar)).png().toFile(join(out, "avatar-1000.png"));

// --- typography-heavy pieces ------------------------------------------------
const browser = await chromium.launch();
const tmp = join(out, ".render");
mkdirSync(tmp, { recursive: true });

for (const { name, html, size, faces } of [
  { name: "banner-1500x500", html: banner, size: { width: 1500, height: 500 }, faces: ["IBM Plex Mono"] },
  { name: "og-1200x630", html: og, size: { width: 1200, height: 630 }, faces: ["Rye", "IBM Plex Mono"] },
]) {
  // Written to disk and opened over file:// — setContent leaves the base URL at
  // about:blank, where the Google Fonts <link> is never fetched at all and the
  // whole thing silently renders in a fallback face.
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
      el.textContent = "Every launch gets nailed";
      el.style.cssText = `position:absolute;visibility:hidden;white-space:nowrap;font-size:64px;font-family:${stack}`;
      document.body.appendChild(el);
      const width = el.getBoundingClientRect().width;
      el.remove();
      return width;
    };

    const fallback = measure("serif");
    return families.filter((family) => measure(`'${family}',serif`) === fallback);
  }, faces);

  if (missing.length > 0) {
    throw new Error(`${name}: webfont did not apply — ${missing.join(", ")} fell back`);
  }

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

// The app serves these, so they live in public/ too.
for (const file of ["logo-mark.svg", "logo-lockup.svg", "og-1200x630.png", "banner-1500x500.png"]) {
  copyFileSync(join(out, file), join(publicDir, file));
}

console.log("brand kit written to out/ and hoodpad/public/brand/");
