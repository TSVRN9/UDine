#!/usr/bin/env bash
# Copies UMass Dining's own photos (gitignored: never commit them) from the owner's local M2 build into
# mobile/assets/bakeoff/ for the bake-off screens. Unaltered; the files are copied byte for byte.
set -euo pipefail
SRC="${BAKEOFF_PHOTOS:-/home/tavern/Projects/js/UDine/docs/design/explorations/2026-10-ui-overhaul/local/flows/M2/assets}"
DST="$(cd "$(dirname "$0")/.." && pwd)/assets/bakeoff"
mkdir -p "$DST/retail" "$DST/ev"
for h in worcester franklin hampshire berkshire; do cp "$SRC/$h.jpg" "$DST/$h.jpg"; done
cp "$SRC"/retail/*.jpg "$DST/retail/"
cp "$SRC/ev/ipd.jpg" "$DST/ev/ipd.jpg"
echo "copied to $DST"
