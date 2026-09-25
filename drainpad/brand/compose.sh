#!/usr/bin/env bash
# Builds the images the site and the X account need.
#
#   ./compose.sh
#
# The art comes from Google Flow and the words go on here. That split is the
# whole design of this script: a generator cannot be trusted with lettering — it
# misspells, and DRAINPAD coming back as DRIANPAD is not a risk worth taking
# with the one word that has to be right — so the prompts in PROMPTS.md ask for
# pictures with no text in them at all, and every word is set here, in the same
# faces the site loads, at a position chosen around what covers the image on
# each surface.
#
# Three plain renders feed it:
#
#   out/x-avatar-plain.jpg    the grate from above, square
#   out/x-header-plain.jpg    the kerbside drain, wide
#   out/post-bg-plain.jpg     wet asphalt with the drain low in frame
#
# Any that are missing are skipped, and the post cards fall back to a slab drawn
# here — a finished card in its own right rather than a placeholder.
set -euo pipefail

cd "$(dirname "$0")"
mkdir -p out

ARCHIVO=fonts/archivo.ttf      # the display face, for the wordmark and headlines
BARLOW=fonts/barlow.ttf        # the body face, for the line under them
PLEX=fonts/plex-mono.ttf       # the mono, for the domain and any address

ASPHALT='#0B0C0D'
SLAB='#15181A'
KERB='#2E343A'
CHALK='#ECEAE5'
GRIT='#B4B9BD'
PAINT='#F0A02C'

TAGLINE='Water finds the lowest point and stays there.'
DOMAIN='drainpad.fun'

# --------------------------------------------------------------------- helpers

# The largest point size at which a line still fits the column it is set in.
# Headlines are written as words rather than measured in characters, so one of
# them is always the one that nearly overflows — better to let the script find
# that out than to discover it in a screenshot.
fit() {
  local font=$1 max_width=$2 start=$3 text=$4
  local size=$start width
  while [ "$size" -gt 24 ]; do
    width=$(magick -background none -font "$font" -pointsize "$size" label:"$text" -format '%w' info:)
    [ "$width" -le "$max_width" ] && break
    size=$((size - 2))
  done
  echo "$size"
}

# A poured slab, for when there is no photograph: asphalt lit from above, with a
# warm pool of light where the wordmark sits. One vertical gradient plus one
# blurred ellipse — anything composited from a resized layer leaves a seam, and a
# seam is the one thing a flat colour cannot hide.
slab() {
  local w=$1 h=$2 out=$3
  magick -size "${w}x${h}" "gradient:${SLAB}-${ASPHALT}" \
    \( -size "${w}x${h}" "xc:black" -fill "#3A2408" \
       -draw "ellipse $((w * 26 / 100)),$((h * 38 / 100)) $((w * 32 / 100)),$((h * 30 / 100)) 0,360" \
       -blur 0x100 \) \
    -compose screen -composite \
    "$out"
}

# The grate, drawn: slats with the dark between them. Only used where there is no
# photograph of a real one.
bars() {
  local w=$1 h=$2 colour=$3 out=$4
  magick -size "${w}x26" "xc:none" -fill "$colour" -draw "rectangle 0,0 ${w},5" \
    -write mpr:slat +delete -size "${w}x${h}" tile:mpr:slat "$out"
}

hazard() {
  local w=$1 h=$2 out=$3
  magick -size "20x20" "xc:none" -fill "#A96C14" \
    -draw "polygon 0,20 20,0 34,0 0,34" -draw "polygon -20,20 0,0 6,0 -20,26" \
    -write mpr:stripe +delete -size "${w}x${h}" tile:mpr:stripe "$out"
}

# The ground under the type. Chalk-white letters have to sit on a night
# photograph without a box behind them, so the picture is pulled down from the
# left and from the top — the two edges the type is set against — and left alone
# everywhere else, which is where the drain and the reflection are.
darken() {
  local src=$1 w=$2 h=$3 left=$4 top=$5 out=$6
  magick "$src" \
    \( -size "${w}x${h}" "gradient:${ASPHALT}${left}-${ASPHALT}00" -rotate 270 \) -compose over -composite \
    \( -size "${w}x${h}" "gradient:${ASPHALT}${top}-${ASPHALT}00" \) -compose over -composite \
    "$out"
}

# ------------------------------------------------------------------ the avatar
# 1000x1000. No lettering on this one at all: at the size X shows an avatar, a
# word is a smudge, and the grate is the mark.
if [ -f out/x-avatar-plain.jpg ]; then
  magick out/x-avatar-plain.jpg -resize 1000x1000^ -gravity center -extent 1000x1000 \
    -quality 92 out/x-avatar-1000x1000.jpg
  echo "out/x-avatar-1000x1000.jpg"
else
  echo "skipped the avatar — drop the Flow render in as out/x-avatar-plain.jpg"
fi

# ------------------------------------------------------------------ the header
# 1500x500. The source is 16:9 and this is 3:1, so a band is taken rather than
# the whole frame, pulled low to keep the kerb and the drain and drop the empty
# sky. The avatar covers the lower left, which is where the drain is — so the
# wordmark goes right of centre, on the open asphalt.
if [ -f out/x-header-plain.jpg ]; then
  magick out/x-header-plain.jpg -gravity center -crop '1376x459+0+80' +repage \
    -resize 1500x500! out/_h.png
  darken out/_h.png 1500 500 E6 00 out/_h2.png

  magick out/_h2.png \
    -fill "$PAINT" -draw "rectangle 700,132 800,137" \
    -font "$ARCHIVO" -pointsize 92 -fill "$CHALK" -gravity northwest -annotate +698+172 'DRAINPAD' \
    -font "$BARLOW" -pointsize 28 -fill "$GRIT" -gravity northwest -annotate +702+292 "$TAGLINE" \
    -quality 92 out/x-header-1500x500.jpg
  rm -f out/_h.png out/_h2.png
  echo "out/x-header-1500x500.jpg"
else
  echo "skipped the header — drop the Flow render in as out/x-header-plain.jpg"
fi

# ------------------------------------------------- the ground the cards sit on
# The post background is portrait and the cards are 16:9, so a band is taken from
# it — and it is flipped, because the lamp's reflection falls on the side the
# headline needs. Flipped, the reflection is on the right and the type has dark
# water under it.
if [ -f out/post-bg-plain.jpg ]; then
  magick out/post-bg-plain.jpg -flop -gravity center -crop '896x504+0+160' +repage \
    -resize 1200x675! out/_cardbg.png
fi

# ------------------------------------------------------------------ post cards
# 1200x675, the ratio X gives an inline image the most room at. One line of type
# doing the work: the card has to land in the half-second before the eye moves
# on, so it says one thing, in the largest letters that fit.
card() {
  local out=$1 kicker=$2 line1=$3 line2=$4 foot=$5

  if [ -f out/_cardbg.png ]; then
    darken out/_cardbg.png 1200 675 F0 CC out/_c.png
  else
    slab 1200 675 out/_c.png
    bars 1200 120 "$KERB" out/_cb.png
    magick out/_c.png \( out/_cb.png \) -gravity south -geometry +0+0 -compose over -composite out/_c.png
    rm -f out/_cb.png
  fi

  hazard 1200 6 out/_ch.png

  local size
  size=$(fit "$ARCHIVO" 1040 96 "$line1")
  size=$(fit "$ARCHIVO" 1040 "$size" "$line2")

  magick out/_c.png \
    \( out/_ch.png \) -gravity north -geometry +0+0 -compose over -composite \
    -font "$PLEX" -pointsize 24 -fill "$PAINT" -gravity northwest -annotate +80+96 "$kicker" \
    -font "$ARCHIVO" -pointsize "$size" -fill "$CHALK" -gravity northwest -annotate +78+176 "$line1" \
    -font "$ARCHIVO" -pointsize "$size" -fill "$CHALK" -gravity northwest -annotate +78+290 "$line2" \
    -font "$BARLOW" -pointsize 30 -fill "$GRIT" -gravity northwest -annotate +82+436 "$foot" \
    -font "$PLEX" -pointsize 24 -fill "$PAINT" -gravity southwest -annotate +80+56 "$DOMAIN" \
    -quality 92 "$out"

  rm -f out/_c.png out/_ch.png
  echo "$out"
}

card out/post-launch-1200x675.jpg \
  'DRAINPAD · ROBINHOOD CHAIN' \
  'WATER FINDS THE' \
  'LOWEST POINT.' \
  'And stays there. One transaction, and the pool'"'"'s share is already down.'

card out/post-sump-1200x675.jpg \
  'THE SUMP' \
  'SEARCH IT FOR' \
  'A WAY BACK OUT.' \
  'No withdraw. No owner. No pause. No emergency hatch. No upgrade path.'

card out/post-grate-1200x675.jpg \
  'THE GRATE' \
  'NOTHING PASSES' \
  'WITHOUT CROSSING IT.' \
  'Kept on the way in, both directions, at a rate fixed in the pool'"'"'s own key.'

card out/post-token-1200x675.jpg \
  'THE TOKEN' \
  'IT WENT DOWN' \
  'LIKE EVERYTHING ELSE.' \
  'Minted, pooled and sunk in one transaction, through the pad anyone else can use.'

# ---------------------------------------------------------------- link preview
# 1200x628, which is what X shows for a link and what the site serves as its own
# card. Same ground as the post cards, set as a wordmark rather than a headline.
if [ -f out/_cardbg.png ]; then
  magick out/_cardbg.png -resize 1200x628^ -gravity center -extent 1200x628 out/_og.png
  darken out/_og.png 1200 628 F0 C0 out/_og2.png
else
  slab 1200 628 out/_og2.png
fi

hazard 1200 6 out/_ogh.png
magick out/_og2.png \
  \( out/_ogh.png \) -gravity north -geometry +0+0 -compose over -composite \
  -fill "$PAINT" -draw "rectangle 84,196 184,201" \
  -font "$ARCHIVO" -pointsize 104 -fill "$CHALK" -gravity northwest -annotate +80+236 'DRAINPAD' \
  -font "$BARLOW" -pointsize 31 -fill "$GRIT" -gravity northwest -annotate +84+372 "$TAGLINE" \
  -font "$PLEX" -pointsize 26 -fill "$PAINT" -gravity northwest -annotate +84+438 "$DOMAIN" \
  -quality 92 out/og-1200x628.jpg
rm -f out/_og.png out/_og2.png out/_ogh.png out/_cardbg.png
echo "out/og-1200x628.jpg"
