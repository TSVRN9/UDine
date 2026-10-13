# udine_bakeoff (Flutter)

The Flutter half of the hall-menu bake-off: M2's core loop (Halls, a hall's menu, the dish sheet, the plate, You) on Android. Spec:
`docs/briefs/hall-menu-bakeoff.md`, plan: `docs/superpowers/plans/2026-10-11-hall-menu-bakeoff.md`.

- `lib/theme/m2_tokens.g.dart` is generated from `tool/m2.json` (RN's `design-tokens/m2.json`) by `dart run tool/gen_tokens.dart`;
  `tool/sync_fixture.sh` refreshes the fixture, the vectors and the tokens from `origin/bakeoff/rn`. `lib/theme/layout.dart` holds the
  layout numbers the JSON does not carry, each named for the M2 rule it is copied from.
- `lib/ui/` is the kit, `lib/screens/` composes it (`test/literals_test.dart` keeps raw values out of both).
- Tests: `flutter test --concurrency=2`. Goldens draw no photos (UMass's are never committed); `BAKEOFF_PHOTO_SHOTS=<dir>` writes the
  same screens with them.

## Phone build (profile, Impeller)

```
cd flutter/udine_bakeoff
flutter build apk --profile --target-platform android-arm64 --dart-define=BAKEOFF_SEED=
adb -s <serial> install -r build/app/outputs/flutter-apk/app-profile.apk
```

Impeller is Flutter's default renderer on Android (3.44); nothing in the manifest turns it off. `--profile` keeps AOT code with the
timeline on, which is what frame timings need (a debug build is not representative). `BAKEOFF_SEED` takes `lib/state/seed.dart`'s query
(for example `plate=W:lunch:beef brisket noodle bowl,golden bbq chicken thigh*2&scores=health,carbon`); leave it empty for a clean start. `--dart-define=BAKEOFF_NET=slow|offline|fail` is M2's `?net=` (menus load in 1.6 s, saved only through tomorrow, or never);
leave it out for the network as it is.
Frame numbers: `adb -s <serial> shell dumpsys gfxinfo com.udinetogether.udine_bakeoff reset`, do the gesture, then
`adb -s <serial> shell dumpsys gfxinfo com.udinetogether.udine_bakeoff framestats`.

## Departures from M2 (and why)

- **Search tab** is a dimmed, inert placeholder (RN has the same): Search has no content in this build. No caption says so.
- **Sheet release** uses `DraggableScrollableSheet`'s own snap (linear at 1600 dp/s, toward the fling's direction) where M2 projects
  the finger's velocity and springs; open and close do run M2's spring. There is no rubber band past the top detent.
- **No favourite star, pin button, custom food, "Full label", "Add something else" or round-10 history:** deferred or out of scope.
- **Where-served** always pushes a hall (M2 scrolls in place when it is the same place and day); the push is one slot.
- **Bold** is Libre Franklin 700, bundled (m2.json has only 400 to 600); it is `bold700`, Flutter-only.
- **Touch targets:** the status line and the ingredients' "Show all" are 44 dp (M2: 42 and 40).
- **Flutter rounds a line to whole dp,** so a label foot is 24 where M2 is 24.2, and ±1 dp of glyph position shows in the goldens.
