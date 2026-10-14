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
- **Deleting `/mobile`** comes after both stores ship the Flutter build and a week passes with no data
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
2. **Store builds and the upgrade checks** — release signing, the EAS or Fastlane path for Flutter, the
   Play internal-track check, TestFlight and the tester pass — files: `app/android/`, `app/ios/`, `eas.json`
   or `app/fastlane/` — lanes: flutter, the device checks — blocked by: every other port brief, the
   owner's go-ahead — PR:
3. **Remove RN** — files: `mobile/`, `.github/workflows/ci.yml`, `scripts/pr-gate.sh`, `docs/design/`,
   `CLAUDE.md` — lanes: every remaining lane — blocked by: 2, plus a week in both stores — PR:
