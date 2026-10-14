# Flutter port: release

Goal: the Flutter app replaces the RN app in the Play and App Store listings. Every user updates in
place with their data intact, Android's back gesture tracks the finger, and the RN app is gone from the
repo.

Roadmap and global decisions: `docs/briefs/flutter-port.md`. **This brief is where store builds start.**
Before it, the owner's rule is no `eas build`/`eas submit`, TestFlight or Play track.

## Spec

UI: predictive back on Android 14+. The system back gesture drives the same drag-back each page already
has: container transform, push and sheet. M2's drag-back frames (`compare-dragback.png`,
`compare-edgeswipe.png`) are the target.
Annotations: none.
States: predictive back mid-gesture and released, for a hall page, a pushed page and a sheet.
Routes: `/hall/worcester` and `/you/diet`, with a left-edge back gesture recorded by `--record` on the A53
(gesture navigation on).

Backend: none.
Residency: unchanged. The store upgrade is where `flutter-port-device-data`'s in-place carry-over meets
real users.
Rationale:
- **Predictive back** closes the bake-off departure shared by both stacks: Android gesture navigation
  takes the left 24 dp, so the edge swipe arrived as a plain back with no tracking.
  `android:enableOnBackInvokedCallback` plus Flutter's predictive-back route transitions hand the
  gesture's progress to our own transitions.
- **The store upgrade is checked on the store track, not assumed.** Google re-signs both apps with the
  same Play app-signing key, which is why the same package ID updates in place. The first Play internal
  track build is installed over the current alpha on a test device, with seeded data. Only then does it
  go to the alpha testers.
- **iOS is first seen here.** The iPhone tester runs `docs/agents/ios-checklist.md` on a TestFlight build.
  That build adds the Flutter screens' gestures, the sheet detents, Health, and the
  `Documents/SQLite/udine.db` carry-over from the current TestFlight build.
- **Build path: Expo's EAS with a custom build first, Codemagic as the fallback** (owner, 2026-10-13:
  "see if it's possible to stick with Expo and custom builds"). EAS Build doesn't document Flutter. A
  custom build (`.eas/build/*.yml`, named by a profile's `config` in `eas.json`) can mix arbitrary `run:`
  steps with EAS's own functions, and a fully native, non-RN iOS app has been built this way (Software
  Mansion, `pmleczek/eas-native-ios-app-example`, with a minimal `package.json`, `app.json` holding the
  EAS project id, and a symlinked `ios` directory). The Flutter recipe would be:
  - **Both platforms:** `eas/checkout`, then a `run:` step that installs the pinned Flutter SDK (cached
    with `eas/save_build_cache`/`eas/restore_build_cache`), then `flutter pub get`.
  - **iOS:** `flutter build ios --config-only --release`, then `eas/resolve_apple_team_id_from_credentials`,
    `eas/configure_ios_credentials`, `eas/generate_gymfile_from_template` (scheme `Runner`),
    `eas/run_fastlane` (it expects an `ios/` directory, which a Flutter project already has), and
    `eas/find_and_upload_build_artifacts`.
  - **Android:** `eas/inject_android_credentials` into `android/`, `flutter build appbundle`, and the
    artifact upload.
  - **Submit:** `eas submit --path <file>` uploads a prebuilt binary.

  That keeps EAS-managed signing (the same upload key and Apple credentials RN uses today) and
  `eas submit`. Unproven parts:
  - signing a store build (the published example builds a simulator app without credentials);
  - `eas/configure_ios_credentials` against Flutter's `Runner.xcworkspace`;
  - the time to install Flutter on each build. The owner notes (2026-10-13) that iOS builds are capped by
    count, not billed by the minute, so that time costs wall clock, not quota.

  **Fallback:** Codemagic, whose own docs cover Flutter, signing and both stores, and which has a free
  tier. comes after both stores ship the Flutter build and a week passes with no data
  loss report. Removed with it:
  - `mobile/`;
  - its lanes in `ci.yml`;
  - its parts of `pr-gate.sh`;
  - `docs/design/*.dc.html` and their tooling (the RN artboards);
  - the RN half of `design-tokens` generation.

  CLAUDE.md is rewritten for the Flutter app (owner merges).

## Acceptance

- [ ] Predictive back tracks the finger on the A53 for each state above, and a cancelled gesture returns
  to rest — evidence: screenshot (frame strips)
- [ ] A Play internal-track build installed over the current alpha, with seeded logs, favourites, custom
  foods, rankings and preferences, keeps all of them — evidence: screenshots before and after
- [ ] The iPhone tester passes the iOS checklist on TestFlight, including the data carry-over from the
  current TestFlight build — evidence: tester report
- [ ] versionCode and build number are above every RN build, and the release build is signed by the
  upload key — evidence: `aapt2 dump badging` and the App Store Connect build list
- [ ] `/mobile` and the RN-only tooling are deleted after the waiting week, and CLAUDE.md describes the
  Flutter app — evidence: diff

## Tasks

1. **Predictive back** — files: `app/android/app/src/main/AndroidManifest.xml`, `app/lib/motion/` —
   lanes: flutter, the A53 run — blocked by: halls 1 — PR:
1b. **Build spike, run once the Flutter app is done (owner, 2026-10-13: "Try it out after flutter is
   done"):** an Android custom build with
   `eas build -p android --local` (on this machine, no cloud quota, no store upload), then one iOS cloud
   build for internal distribution (one of the month's free iOS builds). Neither goes to a store track.
   If signing or `configure_ios_credentials` can't be made to work, switch to Codemagic and record why —
   files: `app/eas.json`, `app/.eas/build/*.yml`, `app/package.json`, `app/app.json` — lanes: the builds
   themselves — blocked by: roadmap items 1–13 — PR:
2. **Store builds and the upgrade checks** — release signing on the path the spike chose, the Play
   internal-track check, TestFlight and the tester pass — files: `app/android/`, `app/ios/`, `eas.json`
   or `app/fastlane/` — lanes: flutter, the device checks — blocked by: every other port brief, the
   owner's go-ahead — PR:
3. **Remove RN** — files: `mobile/`, `.github/workflows/ci.yml`, `scripts/pr-gate.sh`, `docs/design/`,
   `CLAUDE.md` — lanes: every remaining lane — blocked by: 2, plus a week in both stores — PR:
