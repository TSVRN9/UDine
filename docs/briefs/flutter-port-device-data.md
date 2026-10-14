# Flutter port: device data, carried over in place

Goal: when a user's RN app updates to the Flutter app, everything they've logged, favourited, saved,
ranked or set is still there, because the Flutter app opens the same SQLite file in place. The Flutter
app gets one store API over it for every later screen.

Roadmap and global decisions: `docs/briefs/flutter-port.md`. **Owner-merged** (residency: this is the
only copy of each user's health data).

## Spec

UI: none, apart from a debug-only `/debug/store` route (not in release builds) that lists each user table's
row count and newest rows, for the on-device evidence.
Annotations: none.
States: `/debug/store` on a fresh install (all zero), and after the upgrade from a seeded RN install.
Routes: `app/tool/screenshot.sh /debug/store`.

Backend: none.
Residency: "Consumption log, macro history, daily totals: Device only" and "Dish ranking: Device only,
always". Unchanged, and the point of the brief: the data never leaves the device on the way across.

**What RN stores today** (`mobile/src/lib/db.ts` and the storage modules it names):
- File `udine.db`, opened by expo-sqlite with its defaults: Android `<filesDir>/SQLite/udine.db`, iOS
  `Documents/SQLite/udine.db`, possibly with `-wal`/`-shm` beside it. No `user_version`, no migrations;
  every table is `CREATE TABLE IF NOT EXISTS`.
- **User data (can't be recovered if lost):**
  - `log_entries(id TEXT PK, logged_at TEXT, source_json TEXT, servings REAL, nutrition_json TEXT)`;
    `source_json` is the `LogEntry` source union keyed by `type`: `umass-menu | off | usda | custom`;
  - `favorites(key TEXT PK, favorite_json TEXT)`, key `dish:<name>` or `location:<tid>`;
  - `custom_foods(id TEXT PK, food_json TEXT)`;
  - `preferences_kv` keys `food_preferences`, `ranked_dishes`, `ranked_foods`, `seen_dishes`,
    `compare_daily_allowance`.
- **Cache (safe to rebuild):** `food_sighting_dedup`; `preferences_kv` keys `menu_cache:<tid>|<date>`,
  `hours_cache:v1`, `dish_catalog:v1`.
- AsyncStorage holds only a supabase-js session, and `main` has no sign-in UI, so there is nothing to
  carry.

Rationale:
- **Open in place, don't copy.** The same package ID means the Flutter app inherits RN's data directory.
  Opening `udine.db` at expo-sqlite's path with `sqflite` (explicit path, so not sqflite's default
  `databases/` directory) has no copy step to fail half-way and nothing to clean up. SQLite replays the
  WAL on open.
- **Schema versioning starts here.** `PRAGMA user_version` 0 means "RN's schema". Flutter migrations go
  0 → 1 → …, additive only: never drop or rewrite an RN table or column, so a user on a botched build can
  still be recovered by a fixed build.
- **Same JSON shapes.** Rows are read and written with the JSON shapes in `shared/src/types.ts`
  (`flutter-port-shared-logic` Task 2 round-trips them), so an RN-written row and a Flutter-written row
  are indistinguishable, and export output doesn't change.
- **M2's new settings** (tracking on/off, score toggles, Charles River, first run seen, Avoid allergens)
  are new `preferences_kv` keys. `food_preferences` keeps its shape; fields M2 drops (`macroPresets`) stay
  in the row unread.
- Rejected: a fresh database plus a one-time import. It's a second copy to keep consistent and a
  migration step that can fail mid-way, for no gain over opening in place.
- Rejected: `drift`. It's a heavier codegen dependency, and this is five tables of JSON columns.

## Acceptance

- [ ] On Android the store opens `<filesDir>/SQLite/udine.db`. Confirm the real path on the A53 first:
  print it from the RN internal build's own expo-sqlite (`databasePath`) and record it here before
  writing the opener — evidence: device log line in the PR
- [ ] A fresh install creates RN's exact schema plus `user_version` 1; an RN-shaped database at
  `user_version` 0 upgrades to 1 with every row byte-identical — evidence: test (a fixture `.db` built by
  the RN schema statements)
- [ ] The store API covers what the screens need: log entries by day, add, change servings, delete one,
  delete a meal, and Undo for each; favourites; custom foods; rankings; preferences — evidence: test
- [ ] Every user table and every new one has JSON and CSV export (CLAUDE.md "Data export") — evidence:
  test, against the TS exporter vectors
- [ ] **On a device:** on the A53, `mobile/scripts/build-internal-android.sh --install` from `main`
  (the shipped RN app, not the bake-off build), then seed through its UI: logs on 3 days including a
  custom food and an OFF item, 2 favourites, a saved custom food, 3 head-to-head picks, an allergen
  preference. Screenshot RN's logs and You. Install the Flutter internal build over it
  (`flutter-port-foundation` Task 4); `/debug/store` shows every seeded row — evidence: screenshots
  before and after, in the PR
- [ ] Opening a database written by a newer Flutter build (`user_version` above what this build knows)
  doesn't run migrations or write, and the app shows the error state instead of risking the data —
  evidence: test

## Tasks

1. **Path and opener** — confirm the A53 path, then `app/lib/core/store/db.dart`: the opener, RN's schema,
   the `user_version` migrator, the newer-version guard — files: `app/lib/core/store/`,
   `app/test/core/store/` — lanes: flutter — blocked by: foundation 2, shared-logic 2 — PR:
2. **Store API and export** — repositories for log, favourites, custom foods, rankings and preferences
   (with M2's new keys), and export of every table — files: `app/lib/core/store/`,
   `app/lib/core/export.dart` — lanes: flutter — blocked by: 1, shared-logic 3 — PR:
3. **On-device upgrade test** — the seeded RN to Flutter run on the A53, `/debug/store`, and the
   evidence above. The A53 is free to use (`a53-test-phone`); DND on via adb during capture — files:
   `app/lib/debug/store_page.dart`, `docs/pr-review-media/` — lanes: flutter, the A53 run — blocked by:
   2, foundation 4 — PR:
