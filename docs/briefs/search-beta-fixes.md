# Search beta fixes: every UMass dish, a + that covers nothing, no first-letter hang, a real lookup button

Goal: in the Play closed-testing build 2.0.1 (7) (= main 05c15f58), Search finds every UMass Dining dish whose name
matches, not only the ones on a menu today or tomorrow. A row's + can be tapped without its stepper covering the
row. Typing the first letter doesn't freeze the screen. The "Search UMass Dining" control looks like a button. All four
were filed by the owner on 2026-11-17 and reproduced the same day on `Agent_Emulator` from a fresh internal profile
build of main.

Owner decisions (2026-11-17, in chat):
- "ALL umass items that line up with the search should be displayed, even if they aren't at a dining hall or retail
  location at the moment, since published menus are rarely ever complete"
- Catalog dishes are listed **with tracking off too** (they open to their nutrition, as menu dishes do; no +).
- The overlapping button is **a row's +**.
- "the buttons below search 'search umass dining' aren't styled appropriately"

## Spec

UI: M2 `#tab-search` (`docs/design/explorations/2026-10-ui-overhaul/flows/M2/src.html` `renderSearch`, `foodRow`,
`.lkb`/`.lkst`, `lookupHits`). This brief **departs from M2 on purpose** in two places: the UMass Dining group is fed
by the on-device catalog with **no cap** (M2's `lookupHits` keeps 10), and `.lkb` stops being a bare text link
(Task 4). The owner's words above are the decision of record. A Flutter oracle that asserts the old behaviour changes
and cites this brief.
Annotations: none.

States (each a real branch with a test; † = a screenshot in the PR):
- Task 1: a query matching catalog dishes on no menu today/tomorrow, tracking on † and off †; a query whose only
  catalog matches are already on a menu (no group); offline with a saved catalog; no saved catalog and offline (no
  group, nothing else changes); a lookup answer that repeats a catalog row (shown once).
- Task 2: a Search now row with hall tiles before and after its + is tapped † (record the tap), qty 1 and 2+, and a
  Later row with its tail tiles; Halls menu rows unchanged.
- Task 3: the first letter typed on a cold Search tab (record it), before and after.
- Task 4: the lookup button idle †, loading, none, failed, rate-limited, above the custom-food button, at 360 and 390.

Routes: `app/tool/screenshot.sh` against the internal profile build. Recorded data (`?data=recorded&at=2026-10-08T12:41`)
serves `/rest/v1/dishes` as `[]` (`app/lib/data/recorded/recorded_client.dart:131`), so Task 1 adds recorded catalog
rows (dishes that are on no recorded menu) or its capture proves nothing.

Backend: none. `public.dishes` is already anon-readable; `Repository.dishCatalog()` (`app/lib/data/repository.dart:435`)
already reads it as a once-a-day delta into the device cache and is tested, but **nothing in `app/lib/` calls it**:
the RN app searched it locally (`mobile/src/lib/dishCatalog.ts` `searchCachedDishes`), the Flutter port never wired
it. That, plus `lookup-dish` returning at most 3 candidates and its catalog check being an exact-name match, is why
Search misses most dishes.
Residency: "Dish nutrition catalog (`public.dishes`)": public, read-only; the device keeps a copy. No user data is
sent: the catalog is fetched whole, never by query.
Rationale: search the whole catalog on the device rather than widening `lookup-dish`: it is ~2.3k rows (2,287 on
2026-11-17), works offline and anonymously, costs no FoodPro budget, and reveals nothing about what anyone typed. The
lookup button stays as the fallback for a dish the catalog doesn't have yet.

## Acceptance

- [ ] Every catalog dish matching the query (`matchesQuery`) that is not already a Now/At cafés/Later row is listed in
  the "UMass Dining" group, uncapped, tracking on or off, online or offline. — evidence: test + screenshot
- [ ] Catalog rows open the food sheet; with tracking on, + logs them like a lookup hit today. — evidence: test
- [ ] Lookup answers already shown from the catalog aren't repeated. — evidence: test
- [ ] Search's first open starts the catalog load lazily, alongside the menus (never at app launch). — evidence: test
- [ ] A tapped +'s stepper never paints over the row's hall tiles or text, at qty 1 and 2+; the row doesn't jump. — evidence: test (geometry, not pixels) + recording
- [ ] The first keystroke on Search paints the typed letter and the results without a visible freeze; the PR names
  the root cause and shows before/after timings measured the same way. — evidence: test/benchmark + recording
- [ ] The lookup control reads as a button consistent with the custom-food button under it; its status slot lines up
  with it. — evidence: screenshot
- [ ] No explanatory captions added anywhere. — evidence: screenshot

## Tasks

1. Catalog in Search: start `repo.dishCatalog()` with the menus in `SearchController`, filter and dedupe against
   `index.served`, map rows the way `LookupRun.run` maps lookup hits (`UmassMenuSource`; `hallTid` as lookup-dish's
   `checkCatalogHit` fills it: `last_seen_hall_tid ?? 0`), show them in "UMass Dining" right after Your foods, not
   gated by `online`, shown with tracking off (FoodRow without a control). Recorded fixture rows. — files:
   `app/lib/screens/search/search_controller.dart`, `search_entries.dart`, `search_screen.dart`, `food_row.dart`,
   `app/lib/data/recorded/` — lanes: flutter — blocked by: none — PR:
2. Row + overlap: the stepper that replaces a Search row's + covers the hall tile(s) riding the meta line under it
   (`DishRow._tagSlot`/`_lane`, `RowControl`/`Stepper` in `app/lib/ui/stepper.dart`). Find where M2 puts the tiles
   when the lane holds a stepper and match it. — files: `app/lib/screens/hall/dish_row.dart`, `app/lib/ui/stepper.dart`
   — lanes: flutter — blocked by: none — PR:
3. First-letter hang: on the emulator, ~1.1 s passes between the keystroke and the first frame that shows the letter
   (the field doesn't repaint either), so the UI thread is blocked by synchronous work in `setQuery` → `_compute` →
   `runSearch`/`searchEntries`/build for a query that matches almost everything. Profile it (timeline on the profile
   build, or a benchmark over the recorded board), find the dominant cost, fix the cause. — files: likely
   `app/lib/core/m2/search.dart`, `app/lib/screens/search/` — lanes: flutter — blocked by: none — PR:
4. Lookup button: restyle `LookupButton` (`app/lib/screens/search/lookup_slots.dart`) as a ringed line button
   consistent with `CustomFoodButton` (`app/lib/ui/custom_button.dart`): same ring, radius, height, gutter; its
   `.lkst` states keep its place. — files: `lookup_slots.dart`, tokens if needed — lanes: flutter — blocked by: none — PR:
