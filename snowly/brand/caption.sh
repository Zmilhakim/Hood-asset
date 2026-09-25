#!/usr/bin/env bash
# Sets the wordmark and the line under it onto the generated art.
#
#   ./caption.sh
#
# The generator is not asked to produce text. It misspells wordmarks — SNOWLY
# comes back as SNOWLEY often enough that it cannot be trusted with the one word
# that has to be right — and it cannot place type against a layout. So the art is
# generated clean and the words go on here, in the same two faces the site uses,
# at a position chosen around what covers the image on each surface.
#
# Reads out/*-plain-*.jpg and writes the captioned versions beside them.
set -euo pipefail

cd "$(dirname "$0")"

FRAUNCES=fonts/fraunces.ttf   # the site's display face, for the wordmark
INTER=fonts/inter.ttf         # the site's body face, for everything under it

STONE='#16202B'   # the wordmark
SOFT='#46586B'    # the line under it
MELT='#0B6BD3'    # the address of the site, and nothing else

TAGLINE='What the glacier takes, it keeps.'

# The X header. Type starts at x=400 because the avatar sits over the lower left
# and the crevasse owns the right — the middle is the only part of this image
# that is reliably both visible and empty.
magick out/x-banner-plain-1500x500.jpg \
  -font "$FRAUNCES" -pointsize 94 -fill "$STONE" -gravity northwest -annotate +400+180 'Snowly' \
  -font "$INTER"    -pointsize 27 -fill "$SOFT"  -gravity northwest -annotate +406+290 "$TAGLINE" \
  out/x-banner-1500x500.jpg

# The link preview, which the site serves too. The block of ice was framed into
# the right half precisely so this column is free.
magick out/og-plain-1200x628.jpg \
  -font "$FRAUNCES" -pointsize 82 -fill "$STONE" -gravity northwest -annotate +70+225 'Snowly' \
  -font "$INTER"    -pointsize 26 -fill "$SOFT"  -gravity northwest -annotate +74+325 "$TAGLINE" \
  -font "$INTER"    -pointsize 23 -fill "$MELT"  -gravity northwest -annotate +74+375 'snowly.fun' \
  out/og-1200x628.jpg

echo 'written:'
echo '  out/x-banner-1500x500.jpg'
echo '  out/og-1200x628.jpg'
