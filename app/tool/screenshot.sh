#!/usr/bin/env bash
set -euo pipefail

# Screenshot/recording of the Flutter internal profile build on a device or emulator, with the
# provenance sidecar scripts/pr-gate.sh checks (same keys as mobile/scripts/screenshot.sh).
#
#   app/tool/screenshot.sh <route> [--serial S] [--apk PATH] [--record SECS]
#                          [--swipe X1 Y1 X2 Y2 [MS]] [--out PATH]
#
# <route> is handed to FlutterActivity as the `route` extra (-> PlatformDispatcher.defaultRouteName),
# e.g. /kit or '/hall/franklin?data=recorded&at=2026-10-08T12:41&net=ok'. Recorded data assets ship
# only in the internal flavor, which is the only flavor built here.
#
# Without --apk, builds `flutter build apk --flavor internal --profile`, then stops the Gradle
# daemon BEFORE touching the device: Gradle and an emulator never run together (host memory rule).
# With --record, frames are extracted to ~/.cache/udine-scratch/, never /tmp; a final-frame PNG
# is committed next to the MP4 so the gate has an image to open.
# Until foundation Task 4's same-key internal build lands, a device that already has the RN `.internal` build
# can't take the Flutter one (signature mismatch): use a test emulator without it; never uninstall on the A53 or the owner's Pixel.
# Emulators running the Flutter app must be booted with `-gpu host` (swangle_indirect crashes qemu on Impeller launch).
# Galaxy A53 (R5CT40V5AME): Do Not Disturb is switched on for the capture and off after.

PKG=com.udinetogether.udine.internal
ACT=$PKG/com.udinetogether.udine.MainActivity
ROUTE="${1:?usage: screenshot.sh <route> [flags]}"; shift
SERIAL="${ANDROID_SERIAL:-}"; APK=""; RECORD=""; SWIPE=(); OUT=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --serial) SERIAL="$2"; shift 2 ;;
    --apk) APK="$2"; shift 2 ;;
    --record) RECORD="$2"; shift 2 ;;
    --swipe) SWIPE=("$2" "$3" "$4" "$5"); shift 5; [[ "${1:-}" =~ ^[0-9]+$ ]] && { SWIPE+=("$1"); shift; } ;;
    --out) OUT="$2"; shift 2 ;;
    *) echo "unknown flag $1" >&2; exit 2 ;;
  esac
done

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"
if [[ -z "$SERIAL" ]]; then
  mapfile -t DEVS < <(adb devices | awk 'NR>1 && $2=="device"{print $1}')
  [[ ${#DEVS[@]} -eq 1 ]] || { echo "need --serial (devices: ${DEVS[*]:-none})" >&2; exit 1; }
  SERIAL="${DEVS[0]}"
fi
A=(adb -s "$SERIAL")

if [[ -z "$APK" ]]; then
  (cd app && flutter build apk --flavor internal --profile)
  (cd app/android && ./gradlew --stop)
  APK="$REPO_ROOT/app/build/app/outputs/flutter-apk/app-internal-profile.apk"
fi
[[ -f "$APK" ]] || { echo "no APK at $APK" >&2; exit 1; }

GIT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
SHOT_DIR="$REPO_ROOT/docs/pr-review-media/${GIT_BRANCH//\//-}"
SCRATCH="$HOME/.cache/udine-scratch"; mkdir -p "$SHOT_DIR" "$SCRATCH"
ROUTE_SLUG="$(sed -E 's#^/##; s#[^A-Za-z0-9]+#-#g; s#-+$##' <<<"$ROUTE" | cut -c1-60)"
STEM="$SHOT_DIR/${ROUTE_SLUG:-root}-$SERIAL"
[[ -n "$OUT" ]] && STEM="${OUT%.*}"

dnd=false
[[ "$SERIAL" == R5CT40V5AME ]] && dnd=true
$dnd && "${A[@]}" shell cmd notification set_dnd on
trap '$dnd && "${A[@]}" shell cmd notification set_dnd off || true' EXIT

"${A[@]}" install -r "$APK"
"${A[@]}" shell am force-stop "$PKG"
# Single-quote the route for the device shell, or its `&` splits the command.
"${A[@]}" shell "am start -W -n $ACT --es route '$ROUTE'" | tee "$SCRATCH/am-start.log"
grep -q 'Status: ok' "$SCRATCH/am-start.log" || { echo "launch failed" >&2; exit 1; }
sleep 3   # first frame is drawn once `am start -W` returns; this lets the route settle

if [[ -n "$RECORD" ]]; then
  "${A[@]}" shell "screenrecord --time-limit $RECORD /sdcard/udine-shot.mp4" &
  REC=$!
  sleep 1
  [[ ${#SWIPE[@]} -gt 0 ]] && "${A[@]}" shell input swipe "${SWIPE[@]}"
  wait "$REC" || true
  sleep 1
  "${A[@]}" pull /sdcard/udine-shot.mp4 "$STEM.mp4" >/dev/null
  "${A[@]}" shell rm -f /sdcard/udine-shot.mp4
  FR="$SCRATCH/$(basename "$STEM")-frames"; rm -rf "$FR"; mkdir -p "$FR"
  ffmpeg -loglevel error -i "$STEM.mp4" -vf fps=10 "$FR/frame-%03d.png"
  echo "frames: $FR"
else
  [[ ${#SWIPE[@]} -gt 0 ]] && { "${A[@]}" shell input swipe "${SWIPE[@]}"; sleep 1; }
fi
"${A[@]}" exec-out screencap -p > "$STEM.png"
python3 -I - "$STEM.png" <<'PY'
import sys
d = open(sys.argv[1], "rb").read(8)
sys.exit(0 if d == b"\x89PNG\r\n\x1a\n" else "not a PNG: " + sys.argv[1])
PY

DIRTY=false
[[ -n "$(git status --porcelain -- . ':(exclude)docs/pr-review-media')" ]] && DIRTY=true
DEVICE="$("${A[@]}" shell getprop ro.product.model | tr -d '\r' | tr ' ' '-')"
jq -n --arg sha "$(git rev-parse HEAD)" --arg branch "$GIT_BRANCH" --arg worktree "$REPO_ROOT" \
  --arg route "$ROUTE" --arg device "$DEVICE" --arg stress "" --argjson dirty "$DIRTY" \
  --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  '{sha:$sha, branch:$branch, worktree:$worktree, route:$route, device:$device, stress:$stress, dirty:$dirty, ts:$ts}' \
  > "$STEM.json"
echo "$STEM.png"
