#!/bin/sh
# usage: tools/shot.sh state [out]
cd "$(dirname "$0")/.."
~/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell --headless --disable-gpu --hide-scrollbars --window-size=390,844 --virtual-time-budget=4000 --screenshot="${2:-shot-$1.png}" "file://$PWD/index.html?state=$1" 2>/dev/null
