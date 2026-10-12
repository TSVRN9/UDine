# M2 critique, round 9 (before)

What the six round-9 items collide with in the round-8b build. The crops are in `../../r9a/` (`now-390.png`, `now-360.png`,
`hdr-360.png`): the Worcester header expanded and collapsed, the tomorrow variant, and Wasabi. Line numbers refer to `src.html`
at round 8b.

## The header

1. **There is no height left for a new pinned row.**
   - Collapsed, the header is three rows: the bar (ST + 52), the meal tabs (48) and the station row (48). That's 148 px plus
     the status bar.
   - With the tab bar and the plate bar, roughly 520 px of list is left on an 844 px screen.
   - A date strip or a second tab row costs 48 to 64 more px on every scroll position of every hall. So the day has to go into
     a row that already exists.
2. **The meal tabs already overflow at 360 px.** Worcester's five tabs need about 382 px, so at 360 "Grab 'N Go" is cut at
   the frame edge (`hdr-360.png`).
   - `#mtabs` is a non-scrolling flex row, so the cut tab is unreachable without tapping its sliver.
   - Anything added to that row makes this worse. The row has to scroll, and its scroller must stay out of the 24 px back-swipe
     edge zone (`menu` touchstart, `edge: x < 24`).
3. **The horizontal axis is the meals'.** A meal change is shared axis X (`sharedAxisX`, 30 px, in the direction of the tab).
   If a day change also slid sideways, Thursday lunch → Friday lunch and lunch → dinner would look like the same move.
4. **The day is half-built, as a special case.**
   - `S.mday` is 0 or 1, ids carry a `t.` prefix, and `BYK` and `SERV` hold today and tomorrow only.
   - "Tomorrow" is said in two places at once: `.tday` joins it to the name in the compact bar, and the status line
     becomes "Tomorrow, Friday".
   - Fifteen days can't be suffixes on a name. At 22 px, "Procrastination Station Wednesday" doesn't fit a 360 px bar.
5. **The meal set changes by day, and the code assumes it can't.**
   - Real gaps in the feed:
     - Oct 10 is empty everywhere;
     - weekends have no Grab 'N Go and no breakfast at Franklin, Hampshire or Berkshire;
     - Berkshire posts a breakfast on Oct 9 although it opens at 11.
   - `renderMenu` falls back to `meals[0][0]`, which throws on an empty day. A day change has to rebuild the tab row and choose
     a meal.
6. **The status line is the header's only "when", and it only works live.**
   - Today it says "Open until midnight", over the busy row, "Calmer around 1:30 PM" and the lamp board.
   - On another day the live parts disappear, and the name block sits where a café's does (`#menu.cafe .mt{bottom:22px}`).
   - So the header already has two layouts: live (a hall today, online) and still (another day, or a café). Offline is a third
     reason for still, not a new layout.
7. **Hours.**
   - `MEALWIN` is round 5's guess (lunch to 3:30). The real rule is `STANDARD_MEAL_WINDOWS` clamped to each hall's general hours.
     That ends lunch at 4:30, exactly when dinner starts.
   - So the between-meals gap disappears. Round 5's checked clocks change: posole at 3:45 PM is now "Lunch now, until 4:30 PM",
     not "Dinner from 4:30 PM". The plan's example vector (`"close": "3:30 PM"`) is stale.
   - `NOW` is 12:40 in `src.html` (line 576). The plan and the brief say 12:41.
8. **Directions have no data in the prototype.**
   - `map_address` isn't in `flows/locations-2026-10-08.json`. It's in the raw get_infov2 captures (`photos/raw/infov2.json`,
     Oct 8, and `rec/infov2-2026-10-11.json`), with `address` as an HTML blob.
   - All eight Campus Center cafés share one pin (42.3915402,-72.5292962).
9. **The Oct 12 event already sits on the wrong day.** Worcester's list today opens with "Indigenous Peoples Day, Mon, Oct 12".
   A second event, "Indigenous Peoples Day Hours", means that day's hours differ. One hours snapshot can't show that.

## Allergens and "Show all"

10. **"Show all" deletes the preference.** The `dietoff` action sets every diet flag to false and calls `save()` (line 1659).
    One tap on a hall's "Show all" erases the setting on every screen. That's tolerable for "vegetarian". For "peanuts" it's
    dangerous. Show all has to reveal dishes without touching the setting.
11. **Blank isn't safe.**
    - 787 of 3,106 dishes have an empty `allergens` field. Most are plausible (onions, rice, orange juice), but Corned Beef
      Hash and Halal Burger Patty are among them.
    - "Not listed" is not "none". Neither the hiding rule nor the line's wording may imply the remaining dishes are safe.
    - The values need normalizing (`"Corn  "`). The feed has 11: Corn, Soy, Milk, Gluten, Wheat, Eggs, Sesame, Fish, Shellfish,
      Tree Nuts and Peanuts.
12. **"Everywhere" isn't true today.**
    - `dietOK` runs only in `renderMenuList`. Search ignores Dietary preferences and has its own Vegetarian, Plant based and
      Halal lens chips, which overlap them.
    - Cafés' name lists, plate rows and the sheet's "where" ignore preferences too.
13. **The top of the list is becoming a stack.** Several lines can come before the first station: `gnote` (Grab 'N Go hours),
    `evnote` (an event), `dietnote` (Show all). Allergens, empty days and failures would add more. They need one order and one
    line per concern.

## Network states

14. **Nothing in M2 can fail.** Everything is embedded.
    - The real app has three feeds with different lives: bundled photos and names, hours (get_infov2, cacheable for the day),
      and live data (busy, which can't be cached meaningfully).
    - Menus are per hall per day, and they're cacheable.
15. **A photo band can't show "offline" with its photo.**
    - "Never blur or alter photos" rules out dimming or desaturating the rack.
    - Photos are bundled, so they never fail anyway.
    - Busy is live, so a cached meter would lie.
    - That leaves the rule M2 already has: missing data draws nothing. The band loses its meter, and still needs one honest
      place on Halls that says why.
16. **No retry gesture in the vocabulary.** Pull-to-refresh isn't in CONCEPT's motion table. Retry has to be a button.
17. **Loading has no precedent.**
    - Halls' rows are photos and names that are always there, so only the status and busy lines arrive late.
    - The hall menu's tabs come from the menu feed itself, so before it arrives there is no tab set to show.

## Cafés with dishes

18. **The café screen is a different code path.**
    - `#menu.cafe` hides `#mtabs`, `#mswitch` and `#mhist`.
    - `renderMenuList` returns early with `cafeBody`, and `relist` skips cafés.
    - The body leads with the description, Where and Payment, then a names list of `custom` adds. With dishes, the menu has to
      lead the way it does in a hall, so the description, Where and Payment need a new home.
19. **The feed has 18 non-hall locations, not 17.**
    - 16 are in M2's `places`.
    - Terrace (345 Lincoln Ave) and Charles River (the Newton campus) are both deliberately excluded in `build.py` (`CAFES`
      comment).
    - **Round 9b (owner):** Terrace is included (on campus, area 3, Fieldstone Apartments). Charles River is included behind a
      Charles River Campus toggle on You, default off.
20. **Café meals aren't M2's meals.**
    - The keys are `daily offerings`, `grabngo`, `breakfast`, `lunch` and `dinner`. Worcester Café has only
      `daily offerings`, and Roots' breakfast is beverages only.
    - `effectiveMealWindow` is defined for halls, so which café tab is "now" needs a rule.
    - A single-meal café would get a tab row of one tab.
21. **The names-list rule is empty on weekdays.** Every café with a standing names list (Worcester Café, Tavola, the six Blue
    Wall counters and Harvest Market) also has a feed menu. The rule only applies on days the feed is empty for that café:
    weekends, and for most cafés Oct 19 on.
22. **Café hours aren't one snapshot.** On Sunday Oct 11, get_infov2 had Green Fields and Wasabi "Closed" and Roots opening at
    10, against Thursday's 11 and 7. The "same every day" finding holds for the halls only.
23. **The plate model drops a café key.**
    - `plateHalls` filters through `HALLS`, so a café-only plate has `[]` halls (truthy).
    - So `canJoin` refuses everything, `hallLabel([])` is "", and the plate's label and Log read blank.
    - The rule has to be explicit: a café plate is its own place and never joins a hall plate, even for a dish of the same name.
24. **Price lives on the dish, not the place.**
    - 508 dishes have a price; one is also served at a hall ("Plant Based Chic'n Broccoli Supreme w/Pasta").
    - Station names carry prices too ("Cold Bar Items $11.50/LB"), against "rows never show price".
25. **Round 8's notes say cafés carry names only** ("Café menus carry names only (no scores in the feed)"). That's now false:
    café dishes have H and CR codes, so the score tiles apply.
26. **Search and the "where" lane have no mark for a café.** Hall letters are the four chenille squares. A café dish in Search,
    or a café serving in the sheet's "where", has no letter.

## Empty days

27. **The copy has to be true at the fixed clock.**
    - On Thu Oct 8, Oct 10 is in the future, so "no longer served" would be false there. The same goes for "past days".
    - From the student's side, every empty day reads the same way: nothing is posted for it yet.

## Geometry (found while writing the concept)

28. **The collapse math assumes two pinned rows.** `paint()` lays out `#mtabs` and `#mswitch` as `TABS_H + SW_H` under the bar,
    and `#menu.cafe` hides both. A café whose only pinned row is the station row (single meal), or an empty day, changes that
    height. The collapse, the clip insets and the scroll clamp in `switchMeal` all need the real row count.
