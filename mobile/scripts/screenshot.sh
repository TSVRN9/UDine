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
#     [--record SECONDS] [--tap X Y] [--swipe X1 Y1 X2 Y2 [MS]] [--longpress X Y MS]
#     [--wait-for TEXT] [--stress NAME]
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
#   __DEV__ (see mobile/src/app/halls/[slug].tsx's STRESS_FIXTURE for the one this
#   repo ships: NAME=long-names adds one synthetic 60+ char dish name with all 5
#   macro badges to every meal-period section, so a layout claim about a wrapped
#   name / max badge count doesn't depend on live menu data happening to contain
#   one today.

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

usage() {
  echo "Usage: $0 <route> [--device AVD_NAME] [--out PATH] [--record SECONDS] [--tap X Y] [--swipe X1 Y1 X2 Y2 [MS]] [--longpress X Y MS] [--wait-for TEXT] [--stress NAME]" >&2
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
    *)
      echo "Unknown argument: $1" >&2
      usage
      ;;
  esac
done

# AVD name -> serial and lock path (docs/agents/emulator-pool.md's Devices table).
case "$DEVICE" in
  Agent_Emulator)
    SERIAL="emulator-5554"; LOCK="/tmp/udine-emulator-lock" ;;
  Agent_Emulator_Narrow)
    SERIAL="emulator-5556"; LOCK="/tmp/udine-emulator-lock-Agent_Emulator_Narrow" ;;
  Agent_Emulator_Wide)
    SERIAL="emulator-5558"; LOCK="/tmp/udine-emulator-lock-Agent_Emulator_Wide" ;;
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
TS="$(date -u +%Y%m%dT%H%M%SZ)"
SHOT_DIR="${CLAUDE_JOB_DIR:-/tmp}/tmp/shots"
mkdir -p "$SHOT_DIR"
STEM="$SHOT_DIR/${ROUTE_SLUG}-${DEVICE}-${TS}"
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
trap release_lock EXIT

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
# ponytail: host-global kill -- on a host running two of these concurrently, this can kill a
# sibling agent's in-flight capture. One Metro per host is already this pool's real constraint
# (see docs/agents/emulator-pool.md's Gradle/RAM section), so it's not fixed here; if concurrent
# screenshot.sh calls become common, give Metro its own per-device lock the way the emulator has.
pkill -f "expo start" 2>/dev/null || true
STALE_PID="$(ss -ltnp 2>/dev/null | awk '/:8081 /{print $0}' | grep -oP 'pid=\K[0-9]+' | head -1 || true)"
if [[ -n "$STALE_PID" ]]; then
  kill "$STALE_PID" 2>/dev/null || true
fi
sleep 1

(cd "$MOBILE_DIR" && JAVA_HOME="$JAVA_HOME" PATH="$PATH" \
  nohup npx expo start --dev-client --port 8081 >"$METRO_LOG" 2>&1 &)

METRO_WAITED=0
until curl -s "http://localhost:8081/status" 2>/dev/null | grep -q "packager-status:running"; do
  if [[ $METRO_WAITED -ge 90 ]]; then
    echo "Metro did not report packager-status:running within 90s -- see $METRO_LOG" >&2
    exit 1
  fi
  sleep 3
  METRO_WAITED=$((METRO_WAITED + 3))
done
METRO_PID="$(ss -ltnp 2>/dev/null | awk '/:8081 /{print $0}' | grep -oP 'pid=\K[0-9]+' | head -1 || echo unknown)"

# --- 5. Point the installed dev client at Metro -------------------------------------
adb -s "$SERIAL" shell am force-stop "$APP_ID"
# 10.0.2.2 is the emulator's built-in alias for the host's loopback interface --
# unlike the pool doc's LAN/bridge IP example, this works from inside any emulator
# on this host without needing to look up a host-specific address.
adb -s "$SERIAL" shell am start -a android.intent.action.VIEW \
  -d "udine://expo-development-client/?url=http%3A%2F%2F10.0.2.2%3A8081" >/dev/null

BUNDLE_WAITED=0
BUNDLED=false
while [[ $BUNDLE_WAITED -lt 120 ]]; do
  if grep -qE "(Android Bundled|Bundled)" "$METRO_LOG" 2>/dev/null; then
    BUNDLED=true
    break
  fi
  TOP="$(adb -s "$SERIAL" shell dumpsys activity activities 2>/dev/null | grep topResumedActivity || true)"
  if echo "$TOP" | grep -q "$APP_ID/.MainActivity"; then
    BUNDLED=true
    break
  fi
  sleep 3
  BUNDLE_WAITED=$((BUNDLE_WAITED + 3))
done
if ! $BUNDLED; then
  echo "Dev client never reached a bundled MainActivity within 120s -- see $METRO_LOG" >&2
  exit 1
fi
# "Bundled"/MainActivity-resumed only proves Metro handed the JS bundle to the
# app -- a cold RN boot still has to init the JS runtime and, for a real screen,
# fetch its data (e.g. the hall menu hits umassdining.com) before anything but a
# black frame is on screen. Give it room before navigating further.
sleep 4

# wait_for_text: polls the live UI (not a screenshot -- `uiautomator dump`'s XML, which embeds
# every visible string as a text="..." attribute) until TEXT appears, or exits loudly on timeout.
# Used instead of a fixed sleep wherever the caller knows a string that only appears once real
# content has rendered (a section header, a specific dish name, a state label) -- a fixed sleep
# can't tell a live-data fetch (e.g. umassdining.com) apart from an instant one, so it either wastes
# time or, worse, captures the skeleton/loading state and nobody notices until a human looks.
wait_for_text() {
  local text="$1"
  local timeout="$2"
  local waited=0
  local dump=""
  while [[ $waited -lt $timeout ]]; do
    dump="$(adb -s "$SERIAL" shell uiautomator dump /sdcard/udine-wait-dump.xml 2>/dev/null && adb -s "$SERIAL" exec-out cat /sdcard/udine-wait-dump.xml 2>/dev/null || true)"
    if [[ "$dump" == *"$text"* ]]; then
      return 0
    fi
    sleep 2
    waited=$((waited + 2))
  done
  return 1
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
  adb -s "$SERIAL" shell am start -a android.intent.action.VIEW -d "$DEEP_LINK" >/dev/null
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
  adb -s "$SERIAL" shell "screenrecord --time-limit $RECORD_SECS /sdcard/udine-rec.mp4" &
  RECORD_PID=$!
  if [[ -n "$GESTURE" ]]; then
    sleep 0.3
    fire_gesture
  fi
  wait "$RECORD_PID"
  adb -s "$SERIAL" pull /sdcard/udine-rec.mp4 "$OUT" >/dev/null
  adb -s "$SERIAL" shell rm /sdcard/udine-rec.mp4

  FRAMES_DIR="$STEM-frames"
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
