# Flutter port: build-your-own bowls

Goal: at a Noodle Bowl, Pasta Bar, Omelet, Salad, Cold or Deli Bar, or a café with Add-ons or Toppings,
a user can build what they actually ate in the dish sheet. The plate and the log then keep it as one item
with its parts. A past meal still says what was in it.

Roadmap and global decisions: `docs/briefs/flutter-port.md`.

## Spec

UI (M2, `docs/design/explorations/2026-10-ui-overhaul/flows/M2/`): CONCEPT R10 §4 and NOTES "Round 10"
("Data and model", Bowls). In `src.html`: `buildOf`, `synOf`, `bowlDish`, and `#bfoot`, the pinned foot.
- **The row doesn't change:** `+` adds the plain dish in one tap. The builder lives in the sheet only.
- **The sheet:** the station's name is the heading where "Add to plate" was, over compact add-in rows,
  each with `+` → stepper and its calories. The pinned foot shows running calories and protein and a
  gold Add. "Where", the label and the café price sum live.
- **The plate:** a bowl is one item named after its base, with a "with …" second line. Its stepper
  scales the whole bowl. Two different bowls of one base are two items. Tapping one reopens the sheet
  with the foot reading Update.
- **Which dishes build:**
  - natural bases at halls (Noodle Bowl, Pasta Bar, Omelet);
  - synthetic bases (owner, round 10) for an unpriced Salad Bar, Cold Bar or Deli Bar. These are named
    "Your salad from the Salad Bar", "Your salad from the Cold Bar" and "Your sandwich from the Deli Bar",
    have no nutrition of their own, and keep Add disabled at 0;
  - a café dish whose place and meal have an Add-ons or Toppings station, using that station's dishes
    that have nutrition.

**Open (owner) — blocks this brief:**
1. The synthetic base names above, as worded.
2. Whether Harvest Market's by-the-pound bars ("Salad Bar $11.50/LB", "Cold Bar Items $11.50/LB") get a
   synthetic base.
3. Whether Harvest's Hot Bar Items, Indian Bar and Asian Bar stay single dishes (M2's current answer).

Annotations: none.
States:
- **The sheet:**
  - a Noodle Bowl with nothing chosen and with 2 parts;
  - a café dish with add-ons and its price summing;
  - a synthetic base at 0 (Add disabled);
  - Update for a bowl already on the plate.
- **The plate:** two bowls of one base plus the plain dish.
- **History:** a past meal with a bowl (its parts shown).

Routes: `/hall/worcester?meal=lunch&dish=Beef%20Brisket%20Noodle%20Bowl`, a café dish route, and a
past-day route with a logged bowl. Record adding parts and Add → plate with `--record`.

Backend: none.
Residency: "Consumption log: Device only". A bowl is logged as one `LogEntry` whose `source_json` gains an
optional `parts` array (name, servings, nutrition snapshot). That's an additive field: rows without it
read as today's, and export includes it.
Rationale:
- **The stations decide, not the feed.** The feed links no base to its add-ins (NOTES "Round 10",
  Bowls), so the rules are in `core/m2/bowl.dart` and tested against M2's vectors. That includes the
  benchmark: the brisket bowl's plain `+` still adds 404 cal.
- **One item, many parts.** Health writes and past-meal labels get one record with the summed nutrition.
  The parts are kept for display and export.
- Replaces RN's `CompositeDishComposer`.

## Acceptance

- [ ] `M2/vectors.json` bowl cases (which dishes build, base detection, synthetic bases, café add-ins
  with nutrition only, price sums, item keys) pass — evidence: test
- [ ] Goldens at 360 and 390 for every state above, and M2 DOM measurements for the add-in rows and the
  pinned foot within 1 dp — evidence: test
- [ ] Device screenshots of each state next to M2's own render — evidence: screenshot
- [ ] A logged bowl round-trips through the store with its parts. A row without `parts` still reads —
  evidence: test

## Tasks

1. **Bowl rules** — `core/m2/bowl.dart` with M2's vectors, and the `parts` field in `LogEntry` and export —
   files: `app/lib/core/m2/bowl.dart`, `app/lib/core/types.dart`, `app/lib/core/export.dart` — lanes:
   flutter — blocked by: shared-logic 4, device-data 2, the owner's answers — PR:
2. **Builder UI** — add-in rows and the foot in the dish sheet, bowls on the plate, Update, bowls in past
   meals — files: `app/lib/screens/dish/`, `app/lib/screens/plate/`, `app/lib/screens/you/` — lanes:
   flutter — blocked by: 1, dish-and-plate 2, you 1 — PR:
