# Snowly — brand

Three files, and no pipeline. The images are generated in Google Flow from the
prompts here; this directory holds the words, the palette and the rules that
keep separately generated images looking like one brand.

| File | What it is |
| --- | --- |
| [`PROMPTS.md`](PROMPTS.md) | The image prompts: avatar, avatar with wordmark, banner, link preview |
| [`X-PROFILE.md`](X-PROFILE.md) | Handle, display name, bio, and what the bio must not say |
| [`X-POSTS.md`](X-POSTS.md) | The launch announcement, the mechanism posts, and replies worth having ready |

## The one rule that runs through all of them

**No supply figure, no fee, no market cap, no split — not in an image, not in
the bio, not in a post.** Those are constants in contracts that are verified
with their source published. That is where they are binding and where anybody
can check them. A number on a banner or in a bio is a claim with nothing behind
it, and it goes stale the moment anything changes.

The brand says what Snowly is. The contract says what it does.

## The look, in one paragraph

Glacial ice and packed snow in bright overcast daylight. One saturated colour —
meltwater blue — and it is always light that has travelled *through* the ice and
come back colder, never a blue painted onto a white surface. The background is
always bright. This is deliberately the inverse of the other launchpads in this
repository, which are lit objects in dark rooms, and the two should never be
mistaken for each other.

## What is in `out/`

The images that were generated from these prompts and then cropped to the ratios
each surface actually wants. Generators return whatever aspect ratio they feel
like, so none of these came back usable as-is.

| File | Where it goes |
| --- | --- |
| `x-avatar-1000.jpg` | The X avatar — the icon alone, safe to crop round |
| `logo-lockup-1000.jpg` | Icon with the wordmark, for anywhere the square is never cropped |
| `x-banner-1500x500.jpg` | The X header — loose drift on the left, crevasse on the right, empty middle |
| `og-1200x628.jpg` | The link preview, also served by the site at `/brand/og-1200x628.jpg` |
