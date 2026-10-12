#!/usr/bin/env bash
# Copies UMass Dining's own photos (gitignored: never commit them) from the owner's local M2 build into
# assets/bakeoff/. Unaltered; byte-for-byte copies, as mobile/scripts/bakeoff-assets.sh does for RN.
set -euo pipefail
SRC="${BAKEOFF_PHOTOS:-/home/tavern/Projects/js/UDine/docs/design/explorations/2026-10-ui-overhaul/local/flows/M2/assets}"
DST="$(cd "$(dirname "$0")/.." && pwd)/assets/bakeoff"
mkdir -p "$DST/retail" "$DST/ev"
for h in worcester franklin hampshire berkshire; do cp "$SRC/$h.jpg" "$DST/$h.jpg"; done
cp "$SRC"/retail/*.jpg "$SRC"/retail/*.png "$DST/retail/"
cp "$SRC/ev/ipd.jpg" "$DST/ev/ipd.jpg"
echo "copied to $DST"
