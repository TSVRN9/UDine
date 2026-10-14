#!/usr/bin/env bash
set -euo pipefail

# Fills app/assets/photos/ (gitignored) with UMass Dining's photos so the build bundles them (owner, 2026-10-14: ship them, never
# commit them). Without it the app still builds and runs: bands fall back to their maroon ground.
#
#   app/tool/link_photos.sh [SRC]
#
# SRC defaults to the owner's gitignored M2 assets, next to the main checkout:
# docs/design/explorations/2026-10-ui-overhaul/local/flows/M2/assets (halls as <hall>.jpg, retail/ as ui/photos.dart names them).
# Files are symlinked, so a re-run after the originals change needs nothing more.

HERE="$(cd "$(dirname "$0")/.." && pwd)"
MAIN="$(cd "$(git -C "$HERE" rev-parse --git-common-dir)/.." && pwd)"
SRC="${1:-$MAIN/docs/design/explorations/2026-10-ui-overhaul/local/flows/M2/assets}"
[[ -d "$SRC" ]] || { echo "no photos at $SRC (pass the folder as an argument)" >&2; exit 1; }
DST="$HERE/assets/photos"
mkdir -p "$DST/retail"
for h in worcester franklin hampshire berkshire; do ln -sf "$SRC/$h.jpg" "$DST/$h.jpg"; done
for f in "$SRC"/retail/*.jpg "$SRC"/retail/*.png; do [[ -e "$f" ]] && ln -sf "$f" "$DST/retail/$(basename "$f")"; done
echo "linked $(ls "$DST" "$DST/retail" | grep -c '\.\(jpg\|png\)$') photos into $DST"
