#!/bin/bash
# usage: [WIDTH=360|390] shot.sh state [out]   (390x844 default; WIDTH=360 -> 360x780)
W=${WIDTH:-390}; H=844; [ "$W" = 360 ] && H=780
D=$(cd "$(dirname "$0")" && pwd)
/home/tavern/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell --headless --disable-gpu --hide-scrollbars --window-size=$W,$H --virtual-time-budget=4000 --screenshot="${2:-$D/tmp-$1.png}" "file://$D/index.html?state=$1" 2>/dev/null
