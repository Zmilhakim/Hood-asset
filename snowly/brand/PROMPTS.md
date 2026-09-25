# Snowly — image prompts

Ready to paste into Google Flow. Each one is a single descriptor chain, with a
separate negative line underneath it.

They share one palette and one lighting setup, which is what makes separately
generated images look like one brand rather than several pictures that happen to
be blue.

## The palette

Paste the hex values in rather than naming the colours. "Ice blue" means a dozen
different blues to a generator; `#0B6BD3` means one.

| Role | Hex | Where it goes |
| --- | --- | --- |
| Meltwater | `#0B6BD3` | The accent: light trapped inside the ice |
| Meltwater, deep | `#06437F` | The core of a crevasse, the darkest blue |
| Ice | `#B9D9F2` | Translucent faces, the cold edge of a shadow |
| Frost wash | `#E3EEFB` | The haze in the background behind a subject |
| Snow field | `#F4F8FB` | Background |
| Snow, lit | `#FFFFFF` | Top surfaces facing the sun |
| Rime | `#D8E4EF` | The line where two planes meet |
| Stone | `#16202B` | Wordmark, and nothing else |

## The two rules that hold the set together

**The material is glacial ice and packed snow — never metal, glass or plastic.**
It is dense and slightly translucent: light enters the surface, scatters a
short way inside, and comes back out softer and bluer than it went in. Edges are
fractured and faceted where ice has broken, and softly rounded where snow has
drifted. It should look cold enough to be unpleasant to hold.

**The scene is daylight, and the blue comes from inside the ice.** The
background is always bright — an overcast snowfield, never a dark studio. The
saturated blue is light that has travelled through the ice and lost its warmth
on the way, glowing out of cracks and deep faces. It is never a blue paint
sprayed onto a white object. A render that comes back dark, or with blue *on*
the ice instead of *within* it, does not match the set.

> This is the opposite of the other launchpads in this repository on purpose.
> They are lit objects in dark rooms. Snowly is a bright object in bright
> daylight, and the two should never be mistaken for each other.

---

## 1A. Profile picture — icon only, 1:1

For the X avatar. It gets cropped to a circle, so no wordmark and a wide, even
margin on all four sides.

```
Premium abstract crypto launchpad logo icon, a six-armed snowflake carved from
dense glacial ice, perfectly symmetrical, thick even arms with small paired
barbs branching near each tip, faceted fractured surfaces like cleaved ice,
translucent with strong subsurface scattering so light enters the surface and
returns softer and colder, body in pale ice #B9D9F2 with lit upper faces in
pure white #FFFFFF and deep meltwater blue #06437F pooling inside the thickest
part of the core, a single horizontal band of compacted glacier passing
straight through the lower third of the flake where the arms meet the ice and
fuse into it, that band dense and opaque snow-white with a glowing meltwater
seam #0B6BD3 running along its length from within, subject perfectly centred
and filling 60 percent of the frame with generous even empty margin on all four
sides, flat bright snowfield background #F4F8FB with a soft frost haze #E3EEFB
directly behind the subject and nothing at the edges, bright overcast polar
daylight, soft key light from above left, cool rim light separating the subject
from the background, soft contact shadow, symmetrical composition, minimal and
memorable, high-end Web3 startup identity, professional brand mark, octane
render, physically based shading, subsurface scattering, sharp focus, ultra
clean, high detail, 1:1 square profile picture
```

**Negative:** `text, letters, words, wordmark, typography, numbers, percentages, mascot, character, face, snowman, christmas, festive, holiday, santa, extra objects, coins, rockets, charts, circuit board, subject touching frame edge, cropped subject, dark background, black background, night, busy background, particles at edges, lens flare, rainbow colours, orange, purple, warm light, golden hour, flat illustration, cartoon, sticker, watermark`

**Check it:** shrink it to 32 × 32 and crop it round. If the six arms still read
as a flake and the glacier band still cuts across it, keep it. If it turns into
a blue smudge, the arms are too thin — ask for thicker arms and fewer barbs.

## 1B. Profile picture — with the wordmark, 1:1

The same object with SNOWLY set beneath it. Use this where the full square is
shown and never cropped: a token list, a Telegram profile, a gallery card, a
deck.

```
Premium abstract crypto launchpad logo lockup, a six-armed snowflake carved from
dense glacial ice centred in the upper two thirds of the frame, perfectly
symmetrical, thick even arms with small paired barbs near each tip, faceted
fractured ice surfaces, translucent with strong subsurface scattering, body in
pale ice #B9D9F2 with lit upper faces pure white #FFFFFF and deep meltwater blue
#06437F inside the core, a horizontal band of compacted glacier passing through
the lower third of the flake with a glowing meltwater seam #0B6BD3 within it,
below the icon the single word SNOWLY in a high-contrast modern serif, letters
in deep stone #16202B, generous letter spacing, small and quiet relative to the
icon, perfectly centred, flat bright snowfield background #F4F8FB with a soft
frost haze #E3EEFB behind the icon, bright overcast polar daylight, soft key
light from above left, cool rim light, soft contact shadow, symmetrical
composition, even margin on all four sides, high-end Web3 startup identity,
octane render, physically based shading, subsurface scattering, sharp focus,
ultra clean, 1:1 square
```

**Negative:** `misspelled text, garbled letters, extra words, tagline, slogan, numbers, percentages, ticker symbol, dollar sign, mascot, character, snowman, christmas, dark background, black background, night, warm light, lens flare, rainbow colours, busy background, watermark`

**Check it:** read the word out loud, letter by letter. Generators misspell
wordmarks constantly, and SNOWLY comes back as SNOWLEY or SNOWY often enough
that it is worth checking every time before anything is posted.

## 2. Banner — 3:1

For the X header. **The middle of this image is covered by the avatar and the
profile text**, so everything worth seeing belongs in the outer thirds, and the
centre should be close to empty.

```
Wide cinematic banner of a glacier face in bright overcast polar daylight, the
left third showing loose windblown powder snow drifting in soft ridges, the
right third showing that same snow compacted into dense blue glacial ice with
a deep crevasse glowing meltwater blue #0B6BD3 from within and #06437F in its
depths, the transition between the two happening gradually across the frame so
loose snow on the left becomes solid ice on the right, the centre of the frame
deliberately empty and uncluttered as flat open snowfield, snow in pure white
#FFFFFF and pale ice #B9D9F2, background haze in frost wash #E3EEFB meeting a
featureless bright sky, no horizon line in the centre, soft diffused daylight
with no visible sun, cold colour temperature, subtle atmospheric depth,
photographic, extremely high detail, ultra clean, minimal, wide panoramic
composition, 3:1 aspect ratio banner
```

**Negative:** `text, letters, words, logo, watermark, numbers, percentages, people, figures, footprints, animals, trees, buildings, tents, flags, mountains in the centre, busy centre, clutter in the middle, dark sky, night, aurora, stars, sunset, warm light, golden hour, rainbow colours, cartoon, illustration`

**Check it:** lay the avatar circle over the lower left and a block of text
across the middle. If nothing important disappears underneath either, it works.

## 3. Link preview — 1.91:1

The image that appears when snowly.fun is pasted into X, Telegram or Discord.
Text is added afterwards in an editor rather than generated, because a generator
cannot be trusted to spell.

```
A single block of glacial ice resting on an open snowfield in bright overcast
polar daylight, the block dense and faceted with fractured cleaved faces, deeply
translucent so light enters and scatters inside it, pale ice #B9D9F2 at its
edges and deep meltwater blue #06437F pooling in its centre, a thin bright seam
of meltwater #0B6BD3 glowing from a crack running down its face, fresh powder
snow #FFFFFF drifted against its base, positioned in the right half of the frame
leaving the left half as clean open snowfield #F4F8FB for text, soft frost haze
#E3EEFB in the background, no horizon, soft diffused daylight with no visible
sun, cold colour temperature, soft contact shadow, photographic, physically
based shading, subsurface scattering, extremely high detail, ultra clean,
minimal composition, 1.91:1
```

**Negative:** `text, letters, words, logo, watermark, numbers, percentages, people, animals, buildings, dark background, night, aurora, stars, warm light, sunset, rainbow colours, clutter, busy composition, cartoon`

**Leave the left half clear.** The wordmark and one line go there afterwards, set
in the same serif as the site, in stone `#16202B`.

---

## What never goes in an image

No supply figure, no fee, no market cap, no percentages, and no ticker price.
Those live in the contract, which is verified with its source published, and
that is the only place they are binding. An image cannot be checked against the
chain — a number on a banner is a claim with nothing behind it, and it goes
stale the moment anything changes.

The images say what Snowly is. The contract says what it does.
