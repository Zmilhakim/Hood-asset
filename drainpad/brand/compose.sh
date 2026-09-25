#!/usr/bin/env bash
# Builds the images the site and the X account need.
#
#   ./compose.sh
#
# Two kinds of image come out of here.
#
# **Drawn here.** The link preview and the post cards are type on a poured slab:
# a wordmark, a line, a grate. There is no photograph in them, so there is
# nothing to generate — they are composed from the same colours and the same
# faces the site loads, which is the point. A wordmark burned into a card and a
# heading rendered in a browser should be the same letters.
#
# **Captioned here.** The avatar and the header start as art from Google Flow,
# because those two want a real image behind them. The generator is asked for
# art with no lettering at all — it misspells wordmarks, and DRAINPAD coming
# back as DRIANPAD is not a risk worth taking with the one word that has to be
# right — so the words go on afterwards, here, placed around what covers the
# image on each surface. Drop the Flow renders in as out/x-header-plain.jpg and
# out/x-avatar-plain.jpg and re-run; if they are not there those steps are
# skipped and the rest still builds.
set -euo pipefail

cd "$(dirname "$0")"
mkdir -p out

ARCHIVO=fonts/archivo.ttf      # the display face, for the wordmark
BARLOW=fonts/barlow.ttf        # the body face, for the line under it
PLEX=fonts/plex-mono.ttf       # the mono, for the domain and any address

ASPHALT='#0B0C0D'
SLAB='#15181A'
KERB='#2E343A'
CHALK='#ECEAE5'
GRIT='#8B8F93'
PAINT='#F0A02C'

TAGLINE='Water finds the lowest point and stays there.'
DOMAIN='drainpad.fun'

# A poured slab: asphalt lit from above, with a warm pool of light where the
# wordmark sits. One vertical gradient plus one blurred ellipse — anything
# composited from a resized layer leaves a seam, and a seam is the one thing a
# flat colour cannot hide.
slab() {
  local w=$1 h=$2 out=$3
  magick -size "${w}x${h}" "gradient:${SLAB}-${ASPHALT}" \
    \( -size "${w}x${h}" "xc:black" -fill "#3A2408" \
       -draw "ellipse $((w * 26 / 100)),$((h * 38 / 100)) $((w * 32 / 100)),$((h * 30 / 100)) 0,360" \
       -blur 0x100 \) \
    -compose screen -composite \
    "$out"
}

# The grate: slats with the dark between them, tiled down the panel. Wide slats
# rather than fine ones — at this size a fine rule reads as a scan line, and a
# grate is a thing you could put a boot through.
bars() {
  local w=$1 h=$2 colour=$3 out=$4
  magick -size "${w}x26" "xc:none" -fill "$colour" -draw "rectangle 0,0 ${w},5" \
    -write mpr:slat +delete -size "${w}x${h}" tile:mpr:slat "$out"
}

# Hazard stripes, for the rule that runs along an edge.
hazard() {
  local w=$1 h=$2 out=$3
  magick -size "20x20" "xc:none" -fill "#A96C14" \
    -draw "polygon 0,20 20,0 34,0 0,34" -draw "polygon -20,20 0,0 6,0 -20,26" \
    -write mpr:stripe +delete -size "${w}x${h}" tile:mpr:stripe "$out"
}

# ---------------------------------------------------------------- link preview
# 1200x628, which is what X shows for a link and what the site serves as its own
# card. Type left, grate right, and nothing in the middle that crops badly.
slab 1200 628 out/_base.png
bars 452 628 "$KERB" out/_bars.png
hazard 1200 6 out/_hazard.png

magick out/_base.png \
  -fill "#0E1012" -draw "rectangle 748,0 1200,628" \
  \( out/_bars.png \) -gravity east -geometry +0+0 -compose over -composite \
  -fill "$KERB" -draw "rectangle 746,0 748,628" \
  \( out/_hazard.png \) -gravity north -geometry +0+0 -compose over -composite \
  -font "$ARCHIVO" -pointsize 104 -fill "$CHALK" -gravity northwest -annotate +80+206 'DRAINPAD' \
  -font "$BARLOW" -pointsize 31 -fill "$GRIT" -gravity northwest -annotate +84+342 "$TAGLINE" \
  -font "$PLEX" -pointsize 26 -fill "$PAINT" -gravity northwest -annotate +84+410 "$DOMAIN" \
  -fill "$PAINT" -draw "rectangle 84,468 244,472" \
  -quality 92 out/og-1200x628.jpg
echo "out/og-1200x628.jpg"

# ------------------------------------------------------------------ the header
# 1500x500. The avatar covers the lower left, so the type starts past it.
if [ -f out/x-header-plain.jpg ]; then
  magick out/x-header-plain.jpg -resize 1500x500^ -gravity center -extent 1500x500 \
    -font "$ARCHIVO" -pointsize 96 -fill "$CHALK" -gravity northwest -annotate +430+170 'DRAINPAD' \
    -font "$BARLOW" -pointsize 29 -fill "$GRIT" -gravity northwest -annotate +434+292 "$TAGLINE" \
    -quality 92 out/x-header-1500x500.jpg
  echo "out/x-header-1500x500.jpg"
else
  echo "skipped the header — drop the Flow render in as out/x-header-plain.jpg"
fi

# ------------------------------------------------------------------ the avatar
# 1000x1000, square, cropped from whatever Flow returned. No lettering: at the
# size X shows an avatar, a word is a smudge.
if [ -f out/x-avatar-plain.jpg ]; then
  magick out/x-avatar-plain.jpg -resize 1000x1000^ -gravity center -extent 1000x1000 \
    -quality 92 out/x-avatar-1000x1000.jpg
  echo "out/x-avatar-1000x1000.jpg"
else
  echo "skipped the avatar — drop the Flow render in as out/x-avatar-plain.jpg"
fi

rm -f out/_base.png out/_bars.png out/_hazard.png

# ------------------------------------------------------------------ post cards
# 1200x675, the ratio X gives an inline image the most room at. One line of type
# doing the work, a grate under it, and the wordmark small in the corner — the
# card has to land in the half-second before the eye moves on, so it says one
# thing and says it in the largest letters that fit.
card() {
  local out=$1 kicker=$2 line1=$3 line2=$4 foot=$5

  slab 1200 675 out/_c-base.png
  bars 1200 120 "$KERB" out/_c-bars.png
  hazard 1200 6 out/_c-hazard.png

  magick out/_c-base.png \
    \( out/_c-bars.png \) -gravity south -geometry +0+0 -compose over -composite \
    \( out/_c-hazard.png \) -gravity north -geometry +0+0 -compose over -composite \
    -font "$PLEX" -pointsize 24 -fill "$PAINT" -gravity northwest -annotate +80+96 "$kicker" \
    -font "$ARCHIVO" -pointsize 96 -fill "$CHALK" -gravity northwest -annotate +78+176 "$line1" \
    -font "$ARCHIVO" -pointsize 96 -fill "$CHALK" -gravity northwest -annotate +78+286 "$line2" \
    -font "$BARLOW" -pointsize 30 -fill "$GRIT" -gravity northwest -annotate +82+430 "$foot" \
    -font "$PLEX" -pointsize 24 -fill "$PAINT" -gravity southwest -annotate +80+62 "$DOMAIN" \
    -quality 92 "$out"

  rm -f out/_c-base.png out/_c-bars.png out/_c-hazard.png
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
  'Charged on the way in, both directions, at a rate fixed in the pool'"'"'s own key.'
