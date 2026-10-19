#!/usr/bin/env bash
set -euo pipefail

# Screenshot/recording of the Flutter internal profile build on a device or emulator, with the
# provenance sidecar scripts/pr-gate.sh checks (same keys as mobile/scripts/screenshot.sh).
#
#   app/tool/screenshot.sh <route> [--serial S] [--apk PATH] [--record SECS]
#                          [--swipe X1 Y1 X2 Y2 [MS]] [--tap X Y]... [--tap-gap SECS] [--then-swipe X1 Y1 X2 Y2 [MS]]
#                          [--settle SECS] [--out PATH] [--with-photos]
#
# --swipe runs before the taps, --then-swipe 1.5 s after them (a back gesture over a page the taps opened; from x=1 with
# gesture navigation on, it is Android's back swipe).
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
# UMass Dining's photos must never reach git (the repo is public, owner rule 2026-10-14), and a capture of the app shows them. So every
# route gets `photos=off` appended (merged into an existing query string) and the capture draws the maroon ground only. `--with-photos`
# keeps them for looking at, and then the output must be under ~/.cache/udine-scratch/ (pass --out): the script refuses it otherwise,
# and in particular with the default docs/pr-review-media output.
# Galaxy A53 (R5CT40V5AME): Do Not Disturb is switched on for the capture and off after.

# The sidecar keeps the capture's own arguments (less --apk/--serial) for app/tool/recapture.sh, and a fingerprint of each pixel
# path this branch changes (scripts/pixel-digest.sh), so the gate can tell a stale capture from a rebased or merged one.
ARGV=()
for ((i = 1; i <= $#; i++)); do
  case "${!i}" in --apk|--serial) ((i++)) ;; *) ARGV+=("${!i}") ;; esac
done
PKG=com.udinetogether.udine.internal
ACT=$PKG/com.udinetogether.udine.MainActivity
ROUTE="${1:?usage: screenshot.sh <route> [flags]}"; shift
SERIAL="${ANDROID_SERIAL:-}"; APK=""; RECORD=""; SWIPE=(); THEN=(); TAPS=(); TAPGAP=0.15; OUT=""; SETTLE=3; PHOTOS=off
while [[ $# -gt 0 ]]; do
  case "$1" in
    --serial) SERIAL="$2"; shift 2 ;;
    --apk) APK="$2"; shift 2 ;;
    --record) RECORD="$2"; shift 2 ;;
    --swipe) SWIPE=("$2" "$3" "$4" "$5"); shift 5; [[ "${1:-}" =~ ^[0-9]+$ ]] && { SWIPE+=("$1"); shift; } ;;
    --then-swipe) THEN=("$2" "$3" "$4" "$5"); shift 5; [[ "${1:-}" =~ ^[0-9]+$ ]] && { THEN+=("$1"); shift; } ;;
    --tap) TAPS+=("$2 $3"); shift 3 ;;
    --tap-gap) TAPGAP="$2"; shift 2 ;;
    --out) OUT="$2"; shift 2 ;;
    --settle) SETTLE="$2"; shift 2 ;;
    --with-photos) PHOTOS=on; shift ;;
    *) echo "unknown flag $1" >&2; exit 2 ;;
  esac
done

[[ "$PHOTOS" == off ]] && { [[ "$ROUTE" == *\?* ]] && ROUTE="$ROUTE&photos=off" || ROUTE="$ROUTE?photos=off"; }
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
if [[ "$PHOTOS" == on ]]; then
  case "$(realpath -m "$STEM")" in
    "$(realpath -m "$SCRATCH")"/*) ;;
    *) echo "--with-photos output must be under $SCRATCH (pass --out there), never docs/pr-review-media: UMass photos are never committed" >&2; exit 2 ;;
  esac
fi

dnd=false
[[ "$SERIAL" == R5CT40V5AME ]] && dnd=true
$dnd && "${A[@]}" shell cmd notification set_dnd on
trap '$dnd && "${A[@]}" shell cmd notification set_dnd off || true' EXIT

"${A[@]}" install -r "$APK"
"${A[@]}" shell am force-stop "$PKG"
# Single-quote the route for the device shell, or its `&` splits the command.
"${A[@]}" shell "am start -W -n $ACT --es route '$ROUTE'" | tee "$SCRATCH/am-start.log"
grep -q 'Status: ok' "$SCRATCH/am-start.log" || { echo "launch failed" >&2; exit 1; }
sleep "$SETTLE"   # first frame is drawn once `am start -W` returns; this lets the route settle (--settle 0 catches a loading state)

if [[ -n "$RECORD" ]]; then
  "${A[@]}" shell "screenrecord --time-limit $RECORD /sdcard/udine-shot.mp4" &
  REC=$!
  sleep 1
  [[ ${#SWIPE[@]} -gt 0 ]] && "${A[@]}" shell input swipe "${SWIPE[@]}"
  for t in "${TAPS[@]}"; do "${A[@]}" shell input tap $t; sleep "$TAPGAP"; done
  [[ ${#THEN[@]} -gt 0 ]] && { sleep 1.5; "${A[@]}" shell input swipe "${THEN[@]}"; }
  wait "$REC" || true
  sleep 1
  "${A[@]}" pull /sdcard/udine-shot.mp4 "$STEM.mp4" >/dev/null
  "${A[@]}" shell rm -f /sdcard/udine-shot.mp4
  FR="$SCRATCH/$(basename "$STEM")-frames"; rm -rf "$FR"; mkdir -p "$FR"
  ffmpeg -loglevel error -i "$STEM.mp4" -vf fps=10 "$FR/frame-%03d.png"
  echo "frames: $FR"
else
  [[ ${#SWIPE[@]} -gt 0 ]] && { "${A[@]}" shell input swipe "${SWIPE[@]}"; sleep 1; }
  for t in "${TAPS[@]}"; do "${A[@]}" shell input tap $t; sleep "$TAPGAP"; done
  [[ ${#TAPS[@]} -gt 0 ]] && sleep 1
  [[ ${#THEN[@]} -gt 0 ]] && { sleep 0.5; "${A[@]}" shell input swipe "${THEN[@]}"; sleep 1; }
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
OWN="$("$REPO_ROOT/scripts/pixel-digest.sh" "$(git merge-base origin/main HEAD)" HEAD | jq -Rn '[inputs | split(" ") | {(.[0]): .[1]}] | add // {}')"
ARGJ="$(jq -cn '$ARGS.positional' --args -- "${ARGV[@]}")"
jq -n --arg sha "$(git rev-parse HEAD)" --arg branch "$GIT_BRANCH" --arg worktree "$REPO_ROOT" \
  --arg route "$ROUTE" --arg device "$DEVICE" --arg stress "" --argjson dirty "$DIRTY" \
  --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --argjson own "$OWN" --argjson argv "$ARGJ" \
  '{sha:$sha, branch:$branch, worktree:$worktree, route:$route, device:$device, stress:$stress, dirty:$dirty, ts:$ts, own:$own, argv:$argv}' \
  > "$STEM.json"
echo "$STEM.png"
