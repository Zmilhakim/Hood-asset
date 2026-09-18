# Toollpad — brand kit

Everything here is generated. Edit the source, re-run, commit the output.

```bash
npm install          # sharp + playwright
npm run render
```

Playwright needs its Chromium: `npx playwright install chromium`, unless the
environment already provides one (this repo's web sessions do, and `render.mjs`
finds it).

| File | Use |
| --- | --- |
| `logo-mark.svg` | The gate on its own |
| `logo-wordmark.svg` | TOOLLPAD, no mark |
| `logo-lockup.svg` | Mark + wordmark, for a light background |
| `logo-lockup-dark.svg` | The same, for a dark one |
| `logo-mark-{256,512,1024}.png` | Raster fallbacks |
| `avatar-1000.png` | Profile picture (crops to a circle safely) |
| `banner-1500x500.png` | X / Twitter header |
| `og-1200x630.png` | Link previews |
| `toll-1600x900.png` | The fee schedule, as one card |

## The X account

Display name, handle, bio and what not to print on an image live in
[`X-PROFILE.md`](X-PROFILE.md), with the character counts already measured
against X's limits. Post copy is in [`X-POSTS.md`](X-POSTS.md).

## The ticker

**`$TOLL`**.

Not `$HOOD` — that is Robinhood's NASDAQ ticker, and a token called `$HOOD`
launching on Robinhood Chain reads as an official Robinhood asset to anyone
skimming. Not `$PAD` either, which is every launchpad on every chain.

## The mark is a barrier

A boom gate is the one object that means *you are paying to go through this*
without a word written on it, and at sixteen pixels it is still a barrier —
which is the only test a profile picture has to pass.

`lib/marks.mjs` draws it, and every letter of TOOLLPAD, as rectangles. A logo set
in a webfont breaks wherever that font is not loaded — an email signature, a
print sheet, someone else's deck. These render anywhere an SVG renders, with no
font to ship.

The stripes on the arm are generated rather than hand-drawn, because a diagonal
is the thing a typed-out pixel grid always gets slightly wrong. The arm's top and
bottom rows are left solid: they are the rails that hold it together, and without
them the stripes cut the arm into loose blocks that read as anything but a
barrier.

## The numbers on the cards are checked against the contracts

`render.mjs` reads `TOLL_BPS`, `CREATOR_BPS`, `LP_FEE` and `FIXED_SUPPLY` out of
`../contracts/src/` and throws if they are not what the copy says. It also greps
`TollLocker.sol` for a `withdraw`, a `collect`, a `rescue` or a negative
liquidity delta, and throws if it finds one.

A card printing *5%* and *locked permanently* is a claim about deployed code.
Change the code and the render fails until the copy is rewritten — which is the
order those two things should happen in.

## No domain on the art

Nothing here prints a domain or a handle, on purpose. See
[`X-PROFILE.md`](X-PROFILE.md#what-the-art-deliberately-does-not-say) for why
that is a rule in this repository rather than a preference.
