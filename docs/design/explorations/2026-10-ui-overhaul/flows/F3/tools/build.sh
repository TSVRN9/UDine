#!/bin/sh
# Inlines tools/data.js into tools/src.html -> index.html
cd "$(dirname "$0")/.." && python3 - <<'PY'
src = open('tools/src.html').read(); data = open('tools/data.js').read().strip()
open('index.html', 'w').write(src.replace('/*MENU*/', data, 1))
PY
