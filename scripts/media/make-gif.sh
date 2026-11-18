#!/bin/bash
# Turns a recorded scene into its README clip: make-gif.sh <scene> [fps] [colors].
# Writes $MEDIA_WORK/out/<scene>.mp4 and .gif (one palette for the whole clip) and a contact sheet of
# frame 0 and then a frame every 2 seconds, $MEDIA_WORK/out/<scene>-sheet.png.
set -e
M="$(cd "$(dirname "$0")" && pwd)"
W="${MEDIA_WORK:-${XDG_CACHE_HOME:-$HOME/.cache}/dck-media}"
scene="${1:?usage: make-gif.sh <scene> [fps] [colors]}"
fps="${2:-12}"
colors="${3:-96}"
mkdir -p "$W/out" "$W/out/frames"
(cd "$M" && python3 compose.py "$W" "$scene" "$W/out/$scene.mp4")
ffmpeg -v error -y -i "$W/out/$scene.mp4" \
  -vf "fps=$fps,split[a][b];[a]palettegen=max_colors=$colors:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle" \
  "$W/out/$scene.gif"
rm -f "$W/out/frames/$scene-"*.png
ffmpeg -v error -y -i "$W/out/$scene.gif" -vf "select='eq(n\,0)+gte(t-prev_selected_t\,2)'" -vsync vfr \
  "$W/out/frames/$scene-%02d.png"
montage "$W/out/frames/$scene-"*.png -tile 3x -geometry 480x+4+4 -background '#202020' "$W/out/$scene-sheet.png"
seconds="$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$W/out/$scene.mp4")"
echo "$scene: $(du -k "$W/out/$scene.gif" | cut -f1) KB, ${seconds%.*} s, $W/out/$scene.gif"
