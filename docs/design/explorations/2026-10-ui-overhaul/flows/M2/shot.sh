#!/bin/bash
# usage: shot.sh state [out]
D=$(cd "$(dirname "$0")" && pwd)
/home/tavern/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell --headless --disable-gpu --hide-scrollbars --window-size=390,844 --virtual-time-budget=4000 --screenshot="${2:-$D/tmp-$1.png}" "file://$D/index.html?state=$1" 2>/dev/null
