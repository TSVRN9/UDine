# Flutter port: Search and events

Goal: in the Flutter app a user can find any dish being served now, later today, tomorrow or at a café,
narrow by lens, jump to a hall or café, and add a dish straight to the plate. Search's idle state carries
this week's events, each opening its event page.

Roadmap and global decisions: `docs/briefs/flutter-port.md`.

## Spec

UI (M2, `docs/design/explorations/2026-10-ui-overhaul/flows/M2/`; `renderSearch` around 1600):
- **Field and lens chips:** Vegetarian, Plant based, Halal, High protein, Light, Low carbon, Favorites.
  The keyboard stays up between picks. NOTES "Round 2" to "Round 5".
- **Idle:** the event cards carousel.
- **Results:**
  - **Places:** hall cards (76 px, with a container transform into the hall; NOTES "Round 9c", "Hall card
    in Search") and place rows with thumbnails;
  - **dishes now,** with each hall's letter (W, F, H, B);
  - **"Later today and tomorrow";**
  - **"At cafés"** (CONCEPT R9 §5);
  - the custom-food call to action when nothing matches (opens `flutter-port-dish-and-plate`'s form).
- **A dish row** adds to the plate (`+` and stepper as in the hall menu) and opens the dish sheet over
  Search (`compare-searchdetail.png`).
- **Event page** (push): the framed felt banner, plus "See the menu" or "Holiday hours" (NOTES "Round 3",
  "Round 5b", "Round 7"; `compare-eventopen.png`, `compare-events.png`, `compare-evnote.png`). It's the
  bake-off's `event_page.dart` at its 640 height.
- **Charles River places** follow the You toggle (`flutter-port-halls`).

Annotations: none.
States:
- idle with events, and idle with no events this week;
- typing with results in every group;
- a query with only later results, and one with only café results;
- each lens on;
- a lens with the Favorites set empty;
- no match (the custom-food call to action);
- the dish sheet over Search;
- the event page with each button.

Routes: `/search`, `/search?q=pizza`, `/search?lens=halal`, `/event/<id>`. Record hall card →
hall, dish row → dish sheet → drag down, and event card → event page → back, each with `--record`.

Backend: none (reads cached menus and events through `flutter-port-menu-data`).
Residency: none. Favorites are device-only.
Rationale:
- **Matching is `core/search.dart`'s `matchesQuery`.** It's the token-AND matching `main` shipped in
  #541 ("White Pizza" finds "White Cheese Pizza"), checked by the shared vectors.
- **Search runs over every place's cached days.** It doesn't fetch on each keystroke. Days not yet cached
  are fetched once when Search opens, through the repository's prefetch.
- **The packaged-food lookup is out.** `lookup-dish` and OpenFoodFacts/USDA wait for `m2-round-11`.
- **Offline search (owner, 2026-10-13: "I'd like there to be offline search").** Search works offline
  over every saved menu. M2 doesn't model Search offline or failed yet (the prototype ignores
  `?net=fail`), so how it reads is designed in `m2-round-11` item 4. Task 3 builds that design.

## Acceptance

- [ ] Goldens at 360 and 390 for every state above, and M2 DOM measurements for the field, chips, hall
  card, place row, dish row and event card within 1 dp — evidence: test
- [ ] Device screenshots of each state next to M2's own render — evidence: screenshot
- [ ] Frame strips of hall card → hall, dish sheet over Search, and event open/close next to M2's
  `compare-hallresult.png`, `compare-searchdetail.png` and `compare-eventopen.png` — evidence: screenshot
- [ ] `M2/vectors.json` search cases (groups, order, lens filtering, the Charles River filter) pass —
  evidence: test
- [ ] Offline, Search returns results from every saved place and day with no network call, and shows
  M2 round 11's offline state — evidence: test + an A53 run in airplane mode
- [ ] Typing never drops a keystroke or reorders results under the finger. Results update within one
  frame of the last keystroke on the A53 for a 2-letter query — evidence: test + numbers in the PR

## Tasks

1. **Search** — field, lenses, the result groups, add from a row, dish sheet over Search, the no-match
   call to action — files: `app/lib/screens/search/` — lanes: flutter — blocked by: hall-menu 1,
   dish-and-plate 1 — PR:
3. **Offline search** — the round-11 design for Search offline and failed, built on the cached-days index
   from Task 1 — files: `app/lib/screens/search/` — lanes: flutter — blocked by: 1, m2-round-11 1 — PR:
2. **Events** — the idle carousel and the event page (from the bake-off), with "See the menu" landing on
   the event's day — files: `app/lib/screens/search/events*.dart`, `app/lib/screens/event/` — lanes:
   flutter — blocked by: 1 — PR:
