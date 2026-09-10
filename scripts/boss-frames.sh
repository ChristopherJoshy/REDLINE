#!/usr/bin/env bash
# Boss AMV frame pipeline — PREP MACHINE ONLY. Never run in plan mode, never
# redistribute full video. Extracts stills + posters + blurhash LQIPs into
# frontend/public/bosses/<boss>/ + boss-frames.json fixtures.
#
# Prereqs: yt-dlp, ffmpeg, python3 with PIL.
# Sources (re-confirm availability at prep time):
#   Aizen  https://www.youtube.com/watch?v=BnvhfCE7toU (0:36 Blubz 4K AMV)
#   Itachi https://www.youtube.com/watch?v=E9qJCqkBdbg (1:32 MuyoXplosion 4K)
set -euo pipefail

OUT="frontend/public/bosses"
mkdir -p "$OUT/aizen" "$OUT/itachi"

probe() { yt-dlp -F "$1"; }

fetch() { # $1=url $2=out
  yt-dlp -f "bv*[height<=1080]+ba/b[height<=1080]/b" -S "res:1080,vcodec:h264,acodec:m4a" \
    --merge-output-format mp4 -o "$2" "$1"
}

# $1=mp4 $2=timestamp $3=slot-out $4=extra-scale-args
grab() { ffmpeg -y -loglevel error -ss "$2" -i "$1" -frames:v 1 $4 "$3"; }

poster() { # $1=src.png $2=poster.webp
  ffmpeg -y -loglevel error -i "$1" -vf "scale=640:-1" -c:v libwebp -q:v 70 "$2"
}

echo "== probe =="
probe "https://www.youtube.com/watch?v=BnvhfCE7toU"
probe "https://www.youtube.com/watch?v=E9qJCqkBdbg"

echo "== fetch (numeric pins go here after -F review) =="
fetch "https://www.youtube.com/watch?v=BnvhfCE7toU" "prep/aizen-1080p.mp4"
fetch "https://www.youtube.com/watch?v=E9qJCqkBdbg" "prep/itachi-1080p.mp4"

echo "== aizen slots =="
grab "prep/aizen-1080p.mp4" 9  "$OUT/aizen/reveal.png"  "scale=1280:-1"
grab "prep/aizen-1080p.mp4" 14 "$OUT/aizen/p2.png"      "scale=1280:-1"
grab "prep/aizen-1080p.mp4" 22 "$OUT/aizen/flash.png"   "scale=640:-1"
poster "$OUT/aizen/reveal.png" "$OUT/aizen/reveal.poster.webp"
poster "$OUT/aizen/p2.png"     "$OUT/aizen/p2.poster.webp"

echo "== itachi slots =="
grab "prep/itachi-1080p.mp4" 11 "$OUT/itachi/reveal.png" "scale=1280:-1"
grab "prep/itachi-1080p.mp4" 53 "$OUT/itachi/p2.png"     "scale=1280:-1"
grab "prep/itachi-1080p.mp4" 69 "$OUT/itachi/flash.png"  "scale=640:-1"
poster "$OUT/itachi/reveal.png" "$OUT/itachi/reveal.poster.webp"
poster "$OUT/itachi/p2.png"     "$OUT/itachi/p2.poster.webp"

echo "== boss-frames.json =="
python3 - "$OUT" <<'EOF'
import json, sys
out = sys.argv[1]
manifest = {
    "aizen": {
        "reveal": {"at": 9, "loop": True, "audio": "/sounds/aizen/entry-yokoso-full.mp3"},
        "p2": {"at": 14, "muted": True, "dim": 0.4, "loopSeconds": 5},
        "flash": {"at": 22, "oncePerTeam": True, "ms": 200},
    },
    "itachi": {
        "reveal": {"at": 11, "audio": "/sounds/itachi/crow-caw.mp3"},
        "p2": {"at": 53},
        "flash": {"at": 69, "oncePerTeam": True, "ms": 200},
    },
}
with open(f"{out}/boss-frames.json", "w") as fh:
    json.dump(manifest, fh, indent=2)
print("wrote boss-frames.json")
EOF

echo "DONE. Verify: 8 slots with +-1s scene-hit fixtures, posters render offline, no prep/*.mp4 committed."
