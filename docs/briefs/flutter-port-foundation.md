# Flutter port: foundation

Goal: `main` holds the M2 spec, one token source, and a Flutter project at `/app` built from the
bake-off's kit, motion and theme. The gate, CI lanes and agent docs check Dart PRs as strictly as they
check RN PRs today, and an internal Flutter build installs on a phone over the RN internal build. No
user-visible screen yet; every later port brief builds on this.

Roadmap and global decisions: `docs/briefs/flutter-port.md`.

## Spec

UI: none new. The kit is the bake-off's, already measured against M2.
Annotations: none.
States: n/a. Task 2's only rendered output is a kit gallery route, used to prove the screenshot path.
Routes: `app/tool/screenshot.sh /kit` (Task 3).

Backend: none.
Residency: none.
Rationale:
- **Copy, don't merge.** `bakeoff/flutter` is a throwaway that must never merge (it carries a fixture
  loader, a one-slot push controller, a `shared_preferences` store and a `WidgetsApp` shell that the real
  app replaces). The reusable parts are copied onto a branch off `main` with their tests, so review sees
  only what stays.
- **The spec moves into the repo.** M2 currently lives only on the local
  `design/ui-overhaul-explorations` branch and in scratch. A dispatched agent in a fresh worktree off
  `main` can't see it, and `design-tokens/m2.json` exists only on `bakeoff/rn`.
- **The gate is re-pointed, not loosened.** `scripts/pr-gate.sh` keys its rendered-output, screenshot and
  motion-literal checks on `mobile/src/**/*.tsx`. Unchanged, a Dart PR would pass it with no screenshot.
- Rejected: a Melos monorepo or a Dart workspace for `/shared`. There's one Dart package; the
  cross-language contract is JSON vectors (`flutter-port-shared-logic`), not a shared build.

## Acceptance

- [ ] `main` has `docs/design/explorations/2026-10-ui-overhaul/` (M2 with its vectors, notes and
  tests; photos stay gitignored), the bake-off decisions-log entry and plan, `design-tokens/m2.json`,
  and the port briefs — evidence: diff
- [ ] `cd app && flutter analyze && flutter test` passes; the tests include the bake-off's literals test,
  the tokens-currency test (generated file not stale against `design-tokens/m2.json`), the M2 DOM
  measurements (`m2_measure_test.dart`) for the kit parts they cover, and the kit's goldens at 360 and 390 dp — evidence: test
- [ ] `scripts/pr-gate.sh` fails a branch that changes a non-test `.dart` file under `app/lib/` without a
  screenshot, and fails a `Duration(`/`Curves.`/`Cubic(`/raw `Color(0x` literal outside the generated
  tokens and `app/lib/ui/` — evidence: gate output on two throwaway commits (one per rule), each FAIL
  pasted in the PR body as the red
- [ ] `app/tool/screenshot.sh /kit` writes a PNG and a sidecar in the format `pr-gate.sh` already checks
  (sha, dirty flag) — evidence: screenshot
- [ ] `app/tool/build-internal-android.sh --install` installs "UDine (internal)" over the RN internal
  build on the A53 without uninstalling — evidence: `adb shell dumpsys package
  com.udinetogether.udine.internal` shows the Flutter build's versionName, and the RN build's data
  directory is still there (`flutter-port-device-data` reads it)

## Tasks

1. **Land the spec on `main`** (docs only):
   - from `origin/main`, take these paths from `design/ui-overhaul-explorations`:
     `docs/design/explorations/2026-10-ui-overhaul/`, the `.gitignore` photo rule,
     `docs/superpowers/plans/2026-10-11-hall-menu-bakeoff.md`, `docs/briefs/flutter-port*.md`,
     `docs/briefs/m2-round-11.md`, `docs/briefs/hall-menu-bakeoff.md`, and the decisions-log entries for the
     verdict;
   - take `design-tokens/m2.json` from `bakeoff/rn`;
   - do **not** take the design branch's `CLAUDE.md`, `supabase/` or `docs/briefs/hall-occupancy-history.md`
     (they're older than `main`'s);
   - the owner pushes the branch (agents can't push new branches).
   - files: the paths above — lanes: none (docs) — blocked by: none — PR:
2. **`/app` scaffold from the bake-off kit:**
   - `flutter create --org com.udinetogether --project-name udine app`, then set the Android
     `applicationId` and iOS bundle id to `com.udinetogether.udine`, add an `internal` product flavor
     (`applicationIdSuffix ".internal"`, label "UDine (internal)"), version `2.0.0+6` (above RN's
     versionCode 5 and iOS build 4);
   - copy from `.claude/worktrees/bakeoff-flutter/flutter/udine_bakeoff` (branch `bakeoff/flutter`):
     `lib/theme/`, `lib/ui/`, `lib/motion/`, `tool/gen_tokens.dart` (reading `design-tokens/m2.json` at the
     repo root, not a snapshot), `tool/gen_letters.py`, fonts, `analysis_options.yaml`, and their tests:
     `literals_test.dart`, `tokens_currency_test.dart`, `m2_measure_test.dart` with `m2_dom.json`, `ui/`,
     `motion/`, `theme/` and the kit goldens;
   - regenerate tokens from the current `m2.json`; the bake-off snapshot is stale (missing `font.bodyB`,
     `size.glyph`, `markGlyph` and about nine more);
   - not copied: `state/`, `main.dart`'s shell, the fixture loader, `logic/` (that's
     `flutter-port-shared-logic`), `screens/`;
   - a debug-only `/kit` route that shows every kit widget, for the screenshot path;
   - `ponytail`: no package beyond what the copied code imports.
   - files: `app/**`, `design-tokens/` — lanes: flutter (`cd app && flutter analyze && flutter test`) —
     blocked by: 1 — PR:
3. **Gate, lanes and agent docs for Dart:**
   - `app/tool/screenshot.sh <route> [--record N] [--swipe x1 y1 x2 y2] [--serial S]`: launches the
     profile build with `adb shell am start -n com.udinetogether.udine.internal/.MainActivity --es route
     <route>` (Flutter's `FlutterActivity` reads the `route` extra into
     `PlatformDispatcher.defaultRouteName`), captures `screencap`/`screenrecord`, and writes
     `docs/pr-review-media/<branch>/` PNG/MP4 plus a sidecar JSON with the same keys `pr-gate.sh` checks
     today; frame dumps go to `~/.cache/udine-scratch/`, never `/tmp`;
   - `scripts/pr-gate.sh`: rendered output = non-test `.dart` under `app/lib/`; motion/colour literal
     check outside `app/lib/theme/m2_tokens.g.dart` and `app/lib/ui/`; owner-gated paths gain
     `app/lib/core/store/` (device data);
   - `.github/workflows/ci.yml` header: a `flutter` lane (`cd app && flutter analyze && flutter test`) and
     a job for `gh act`;
   - `.claude/agents/pr-reviewer.md` §4 and `issue-solver.md` §2–3: the parity source for `app/` is M2
     (`m2_dom.json` measurements, goldens, device screenshot against M2's own shot at the same width),
     not the `.dc.html` artboards; Flutter test commands; one heavy job at a time (Gradle, emulator,
     Playwright);
   - `docs/briefs/TEMPLATE.md` and `.github/PULL_REQUEST_TEMPLATE.md`: `UI:`/`Artboard:` accept an M2
     citation (`M2 R<n> §<k>`, `src.html` function);
   - `CLAUDE.md` (propose; owner merges): Layout gains `/app`; Commands gains the flutter lane and
     internal build; Design points at M2 for `app/`; Product scope drops "Newsletter/press/events stay"
     for "events stay; press and newsletter cut (2026-10-13)".
   - files: `scripts/pr-gate.sh`, `app/tool/screenshot.sh`, `.github/workflows/ci.yml`,
     `.claude/agents/*.md`, `docs/briefs/TEMPLATE.md`, `.github/PULL_REQUEST_TEMPLATE.md`, `CLAUDE.md` —
     lanes: flutter, `pr-gate.sh` on the throwaway commits — blocked by: 2 — PR:
4. **Internal Android build:**
   - `app/tool/build-internal-android.sh [--install]`: `flutter build apk --flavor internal --profile`
     (release once `flutter-port-release` lands), signed with the EAS-managed upload keystore that
     `mobile/scripts/build-internal-android.sh` uses, so it installs over the RN internal build;
   - **owner action:** fetch the keystore with `eas credentials -p android` into
     `~/.config/udine/android-upload.jks` plus a `key.properties` outside the repo; the script reads that
     path and fails with that instruction if it's missing;
   - versionName carries the commit sha, as RN's does (`1.0.0+<sha>` became the stale-build guard on
     2026-09-13).
   - files: `app/tool/build-internal-android.sh`, `app/android/app/build.gradle*` — lanes: flutter, the
     A53 install — blocked by: 2 — PR:
