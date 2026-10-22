#!/usr/bin/env bash
# Builds the Play release (com.udinetogether.udine): a store-flavor app bundle signed with Play's upload key, read from
# ~/.config/udine/store-key.properties (storeFile/storePassword/keyAlias/keyPassword; the key itself is EAS's production keystore,
# `eas credentials -p android` in mobile/). Version name and code come from pubspec.yaml: the code must beat every one Play has seen.
set -euo pipefail
cd "$(dirname "$0")/.."
[[ -f $HOME/.config/udine/store-key.properties ]] || { echo "missing ~/.config/udine/store-key.properties: Play would refuse a bundle signed with the debug key" >&2; exit 1; }
tool/link_photos.sh || { echo "no UMass photos to link: the store build ships them (owner, 2026-10-14)" >&2; exit 1; }
# the links only need to last the build: left in place, they break the goldens (which expect the maroon ground) for every later flutter test
trap 'find assets/photos -type l -delete 2>/dev/null || true' EXIT
# Flutter's asset step doesn't notice files newly linked into a declared folder: a tree built without the photos keeps building without them
rm -rf build/app/intermediates/flutter/storeRelease
flutter build appbundle --flavor store --release
aab=build/app/outputs/bundle/storeRelease/app-store-release.aab
keytool -printcert -jarfile "$aab" | grep -m1 'SHA256:'
echo "built $aab ($(sed -nE 's/^version: *(.*)/\1/p' pubspec.yaml))"
