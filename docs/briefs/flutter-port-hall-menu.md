# Flutter port: hall menu

Goal: opening a hall or café in the Flutter app shows its real menu for any day in range, as M2 designs
it. That means the photo header, busy board and "Calmer around…", meal tabs, the station row with its
switcher and day control, the schedule sheet, the dietary line, event notes, and `+` that becomes a stepper.
The bake-off proved this screen; this brief puts it on live data and closes the bake-off's departures.

Roadmap and global decisions: `docs/briefs/flutter-port.md`.

## Spec

UI (M2, `docs/design/explorations/2026-10-ui-overhaul/flows/M2/`; `src.html` `#menu` around 640–660):
- **Header:** the photo header collapses into the maroon bar on scroll. The busy lamp board and "Calmer
  around…" come from live busy plus the typical curve (`core/occupancy.dart`). NOTES "Round 2", "Round 4",
  "Round 7".
- **Meal tabs:** shared axis X between meals; every meal tab visible, including Grab 'N Go (NOTES "Round
  9c", "Every meal visible").
- **Station row:** stations, with the day cell at its end (NOTES "Round 9c"). The station switcher sheet.
- **Day control** (CONCEPT R9 §1): any day in the 15-day range, plus the day change motion
  (`strip-r9-daychange.png`).
- **Schedule sheet** (CONCEPT R9 §2; `schedHTML`, `openSched`, `pickDay` around 1289): address,
  Directions (a maps https link via `url_launcher`), the chosen day's per-meal hours, 15 day rows, and
  "Holiday hours" rows that hold an event.
- **Dietary line** (CONCEPT R9 §3): "Hiding N that list X", "Show all", "Hide them". Hidden dishes stay
  revealed until you leave the page (owner, round 9).
- **Rows:** name, diet marks, score tiles when on in You (NOTES "Round 8", "Round 8b"; no tile when a
  dish isn't scored), and price on café servings only (CONCEPT R9 §6). `+` becomes the 1 → ½ → remove
  stepper. Tapping a row opens the dish sheet (`flutter-port-dish-and-plate`; a stub until then).
- **Event note** on its own day, with no date tag (NOTES "Round 9"). Empty day: "No menu posted".
- **Hall states** (CONCEPT R9 §4):
  - loading: an activity indicator after 400 ms, then labels and list fade in;
  - offline: the live layer is dropped, and unsaved days say "You're offline, and the menu for … isn't
    saved on this phone";
  - failed: "Worcester's menu didn't load." with Try again.
- **Cafés with dishes** use this body entirely (CONCEPT R9 §5). Single-meal cafés have no tab row.

Annotations: none.
States:
- Worcester lunch at 360 and 390;
- header collapsed;
- each meal tab, including Grab 'N Go;
- the station switcher open;
- the schedule sheet on today, a later day and a holiday-hours day;
- a day with an event note;
- the empty day (Oct 10 in the M2 data);
- the dietary line hiding N, revealed, and hidden again;
- the stepper at 1, ½ and remove;
- score tiles on and off, including an unscored dish;
- a café with prices;
- loading, offline with cache, offline unsaved and failed.
Routes: `/hall/worcester?meal=lunch&day=<date>` and `/cafe/<id>`, with `?net=` and `?at=` as in
`flutter-port-halls`. Record a meal-tab change, a day pick, a header collapse and a fling with
`--record`.

Backend: none (reads through `flutter-port-menu-data`).
Residency: the plate is in memory until Log, as RN's is. Dietary preferences are device-only.
Rationale:
- **Port, then close the departures.** The bake-off's `screens/hall_menu*`, `meal_*`, `station_switcher`
  and `hours_sheet` are the starting point. Each departure in its README is either closed here or listed
  below as owner-accepted.
- **Closed here:**
  - **The meal-tab ghost:** a tab tapped mid-run lets each outgoing copy finish, as M2's `sharedAxisX`
    does, instead of the new change replacing the old ghost.
  - **Sheet release:** M2's velocity-projected spring and top rubber band, instead of
    `DraggableScrollableSheet`'s linear snap. This lands in the kit's `sheet.dart`, so every sheet
    gets it.
- **Owner-accepted, unchanged:**
  - `bold700`;
  - 44 dp targets on the status line and "Show all";
  - whole-dp line rounding.
- **Busy needs both halves.** Live `business_level` against its hourly thresholds says "busy for this
  hour". Only the typical curve can say when it's calmer (`docs/briefs/hall-occupancy-history.md`). If
  the curve has too few samples (`confidence` low), "Calmer around…" is left out rather than guessed.

## Acceptance

- [ ] Goldens at 360 and 390 for every state above, and the M2 DOM measurements (`m2_dom.json`) for the
  header, tabs, station row, day cell, rows, stepper and dietary line within 1 dp — evidence: test
- [ ] Device screenshots of each state next to M2's own render at the same width — evidence: screenshot
- [ ] Frame strips of the meal-tab change (including a double tap mid-run), day pick, header collapse,
  station switcher and schedule sheet next to M2's. On the A53: day pick settles within the bake-off's
  551–568 ms, and fling janky frames are at or under 1% — evidence: screenshot (strips) + numbers in the
  PR
- [ ] `M2/vectors.json` cases for menu view, schedule, status, busy and dietary hiding pass against live-
  shaped data — evidence: test
- [ ] A sheet released with a fast fling settles where M2's spring puts it, and dragging past the top
  rubber-bands — evidence: test (`sheet_test.dart`)
- [ ] The halal filter test from the bake-off is kept — evidence: test

## Tasks

1. **Menu body on live data** — header, tabs, station row and switcher, rows with marks, scores and price,
   stepper into the in-memory plate, event note, empty and network states; the café page switches to this
   body — files: `app/lib/screens/hall/`, `app/lib/ui/` — lanes: flutter — blocked by: halls 1 — PR:
2. **Day control, schedule and dietary line** — the day cell, the day change, the schedule sheet with
   Directions and holiday rows, the dietary line — files: `app/lib/screens/hall/` — lanes: flutter —
   blocked by: 1 — PR:
3. **Busy** — the lamp board and "Calmer around…" from live busy and the typical curve — files:
   `app/lib/screens/hall/busy*.dart` — lanes: flutter — blocked by: 1, menu-data 2 — PR:
4. **Motion departures** — the meal-tab ghost and the kit sheet's spring and rubber band — files:
   `app/lib/ui/sheet.dart`, `app/lib/screens/hall/meal_*` — lanes: flutter — blocked by: 1 — PR:
