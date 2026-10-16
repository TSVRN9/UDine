#!/usr/bin/env bash
# Builds "UDine (internal)" (com.udinetogether.udine.internal), a profile APK signed with the key in ~/.config/udine/ and named
# <pubspec version>+<commit sha> so a stale install shows in Settings. --install puts it on the attached device ($ANDROID_SERIAL
# when several are attached); --replace uninstalls an internal build signed with another key first, which wipes its data.
set -euo pipefail
cd "$(dirname "$0")/.."
props="$HOME/.config/udine/key.properties"
if [[ ! -f $props ]]; then
  echo "missing $props: make the key with keytool -genkeypair -keystore ~/.config/udine/android-internal.jks -storetype PKCS12 -alias udine-internal -keyalg RSA -keysize 3072 -validity 10000, then write storeFile/storePassword/keyAlias/keyPassword there" >&2
  exit 1
fi
install=0 replace=0
for a in "$@"; do case $a in --install) install=1;; --replace) install=1 replace=1;; *) echo "unknown flag $a" >&2; exit 2;; esac; done
sha="$(git rev-parse --short HEAD)$(git status --porcelain -- . | grep -q . && echo -dirty || true)"
version="$(sed -nE 's/^version: *([^+ ]+).*/\1/p' pubspec.yaml)"
tool/link_photos.sh || echo "building without UMass photos" >&2 # the owner ships them (2026-10-14); never committed
flutter build apk --flavor internal --profile --build-name "$version+$sha"
apk=build/app/outputs/flutter-apk/app-internal-profile.apk
echo "built $apk ($version+$sha)"
(( install )) || exit 0
pkg=com.udinetogether.udine.internal
(( replace )) && adb uninstall "$pkg" >/dev/null 2>&1 || true
if ! out="$(adb install -r "$apk" 2>&1)"; then
  echo "$out" >&2
  grep -q UPDATE_INCOMPATIBLE <<<"$out" && echo "the installed $pkg is signed with another key: rerun with --replace (it wipes that build's data)" >&2
  exit 1
fi
echo "installed $pkg on ${ANDROID_SERIAL:-the attached device}"
