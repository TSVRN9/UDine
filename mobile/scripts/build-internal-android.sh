#!/usr/bin/env bash
set -euo pipefail

# Builds a side-by-side "UDine (internal)" Android build for testing local/uncommitted
# changes on a real device, without touching whatever's already installed.
#
# Why side-by-side, not an in-place update: a build distributed through the Play Store
# (including the alpha track) gets re-signed by Google's own Play App Signing key before
# it ever reaches a device -- that key never leaves Google's infrastructure, so no build
# produced here can ever share its signature. Android refuses to install a differently-
# signed APK over an existing one, so "update in place" is not achievable this way;
# installing under a separate application id sidesteps the problem entirely instead of
# requiring an uninstall, which would wipe the real app's device-local plate/log/macro
# history (there is no server backup for that data by design).
#
# Local (`eas build --local`), not an EAS cloud build: a cloud build was tried instead for
# a while (avoids competing with whatever else is running on this dev machine for CPU/RAM),
# but it burns real EAS build-minute quota on every single test iteration and depends on
# network + EAS's queue -- for a script meant to be run often while iterating on a change,
# building on this machine with tools already installed here is the better tradeoff. If
# this machine is ever too memory-constrained to run a local Android build (Gradle +
# Kotlin/AAPT2/D8 daemons can be memory-hungry), that's a real constraint to work around
# when it comes up, not a reason to default to the network dependency.
#
# This script temporarily patches app.json (package id, display name, drops
# googleServicesFile -- that file is tied to the real package id and the Google Services
# Gradle plugin hard-fails if it doesn't find a matching client), always restores it on
# exit (including on failure -- see the trap below), and runs `eas build --local` so the
# result is signed with this project's actual managed Android credentials rather than a
# throwaway debug keystore.
#
# Usage:
#   mobile/scripts/build-internal-android.sh              # build only
#   mobile/scripts/build-internal-android.sh --install     # build, then adb install
#
# --install requires exactly one connected device/emulator (`adb devices`); with more
# than one attached, pass ANDROID_SERIAL=<serial> in the environment to disambiguate.

cd "$(dirname "$0")/.."

INTERNAL_PACKAGE="com.udinetogether.udine.internal"
INTERNAL_NAME="UDine (internal)"
# Real disk, not /tmp: local EAS builds copy the whole project + node_modules through
# their working directory, and this repo has hit a tmpfs quota error (`EDQUOT`) on the
# final artifact copy when that output also landed on tmpfs-backed /tmp.
OUT_DIR="$HOME/udine-internal-builds"
OUT="$OUT_DIR/udine-internal.apk"

INSTALL=false
if [[ "${1:-}" == "--install" ]]; then
  INSTALL=true
elif [[ -n "${1:-}" ]]; then
  echo "Unknown argument: $1 (only --install is accepted)" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

# eas-cli-local-build-plugin's OWN working directory -- where it actually copies the whole
# project + node_modules and runs Gradle, far bigger than the final APK above -- defaults to
# `env-paths`'s `temp` dir (`/tmp/$USER/eas-build-local-nodejs/<uuid>`), the exact same
# tmpfs-quota problem as the artifact output, just for more data and hit earlier in the
# build. EAS_LOCAL_BUILD_WORKINGDIR is the plugin's own documented override
# (see eas-cli-local-build-plugin/dist/config.js); the plugin creates and cleans up this
# directory itself, so this only needs to hand it an empty one on real disk.
WORKINGDIR="$(mktemp -d "$OUT_DIR/eas-local-build.XXXXXX")"

BACKUP="$(mktemp)"
cp app.json "$BACKUP"
restore_app_json() {
  cp "$BACKUP" app.json
  rm -f "$BACKUP"
}
trap restore_app_json EXIT

# Stamp the exact source into versionName (`1.0.0+<sha>[.dirty]`) so
# `adb shell dumpsys package $INTERNAL_PACKAGE | grep versionName` answers "which commit is on
# this phone" -- a bug fix was once reported as "no change on device" against an internal build
# that predated the fix by hours, and nothing on the device could show that (#454 follow-up).
GIT_STAMP="$(git rev-parse --short HEAD)$(git status --porcelain --untracked-files=no | grep -q . && echo .dirty || true)"
echo "Building from $GIT_STAMP"

node -e '
  const fs = require("fs");
  const cfg = JSON.parse(fs.readFileSync("app.json", "utf8"));
  cfg.expo.name = "'"$INTERNAL_NAME"'";
  cfg.expo.version = cfg.expo.version + "+'"$GIT_STAMP"'";
  cfg.expo.android.package = "'"$INTERNAL_PACKAGE"'";
  delete cfg.expo.android.googleServicesFile;
  fs.writeFileSync("app.json", JSON.stringify(cfg, null, 2) + "\n");
'

# Force a clean prebuild under the new package id -- android/ is gitignored/generated,
# safe to wipe, and stale native project state from a previous build under the real
# package id would otherwise carry the wrong applicationId forward.
rm -rf android

# pnpm dlx refuses to run eas-cli's native deps' install scripts (dtrace-provider,
# protobufjs) unless explicitly allowed -- --allow-build opts them in for this
# throwaway dlx environment instead of requiring an interactive `pnpm approve-builds`.
JAVA_HOME=/usr/lib/jvm/java-17-temurin-jdk PATH="$JAVA_HOME/bin:$PATH" \
  EAS_LOCAL_BUILD_WORKINGDIR="$WORKINGDIR" \
  pnpm dlx --allow-build=dtrace-provider --allow-build=protobufjs eas-cli \
  build --platform android --profile preview --local --non-interactive --output "$OUT"

echo "Built: $OUT ($INTERNAL_PACKAGE, \"$INTERNAL_NAME\")"

if $INSTALL; then
  if [[ -n "${ANDROID_SERIAL:-}" ]]; then
    adb -s "$ANDROID_SERIAL" install "$OUT"
  else
    DEVICE_COUNT="$(adb devices | grep -c "device$" || true)"
    if [[ "$DEVICE_COUNT" -ne 1 ]]; then
      echo "Expected exactly one connected device/emulator, found $DEVICE_COUNT." >&2
      echo "Set ANDROID_SERIAL=<serial from 'adb devices'> and rerun, or install manually:" >&2
      echo "  adb -s <serial> install \"$OUT\"" >&2
      exit 1
    fi
    adb install "$OUT"
  fi
  echo "Installed \"$INTERNAL_NAME\" -- it sits alongside the real UDine app, own icon and data."
fi
