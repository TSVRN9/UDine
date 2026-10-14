#!/bin/bash
# usage: render.sh Name  (renders D1/D1Name.dc.html -> D1/D1Name.png)
cd /tmp/claude-1000/-home-tavern-Projects-js-UDine/3718f897-df0b-46b0-ad79-8b558c257cbe/scratchpad/directions/D1
/home/tavern/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell --headless --disable-gpu --hide-scrollbars --window-size=390,844 --virtual-time-budget=4000 --screenshot=/tmp/claude-1000/-home-tavern-Projects-js-UDine/3718f897-df0b-46b0-ad79-8b558c257cbe/scratchpad/directions/D1/D1$1.png file:///tmp/claude-1000/-home-tavern-Projects-js-UDine/3718f897-df0b-46b0-ad79-8b558c257cbe/scratchpad/directions/D1/D1$1.dc.html 2>&1 | grep -v -e '^$' | tail -2
