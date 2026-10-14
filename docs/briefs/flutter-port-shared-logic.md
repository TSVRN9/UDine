# Flutter port: shared logic in Dart

Goal: the Flutter app has a pure, tested Dart core (`app/lib/core/`) for every rule the screens need:
parsing UMass feeds, hours and open status, nutrition and plate math, search matching, favourite
matching, ranking, export, M2's view logic and occupancy. Where the same rule also runs in TypeScript,
one set of JSON vectors proves the copies agree.

Roadmap and global decisions: `docs/briefs/flutter-port.md`.

## Spec

UI: none.
Annotations: none.
States: n/a (no rendered output).
Routes: none.

Backend: none changed. Task 1b adds tests under `supabase/functions/` (owner-merged).
Residency: none.
Rationale:
- **What has to agree across languages.** The edge functions import no `@udine/shared` module (Deno
  can't resolve the workspace package). They hand-copy four rules: foodpro parsing (`populate-*`), hours
  and open status (`_shared/hours.ts`), `matchesQuery` normalization (`lookup-dish`), and favourite
  matching (`check-favorited-foods` vs `shared/src/favoriteMatch.ts`). A Dart port is a third copy, so
  those four get shared vectors that TS, Deno and Dart tests all read. Today the TS and Deno copies have
  no such check either.
- **The rest is port-and-test.** Macros, ranking, exporters, date and the M2 view logic run only on the
  device, so their Dart tests can carry their own cases; vectors are used where they already exist
  (`M2/vectors.json`, the bake-off's `label_vectors.json`).
- **What isn't ported.** `mobile/src/lib` modules that M2 replaces (pane shell, scrubber, badge layout,
  hold-slide, `homeHero`, `grabStrip`, filter presets) are not ported. The bake-off's `lib/logic/` is the
  M2 replacement and already passes `M2/vectors.json`.
- Rejected: running the TS core in a JS engine inside Flutter. It keeps one copy, but adds an engine,
  async bridging on every call and the startup cost the bake-off was meant to escape.
- Rejected: generating Dart from TS. No tool handles the parsers, and the generated code would be what
  agents debug.

## Acceptance

- [ ] `shared/vectors/{foodpro,hours,match-query,favorite-match}.json` exist; `shared` tests assert the TS
  modules against them, so the files can't drift silently — evidence: test (shared lane)
- [ ] The Deno copies (`populate-dishes` parser, `_shared/hours.ts`, `lookup-dish` normalization,
  `check-favorited-foods` matching) pass the same files, or each mismatch is listed in the PR with the
  owner's call on which side is right — evidence: deno test
- [ ] `app/lib/core/` passes the same four files, plus Dart tests for macros, scores, completion,
  ranking (Elo), date, stations, content parsing (events, retail menus including the PDF link and its
  host gate), exporters (CSV/JSON output byte-equal to the TS exporters for the same rows) and the
  `LogEntry` JSON round trip (a TS-written `source_json`/`nutrition_json` decodes and re-encodes
  unchanged) — evidence: test (flutter lane)
- [ ] The foodpro parser reads the healthfulness grade (H0–H7 from `recipe-webcode`; `data-healthfulness`
  alone isn't trusted, H0 is a real 0), the carbon letter A–E (`data-carbon-list`) and price, as
  `mobile/scripts/bakeoff-fixture.mjs` on `bakeoff/rn` does (lines 35–55) — evidence: test against
  captured foodpro fragments
- [ ] The bake-off's `lib/logic/` (busy, dish_sheet, hours, menu_view, plate, schedule, status, where) is
  in `app/lib/core/m2/`, reading the core types, not the fixture's, and still passes `M2/vectors.json` —
  evidence: test
- [ ] `occupancy.dart` derives `{level, vsUsual, usuallyClearsAt, confidence}` as
  `docs/briefs/hall-occupancy-history.md` Task 2 specifies (moved here from TS: the Flutter app is its
  only consumer) — evidence: test, including the null-outlook and low-sample cases

## Tasks

1. **Vectors in TS** — `shared/scripts/gen-vectors.ts` writes the four files from today's TS behaviour,
   built from the captured fixtures already inline in `umassDining.test.ts`, `hours.test.ts`,
   `search.test.ts`, `favoriteMatch.test.ts` and the edge functions' parser tests; the shared tests
   read them back — files: `shared/vectors/`, `shared/scripts/gen-vectors.ts`, `shared/src/*.test.ts` —
   lanes: shared (test, typecheck, lint) — blocked by: none — PR:
   1b. **Deno reads the vectors** (owner-merged: `supabase/`) — files:
   `supabase/functions/**/*.test.ts` — lanes: deno test — blocked by: 1 — PR:
2. **Dart: feeds** — `core/types.dart` (field-for-field with `shared/src/types.ts`; JSON keys unchanged),
   `core/foodpro.dart` (with grades and price), `core/hours.dart` (get_infov2 hours plus the
   `business_level`/`moderate_level`/`notbusy_level` triple, `999999` = no sensor), `core/content.dart`
   (events, retail menu: items/PDF/empty, URL host gate), `core/date.dart` — files: `app/lib/core/`,
   `app/test/core/` — lanes: flutter — blocked by: 1, foundation 2 — PR:
3. **Dart: food math and records** — `macros`, `scores`, `completion`, `stations`, `search`
   (`matchesQuery`), `favorite_match`, `ranking` (Elo), `export` (CSV/JSON) — files: `app/lib/core/`,
   `app/test/core/` — lanes: flutter — blocked by: 2 — PR:
4. **Dart: M2 view logic** — copy the bake-off's `lib/logic/` and its tests into `core/m2/`, rewire it to
   `core/types.dart`, drop `fixture.dart` and `net.dart` (the real fetch is `flutter-port-menu-data`) —
   files: `app/lib/core/m2/`, `app/test/core/m2/`, `app/test/vectors.json` (copied from M2) — lanes:
   flutter — blocked by: 2 — PR:
5. **Dart: occupancy** — `core/occupancy.dart` plus the `occupancy_typical` row type; update
   `hall-occupancy-history.md` Task 2 to point here — files: `app/lib/core/occupancy.dart`,
   `docs/briefs/hall-occupancy-history.md` — lanes: flutter — blocked by: 2 — PR:
