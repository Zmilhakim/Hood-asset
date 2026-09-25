# Drainpad — image prompts

Two images, both made in Google Flow, both **without any lettering**. The words
go on afterwards in `compose.sh`, in the site's own faces and at a position
chosen around what covers the image on each surface.

Flow returns whatever ratio it feels like. That is fine — `compose.sh` crops to
the size each surface needs. What it cannot fix is a generated word, so the one
instruction that must survive any rewording of these prompts is **no text, no
letters, no numbers, no signage, no watermark**.

The palette to hold to, in both:

| | |
| --- | --- |
| Asphalt, the ground | `#0B0C0D` |
| Wet slab, the mid tone | `#15181A` |
| Municipal amber, the only warm colour | `#F0A02C` |
| Standing water, cold and quiet | `#6AA7B4` |
| Chalk, the highlights | `#ECEAE5` |

---

## The avatar — square, 1000×1000

Save what Flow returns as `out/x-avatar-plain.jpg`.

```
Extreme close-up, looking straight down at a cast-iron storm drain grate set into
wet black asphalt. The grate fills the frame, its slats running horizontally,
edges worn and slightly rounded from years of traffic. Rainwater sheets across
the asphalt and pours between the slats into total darkness below. One shallow
puddle catches a single warm amber streetlight from above, a small hard reflection
on the wet metal; everything else is cold near-black with a faint blue-grey cast.
Shot on a 50mm lens, flat overhead angle, shallow depth of field on the near slat.
Photographic, gritty, high contrast, no people, no vehicles, no buildings.
Absolutely no text, no letters, no numbers, no signage, no watermark, no logo.
```

What matters if it needs another go: the grate must fill the frame and read at
thumbnail size. If the drain ends up small in a wide street scene, say **fill the
frame with the grate** and run it again.

## The header — wide, 1500×500

Save what Flow returns as `out/x-header-plain.jpg`.

```
Wide cinematic shot of a rain-soaked city street at night, seen low and close to
the ground. On the left, a kerbside storm drain swallows a steady stream of
runoff, water curling over the lip and disappearing into the dark. The right two
thirds of the frame are open wet asphalt stretching away, glossy and almost black,
holding one long soft amber reflection from a streetlight far out of frame. Cold
blue-grey ambient light, warm amber only in the reflections. Fine rain in the air,
faint mist near the ground. Anamorphic, 3:1 ultrawide, sharp foreground and soft
distance. No people, no cars, no shopfronts.
Absolutely no text, no letters, no numbers, no signage, no watermark, no logo.
```

The wordmark goes on the middle of this one, so the right two thirds have to stay
open. If Flow fills the frame with detail, ask again for **the right two thirds
empty wet asphalt** — an image with something happening in the middle is an image
the type has to fight.
