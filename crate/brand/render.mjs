// Renders the $CRATE social card.
//
//   npm install && npm run render
//
// The card is typography on a crate, so it is laid out in HTML and
// screenshotted rather than drawn. Everything here is reproducible: edit the
// source, re-run, commit the output.
//
// Why this exists at all: a link posted to X is scraped once, when the post is
// made. A card missing at that moment is missing for the life of the post, and
// cannot be added afterwards.
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "site", "public");

// --- the things you would change -------------------------------------------
export const BRAND = {
  ticker: "$CRATE",
  // Baked into the card as pixels, so only ever a domain that is registered.
  site: "CRATECOIN.FUN",
  chain: "ROBINHOOD CHAIN 4663",
  headline: ["One crate", "on the dock."],
  promise: "PACKED ONCE · SEALED ONCE",
  line: "The whole supply opened one pool. The liquidity cannot come back out.",
};
// ---------------------------------------------------------------------------

const PALETTE = {
  pine: "#D6B078",
  gap: "#2B1D10",
  ink: "#231B13",
  inkSoft: "#4A3B2A",
  red: "#B02A1F",
  manila: "#EFE3BF",
  manilaEdge: "#D8C58F",
  rule: "#6E5C45",
};

const FONTS = "https://fonts.googleapis.com/css2?family=Big+Shoulders+Stencil:opsz,wght@10..72,700;10..72,900&family=Courier+Prime:wght@400;700&display=swap";

/**
 * Fetches the webfonts in Node and inlines them as data URIs.
 *
 * Letting the browser fetch them looks simpler and quietly is not: a headless
 * browser behind a proxy, or with no network at all, falls back to a serif and
 * renders a card that is wrong in the one way nobody checks. Node has already
 * proved it can reach the network by the time this runs, so the bytes go into
 * the page and the browser needs nothing.
 */
async function inlineFonts() {
  // Google serves woff2 only to a user agent it believes supports it.
  const ua =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

  const css = await fetch(FONTS, { headers: { "user-agent": ua } }).then((r) => {
    if (!r.ok) throw new Error(`google fonts answered ${r.status}`);
    return r.text();
  });

  const urls = [...new Set([...css.matchAll(/url\((https:[^)]+)\)/g)].map((m) => m[1]))];
  const bytes = await Promise.all(
    urls.map(async (url) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${url} answered ${response.status}`);
      return [url, Buffer.from(await response.arrayBuffer()).toString("base64")];
    }),
  );

  return bytes.reduce(
    (out, [url, base64]) => out.replaceAll(url, `data:font/woff2;base64,${base64}`),
    css,
  );
}

const card = (fontCss) => `<!doctype html>
<html><head><meta charset="utf-8">
<style>${fontCss}</style>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{
    width:1200px;height:630px;overflow:hidden;position:relative;
    font-family:"Courier Prime",monospace;color:${PALETTE.ink};
    background-color:${PALETTE.pine};
    background-image:
      repeating-linear-gradient(to bottom, transparent 0 116px, rgba(43,29,16,.88) 116px 122px),
      repeating-linear-gradient(to bottom, rgba(58,36,16,.24) 0, rgba(58,36,16,0) 18px, rgba(58,36,16,0) 96px, rgba(58,36,16,.28) 116px, rgba(58,36,16,0) 122px),
      url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1000' height='244'%3E%3Cfilter id='f'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.002 0.061475' numOctaves='4' seed='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0.70 0 0 0 0 0.52 0 0 0 0 0.31 0 0 0 2.2 -0.9'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23f)'/%3E%3C/svg%3E");
  }
  .paint{
    -webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400'%3E%3Cfilter id='m'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.06' numOctaves='3' seed='9' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -0.55 1.25'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23m)'/%3E%3C/svg%3E");
  }
  .pad{position:absolute;inset:0;padding:56px 60px;display:flex;flex-direction:column;justify-content:space-between}
  .top{display:flex;align-items:center;gap:18px}
  .top b{font-family:"Big Shoulders Stencil";font-weight:900;font-size:58px;letter-spacing:.06em;line-height:1}
  h1{font-family:"Big Shoulders Stencil";font-weight:900;font-size:118px;line-height:.86;letter-spacing:.02em;text-transform:uppercase;max-width:14ch}
  .line{
    margin-top:22px;max-width:30em;font-weight:700;font-size:22px;line-height:1.4;
    background:${PALETTE.manila};border:4px solid ${PALETTE.ink};border-left:12px solid ${PALETTE.red};padding:14px 18px;
  }
  .foot{display:flex;align-items:center;gap:20px;font-weight:700;font-size:21px;letter-spacing:.06em}
  .foot .site{font-family:"Big Shoulders Stencil";font-weight:900;font-size:34px;letter-spacing:.08em}
  .foot .sep{width:10px;height:10px;background:${PALETTE.red};border-radius:50%}
  /* the tag, hung off a steel strap down the right */
  .strap{position:absolute;top:0;bottom:0;right:190px;width:46px;
    background:linear-gradient(90deg,#5E6568,#A7AEB0 35%,#858C8F 55%,#4F5558);border-left:2px solid #3E4345;border-right:2px solid #3E4345}
  .tagwrap{position:absolute;right:56px;top:96px;width:330px;filter:drop-shadow(10px 14px 12px rgba(42,26,12,.45));transform:rotate(-3deg)}
  .tag{background:${PALETTE.manila};padding:54px 26px 74px;clip-path:polygon(15% 0,85% 0,100% 11%,100% 100%,0 100%,0 11%);position:relative}
  .hole{position:absolute;top:16px;left:50%;width:26px;height:26px;margin-left:-13px;border-radius:50%;background:#D2BF8C;display:grid;place-items:center}
  .hole::after{content:"";width:12px;height:12px;border-radius:50%;background:${PALETTE.gap}}
  .tag h2{font-weight:700;font-size:15px;letter-spacing:.14em;text-transform:uppercase;padding-bottom:8px;border-bottom:2px solid ${PALETTE.ink};margin-bottom:10px}
  .tag ul{list-style:none;font-size:17px}
  .tag li{display:flex;gap:8px;padding:6px 0;align-items:baseline}
  .tag li .k{flex:none}
  .tag li .lead{flex:1;border-bottom:2px dotted ${PALETTE.rule};transform:translateY(-4px)}
  .tag li .v{font-weight:700}
  .stamp{position:absolute;right:18px;bottom:16px;transform:rotate(-9deg);
    font-family:"Big Shoulders Stencil";font-weight:900;font-size:34px;letter-spacing:.1em;text-transform:uppercase;
    color:${PALETTE.red};border:5px solid ${PALETTE.red};border-radius:5px;padding:0 10px;line-height:1.25;opacity:.9}
</style></head>
<body>
  <div class="strap"></div>
  <div class="tagwrap"><div class="tag">
    <span class="hole"></span>
    <h2>Manifest</h2>
    <ul>
      <li><span class="k">Supply</span><span class="lead"></span><span class="v">1,000,000,000</span></li>
      <li><span class="k">Pool</span><span class="lead"></span><span class="v">Sealed</span></li>
      <li><span class="k">Team</span><span class="lead"></span><span class="v">Nothing</span></li>
      <li><span class="k">Opened</span><span class="lead"></span><span class="v">Never</span></li>
    </ul>
    <span class="stamp">Sealed</span>
  </div></div>

  <div class="pad">
    <div class="top">
      <svg viewBox="0 0 64 64" width="58" height="58"><path d="M8 8h48v8H8zM8 48h48v8H8zM8 18h8v28H8zM48 18h8v28h-8zM18 43L43 18h3v3L21 46h-3z" fill="${PALETTE.ink}"/><circle cx="32" cy="32" r="9" fill="${PALETTE.red}"/><circle cx="32" cy="32" r="5.5" fill="none" stroke="#C94A3B" stroke-width="1.5"/></svg>
      <b class="paint">${BRAND.ticker}</b>
    </div>

    <div>
      <h1 class="paint">${BRAND.headline.join("<br>")}</h1>
      <p class="line">${BRAND.line}</p>
    </div>

    <div class="foot">
      <span class="site paint">${BRAND.site}</span>
      <span class="sep"></span>
      <span>${BRAND.chain}</span>
      <span class="sep"></span>
      <span>${BRAND.promise}</span>
    </div>
  </div>
</body></html>`;

mkdirSync(out, { recursive: true });

const fontCss = await inlineFonts();

// Use whatever Chromium is already on the machine when Playwright's own copy
// is not the build this version wants — CI images and sandboxes often ship one
// at a fixed path, and downloading a second is a waste.
const browser = await chromium
  .launch()
  .catch(() => chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" }));
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.setContent(card(fontCss), { waitUntil: "networkidle" });
// Webfonts settle a beat after the network goes quiet, and a card rendered in
// the fallback face is the whole point missed.
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(400);
// A fallback serif would render a card that is wrong in the one way nobody
// thinks to check, so check it.
const usedStencil = await page.evaluate(() => document.fonts.check('900 118px "Big Shoulders Stencil"'));
if (!usedStencil) throw new Error("the stencil font did not load — the card would render in a fallback face");

await page.screenshot({ path: join(out, "og.png") });
await browser.close();

console.log(`written ${join(out, "og.png")} — 1200x630`);
