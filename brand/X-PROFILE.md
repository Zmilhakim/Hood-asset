# Hoodpad — X profile kit

Everything needed to set up the account, in the fields X asks for. Character
counts were measured, not estimated; X counts Unicode code points.

## Display name — max 50

**Pick this** (15 characters):

```
Hoodpad | $HPAD
```

Alternatives: `Hoodpad` (7) · `Hoodpad — launchpad on Robinhood Chain` (38)

## Handle — max 15, letters/digits/underscore only

Try in this order. **Availability was never checked** — there is no X access
from the build environment, so verify each one at signup.

`@hoodpad` (7) → `@hoodpad_` (8) → `@hoodpadfun` (10) → `@hoodpad_hq` (10) →
`@gethoodpad` (10) → `@hoodpadxyz` (10)

## Bio — max 160

**Pick this** (143 characters):

```
Plain tools for launching on Robinhood Chain. Supply fixed. Pool locked forever. Team holds nothing. Every figure read straight from the chain.
```

Alternatives:

| Count | Text |
| --- | --- |
| 150 | `Launchpad on Robinhood Chain. Post a notice, open a pool, keep the fees. Supply fixed at 1B, liquidity locked forever, nothing held back for the team.` |
| 142 | `Launchpad on Robinhood Chain. One transaction: mint the supply, open a single-sided pool, lock it for good. Nothing on the board is estimated.` |

## Website

```
https://hoodpad.site
```

The Vercel URL `hoodpad-psi.vercel.app` still works and always will, but the
custom domain is the one to put on the profile.

## Images

| Field | File | Size |
| --- | --- | --- |
| Profile picture | `out/avatar-1000.png` | 1000 × 1000 |
| Header | `out/banner-1500x500.png` | 1500 × 500 |

The avatar is full-bleed flame on purpose: X crops profile pictures to a
circle, and a centred mark on a transparent or paper square loses its corners.

## What the banner deliberately does not say

No domain and no handle. X already shows both in its own profile chrome, and an
image that repeats them is one more thing that can go stale or turn out to be
wrong. The footer carries the ticker, the chain and the guarantee instead —
none of which can expire.

An earlier version printed `HOODPAD.FUN` and `@HOODPAD`. Neither was
registered at the time. Do not put a domain on an image before it is yours.

## Ticker

`$HPAD`, not `$HOOD`. HOOD is Robinhood's NASDAQ ticker; a token called `$HOOD`
launching on Robinhood Chain reads as an official Robinhood asset to anyone
skimming.
