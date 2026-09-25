# Drainpad — image prompts

Three surfaces need real art: the **logo**, the **banner**, and the **background
for post images**. All three are made in Google Flow, and all three are asked for
**without any lettering at all**.

The words go on afterwards, in `compose.sh`, in the same faces the site loads and
at a position chosen around what covers the image on each surface. That split is
not fussiness — image generators misspell, and DRAINPAD coming back as DRIANPAD
is not a risk worth taking with the one word that has to be right.

Flow returns whatever ratio it feels like. That is fine: `compose.sh` crops to
the size each surface needs. What it cannot fix is a generated word, so the one
instruction that has to survive any rewording is **no text, no letters, no
numbers, no signage, no watermark, no logo**.

The palette both to hold to and to judge the result against:

| | |
| --- | --- |
| Asphalt, the ground | `#0B0C0D` |
| Wet slab, the mid tone | `#15181A` |
| Municipal amber, the only warm colour | `#F0A02C` |
| Standing water, cold and quiet | `#6AA7B4` |
| Chalk, the highlights | `#ECEAE5` |

Save each result under the filename given, then run `./compose.sh` and it picks
them up.

---

## 1 · The logo — square, for the X avatar

Save as `out/x-avatar-plain.jpg`.

```
Extreme close-up photograph looking straight down at a round cast-iron storm drain cover set into wet black asphalt, centred and filling the entire frame, perfectly symmetrical. Thick horizontal slats with worn rounded edges, decades of traffic polish on the high points, deep black voids between them going down into darkness. A thin film of rainwater sheets across the asphalt and spills over the near edge of the grate. One warm amber streetlight, far above and out of frame, lays a single hard highlight along the top edge of each slat; every other surface is cold near-black with a faint blue-grey cast. Flat overhead angle, 50mm lens, even lighting, heavy contrast between the lit metal and the black gaps. Gritty, photographic, industrial. No people, no vehicles, no buildings, no background.
Absolutely no text, no letters, no numbers, no signage, no watermark, no logo.
```

**Judge it on one thing: does it still read at the size of a thumbnail?** The
slats have to be few and thick, and the grate has to fill the frame. If it comes
back as a small drain in a wide street scene, add **fill the entire frame with
the grate, nothing else visible** and run it again. If the slats come back fine
and numerous, add **only five or six thick slats**.

## 2 · The banner — wide, for the X header

Save as `out/x-header-plain.jpg`.

```
Wide cinematic photograph of a rain-soaked city street at night, camera low and close to the ground at kerb height. On the far left, a kerbside storm drain swallows a steady stream of runoff, the water curling over the lip and vanishing into black. The right two thirds of the frame are open, empty wet asphalt stretching away into the dark, glossy and almost black, holding one long soft amber reflection from a streetlight far out of frame. Cold blue-grey ambient light everywhere, warm amber only in the reflections on the water. Fine rain in the air and a faint mist hanging near the ground. Anamorphic ultrawide 3:1 framing, sharp in the foreground, soft in the distance. No people, no cars, no shopfronts, no street furniture.
Absolutely no text, no letters, no numbers, no signage, no watermark, no logo.
```

**The wordmark goes across the middle of this one**, and the avatar covers the
lower left corner, so the drain belongs on the far left and the right two thirds
have to stay quiet. If Flow fills the middle with detail, add **the right two
thirds must be empty wet asphalt with nothing in it** and run it again.

## 3 · The post background — 16:9, for post images

Save as `out/post-bg-plain.jpg`.

```
Cinematic photograph of black wet asphalt filling the frame, shot from a low three-quarter angle after heavy rain. In the lower right corner, the edge of a cast-iron storm drain grate catches the light, water running across the asphalt towards it and disappearing between the slats. The upper left two thirds of the frame are open, empty, softly out of focus wet ground fading into darkness. A single warm amber streetlight reflection stretches diagonally across the wet surface from the upper left towards the drain. Cold blue-grey shadows, deep blacks, one warm accent. Shallow depth of field, moody, high contrast, heavy atmosphere, fine rain visible in the light. No people, no vehicles, no buildings.
Absolutely no text, no letters, no numbers, no signage, no watermark, no logo.
```

**The headline sits in the upper left**, so that part has to stay dark, empty and
soft. If the drain comes back big and central, add **the grate only in the lower
right corner, small** and run it again. Too bright is the other failure worth
watching for: this is a night image, and a headline in chalk white has to sit on
top of it without a box behind it.

Once it is in, `./compose.sh` builds the post cards over it instead of over the
drawn slab, and the wording of each card stays exactly as it is.

---

## If a result is close but not right

Change one thing and run it again rather than rewriting the whole prompt. The
three failures that actually happen, in order of how often:

1. **Lettering appears anyway.** Discard it. Do not try to paint over it — the
   words are placed around the image, and a generated word underneath will show.
2. **The frame is too busy where the type goes.** Add the sentence given under
   the prompt about what has to stay empty.
3. **It is too warm overall.** Add **cold blue-grey overall, warm amber only in
   the reflections** — the amber is meant to be the one thing in the picture that
   is warm, which is what makes it read as paint rather than as sunlight.
