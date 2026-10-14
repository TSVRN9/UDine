# M2 critique, round 11 (before)

Round 11 designs four things today's RN app does but M2 doesn't: packaged foods and saved custom foods, favourite
alerts, café PDF menus, and offline search. It also applies the owner's bowl decisions. The brief is
`docs/briefs/m2-round-11.md`. Line references are to RN on `main` (a6c5b0f) and to M2's `src.html` as of round 10.

## Today's search for things not on a menu (`mobile/src/components/PlateSheet.tsx`)

1. **It is a second search.** The plate sheet has its own search box. It is separate from the menu search, and it merges
   six sources: log history, the cached `public.dishes` catalog, today's cached menus, saved custom foods,
   OpenFoodFacts and USDA. A dish being served and a packaged bar are told apart only by a pill:
   `UMass`, `Custom`, `Packaged` or `USDA` (`BADGE_INFO`, :26). `USDA` names a data provider, which a student has no
   reason to know.
2. **Five rows at a time, then "Load More".** `VISIBLE_RESULTS = 5` caps the list, so a served dish can sit below four
   packaged hits.
3. **Per-100 g numbers read as a serving.** OFF and USDA search hits usually carry only per-100 g values. The row says
   "≈ 368 cal per 100g", which is honest, but the plate then adds "1" of it with no unit.
4. **"Search UMass Dining directly"** (`runDirectLookup`, `lookup-dish`) is manual and rate-limited, which is right.
   Its states share one gray row:
   - in flight: "Looking up clif…";
   - found: "Found 2 new foods";
   - none: "No new foods found";
   - rate-limited: "Live lookups are maxed out for the hour. Try again shortly, or search what's already on the menu."
     "Maxed out" is slang, and "shortly" is vague: the budget is global and resets on the UTC hour
     (`dish_lookup_rate_limit.hour_bucket`), so the true answer is "after 1 PM";
   - offline: "Couldn't search right now. Check your connection and try again." The same copy covers both a
     transport failure and a server error.
5. **"Can't find it? Create a custom food"** is a question addressed to a reviewer more than a student, and it sits
   under every search.
6. **Custom foods are saved without being editable.** `CustomFoodForm` always writes to `custom_foods`, and nothing in
   the UI calls `removeCustomFood`. A typo in a saved food lives forever. A custom food is reused only by typing
   its name into the plate search again.
7. **OpenFoodFacts' search was down when this critique was written.** `cgi/search.pl`, the endpoint `searchProducts`
   calls, answered 503 ("Page temporarily unavailable") at 2026-10-13 22:00 EDT, twice. `searchProducts` treats
   that as an error, and the whole search shows its error row when every source rejects. A packaged-food failure is
   a normal state, not an edge case. The newer search service (`search.openfoodfacts.org`) answered at the same time.

## M2: Search and custom foods (round 10)

8. **A custom food is one-off.** "Add “x” as a custom food" opens a four-number form (`openCustom`), and the item goes
   on the plate as `custom`. Nothing is kept, so the same yogurt is typed again tomorrow.
9. **There are no packaged foods.** A search for "clif" says "Nothing called “clif” is on any menu today or tomorrow"
   and offers only the form.
10. **Search ignores the network.** `?net=offline|fail` reaches Halls and the hall screen (round 9), but Search reads
    `BYK`, `CBYK` and `SERV` as if every menu were always present. NOTES "Round 9", Open, already flagged it.

## Today's favourite alerts (`mobile/src/lib/backgroundTask.ts`, `notificationHandler.ts`, `sightingDedup.ts`)

11. **It never asks for permission.** Its own ponytail note says so: nothing requests `POST_NOTIFICATIONS` for a
    signed-out device. On Android 13+ the sighting is claimed in `food_sighting_dedup` and the notification is
    silently dropped, never retried.
12. **It can't be turned off or on.** There is no switch. Starring a dish is the opt-in, and the student never learns it
    is one.
13. **One notification per dish per hall.** The dedup key is (dish, hall, date). A favourite at Worcester and
    Berkshire posts twice.
14. **The copy says the hall, not the meal or the time.** Title: "Beef Brisket Noodle Bowl is at Worcester Dining
    Commons today". Body: "A favorite of yours is on today's menu." The body repeats the title. Neither says lunch or
    when.
15. **Tapping it opens nothing.** There is no response listener: the app comes to the front wherever it was.
16. **It can post when it's useless.** A run that first sees a lunch-only dish at 9 PM still posts it.
17. **Blocked background work is invisible.** iOS Background App Refresh off, or Android's "Restricted" battery
    setting, stops the task. Nothing tells the student that alerts can't run.

## Today's café PDF menus (`shared/src/content.ts` `parseRetailMenuHtml`, `CafePdfViewer.tsx`)

18. **Only the first PDF is reachable.** `parseRetailMenuHtml` runs one `exec` for the first `<a>`. The live feed
    (`uapp/get_infov2`, 2026-10-13) gives The Commonwealth Restaurant four PDFs: Lunch, Lite Fare, Dinner and
    Dessert. RN shows the Lunch menu only.
19. **The feed's link text is the title.** The viewer's subtitle reads "Click here for the Lunch Menu · PDF".
20. **Nothing is kept.** Each open downloads to `cafe-menu-${Date.now()}.pdf`, so a menu opened an hour ago doesn't open
    offline.
21. **Errors print the exception.** "Couldn't load menu: menu download failed (HTTP 404)", with an uppercase RETRY.
22. **It is a full-screen modal** with its own slide (`animationType="slide"`), not M2's push. Back is a "‹" glyph, and
    "SAVE ⬇" shares the file.

## M2: cafés without a dish menu (round 9 §5)

23. A café with a PDF reads exactly like one with nothing: its description, "Menu", "… doesn't list its menu in the
    app" and Add a custom food. The Commonwealth Restaurant, the only PDF café open this week, isn't in M2 at all.
    `build.py` leaves it out, with the babyBerk trucks.

## M2: bowls as built in round 10

24. **The natural-base rule picks the wrong base, or none, on 28 of 82 hall Noodle Bowl station-days** (table in NOTES
    "Round 11"):
    - **No base, 20 station-days**:
      - 15 pho bars (three broths, noodles, proteins and toppings) have no dish of 120 cal or more without "broth";
      - single-dish Chicken Congee (49 cal), three times at Hampshire, is under 120 cal;
      - Hampshire's katsu curry on Oct 9 has nothing over 120 cal;
      - "Shrimp Tom Yum Soup (Chicken Broth)" on Worcester's Oct 19 is excluded by the word "broth" in its
        parenthesis. That is the case the owner predicted.
    - **Two bases, 8 station-days**:
      - Mayu (Black Garlic Oil, 215 cal) beside Kumamoto Style Ramen;
      - Soy Braised Pork Belly (229) beside Tonkotsu Ramen (145 or 159) five times, and beside Shoyu Ramen Bar once;
      - Roasted Crispy Pork Belly (438) beside Bun Heo Quay.
    - `buildOf` accepts any dish that passes `isBaseAt`, so two-base stations build twice.
25. **Synthetic names** read "Your salad from the Salad Bar" and "Your sandwich from the Deli Bar". "Cold Bar" and
    Harvest Market's by-the-pound salad bar get a synthetic base. The owner has removed both.
