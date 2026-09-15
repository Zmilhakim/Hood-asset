# Hoodpad — brand kit

Everything here is generated. Edit the source, re-run, commit the output.

```bash
npm install          # sharp + playwright
npm run render
```

Playwright needs its Chromium: `npx playwright install chromium`, unless the
environment already provides one (this repo's web sessions do).

Outputs land in `out/`, and the files the site serves are copied into
`../hoodpad/public/brand/`.

| File                    | Use                                      |
| ----------------------- | ---------------------------------------- |
| `logo-mark.svg`         | The coin on its own                      |
| `logo-wordmark.svg`     | HOODPAD, no mark                         |
| `logo-lockup.svg`       | Mark + wordmark, the header arrangement  |
| `logo-mark-{256,512,1024}.png` | Raster fallbacks                  |
| `avatar-1000.png`       | Profile picture (square, crops to circle safely) |
| `banner-1500x500.png`   | X / Twitter header                       |
| `og-1200x630.png`       | Link previews                            |

## The X account

Display name, handle, bio and website copy live in
[`X-PROFILE.md`](X-PROFILE.md), with the character counts already measured
against X's limits.

## The ticker

**`$HPAD`**.

Not `$HOOD`: that is Robinhood's actual NASDAQ ticker, and a token called
`$HOOD` launching on Robinhood Chain would read as an official Robinhood asset
to anyone skimming. `$HPAD` is unambiguous.

## The marks are pixels, not type

`lib/marks.mjs` draws the cowl and every letter of HOODPAD as rectangles. A
logo set in a webfont breaks wherever that font is not loaded — an email
signature, a print sheet, someone else's deck. These render anywhere an SVG
renders, with no font to ship.

The same grid is duplicated in `hoodpad/src/components/ui/Mark.tsx` so the
header can tint it with CSS variables. If you change the cowl, change both.

## The domain on the assets

`BRAND` at the top of `render.mjs` holds the site printed on the OG card, now
`HOODPAD.SITE`. That card is the only asset where the domain is baked in as
pixels — the page's own metadata follows Vercel's
`VERCEL_PROJECT_PRODUCTION_URL`, which becomes the custom domain by itself once
it is attached. Re-run this script whenever the domain changes.

The X banner deliberately prints no domain and no handle. The profile shows
both already, and repeating them on the image only creates something that can
go stale. It carries the ticker, the chain and the guarantee instead.

## Why the render script fetches the fonts itself

The headless browser does not inherit this environment's HTTP proxy, so a
`<link>` to Google Fonts fetches nothing and the render silently falls back to
a system face — which is how the first banner went out in the wrong typeface.
Node fetches and caches the files into `.fonts/`, inlines them as data URIs,
and the browser needs no network at all. `render.mjs` then measures the
rendered text against the fallback and refuses to write a file if the display
face did not apply.
