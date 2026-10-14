# Flutter port (roadmap)

Goal: UDine's mobile app is rebuilt in Flutter on the M2 design and replaces the React Native app in
place, under the same store listing, with every user's device-only history carried over. The bake-off
verdict and the reasons for it are in `docs/decisions-log.md`, "Hall-menu bake-off verdict: Flutter
(2026-10-13)".

This brief is the index. Each child brief below is a ticket; dispatch those, not this one.

## Spec

UI: M2, `docs/design/explorations/2026-10-ui-overhaul/flows/M2/` (lands on `main` in
`flutter-port-foundation` Task 1). `src.html` is the prototype, `CONCEPT.md` the spatial concept and motion
vocabulary, `NOTES.md` the per-round design notes, decisions and open questions, `vectors.json` the
behaviour vectors, and `test.js` the prototype's own checks. Briefs cite M2 by round and section
(`M2 R9 §2` means `CONCEPT.md` "Round 9", section 2; `NOTES.md` "Round 9" records what was built and wins where they differ) plus the `src.html` function or selector. The 65
`docs/design/*.dc.html` artboards describe the RN app and are not the spec for the port.
Annotations: none (M2 has no canvas; its notes are in `NOTES.md`).
States: per child brief.
Routes: per child brief (`app/tool/screenshot.sh`, from `flutter-port-foundation` Task 3).

Backend: none new for the port itself. The app reads the existing `public.dishes` catalog and the
`occupancy_typical` RPC over Supabase REST, and calls UMass endpoints directly, as RN does today.
Residency: unchanged. The device-only tables move from the RN app to the Flutter app in place
(`flutter-port-device-data`).
Rationale: see the decisions-log entry above. Rejected: keeping RN with per-screen performance
workarounds, a NativeWind variant, and a fresh store listing (it would strand every user's device-only
log in the old app).

### Decisions that hold for every child brief

- **Where:** a new Flutter project at `/app` (Dart package `udine`). `/mobile` stays the shipped app,
  frozen to bug fixes, until the release brief deletes it.
- **IDs:** Android `applicationId` and iOS bundle identifier `com.udinetogether.udine`, same as today.
  Internal builds use `com.udinetogether.udine.internal`, named "UDine (internal)", signed with the
  same EAS-managed upload key as RN's internal build, so a Flutter internal build installs over an RN
  internal build. That is how the data carry-over is tested on a device.
- **Code reuse from the bake-off:** copy, never merge. `bakeoff/flutter` is never merged. The kit,
  motion, theme, token generator, `logic/` and test harnesses are copied onto branches off `main`; the
  bake-off's `state/`, shell and fixture loader are not.
- **Packages:** Flutter built-ins first. State is `ChangeNotifier`/`InheritedNotifier`, as in the
  bake-off; navigation is the bake-off's own container-transform and push motion, grown into a real
  stack. No state-management or router package. Add a package only when a brief needs one (`sqflite`,
  `http`, `path_provider`, `url_launcher`; later Health and PDF). Every addition is named in its brief.
- **Tokens:** `design-tokens/m2.json` is the one source. `app/tool/gen_tokens.dart` generates
  `m2_tokens.g.dart`. No colour, size, duration or curve literal outside the generated tokens and
  `app/lib/ui/`; `app/test/literals_test.dart` enforces it.
- **Logic parity:** where the same rule also runs in TypeScript (the edge functions' hand copies of
  foodpro parsing, hours and open status, `matchesQuery` and favourite matching), TS, Deno and Dart
  tests all read the same JSON vectors in `shared/vectors/`.
- **Builds:** internal Android APKs on the owner's phones and the A53 only. No `eas build`/`eas
  submit`, TestFlight or Play track until the new UI is complete; the release brief does that.
- **Verification:** every rendered change ships a device screenshot through the gate, plus goldens and
  M2 DOM measurements (`flutter-port-foundation` Task 3). Motion is checked by frames, not by eye.

### Out of scope

Sign-in, friends, pings, server push, shared stats and server favourite-hall sync (all on
`archive/full-features`); `/web`; press and the newsletter (owner, 2026-10-13: cut); M2's planner tab;
RN's daily ranking allowance, skip and post-log prompt (owner, 2026-10-13: M2's page only).

**Dropped unless the owner says otherwise** (on `main`, in neither M2 nor any answer yet): top-5 foods
on You, weekly averages on the logs screen, and sharing an event's poster.

## Acceptance

- [ ] Every child brief below is done — evidence: each brief's own acceptance
- [ ] An RN store build's user upgrades to the Flutter build with logs, favourites, custom foods,
  rankings and preferences intact — evidence: `flutter-port-device-data` on-device test, then the
  release brief's store-track check
- [ ] `/mobile` is deleted and CLAUDE.md describes the Flutter app — evidence: diff

## Tasks

Order matters where `blocked by` says so; the screen briefs can run in parallel once their blockers
land, one heavy agent at a time (`host-memory-budget`).

1. `flutter-port-foundation` — spec and tokens on `main`, the `/app` project from the bake-off kit, the
   gate and lanes for Dart, internal builds — blocked by: none — PR:
2. `flutter-port-shared-logic` — Dart core logic and cross-language vectors — blocked by: 1 — PR:
3. `flutter-port-device-data` — the device store, opened in place from RN's `udine.db` (owner-gated) —
   blocked by: 1, 2 — PR:
4. `flutter-port-menu-data` — live UMass and Supabase data with on-device cache and network states, plus
   the recorded-data mode screenshots use — blocked by: 2, 3 (Task 1 only; device-data is owner-merged,
   so its Task 1 is on every screen's critical path) — PR:
5. `flutter-port-halls` — shell, Halls tab, cafés page, café page — blocked by: 4 — PR:
6. `flutter-port-hall-menu` — hall menu, schedule, day control, stations, dietary line, busy —
   blocked by: 5 — PR:
7. `flutter-port-dish-and-plate` — dish sheet, full label, plate, Log/Undo, one-off custom food —
   blocked by: 3, 6 — PR:
8. `flutter-port-search` — Search tab and events — blocked by: 6, 7 — PR:
9. `flutter-port-you` — You, past logs, preferences, favourites, "Which was better?", export, first run,
   tracking off — blocked by: 3, 7 — PR:
10. `flutter-port-bowls` — build-your-own bowls (M2 R10 §4) — blocked by: 7, owner's R10 answers — PR:
11. `flutter-port-health` — Health Connect and Apple Health writes (M2 R10 §5) — blocked by: 9 — PR:
12. `m2-round-11` — design round: packaged-food lookup and saved custom foods, favourite alerts, café
    PDF menus (owner, 2026-10-13: design in M2 first) — blocked by: none — PR:
13. Builds of round 11 (approved 2026-10-14, #562): `flutter-port-packaged-foods`, `flutter-port-favorite-alerts`,
    `flutter-port-cafe-pdf`; offline Search is `flutter-port-search` Task 3 — blocked by: 12 — PR:
13b. `m2-round-12` — design round: variant pickers (sizes, milk options; the pho broth pick-one), then its
    Flutter changes in the dish-sheet, plate, bowls and search briefs — blocked by: none — PR:
14. `flutter-port-release` — predictive back, iOS tester pass, store builds, delete `/mobile` — blocked
    by: 1–13 — PR:
