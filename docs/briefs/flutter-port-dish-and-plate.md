# Flutter port: dish sheet, plate and logging

Goal: in the Flutter app a user can open any dish for its nutrition, scores, ingredients and where it's
served. They can build a plate across one or more places, log it with Undo, and add a one-off custom
food. What they log lands in the device store RN users already have.

Roadmap and global decisions: `docs/briefs/flutter-port.md`.

## Spec

UI (M2, `docs/design/explorations/2026-10-ui-overhaul/flows/M2/`):
- **Dish sheet** (`#isheet`; NOTES "Round 4", "Round 7", "Round 8", "Round 8b", CONCEPT R9 §6). It has:
  - a per-dish rest height and a pinned name;
  - the favourite star;
  - patches;
  - "Contains", with avoided allergens in bold;
  - Add to plate;
  - "where it's served": navigation to that hall, day and meal, scrolled to the dish. When it's the place
    and day already showing, it scrolls in place instead of pushing;
  - FDA Nutrition Facts;
  - the ratings panel;
  - ingredients with "Show all";
  - price, on café servings only.

  It opens over the list it came from: from a hall, from Search and from the plate (`compare-detail.png`,
  `compare-searchdetail.png`, `compare-platedetail.png`, `compare-servinghall.png`,
  `compare-searchdetaildrag.png`).
- **Full label sheet:** for a dish, and for the whole plate. The plate's version has no carbon grade.
  NOTES "Round 4".
- **Plate:**
  - the bar grows into the plate sheet, with mid and large detents and a rubber band. The mid detent is
    M2's formula, `min(36% of the frame, tab bar - content)`;
  - multiple plates split by place set, with swipe and dots;
  - an inline "Log at X / Y" choice;
  - Log, with a receipt snackbar and Undo;
  - the stepper's collapsing ghost;
  - "Add something else".

  NOTES "Round 1", "Round 2", "Round 7"; `#bar #psheet`, `logPlate`, `undoLog` around 926.
- **Custom food form sheet:** name, cal, P/C/F. It's reached from Search's no-match and from menu-less
  cafés (`openCustom` around 1966). It is one-off: saved custom foods and packaged-food lookup wait for
  `m2-round-11`.

Annotations: none.
States:
- **Dish sheet:**
  - a hall dish, a café dish with price, a dish with avoided allergens, an unscored dish, and score tiles
    on;
  - ingredients collapsed and expanded;
  - favourite on and off.
- **Full label:** a dish and a plate.
- **Plate:**
  - bar with 1 item;
  - sheet at mid and large;
  - two plates (dots);
  - the "Log at" choice;
  - the receipt with Undo;
  - after Undo.
- **Custom food:** empty, filled, and invalid (no name or no calories).
- "Where it's served": same place, another place, and a later day.

Routes: `/hall/worcester?meal=lunch&dish=<name>`, `/plate?seed=benchmark` (M2's benchmark plate: Beef
Brisket Noodle Bowl ×1 and Golden BBQ Chicken Thigh ×2, 404 cal / 38.9 g), `/custom`. Record add →
bar, bar → sheet, Log → Undo, dish sheet drag-down, and where-served with `--record`.

Backend: none.
Residency: "Consumption log… Device only". Log writes go through `flutter-port-device-data`'s store as
`LogEntry` rows in the RN JSON shapes. Favourites are device-only (no sign-in, so no server favourites).
Rationale:
- **One log path.** Log and Undo use the store API (Undo deletes exactly the rows that Log wrote), so
  past logs, export and Health (`flutter-port-health`) all see one source.
- **Toss removed:** M2 round 2 cut it (orchestrator correction, 2026-10-15). Log crossfades to the receipt in the bar's place and buzzes `[12,60,24]`.
- **Bake-off departures closed here:**
  - where-served scrolls in place when it's the same place and day;
  - the plate mid detent follows M2's formula, `min(36% of the frame, tab bar - content)`, not a fixed 36%;
  - the stepper's collapsing ghost is built;
  - the favourite star, Full label and "Add something else" are built.
- **Plates split by place set** use `core/m2/plate.dart` (`M2/vectors.json`). The plate-hall macro rule
  was a missed test in the RN bake-off (Task 2 REWORK); keep its test.

## Acceptance

- [ ] Goldens at 360 and 390 for every state above, and M2 DOM measurements for the dish sheet, the label
  and the plate sheet within 1 dp. That includes the bake-off's dish-sheet 4 dp fix — evidence: test
- [ ] Device screenshots of each state next to M2's own render — evidence: screenshot
- [ ] Frame strips of the transitions above next to M2's `compare-*` strips. On the A53: cold first add,
  tap to plate bar, within the bake-off's 138–147 ms (M2's target is 136 ms), and Log/Undo janky
  frames at or under 4.5% — evidence: screenshot (strips) + numbers in the PR
- [ ] The benchmark plate totals 404 cal / 38.9 g, and its Full label matches `label_vectors.json` —
  evidence: test
- [ ] Log writes `LogEntry` rows that the RN app would also read (the shared-logic round trip). Undo
  removes exactly those rows. Logging works offline — evidence: test
- [ ] An invalid custom food can't be added, and a valid one logs as a `custom` source — evidence: test

## Tasks

1. **Dish sheet and full label** — the sheet, its entry points, where-served navigation, the favourite
   star, the dish and plate labels — files: `app/lib/screens/dish/`, `app/lib/ui/nutrition_label.dart` —
   lanes: flutter — blocked by: hall-menu 1, device-data 2 — PR:
2. **Plate, Log and Undo** — the bar, the sheet and detents, multiple plates, the "Log at" choice, Log
   with the receipt and Undo — files: `app/lib/screens/plate/` — lanes: flutter — blocked by:
   1 — PR:
3. **One-off custom food** — the form sheet and its two entry points — files:
   `app/lib/screens/plate/custom_food.dart` — lanes: flutter — blocked by: 2 — PR:
