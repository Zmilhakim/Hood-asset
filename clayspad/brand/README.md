# Clayspad — brand kit

The images are generated in Google Flow from [`PROMPTS.md`](PROMPTS.md). What is
in this directory is everything around them: the copy, the palette, and one
reference mark that is drawn from the contracts rather than by hand.

| File | What it is |
| --- | --- |
| [`PROMPTS.md`](PROMPTS.md) | Six prompts with negative prompts, the palette, and the notes that apply to all of them |
| [`X-PROFILE.md`](X-PROFILE.md) | Display name, handle, bio in both languages, character counts measured against X's limits |
| [`BANNER-COPY.md`](BANNER-COPY.md) | The text that goes on the banner, in both languages, and how to set it |
| [`X-POSTS.md`](X-POSTS.md) | Post copy |
| `render.mjs` | Draws the reference mark into `out/` |

```bash
npm install   # sharp, and nothing else
npm run render
```

## The look

Cinematic 3D: smooth sculpted clay, emissive neon green, near-black background.
Soft key light from above left, cool rim light from behind, shallow depth of
field.

Two rules hold the set together. **The material is clay, not metal** — dense and
slightly glossy, with soft rounded bevels rather than machined chamfers, so it
reads as something shaped by hand and then fired, which is the whole reason the
project is called what it is. And **the green is emissive, never painted** — it
comes out of the object, and a render that comes back with green sprayed on the
clay instead of glowing out of it does not match anything else in the set.

The palette lives in [`PROMPTS.md`](PROMPTS.md#the-palette) as hex values, and in
`lib/marks.mjs` as `PALETTE`. Those two agree; if one changes, change both.

## Two logo directions

`PROMPTS.md` carries both, because they say different things:

1. **The C monogram with a launch spire through it** — a letterform, reads as a
   brand immediately, says nothing about the mechanism.
2. **The kiln vessel with a level line** — says exactly what the product does.
   The line sits at three quarters because that is the share fired into the pool
   and never recovered, and the empty quarter above it is the share that stays
   liquid.

Generate both once and pick. They are not meant to coexist.

## The reference mark is a picture of the split

`render.mjs` reads `POOL_BPS` out of `../contracts/src/Clayspad.sol` and fills
the vessel to that fraction of its height. **The level is not a design
decision.** Change the split in the contract and the mark fills to a different
line the next time it is drawn — nobody has to remember, and the logo cannot
quietly disagree with the code.

The same script greps `Kiln.sol` for a `withdraw`, a `collect`, a `rescue` or a
negative liquidity delta, and refuses to draw anything if it finds one. A mark
that means *fired for good* is a claim about a contract, and it is worth exactly
as much as the check behind it.

`out/` is deliberately crude: a twelve-by-twelve pixel grid. It is there to be
exact, not to be pretty — the silhouette and the level are correct to the
contract, so a generated image can be held up against it, or fed to Google Flow
as a reference image alongside prompt 3.

`lib/marks.mjs` draws the vessel and every letter of CLAYSPAD as rectangles. A
logo set in a webfont breaks wherever that font is not loaded — an email
signature, a print sheet, someone else's deck. These render anywhere an SVG
renders, with no font to ship.

## The ticker

**`$CLAY`**.

Not `$HOOD` — that is Robinhood's NASDAQ ticker, and a token called `$HOOD`
launching on Robinhood Chain reads as an official Robinhood asset to anyone
skimming. Not `$PAD` either, which is every launchpad on every chain.

## No domain, no handle, no figures

Nothing generated from these prompts prints a domain or a handle, and nothing
added afterwards should either until both are registered. See
[`X-PROFILE.md`](X-PROFILE.md#images) for why that is a rule in this repository
rather than a preference.

**And no figures anywhere outside the contracts.** The supply, the split, the
fee and the range are `constant` in `Clayspad.sol` and `ClayHook.sol`, and that
is where they are published — not on the banner, not in a post, not in the bio,
not on the site. The code is the specification, and marketing does not restate a
specification in its own words.

The consequence worth keeping in view: the copy cannot make the disclosure
either. The share of every supply that stays liquid is the most material fact a
buyer needs, and under this rule it is not in the bio or the posts — so it has
to stay easy to find in `clayspad/README.md` and `contracts/README.md`, both of
which state it in full. Keep it that way.
