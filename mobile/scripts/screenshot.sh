#!/usr/bin/env bash
set -euo pipefail

# One-command screenshot/recording of the UDine dev client on the emulator pool
# (docs/agents/emulator-pool.md). Handles: device lock, Metro restart (Metro can
# serve a stale graph to an already-bundled route -- see the pool doc's "Metro can
# serve a stale graph" section -- so this always kills and restarts it rather than
# trusting a running one), deep-linking to a route, and capturing a PNG or an MP4
# (+ extracted frames).
#
# Usage:
#   mobile/scripts/screenshot.sh <route> [--device AVD_NAME] [--out PATH]
#     [--record SECONDS] [--record-nav] [--tap X Y] [--swipe X1 Y1 X2 Y2 [MS]]
#     [--longpress X Y MS] [--wait-for TEXT] [--stress NAME]
#
# --wait-for TEXT: after navigating, poll the on-screen UI (via `uiautomator dump`)
#   until TEXT appears, instead of trusting a fixed sleep. A live-data screen (the
#   hall menu hits umassdining.com) can still be showing skeleton placeholder rows
#   after the fixed post-navigation sleep -- every capture in earlier sessions that
#   silently landed on a skeleton or the wrong screen was this. Without --wait-for,
#   the fixed sleeps are unchanged (backward compatible). With it and no match
#   within the timeout (default 45s), this exits non-zero with a clear message --
#   never silently captures a stale frame.
# --stress NAME: dev-only stress-fixture query param, appended to the deep link as
#   `?stress=NAME`. Requires the target route to read it and inject a fixture when
#   __DEV__ (see mobile/src/app/halls/[slug].tsx's stressFixtureItems for the one this
#   repo ships: NAME=long-names adds two synthetic dishes to every meal-period section
#   -- a 60+ char name with all 5 macro badges, and a ~40 char name with 3 -- so a
#   layout claim about a wrapped name / badge count doesn't depend on live menu data
#   happening to contain one today.
# --record-nav: start screenrecord BEFORE the route-navigation deep link fires, instead
#   of after the post-navigation settle. Without it, --record's clip only ever shows the
#   already-settled end state of navigation -- any animation that fires automatically as
#   a side effect of the route mounting (e.g. an auto-opened modal, a keyboard raised by
#   an autoFocus'd input) plays out entirely during the settle wait, before screenrecord
#   is ever invoked, so the clip's first frame already shows the fully-settled state
#   (root-caused via PR #507, where a reviewer proved frame 1 already showed a
#   fully-raised keyboard). Requires --record; incompatible with --wait-for (different
#   purposes -- gating a still capture on readiness vs. capturing a live transition --
#   and combining them risks leaving a device-side recording running past a --wait-for
#   failure exit). Since the recording budget (--record SECONDS) must now cover
#   navigation + settle + animation time instead of N seconds of already-settled screen,
#   size it generously -- 4-6s is a reasonable default; the script warns (does not fail)
#   if it looks too small. Does NOT change the --record + --tap/--swipe case: that
#   gesture still fires after the settle completes, so a --record-nav --tap capture is
#   nav -> auto-animation -> settle -> tap -> close, all in one clip.

APP_ID="com.udinetogether.udine"
JAVA_HOME=/usr/lib/jvm/java-17-temurin-jdk
PATH="$JAVA_HOME/bin:$PATH"

ROUTE=""
DEVICE="Agent_Emulator_Narrow"
OUT=""
RECORD_SECS=""
GESTURE=""       # tap | swipe | longpress
GESTURE_ARGS=()
WAIT_FOR_TEXT=""
WAIT_FOR_TIMEOUT=45
STRESS=""
RECORD_NAV=false

usage() {
  echo "Usage: $0 <route> [--device AVD_NAME] [--out PATH] [--record SECONDS] [--record-nav] [--tap X Y] [--swipe X1 Y1 X2 Y2 [MS]] [--longpress X Y MS] [--wait-for TEXT] [--stress NAME]" >&2
  exit 1
}

if [[ $# -eq 0 ]]; then
  usage
fi
ROUTE="$1"
shift
if [[ "$ROUTE" == --* ]]; then
  echo "First argument must be the route (use '' for home), got: $ROUTE" >&2
  usage
fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    --device)
      DEVICE="$2"; shift 2 ;;
    --out)
      OUT="$2"; shift 2 ;;
    --record)
      RECORD_SECS="$2"; shift 2 ;;
    --tap)
      GESTURE="tap"; GESTURE_ARGS=("$2" "$3"); shift 3 ;;
    --swipe)
      GESTURE="swipe"
      if [[ $# -ge 6 && "$6" != --* ]]; then
        GESTURE_ARGS=("$2" "$3" "$4" "$5" "$6"); shift 6
      else
        GESTURE_ARGS=("$2" "$3" "$4" "$5" "300"); shift 5
      fi
      ;;
    --longpress)
      GESTURE="longpress"; GESTURE_ARGS=("$2" "$3" "$4"); shift 4 ;;
    --wait-for)
      WAIT_FOR_TEXT="$2"; shift 2 ;;
    --stress)
      STRESS="$2"; shift 2 ;;
    --record-nav)
      RECORD_NAV=true; shift 1 ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      ;;
  esac
done

if $RECORD_NAV && [[ -z "$RECORD_SECS" ]]; then
  echo "--record-nav requires --record SECONDS (it only changes when screenrecord starts, so it's a no-op without --record)" >&2
  usage
fi
if $RECORD_NAV && [[ -n "$WAIT_FOR_TEXT" ]]; then
  echo "--record-nav and --wait-for are mutually exclusive -- --wait-for gates a still capture on readiness, --record-nav captures a live transition, and combining them risks leaving a device-side screenrecord running past a --wait-for failure exit" >&2
  usage
fi
if $RECORD_NAV && [[ "$RECORD_SECS" -lt 3 ]]; then
  echo "WARNING: --record-nav with --record $RECORD_SECS -- this budget must now cover navigation + settle + any auto-triggered animation, not just already-settled screen time. Consider 4-6s+ if the clip cuts off before the animation completes." >&2
fi

# AVD name -> serial, lock path, and Metro port (docs/agents/emulator-pool.md's Devices table).
# Metro is otherwise a host-wide singleton on a hardcoded port -- giving each device its own port
# lets concurrent screenshot.sh calls on different devices run without one restarting/killing the
# other's Metro (docs/agents/emulator-pool.md's uiautomator/Metro-singleton section).
case "$DEVICE" in
  Agent_Emulator)
    SERIAL="emulator-5554"; LOCK="/tmp/udine-emulator-lock"; METRO_PORT=8081 ;;
  Agent_Emulator_Narrow)
    SERIAL="emulator-5556"; LOCK="/tmp/udine-emulator-lock-Agent_Emulator_Narrow"; METRO_PORT=8082 ;;
  Agent_Emulator_Wide)
    SERIAL="emulator-5558"; LOCK="/tmp/udine-emulator-lock-Agent_Emulator_Wide"; METRO_PORT=8083 ;;
  *)
    echo "Unknown --device $DEVICE (expected Agent_Emulator, Agent_Emulator_Narrow, or Agent_Emulator_Wide)" >&2
    exit 1
    ;;
esac

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MOBILE_DIR="$REPO_ROOT/mobile"

ROUTE_SLUG="${ROUTE//\//-}"
[[ -z "$ROUTE_SLUG" ]] && ROUTE_SLUG="home"
[[ -n "$STRESS" ]] && ROUTE_SLUG="${ROUTE_SLUG}-stress-${STRESS}"
# Default output lives in the repo, keyed by branch, so scripts/pr-gate.sh finds it and the PR
# carries the evidence. Re-capturing the same route overwrites -- one current image per route.
GIT_BRANCH="$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD)"
SHOT_DIR="$REPO_ROOT/docs/pr-review-media/${GIT_BRANCH//\//-}"
mkdir -p "$SHOT_DIR"
STEM="$SHOT_DIR/${ROUTE_SLUG}-${DEVICE}"
if [[ -z "$OUT" ]]; then
  if [[ -n "$RECORD_SECS" ]]; then
    OUT="$STEM.mp4"
  else
    OUT="$STEM.png"
  fi
else
  STEM="${OUT%.*}"
fi
METRO_LOG="$STEM.metro.log"

# --- 1. Acquire the device lock (mkdir is atomic) ---------------------------------
LOCK_ACQUIRED=false
release_lock() {
  if $LOCK_ACQUIRED; then
    rmdir "$LOCK" 2>/dev/null || true
  fi
}
cleanup() { release_lock; }
trap cleanup EXIT
# timeout(1) sends SIGTERM on expiry, which bash does NOT route through an EXIT-only trap -- a
# caller wrapping this script in `timeout N bash screenshot.sh ...` would otherwise leak the device
# lock forever (docs/agents/emulator-pool.md's timeout/leak section). release_lock is idempotent
# (guarded by LOCK_ACQUIRED, rmdir ... || true), so it's safe if both traps end up firing.
trap 'cleanup; exit 130' INT
trap 'cleanup; exit 143' TERM

WAITED=0
until mkdir "$LOCK" 2>/dev/null; do
  if [[ $WAITED -ge 300 ]]; then
    echo "Timed out after 5m waiting for lock $LOCK ($DEVICE busy)" >&2
    exit 1
  fi
  sleep 10
  WAITED=$((WAITED + 10))
done
LOCK_ACQUIRED=true

# --- 2. Device + dev client present ------------------------------------------------
STATE="$(adb -s "$SERIAL" get-state 2>/dev/null || true)"
if [[ "$STATE" != "device" ]]; then
  echo "Device $DEVICE ($SERIAL) not attached (adb get-state: '$STATE')" >&2
  exit 1
fi

if ! adb -s "$SERIAL" shell pm path "$APP_ID" >/dev/null 2>&1; then
  echo "dev client not installed on $DEVICE -- run \`npx expo run:android --device $DEVICE\` (JDK 17, see CLAUDE.md)" >&2
  exit 1
fi

# --- 3. mobile/.env: required for the client to boot (supabaseUrl is required) -----
if [[ ! -f "$MOBILE_DIR/.env" ]]; then
  MAIN_CHECKOUT="$(git -C "$REPO_ROOT" worktree list | head -1 | awk '{print $1}')"
  if [[ -f "$MAIN_CHECKOUT/mobile/.env" ]]; then
    cp "$MAIN_CHECKOUT/mobile/.env" "$MOBILE_DIR/.env"
  else
    echo "mobile/.env missing here and in the main checkout ($MAIN_CHECKOUT/mobile/.env) -- populate it per docs/agents/emulator-pool.md's 'Working rebuild recipe' section" >&2
    exit 1
  fi
fi

# --- 4. Restart Metro (never reuse a running one -- it can serve a stale graph) ----
# Each device gets its own fixed port (METRO_PORT above), so this only ever kills whatever is
# bound to THIS device's port -- not a sibling agent's Metro on a different device's port. The
# device lock held since step 1 already serializes everything below for this device, Metro
# included, so no separate Metro lock is needed on top of it.
STALE_PID="$(ss -ltnp 2>/dev/null | awk "/:$METRO_PORT /"'{print $0}' | grep -oP 'pid=\K[0-9]+' | head -1 || true)"
if [[ -n "$STALE_PID" ]]; then
  kill "$STALE_PID" 2>/dev/null || true
  sleep 1
fi

(cd "$MOBILE_DIR" && JAVA_HOME="$JAVA_HOME" PATH="$PATH" \
  nohup npx expo start --dev-client --port "$METRO_PORT" >"$METRO_LOG" 2>&1 &)

METRO_WAITED=0
until curl -s "http://localhost:$METRO_PORT/status" 2>/dev/null | grep -q "packager-status:running"; do
  if [[ $METRO_WAITED -ge 90 ]]; then
    echo "Metro did not report packager-status:running within 90s -- see $METRO_LOG" >&2
    exit 1
  fi
  sleep 3
  METRO_WAITED=$((METRO_WAITED + 3))
done
METRO_PID="$(ss -ltnp 2>/dev/null | awk "/:$METRO_PORT /"'{print $0}' | grep -oP 'pid=\K[0-9]+' | head -1 || echo unknown)"

# --- 5. Point the installed debug build at THIS Metro --------------------------------
# This project has no expo-dev-client (Metro itself logs "Ensure that the expo-dev-client
# package is installed"), so the installed app is a plain RN debug build and the
# `udine://expo-development-client/?url=...` deep link the script used to send here had no
# handler at all -- the app launched and fetched its bundle from RN's compiled-in default,
# 10.0.2.2:8081, whatever port this script's Metro was on (docs/agents/emulator-pool.md's
# deep-link section; root-caused 2026-09-14). RN resolves the host in
# PackagerConnectionSettings.kt: in-memory override (what the dev menu's "Change Bundle
# Location" sets -- lost on force-stop), then the `debug_http_host` default SharedPreference,
# then the 10.0.2.2:<react_native_dev_server_port> default. The preference is the only
# durable, externally-settable one, so write it (build is debuggable => `run-as` works) while
# the app is stopped, then launch MainActivity directly.
adb -s "$SERIAL" shell am force-stop "$APP_ID"
PREFS_FILE="shared_prefs/${APP_ID}_preferences.xml"   # run-as cwd is the app's data dir
PREFS_XML="$(adb -s "$SERIAL" shell run-as "$APP_ID" cat "$PREFS_FILE" 2>/dev/null | tr -d '\r' || true)"
[[ -z "$PREFS_XML" ]] && PREFS_XML=$'<?xml version=\'1.0\' encoding=\'utf-8\' standalone=\'yes\' ?>\n<map>\n</map>'
PREFS_TMP="$(mktemp)"
grep -v 'name="debug_http_host"' <<<"$PREFS_XML" \
  | sed "s|</map>|    <string name=\"debug_http_host\">10.0.2.2:$METRO_PORT</string>\n</map>|" >"$PREFS_TMP"
adb -s "$SERIAL" push "$PREFS_TMP" /data/local/tmp/udine-prefs.xml >/dev/null 2>&1
rm -f "$PREFS_TMP"
# SharedPreferencesImpl restores a leftover .bak over the main file on load, so drop it too.
# (`adb shell` joins its args and the device shell re-parses them, hence the nested quoting.)
if ! adb -s "$SERIAL" shell "run-as $APP_ID sh -c 'mkdir -p shared_prefs && rm -f $PREFS_FILE.bak && cp /data/local/tmp/udine-prefs.xml $PREFS_FILE'"; then
  echo "Could not write debug_http_host into $APP_ID's SharedPreferences via run-as on $DEVICE (installed build not debuggable?) -- set it by hand via the dev menu's Change Bundle Location (docs/agents/emulator-pool.md)" >&2
  exit 1
fi
adb -s "$SERIAL" shell am start -n "$APP_ID/.MainActivity" >/dev/null

# Only a "Bundled" line in THIS run's Metro log proves the device fetched its JS from THIS
# port. The old MainActivity-resumed shortcut was a false positive: an app serving another
# port's bundle is resumed just the same (every 2026-09-14 capture before this fix had a
# 600-byte Metro log with no Bundled line and 8081 sockets on the device).
BUNDLE_WAITED=0
until grep -qE "(Android Bundled|Bundled)" "$METRO_LOG" 2>/dev/null; do
  if [[ $BUNDLE_WAITED -ge 120 ]]; then
    echo "No Bundled line in $METRO_LOG within 120s -- the device never fetched a bundle from port $METRO_PORT. Check which port it is actually on: adb -s $SERIAL shell netstat -tn | grep 10.0.2.2" >&2
    exit 1
  fi
  sleep 3
  BUNDLE_WAITED=$((BUNDLE_WAITED + 3))
done
# wait_for_text: polls the live UI (not a screenshot -- `uiautomator dump`'s XML, which embeds
# every visible string as a text="..." attribute) until TEXT appears, or exits loudly on timeout.
# Used instead of a fixed sleep wherever the caller knows a string that only appears once real
# content has rendered (a section header, a specific dish name, a state label) -- a fixed sleep
# can't tell a live-data fetch (e.g. umassdining.com) apart from an instant one, so it either wastes
# time or, worse, captures the skeleton/loading state and nobody notices until a human looks.
# Investigated 2026-09-12 (docs/agents/emulator-pool.md's "uiautomator dump sees no RN content"
# section): live-verified on both Narrow and Wide, cold-launch (full Metro restart + dev-client
# relaunch) included, that the accessibility tree IS populated correctly on a real hall-menu route
# -- 241 nodes including the target text, MealTabPager.tsx's importantForAccessibility="auto" on
# the active pane confirmed correct by its own test suite. Couldn't reproduce the doc's "6 nodes,
# none with any text" -- not an app bug to fix here, so this only makes the poll loop diagnose that
# class of platform flakiness (uiautomator/accessibility-service slow to bind after a fresh launch)
# instead of reporting the same generic message as a genuinely-wrong-screen timeout.
# An empty TEXT waits for any populated tree (>= MIN_POPULATED_NODES nodes) -- i.e. "something
# has mounted", used right after bundling before navigating. The budget is wall-clock, not a
# count of sleeps: one `uiautomator dump` blocks ~10s on a screen that never goes idle.
MIN_POPULATED_NODES=15
wait_for_text() {
  local text="$1"
  local timeout="$2"
  local deadline=$(( $(date +%s) + timeout ))
  local dump=""
  local nodes=0
  local max_nodes=0
  while (( $(date +%s) < deadline )); do
    # rm first: on a screen that never goes idle (a looping skeleton shimmer) `uiautomator dump`
    # prints "ERROR: could not get idle state.", writes nothing, and still exits 0 -- so without
    # the rm this would cat the PREVIOUS run's dump and match its text (seen live 2026-09-14).
    dump="$(adb -s "$SERIAL" shell "rm -f /sdcard/udine-wait-dump.xml; uiautomator dump /sdcard/udine-wait-dump.xml" 2>/dev/null >/dev/null; adb -s "$SERIAL" exec-out cat /sdcard/udine-wait-dump.xml 2>/dev/null || true)"
    if [[ -n "$text" && "$dump" == *"$text"* ]]; then
      return 0
    fi
    nodes="$(grep -o "<node" <<<"$dump" | wc -l)"
    [[ $nodes -gt $max_nodes ]] && max_nodes=$nodes
    if [[ -z "$text" && $nodes -ge $MIN_POPULATED_NODES ]]; then
      return 0
    fi
    sleep 2
  done
  if [[ $max_nodes -lt $MIN_POPULATED_NODES ]]; then
    echo "uiautomator never exposed a populated accessibility tree on $DEVICE in ${timeout}s (max $max_nodes nodes seen -- a correctly-rendered screen measures well above $MIN_POPULATED_NODES even when sparse, e.g. 26 on an empty-state screen, 241+ on a content-heavy one) -- this matches known uiautomator/accessibility-service rebind flakiness (docs/agents/emulator-pool.md), not necessarily a stale or wrong screen. Retry, or capture with a fixed sleep and confirm the PNG by eye instead of trusting this timeout as proof the screen didn't load." >&2
  fi
  return 1
}

# "Bundled" only proves Metro handed the JS bundle to the app. On this host the JS runtime
# then takes 20-30s to boot and mount anything (live-measured 2026-09-14 on Narrow: black
# frame until ~33s after launch) -- the fixed 4s sleep that used to be here captured that
# black frame whenever no --wait-for followed. Wait for a populated tree instead.
if ! wait_for_text "" 90; then
  echo "WARNING: no populated accessibility tree on $DEVICE within 90s of bundling -- capturing anyway; check the PNG for a black/blank frame" >&2
fi

# start_record: backgrounds screenrecord and stashes its PID in RECORD_PID. Extracted so
# --record-nav can call it before route navigation (to capture the deep link firing and any
# animation the route auto-triggers on mount), while the default (--record-nav not set) path
# still calls it after the post-navigation settle, unchanged from before this flag existed.
start_record() {
  adb -s "$SERIAL" shell "screenrecord --time-limit $RECORD_SECS /sdcard/udine-rec.mp4" &
  RECORD_PID=$!
}

# --- 6. Navigate to the route --------------------------------------------------------
if [[ -n "$ROUTE" ]]; then
  DEEP_LINK="udine://$ROUTE"
  if [[ -n "$STRESS" ]]; then
    if [[ "$DEEP_LINK" == *"?"* ]]; then
      DEEP_LINK="${DEEP_LINK}&stress=$STRESS"
    else
      DEEP_LINK="${DEEP_LINK}?stress=$STRESS"
    fi
  fi
  if $RECORD_NAV; then
    start_record
    sleep 0.3   # let screenrecord actually start capturing before the nav intent fires
  fi
  # Single quoted string, not separate argv words (same pattern as start_record's screenrecord
  # call above) -- `adb shell` with multiple argv re-tokenizes them through the DEVICE's own
  # shell, which splits an unescaped `&` as a job-control operator: every query param after the
  # first was silently getting dropped (confirmed live: title arrived, featuredImage/
  # pamphletImage/expirationDate/isFeatured -- everything after the first `&` -- did not) for any
  # route with more than one `&`-joined param, e.g. event-detail's 5-param deep link. A single
  # quoted string keeps `$DEEP_LINK`'s `&`s inside the argument adb forwards, not split by the
  # remote shell.
  adb -s "$SERIAL" shell "am start -a android.intent.action.VIEW -d '$DEEP_LINK'" >/dev/null
  if [[ -n "$WAIT_FOR_TEXT" ]]; then
    sleep 1  # let navigation actually start before the first dump
    if ! wait_for_text "$WAIT_FOR_TEXT" "$WAIT_FOR_TIMEOUT"; then
      echo "Timed out after ${WAIT_FOR_TIMEOUT}s waiting for \"$WAIT_FOR_TEXT\" to appear on $DEVICE -- the screen is likely still loading or on the wrong route. Not capturing a stale frame." >&2
      exit 1
    fi
  else
    sleep 4
  fi
fi

fire_gesture() {
  case "$GESTURE" in
    tap)
      adb -s "$SERIAL" shell input tap "${GESTURE_ARGS[0]}" "${GESTURE_ARGS[1]}" ;;
    swipe)
      adb -s "$SERIAL" shell input swipe "${GESTURE_ARGS[0]}" "${GESTURE_ARGS[1]}" "${GESTURE_ARGS[2]}" "${GESTURE_ARGS[3]}" "${GESTURE_ARGS[4]}" ;;
    longpress)
      adb -s "$SERIAL" shell input swipe "${GESTURE_ARGS[0]}" "${GESTURE_ARGS[1]}" "${GESTURE_ARGS[0]}" "${GESTURE_ARGS[1]}" "${GESTURE_ARGS[2]}" ;;
  esac
}

# --- 7. Capture -----------------------------------------------------------------------
if [[ -n "$RECORD_SECS" ]]; then
  if [[ -z "${RECORD_PID:-}" ]]; then
    start_record
  fi
  if [[ -n "$GESTURE" ]]; then
    sleep 0.3
    fire_gesture
  fi
  wait "$RECORD_PID"
  adb -s "$SERIAL" pull /sdcard/udine-rec.mp4 "$OUT" >/dev/null
  adb -s "$SERIAL" shell rm /sdcard/udine-rec.mp4

  FRAMES_DIR="$STEM-frames"
  # rm before mkdir: ffmpeg only overwrites frame numbers it re-produces, so a shorter/failed
  # re-run silently left stale higher-numbered frames from a longer older run in place, with no
  # error -- found live 2026-09-14 (PR #475's screenshot capture, confirmed via frame mtimes an
  # hour apart).
  rm -rf "$FRAMES_DIR"
  mkdir -p "$FRAMES_DIR"
  ffmpeg -y -i "$OUT" -vf fps=10 "$FRAMES_DIR/frame-%03d.png" >/dev/null 2>&1
else
  if [[ -n "$GESTURE" ]]; then
    fire_gesture
    sleep 0.7
  fi
  adb -s "$SERIAL" exec-out screencap -p > "$OUT"
fi

# --- 8. Validate the PNG (magic bytes + IHDR dimensions) ------------------------------
validate_png() {
  python3 - "$1" <<'PYEOF'
import struct, sys
path = sys.argv[1]
with open(path, "rb") as f:
    data = f.read(33)
if data[:8] != b"\x89PNG\r\n\x1a\n":
    print(f"Not a valid PNG (bad magic bytes): {path}", file=sys.stderr)
    sys.exit(1)
w, h = struct.unpack(">II", data[16:24])
print(f"{w}x{h}")
PYEOF
}

# --- 9. Provenance sidecar: which commit this image shows. scripts/pr-gate.sh refuses a PR whose
# screenshot predates its code, or was taken over uncommitted changes (both have shipped bugs).
DIRTY=false
[[ -n "$(git -C "$REPO_ROOT" status --porcelain -- . ':(exclude)docs/pr-review-media' 2>/dev/null)" ]] && DIRTY=true
jq -n --arg sha "$(git -C "$REPO_ROOT" rev-parse HEAD)" --arg branch "$GIT_BRANCH" --arg worktree "$REPO_ROOT" \
  --arg route "$ROUTE" --arg device "$DEVICE" --arg stress "$STRESS" --argjson dirty "$DIRTY" \
  --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  '{sha:$sha, branch:$branch, worktree:$worktree, route:$route, device:$device, stress:$stress, dirty:$dirty, ts:$ts}' \
  > "$STEM.json"

if [[ -n "$RECORD_SECS" ]]; then
  FIRST_FRAME="$(ls "$FRAMES_DIR"/frame-*.png 2>/dev/null | head -1 || true)"
  if [[ -z "$FIRST_FRAME" ]]; then
    echo "No frames extracted from $OUT" >&2
    exit 1
  fi
  validate_png "$FIRST_FRAME"
  echo "Metro PID: $METRO_PID"
  echo "$OUT"
  echo "$FRAMES_DIR"
else
  validate_png "$OUT"
  echo "Metro PID: $METRO_PID"
  echo "$OUT"
fi
