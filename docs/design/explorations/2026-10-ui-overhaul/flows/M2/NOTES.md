# M2: Hall-first plus search, varsity identity, one motion model

**M2 round 5** is at the end of this file ("Round 5"), with `CRITIQUE-r5.md` and the round 5 concept in `CONCEPT.md`. It supersedes the round 4 "where and when" grid described below.

**M2 round 4.** Three owner notes.
- **Events are cards again.**
  - Search's idle state shows a row of M1's event cards: the event's own banner in the white felt edge with gold stitching, then the title and a gold date. Native scroll-snap shows a peek of the next card.
  - Opening a card is the container transform, with the banner as the shared element (it moves and resizes into the event page's framed banner), as the hall photo does.
  - 0 events: the band is absent. 1 event: one full-width card (`?events=1`).
  - The quiet in-menu note stays a row on chalk.
- **Pinned cafés are full-bleed strips under the hall bands** (`compare-pins.png`: round 3's grid against round 4's strips, 0, 2 and 5 pins).
  - Each strip is 56 px, half a hall band, with no letter.
  - It uses the café's own photo in full colour with a neutral dark grade, not the halls' maroon duotone.
  - Name in Oswald 20 with live status under it, kept in the left 70%.
  - `node contrast-pins.js` measures all 27; worst 6.05:1.
  - Opening one is the container transform with the photo continuous into the café page header.
- **Where and when is a grid, not a list.**
  - **Search rows** carry four hall letters, W F H B, with the halls serving it now filled. Screen readers hear "Served now at Worcester, Franklin, Hampshire and Berkshire".
  - **"Later today and tomorrow" rows** carry the meal they're next served at ("Dinner", "Tomorrow") and the same four letters for that serving.
  - The letters replace the plate-halls highlight. Plate compatibility is still shown by the outlined `+`.
  - **Dish detail** has a Today / Tomorrow switch and a grid: hall letters down the side, the meals served that day across the top.
    - Cells: maroon = served, gold = served now (gold means now everywhere, as on the busy lamp board), pale = served earlier today, blank = not served.
    - Each served cell is a 44 px button labelled "Served at Hampshire, lunch, tomorrow". Tapping it returns the detail to its row and opens that hall at that meal and day, scrolled to the dish.
  - There is no legend: the axes carry the real hall letters and meal names.

**M2 round 3.** Two owner notes.
- **"The white flash between panes is a little too much."** The Halls / Search / You switch no longer dips to the ground.
  - Every pane is opaque.
  - The outgoing pane stays drawn underneath while the incoming one fades in over it, settling from a 0.97 scale over 250 ms (M3 medium1, standard decelerate).
  - The maroon header region and the tab bar are never uncovered.
  - This deviates from MDC's fade-through (out by 35%, in from 35%, 450 ms), which is what made the dip.
  - Meal tabs now overlap their fades too.
  - `test.js` samples frames during each tab switch and fails if one is more than 8 points whiter than the panes at rest.
  - `whiteness.py` reports the same measure for every recorded interaction. None flashes: the remaining "excess" rows are content that really is white (the You pane, search results replacing the maroon events list).
- **Pinned cafés use UMass Dining's own location photos** (`assets/retail/`, 640×341, sources in `index.json`, embedded at q80 with no retouching). There's no varsity letter, so the Wasabi "W" clash is gone.
  - Pins are a 2-up grid of rounded photo cards at the top of Cafés & markets: inset, half width and rounded, so they stay secondary to the four full-bleed bands.
  - Each card shows the name and live status over a deep-maroon gradient. The gradient is graded only for AA: `node contrast-pins.js` pins all 27 and measures white text over the brightest pixel behind it, worst 6.55:1.
  - The café page is headed by the same photo, and opening from a pin (or a thumbnail) is the container transform with the photo as the shared element, moving and resizing from the card to the header.
  - The café browser and Search's place results (cafés and Grab 'N Gos) carry 64×34 thumbnails of the same photos.
  - `compare-pins.png` shows round 2's rows against round 3's cards with 0, 2 and 5 pins; `shot-pins.png` is round 3.

**M2 round 2 (owner: "the transitions still don't make much sense").** Motion is now strictly Material 3 and iOS zoom conventions: container transform for every card → screen (with interactive drag-back), fade through for Halls / Search / You, shared axis X for meal tabs, standard bottom sheets for the plate and station list, and in-place updates for everything else. The "+62" toss is cut. Also: the hall-header search button is gone; places are first-class in Search; dishes show where and when they're served today and tomorrow; cafés can be pinned to Halls. See `CONCEPT.md` and the motion inventory below.

**M2 round 1 (superseded by round 2 above: the +62 toss, band-edge unfolding and grow-from-edge motion described here are gone).** Read `CRITIQUE.md` (what was wrong with round 4, interaction by interaction, frames cited) and `CONCEPT.md` (the model and tokens). M1 is untouched; `compare-<interaction>.png` shows M1 above M2 for every recorded interaction, made by `rec.js` + `strips.sh`. In short:
- **One model:** what you tap grows into what it stands for and shrinks back (hall band, dish row → detail, rows → pages, station row → roster, plate bar → plate sheet). Calories travel: `+` tosses "+62" into the plate, `−` sends it back, Log sends the plate into You, Undo brings it out.
- **Cut as decoration:** number rolls, the bar bump, the You-icon bounce, count-ups, row flashes, meter and lamp fill-ins, the landed-station flash, tab fade-ups, and every overshoot.
- **Re-derived:** the station switcher is the header's last row; badges are stitched gold-felt patches; grades and Contains live in the label's rule system; busy is one lamp encoding; events are a fixture list under the lens chips.
- **Two M1 bugs fixed:** tapping the plate bar now opens the sheet (M1's scrim caught the click and closed it again), and a meal-tab switch no longer shows Halls through the menu.
- **Layout:** `+` → stepper no longer re-wraps the dish name (the control lane is reserved), and a lens chip no longer jumps 190 px.


Open `index.html` (1.1 MB, self-contained. The 400 KB budget was lifted. Photos are now q82, event banners 840 px wide at q78, and the full menu carries every published nutrition field and ingredient list).

Boot states: `?state=` `menu` (optionally `&hall=F|H|B`), `collapsed`, `index`, `search`, `typed`, `lens`, `nomatch`, `places`, `custom`, `dish`, `plate`, `split`, `logged`, `you`, `franklin`, `cafes`, `place`, `event`.

Debug params:
- `?progress=0…1&hall=X` freezes the hall transition at that progress.
- `?scroll=px&hall=X` freezes the header collapse.
- `?slow=N` plays every hall transition N times slower.

**Round 4 changes.**
- **Hall transition.** Only the tapped band moves.
  - It lifts out as its own layer and expands into the header over a Halls screen that never moves.
  - Halls dims as one unit underneath, and the empty slot shows deep maroon.
  - Close is the exact mirror.
  - `test.js` checks that every other band, the Halls header and the café rows have identical rects in every sampled frame of open and close, for Worcester and Hampshire.
- **Events moved to Search's idle state.** Halls is compact again: Worcester's band starts at y ≈ 137. See (c).
- **Station switcher.** The station titles in the list are plain text now. One pill control, pinned under the meal tabs, shows the current station and opens the jump list. See (c).
- **Full labels.**
  - Tapping a dish row's name or body opens the dish detail: an FDA-style Nutrition Facts panel, allergens, marks, the Healthfulness and Carbon grades, and collapsible ingredients.
  - The plate sheet has a "Full label" button.
  - The data is `menu-full-2026-10-08.json` (every `data-*` field). See (c) for how the grade scales were verified.
- **Feedback everywhere,** built on a token motion system. See the inventory below. The Search header's sushi photo is restored.

**Round 3 changes.**
- **Hall photos are used as UMass Dining publishes them** in its own app. All grading happens in CSS: duotone on the bands; full colour plus a gradient in the header, like Worcester.
- **The search bar on Halls is gone.** The Search tab covers it, and the search button in each hall header remains.
- **An events carousel sits where the search bar was.**
  - "From UMass Dining" is gone.
  - The newsletter is cut entirely.
  - Press stays out; see (c).
- **Budget cuts to fit 400 KB.**
  - The Search tab header lost its sushi photo; it's a plain deep-maroon header now.
  - The three interior hall photos are re-encoded at q40.
  - Worcester stays at round 2's q58; I compared 1:1 crops, and q40 showed banding on its glass.
- `?events=0|1` boots the carousel with 0 or 1 events.

**Round 2 changes.**
- Cafés and events got real homes, built on `get_infov2` and `get_beacons_events` data.
- The four halls show real hours.
- Each hall has a busy meter, and its header has a typical-day curve.
- The hall transition and the header collapse are rebuilt on a single progress value, so every element moves on the same frame.

## (a) The flow

The structure is the one students already know: pick a hall, then see its menu by meal and station. M1 keeps it, makes Search a peer of it, and fixes the weak parts.

- **Three tabs: Halls, Search, You.** The plate bar sits above the tab bar on every tab.
- **Halls.** A deep maroon header shows "Lunch", then the four photo bands.
  - Each band is a maroon duotone of the hall's photo with its gold chenille letter.
  - Each band shows its real hours ("Open until midnight") and a quiet five-segment busy meter with a word ("Busy").
  - Under the bands, **Cafés & markets** is four area rows, each with an open-now count.
- **Opening a hall** is the model every other transition follows (M2: rows grow into details and pages the same way).
  - The band's photo window expands into the menu header, and the colour photo develops under the duotone.
  - **M2 r2: a Material container transform / iOS zoom.** The band's rect grows to the full screen. The photo is the shared element. The band's letter and text fade out over the first 30%. The whole hall screen (header text, back button, meal tabs, station row, list) fades in over the last 70% in its final layout. Nothing travels out of an edge.
  - Halls itself never moves: it dims as one unit under a 32% scrim.
  - Scrolling collapses the header into a compact varsity-maroon bar.
  - Closing plays the same frames in reverse. Drag down from the top, or swipe in from the left edge, and the screen shrinks toward the band under the finger; release past the commit point to finish, otherwise it springs back.
- **Hall menu.**
  - Meal tabs only list meals the hall actually serves: Franklin and Hampshire have no Late night, and Berkshire has no Breakfast.
  - Station names in the list are plain titles. The header's last row shows the current station and grows down into the station roster.
  - Rows have a `+` that becomes a stepper, which steps `+`/`−` through 1 → ½ → remove.
- **Search** covers every hall's current meal, or one hall and meal when opened from inside a hall.
  - Lens chips filter the results.
  - Results add straight to the plate, and the keyboard stays up between picks.
  - When nothing matches, the next step is a custom food.
- **The plate** belongs to the set of halls that serve everything on it (F1's mechanism). An add that can't join that set starts a second plate instead of asking a question. **Log** is on the bar, and only there. The bar grows into the plate sheet (drag or tap) and stays its top edge; the sheet drags between two detents and rubber-bands past the top.

```
 Halls tab ──tap band══(photo expands, colour develops)══▶ Hall menu ──scroll──▶ compact maroon bar
   │                                                   │ meal tabs (served meals only)
   │                          │                       │ station row ─tap─▶ roster grows ─tap─▶ shrinks + scroll  
   │                          ▼                       │ + / stepper (1 → ½ → remove)
 Search tab (the only search: M2 r2 removed the hall header's button)
   │ field + lens chips; results carry hall letters W F H B; + keeps keyboard up
   │ no match ─▶ "Add “…” as a custom food" ─▶ form sheet ─▶ plate
   ▼
 plate bar (halls ∩ of every item) ──Log──▶ "Logged Worcester lunch, Today 802 cal" + Undo
   │ drag up / tap ─▶ plate sheet (mid ⇄ large, rubber band) ─▶ Log N items / Log at {hall}
   │ swipe sideways ─▶ other plate (an incompatible add made it, no dialog)
 You tab ─▶ today's Nutrition Facts, meals logged, Favorites, Dietary preferences, Which was better?, Export
 Halls ─▶ Cafés & markets: 4 area rows ("North, by Worcester · 7 of 7 open now")
            ─▶ Cafés page (Open now chip, areas as sticky headers, nearest area first) ─▶ café: hours, building, payment, menu ─▶ + = custom food

 Search ─▶ "Places" group (halls, Grab 'N Gos, cafés by name, building, area or menu item) above the dishes
```

## (b) Benchmark: Worcester lunch, Beef Brisket Noodle Bowl ×1 + Golden BBQ Chicken Thigh ×2

`node test.js` drives every path with real CDP touch input. Each path asserts:
- the meal is logged at Worcester;
- the plate is **404 cal and 38.9 g protein**, using Worcester's 218-cal brisket, not Berkshire's 220;
- the day total goes from **398 to 802**, both in the state and on the bar's "Today" number.

| Path | Steps | Taps | Typing | Drags | Scrolls |
|---|---|---|---|---|---|
| **A. Search tab, brisket first** | Search tab (field focused, keyboard up) → type "brisket" → `+` (plate is "Worcester or Berkshire lunch") → type "bbq" (the old query is pre-selected, so it's replaced) → `+` (plate narrows to Worcester with no prompt) → stepper `+` → **Log** | **5** | 10 chars | 0 | **0** |
| B. Hall + station index | Worcester band → flick (Golden BBQ sits half under the tab bar) → `+` → `+` → tap the station switcher → Noodle Bowl → `+` → **Log** | 7 | 0 | 0 | 1 |
| C. Hall + scrolling | Worcester band → flick → `+` → `+` → scroll past 12 rows (about 870 px) → `+` → **Log** | 5 | 0 | 0 | about 870 px: 2 flicks on a phone; headless Chromium has inconsistent fling momentum and took 2 or 7 short drags across runs |
| Today's app (BRIEF) | Worcester → `+` ×3 → Log, scrolling past ~20 dishes | about 5 | 0 | 0 | long scroll past ~20 dishes |
| F1 (dish-first feed) | `+` → `+` → `+` → Log | 4 | 0 | 0 | 0 |

- **Drags.** No benchmark path needs one. Reviewing the plate before Log is optional: +1 drag (pull the bar up) or +1 tap on the bar.
- **Keyboard and Log.** While the search field has focus, the plate bar is lifted above the on-screen keyboard (`visualViewport` offset; the tab bar hides meanwhile), so Log is reachable without dismissing the keyboard. `interactive-widget=resizes-content` covers Android Chrome. **Not verified on a device.** If the lift fails on iOS, path A becomes 6 actions (dismiss the keyboard, then Log).
- **Honest reading.** The search path matches today's tap count and removes the hunt entirely. It is one tap behind F1, because F1's home screen *is* the feed, while M1 keeps the hall-first home the owner asked for.
- **Hall path.** It is today's count with the scroll cut to about two flicks, or traded for two taps through the station index.
- **Within the hall:** the photo header is about 306 px with a 24 px status bar, plus the meal tabs. It grew 26 px in round 2 to hold the busy row and the typical-day curve. Golden BBQ sits below the fold, so the hall paths need a flick, as before. That's the price of the signature header, and the first flick also collapses it. The tap and scroll counts didn't change.

The driver also checks:
- **Keyboard:** `document.activeElement` is still the field after every pick.
- **Plate sheet:**
  - a bar drag-up settles the sheet at a detent;
  - an over-drag springs back to the large detent;
  - a fling down closes it.
- **Second plate:** adding Hampshire's BBQ Pulled Pork while the plate is W/B starts a second plate, with no dialog.
- **Ambiguous hall at Log:** a brisket-only plate gives "Log at Worcester / Log at Berkshire" inline, and Berkshire logs it at 220 cal.
- **Custom food:** no match → custom food → plate.
- **Stepper:** `−` steps 1 → ½ → remove.
- **Navigation:**
  - the reverse transition back to Halls;
  - every tab;
  - every You subpage;
  - no page errors.
- **Round 2:**
  - Real hours are on the bands: Worcester 07:00–23:59 shows "Open until midnight", Franklin "Open until 9 PM".
  - An area row opens the Cafés page; the Open now chip toggles; all 27 cafés are open at 12:40.
  - Wasabi's detail shows "Open until 9 PM", and its California Roll `+` opens the custom-food form with the name filled in.
  - The event banner opens its page.
- **Round 3:**
  - The events list shows 4 rows: Indigenous Peoples Day merged with its Hours entry, soonest first.
  - The first row's date reads "Mon, Oct 12".
  - The Worcester band starts above y = 320.
  - A row opens its event page with "See the menu" and "Holiday hours".
  - `?events=0` shows no events band.
- **M2:**
  - Fling-down closes the plate sheet back into the bar (the bar returns to its own slot); a plain tap on the bar opens the sheet with the bar on top; tapping the scrim closes it.
  - `+` → stepper leaves the row's height unchanged (no re-wrap).
  - Tapping a lens chip leaves the chip row where it was and removes the events list.
  - Search for "coffee" finds People's Organic Coffee; search for "worcester" opens the hall.
  - During the transition, the source band is hidden while its header is up.
  - The header's clip-path is `none` at rest.
  - Closing from a collapsed header restores the band and puts Halls back in place.

## (c) Where every "must have a home" feature lives

| Feature | Home in M1 |
|---|---|
| Dietary filters | Lens chips in Search: Vegetarian, Plant based, Halal; plus High protein and Light. The You tab's Dietary preferences hide non-matching dishes in hall menus, with a "Showing vegetarian dishes / Show all" line so the filter is never invisible. |
| Favorites | Tap a dish row's name or body to open the dish detail, then ☆ Add to favorites. A ★ shows on the row. There's a Favorites lens in Search, and You → Favorites says where each favorite is served at lunch today. |
| Half servings | The stepper's `−` goes 1 → ½ → remove, in menus, search and the plate sheet. |
| Bowl composer | **Not built, and no control for it is rendered.** It slots in as a "Build a bowl" row at the top of build-your-own stations (Noodle Bowl, Pasta Bar, Deli Bar, Hampshire's pho parts). That row opens the same info sheet, with base and toppings as steppers, and adds as one plate item. |
| Search and custom foods | **The Search tab only.** M2 r2 removed the search button from the hall header ("redundant with the Search tab"); the scoped-search code (`S.scope`, the "At …" chip) is now unreachable and left in place. **Places are first-class results:** every hall, Grab 'N Go and café matching by name, building, area or menu item, with live status, above the dishes; a row grows into its hall or café. **Where and when:** each dish row lists its upcoming servings ("Franklin lunch and dinner, Hampshire lunch", then "Tomorrow: Hampshire lunch"); dishes that match but aren't served now sit under "Later today and tomorrow". The "now" rule: it's Thursday 12:40, so today's breakfast is over, lunch is now, dinner and late night are later, Grab 'N Go goes by its own hours, and all of Friday (`menu-full-2026-10-09.json`) is tomorrow; next servings first. No match leads to "Add “…” as a custom food", which opens a form sheet (name, cal, P/C/F). The same button sits quietly under partial matches. Custom items don't constrain the plate's hall. Cafés have the same custom-food button. |
| Head-to-head ranking | You → Which was better? This pairs dishes from your on-device log and ends in your order. It's shallow and doesn't yet derive favorite halls. |
| Cafés (27, real data) | **Pins (M2 r3).** A pin button in the café page's top bar (Material's push-pin; filled gold when pinned) pins or unpins it. Pinned cafés appear as a 2-up grid of photo cards (UMass Dining's own location photos, no letter or patch) at the top of Cafés & markets, under the four hall bands, with name and live status. They open by the container transform with the photo continuous into the café page's photo header. With 0 pins Halls is exactly as before (`shot-pins.png` shows 0, 2 and 5). Pins are stored on the device in localStorage (`udine-m2`, inside try/catch), in the order pinned. Reordering isn't built; it would be a long-press drag on the pinned rows. Below the pins, **Cafés & markets** still opens the full browser.<br>**Halls → Cafés & markets.** This is four area rows, each with "N of M open now", in place of a list that couldn't scale:<ul><li>Campus Center (12)</li><li>North, by Worcester (7)</li><li>Library and academic core (4)</li><li>Southwest, by Hampshire and Berkshire (4)</li></ul>An area row opens the **Cafés page**:<ul><li>an Open now chip, on by default;</li><li>areas as sticky headers;</li><li>each row shows the name, the building, and status from real hours ("Open until 2:30 PM" or "Opens 11 AM").</li></ul>**Near me now** works without location. Areas are named after the hall they're near, and on the Cafés page the area nearest the hall you last opened sorts first (on-device). The area rows on Halls keep a fixed order, so Halls never changes behind the hall transition. Real geolocation could later sort by distance, also on-device.<br>**Café detail:**<ul><li>status and hours, building, payment, and UMass's own description;</li><li>**Menu:** the real item list where `get_infov2` has one (Wasabi, Tavola, Tamales and others). Each item's `+` opens a custom food with its name filled in, since there are no macros yet; FoodPro Web INA is the future source.</li><li>Cafés without a list get "doesn't list its menu in the app" and "Add a custom food".</li></ul>**Search** finds cafés by name, building, area or menu item ("burrito" finds Tamales).<br>Left out: the Newton campus, the babyBerk trucks, Terrace and The Commonwealth Restaurant. |
| Grab 'N Go | A meal tab in each hall's menu, which leads with its own real hours ("Closed for today, 7 AM to 11 AM" at Hampshire). Search finds "Worcester Grab 'N Go" and similar, and opens that tab. |
| Events | **Primary home: the Search tab's idle state, under the lens chips.**<ul><li>**M2:** a fixture list on the deep-maroon band (title in white, date in gold Oswald), not a flyer carousel.</li><li>A row grows into the event page, where the flyer appears framed as a stitched patch.</li><li>Typing, a lens or a hall scope removes the list in the same frame, and the results glide up into its space. The chips sit above it, so they never move under the finger.</li><li>0 events: the band is absent.</li></ul>**Contextual surfacing:** an event tagged for all DCs that falls within a week is the same row, on chalk, at the top of every hall's menu. The feed has no scope field; the all-DCs tag comes from the flyer text and is hard-coded for Indigenous Peoples Day in `build.py`.<br>**Data rules are unchanged:** expired events are dropped, "X Hours" is merged into "X", and the date wording is the same as round 3. |
| Station navigation | **The station is the header's last row:** a deep-maroon row with the current station in gold Oswald and a chevron. In-list station names are plain titles. **M2 r2:** tapping the row raises a standard bottom sheet listing the stations with dish counts, the current one marked. Picking one closes the sheet and scrolls there on the emphasized curve. There is no landing flash; the row's name is the "you are here". Path B keeps the same 7 taps. |
| Dish detail and labels | **M2 r2: a container transform from the row** (500 ms, emphasized; the row's content fades out over 30%, the detail's in over 70%). Dragging it down, or tapping the scrim, returns it to its row. **Served:** every upcoming serving across halls, meals and days, next first; tapping one returns the detail to its row and that row grows into the hall at that day and meal, scrolled to the dish (tinted). Tomorrow's hall screen says "Tomorrow, Friday" instead of live hours and busy, and its dishes have no `+` (the plate is today's). **Grows out of the row's name or body** (the row is hidden while it is the sheet), in hall menus and Search results; `+` stays add. Contents:<ul><li>name and serving;</li><li>dietary patches;</li><li>**Contains** as a ruled label row;</li><li>Add to plate, which shrinks the sheet back into the row and then tosses the calories to the plate;</li><li>the FDA-style **Nutrition Facts** panel, same as M1;</li><li>a second ruled panel with **Healthfulness** (seven maroon lamps, "3 of 7") and **Carbon rating** (A–E tags, the dish's letter filled, then its band in words: "Medium: 3 to 4.25 kg CO₂e per kg of food");</li><li>ingredients clamped to 3 lines, with "Show all".</li></ul>**%DV:** the menu's own value when published. Otherwise it's computed from FDA daily values (saturated fat 20 g, cholesterol 300 mg), because the feed leaves those blank. Sugars has no %DV, as on FDA labels.<br>**Plate sheet → Full label:** the same panel summed over the plate, quantities included, growing out of the Full label button. It never shows a carbon grade: grades are per kg of food and don't sum across a plate. The benchmark plate is 404 cal and 1,913.7 mg sodium (83%). |
| Badges and grades | **M2: embroidered patches.** One mark set, drawn as SVG glyphs: filled leaf for plant based, outline leaf for vegetarian, ringed H for halal, a pin for local, a loop for sustainable.<ul><li>**Inline on rows:** only the leaf, as a 20 px gold-felt square with dashed maroon stitching. It has the same footprint as the W F H B hall tags and the same material as the chenille letters. It is glued to the name's last word, so it never wraps alone.</li><li>**Detail view:** the same patch, larger, with its word.</li><li>**Lens chips** carry the same glyphs: Vegetarian, Plant based, Halal, plus "Low carbon" (A or B).</li></ul>**Healthfulness:** higher is healthier (umassdining.com/nutrition/health-wellness: a healthy factor adds a bar, an unhealthy one deducts one; the label reads "n/7").<br>**Carbon rating, confirmed from primary sources.** UMass Dining's Climate-Conscious Dining page (localumass.com/climate-conscious-dining) says the ratings are "powered by My Emissions" and measure kgCO2e per kg of product across farming, processing, transport and packaging. The bands:<ul><li>A, very low: 0–1.75</li><li>B, low: 1.75–3</li><li>C, medium: 3–4.25</li><li>D, high: 4.25–5.5</li><li>E, very high: 5.5+</li></ul>My Emissions' own page (myemissions.co/articles/food-carbon-labelling) gives the same thresholds. UMass's page says "By choosing A or B-rated meals, you can significantly reduce your daily carbon footprint", so the **Low carbon lens (A or B) is UMass's own guidance.** The feed carries only the letter (`carbon-list`), never the number, so detail shows the band, not a figure. Grades are per kg of food, so they are never summed or averaged over a plate.<br>`H3` = healthfulness 30 = 3/7, and `CR3` = C. No dish today carries `SUS`; one has an unknown `LPS` code, which is ignored. |
| Newsletter | **Cut.** It hasn't been updated in years. |
| Press | **Cut** for now: off Halls, out of the carousel, and with no row in You. There's no press data in the prototype, and a row that only leads to an empty page would be a dead end. If wanted later, it's one row in You. |
| Busy (hall bands + header) | **M2: scoreboard lamps, one encoding.** **Band:** five lamps and a word ("Busy", "Not busy"), drawn once, no fill-in.<br>**Header:**<ul><li>the same lamp row, plus one state line: "Calmer around 1:30 PM" from `calmer_at`, falling back to "Busier/Quieter than usual" from `vs_usual`, or nothing;</li><li>a **lamp board** for the day: one column of five lamps per hour, quantized exactly like the meter (pct / 20). Now is lit gold. The next hours use the live `outlook` where there is one, otherwise the typical day, in the same lamps; M1's separate gold-outline forecast encoding is gone.</li></ul>**Low confidence** (`confidence` not "good") changes only the word: "Probably busy". |
| You pane | Today's totals as a Nutrition Facts panel, meals logged with items, Favorites, Dietary preferences, ranking, and Export (real JSON and CSV Blob downloads). |
| **Planner (future)** | Not built and not drawn: no tab or button does nothing. It slots in as a **fourth tab, "Plan", between Search and You.** The tab bar is `flex:1`, so a fourth tab takes no layout change. Its first screen would be F3's target-and-proposals view. Its plates hand off to the same plate bar, so a planned plate becomes an ordinary plate you Log. A lighter entry point is a "Plan dinner" row on You after lunch is logged, if a fourth tab feels heavy. |

**Residency.** The plate, log, favorites, dietary preferences and rankings stay in memory or localStorage (favorites and diet only, inside try/catch). Nothing is uploaded. Every screen works without an account.

## Motion inventory (M2 round 2; the spec for `mobile/src/lib/motion.ts`)

There is no invented motion. Every transition follows Material 3 or Apple's App Store / Music zoom.
- **Card → screen** is a container transform.
- **Back** plays the same frames reversed, and the finger can scrub it.
- **Top-level tabs** fade through.
- **Meal tabs** use shared axis X.
- **The plate and station list** are bottom sheets.
- **Everything else** updates in place.

Under reduced motion, every movement becomes a 120 ms crossfade (the hall and pages included), and sheets snap.

**Sources (read on 2026-10-09):**
- **M3 tokens:** material-components-android `lib/java/com/google/android/material/motion/res/values/tokens.xml`.
  - Durations: short3 150, short4 200, medium4 400, long1 450, long2 500 ms.
  - Emphasized easing is the path `M 0,0 C 0.05,0 0.133333,0.06 0.166666,0.4 C 0.208333,0.82 0.25,1 1,1`. The prototype evaluates it exactly (`EMPH`) and passes it to CSS/WAAPI as a sampled `linear()`.
  - Standard is `cubic-bezier(0.2,0,0,1)`; emphasized accelerate is `cubic-bezier(0.3,0,0.8,0.2)`.
- **`MaterialContainerTransform.java`:**
  - Duration is `motionDurationLong2` (500) entering and `motionDurationMedium4` (400) returning, on `motionEasingEmphasizedInterpolator`.
  - The scrim is `0x52000000` (black at 32%).
  - The default enter fade threshold is 0–0.25 with `FADE_MODE_IN`, and return is 0.60–0.90. **The 30% out / 70% in split used here is the coordinator's specification, not MDC's default.**
- **`MaterialFadeThrough.java`** and **`FadeThroughProvider.java`:** `DEFAULT_START_SCALE = 0.92f`, `FADE_THROUGH_THRESHOLD = 0.35F`, `motionDurationLong1` (450), emphasized.
- **`MaterialSharedAxis.java`** and **`transition/res/values/dimens.xml`:** `SlideDistanceProvider` with `mtrl_transition_shared_axis_slide_distance` = 30dp, a fade-through secondary, `motionDurationLong1`, emphasized.
- **Apple:** the App Store / Music card is the iOS 18 zoom navigation transition (`matchedTransitionSource` + `navigationTransition(.zoom)`).
  - WWDC24 session 10145 ("Enhance your UI animations and transitions") describes it as continuously interactive: you can grab and drag the transitioning view.
  - Apple publishes no curve or duration for it; it's a system spring. The interactive dismiss here is modelled on that behaviour, and its distances (480 px for the whole way, commit below p 0.82 or on a flick over 0.5 px/ms) are this prototype's tuning, not Apple numbers.

| Interaction | Convention: what moves | Token | Haptic |
|---|---|---|---|
| Finger down on a control or row | state layer: scale .97 or a row tint within 90 ms | press / settle | – |
| Open a hall (from its band, a Search row, or a serving) | **container transform**: the source rect grows to the full screen; the photo (band sources) stays continuous while its duotone develops; the source's content fades out 0–30%; the hall screen (header text, back, meal tabs, station row, list) fades in 30–100% in its final layout, riding the container; behind it stays put under a 32% scrim | cont | light (6) |
| Close a hall | the same frames reversed (from collapsed: scroll to top first) | contBack | – |
| Drag down from the top / swipe in from the left edge | the screen shrinks toward its source under the finger; past p .82 or a flick it completes, otherwise it returns | contBack / cont | light (6) on commit |
| Header collapse | scrubbed by scroll | – | – |
| Halls ⇄ Search ⇄ You | **fade through**: out by 35%, in from 35% scaling .92 → 1; a hall screen fades with the tab that owns it | fadeThrough | light (4) |
| Meal tab | **shared axis X**: both lists slide 30 px in the tab's direction with the fade through; the underline moves | sharedX / settle | light (4) |
| Station row → list | **bottom sheet** rises; a pick closes it and scrolls there | spring / scroll | light (5) |
| Dish row → detail | **container transform** into the sheet (the corners round); scrim tap or drag down returns it to the row | cont / contBack | tick |
| Café, area, event, You row, pinned café → page | **container transform**; back, edge swipe or drag down returns it to the row | cont / contBack | light (3) |
| Plate bar → plate sheet | **bottom sheet** whose handle is the bar (Music's mini-player → player) | spring | tick on detent |
| `+`, stepper `+` / `−` | in place: `+` widens into the stepper; the bar's numbers change | settle / exit | light (8), rigid (14) on remove |
| Plate bar, first add | rises from behind the tab bar | cont | – |
| Log / Undo | in place: the receipt (a snackbar with Undo) crossfades into the bar's place, and back | settle | success / light (6) |
| Pin / unpin | in place: the pin fills gold; the row appears on or leaves Halls | – | light (8) / (4) |
| Search typing / lens | in place: surviving rows glide (FLIP), new rows fade in; chips never move | settle | light (4) on lens |
| Ingredients | in place: height opens | settle | light (3) |

## (d) What's genuinely different from today, and why it should feel better

1. **Search is a peer of the hall list, not a buried feature.** Search has its own tab and a scoped entry inside every hall. Round 3 removed the duplicate field on Halls; the tab is one tap from anywhere. Its ergonomics are built for a run of picks:
   - the keyboard stays up;
   - the previous query is pre-selected, so you just type the next dish;
   - Enter adds the top result;
   - results that can join your plate sort first, and ones that can't get an outlined `+`;
   - each row shows which halls serve it (W F H B), with your plate's halls filled.
2. **The hall decision is inferred, not asked.** Search adds carry every hall that serves the dish, and the plate narrows as you add. Adds from inside a hall menu are scoped to that hall, because being in Worcester's menu is evidence. Conflicts make a second plate instead of a modal, and Log only asks when the hall is genuinely ambiguous.
3. **Station navigation is the header's last row** (M2; round 4 had a floating pill). It replaces both the right-edge scrubber and F4's rail.
   - **Discoverable.** A gold station name with a chevron on the maroon header reads as a control. Round 3's chevron on each in-list heading read as collapse/expand. The scrubber was 3 px of grey you had to know about.
   - **Always "you are here".** The row always names the current station, and the roster marks it.
   - **One row of chrome, no horizontal scroller.** A chip strip under the meal tabs would stack two sideways rows, which the owner rejected in F4. The index is a vertical list with dish counts. It doubles as "what's at this hall today", which a chip strip can't show at once.
   - **No edge gesture, so nothing to fight iOS back-swipe,** which is what broke the scrubber. The cost is that a jump takes two taps, not one.
4. **Varsity identity, now with the real place.**
   - On Halls the photos are graded into the brand: grayscale × a rose-maroon multiply (`#c4434b`, a derived token lighter than D1's `#881c1c`, so the photo reads), deep maroon screened into the blacks, and a left deep-maroon gradient under the text. **Measured** (`node contrast.js && python3 contrast.py`: text hidden, brightest background pixel under each text box), round 3 with unretouched photos:
     - band hall names 9.1:1, band statuses and busy words 8.6:1;
     - expanded-header hall name, which is large text with a 3:1 bar: Worcester 4.1:1, Franklin 6.7:1, Hampshire 3.9:1, Berkshire 4.1:1;
     - header status, busy row and "calmer" line: 7.2:1 or better.
   - On open, the colour photo develops as the band becomes the header. The real hall appears at the moment you choose it.
   - **Other halls' headers.** Every header shows its photo in full colour under the same gradient as Worcester, with no residual duotone. The photos are positioned to favour each room's character:
     - Franklin's brick columns and tables;
     - Hampshire's Chef's Table servery and timber ceiling;
     - Berkshire's lit ceiling, blue-windowed servery and yellow floor.
     - The band windows were moved to match: Franklin 10%, Hampshire 24%, Berkshire 22% down the header photo.
     - All four now read about as clearly as Worcester. Franklin's photo is the busiest of the four (a full lunch crowd), but it reads as the place rather than as noise.

   - **One progress value drives the whole header** (round 2: a container transform, so the FLIP bullet below is round-1 history). `paint(p, y)` sets every element's transform or opacity from the open progress `p` and the scroll `y`. Nothing else animates the header.
     - Letter, name, status and busy row move by FLIP from measured band rects, with translate and scale lerped by `p`.
     - The photo window's clip and position lerp the same way.
     - The duotone, band gradient, header gradients, "Calmer around" line, curve, and back and search buttons crossfade with `p`. The buttons also ride the photo's top edge.
     - **Round 4:** Halls never moves. The tapped band is the only moving layer, and Halls dims as one unit (40% at p = 1). `test.js` asserts identical rects for every other band, the Halls header and the café rows across sampled frames of open and close.
     - Tabs and menu body rise from the bottom of the screen with `p`.
     - The source band is hidden while its header is up, so there are never two copies.
     - The collapse uses the same function with `c = y / (header − compact bar)`.
     - Close runs `p` from 1 to 0 through the same frames. From a collapsed header it first scrubs the scroll back to 0, like a status-bar tap, then reverses.
     - **Endpoints are checked by pixel diff** (`node endpoints.js && python3 endpoints.py`). These are where a pop could hide:
       - Halls before the tap vs `p = 0`: under 0.21% of pixels differ, all anti-aliasing on the scaled title.
       - `p = 1` vs the menu at rest: 0.000%.
       - Halls after close vs before open: 0.000% for every hall. Halls rows no longer re-sort; nearest-area ordering happens only on the Cafés page.
       - The shots wait 900 ms so the busy-meter fill-in has finished.
       - The same checks pass with reduced motion. There the menu just crossfades, and the band is never hidden or Halls shifted.
     - **Fixed in this pass:**
       - the busy row is the same size on band and header, so it no longer jumps 1px;
       - band separators moved to the container, so hiding a band doesn't drop a 1px line;
       - debug frames wait for webfonts.
     - `strip-open.png` shows `p` = 0 … 1 for Hampshire (top row) and Worcester. `strip-collapse.png` shows the collapse scrubbed across 11 scroll positions. `frames.js` captures real playback at 8× slow, and the close frames match the open frames in reverse.
   - On scroll it collapses back to solid maroon, so the photo never competes with the menu.
   - Everything else is quiet: hairline rows, Oswald numerals, Nutrition Facts totals, and no other choreography.
5. **One motion model, by convention (M2 r2).** Material 3 and the iOS zoom transition only: container transform with interactive back for every card → screen, fade through between tabs, shared axis X between meals, bottom sheets, and in-place updates for `+`, Log and Undo. Every press answers within 90 ms. Nothing rolls, bumps, counts, tosses or overshoots. See `CONCEPT.md` and the inventory above.
6. **Places scale by area, not by list length.** Halls stays a four-band screen plus four area rows, whether UMass runs 12 cafés or 40.
   - The open-now counts answer "is anything open over there" without a tap.
   - Search covers the long tail: a café name, a building, or what it sells.
   - Every hall, Grab 'N Go and café shows its status in the same words, computed from real hours: "Open until 9 PM", "Opens 11 AM", "Closed for today".
7. **Busy reads at a glance.** The meter is five lamps and a word, with no legend. The header adds when it clears and a lamp board for the day.
   - The board reads like popular-times bars, in the meter's own lamps: more lit lamps means busier, and gold is now.
   - It is built to take the planned occupancy-history data unchanged: one array of hourly percentages per hall and weekday.
8. **Sheets are physical.** The plate sheet follows the finger 1:1. On release it projects velocity onto the nearest detent with a damped spring that inherits the release velocity. Past the top it rubber-bands with iOS's `(1−1/(x·.55/d+1))·d` curve. Dragging or tapping the bar grows the bar into the sheet, and the bar stays the sheet's top edge, so the plate sheet has no pop-in moment.

**D1 changes** (owner overrides): Berkshire is open; the date is Thursday; there's no Grab 'N Go line on the bands, because it's a meal tab now. New components are the photo bands and header, hall-letter tags on rows, lens chips, and the station index. The chalk tab bar (not floating glass) has a 3 px maroon top stripe on the active tab.

## (e) Risks and open questions

- **Photo rights.** These are UMass Dining's photos, used for this private prototype only. **Shipping needs permission from UMass Dining, or owner-shot photos.** Owner-shot is better anyway: we could shoot architecture-only frames at a consistent height for the band crop.
- **Photo resolution.** The 640 px sources are embedded at JPEG q82; the budget is lifted. They're still slightly soft in the full-colour header at 2× density, because the sources are only 640 px wide. Owner-shot replacements should be at least 1200 px wide.
- **The header costs one flick.** At about 270 px expanded (plus meal tabs), the first dishes of the third station sit at the fold. A shorter header (about 220 px) would put Golden BBQ in view, but the photo would read as a strip. I chose the photo; the owner should try both.
- **The station switcher is two taps per jump,** against one for a chip strip. A long-press-and-slide on the pill, scrubbing the list in place, is the obvious accelerator. It shouldn't be the only way.
- **Second plates can still surprise.** The outlined `+`, the peek edge and dots on the bar, and the plate tabs in the sheet are the signals. As in F1, an accidental second plate is undone by stepping its dish down.
- **Scoped menu adds.** Adding brisket from Worcester's menu pins the plate to Worcester even though Berkshire also serves it. That's right if you're standing in Worcester. It's wrong if you browse Worcester's menu to plan Berkshire, which is rare.
- **Busy values are simulated.**
  - The live `busy` capture is from the evening (Worcester 84%, Berkshire 89%, Franklin and Hampshire about 20%). For the 12:40 PM scenario I derived plausible lunch-rush values in the same shape:
    - Worcester: 82%, usual 86, outlook 70/55/40, calmer at 13:30;
    - Berkshire: 88%, busier than usual, partial outlook, confidence "new";
    - Franklin: 48%, no outlook, "new";
    - Hampshire: 27%, quieter than usual.
  - The **typical-day curves are simulated too**. They would come from the planned occupancy-history table: busy % by hall, weekday and hour.
- **What "low confidence" looks like.** "Probably …" is my reading of `confidence: "new"`. If "new" just means a fresh sensor that's usually right, it should render as "good".
- **Busy only on halls.** Cafés have `busy` in the data too, but at lunch the evening capture would mislead. Café detail can take the same meter row once values are live.
- **Café areas are hand-mapped** from addresses and descriptions. Peet's (ILC) and The Hub (Furcolo) sit on area borders.
- **All 27 cafés are open at 12:40,** so the Open now chip changes nothing in this scenario. It matters at 8 AM or 8 PM.
- **Worcester header changed despite "keep it".** The owner liked the Worcester gradient. Round 2 made the header 26 px taller (about 306 px) and the bottom gradient stronger: 50% at 30% height, 74% at 50%, 93% at 76%.
  - This makes room for the busy row and curve, and keeps text AA: the hall name is 4.0:1, a large-text pass.
  - The photo top and sign still read, but less of the photo shows than in round 1.
  - Alternative if the owner prefers round 1: move the busy row and curve down onto the deep-maroon meal-tab strip. That restores round 1's photo-to-gradient header, at the cost of separating busy from the hall name.
- **Event banners** are UMass Dining graphics, embedded only for this private prototype. Several titles ("October Event", "Pete and Gerry") are vague as written by UMass, so the banner carries the meaning and the caption only identifies it. The feed has no real event date, only an expiry; if UMass adds a start date, the caption should use it.
- **Back gesture.** There's a back button and a re-tap on the Halls tab, but no edge-swipe in the web prototype. In RN, an interactive edge-swipe should scrub the same progress value: the finger drives `p`, and release springs it to 0 or 1.
- **Desktop mouse:** the sheet drags from anywhere, and the body handoff is touch-tuned. Not verified on a real phone; all gestures were checked in Chromium's touch pipeline only.

## (f) React Native

- **Signature photo transition (band → header → compact bar): one shared value carries over exactly.** The prototype's `paint(p, y)` *is* the RN design. **M2 r2 changes what `paint` does:** there are no FLIP deltas any more. One clip window grows from the source rect to the screen; the screen layer is offset so the photo stays where the band showed it (row sources anchor it to the window's top); the source's content fades out over p 0–.3 and every incoming element fades in over .3–1. The FLIP bullets below describe round 1. The interactive drag-back sets `progress` from a `Gesture.Pan()` (vertical when the list is at scroll-top, or an edge pan) and releases with `withTiming` on the emphasized curve. On iOS, native `navigationTransition(.zoom)` (via a native stack) is the alternative if the custom clip can't hold 120 Hz.
  - Use two shared values: `progress = useSharedValue(0)` (open) and `scrollY` from `useAnimatedScrollHandler` (collapse).
  - Every header element gets one `useAnimatedStyle` that reads both and does what `paint` does:
    - FLIP deltas lerped by `1 − progress`;
    - collapse terms lerped by `c = clamp(scrollY / (HH − CH))`;
    - opacities as linear functions of `progress` and `c`.
  - Elements never own their own timings, so they can't drift apart.
  - **FLIP rects.** On tap, `measure()` the band's letter, name, status and busy row on the UI thread. Lay out the hall screen's header at rest, `measure()` the same four, and store the deltas in a shared value. Start `progress` only after both are measured. This is the `measureXF()` step.
  - **Open and close.**
    - Open is `progress.value = withTiming(1, { duration: 500, easing: Easing.bezier(.22, 1, .36, 1) })`.
    - Close is `withTiming(0)` with the same easing: the same frames in reverse.
    - From a collapsed header, `scrollTo(ref, 0, 0, true)` first, then `withTiming(0)`.
    - An interactive edge-swipe back sets `progress` from the gesture and springs on release.
  - **Navigation.** Present the hall screen as a transparent-modal or same-screen overlay (`animation: 'none'`) so the header animates over the still-mounted Halls list. Halls stays static: no Halls element gets an animated style. A dim overlay over Halls takes `opacity: 0.4·progress`, the tapped band is hidden (`opacity 0`) while its header is up, and its slot shows the deep-maroon container behind it. Avoid Reanimated's `sharedTransitionTag` here: it animates position and size per element on its own timeline, which is exactly the "elements don't move together" problem. Its support status in Reanimated 4 also needs checking.
  - **Photo window.** Animate a wrapper's `height` and `translateY` (one view, layout on the UI thread), or use Skia's animated `clipRect` if 120 Hz on Android needs it.
  - **Duotone.** RN has no `mix-blend-mode`. Either:
    - pre-grade two JPEGs per hall at build time (duotone and colour, about 25 KB each) and crossfade `opacity`; or
    - use Skia's `ColorMatrix` plus `BlendMode.multiply` on one image, with the matrix interpolated from duotone to colour.

    Two images is simplest and fastest. Drive the duotone layer's opacity from `progress` (1 → 0) rather than `expo-image`'s own `transition`, so it stays on the shared timeline.
  - **Collapse on scroll.** The same animated styles read `scrollY`: header and tabs `translateY`, photo parallax, solid-maroon opacity, letter, status, busy and curve opacity, and the title's translate and scale. Pull-down stretch is `scale` when `scrollY < 0`, which iOS bounces natively.
  - **Busy lamp board.** Five `react-native-svg` `<Rect>`s per hour (or one Skia path), lit from the history table's hourly array with the same `pct/20` quantization as the meter. Its opacity comes from the same `progress` and `c`.
  - **Menu body unfold (M2).** Tabs, station row and list ride the header window's bottom edge (`translateY = (bandBottom − HH)·(1−progress)`) inside a clip that grows from the band's bottom to the screen's. In RN that is one wrapper `View` with `overflow:hidden`, its `height` and `translateY` from the same `progress`.
- **Menu list.**
  - `FlashList` v2 (or `SectionList`) with no sticky headers; the station row is the only pinned element.
  - Station titles are plain list items. The station row is part of the header's animated block and rides its `translateY`; its name just changes. The roster is a `Modal`-less maroon `View` that grows from the row (animated `height` or a clip on the `grow` timing), and picking shrinks it, then `scrollToOffset` runs on the same timing through a shared value (`useAnimatedScrollHandler` + `scrollTo` on the UI thread). There is no landing flash.
  - Meal tabs are a plain row of `Pressable`s; they all fit, so they don't scroll.
- **Search.**
  - `keyboardShouldPersistTaps="handled"` on the results list keeps the keyboard up across picks.
  - `TextInput.setSelection(0, len)` after each pick gives the replace-on-type behaviour.
  - `onSubmitEditing` adds the top result.
  - Lens chips are a horizontal `ScrollView` of `Pressable`s.
- **Plate bar and sheet.**
  - The plate bar sits absolutely above expo-router's tab bar. With native tabs on iOS 26, it's the `UITabBarController` bottom accessory.
  - **M2: the sheet is the bar grown taller,** so it can't be a native formSheet. Use `@gorhom/bottom-sheet` v5 with the bar component rendered as its `handleComponent`. Its lowest snap point is the bar's own slot, it sits under the tab bar (`bottomInset` = tab bar height, or a custom container above the tabs), and it has snap points mid/large, `overDragResistanceFactor` for the rubber band, and `BottomSheetScrollView` for the handoff. The collapsed sheet *is* the plate bar, so there is no separate bar view to swap out.
  - **Calorie toss and plate → You.** A single absolutely positioned overlay `Animated.View` per flight, positioned from `measure()` of the source and target. Path: `withTiming` on one progress value driving x linearly and y through a quadratic. Under `useReducedMotion()`, skip it and update the numbers directly.
  - Horizontal plate switching on the bar: `Gesture.Pan().activeOffsetX([-12,12]).failOffsetY([-8,8])`, composed with the vertical pan.
- **Numbers.** Plain `Text`; the bar's numbers update when the toss lands (a `runOnJS` callback at the end of the flight). No rolls and no count-ups.
- **Haptics.** `expo-haptics`:
  - `selectionAsync` for detents, lens and meal tabs, and station jumps;
  - `impactAsync(Light)` for add;
  - `impactAsync(Rigid)` for remove;
  - `notificationAsync(Success)` for Log.
- **Reduced motion.** `useReducedMotion()` replaces the shared-element flight with a 200 ms crossfade and springs with snaps, as the prototype does.
- **Motion tokens → `mobile/src/lib/motion.ts`.** The table below is the spec. In RN, durations and easings become `withTiming(v, {duration: MO.x.d, easing: Easing.bezier(...)})`. `SPRING.sheet` becomes `withSpring(v, {stiffness: 300, damping: 2·√300·0.84 ≈ 29, mass: 1})`. Enters and exits map to Reanimated layout animations (`FadeInUp.duration(240).easing(...)`, `FadeOut.duration(160)`). Search's FLIP is `itemLayoutAnimation={LinearTransition.duration(240)}` on the results list. Press is `Pressable` plus `useAnimatedStyle` scale (0.96, press in / release out). Rolls are keyed `Text` with `entering={SlideInDown}` / `exiting={SlideOutUp}`, direction by sign. `A()`'s reduced-motion rule becomes one wrapper hook that swaps any movement for a 120 ms opacity crossfade.
- **Full labels.** The label is plain `View` rows, one component shared by dish detail and plate Full label. Ingredients collapse is `numberOfLines={3}`, and expanding animates the container height with `withTiming` on the enter token (measure with `onLayout`).
- **Hard parts.**
  - The clip-window reveal at 120 Hz on Android: test Skia against a height-animated mask early.
  - Sticky headers plus a scroll-driven header overlay in FlashList: header offsets must account for the header spacer.
  - A gorhom sheet above native tabs plus the keyboard on the custom-food form.

## Files

- `index.html`: the built prototype.
- `src.html` + `build.py`: the source and the build. `build.py` embeds `menu-full-2026-10-08.json`, compacted: diet bitmask from `clean-diet-str` and `recipe-webcode` with junk like `Halal\r5` stripped, station suffixes like `WOR` stripped, and every Nutrition Facts field, allergens, ingredients and both grades kept. It asserts the 404 / 38.9 benchmark plate and Golden BBQ's sodium (685.5 mg, 30%).
- `photos.sh`: re-encodes `assets/*.jpg` and the event banners in `assets/ev/` into `build/`, with no retouching.
- `contrast.js` + `contrast.py`: the AA measurement above.
- `shot-events.png`: Search's idle hub with 0, 1 and 4 events.
- `test.js`: the benchmark driver, gesture checks and round-2 checks (`node test.js`).
- `endpoints.js` + `endpoints.py`: pixel-diff the transition endpoints, with and without reduced motion.
- `frames.js`: captures real playback of open and close at 8× slow into `build/fr/` (`node frames.js H`).
- `CRITIQUE.md`, `CONCEPT.md`: M2's critique of round 4 and its one-page motion concept.
- `rec.js`: the frame recorder. App time is slowed 8× (`performance.now`, rAF, `setTimeout`, plus CSS/WAAPI through CDP `Animation.setPlaybackRate`); every frame is labelled with in-page time from the first input. Run `node rec.js M1|M2 [interaction…]`. Native scrolling (fling, scroll-snap) isn't slowed.
- `sheet.py` + `strips.sh`: contact sheets. `./strips.sh strip M2` → `build/rec/strip-M2-*.png`; `./strips.sh compare` → `compare-<interaction>.png` (M1 on top, M2 below), 23 interactions.
- `test.js` also runs under reduced motion: `RM=1 node test.js`.
- M2 round 2: `compare-*.png` now has three rows (M1 / M2 r1 / M2 r2). New interactions: `dragback`, `dragcancel`, `edgeswipe` (interactive back), `hallresult`, `placeopen` (Search places), `serving` (where and when → tomorrow's hall), `pinopen`. M1 and r1 rows for those show nothing happening, because the feature or gesture didn't exist. Round 1's strips are kept in `r1/`. `shot-pins.png` shows Halls with 0, 2 and 5 pins; `shot-search-r2.png` shows where and when, a dish's servings, tomorrow's hall, place results and the pin control.
- `test.js` adds checks for pin/unpin surviving a reload, a place result opening, where and when listing tomorrow's serving and opening it scrolled to the dish, interactive drag-back cancelling and completing (drag down and edge swipe, on a hall and on a page), and brisket and Golden BBQ being visible without scrolling on path A.
- (M1's `strip-open.png`/`strip-collapse.png` are not carried over; `compare-open.png`, `compare-close.png`, `compare-collapse.png` and `compare-closecollapsed.png` show real playback of both versions.)
- `shot.sh <state> [out]`: a headless screenshot.
- Screenshots:
  - `shot-halls.png`, `shot-menu.png`, `shot-transition.png` (Hampshire at p = 0.5), `shot-stations.png` (switcher open);
  - `shot-search.png` (idle hub), `shot-typed.png`, `shot-cafes.png`;
  - `shot-plate.png`, `shot-label.png` (Golden BBQ detail), `shot-platelabel.png`.
- `build.py` also embeds `locations-2026-10-08.json` (27 cafés, hall and Grab 'N Go hours) and `events-2026-10-08.json`, merged and sorted as described in (c).

## Round 5

Owner: "There's strange gaps between cards sometimes, and I think the retail strips are too short. Also the food finder is not really helpful, maybe just some info about where it's currently/next served would make sense." Then: "avoid just checking off boxes, and think more about the cohesive character and UX."

I read the app as a student would first (`CRITIQUE-r5.md`), then wrote one concept (`CONCEPT.md`, "Round 5: one rack, one voice").
- **Halls** is one rack of photo bands. Cafés are the hall band at three-quarter scale, with one maroon seam throughout.
- **"Where can I get this"** is said the way the header says the meal: a meal, a clock time and the hall.

### The gaps (two, both reproduced, both red before the fix)
1. **Chalk seams in the rack.**
   - Between the Halls header and Worcester, and between the last hall band and the first pinned café, the 1 px separator was chalk, not maroon.
   - Cause: margin collapse. The first child's `margin-top:1px` collapsed out of `#bands` and `#pins`, which had no border, padding or BFC, so the separator showed `#halls`' chalk ground.
   - It was the same at every width (360, 375, 390, 412, 430) and DPR (2, 3). It wasn't sub-pixel.
   - It looked like "sometimes" because the mid-screen seam only exists once a café is pinned, and the top one is a thin light line against maroon.
   - Fix: `display:flow-root` on both containers. Band and strip y positions are unchanged (Worcester still starts at 137.59 px).
2. **The event row's end gutter.**
   - At the end of the carousel, the last card sat 40 px from the right edge against a 20 px start gutter: 20 px padding, plus the 12 px gap, plus an 8 px `::after` spacer.
   - Fix: no end padding; gap plus spacer = 20 px. One event drops the spacer and is 100% − 20 px wide.
- **Ruled out, by the same test:**
  - the band layout after a hall opens and closes;
  - after a pin opens and closes;
  - after Search → Halls;
  - a margin that only applies when some sections are present (the collapse *was* the "only with pins" case).
- **Test** (`test.js`, first block):
  - At 360, 390 and 430 px, DPR 3, with 2 pins, it samples the screenshot along every seam in the rack (header/band, band/band, band/strip, strip/strip). It fails on any near-white pixel.
  - It runs at rest, after a hall closes, after a pin closes, and after a tab round trip.
  - It also checks that the last event card's end gutter equals the first card's start gutter.
  - Red: `360px, at rest: seams in the rack show the ground: hhead/band: ground showing at y 411; band/pcard: ground showing at y 1767`, and `end gutter (40) matches … start gutter (20)`.
  - A hit test (`elementFromPoint`) does *not* catch this: Blink hit-tests the band across the seam that it paints as chalk. Hence the pixel check.

### Pinned café strips: 84 px
- They are the hall band at three-quarter scale:
  - 84 px (band 112);
  - name in Oswald 24 (32);
  - status 14 px (15);
  - the same 20 px inset;
  - top-anchored text (14 px, against the band's 16).
- I picked it from `shot-pins.png` at 2 and 5 pins:
  - at 84 px the photo reads as a place (Wasabi's counter, Peet's tables);
  - two strips are still clearly below four bands;
  - five strips plus the bands take 1.4 screens, which is fine for a scrolled list.
- 76 px looked like a slightly taller round 4. 88 px started to compete with the halls.
- **Material.**
  - The neutral grey-brown grade is gone. Strips use the halls' deep-maroon left gradient over the café's own photo in full colour (`.86` → `.76` at 50% → `.3` at 76% → 0 at 92%). The photos are not altered.
  - Halls keep the duotone and the chenille letter.
  - The seam is the same 1 px of maroon.
- **Contrast** (`node contrast-pins.js`, all 27 pinned, text hidden, brightest pixel under each text box, which now hugs its text):
  - worst name 4.87:1 (People's Organic Coffee; 24 px / 600 is large text, so the bar is 3:1);
  - worst status 9.38:1.
  - A lighter gradient I tried first dropped People's to 3.47:1, so I kept the stronger one.

### Where it's served now / next (replaces the grid)
- **The rules.** `wherePlan(k, now)` is pure in the clock.
  - Every serving of the dish is grouped by state and window: *now* (the window contains the clock), *later today*, or *tomorrow*.
  - Past servings are dropped.
  - Groups are ordered now (soonest closing first), then later (soonest opening first), then tomorrow.
  - `whereAnswer` shows the first group, plus at most one more today that names a hall the first doesn't.
- **Copy, in the header's terms:**
  - "Lunch now, until 3:30 PM";
  - "Dinner from 4:30 PM";
  - "Tomorrow, breakfast from 7 AM";
  - a second line for the same meal and state gives only its own time ("Grab 'N Go now, until 4 PM", then "Until 8 PM");
  - nothing left: "Not on the menu again today or tomorrow".
- **Halls** are felt-letter tags on deep maroon with the hall's name, 44 px tall: the band's letter-plus-name pairing at button size.
  - A tag returns the detail to its row, and the row grows into that hall at that meal and day, scrolled to and tinting the dish. That's the round 4 behaviour, kept.
  - There is no grid, no switch, no legend and no gold-means-now.
- **Checked clocks** (`test.js`):

  | Dish | Clock | Answer |
  |---|---|---|
  | Posole | 12:40 | Lunch now, until 3:30 PM, at all four halls |
  | Posole | 3:45 PM, between meals | Dinner from 4:30 PM |
  | Posole | 9:30 PM | Tomorrow, lunch from 11 AM, Hampshire |
  | Black Bean Burger | 12:40 | Lunch now at W, F and B, then Dinner from 4:30 PM at H |
  | Black Bean Burger | 11:50 PM | Late night now, until midnight, Worcester |
  | Brisket | 3:45 PM | no answer |

  The app's own clock stays at 12:40, so the benchmark and the "Lunch" header don't move.
- **Search rows.**
  - Under "Lunch now", a row shows only the halls serving it, as filled letters (Golden BBQ: one W).
  - The four-box W F H B with outlined empties is cut. It was a small grid on every row, answering "where not".
  - Rows under "Later today and tomorrow" say when in words, then the letters: "Dinner B", "Tomorrow breakfast W F".
  - I kept letters rather than names because they're the bands' own chenille letters, so a student already reads W as Worcester, and they keep the row to one line. Screen readers hear "Served now at Worcester" and "Dinner at Berkshire".
- **Removed:** `availHTML`, `availBlock`, `upcoming`, `servings`, `MRANK`, the `aday` handler, the `.avail`, `.adays` and `.agrid` CSS, the grid's aria labels, and the grid assertions. `rec.js`'s `serving` interaction now taps the Berkshire tag on Korean BBQ Chicken.

### What I cut or changed beyond the three notes, and why
- **The outlined empty hall letters on search rows.** Same failure as the grid: they make the row answer "where not".
- **The café strips' neutral grade.** It made pinned cafés look like they came from another app. They now share the halls' maroon gradient.
- **The idea that each control gets its own material.** The where tags reuse the felt letter and the maroon band rather than adding a third chip style next to lens chips and buttons.
- **Kept, though I questioned it.**
  - The "Cafés & markets" chalk list under the rack. It's the browse path for 27 places, and the rack is "where I go".
  - The events cards: the owner asked for them in round 4, and they're already in the felt-and-stitch material.
- **Not changed:** motion. The tags arrive with the detail (container transform), and nothing new moves.

### Unsure / open questions
- **Meal times are not in the data.** The feed has each hall's open and close and Grab 'N Go's hours, never meal periods.
  - I used one campus schedule clipped to each hall's real hours: breakfast 7–11, lunch 11–3:30, dinner 4:30–9, late night 9 to close. That gives a real between-meals gap.
  - F4's per-hall table (lunch ending 3, 3:30 or 4) is unsourced and contradicts the real hours (it ends Franklin's dinner at 7, but Franklin closes at 9). Its per-hall lunch ends also split one meal into three lines ("until 3 PM" / "until 3:30" / "until 4") over numbers nobody has verified.
  - The raw `get_infov2` capture (`local/photos/raw/infov2.json`, its "HOURS OF OPERATION" HTML) has no meal periods either.
  - **The owner should confirm the real meal periods** (umassdining.com location pages, or FoodPro). If they differ by hall, the line format already handles it ("Lunch now, until 3 PM", then "Until 4 PM").
- **Friday is assumed to keep Thursday's hours.**
- **"Add to plate" on a later-today dish** (Korean BBQ Chicken, dinner) still adds it to a dinner plate, as before. Whether a plate for a later meal makes sense is a planner question.
- **Search's letters versus names.** If the owner prefers words on rows too ("Worcester" rather than W), the row needs a second line for dishes at three or four halls.

### Files (round 5)
- `CRITIQUE-r5.md`; `CONCEPT.md` (Round 5).
- `shots5.js` makes `shot-pins.png` (0, 2, 5, 5 scrolled), `shot-dish.png` (served now; now plus later elsewhere; later today; tomorrow only) and `shot-search.png` ("bbq", "posole", "cruller").
- `compare-pins.png`, `compare-pinopen.png` and `compare-serving.png` now include an "M2 r4" row (`build/rec/M2r4/`) above "M2 now".
- Round 4's shots are kept as `build/r4-shot-*.png`.
