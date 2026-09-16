#!/usr/bin/env bash
# Regenerate every action icon under de.nichtlegacy.ilovemusic.sdPlugin/imgs/actions/
# from SF Symbols. macOS-only (uses NSImage + SF Symbols).
#
# Run from the repo root:
#   ./Scripts/regenerate-icons.sh
set -euo pipefail

cd "$(dirname "$0")/.."
SD="de.nichtlegacy.ilovemusic.sdPlugin"
SCRIPT="Scripts/render-sfsymbol.swift"

render_pair() {
  local symbol="$1" path="$2"
  local out_dir="$SD/imgs/actions/$(dirname "$path")"
  local out_base="$SD/imgs/actions/$path"
  mkdir -p "$out_dir"
  if [ "$(basename "$path")" = "icon" ]; then
    swift "$SCRIPT" "$symbol" 14 20  "${out_base}.png"     >/dev/null
    swift "$SCRIPT" "$symbol" 28 40  "${out_base}@2x.png"  >/dev/null
  else
    swift "$SCRIPT" "$symbol" 36 72  "${out_base}.png"     >/dev/null
    swift "$SCRIPT" "$symbol" 72 144 "${out_base}@2x.png"  >/dev/null
  fi
  echo "[ok] $path <- $symbol"
}

render_pair "play.fill"                     "toggle/play"
render_pair "pause.fill"                    "toggle/pause"
render_pair "play.fill"                     "toggle/icon"
render_pair "forward.end.fill"              "next/key"
render_pair "forward.end.fill"              "next/icon"
render_pair "shuffle"                       "random/key"
render_pair "shuffle"                       "random/icon"
render_pair "dot.radiowaves.left.and.right" "select/key"
render_pair "dot.radiowaves.left.and.right" "select/icon"
render_pair "music.note"                    "nowplaying/key"
render_pair "music.note"                    "nowplaying/icon"
render_pair "heart"                         "favorite/off"
render_pair "heart.fill"                    "favorite/on"
render_pair "heart"                         "favorite/icon"
render_pair "speaker.wave.3.fill"           "volume-step/up"
render_pair "speaker.wave.1.fill"           "volume-step/down"
render_pair "speaker.wave.2.fill"           "volume-step/icon"
render_pair "speaker.wave.2.fill"           "volume/unmuted"
render_pair "speaker.slash.fill"            "volume/muted"
render_pair "speaker.wave.2.fill"           "volume/icon"

echo "Done."
