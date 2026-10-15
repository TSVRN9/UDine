#!/usr/bin/env bash
set -euo pipefail

# Fills app/assets/recorded/pdf/ (gitignored) with UMass Dining's café menu PDFs, so recorded mode can serve The Commonwealth's four menus.
# They are UMass's documents and this repo is public: never commit them, nor an image rendered from one. Without them the app still builds;
# a recorded PDF row then shows its failed state.
#
#   app/tool/link_pdfs.sh [SRC]
#
# SRC defaults to the owner's gitignored M2 local folder, next to the main checkout: docs/design/explorations/2026-10-ui-overhaul/local/pdf
# (Lunch.pdf, Lite-fare.pdf, Dinner.pdf, Dessert.pdf; RecordedClient.pdfFiles maps a URL to one). Files are symlinked.

HERE="$(cd "$(dirname "$0")/.." && pwd)"
MAIN="$(cd "$(git -C "$HERE" rev-parse --git-common-dir)/.." && pwd)"
SRC="${1:-$MAIN/docs/design/explorations/2026-10-ui-overhaul/local/pdf}"
[[ -d "$SRC" ]] || { echo "no PDFs at $SRC (pass the folder as an argument)" >&2; exit 1; }
DST="$HERE/assets/recorded/pdf"
mkdir -p "$DST"
for f in "$SRC"/*.pdf; do [[ -e "$f" ]] && ln -sf "$f" "$DST/$(basename "$f")"; done
echo "linked $(ls "$DST" | grep -c '\.pdf$') PDFs into $DST"
