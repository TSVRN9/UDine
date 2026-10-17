# M2 rounds 12 and 13 in Flutter: variant pickers, a Fountain Drink, one continuous hall open, tracking as a layer, favourites on Halls

Goal: the Flutter app does what the owner approved in M2 rounds 12 and 13 (2026-10-16 and 17). A drink or soup
UMass lists in several sizes, milks or bases is one row with a picker in its sheet; every dining commons has a
Fountain Drink; a hall opens as one continuous card (the letter and title travel, nothing fades out and back
in); turning tracking off lifts the whole tracking layer away, figures included; a hall card shows a star when
it serves a favourite and the app icon carries a badge; a late busy reading doesn't move the title.

Roadmap and global decisions: `docs/briefs/flutter-port.md`. Written 2026-10-17 from the approved M2, as
`m2-round-11.md` was. Builds on the Flutter briefs `flutter-port-dish-and-plate`, `-hall-menu`, `-halls`,
`-search`, `-you`, `-bowls`, `-favorite-alerts` and `-alert-push`.

**The spec is on two unmerged M2 branches.** Round 12 is PR #566 (`design/m2-round-12`), round 13 is PR #612
(`design/m2-round-13`, stacked on it). Every task below is **blocked by both merging**: the M2 sections, `test.js`
scenarios, `vectors.json` blocks and the M2 build the measurements come from are on those branches until then.
Read the spec from `docs/design/explorations/2026-10-ui-overhaul/flows/M2/` (`CONCEPT.md` "Round 12", "Round 12b",
"Round 12c", "Round 12d", "Round 13"; `NOTES.md` the same; `vectors.json`; `src.html`). The owner's later decisions
override the first-written concept text: a row that follows the plate (not a row that counts its default), no diet
marks on the Fountain Drink, the busy block not reserved.

## Spec

UI: M2 (`docs/design/explorations/2026-10-ui-overhaul/flows/M2/`), cited per task as `M2 R12 §k`, `R12b §k`, `R12c`,
`R12d`, `R13 §k`, with the `src.html` function. `app/` parity source is M2, not the `.dc.html` artboards. Measurements:
a fresh M2 build (`python3 build.py`) at the merged head, read by a Playwright script into new
`app/test/m2_dom_<name>.json` files, one per task, asserted in `m2_measure`-style tests; goldens at 360 and 390.
Durations, curves and colours come from `app/lib/theme` and `app/lib/motion`, never a literal. New token: `fold`
(250 ms, `cubic-bezier(.2,0,0,1)`, M3 medium1) in `MO` and `M2Motion`.
Annotations: none.
States: per task below; each has an M2 `test.js` scenario that is the oracle (`RED=12`, `RED=13`).
Routes: `/?data=recorded&at=2026-10-08T12:41` plus the M2 flags named per task (`?busy=late`, `?launcher=1`,
`?health=missing`, `?state=...`). Screenshots with `app/tool/screenshot.sh`, photos off.

Backend: none in this brief. The favourites cue's badge depends on the push work in `flutter-port-alert-push.md`
(topics, `send-dish-alerts`, the iOS notification service extension); this brief only draws and wires the badge.
Residency: none new. Variants, plate and log stay device-only; favourites and the badge count are device-only (the
badge count is kept on the phone: the NSE and the app share an app-group counter, nothing is sent to our server).
Rationale: the owner approved rounds 12 and 13 after frame review. The rules were derived from the recorded feed,
not by hand, and each M2 oracle is a test the Flutter task must pass in its own terms. Rejected: grouping by fuzzy
name similarity (it merges different dishes); a separate variants screen (a pick-one belongs in the sheet); a row
that counts only its default (superseded by the row that follows the plate); fading the card out and the page in
(the hollow); reserving the busy block (it moves every header off M2's measured position).

## Tasks

Each task is one PR a reviewer can accept or reject without the others. Common lanes for every Flutter task:
`cd app && flutter analyze && flutter test --concurrency=2`, the task's measurement test, goldens at 360/390 for the
changed screens, and `app/tool/screenshot.sh` frames for each state listed (recorded mode). One heavy job at a time:
Gradle, the emulator and Playwright never run together (`flock ~/.cache/udine-scratch/heavy.lock`).

### 1. Variant pickers (M2 R12 §1-§6, R12b §1 and §4, R12d vectors)
Pure rule in `app/lib/core/m2/variants.dart` (new), checked against `vectors.json` `variants`:
- `variantOf(name)` reads one of three tokens: a size (`^(\d+) ?oz (.+)$` or `^(.+?) \((\d+) ?oz\)$`), a milk
  (`<name> <Almond|Maple|Oat|Skim|Soy|Whole|1%> Milk`) or a base (`<name> <Coconut|Yogurt> Smoothie`, family
  `<name> Smoothie`; or `<name> w/<Coconut|Yogurt>` at the end of a name). Not at an Add-ons or Toppings station.
- `famsAt(station dishes)`: two or more items at one place, day, meal and station with the same remaining name and
  different tokens are a family (key `f:<norm(name)>`); sizes smallest first, milks and bases in feed order; the first is
  the default. Result on Oct 8-22: 59 families, 325 station-days, 392 station-meals; 220 near-misses (a lone size, a
  different word, add-ons, a milk with nothing left, "1% Milk"; the decaf/regular, hot/iced, espresso and milkshake sets
  stay rows). `vectors.json` `variants.families`, `nearMiss`, `shown`, `search`, `alerts`, `follow` are the fixtures.
- **The row** (hall menu and Search): the family's name; it stands for the variant last added to the plate and counts
  that variant's own item; with two variants on the plate the later one; when it leaves, the next most recent family
  variant on the plate, then the default. "Added" is a first add, a stepper `+`, an Update; a `-` never counts. A variant
  built with add-ins is its own item and isn't the row's. A variant your preferences hide is never the one it stands for.
  In Search typed words narrow first, then the plate's latest among them. `vectors.json` `variants.follow` is the oracle
  (`standing()` / `restand()` in `src.html`). The row's token is the chip's word ("16 oz", "Oat"); it swaps in place with a
  `settle` crossfade and never moves or changes height.
- **The picker** is a single-select chip group under the name in the dish sheet and the builder (`vpickHTML`): 44 px chips,
  wrapping, no heading, the chosen chip a tonal fill and edge with no check and no bolder text (a chip never changes
  width). The name follows the pick ("Cappuccino, 20 oz"); everything under it is the variant's own and crossfades from .4
  in place without the sheet moving; a builder keeps its add-ins across a pick. The log records the feed item's own name
  ("20 oz Cappuccino"), id and nutrition; history and the plate read "Cappuccino, 20 oz". Favourites star the family; alerts
  match the family (one push, by its name). Tracking off keeps the picker.
- **Café phos** (R12b §4): `phoAxes` reads `^(.+?) Pho w/(.+) Broth$` over a station and needs a complete grid of at least
  2x2 (Star Ginger 3x3 on 12 station-meals, Whitmore 3x2 on 7; Star Ginger's two ramen days keep one picker of whole
  dishes; hall pho bars keep their one broth picker). Two groups, protein then broth, 24 px apart (the add-ons heading's
  gap), labels "Beef Pho" and "Spicy Green Curry Broth". Add waits for both; the bowl is the feed's pho name everywhere; an
  Update re-resolves either chip, keeping quantity and add-ons, and merges with a twin. `vectors.json` `variants.phos`.
States: Worcester Café list (top, scrolled), Cappuccino sheet (16 oz, 20 oz with an add-in, tracking off), Boba sheet
(Almond, Oat) at 360 and 390 (the five milks wrap to two lines), Courtside's smoothies (Coconut, Yogurt), a row after `+`,
a row following Oat then Soy then removed, Search ("boba", "oat", "20 oz latte", "soy" with oat on the plate), You → Favorites,
Hampshire's pho bar, Star Ginger and Whitmore's two pickers (none, protein only, both, from the plate with Update).
Measurement: new `app/test/m2_dom_variants.json` from M2 (`z-wcafe`, `m-proc`, `s-boba`, `b-starginger` shots' geometry).
Files: `app/lib/core/m2/variants.dart`, `app/lib/screens/hall/dish_row.dart`, `meal_list.dart`, `app/lib/screens/dish/dish_sheet.dart`,
`bowl_foot.dart`, `app/lib/core/m2/plate.dart`, `app/lib/core/m2/search.dart`, `app/lib/screens/search/search_controller.dart`
— lanes: the common ones plus a Dart test over `vectors.json` `variants` — blocked by: #566 and #612 merged — PR:

### 2. Missing nutrients draw "-" (M2 R12c)
The owner's missing-data rule, now for calories, protein, carbs and fat (the five blank records: 20 oz Chai, 20 oz Iced Chai
Latte, 20 oz Iced Tea, Add Crispy Chicken, Fountain Drink). Parse a blank as null, not 0; a recorded 0 stays 0 (31 records).
- Drawn "–" on a row's meta, a dish sheet's label, an add-in row, a plate row, the plate bar and its foot, a meal row, a
  logged item. Totals are the sum of what is known and null ("–") only when every item is unknown (`tally()`); a bowl's
  cal/p/c/f likewise. The plate's "Full label" shows "–" when nothing is known.
- The log stores null; the export writes null (JSON and CSV); Health writes omit an unknown field, never write 0.
- An add-on with no calories recorded is offered with "–" (the builders' filter is `cal == null || cal > 0`).
`vectors.json` `plate` has two blank-calorie sequences (alone: all four totals null; beside a 211 cal item: 211, 0, 52.7, 0).
States: Chai 16 oz and 20 oz on a row, in the sheet, on the plate and logged; the Whitmore Add-ons with "Add Crispy Chicken".
Measurement: `app/test/m2_dom_blank.json`. Files: `app/lib/core/` (nutrition parse, totals), `app/lib/screens/plate/plate_bar.dart`,
`plate_row.dart`, `app/lib/screens/dish/full_label.dart`, export and Health writers — lanes: common — blocked by: #566 merged — PR:

### 3. Fountain Drink (M2 R12d)
- One synthetic record, "Fountain Drink", serving "1 each", every nutrient blank (so Task 2's "–"), no price, no diet marks, no score.
- A last station "Beverages" with that one row in every dining commons menu at every meal the hall posts except Grab 'N Go
  (Worcester breakfast, lunch, dinner, late night; Franklin and Hampshire breakfast, lunch, dinner; Berkshire lunch, dinner, late
  night and its one breakfast), on every posted day. `vectors.json` `fountain` has the station-days per hall and meal.
- A row is `+` and a count on the plate ("– cal each"); logged `["Fountain Drink", 1, null, null]`. Its sheet has no star (always
  served: no favourite, no alert) and nothing of a label beyond dashes.
- **No diet preference (Vegetarian, Plant based, Halal) ever hides it** and it carries no diet marks: it's a drink, not food
  (`dietOK` returns true for it).
- Search finds it when typed: once among the halls (W F H B), once among the cafés that list it; not in idle Search.
  The café add-on of the same name is unchanged.
States: a hall menu scrolled to Beverages, the row's sheet, the row on the plate, logged; the diet preferences all on.
Measurement: `app/test/m2_dom_fountain.json` (`f-menu`, `f-sheet`, `f-plate`). Files: the menu parser (where the hall menu is built), `dish_row.dart`,
`app/lib/core/m2/search.dart`, the diet filter — lanes: common — blocked by: 2 — PR:

### 4. A hall opens as one continuous card (M2 R13 §4, `paint()` / `measureXF()` in `src.html`)
Replaces the fade-through in `app/lib/motion/container_math.dart` (`outgoingOpacity` 0 to 0.3, `incomingOpacity` 0.3 to 1) and its
use in `container_transform.dart`. `cont` / `contBack` (500 / 400 ms emphasized) and the container window math are unchanged.
- **Shared elements travel, at full opacity, never faded:** the hall letter, the title, the status line and the busy meter each take
  one transform from where the card drew them to where the header draws them (`translate(lerp(s,f) - f - own offset)`, scale for the
  letter and the title, translate only for the status and the meter), measured from the card and the header's final layout. A band
  source has no ghost copy of anything.
- **The ground never thins:** the duotone photo stays opaque while the colour photo develops over it (it used to cover only 75% at
  p .5); the card's ground is the band's own stack (photo or placeholder gradient, tint, gradient) from p 0, and the gradient fades
  with the collapse, so a photos-off close ends on the band's gradient, not flat maroon.
- **Only what differs crossfades, on top of the travelling element:** the status chevron and the busy line's "Calmer around" extra,
  `incoming = clamp((p - .2) / .6)` (the one new window). What has no counterpart on the card (back button, pin, meal tabs, station
  row, the list, the history chart) uses the same window as **one group layer**, not one opacity per element.
- **Text that changes size scales by a transform** about its top-left, a paragraph laid out once at its final size; never animate
  `fontSize` (no per-frame layout, Oswald stays crisp; the scale is about 1 at both ends).
- **Layer budget:** at most 3 offscreen layers a frame while it runs (the no-counterpart group, the colour photo over the duotone,
  the scrim); the shared elements are transforms. The old design used about 28 on the A53.
- Predictive back runs the same function backwards under the finger: at p .1, .3 and .5 the card is whole.
States: open and back-button close, predictive-back scrub at p .1/.3/.5, swipe commit and cancel, Worcester and Franklin, 360 and 390,
photos on and off.
Measurement: M2's `open390/close390/scrub390` strips (12 frames) and the `test.js` scenario "a hall opens as one continuous card" values:
letter/title/status/meter opacity 1 at p 0, .1, .3, .5, .8; the header's letter within 1.5 px of the card's at p 0 and on the line at p .3.
Evidence: a Flutter frame strip beside M2's, the shared elements never absent, an atrace/`flutter_tester` layer count against the budget. The
rendering-bug fixes (the one-frame hole, dropped frames) are `flutter-motion-fixes.md`, not this task.
Files: `app/lib/motion/container_math.dart`, `container_transform.dart`, `app/lib/screens/hall/hall_header.dart`, `hall_route.dart`,
`app/lib/screens/halls/hall_page.dart`, `app/lib/ui/hall_letter.dart` — lanes: common + a frame-strip comparison + the layer count —
blocked by: #612 merged (and `flutter-motion-fixes` Task 1 for the rendering defects) — PR:

### 5. Tracking off is a layer lifting away, figures included (M2 R13 §3)
New token `fold` (250 ms, standard). The layer: the plate bar; on You the Today, Meals and Earlier blocks, the Health row, Your foods and
Which was better?; and on every dish row the calorie and protein figures and the `+`/stepper column.
- **The rule: a fold only ever opens or closes empty space.** Off: everything leaving fades to opacity 0 first (0 to 150 ms, `exit`; the
  bar also leaves downward), then the empty blocks close (150 to 400 ms, `fold`: height, padding, the rule under a row) and what is below
  rides up. On: open the space first (0 to 250 ms), then fade the content in (250 to 450 ms, `settle`), the bar rising 250 to 500.
  Reduced motion: opacity crossfades only.
- **With tracking off:** a dish row shows its name and marks only: the cal/protein figures go everywhere (hall menus, Search, the
  Favorites lens, a food), the meta line closes when nothing else is on it, the row is a name-only 48 (64 on), the control column is
  removed from layout (names take the width), the hall tiles centre in the row; a dish's sheet drops its Nutrition Facts label (name,
  serving, marks, Contains, ratings, where and ingredients stay) and rests at the end of "where". The Track switch is the anchor and never
  moves. Halls and Search lists are usually hidden behind You while this plays, so on arrival they are already name-only.
- Vectors: `vectors.json` `tracking` (the windows in ms, row min heights, what is hidden and kept).
States: You off/on (12-frame strips at 390 and 360: `off`, `on`), a Search list off/on (`rowsoff`, `rowson`), Halls and a hall menu after
off (`g-notrack-halls`, `g-notrack-menu`), a dish sheet with tracking off, the first-run sheet's switch.
Measurement: `app/test/m2_dom_track.json` from the strips' end frames and the row min heights (48 / 64). Files:
`app/lib/screens/plate/plate_bar.dart`, `app/lib/screens/you/you_screen.dart`, `you_parts.dart`, `app/lib/screens/hall/dish_row.dart`,
`app/lib/screens/search/food_row.dart`, `app/lib/screens/dish/dish_sheet.dart`, the tracking setting in `app/lib/shell` — lanes: common —
blocked by: 1 (rows), 2 (dashes), #612 merged — PR:

### 6. The hall-card star and the app icon badge (M2 R13 §2, R11 §2)
- **The star** (Halls bands and Search's hall cards): a 22 px gold star (the letters' dashed-edge gold), 8 px after the name on the name
  line, no caption, label "Serves a favorite". It means a favourite is served at that hall in **the meal on now, or, between meals, the
  next meal still ahead today**; none after the hall's last meal. A dinner-only favourite does not star a hall while lunch is on.
  It updates when a favourite is toggled. `vectors.json` `stars` (six cases: favourites, clock, halls with a star, the meal per hall) is
  the fixture for `hallMeal` / `hallStar`.
- **The badge**, which needs no app run: iOS shows the number of favourite notifications delivered since the app was last opened (each push
  adds 1; the notification service extension keeps the count in the app group); Android shows the launcher dot while a posted
  notification is unread. **Both clear when the app is opened or a notification is tapped.** A tap lands on Halls home (every sheet closed
  except an undismissed first run). M2 simulates it with `?launcher=1&os=ios|android`.
- **Blocked on the push work:** the NSE counter, the Android dot and the landing route are `flutter-port-alert-push.md` Tasks; this task
  builds the stars (no dependency), then wires the badge once that lands. Search's Favorites lens stays the list of where favourites are.
States: Halls with stars (W F B for Golden BBQ + Black Bean Burger), a hall with none, at 360 and 390 (Hampshire fits), after a favourite is
toggled; the iOS number and the Android dot on a simulated home screen (device runs: `flutter-port-alert-push` "Device verification"); the
landing then Search → Favorites lens.
Measurement: `app/test/m2_dom_stars.json` (`g-halls-star`). Files: `app/lib/screens/halls/halls_screen.dart`, `halls_model.dart`,
`app/lib/screens/search/` (hall card), the alerts layer — lanes: common (stars); the badge part is device-verified — blocked by: #612
merged; the badge part also by `flutter-port-alert-push` — PR:

### 7. A late busy reading doesn't move the title (M2 R13 §4 last bullet, `arriveBusy()` / `lateSetup()`)
- A header opened with its reading is M2's measured layout: Worcester, Hampshire, Berkshire titles at one height, Franklin's 22 dp lower
  (Franklin has no "Calmer around" line). **Do not reserve the block.**
- A header opened before the reading has no busy block and no chart (the hour chart is part of the reading, drawn only for a live hall) and is
  shorter by the block's height D; the title (anchored by the header's foot) is already where it will stay. When the reading lands:
  **the block's box grows first** below the status line (height and spacing, over the first 60% of `settle`, its text not drawn, so no glyph is
  ever cut by a growing box or the header edge), the header grows by D and the meal tabs and the list ride down by D with it; **then, once the
  box is whole, the line and the chart fade in together** (the last 40%). The title and the letter do not move at any frame. The chart sits in the
  header's foot band (10 dp from the bottom, 30 tall), already inside the header, so D is the busy lines only: 47 dp (39 of lines + 8 of spacing) for
  Worcester, Hampshire and Berkshire; 25 dp (17 + 8) for Franklin. Replace the `AnimatedSize` that pushed the title 22 dp. A header that never
  gets a reading stays short. The hall card on Halls is top-stacked in a fixed band and has no shift: no change.
States: `?busy=late` opening, mid-arrival frames (12 at 390 and 360: `lateW390`, `lateF390`), and loaded Worcester and Franklin.
Measurement: M2 `test.js` "a busy reading that lands late": the title and letter rects unchanged across the arrival, the tabs and list down by
D, the end state equal to a header opened with the reading, while the line has any opacity it is whole and inside the header, and the chart is not drawn at k 0. Files: `app/lib/screens/hall/hall_header.dart`, `busy.dart`,
`hall_menu.dart` — lanes: common + the frame strip — blocked by: #612 merged — PR:

### 8. Write to Health Connect, not installed: the row opens its Play listing (M2 R10 §5, R13)
Already built on **#606** (`flutter-port-health` Task 2 area: the row shows when Health Connect isn't installed, a tap opens its Play
listing). This task is verification only: confirm #606 matches M2's state (`?health=missing&os=android`: the row shows, a tap opens a
neutral Play listing with Install, back closes it and leaves the check empty; once installed the first tap raises the permission sheet)
and add the screenshot if it is missing. No code unless #606 diverges.
States: the row on Android without Health Connect, the Play listing, back.
Files: none expected — lanes: the screenshot only — blocked by: #606 merged — PR: #606

### 9. Search tiles: centred on the meta line, the group centred under the + and clamped (M2 R13 §5)
Already built on **#611** (`flutter-motion-fixes` Task 2: "centre Search hall tiles and hall letters"). Verify against M2's rule: a tile
centres vertically on the row's meta line (cal/protein, the last meta group), not the lane's foot; a group centres under the `+` as one group,
clamped so its right edge never passes the row's content edge (20 dp in from the row's right edge): at 360 one tile (18 dp) centres on
the + glyph, two (40) and three (62) clamp with the right edge at 340. A café's name keeps the lane's right edge. M2's "Search tiles"
scenario measures every row with 1, 2 and 3 tiles at 360. No code unless #611 diverges.
States: Search "chicken" rows with 1, 2 and 3 tiles at 360 and 390, one-line and two-line names.
Files: none expected — lanes: the measurement test on #611 — blocked by: #611 merged — PR: #611

## Acceptance

- [ ] The variant rule and every family and near-miss match `vectors.json` `variants` (59 families, 220 near-misses); the row follows the plate per `variants.follow` — evidence: test
- [ ] Blank nutrients draw "–" with a null log and export, and totals are null only when all are unknown — evidence: test
- [ ] The Fountain Drink is in every hall's last Beverages station at every non-Grab meal, with no marks and no preference hiding it — evidence: test + screenshot
- [ ] A hall's open and close have the letter, title, status and meter travelling at full opacity at p 0, .1, .3, .5, .8, ground opaque, at most 3 offscreen layers — evidence: test + frame strip + layer count
- [ ] Tracking off lifts the layer in the fade-then-fold order of M2's windows, figures hidden everywhere, and on reverses it — evidence: test + strips at 390 and 360
- [ ] The hall-card star follows `vectors.json` `stars`; the badge number and dot follow the push work and clear on open or tap — evidence: test + device run
- [ ] A late busy reading leaves the title and letter fixed and rides the tabs and list down by D — evidence: test + frame strip
- [ ] Health Connect missing and the Search tile clamp match M2 on #606 and #611 — evidence: screenshot + measurement
- [ ] No explanatory caption appears anywhere in the UI (the star has an accessibility label only) — evidence: review

## Tasks (order)

1. Variant pickers — files: see Task 1 — lanes: common — blocked by: #566, #612 — PR:
2. Missing nutrients draw "–" — blocked by: #566 — PR:
3. Fountain Drink — blocked by: 2 — PR:
4. Hall open and close as one continuous card — blocked by: #612 — PR:
5. Tracking off as a layer lift, figures hidden — blocked by: 1, 2, #612 — PR:
6. Hall-card star and icon badge — blocked by: #612 (badge also by `flutter-port-alert-push`) — PR:
7. A late busy reading — blocked by: #612 — PR:
8. Health Connect missing → Play — verify #606 — PR: #606
9. Search tile clamp — verify #611 — PR: #611
