#!/bin/sh
# Generates the PNGs from the SVGs in assets (needs ImageMagick): `sh scripts/make-icons.sh`
set -e
cd "$(dirname "$0")/../assets"
for s in 48 128 256 512; do
  convert -background none -density 288 app-icon.svg -resize "${s}x${s}" "PNG32:app-$s.png"
done
convert -background none -density 576 tray-icon.svg -resize 24x24 PNG32:icon.png
convert -background none -density 576 tray-icon.svg -resize 48x48 PNG32:icon@2x.png
