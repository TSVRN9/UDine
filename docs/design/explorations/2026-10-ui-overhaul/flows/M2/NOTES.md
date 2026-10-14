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
| Dish row → detail | round 6: **container transform** into a full-screen page, like every row → page; back, edge swipe or drag down returns it to the row | cont / contBack | tick |
| Full label, Add custom food | round 6: **bottom sheet** from the bottom edge (a control, not an object: nothing grows out of the button) | spring | tick on detent |
| Hall tag on a dish opened inside a hall | round 6: the page returns to its row, then the two halls swap in place by the tabs' **overlapped fade through**; the new hall arrives at the dish | contBack / fadeThrough | light (6) |
| Café, area, event, You row, pinned café → page | **container transform** (round 6: only the window's edges and a shared picture move; grounds opaque; content fades in place; CONCEPT "Motion vocabulary"); back, edge swipe or drag down returns it to the row | cont / contBack | light (3) |
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

## Round 5b: event transition

Owner: "fix the transition for events, elements don't move correctly."

### Cause (all in `contPrep` / `contPaint`, the shared page container transform)
- **The wash.** The ghost (a clone of the card, z 60) hid only its `<img>`. The clone's `.evpatch` (maroon ground, white edge, gold stitch) stayed painted *over* the travelling image (z 31) until p .3.
- **Frame vanishing then reappearing.** The shared element was a bare `<img>`. The frame existed only in the ghost, which faded out, and in the page's patch, which faded in with the page. So the banner went bare and was then re-framed at another place.
- **Caption vanishing.** The container was the page's chalk surface from frame 1. The card's white title sat on chalk, so it disappeared.
- **Content drift.** Every page child was translated by `r.y·(1−p)` (riding the container's top edge), while the banner lerped on its own path. Two motions read as two objects.
- **Translucent bar.** `.pbar` faded as a whole, its background included.

### Decision: the frame is part of the object
Card and page use the same `.evpatch` (3 px felt edge, stitch inset 4 px, radius 6). The travelling element is a clone of it, with width and height lerped rather than scaled, so the edge and stitch stay exactly as drawn on both ends. It never fades or swaps.

### What changed
- **Event page layout.** The bar, the framed banner and the date are one deep-maroon surface: the card's own ground, grown.
  - The bar is `--dm` on event pages (`.page:has(.evband)`).
  - The date moved into the band in gold Oswald, under the banner where the card's gold date sits.
  - The 8 px chalk line between bar and band is gone.
  - The buttons sit below on chalk.
- **Motion** (event cards only; tokens unchanged: `cont`/`contBack`, emphasized, 0–.3 out / .3–1 in).
  - The page lies still under the growing clip window.
  - Its maroon surface is opaque from the first frame. While the container is open it is stretched over the rest of the window (`.evband::after`, `--ext`) and fades to chalk over .3–1 (`--exto`). That is the container-colour crossfade of Material's container transform, so no chalk sliver slides out from under the card.
  - The bar's controls and the date fade in at their final positions, and the buttons are uncovered there.
  - The card's caption is chrome: it fades over 0–.3 while following the banner's bottom edge.
  - Close, drag-down and edge swipe run the same frames reversed.
- **Shared fix (all page opens).** The ghost hides its copy of the shared element (and a thumbnail's `.thumb` box) and drops its own ground. This removes the same wash from pin and place opens; they are otherwise untouched.
- **Removed:** `.evcard.down .evpatch{opacity:.85}`. Press feedback no longer alters the banner; the card's state layer remains.

### Test (`test.js`, "Round 5b")
- **What it samples.** Every rAF frame of open, back, drag-down and edge swipe, on three cards: the first, the peeking card (half off the right), and a card scrolled half off the left.
- **What it asserts:**
  - exactly one banner painted, inside a fully opaque frame, with no other patch over it;
  - each of x, y, w and h stays between the card rect and the page rect and moves one way only;
  - the aspect stays constant;
  - the date and buttons never move while visible;
  - the page bar is opaque whenever drawn;
  - the card is back and visible at its exact x.
- **Red before the fix** (each check isolated by neutralising the earlier ones):
  - `first card, open: the banner travels inside its felt frame (frame 1)`;
  - `the page bar is opaque whenever it is drawn (frame 1: 0)`;
  - `page content 0 fades in at its final place (frame 8: y 421.8, final 281.7, opacity 0.10)`.
- **Now:** `node test.js` gives 11230 checks; `RM=1 node test.js` gives 173 checks (reduced motion keeps the crossfade).

### Files
- **New `rec.js` interactions:** `eventclose`, `eventdrag`, `eventpeek`, `eventpeekclose`.
- **Compares:** `compare-eventopen.png`, `compare-eventclose.png`, `compare-eventdrag.png`, `compare-eventpeek.png` and `compare-eventpeekclose.png`. Each has an "M2 r5 (before 5b)" row (`build/rec/M2r5/`) above "M2 now". `compare-pinopen.png` and `compare-placeopen.png` are re-recorded.

### Open
- Place and pin opens still have the old content model: content rides the container's edge while the photo lerps separately, and the chalk shows below the photo early. That is the same class of problem as events, but the owner didn't flag it, so I left it alone.
- The event page can also be opened from the chalk note row inside a hall menu. That source has no banner, so it uses the generic model: the now-maroon bar fades as a whole while riding the container's edge. It's the translucent-bar symptom through a second door.
- The test also runs `?events=1` (one card, 370 px wide against the page's 350 px patch, flush with the right edge).

## Round 6: transition audit

Owner: "Opening nutrition information from the search doesn't make sense in its transition, I'd like you to audit the rest of the transitions in M2."

All 23 transitions, with their reverses, were recorded before and after the changes, and each one has a verdict in `AUDIT-transitions.md`. The rules that came out of it are in `CONCEPT.md`, under "Motion vocabulary (round 6)".

### Why Search → nutrition didn't make sense
The dish detail was a bottom sheet that opened by container transform from its row.
- **The two models disagree for Search rows.** A Search row sits at y≈175, above the sheet's top at 118. So the "rising" sheet unrolled *downward* from under the lens chips, like a dropdown.
- **The grab handle sat on the row from frame 1.**
- **A drag-down dismiss flew *up* into the row.** Dragging the detail down and releasing sent it back up past the finger (`searchdetaildrag`, r5b row).
- **The keyboard stayed up.** The search field kept focus, so on a phone the keyboard would stay over the label.
- **Hall menu rows hid the problem.** They sit low, so there the sheet happened to rise.

### What changed
- **Dish detail is a page** (`pageContent('dish')`). It opens like every other row → page, from Search, "Later today" and hall menu rows alike.
  - Back, drag down and edge swipe return it to its row.
  - Add to plate and the hall tags close the page into its row, then make their change (`closePage(from, then)`).
  - Opening any page blurs the search field.
  - **Layout change:** no mid detent, no grab handle, no rounded top. The page has the page bar (Back only), and the dish name stays as its large title.
- **Full label and Add custom food are plain bottom sheets.**
  - Neither source is an object: one is a text button, the other a form button.
  - Submitting the custom food form closes the sheet, and the bar updates.
  - `Sheet.grow` / `shrink` and the sheet's `src` are gone.
- **One page container transform** (`contPrep` / `contPaint`) replaces the event-only special case.
  - Only the window's edges and a shared picture move. Grounds (`.pbar`, `.evband`, `.phero`) are opaque; everything on them, and the page body, fades in .3–1 where it ends up.
  - Thumbnails travel over a still page, and their whole slot is hidden until they land.
  - A pinned café uses the hall-band model. The page hangs from its own photo, offset by the two crops so the pixels line up, and the band's text stays on that photo while it fades.
  - The source's copy fades where it was, unless it's drawn on the shared picture. Event cards keep the 5b ground stretch.
- **A hall tag on a dish opened inside a hall menu swaps the halls in place** (`swapHall`). The page returns to its row, then the old hall fades out over the new one with the tabs' overlapped fade through, and the new hall arrives already at the dish. Before, the menu vanished in one frame, the Halls rack showed, and the other hall grew out of its band.
- **`ghostOf` sets `margin:0` inline.** `.pcard` (1 px) and `.custom` (20 / 8 px) had offset their copies.
- **Hall from a Search row** (`measureXF`): the hall lies still under the growing window (`y0 = 0`), where before it rode the window's edge.
- **Meal-tab and station rows are opaque ground** in every hall open; only their labels fade (`paint`).
- **Layout change:** `.phero` sits flush under the bar (`margin-top:-8px`). The 8 px chalk line slid through the photo during the open.

### Tests (`test.js`, "Round 6")
**What is sampled.** Every rAF frame of open and back, on eight sources:
- dish from Search;
- dish from a hall menu;
- later dish;
- pinned café;
- place from Search;
- event note;
- area row;
- You row.

Drag down and edge swipe are also sampled on the Search dish.

**What is asserted:**
- it opens a page that fills the screen;
- every window edge stays between the source and the screen, and moves one way only (a drag down can never send it up);
- the page bar is opaque whenever it's drawn;
- content fades in at its final y (for the pinned café: at a fixed offset from its photo);
- a travelling picture never lands on an empty slot;
- the outgoing copy starts exactly on its source;
- nothing is left travelling at rest;
- the source is back.

Also asserted:
- The pinned café and the Search place are also dragged down and edge-swiped.
- The shared picture is sampled:
  - the thumbnail's travelling copy moves one way and keeps its aspect;
  - the pin's photo is the page's own (nothing travels), it moves one way, and frame 1 draws its pixels exactly where the band drew them.
- A hall opened from a Search row keeps its meal tabs and list still while they fade in.
- A hall tag on a dish opened inside a hall never uncovers the Halls rack.

**Red before the fix** (each scenario isolated in a try/catch run, `src.html` at round 5b):
- `dish from Search: opens a page (not a sheet)`, the same for the hall-menu and later dishes. With that check skipped, the sheet drag fails `dish from Search (sheet), drag down: window y 174.8 stays between 118.2 and 171.0 (frame 6)`, which is the fly-up.
- `pinned café: the outgoing copy starts exactly on its source (0.0,590.6,… vs 0.0,589.6,…)`.
- `place from Search` / `event note in a hall` / `area row` / `You row`, open: `the page bar is opaque whenever it is drawn (frame 2: 0)`.
- `hall from a row: the meal tabs fade in where they end up (frame 6: 450.4 vs 306.0)`.
- `hall to hall: the Halls rack never shows through (frame 29)`.
- The shared-picture checks are guards. Round 5b fails those scenarios on the earlier checks above, and its pin used a travelling copy, so they couldn't be isolated.

**Now:**
- `node test.js` gives 38635 checks (11230 before).
- `RM=1 node test.js` gives 173 checks. Reduced motion keeps the 120 ms crossfade, and the samplers run only with motion on.

### Files
- **New `rec.js` interactions:**
  - `searchdetail`, `searchdetailclose`, `searchdetaildrag`, `laterdetail`, `detailclose`;
  - `evnote`, `evnoteclose`, `pinclose`, `placeclose`, `areaopen`, `areaclose`, `youopen`;
  - `platelabel`, `custom`, `sheetclose`, `stationclose`, `hallresultclose`, `servinghall`.
- **Tooling:**
  - `strips.sh` knows the new interactions.
  - `sheet.py compare` adds an "M2 r5b (before r6)" row from `build/rec/M2r5b/`. Those are re-recordings of the round-5b build; `ingredients`, `qty`, `remove`, `add2`, `busy`, `events` and `dragcancel` there are older.
- **Regenerated `compare-*.png`:**
  - Dish detail: searchdetail, searchdetailclose, searchdetaildrag, laterdetail, detail, detailclose, detailadd, serving, servinghall, ingredients.
  - Pages: evnote, evnoteclose, pinopen, pinclose, placeopen, placeclose, cafe, areaopen, areaclose, youopen.
  - Halls: hallresult, hallresultclose, open, close, dragback, edgeswipe, edgecollapsed, closecollapsed.
  - Sheets: custom, platelabel.
  - Events: eventopen, eventclose, eventdrag, eventpeek, eventpeekclose.
- **`AUDIT-transitions.md`:** the inventory, conventions, frame evidence and verdicts.

### Open
- **Drag-down on a page from a Search row.** The page scrubs toward its row, so the window's bottom rises while the finger goes down, as on event pages since 5b. iOS's zoom dismiss also lets the card follow the finger.
- **Tabs.** The overlapped fade (owner, round 3) double-exposes the two headers for about 100 ms. Dropping the 0.97 scale would register them.
- **Serving.** The hall opens at its top, then scrolls to the dish: two motions.
- **Dish page bar.** It has Back only, and the dish name is the page's large title.
- **Pinned-café offset.** It reads the images' natural sizes. If an image isn't decoded yet (other engines), the open falls back to the travelling-picture model rather than breaking.

## Round 7: navigation model, dish sheet, cafés as halls

The owner's decisions:
- The expanding card is only for hall bands and pinned cafés.
- Everything else is a push, iOS style.
- The dish detail is a sheet.
- Cafés are the halls' family.

Critique of the round-6 screens: `CRITIQUE-r7.md`. New vocabulary: `CONCEPT.md`, "Motion vocabulary (round 7)".

### What changed
- **Push (`navPush` / `navPop`, the `NAV` stack, entries scoped to their tab).**
  - Events (from Search and from a hall's note), Search results (halls, Grab 'N Go, cafés), café rows, area rows, You rows, and a dish's "where it's served" all push.
  - The covered layer shifts −30% and dims 10%. The tab bar and the plate bar stay put.
  - The edge swipe tracks the finger 1:1. A release past half the width, or a flick, pops; otherwise it springs back. Pushed screens have no drag-down.
  - The page container transform (`contPrep` / `contPaint` / `ghostOf`), the event-banner travel and the `--ext` band stretch are deleted.
- **Hall over hall.** The hall screen is a singleton, so the outgoing hall is a frozen copy (`snapMenu`): a closed shadow root that adopts the page stylesheet. Back restores the live screen to that hall at its scroll and removes the copy. `swapHall` is deleted.
- **The dish sheet (`openDish` / `renderDish` / `dishMid` in `#isheet`).**
  - Rest height is measured per dish (`dishMid`) and ends on the label's Calories rule. Dragging or scrolling up gives full height.
  - Grabber, drag-follow and backdrop tap come from `Sheet`.
  - The name is sticky and edged once something scrolls under it.
  - The star is an icon (gold fill when on, like the pin).
  - Contains is a plain line. The spacing scale is 4 / 8 / 16 / 24, plus 12 between the label and its ratings.
  - "Show all" appears only when the ingredients are actually cut (measured).
  - Plate rows open the sheet too. From a dish already on the plate the button reads "Add another".
- **Sheet "where".** The sheet goes down (`Sheet.away`). When it is half-way out, the hall is pushed, already at the dish. From the plate, both sheets go. In the same hall and day it only goes away and brings the dish up.
- **Cafés.**
  - Pinned bands are `.band.pin`: the hall band's markup, grade and seam at 84 px. Each is a window into its page's header photo (`OFFC`).
  - A café opens in the hall screen (`#menu.cafe`) with the same header, grade, name, collapse into the maroon bar and pin in the bar. The body is description, Where / Payment, then Menu.
  - From its band it is the halls' container transform. From a row it is pushed.
  - A long name is set smaller to fit one line (`fitName`). The compact bar always shows it at 22 px (`NS`).
- **Tokens.** `MO.push` adds the easing `cubic-bezier(.32,.72,0,1)` and the geometry `shift .3`, `dim .1`, `commit .5`. Durations stay `cont` / `contBack`. The reason is in `CONCEPT.md`.
- **Reduced motion.** `Sheet.fade` crossfades `#isheet` in and out where it rests, where before the spring popped it. A push crossfades.

### Review passes (each from screenshots, `build/r7/p1`, `p2`, `final`, and frame strips, `build/rec/strip-M2-*.png`)

**Pass 1: 7 flaws.**
1. Café list thumbnails rendered as zoomed corners. The `.thumb img` rule had been deleted with the old pinned-card CSS.
2. At full height the item sheet's last 32 px sat below the frame (height 100%, translated by its top). That clipped the end of every sheet, Full label and custom food included. `#isheet` is now as tall as its top detent leaves room for.
3. The rest height cut through the "Fat cal." line, leaving half a line of text at the bottom edge. It now ends 6 px under the Calories rule.
4. The push whipped. Emphasized crawled for 50 ms, then ran 250 px in 67 ms. Measured per frame, which led to the new `push.e`.
5. The star button was taller than the name, so name → serving measured 14 px, not 4. Its negative margins now keep it inside the name's line.
6. Sheets opened from 110% (84 px below the frame), so the first frames were spent off screen. The CSS 110% and the JS `H*1.1` also disagreed (893 → 928). Closed now rests on the bottom edge.
7. The frozen hall copy was reachable by locators (two back buttons). Its shadow root is now closed.

**Pass 2: 4 flaws.**
1. Reduced motion, sheet → hall: the sheet faded, bare Search showed for about 40 ms, then the hall faded in. The `away` hook was set after `to('closed')`. It is now set before, and both crossfades are one.
2. Scrolled to the label, the sheet no longer said which dish it was. The name is now sticky.
3. Pinned café open and close: the band's copy lost its photo (`--img` lived on the band element, not on the copy). That drew a flat pink band over the first 30% of the open and the last 30% of the close (`compare-pinclose.png`). The copy now gets the variable.
4. Band copies, of halls and pins, stayed at the band while the page photo moved, which doubled the photo over 0–.3. The copy now rides on the header photo (`paint`, `gy`).

**Pass 3: 1 flaw.**
1. Under the sticky name, scrolled content was sliced with no edge ("93" cut in half). A hairline appears once the sheet is scrolled.

**Pass 4: 1 flaw**, found by the tests failing about one run in eight, not by eye.
1. A screen opened before the webfonts loaded (a state restore) measured its name's drop into the bar on fallback metrics, so the collapsed name sat 4 px low. The name is now measured again on `document.fonts.ready`.

**Pass 5: 2 flaws.** This pass covered the owner's `rv.js` set (`build/r7/rv/`) and the strips not yet viewed.
1. The sheet expanded only on a touch drag up. Wheel, trackpad or keyboard scrolling at rest scrolled its content under the name at half height (the owner's `dish-mid`). Now any scroll at rest takes it to full height. Tested with a wheel.
2. Above the sticky name, 1–2 px slivers of the label's side rules showed. Chalk now covers them.

**Pass 6: clean.**
- **At rest:** `shot-r7-dish.png`, `shot-r7-cafe.png`, `shot-r7-event.png` and the seven `rv.js` shots.
- **M2-now strips viewed frame by frame, after their last change:**
  - hall and pin: `pinopen`, `pinclose`, `open`;
  - push: `cafe`, `cafeback`, `evnote`, `eventopen` (20 ms steps), `pushedge`, `halledge`;
  - sheet → hall: `serving`, `servinghall`, `servinghallback`, `servingsame`;
  - sheet: `searchdetail`, `searchdetaildrag`, `searchdetailup`, `detaildrag`, `detailadd`, `platedetail`, `ingredients`;
  - reduced motion: `serving`.
- **Recorded but not viewed one by one:** `close`, `pindrag`, `placeopen`, `hallresult`, `eventclose`, `evnoteclose`, `pushedgecancel`, `searchdetailclose`, `detailclose`, `platedetailclose`, `areaopen`, `youopen`. Each reuses a path viewed above (same push, same sheet dismiss), and the push and sheet tests sample every frame of each.

### Tests (`test.js`, `round7`)
- **Deleted:** the 5b event-banner block and the r6 page container-transform samplers.
- **Push, every rAF frame**, for the event card, event note, Search café, Search hall, area row, You row, and two levels (Cafés & markets → café → back → back). It asserts that:
  - the screen enters by the right edge and moves one way;
  - it never moves vertically;
  - the covered layer shifts −0.3·W·p and dims 0.1·p;
  - the tab bar never moves;
  - the covered layer is restored at rest;
  - nothing is left after back;
  - a drag down doesn't dismiss.
  - **Edge swipe:** the page is under the finger (±1.5 px), pops past half and returns short of it.
- **Sheet**, from Search, a hall menu and the plate. It asserts that (including: a wheel scroll at rest takes it to full height):
  - it is never a page;
  - the source row and the list scroll don't move in any frame;
  - it rises from the bottom edge, and its top only rises until it rests (at most 6 px of spring overshoot);
  - at rest the name, Add, the last hall and Calories are visible;
  - a drag tracks the finger and a long one dismisses;
  - a backdrop tap dismisses;
  - dragged up, it reaches the top;
  - from the plate, the plate is still open and active afterwards.
- **Spacing scale:** the measured gaps are `[4,8,8,16,24,24,12,24]`.
- **Ingredients and rest height**, over one dish in seven (every dish with ingredients): "Show all" appears exactly when the text is cut; name, Add, where and Calories fit at rest; fewer than 5% of dishes need the full height.
- **Sheet → hall:**
  - From Search, the hall starts only once the sheet is half-way out, and the scroll doesn't change while it slides in (it arrives at the dish).
  - Same hall: no navigation.
  - Hall over hall: a frozen copy under it; back restores the original scroll, leaves nothing over, and the band return still works.
- **Cafés:**
  - A pinned band has the hall band's children, grade filter and blend, at 84 px.
  - A collapsed café name ends in the bar where a hall's does, at the same size, over solid maroon.
  - A pinned café opens with the page photo exactly where the band drew it on frame 1. It is not a push, and a drag down returns it into its band.
- **Red:** `RED=1 SRC=build/r6/index.html node test.js` runs only `round7`, each scenario caught. Against round 6, every scenario is RED. The dish sheets fail with `it is a sheet, not a page (frame 5)`, and the pushes with `a pushed screen was sampled (0 frames)`. Against the current build, all are green.
- **Now:** `node test.js` gives 4,788–5,035 checks and `RM=1 node test.js` gives 2,941–3,173 (the counts vary because sampled frames are counted). After the last change, 3 alternating runs of each mode are all green.

### Strips (`compare-<name>.png`: "M2 r6 (before r7)", "M2 now" and, where recorded, "M2 now, reduced motion")
- **Hall:** `open`, `close`.
- **Pinned café:** `pinopen`, `pinclose`, `pindrag`.
- **Café row push and back:** `cafe`, `cafeback`, `placeopen`.
- **Events:** `eventopen`, `eventclose` (Search) and `evnote`, `evnoteclose` (hall note).
- **Edge swipe mid-way:** `pushedge` (held at 210 px, released, pops), `pushedgecancel` (held at 130 px, returns), `halledge` (a pushed hall).
- **Dish sheet:**
  - from Search: `searchdetail`, `searchdetaildrag`, `searchdetailclose` (backdrop), `searchdetailup`;
  - from a hall: `detail`, `detaildrag`, `detailclose`, `detailadd`;
  - from the plate: `platedetail`, `platedetailclose`.
- **Sheet → hall:** `serving` (Search → Berkshire), `servinghall` and `servinghallback` (Worcester → Franklin → back), `servingsame`.
- **Other:** `hallresult`, `areaopen`, `youopen`, `ingredients`.
- **Reduced motion:** rows in `compare-searchdetail`, `searchdetailclose`, `serving`, `eventopen`, `eventclose`, `pinopen`, `cafe`.
- **Tooling:** `rec.js` takes `RM=1` (written to `build/rec/M2rm/`). `build/rec/M2r6/` holds the round-6 recordings. `build/r7/rv7.js` takes the review shots.

### Open (for the owner)
- **The hall screen is one screen.**
  - Opening a hall or café from Search drops a hall left open on Halls (as before).
  - Switching tabs drops a café pushed over Cafés & markets, with its list.
- **The sheet's backdrop** keeps the existing 50% maroon-black. That is darker than iOS's dim.
- **Sheet → hall overlaps.** The hall starts when the sheet is half-way out, so the sheet's last frames slide down over the incoming hall's lower edge. Waiting for the sheet to finish would read as a pause.
- **Café list rows are unchanged.** Ungraded thumbnails (like a page at rest) and a status column that wraps long names.
- **Event page** keeps its deep-maroon band, because the felt frame needs maroon ground.

### Coordinator review (after pass 6)
1. **Scrolled sheet.** The sticky name now gets a soft shadow as well as the hairline once something scrolls under it. At rest nothing sits under it.
2. **Event page.**
   - The stitch runs in a 7 px felt border around the banner, never over the artwork.
   - The whole page is the card's maroon ground. The actions sit in it: "See the menu" in gold (the plate bar's Log style), "Holiday hours" outlined in white.
   - The group sits at the optical centre of the space the bars leave.
   - With a banner, the bar carries no title (the banner says it, and is its alt text).
3. **Café header.** The pin is white like the back chevron (filled = pinned), and both carry a drop shadow so they read on any photo. Retail menus carry names only (checked the data: no price or calories), so the rows are 48 px.
4. **Filter chips** (Open now, and Search's lenses: one family). Selected is now tonal (tint, maroon outline, dark text) with a check, not a filled maroon button.

Both test modes pass.


## Round 8: marks and scores

The owner's feedback:
1. A thick bar sits in the ratings panel and marks nothing.
2. Plant based and vegetarian look too similar.
3. A new opt-in feature: healthfulness and carbon grade on dish rows.

Critique of round 7: `CRITIQUE-r8.md`.

### Design note
**Four badge families. Each is told apart by material and silhouette, never by colour alone.**

| Family | Says | Material | Silhouette |
|---|---|---|---|
| Diet mark | what it is | gold felt patch, maroon stitch (as before) | a 20 px square with a pictogram, never a letter |
| Hall letters | where | the chenille letter: deep-maroon square, gold Oswald letter (as before) | small filled squares, always last on the line |
| Healthfulness | a score, 0 to 7, higher is healthier | the label's ink: an Oswald figure plus the ratings panel's seven bars, maroon on a pale track | figure + a 7-bar meter, no container |
| Carbon grade | a letter, A to E per kg of food, lower is better | the label's ink: a maroon footprint plus an Oswald letter | footprint + letter, no container |

- **Why the scores have no box.** The meta line is already the row's little label: Oswald figures with their units
  ("273 cal", "23.1g protein"). A score is one more figure, and its unit is drawn instead of written: the bars, or the
  footprint.
  - Boxed versions (`build/r8/mock/v1`, `v2`, `v6`) read as form fields.
  - A circled letter (`v4`) was a generic pill.
- **Why a carbon "B" can't be Berkshire.** It is never in a square. It always follows a footprint. It is ink on chalk, not
  gold on maroon. And it sits before the where group, never in it.
- **Colour doesn't encode the value.** A traffic-light ramp would bring a green/red palette into a maroon-and-gold app
  and fail colour-blind readers. The value is the figure. The meter and the scale position repeat it.
  - Contrast: the figures are ink on chalk (15:1), and the bars and footprint are #881c1c on chalk (8.9:1, over the 3:1
    needed for graphics).
  - The empty bars are a pale track. They are deliberately under 3:1, because they carry no value.
- **The meta line is now groups:** numbers | scores | where.
  - A group wraps whole, and a wrapped line starts flush under the name.
  - **Scores off:** round 7's spacing exactly. A pixel diff of the off rows against round 7 differs only at the diet glyphs.
  - **Scores on (`#frame.sc-on`):**
    - One 12 px rhythm. That keeps both scores on one line in 95% of hall rows at 360 px (`build/r8/wrapstat.js`: 205 of
      216 rows; at round 7's 16 px, 35 of 216).
    - (Superseded in pass 6: Search's hall letters moved under the +.)
- **The ratings panel is honestly a separate panel.**
  - It is its own box (no `.label` class).
  - One 1 px rule between the two ratings, none after the last, none inside a rating (a carbon grade and its band line are
    one item).
  - The selected grade is framed in a 2 px maroon rule, the label's line, and is never filled.
  - The footprint leads "Carbon grade" (renamed from "Carbon rating"). Healthfulness reads "3 of 7" before its bars, so the
    row's "3▮▮▮" is that number in short.
- **Plant based is a sprout (stem, two leaves); vegetarian is a single filled leaf.**
  - They are two silhouettes; filled-solid they overlap with an IoU of 0.46 (round 7: 0.90).
  - `GL` is shared, so rows, patches and chips all change together.
  - The Low carbon chip's egg is now the footprint, so one carbon mark is used everywhere.
- **The toggles live on You, under "Show on dishes":** "Healthfulness" and "Carbon grade".
  - They reuse the Dietary preferences checkbox rows, and their fill uses the existing settle transition.
  - They are device-local, in `udine-m2` next to the pins (`S.show`). Both default off.
  - They act on hall rows, Search rows (now and later) and the sheet's patch row. The ratings panel always shows.
  - The showing list re-draws at once (`relist`, shared with the favourite star). Lists on other tabs re-draw when their
    tab returns.
  - Café menus carry names only (no scores in the feed), so nothing shows there.

### Review passes (crops in `build/r8/p1`, `p1b`, `p2`, `final`; dpr 2)
**Pass 1: 4 flaws.**
1. At 360 px, Search rows split the scores: health on line 1, carbon and halls on line 2, indented 6 px (`mock/v5-search-360`).
   Fixed: nowrap groups, wrapped by `column-gap` so a new line starts flush.
2. The footprint at 13 px slate was a blob. It is now 14 px maroon, the score family's colour.
3. On You, the last toggle drew a rule under itself where the list ends: the same mistake as the panel's bar. It was removed.
4. The panel's selected grade was the hall-letter fill. It is now a 2 px frame.

**Pass 2: 3 flaws.**
1. With both scores on at 360 px, 181 of 216 hall rows wrapped onto a second meta line. Fixed: a 12 px rhythm and 2 px bars,
   so 11 of 216 wrap.
2. The footprint I added to the "Carbon grade" toggle pushed its text 26 px right of "Healthfulness", making a ragged left
   edge. Removed. The chip and the panel teach the footprint.
3. A wrapped hall-letter line sat 2 px under line 1. The row gap is now 4 px.

**Pass 3: 1 flaw.**
1. With both scores on at 390 px, adjacent Search rows had different shapes: "F H" wrapped on one and "H" stayed on line 1 on
   the next. Fixed: with a score on, where always takes its own line.

**Pass 4: 4 flaws** (coordinator review).
1. The 12 px rhythm had changed rows with the toggles off (cal → protein 16 → 12; hall letters 10 → 12; "Dinner" 16 → 12).
   It is now scoped to `#frame.sc-on`. Diffed against `build/r8/before/*.png`: only the diet glyphs differ.
2. A sheet with scores and no diet patch indented the scores 4 px. The margin is gone (`final/sheet-nodiet-crop.png`).
3. With carbon only on, ungraded dishes kept their hall letters on line 1 between rows that wrapped them. The rule now keys
   off the toggle (`sc-on`), not the row's own scores.
4. The round-7 rest-height check (name, Add, where, Calories at rest; fewer than 5% need full height) now also runs with both
   scores on, since a dish with no diet mark gains a patch row.

**Pass 5: clean.** Checked:
- `shot-r8-rows.png` and `shot-r8-rows-360.png` (4 combinations × hall and Search);
- `shot-r8-sheet.png` (at rest; panel; no carbon grade);
- `shot-r8-marks.png`, `shot-r8-you.png`;
- `build/r8/final/long-*` (Cheese Rigatoni…, Kumamoto ramen, Penne…, posole across four halls, later rows) and `miss-*`
  (wings with no grade).

**Pass 6: 2 flaws** (coordinator review).
1. With a score on, Search's hall letters dropped to a third line of one or two squares, so a row's shape depended on a
   display preference. They now live in the control lane, under the + (and under the stepper, which stays the same size).
   - The meta line holds only the dish's own numbers and scores.
   - Rows are identical with the toggles on or off.
   - The lane is 66 px tall, so adding a dish never changes a row's height.
   - Later rows have no +, so their "Dinner B" stays in the meta line.
2. At 1× the footprint's four toes merged into a smudge (an acorn). It now has three toes spaced at least 1 px apart and
   draws at 15 px (`build/r8/fp1x-zoom.png`).

### Tests (`test.js`, `round8`)
- **Toggles.**
  - Off by default.
  - A real tap on You turns healthfulness on.
  - Hall and Search rows match each dish exactly: a reading exactly when shown and the data exists, the right figure, 7 bars
    with `hf` lit, the right letter.
  - The setting survives a reload.
  - Carbon only covers now and later rows.
  - With both on, the sheet's patch row carries the readings.
  - Cleared, no reading is left anywhere.
- **Missing data.**
  - A row with `hf` or `cr` nulled draws no reading and no placeholder text.
  - With both missing, the sheet has no score row and no panel.
  - A real dish with no grade has no footprint and no scale, and one rating.
  - `hf` 0 shows "0" with no bars lit.
- **Ratings panel**, for both, health only and carbon only:
  - not `.label`;
  - no rule thicker than 1 px;
  - rules = ratings − 1;
  - no rule at its edges or inside a rating.
- **Plant and veg.**
  - No shared path on rows, patches or chips.
  - Each is one mark everywhere.
  - Rasterised solid, their IoU is under 0.6.
- **Wrapping, at 360 and 390 px, both on.**
  - Every hall (lunch) and Search ("", rigatoni, ramen, penne w, wings, posole): no loose content, no group split over two
    lines, nothing overflows, every wrapped line flush.
  - The longest name carries every badge.
- **Red.** `RED=8 SRC=$PWD/build/r8/before/index.html node test.js`: all five are RED on round 7. The plant/veg test fails
  on IoU 0.90 (its path check alone passed there, which is why the IoU check exists). With the current build all are green.
- **Shape:** at 360 and 390 px, Search's hall letters sit under the +, never in the meta line, and a row's height is the
  same with the scores on as off whenever its meta line fits.
- **Now:** `node test.js` gives 4,898 checks and `RM=1 node test.js` gives 3,209, all green (after pass 6).

### Open (for the owner)
- **0 or unscored? Settled in round 8b** (the legend's H code decides). Kept for history: 73 of 661 dishes have healthfulness 0. That includes cookies and danish, which is plausible. But 4 of the
  12 dishes with no carbon grade are also 0 (Tortellini, BBQ and Buffalo wings, Southern mac & cheese), which looks like
  "not scored". I show 0 as a score. If the feed's 0 means unscored, it should be dropped like a missing value.
- **Healthfulness is never missing** in the Oct 8 and 9 feeds. The missing case is tested by nulling a dish.
- **A bar meter already means "busy"** on the hall bands (gold on the photo). The health meter is maroon, carries a figure,
  and only appears on dishes, so I kept it.
- **A Search row shows one hall's scores.** 6 of 110 multi-hall dishes are scored differently by hall (Beef Brisket Noodle
  Bowl: W 4/D, B 4/C). The row reads the hall it stands for (`rep`), which is the one its sheet opens, so row and sheet
  agree. Another hall's sheet can differ.
- **The scores have no container.** The brief says "badges". Boxed versions read as form fields at row size (`mock/v1`,
  `v2`, `v6`), so each score is a figure with its drawn unit, like "273 cal".


## Round 8b: scores as tiles in the official app's family

The owner overruled the unboxed readings: "I'd prefer the badges, as that's what the official app used. If it's not
scored, don't show anything." Only the scores change. The diet patches, the sprout and leaf, the toggles, the hall letters
under the + and the panel's rules all stay.

### Data
- **Scored means the legend code.**
  - `build.py` now takes healthfulness from `H0`..`H7` in `recipe-webcode`, not from `data-healthfulness`.
  - 16 Oct 8 dishes (11 on Oct 9) carry a healthfulness number but no H code: Beef Nachos, Hard Boiled Egg, Homemade Spicy
    Hummus and others. They are unscored and draw nothing.
  - 72 dishes have `H0`: a real 0, which is shown (including Tortellini, the wings and mac & cheese).
- **Carbon** always matches its `CR1`..`CR5` code. The 12 dishes with no letter draw nothing.

### Design
- **Tiles.** A portrait rounded tile (24×30; 18×22.5 on rows), a white pictogram, and the value knocked into it in ink. They
  are drawn as our own SVG; UMass's PNGs are not embedded.
- **Carbon:** UMass's colours (A #0d6d3a, B #9bcb3b, C #dbe11d, D #bcbdc0, E #818285) and a footprint holding the letter.
- **Healthfulness:** the official app has none, so it is a heart holding the number on a blue ramp, 0 pale (#cfe0f2) to 7
  deep (#0f4a8a). Ordered like carbon's ramp, but blue never meets carbon's green, lime or grey.
- **Not a hall letter.** Hall letters are maroon squares with gold letters. A tile is taller than wide, green, grey or blue,
  and carries a pictogram.
- **Contrast.**
  - The figure is always ink on the white pictogram: the darkest shade of the tile's hue, 6.4:1 to 13.2:1, which is AA.
  - White on UMass's light tiles fails (B 1.9, C 1.4, D 1.9, E 3.8), so no white text is used.
  - Tiles under 3:1 on chalk (B, C, D, health 0 to 3) get a 1 px edge in their ink.
- **What survives at each size.**
  - Row: the tile alone (UMass's "CARBON RATING" caption is about 3 px there).
  - Sheet patch row: the tile at 24×30.
  - Ratings panel: the whole scale. Each step is its figure over a 4 px strip of its colour, and the dish's step is the
    full tile, so the panel is where the colours are explained.
  - The panel's title is "Carbon rating" (the official term). The You toggle is renamed to match.
- **The round-8 12 px "scores on" rhythm is deleted.** Both tiles take 42 px, so with round 7's spacing every hall row keeps
  one meta line at 360 px (`wrapstat.js`: 0 of 216 wrap).

### Review passes (`build/r8/final`, 2× and 1× crops at 360 and 390 px, all four toggle states)
**Pass 1: 3 flaws.**
1. At 1×, the row tile's letter was about 8 px and "A" closed up. The toes are now smaller, the sole is wider, the figure is
   14 units, and the row tile grew from 17 to 18 px.
2. The 22.5 px tile grew the 21.6 px meta line by 0.5 px. That changed the height of Search rows with long names between
   toggle states (caught by the shape test). The group now has −1 px block margins.
3. The 12 px rhythm and its `sc-on` class were dead weight with tiles this narrow. Removed.

**Pass 2: clean.** Checked:
- `shot-r8-rows.png`, `shot-r8-rows-360.png`, `shot-r8-sheet.png`, `shot-r8b-tiles.png`;
- 1× Search rows at 360 px (`final/rows-1x-360-zoom.png`).

### Tests
- **Rows match their dish:** the tile's figure and its fill colour (`HFC` / `CRC`).
- **An H0 dish** shows a "0" tile.
- **An unscored dish** (no H code; at least 10 exist in the feed) has no health tile on its row, its sheet or its panel.
- **The panel's selected step** is the tile (`.hscale i.on` = 3 for Golden BBQ).
- **Now:** `node test.js` gives 4,894 checks and `RM=1 node test.js` gives 3,120, all green.

### Open
- **The heart and the blue ramp are my choice**, since there is no official health icon. At row size the heart's point is
  narrow, so the figure sits in its upper half.


## Round 9: the place and its day

The brief's round-9 items (`docs/briefs/hall-menu-bakeoff.md`, "Owner decisions") are:
- a day control;
- today's hours and directions;
- allergens;
- network states;
- cafés with dishes;
- price on the sheet.

Critique: `CRITIQUE-r9.md`. Concept: `CONCEPT.md`, "Round 9", with an "As built" note.

The owner's answers:
- cafés go in Search and in "where";
- dishes that list no allergens are shown;
- Show all reveals until you leave the hall or café, across meal and day changes, and never edits the preference.

The coordinator's decisions: Charles River and Terrace stay out; `map_address` comes from the Oct 11 snapshot.

### Data (`build.py`)
- **Menus.** `menus-2026-10-08-to-22.json` replaces `menu-full-2026-10-0{8,9}.json`. There are 15 days (`DAYS`), 4 halls and 16 cafés.
  - `MD[day][place][meal]` is a list of `[station, [dish index]]`. `DISHES` holds each distinct dish once, 2,3xx of them.
  - A place is a hall letter, or `c<i>` for `P.places[i]`.
  - Café meal keys gain `all` ("daily offerings", shown as "All day").
  - Charles River (Newton) and Terrace (Fieldstone Apartments) are in the feed and are left out, as in every earlier round.
    So the feed's "17 cafés" are 16 here.
- **Dish fields.** Two are new:
  - `price` (r[12]), the feed's own string.
  - `rawHealthfulness` (r[13]), the feed's `data-healthfulness`. Only `vectors.js` reads it; the UI scores from the H code,
    as in 8b.
- **Allergens** are split, trimmed and checked against the 11 values. The order is milk, eggs, fish, shellfish, tree nuts,
  peanuts, wheat, soy, sesame, then gluten and corn. Blank stays blank.
- **Asserts.**
  - Oct 10 is empty everywhere.
  - Franklin has no breakfast on Sunday.
  - The benchmark plate is 404 cal / 38.9 g.
  - Golden BBQ's label is complete and it has no price.
  - At least 16 dishes have a healthfulness number but no H code.
- **Meal windows (`WIN`)** follow `shared/src/hours.ts`: `STANDARD_MEAL_WINDOWS` clamped to the place's general hours.
  - Unlike `effectiveMealWindow`, the clamp is applied regardless of the clock, because M2 needs later today and tomorrow.
  - Late night runs to the 2 AM rollover before the clamp.
  - Grab 'N Go keeps its own hours. A café's all-day and Grab 'N Go menus use its general hours.
  - The real `effectiveMealWindow` (`TZ=America/New_York node`, importing `shared/src/hours.ts`, `mapInfoV2` on the Oct 8
    JSON at 12:41) gives Worcester lunch `11:00 AM`–`4:30 PM`. That value is pasted into `test.js`.
  - `MEALWIN` and `mealWin`'s guess are deleted. `NOW` is 12:41.
- **Where (`ADDR`).** It holds the street line of get_infov2's `address` (`parseStreetAddress`) and its `map_address`, from
  `locations-2026-10-11.json`.
  - Procrastination Station is missing from that snapshot (closed that Sunday): 38 of our 39 places are in it. Its
    address and `map_address` (42.389757,-72.528169) are copied inline in `build.py` from the Oct 8 raw capture
    (`local/photos/raw/infov2.json`, gitignored), so the build reads nothing outside `flows/`.
  - All eight Campus Center cafés share one map pin.
- The page is 5.3 MB, up from 3.8 MB.

### Design (what was built; motion is all existing patterns)
- **Day cell.**
  - It leads the meal row and is the station switcher's material.
  - The meals scroll as whole tabs with no ellipsis. The selected tab is brought into view with `scroll`.
  - A one-menu café (Worcester Café, Newman Café) has no tab row: its day cell leads the station row, so collapsed it is
    the bar plus one row. `TH` and `SWH` carry the real pinned heights into `paint`, `PIN` and `#mspace`.
- **The schedule** (in `#isheet`).
  - Two ways in: the status line (a button with a 14 px chevron at 60% white) and the day cell.
  - Top: the address and Directions (Apple Maps on iOS, Google Maps elsewhere, with `map_address`). A café adds its
    building and Payment, and its description goes last.
  - Then the 15 days in date order. The chosen day is open in place with its span and each meal posted that day.
  - Opened on a later day, the body scrolls just enough (adding bottom room if needed) to show that day and its hours at
    rest.
- **Day change.**
  - The sheet goes away (`Sheet.away`).
  - At half-way out, the parts that say the day fade out where they are over the first 35% of `fadeThrough`: the list, the
    tab row, the day cell, the status line, the busy row and board, and the station button.
  - Then the new day is drawn and fades in, the list from .97.
  - It is not shared axis (the meals own that axis), and the header never moves.
- **The status line keeps its room** when it has nothing to say (loading, failed, nothing posted), and the busy row keeps
  its room, invisibly, on other days and offline. The name never moves between days or network states.
- **Events move to their day.** The IPD note is on Monday Oct 12's list. In the schedule, that day's row says "Holiday
  hours" and holds the event in place of the snapshot windows. On its own day the note drops its date tag.
- **Allergens.** Dietary preferences has two groups, "Only show" and "Avoid".
  - The one line over a list counts what it hides by allergen and never calls the rest safe: "Hiding 20 dishes that list
    milk", or "Showing vegetarian dishes, hiding 9 that list peanuts".
  - Show all (`S.reveal`, `S.sreveal`) reveals until the hall or café closes, or until a fresh Search.
  - Revealed rows lead with "Contains milk" in maroon. The sheet's Contains line sets avoided allergens in bold.
  - Search and later rows are filtered, behind the same line.
  - Arriving at a hidden dish through "where" opens the list revealed, with the row marked.
  - The You row reads "Vegetarian, no peanuts".
- **Network.** Photos, names and addresses are bundled. Hours are cached for the day. Busy is live and is never shown stale.
  Menus are cached per place and day; offline, today and tomorrow are saved.
  - Halls, loading: the status and busy lines arrive in place.
  - Halls, offline: no busy meters, and "You're offline" under the date.
  - Halls, failed: names and letters only, with "Couldn't connect" and Try again under the date.
  - A hall, loading: an activity indicator after 400 ms, then the labels and list fade in.
  - A hall, offline: today is as online minus the live layer. Unsaved days say "You're offline, and the menu for …
    isn't saved on this phone", and the schedule says "Not saved".
  - A hall, failed: "Worcester's menu didn't load." with Try again.
- **Cafés with dishes** use the hall screen's path entirely: meal tabs from the feed, stations, rows with scores, the
  sheet.
  - "Now" is the standard window clamped to the café's hours.
  - A café plate never joins a hall plate (place keys never mix). It is labelled "Green Fields lunch". An all-day or Grab
    'N Go item goes on the clock's meal ("Worcester Café lunch").
  - The 11 cafés without a dish menu keep their description and "doesn't list its menu" with Add a custom food.
- **Price.** The serving's price leads the serving line in Oswald ("$11.00  1 each"), only for a café serving, whatever
  opened the sheet. Rows never show it.
- **Search.**
  - Café dishes are a group, "At cafés", once something is typed or a lens is on. Idle Search is still the halls' lunch.
  - Each row's lane names its café, or "7 cafés".
  - Places no longer matches a café with dishes by its old names list, which duplicated the dish rows.
  - "Where" chips for cafés are the deep-maroon tag with the name and no letter.

### Review passes (`build/r9/p1`, `p2`: 390 left and 360 right at dpr 2, from `shots9.js`; strips from `rec.js`)
**Pass 1: 9 flaws.**
1. Collapsed, the busy row and lamp board showed over the compact bar. An edit had swallowed their opacity lines into a
   comment.
2. On an empty day the station row showed a lone gold chevron, and the tab row a 1 px underline stub.
3. Loading, failed and empty days dropped the name about 40 px, because the status line collapsed. It now keeps its room.
4. At 360 px, "Couldn't reach UMass Dining" touched "Lunch". It now reads "Couldn't connect".
5. The IPD note repeated "Mon, Oct 12" inside Monday's own row and list.
6. The Dietary preferences page drew a rule under its last row.
7. Search listed Green Fields, Harvest Market and Worcester Café twice: under Places (by their old names lists) and as
   dish rows.
8. Café names in the lane wrapped to "Whitmore / Café".
9. The schedule couldn't scroll a late chosen day into view at rest, because the scroll range ran out. It now adds room.

**Pass 2: 3 flaws, from the day-change strips** (`build/r9/strip-daychange-zoom.png`, `strip-daychangecollapsed-zoom.png`).
1. The first build overlapped the old and new lists for about 100 ms (double exposure). Its label copies lost their
   id-scoped CSS: the status line sat 12 px high over the name, and the busy row wrapped.
2. The tab and station rows went blank for a frame while the busy board popped off.
3. Rebuilt as a sequential fade through: out in place, then in. The two chevrons were then left alone for a frame, so the
   whole day cell and station button now fade.

**Pass 3: clean.** After the last change, all 28 states were reshot (`build/r9/p3`) and viewed at both widths on the
contact sheets `p3/sheet1.png` to `sheet4.png`. The loading state was retaken at 800 ms (`p3/hall-slow.png`), because the
sheet run caught it mid-arrival. Strips viewed:
- `strip-daychange-zoom`, `strip-daychangecollapsed-zoom`, `strip-schedday-zoom`, `strip-schedstatus-zoom`,
  `strip-showall-zoom`;
- `build/rec/strip-M2-daychange.png`.
- One fix landed with this pass: an empty day's copy uses `text-wrap: pretty`, so "yet." no longer sits alone at 360 px.

**Pass 4: 5 flaws** (coordinator review of pass 3). Shots in `build/r9/p4` (contact sheets `sheet1.png`, `sheet2.png`) and
`build/r9/tabfade.png`. Strips re-recorded: `strip-daychange-zoom.png`, `strip-daychangecollapsed-zoom.png`,
`build/rec/strip-M2-daychange.png`.
1. **The day change blanked the letter for one frame**, about 176 ms in. `renderMenu` rewrote the letter's SVG and the
   name's text even though the place hadn't changed, and one frame painted before they returned. What names the place
   (photo, letter, name) is now written only when the place changes (`#mhead[data-k]`).
   - The test checks every frame: the letter's and name's nodes are the same objects, the opacity of the letter, name,
     photo and header is 1, and pixel samples of the letter keep their gold against a baseline taken under the same scrim.
   - With the guard disabled (`build/r9/p4red/`), the test fails at frame 19.
2. **Scrolling tabs showed cut fragments** ("Late n", "Grab '"). A side with more to scroll now fades its labels into the
   row's own maroon over 24 px (`.mts.fl` / `.fr`, a mask that follows the scroll). The selected tab is kept 24 px clear of
   a fade. Checked at 360 px in both header states, on Worcester and Harvest Market.
3. **"No menu yet" implied a menu was coming**, which is false for a café closed on weekends. The schedule row now reads
   "No menu posted", and the list "No menu posted for Saturday, October 10."
4. **The Oct 12 schedule row only named the event.** The expanded line is now a row titled "Indigenous Peoples Day
   Hours" (the hours event's own title, kept as the event's `[5]`), with a chevron and a 44 px target. It opens the event
   page by the existing push, after the sheet goes, and that page has the Holiday hours link.
5. **Halls' Try again was small corner text.** It is now an outlined button (`.obtn`, 44 px, white on maroon, the
   counterpart of the hall screen's outlined Try again), under "Couldn't connect" in the date column. It is at least 16 px
   clear of "Lunch" at 360 (tested).

### Tests (`test.js`, `round9`; `RED=9` runs it alone, each scenario caught)
- **Real windows.** Worcester lunch equals `effectiveMealWindow`'s 11:00 AM–4:30 PM. There is no breakfast at Berkshire, no
  late night at F or H, and late night at W and B runs 9 PM to 11:59. `MEALWIN` is gone. `NOW` is 12:41.
- **Day change.**
  - Franklin Thursday has four tabs; Sunday has Lunch and Dinner. The day cell reads "Sun 11". The meal is kept.
  - In every frame, the header's parts never move.
  - The list scales uniformly from .97 and fades in. Nothing is left over.
  - At 390 and 360 px, every tab is whole and at least 44 px tall, the selected one is fully in view, and the day cell
    holds the edge.
- **Schedule.**
  - The status line opens it, with the address and a Directions link carrying `map_address`.
  - It has 15 days; Oct 10 says "No menu posted". Today's five windows are listed, and only the chosen day is open.
  - The status chevron is 60% white.
  - Opened on Oct 21 from the day cell, that day and its hours are visible at rest.
  - Wasabi's schedule has its building and Payment, and Sunday says "No menu posted".
- **Allergens** (real taps on the You page).
  - The 11 allergens are listed in order. You reads "No milk".
  - The 20 milk dishes are hidden, the line counts them, and a dish with blank allergens stays.
  - Show all reveals them all with "Contains milk", and the setting is unchanged in memory and in storage.
  - The reveal survives a meal change and a day change, and resets on leaving the hall. The setting survives a reload.
  - Search has the line, and no Search row lists milk.
  - "Where" lands revealed, with the row marked.
- **Network.**
  - Slow: hours arrive late; the indicator shows, then the menu.
  - Offline: the date stays with "You're offline". There is no meter, no photo is altered (computed filters and opacity
    match online), and today is saved. Tuesday gives the offline copy, and the schedule says "Not saved".
  - Fail: the copy is shown, and Try again works on the hall and on Halls.
  - The name's y is identical in the online, fail, slow and offline states.
- **Cafés.**
  - Green Fields has meal tabs, stations and rows.
  - Caesar Salad starts "Green Fields lunch" beside "Worcester lunch". French fries at a hall and at a café make two
    plates, and no plate mixes the two.
  - The sheet's serving line reads "$11.00 1 each", and no row has a price.
  - The one priced hall dish (`14.F.lunch.5.1`, $0.08) shows no price, nor does Golden BBQ.
  - A café dish opened from the plate keeps its price.
  - Worcester Café's collapsed header is the bar plus one row. ISB Café keeps "doesn't list its menu".
- **Search.**
  - "caesar" gives an "At cafés" row whose lane says Green Fields, and no duplicate in Places.
  - "Where" is ["Lunch now, until 4:30 PM: Green Fields"]. Its tag opens Green Fields at lunch, scrolled to the dish.
  - The café row's + gives "Green Fields lunch".
  - At 4:31 PM it is dinner at Green Fields.
- **Updated older checks.**
  - Round 5's clocks: posole is "Lunch now, until 4:30 PM" at 3:45 and "Dinner now, until 9 PM" at 4:31. Brisket has no
    answer at 4:31, not 3:45.
  - Franklin tomorrow now reads the day cell ("Fri 9") and that day's hours ("7 AM to 9 PM").
  - The IPD note is on Monday, not Thursday.
  - Wasabi's California Roll starts "Wasabi lunch" instead of opening a custom food.
  - The event-note push sources use `?state=menu&day=4` (new param).
- **Red.** `RED=9 SRC=$PWD/build/r9/before/index.html node test.js` gives all 7 scenarios RED on round 8b. With the current
  build, all are green.
- **Now** (after pass 4): `node test.js` gives 5,624 checks and `RM=1 node test.js` gives 3,651, all green. Counts vary
  between runs because sampled frames are counted.
- **Added in pass 4:**
  - the letter, name and photo are never re-drawn and stay opaque in any frame of a day change;
  - the letter's gold is on screen in pixel samples;
  - the tab fades follow what is left to scroll, at 390 and 360;
  - "No menu posted";
  - the holiday row opens the event, with its title, chevron and 44 px target;
  - Halls' Try again is a 44 px outlined button clear of "Lunch" at both widths. `RED=1` and `RED=8` (rounds 7
  and 8 scenario by scenario) are green.
- **Benchmark C** reports 2 or 7 flicks from run to run, on round 8b and round 9 alike (`r9b/benchc.js`: three runs each
  gave 2, 7, 2 and 7, 7, 2). Whether a CDP flick flings is Chromium timing, not a regression.

### Vectors (`vectors.js` -> `vectors.json`)
- **where:** 23 dishes × 12:41, 4:31 and 9:30 PM, including 5 café-only dishes and 2 served at halls and cafés alike.
- **plate:** 10 sequences: the benchmark, narrowing, a conflicting hall, ½ then removed, an emptied plate (front in range),
  a custom item, a café plate beside a hall plate, the same name at a hall and a café, an all-day café item on the lunch
  plate, and lunch vs dinner.
- **scores:** all 2,203 distinct (dish, health, carbon, raw) combinations, 164 of them with a number but no H code.
- **price:** 3 priced café dishes, 1 unpriced, Golden BBQ, and the $0.08 hall dish (not shown).
- The shape is documented at the top of `vectors.js`. Halls are place keys (`c<i>` for cafés), and `places` maps them to
  names.
- Plate ops in the file carry resolved place keys only. The script refuses any add op whose places aren't in `places`.

### Files
- `build.py`, `src.html`, `test.js` (round 9 plus updated older checks), `rec.js` (`daychange`, `daychangecollapsed`,
  `schedday`, `schedstatus`, `showall`; evnote sources on day 4), `strips.sh`, `shots9.js`, `vectors.js`, `vectors.json`.
- Shots: `build/r9/p1`, `build/r9/p2`. Zoomed strips: `build/r9/strip-*-zoom.png` (`build/r9/zoom.py`).
- Round 8b's page, source and test: `build/r9/before/`.

### Open (for the owner)
- **Header noise.** Expanded, the header has three chevrons: the status line's (small, 60% white) and the day cell's and
  station's (gold). At 360 px it reads as two gold controls stacked at the left edge under a quiet line, not as clutter to
  me. But the two gold dropdowns are stacked and identical in kind. If it reads as clutter to you, the day cell's chevron
  could go: the cell is the schedule's second door, and the status line is the first.
- **The status line is the schedule's door only while expanded.** Collapsed, the day cell is the only way in.
- **Café hours on other days** use the Oct 8 snapshot, shown only on days the café has a menu posted. Sunday's capture had
  Green Fields and Wasabi closed, and their Sunday menus are empty, so nothing contradicts.
- **Search while failed.** Search still lists dishes under `?net=fail`. Only Halls and the hall screen model the network.
- **The $0.08 hall dish** (Franklin, Oct 22) is presumably a per-unit café price on a shared dish record. It is never shown.
- **The schedule scrolls itself on a late day.**
  - Opened on a day low in the list, the body scrolls just enough to show that day and its hours at rest. That can scroll
    the address and Directions out of view: 15 day rows don't fit 844 px under any top block.
  - Because the body is pre-scrolled, a drag down first scrolls the list back, then dismisses. The backdrop tap always
    dismisses.
  - The alternative is to keep the top block and let a late day need one scroll.
- **The activity indicator** is a CSS ring that spins (900 ms). Under reduced motion it stands still, as every animation
  in M2 does.


## Round 9b: Terrace, and the Charles River Campus toggle

The owner reversed two café decisions from round 9.

### Data (`build.py`)
- **Terrace** is added as area 3 (Southwest), building "Fieldstone Apartments".
  - It is physically on campus: 42.3834, -72.5273, south of Hampshire Commons. UMass lists it as off campus.
  - Its photo is UMass's location card (`assets/retail/terrace.png`).
  - Its dish menu is tid 11150: breakfast and dinner today, with prices.
- **Charles River Campus** ("Charles River Campus of UMass Amherst" in the feed) is added as area 4, "Charles River
  Campus, Newton", building "Newton".
  - Its menu is tid 10372: breakfast, lunch and dinner, with no prices.
  - Its hours are 7 AM to 11:30 PM (Oct 8). Its address is 100 Carlson Ave, map pin 42.299095,-71.187034.
- Both are appended to `places`, so no earlier café key moved. Terrace is `c27` and Charles River is `c28`; `vectors.json`'s
  `places` is authoritative.
- Places now number 29, 18 of them with dish menus.
- **No Charles River photo.** get_infov2 has no image field in either capture, and UMass's location cards
  (`assets/retail/index.json`, 36 entries) have none. `build.py` asserts it's the only place without one; nothing is
  invented.

### Design
- **The toggle** is on You, in its own "Campus" section between the list rows and "Show on dishes". It's a check row,
  "Charles River Campus" with "Newton" under it, default off, and persisted as `newton` in `udine-m2`.
- **Off (`placeOn`), Charles River appears nowhere:**
  - no area row or Cafés & markets group;
  - no Search place or dish rows;
  - nothing in "where" (`wherePlan` skips its servings);
  - no pinned band.
- **Nothing is deleted.** The pin stays in `S.pins`. Its plates move to `S.offPlates` and come back when it's on again. If
  its screen is open, it closes.
- **On, it adds to Amherst; it doesn't replace it:**
  - a group last in Cafés & markets, and the same last on Halls' area list;
  - its page, built like every dish café;
  - Search (`At cafés`, lane "Charles River Campus") and "where";
  - its own plates ("Charles River Campus lunch");
  - the schedule, with its address and Directions;
  - pinning.
- **No photo, honestly.** Its pinned band and page header are the band's own maroon ground (`.nophoto`: the photo window is
  not drawn), with the same name, status and gradients. Its list rows have no thumbnail, as the halls' rows in Search
  have none.

### Tests (`round9`, "round 9b")
- **Terrace.**
  - It's in Southwest's group, area 3, Fieldstone Apartments, with a dish menu and its photo.
  - Its page has Breakfast and Dinner.
  - "harissa chicken" is found in Search ("Dinner Terrace"), its sheet shows $13.50, and "where" names Terrace.
- **Charles River, off** (with a Charles River pin and a Wasabi pin stored):
  - no area row, and only Wasabi's band is drawn, while the pin is kept;
  - not in Cafés & markets;
  - no Search place, no row for its dish, and no "where".
- **Charles River, on** (a real tap on You):
  - the toggle survives a reload;
  - its area comes last and its band is back, `.nophoto`, with no photo window;
  - it's in Cafés & markets, and its page has Breakfast, Lunch and Dinner;
  - its schedule has 100 Carlson Ave and Directions to Newton;
  - Search finds its dish with its name in the lane, and "where" names it;
  - its + makes "Charles River Campus lunch". Off sets that plate aside, and on brings it back.
- **Off again:** it's nowhere again.
- **Older checks:** Cafés & markets now has 28 Amherst places open at 12:41.
- **Now:** `node test.js` gives 5,499 checks and `RM=1 node test.js` gives 3,559, all green.

### Vectors
- 75 where cases, including Terrace's Harissa Chicken and Charles River's Chorizo Jalapeno Quesadilla. The Charles River
  case is computed with the toggle on and marked `"newton": true`.
- Terrace's $13.50 joins the price cases.
- There are 2,396 score cases, 172 of them a number with no H code.

### Shots (`build/r9/p9b`, 390 and 360 at dpr 2; `sheet1.png`, `sheet2.png`, `sheet3.png`)
All of these were viewed:
- `b-terrace-area`, `b-terrace-page`;
- `b-you-off`, `b-you-on`;
- `b-areas-on` (Halls with the Charles River band and area row);
- `b-cafes-cr` (Cafés & markets with Charles River);
- `b-cr-page`;
- `b-cr-search` ("chorizo": its quesadilla under At cafés).
- **Follow-up.** A Search lane shows the short name "Charles River" (its page and lists keep "Charles River Campus"). Its
  rows in Cafés & markets and in Search's Places get a thumbnail-sized tile of the band's own maroon ground, with no
  picture and no letter, so the text column aligns (tested). Shots: `build/r9/p9b/sheet4.png`.


## Round 9c: hall cards in Search, aligned letters, every meal visible

The owner asked for three things:
- a shorter hall card in Search, without the letter;
- Franklin's F aligned with the other letters;
- every meal tab visible, Grab 'N Go included.

### Hall card in Search
- **Where Search shows a hall.** Only in Places results: a name or "hall" match on a hall. Hall letters elsewhere in Search
  (dish lanes, "where" chips) are markers, not halls, so they're unchanged. Worcester Grab 'N Go and the other Grab 'N Go
  rows keep their place rows, with their own photo.
- **The card (`hallCard`, `.band.hcard`)** is the hall band at 76 px, shorter than a pinned café's 84. It has the halls'
  duotone and left gradient, the name in Oswald 24, and the status with the busy meter on one line. It has no letter.
  - Matching halls stack at the top of Places on the rack's maroon seam (`.hcards`).
- **Hall, not café.** Cafés never appear in Search as bands, only as thumbnail rows. Their bands elsewhere are in their
  own full colour, while the hall card is the maroon duotone with the meter, which only halls have.
- **Tapping** uses the container transform. The card is a `.band`, so `measureXF` treats it as the photo window, as on Halls.
  - It replaces round 7's push for Search hall results; the "push: hall result" sampler was retired.
  - The letter, which the card lacks, is header content: it fades in over .3–1 where it lands, like the status and the
    tabs, so it never flies in from nowhere.
  - Strips: `build/rec/strip-M2-hallresult.png`, `strip-M2-hallresultclose.png`, `build/r9/strip-hallresult-zoom.png`,
    `strip-hallresultclose-zoom.png`. The close shrinks back into the card.

### Letters
- `LX` (the letter's x in its 200-unit box) is now W 89, F 82, H 81.5 and B 82, chosen so each felt's visible left edge
  is the same. Measured on the rendered band at 390 px it is 279 px for all four; before, it was W 262, F 315, H 285.5 and
  B 288.
- The header's letter uses the same `LX`, so Franklin's open lands in place (`strip-M2-openf.png`,
  `build/r9/strip-openf-zoom.png`).
- The letters appear together only on Halls. Search's hall cards carry none.

### Every meal visible
- **The day cell ends the station row** ("Soups ⌄ … Today ⌄"), as the coordinator suggested, in both header states and
  for every place.
  - I kept that arrangement because the station row has spare width, is pinned in both states, and is where one-menu
    cafés already had it. The row now reads "where in the list | which day".
  - The alternative, a day cell in the bar beside the name, would be lost on the expanded photo header. It would also put
    a second gold dropdown next to the back button.
- **Measured.** At 15 px, Worcester's five labels need 324 px of text plus padding, which overflowed 360 px. At 14 px
  (Breakfast 65, Lunch 41, Dinner 44, Late night 66, Grab 'N Go 71 px) they fit at 360 with 12 px between labels. The
  tabs share the row as M2's tabs always have.
- **No label changed**, and no label is ellipsized or clipped.
- The scrolling tabs (`showTab`), the edge fade (`tabFade`, `.mts.fl/.fr`) and their tests are deleted.

### Tests
- **Letters:** at 390 and 360 px, the ink's left edge (letters alone, on black) is the same for W F H B within 1 px.
  Franklin's header letter keeps the bands' offset.
- **Every meal tab of every place on every day**, at 360 and 390, expanded and collapsed (`round9`, "day change"):
  - each tab is whole, inside the row, not ellipsized and at least 44 px tall;
  - the row neither scrolls nor fades;
  - the day cell sits at the station row's right end and is at least 44 px tall.
  - The day-change "header never moves" check reads the day cell's right edge, since its width follows "Today"/"Sun 11".
- **Search:**
  - "worcester" gives one 76 px duotone card with a meter and no letter, and no hall place row besides it;
  - tapping it opens Worcester by the container transform (`S.hallSrc` is the card, and no push);
  - the close leaves the card visible.
- **Now:** `node test.js` gives 5,014 checks and `RM=1 node test.js` gives 3,418, all green. `RED=1`, `RED=8` and `RED=9`
  are green scenario by scenario.
- `vectors.json` was regenerated; its values are unchanged by 9c.

### Shots (`build/r9/p9c`, 390 and 360 at dpr 2; `sheet1.png` to `sheet3.png`, `letters.png`)
- `c-halls`, `c-w-top`, `c-w-collapsed`, `c-f-top`, `c-f-collapsed`, `c-cafe-meals` (Harvest Market, four meals),
  `c-cafe-one` (Worcester Café), `c-search-halls` ("hall": all four cards), `c-search-worcester`, `c-sched` (opened from
  the new day cell).
- The day-change strip: `build/r9/strip-daychange-zoom.png`. With two meals (Franklin, Sunday) the tabs share the row
  evenly.


## Round 10: a menu that can keep a ledger

The owner's decisions are in the bake-off brief, "Owner decisions" (2026-10-12). The critique is `CRITIQUE-r10.md` and the
concept is `CONCEPT.md`, "Round 10".

The owner's answers:
- tracking off hides "Which was better?", and Export stays while any history exists;
- a skipped first run means tracking on, no diet or allergens, scores off;
- with tracking off, "where it's served" takes the sheet's action slot;
- Salad Bar and Deli Bar get a synthetic base.

The coordinator agreed to the rest:
- Charles River is not in first run;
- add-ons with no nutrition are left out;
- a past meal can change quantities, remove items or be deleted;
- Health has no backfill, keeps what it already holds when switched off, and stops (then resumes) with tracking;
- the seeded week is as proposed.

### Data and model
- **The log** is by day. A meal is `{id, at, day, time, meal, hall, items}`.
  - `day` is computed from `at` with the 2 AM rollover (`ROLLOVER`, shared/src/date.ts `DEFAULT_ROLLOVER_HOUR`).
  - An item is a snapshot: `{id, n, qty, cal, p, c, f, nut, price, parts?}`.
  - `dayTotal(day)` is per day, and today is `TODAY`.
- **The seeded history** (`SEED`, `seedLog()`) is seeded, not recorded. The days and meals are invented; every dish and its
  nutrition is the fixture's, and `seedDish` throws if a name isn't served at that place.
  - Thu Oct 1 to Wed Oct 7, plus today's 8:42 AM Worcester breakfast (seeded since round 1).
  - 2–3 meals a day; nothing on Saturday Oct 3.
  - A 12:30 AM late night on Tue Oct 6, which counts for Monday.
  - Two Noodle Bowl bowls with parts (Mon and Tue lunch at Worcester).
  - Two priced Green Fields meals (Fri lunch, Tue dinner).
  - Day totals run from 393 to 1,268 cal, so the logging reads as partial, as real logging is.
- **Bowls (`buildOf`, `synOf`, `bowlDish`).** The feed links no base to its add-ins, so the stations decide.
  - **Halls, natural base** (Noodle Bowl, Pasta Bar, Omelet):
    - the base is a dish of at least 120 cal whose name has no sauce, topping, broth or dressing (at Omelet, "Omelet
      Bar");
    - the station's other dishes are its add-ins;
    - a base's row + still adds the plain dish.
  - **Synthetic base** (owner): an unpriced station named Salad Bar, Cold Bar or Deli Bar.
    - The stations are Berkshire's Salad Bar/Dressings; Franklin's and Berkshire's Deli Bar; Harvest Market's "Salad Bar
      $11.50/LB"; Harvest's and Roots' "Cold Bar Items $11.50/LB"; and, with the Newton toggle on, Charles River's Salad
      Bar and Deli Bar.
    - Its row heads the station, with a chevron: "Your salad from the Salad Bar", "Your salad from the Cold Bar", "Your
      sandwich from the Deli Bar".
    - The name is sentence case, starts with "Your" and names the station, so it reads as something the student built.
      It never reads as a UMass dish: feed names are title case and never begin with "Your".
    - It reads the same on the plate, in a past meal and in a Health record name.
    - It has no nutrition of its own: the bowl is only the sum of what's chosen. With nothing chosen the foot reads 0
      and Add is disabled.
    - The station's singles keep their own +.
  - **Bars left as single dishes** (owner question for later): Harvest Market's Hot Bar Items, Indian Bar and Asian Bar.
    These are hot entrées sold by the pound, with no natural base, and a "your bowl from the Hot Bar" adds little. Also:
    - Green Fields', Tavola's, Tamales', Whitmore's, Terrace's, People's and Star Ginger's "Salad Bar/Dressings" (and
      Terrace's "Deli Bar") are finished, priced dishes, not bars of parts;
    - Stir Fry Station has a single condiments dish.
  - **Cafés:** a dish builds when its place and meal have an Add-ons or Toppings station. Its add-ins are those stations'
    dishes with nutrition: Fountain Drink is left out, and sides such as Hand Fruit stay. Prices sum ("$12.25" plus
    avocado and chicken is "$19.00").
  - **A bowl** is one plate item whose ref is the summed dish:
    - grams are summed and %DV comes from FDA values, as the label already does when the feed has none;
    - its key is the base plus its parts, so two different bowls are two items;
    - a plain item of the same dish is separate (the row's stepper counts only it).
- **Health (simulated).**
  - `?os=ios|android` names the platform. `?health=allow|deny|revoked` is what the OS answers (revoked: stored on, no
    longer allowed).
  - `HEALTH.records` stands in for the store: one record per meal, `{mealId, name, at, energyKcal, proteinG, carbsG, fatG}`.
    Edits rewrite a meal's record, deletes delete it, and Undo writes it back. Nothing is read back.
  - Which fields each platform accepts is to be verified at build time.
- **Persisted:** `track`, `health` (in `udine-m2`); first run in `udine-m2-first`.

### Design (as built; motion all existing)
- **First run.** A non-modal sheet (`#obsheet`, no backdrop) rests just under the four hall bands.
  - It holds You's own rows: Track what I eat, Only show, Avoid, and Show on dishes with each row's tile.
  - A band tap is `Sheet.away` plus the container transform: one tap to a hall. Done, drag away or a band all mark it done.
  - `?first=1` shows it for shots.
- **Tracking off** (`#frame.notrack`, `setTrack`):
  - hall rows keep their lane, empty, at the same height;
  - Search's letters rise into the + slot;
  - gone: the bar, both custom-food buttons, the builder and the synthetic rows;
  - the sheet has no Add, and "where" sits 16 px under the identity;
  - You is "UDine / You" with the switch, the list (no ranking; Export while there's history), Campus and Show on dishes;
  - the plate in progress and the history stay, and come back on.
- **You, tracking on:**
  - Today, then Meals (each a row, with "cal"), then Earlier (one row per logged day, newest first, with its total);
  - Track what I eat, with Write to Health Connect under it;
  - the list, Campus, Show on dishes.
- **A day** is pushed. Its page is You's Today block for that day.
- **A meal** opens in the item sheet as plate rows with steppers, its totals, Full label and Delete meal.
  - The last half of an item leaves an inline "Removed … Undo" row.
  - Delete meal puts the sheet away and shows the receipt ("Deleted Worcester lunch", Undo) in the bar's slot.
- **The builder:**
  - the identity group (price summed at a café, Contains the union of all parts);
  - the station's name as heading, then compact add-in rows with the row's stepper;
  - where, then the summed label, ratings and ingredients;
  - a foot in the plate bar's material (Oswald calories and protein, the gold Add, or Update when editing) pinned to the
    screen's bottom edge, riding down with the sheet when it leaves;
  - resting height: identity plus four add-ins plus the foot.
  - A bowl on the plate shows "with …" and reopens its builder to edit. A plain dish on the plate opens its plain sheet
    ("Add another").
- **Health row:** "Write to Health Connect" (or Apple Health), "Each meal you log".
  - A tap raises the OS sheet straight away.
  - Denied: "Health Connect didn't allow it" and an outlined, 44 px "Open Health Connect".
  - Revoked: "Not allowed in Health Connect any more", same button.
  - The OS sheet is drawn in system type and grey, plainly not UDine's.

### Letters (owner, folded in from 9c)
- The 9c alignment is reversed: W, H and B are back at 262, 285.5 and 288 px at 390 (232, 255.5 and 258 at 360).
- Franklin's F, at 315 before 9c, moves to 296 (266 at 360): `LX.F` goes from 118 to 99.
  - At 300 it still read as pushed right of H and B by eye, so it went 4 px further. It's a loose column, not an
    aligned one.
- Crop: `build/r9/p10/letters.png` (390 left, 360 right). Franklin's open still lands in place (`strip-openf-zoom.png`).

### Review passes
**Pass 1** (stills `build/r9/p10`, `sheet1.png` to `sheet5.png`): 3 flaws.
1. The builder's foot floated mid-screen. Playwright's tap scrolled `#frame`, which clips but could still scroll
   programmatically, so every layer moved. The frame is now pinned (`scroll` resets it), which also guards against a
   focus doing the same on a phone.
2. Meal rows showed calories without "cal", while day rows had it.
3. The test's inline Undo row used `.prow`, so the plate's row handler caught its tap first. It's now `.lgone`.

**Pass 2** (strips): 1 flaw.
1. `bowladd`: the foot stayed pinned while the sheet left and overlapped the rising plate bar. Leaving, it now rides
   with the sheet.

Under reduced motion, a builder's "where" chip scrolled into view landed under the foot. The sheet's scroller now has
bottom scroll padding equal to the foot.

**Pass 3: clean.** Checked:
- every still in `p10` at 390 and 360;
- `strip-firstband-zoom.png`, `strip-pastmeal-zoom.png`, `strip-bowladd-zoom.png`, `strip-mealdelete-zoom.png`, and their
  full strips `build/rec/strip-M2-{firstband,pastmeal,bowladd,mealdelete}.png`.

### Tests (`test.js`, `round10`; `RED=10` runs it alone)
- **First run** (three fresh contexts):
  - it rests under the four bands, with tracking on, no diet, no allergens and scores off, and without Charles River;
  - a band tap puts it away and opens Franklin;
  - Done keeps a choice made in it;
  - dragging it away closes it;
  - after each, a reload doesn't bring it back.
- **Tracking off:**
  - no visible + or stepper on hall rows, and row heights unchanged;
  - no bar; `addDish` and `plateOpen` refuse;
  - the sheet has no Add, and "where" is 16 px under the identity;
  - no builder; Search has no + and no custom food;
  - You reads "You", with no ranking, no days and no Health row; Export stays with history and goes without it.
  - Back on: the plate in progress, the days and ranking return. The switch persists.
- **Past logs:**
  - Earlier's rows equal the per-day sums, newest first, and Oct 3 has no row;
  - the 12:30 AM meal counts for Oct 5;
  - the day page total;
  - a step edits the meal and the day;
  - the last half leaves an inline Undo that restores it;
  - Delete meal closes the sheet and shows "Deleted Worcester lunch"; Undo brings it back and the day shows it.
- **Bowls:**
  - the Noodle Bowl's heading; the foot and label at 340 (218 + 111 + 11);
  - it lands as one item with its parts;
  - the row's + still adds the plain dish, and the row counts only that;
  - reopened from the plate it shows Update with its parts, and Update replaces it in place with three parts;
  - Green Fields: "Add-ons", 628 cal and $19.00, no Fountain Drink, "Green Fields lunch";
  - the Salad Bar: "Your salad from the Salad Bar", 0 and disabled at first, then exactly the sum of the chosen items
    on the plate; its singles keep their +;
  - Franklin's Deli Bar has "Your sandwich from the Deli Bar".
- **Health:**
  - allow: the OS sheet is asked on a tap; on log, 404 is written; an edit gives 622; a delete removes it and Undo
    restores it;
  - tracking off writes nothing and hides the row, and back on it's still on;
  - deny: "Health Connect didn't allow it", a 44 px "Open Health Connect", nothing written;
  - revoked: "Not allowed in Health Connect any more";
  - iOS names Apple Health.
- **Letters:** the exact left edges above at 390 and 360. Franklin's header letter keeps the bands' offset.
- **Older tests adjusted:**
  - the round-7 "You row" push source is now a page row (the first row on You is a meal, which is a sheet);
  - `rec.js`'s `youopen` and `youclose` likewise;
  - every harness marks first run done in its contexts (`udine-m2-first`), except where first run is tested.
- **Red:** `RED=10 SRC=build/r9/before-r10-index.html` gives all 5 scenarios RED on round 9c.
- **Now:** `node test.js` gives 5,084 checks and `RM=1 node test.js` gives 3,361, all green. `RED=1`, `RED=8` and `RED=9` are green.

### Vectors
- 13 plate sequences, adding three bowls:
  - the Noodle Bowl beside the plain dish: a second identical bowl adds to its qty, and the plain dish stays separate;
  - Green Fields with Add-ons: 714 cal, $23.25;
  - the synthetic Salad Bar: 82 cal, only its parts.
- The new `bowl` op is described in `vectors.js`' header.
- A plate item with parts is written as `[name, qty, {parts, cal, price}]`.

### Files
- `src.html`, `build.py` (unchanged this round), `test.js`, `rec.js` (`firstband` with `FIRST=1`, `pastmeal`, `bowladd`,
  `mealdelete`), `strips.sh`, `shots9.js` (`r10-*`), `vectors.js`, `vectors.json`.
- Round 9c's page, source and test: `build/r9/before-r10-*`.

### Round 10 follow-up (coordinator review)
- **"sy" through Franklin's F in `letters.png`** was the crop, not the band. The 360 panel's crop began at x = 185 px,
  which cut "Probably a little bu|sy" and stood "sy" beside the left panel's F.
  - Measured on the bands, every hall's text ends by 196 px at both widths. Franklin's F ink starts at 283 at 390 (253 at
    360). The letters are not moved.
  - A new test forces every busy label (the longest is "Probably a little busy") into every band at 390 and 360 and
    asserts the text keeps 8 px clear of the letter's ink.
  - `letters.png` is re-cropped from x = 210 px.
- **You's title** is now "You" under the date in both states. With tracking on, "Today" is the first section's heading,
  over the day's totals and meals. Before, the title switched between "Today" and "UDine / You", although the tab is
  always "You".
- Shot: `build/r9/p10/you-title.png` (on at 390 and 360, then off).


## Round 11: what isn't on a menu, and what you can't reach

Brief: `docs/briefs/m2-round-11.md`, Task 1. Critique: `CRITIQUE-r11.md`. Concept: `CONCEPT.md`, "Round 11", written and
committed before the build. Items 1-4 are designs; item 5 applies the owner's bowl decisions of 2026-10-13.

### Data (`build.py`)
- **The Commonwealth Restaurant** is appended as `c29` (area 1, "North, by Worcester", building "Worcester Commons"), so no
  earlier key moves. Its hours (11 AM to 9 PM), payment and description come from the Oct 8 capture. Its address and
  map pin come from the Oct 11 snapshot, and its photo is UMass's location card. Places now number 30, and 29 Amherst
  cafés are open at 12:41.
- **Café PDF menus** come from `locations-2026-10-13.json`, the live `uapp/get_infov2` fetched for this round
  (2026-10-13 22:00 EDT, committed beside the earlier snapshots).
  - Every `<a>` in a retail menu's HTML is read; `parseRetailMenuHtml` reads only the first. Links are host-gated to
    umassdining.com.
  - The label is the link's own words, cut to the menu's name: "Click here for the Lite Fare Menu" becomes "Lite fare".
  - **Places publishing a PDF in the live feed today:**

    | Place | PDFs | Hours this week | In M2 |
    |---|---|---|---|
    | The Commonwealth Restaurant | Lunch (2 pages), Lite Fare (1), Dinner (2), Dessert (1) | Mon-Fri 11 AM-9 PM, Sat 4-9 PM, Sun closed | yes, `c29` |
    | babyBerk (food truck) | "Baby Berk Menu" (1 poster page) | closed every day | no: closed, no address (`map_address` is ",") |
    | babyBerk 2 (food truck) | "Baby Berk 2 Menu" (1 poster page) | closed every day | no, same |

  - All six PDFs downloaded (HTTP 200, `application/pdf`). The four Commonwealth PDFs are kept in `local/pdf/`
    (gitignored, UMass's). `build.py` rasterizes their pages with `pdftoppm` at 1074 px wide into `build/pdf/` and
    embeds them, like the photos.
  - The Lunch PDF's second page is the dessert and beverage list. That is the PDF as UMass publishes it.
- **Packaged foods** come from `packaged-2026-10-13.json`, recorded from OpenFoodFacts:
  - the search "clif bar" (20 hits);
  - the product 0722252068484 (Clif Bar Chocolate Chip, 1 bar (68 g), 250 cal), trimmed to the fields M2 reads.
  - The endpoint RN calls, `cgi/search.pl`, answered 503 ("Page temporarily unavailable") twice at 22:05, so the
    search was recorded from `search.openfoodfacts.org`, which answered.
  - USDA FoodData Central couldn't be reached from this host (DNS failed for `api.nal.usda.gov`), so no USDA answer is
    recorded. The Packaged group would show it the same way.
  - A query the recording doesn't cover answers nothing. That is a prototype limit, not a design.
- **Search UMass Dining** isn't called: `lookup-dish` spends a global budget. The prototype answers from the recorded
  days a dish is served that aren't today or tomorrow. "laksa" finds Laksa Noodle Bowl (Berkshire, Oct 22), which is a
  real UMass dish with its real nutrition.
- **Seeded "Your foods"** (seeded, not recorded): Chobani, a custom food with round 10's vector numbers (140 cal, 12 g
  protein); and the recorded Clif Bar Chocolate Chip, as if added before.
- The page is 6.9 MB, up from 5.6 MB; the PDF pages are most of the difference.

### Design (as built; motion all existing)
**1. Packaged and saved foods.**
- **Search order.** Search's list continues past the menus:
  - Places, then the diet line, then "Lunch now", "At cafés", "Later today and tomorrow";
  - then **Your foods**, **Packaged**, and **Search UMass Dining for “x”** (a text button);
  - then "Add “x” as a custom food".
- **Rows.** These rows use Search's row. The lane holds only `+`, because the food isn't served anywhere. A per-100 g hit
  reads "368 cal per 100 g", and its `+` adds one 100 g serving.
- **Packaged hits.** A name is shown once, a hit with no calories is dropped, and a food already in Your foods isn't
  repeated. A name that lacks its brand's first word leads with the brand.
- **Saving.** Adding any of them saves it to Your foods (`saveFood`), and the row moves into Your foods (Search's FLIP).
  A new custom food is saved too.
- **The sheet** (`openFood`). It has the identity group, Contains (OFF's tags mapped to M2's eleven), Add to plate, the
  label (%DV from FDA values) and the ingredients. There's no "where", no grades and no star.
  - A saved food has **Edit** in the star's slot. It turns the sheet into the form in place, with **Save** and
    **Delete**.
  - Delete puts the sheet away and shows "Deleted Chobani" with Undo in the bar's slot.
- **You.** A **Your foods** row ("2 foods"), with tracking on, opens a pushed page, newest first.
- **Export.** JSON gains `foods`; CSV appends a second table after the log.
- **Tracking off** removes Your foods, Packaged, Search UMass Dining, the custom food and the You row. `S.foods` is
  kept.
- **Search UMass Dining states, in its slot** (`?lookup=found|none|offline|limited`):
  - the indicator after 400 ms, in a 52 px slot the size of the button, so nothing below moves;
  - found: a "UMass Dining" group;
  - none: "UMass Dining has nothing else called “laksa”.";
  - failed: "Couldn't reach UMass Dining." with Try again;
  - rate-limited: "Searching UMass Dining is paused until 1 PM."
- `?pack=fail`: "Packaged foods didn't load." with Try again, under the Packaged heading. The concept doesn't name this
  state; it follows critique point 7 (OFF's own outage).

**2. Favourite alerts.**
- **The switch.** "Notify me", with "When a favorite is on today's menu", heads the Favorites page above a hairline.
- **The OS ask** (`?alerts=allow|deny|blocked|bgoff`):
  - a tap raises the OS's own sheet (drawn neutral, as round 10's);
  - denied or blocked: "Notifications are off for UDine" with **Open Settings**. Blocked raises no sheet;
  - background off: checked, with "Background App Refresh is off, so UDine can't check menus" (iOS) or "Battery use is
    restricted, so UDine can't check menus" (Android), and Open Settings.
- **`alertRun(now)`** is the background run:
  - one notification per dish per logical day, keyed (dish, day), with every place in one body;
  - nothing before 7 AM;
  - nothing once the dish's last serving today has ended.
  - The body is the sheet's "where" sentence: "Lunch from 11 AM at Worcester and Berkshire".
- `?notify=1` shows the 7:15 AM run's banner. A tap pushes Worcester at lunch, scrolled to the dish, with the row marked.

**3. Café PDF menus.**
- **The café page.** The Commonwealth Restaurant's body is "Menus", then four rows (Lunch, Lite fare, Dinner, Dessert),
  Add a custom food, and the description last. Pass 1 moved the description after the rows: first, it pushed every
  row below the fold.
- **A row pushes "Lunch menu"**: the pages at the screen's width, 16 px gutters, on chalk.
  - Online, the first open loads for 600 ms (the indicator after 400 ms), then the pages fade in. After that the menu
    is kept (`SAVED`).
  - Offline: never-opened rows say "Not saved", and the page says "You're offline, and this menu isn't saved on this
    phone."
  - `?saved=pdf:Lunch` marks one as opened before.
  - Failed: "The lunch menu didn't load." with Try again.
- **Zoom.** Pinch-zoom is the platform's. The prototype's viewport is fixed (`maximum-scale=1`), so the PDF page has
  its own two-finger zoom, 1× to 4× (CSS `zoom`; the page scrolls both ways). At 1× the menu's text is about 6 px.
  That is the PDF's own letter page drawn at phone width, and it is why zoom matters (Open).

**4. Offline search.**
- **What is saved** (`savedMenu(place, day)`): halls today and tomorrow; a café's today once opened online (or
  `?saved=Green Fields`); nothing under `fail`.
- **Search, offline.** A line above Events and the results: "You're offline. Searching the menus saved on this phone:
  the halls, today and tomorrow" plus ", and Green Fields, today" when one is saved.
  - Unsaved cafés' dishes are absent from "At cafés" and "Later". Places still match.
  - Packaged and Search UMass Dining are absent. Your foods answers, and the custom food stays.
  - No match reads "Nothing called “clif” is on a saved menu."
- **Search, failed.** "Couldn't connect" and an outlined Try again (Halls' pair). No menu groups and no Events.
  Packaged and Search UMass Dining still answer. Try again brings the menus back.
- **The hall screen.** An unsaved café opened offline now says round 9's "You're offline, and the menu for Thursday,
  October 8 isn't saved on this phone." Before round 11, every place's today and tomorrow counted as saved. The
  schedule's "Not saved" follows `savedMenu`.

**5. Bowls.**
- **Synthetic bases.** `synOf` names a synthetic base after its station: "Salad Bar", "Deli Bar", "Noodle Bowl".
  "Cold Bar" is gone, and a station whose raw name carries "/LB" gets none (Harvest Market, Roots).
  - The 97 synthetic station-days are listed in `vectors.json` `synthetic`: Berkshire's Salad Bar and Deli Bar,
    Franklin's Deli Bar, the hall pho bars, and Charles River's two.
  - A synthetic sheet drops the add-ins heading that repeated its title, and its parts start 16 px under the title.
- **Noodle Bowl, `baseOf`.** Exactly one base per hall station-day:
  - the only dish;
  - none for a pho bar (two or more broths: synthetic "Noodle Bowl");
  - otherwise the highest-calorie non-part whose name says ramen, noodle, soup, stew, congee, bowl, curry or katsu.
    Part words are tested outside the parentheses, so the Tom Yum soup counts;
  - else the highest-calorie non-part.
  - `buildOf` builds only that dish.
  - Pasta Bar and Omelet keep round 10's rule.

**All 82 hall Noodle Bowl station-days, Oct 8-22 (Oct 10: no menus; "–": no Noodle Bowl that meal; Franklin has none):**

| Day | W lunch | W dinner | H lunch | H dinner | B lunch | B dinner |
|---|---|---|---|---|---|---|
| 10-08 | Beef Brisket Noodle Bowl | Kumamoto Style Ramen (Pork & Chicken) | *Noodle Bowl* (pho bar) | Vietnamese Pork & Shrimp Noodle Bowl | Beef Brisket Noodle Bowl | *Noodle Bowl* (pho bar) |
| 10-09 | Chicken Katsu | – | Chicken Katsu | Tonkotsu Ramen (Fish) | Chicken Congee | Chicken, Pork & Shrimp Wonton Soup |
| 10-11 | *Noodle Bowl* (pho bar) | *Noodle Bowl* (pho bar) | Chicken Congee | *Noodle Bowl* (pho bar) | *Noodle Bowl* (pho bar) | *Noodle Bowl* (pho bar) |
| 10-12 | Bun Bo Hue (Vietnamese Beef Noodle Bowl) | Pork & Tofu Kimchi Stew | Bun Rieu-Vietnamese Noodle Bowl (Pork, Crab, Shrimp) | Pork & Shrimp Wonton Soup | Japanese Curry Noodles | Sapporo Miso Ramen (Pork) |
| 10-13 | Sapporo Miso Ramen (Pork) | GF Japanese Curry Rice Bowl | Sapporo Miso Ramen (Pork) | Tantanmen Ramen Bar | Bun Bo Hue (Vietnamese Beef Noodle Bowl) | Hainanese Chicken Rice |
| 10-14 | Bun Rieu-Vietnamese Noodle Bowl (Pork, Crab, Shrimp) | Korean Black Bean Noodles | Beef Brisket Noodle Bowl | Japanese Curry Noodles | Bun Heo Quay (Crispy Pork Belly Bowl) | Masala Dosa |
| 10-15 | Beef Brisket Noodle Bowl | Tantanmen Ramen Bar | *Noodle Bowl* (pho bar) | Bun Bo Hue (Vietnamese Beef Noodle Bowl) | Tonkotsu Ramen (Fish) | Bun Rieu-Vietnamese Noodle Bowl (Pork, Crab, Shrimp) |
| 10-16 | Chicken Katsu | Hot Pot (Chicken, Beef, Pork, Shellfish) | Tantanmen Ramen Bar | Tonkotsu Ramen (Fish) | Chicken Congee | Chicken, Pork & Shrimp Wonton Soup |
| 10-17 | Tantanmen Ramen Bar | Chicken Shoyu Ramen Bar (Fish, Shellfish) | Chicken Congee | Tom Kha Gai (Coconut Lemongrass Soup) | Tantanmen Ramen Bar | Tantanmen Ramen Bar |
| 10-18 | *Noodle Bowl* (pho bar) | *Noodle Bowl* (pho bar) | Chicken Congee | *Noodle Bowl* (pho bar) | *Noodle Bowl* (pho bar) | *Noodle Bowl* (pho bar) |
| 10-19 | Shrimp Tom Yum Soup (Chicken Broth) | Spicy Nagoya Style Ramen (Pork, Chicken, Seafood) | Bun Rieu-Vietnamese Noodle Bowl (Pork, Crab, Shrimp) | Bun Thang Hanoi (Hanoi-Style Chicken Pork Soup) | Chicken, Pork & Shrimp Wonton Soup | Tonkotsu Ramen (Fish) |
| 10-20 | Tonkotsu Ramen (Fish) | Khoa Soi | Shoyu Ramen Bar (Fish, Chicken) | Tantanmen Ramen Bar | Bun Rieu-Vietnamese Noodle Bowl (Pork, Crab, Shrimp) | Hainanese Chicken Rice |
| 10-21 | Beef Brisket Noodle Bowl | *Noodle Bowl* (pho bar) | Beef Brisket Noodle Bowl | – | Taiwanese Beef Noodle Bowl | Chinese Grilled Cold Noodles (Pork & Peanuts) |
| 10-22 | Bun Rieu-Vietnamese Noodle Bowl (Pork, Crab, Shrimp) | Hakka Rice Noodles | *Noodle Bowl* (pho bar) | Chicken and Rice Bowl | Vietnamese Pork & Shrimp Noodle Bowl | Laksa Noodle Bowl (Shrimp, Fish, Eggs, Almonds,Tofu) |

- **What this fixes.** Round 10 got 28 of the 82 station-days wrong (`CRITIQUE-r11.md` #24):
  - no base on the 15 pho bars, the three single 49 cal congees, Hampshire's Oct 9 katsu curry, and Worcester's Oct 19
    Tom Yum;
  - two bases where a topping (Mayu oil, braised pork belly, crispy pork belly) passed 120 cal.
- **Café Noodle Bowl stations** follow the café rule, not this one: a dish builds when its place and meal have an
  Add-ons or Toppings station.
  - **Whitmore Café** (6 a day) and **Star Ginger** (9 a day; 3 ramens on Oct 14) list finished, priced phos. Each one
    builds with the café's own add-ons, so a station offers several bases. They are alternatives on a café menu, not
    a bar of parts. Checked over every recorded day.
  - **Charles River's "Noodle Bowl"** builds nothing on any day, because it has no add-on station. It holds:
    - grilled cheese on Oct 8 and 15;
    - a pho bar on Oct 9 and 16;
    - curry noodles on Oct 12;
    - mashed-potato bowls on Oct 13;
    - a ramen on Oct 14.

### Review passes (`build/r11/p1`, `p2`: 390 left and 360 right at dpr 2, from `shots11.js`; contact sheets `p1/sheet1.png` to `sheet9.png`)
**Pass 1: 9 flaws.**
1. Search UMass Dining's indicator was taller than the button, so the custom-food button jumped 16 px. The slot is now
   52 px in every state.
2. The Favorites page ran "Notify me" straight into the first favourite, as one list. It is now set off by a hairline
   and 8 px.
3. The background-off line ran into the checkbox at 390. Check-row text now keeps 12 px clear.
4. The café page's long description pushed every menu row below the fold at 360. The rows now come first and the
   description last.
5. Collapsed, "The Commonwealth Restaurant" ran under the pin at 360. The compact bar's name scale is now capped to clear
   the back button and the pin (`fitName`).
6. The PDF page's offline and failed copy sat at 36 px, not on the 20 px text edge. Fixed to 20 px.
7. The synthetic sheet's first part sat 4 px under the title once the heading was dropped. It is now 16 px.
8. Search's no-match line carried the paragraph's default 16 px margin, which opened a 47 px gap above "Your foods".
   The margin is removed.
9. Edit sat 5 px above the name's first line. It is now centred on it, as the star is (crop `p2/crop-edit.png`).

**Pass 2** (`p2/check.png`: s1-clif, l-loading, a-bgoff-ios, p-cafe, p-rows, b-salad-sheet) confirmed the fixes.
Coordinator-style review then found gaps between concept and build. They are recorded in CONCEPT "Round 11, as built"
and fixed here:
- the plate row for a per-100 g item read "368 cal each", and now reads "368 cal per 100 g" (`p3/s1-plate`);
- `?alerts=revoked` had no simulation (`p3/a-revoked`);
- a PDF couldn't be zoomed in the prototype, and now has two-finger zoom;
- `?pack=fail`, the packaged in-flight slot and the PDF loading state had no assertions, and now have them.

**Pass 3: clean.** All 51 states were re-shot from the final build (`build/r11/p3`, `sheet1.png` to `sheet9.png`) and
viewed at both widths.
- Three pass-1 fixes reach older screens: check-row padding, Search's empty-line margin and the compact bar's name cap.
  Those screens were re-shot with `shots9.js` into `build/r11/reg` (`sheet1.png`, `sheet2.png`): You on (top and
  scrolled), first run (rest and scrolled), Dietary preferences, Charles River on, Worcester, Franklin and Worcester
  Café collapsed, and Search with tracking off. Nothing wraps or shifts.
- **Not recorded: motion strips.** Round 11 adds no motion. The one new composition is a row gliding from Packaged
  into Your foods on `+`, which is Search's existing FLIP. A `rec.js` strip of it, and of the notification tap's push,
  is left for the coordinator if wanted (Open).

### Tests (`test.js`, `round11`; `RED=11` runs it alone)
- **Bowls:**
  - Berkshire's "Salad Bar" and its sheet, which has no repeated heading;
  - Franklin's "Deli Bar";
  - no synthetic base on a by-the-pound or Cold Bar station on any day;
  - `noodleBases()`: 82 hall station-days, each with exactly one base, 12 of them checked by name, 15 synthetic pho bars,
    and never a topping;
  - Hampshire's pho bar today has its "Noodle Bowl" row, and Mayu oil doesn't build.
- **Packaged and saved foods:**
  - "clif" gives Your foods, then Packaged, with no letters in the lane, "368 cal per 100 g", unique names and no
    repeat of Your foods;
  - served dishes come first ("bbq");
  - the packaged sheet has no where, grades, star or Edit, and adding saves the food;
  - a custom food is saved;
  - You → Your foods: "4 foods", newest first;
  - Edit → Save changes the label to 150; Delete shows "Deleted Chobani", and Undo restores it;
  - export includes `foods`;
  - tracking off removes all of it.
- **Search UMass Dining:** the button sits just before the custom food; the indicator replaces it in flight; then the
  found group and its sheet (no "where"), none, failed (a 44 px Try again) and rate-limited copy.
- **Offline search:**
  - the line, idle;
  - an unsaved café is absent, and the halls are searched;
  - Your foods answers, with no Packaged and no lookup;
  - places still match;
  - the saved-café line, and its dishes found;
  - an unsaved café's page says so;
  - failed: the pair, no menus, Packaged still answering, and Try again restoring the menus.
- **Café PDFs:**
  - The Commonwealth Restaurant is `c29` in area 1;
  - "Menus" with four rows in feed order, and the custom food;
  - the pushed "Lunch menu" has 2 pages at frame width − 32;
  - offline: "Not saved" on each row, and the page copy; a saved menu opens offline;
  - failed: copy, then Try again loads it;
  - Search finds the café.
- **Favourite alerts:**
  - the row's copy, and the OS sheet on a tap;
  - `alertRun`: nothing at 6:50; two at 7:15 with every place named; nothing at 7:30; the brisket not at 5 PM;
  - denied: copy and a 44 px Open Settings, and nothing posts;
  - blocked: no sheet;
  - background off, on Android and iOS;
  - `?notify=1`: the banner's title and body, and a tap opens Worcester at lunch with the brisket marked.
- **Red:** `RED=11 SRC=build/r11/before-index.html` (round 10's build) gives all six RED:
  ```
  RED    bowls: … exactly one Noodle Bowl base per hall station-day: the synthetic base reads "Salad Bar"
  RED    packaged and saved foods: …: nothing served: Your foods, then Packaged
  RED    Search UMass Dining: in flight, found, none, failed, rate-limited: locator.textContent: Timeout 30000ms exceeded.
  RED    offline search: …: locator.textContent: Timeout 30000ms exceeded.
  RED    café PDFs: …: The Commonwealth Restaurant is a place
  RED    favourite alerts: …: locator.textContent: Timeout 30000ms exceeded.
  ```
  The selectors for the offline line moved from `#sres` to `#search` (the line sits above Events). The noted whitespace
  in a meta line is compared without spaces. Both changes were made after the red run. RED=11 re-run on round 10 after
  the build is still six RED.
- **Older tests changed:**
  - round 10's synthetic names are now "Salad Bar" and "Deli Bar";
  - Cafés & markets has 29 Amherst places open at 12:41.
  - The harnesses (`test.js`, `vectors.js`, `rec.js`, `shots*.js` and others) now load the hoisted
    `node_modules/.pnpm/node_modules/playwright-core`. The pinned `playwright-core@1.63.0` path no longer exists on this
    host (1.62.1 is installed, with the same Chromium 1234).
- **Added after the red run** (they go green directly; each scenario's red was already recorded):
  - the packaged in-flight slot;
  - `?pack=fail`;
  - the per-100 g plate row;
  - `?alerts=revoked`;
  - the PDF loading state.
- **Now:** `RED=11 node test.js` (round 11 alone) gives 108 checks; it now prints its count. `node test.js` gives 5,105 checks and `RM=1 node test.js` gives 3,611, all green (counts vary between runs because sampled frames are counted; the earlier run gave 5,237 and 3,407). `vectors.json` is unchanged by these fixes.
- **Found by the suite:** round 7's "dish sheet from Search" sampler failed at first, because the packaged answer
  arriving re-rendered Search under the open sheet. When the answer adds nothing, the waiting slot is now removed in
  place and the list is left alone.

### Vectors (`vectors.js` -> `vectors.json`; the shape is documented in its header)
- `bowlbase`: the 82 station-days above, `{day, place, meal, base, synthetic}`.
- `synthetic`: 97 station-days with a synthetic base, with the raw station name.
- `alerts`: 4 run sequences:
  - before 7 AM, first run and dedup;
  - lunch only, first seen at 5 PM;
  - now, then the same day's dinner, not posted again;
  - later today, and Grab 'N Go now.
- `packaged`: the recorded "clif" answer as the Packaged group shows it (13 rows), and the two saved foods.
- `saved`: 7 cases of `savedMenu` (offline halls days 0-2, an unsaved and a saved café, failed).
- Everything from rounds 9 and 10 is unchanged, except that the bowl comment names "Salad Bar".

### Files
- `CRITIQUE-r11.md`, `CONCEPT.md` (Round 11), `src.html`, `build.py`, `test.js`, `vectors.js`, `vectors.json`, `shots11.js`.
- New data, committed: `../locations-2026-10-13.json` (the live get_infov2) and `../packaged-2026-10-13.json`. The PDFs
  are in `local/pdf/` (gitignored).
- Shots: `build/r11/p1` (pass 1), `build/r11/p2` (`check.png`), `build/r11/p3` (final, all 51 states, `sheet1.png` to
  `sheet9.png`), `build/r11/reg` (older screens). The
  baseline is in `build/r11/before-*`. `build/` is under `~/.cache/udine-scratch/flows/M2/` and isn't committed.

### Open (for the owner)
- **The synthetic row repeats its station heading.**
  - "Deli Bar" sits under the heading "Deli Bar", and "Noodle Bowl" under "Noodle Bowl" (`p1/b-deli.png`,
    `b-pho.png`). The row is the base you add, named as you decided.
  - The alternative is to make the station heading itself the row that opens the builder. It would sit on a heading,
    not a dish row.
- **A pho bar's bowl reads "Noodle Bowl".** It has three broths, so no single soup can name it. It follows the Salad Bar
  pattern.
  - The other choice is to name the bowl after the broth picked first ("Chicken Pho Broth (Fish) with …"). That needs
    the base to change as parts are picked.
  - The pho bars are 15 of the 82 station-days.
- **Motion strips** for the Packaged → Your foods glide and the notification tap weren't recorded. Both are existing
  motion (Search's FLIP, the "where" push).
- **Café Noodle Bowls** (Whitmore, Star Ginger) offer every pho as its own base with the café's add-ons. Should they
  follow the halls' one-base rule? Their dishes are priced and complete, so I left them.
- **Prefetching café PDFs**, or pinned cafés' menus, so they're there offline. That is traffic RN doesn't make, so it
  isn't the default.
- **A PDF at phone width is unreadable without zoom** (~6 px text). The design relies on pinch zoom.
  - Another option is a "fit text" first view that starts zoomed to one column. It's not built, and it means a
    double-tap zoom gesture M2 doesn't have yet.
  - Or hand off to the system viewer, which loses the back gesture and the offline copy.
- **"Your foods" saves every packaged or UMass Dining food you add.** RN saves only custom foods, and its log keeps
  the rest.
- **USDA** wasn't reachable from this host, so the Packaged group shows only OpenFoodFacts.
- **OpenFoodFacts' `cgi/search.pl` was down** (503) during this round. RN should consider moving to
  `search.openfoodfacts.org`, which RN doesn't call today. This is a port question, not M2's.


## Round 11b: the owner's answers and the frame review (2026-10-14)

Owner answers 1-4 and the orchestrator's frame review (fixes a-c), applied on the same branch. CONCEPT "Round 11, as
built" has the design summary.

### What changed
- **Pho is named after its broth** (owner 1). `phoOf` builds the pho; `synBowl` names it after the chosen base.
  - The sheet lists the broths first. A broth's `+` picks it and puts back any other, at 1 (no ½), and the title
    changes in place.
  - The plate item is "Green Curry Pho Broth (Anchovies) with Pho Noodles, Chicken for Pho" (288 cal), and reopens
    with Update and its 3 choices.
  - **The no-broth decision.** Until a broth is picked, the title is the station's ("Noodle Bowl"), the foot reads 0
    and Add is disabled, like a Salad Bar with nothing chosen. A pho has no base until its broth is picked, and the
    toppings alone aren't a pho.
  - The list row still reads "Noodle Bowl" (orchestrator: the row is the thing you add; the heading names the
    station).
- **Café pho builders** (owner 2). A café Noodle Bowl beside an Add-ons or Toppings station (Whitmore Café, Star
  Ginger) gets one builder. Its choices are the station's dishes, and its toppings are the café's add-ons with
  nutrition, under the station's own heading ("Add-ons"). Prices sum: Chicken Pho w/Vegetable Broth $11.50 plus Hard
  Boiled Eggs $1.75.
  - The add-ons are checked first. Whitmore's phos are each named "… Broth", so the pho-bar test alone would have
    taken every pho for a broth.
  - A café pho bar with no add-ons (Charles River, Oct 9 and 16) picks its broth.
  - No pho builds on its own (`buildOf` is null for each).
- **Saved packaged and lookup foods** (owner 3): as built in round 11, unchanged.
- **Pinned cafés are prefetched** (owner 4). `savedMenu` and `pdfSaved` count a pinned café as saved for today, menu
  and PDFs. Offline Search's line names it ("…, and Green Fields, today."), and a pinned café's PDF rows never say
  "Not saved".
- **PDF zoom** (orchestrator): pinch (1× to 4×) and double-tap (2.5× at the point tapped, double-tap again for 1×).
  - The zoom sets the pages' width: CSS `zoom` keeps an auto-width block at its container's width, so the pinch
    built in round 11 couldn't have worked.
  - The pages scroll sideways inside the page body, so the bar stays put. The first build scrolled the whole page
    sideways, bar and all (caught in `p4/p-zoom`, fixed).
  - Double-tap's zoom is instant: no motion token was added.
- **a. Gap under a row's line** (`a-bgoff-*` 8 px vs `a-denied`/`a-revoked` 20 px). A row with a button under it
  (`.hrow`) now aligns to its top. The button hangs a fixed 12 px under the line's last line, whether the line is one
  line or two. The Health row uses the same rule.
- **b. A café's collapsed header** (the title sat a line below the back and pin row in `p-rows` and
  `p-offline-rows`). **This predates round 11 and isn't a layout fault.** Those frames were taken at scroll 200, inside
  the header's 230 px collapse range, so the name was still travelling into the bar.
  - Measured on Green Fields at 390, on round 10's build and on this one alike: at scroll 200 the name's centre is at
    74 px against the back button's 50 px. At scroll 300 (fully collapsed) it's at 51 against 50, inline as in a
    hall.
  - The shots now scroll to 300. Crops: `p4/hdr-r10-200.png`, `hdr-r11-200.png`, `hdr-r10-300.png`,
    `hdr-r11-300.png`.
- **c. Events offline.** `o-idle` shows the events carousel offline, which assumes the last events list is cached on
  the phone. The Flutter data layer (`flutter-port-menu-data`) caches menus and hours but not events. Events need a
  day cache like hours (`events:v2:<date>`), or offline Search will lose its Events row.

### Tests (`round11`, now 10 scenarios; RED first)
- **New scenarios:**
  - "pho: named after the broth picked; Add waits for one; one broth at a time; Whitmore and Star Ginger build one
    pho";
  - "pinned cafés are saved: their menu and PDFs open offline";
  - "a PDF page: double-tap zooms in where tapped, and again back out";
  - "a row with a button under it: the button sits 12 px under the line, one line or two" (Notify me denied,
    background off on iOS and Android, and Health denied).
- **Red:** `RED=11 SRC=build/r11/before-r11b-index.html` (round 11 as first delivered) gives these four RED, and the
  first six stay green (`build/r11/red-r11b.txt`):
  ```
  RED    pho: … Whitmore and Star Ginger build one pho: a broth names the bowl
  RED    pinned cafés are saved: their menu and PDFs open offline: a pinned café is saved
  RED    a PDF page: double-tap zooms in where tapped, and again back out: double-tap: 2.5x
  RED    a row with a button under it: the button sits 12 px under the line, one line or two: &alerts=deny: 12 px from the line to Open Settings
  ```
- **Changed after the red run:** the zoom check reads the page body's sideways scroll and that the bar stays, instead
  of the page's.
- **Now:**
  - `RED=11 node test.js` gives 10 green scenarios, 132 checks;
  - `node test.js` gives 5,211 checks, all green;
  - `RM=1 node test.js` gives 3,494, all green.
- **One flake.** One normal run before that failed once in round 9b's "its pin is kept but not drawn" (0 pinned bands
  instead of 1).
  - The same build passed it on the next normal run and under `RM=1`. It passes on its own too (pins stored, page
    loaded: 1 band).
  - Nothing in round 11b writes `udine-m2` asynchronously: every `save()` is on a tap. I couldn't reproduce it.
- `vectors.json`: 15 plate sequences, 120 synthetic station-days (97 + the 23 café pho builders), and 82 bases.
- **Vectors:**
  - `bowlbase` gains `choices` (the broths) on the 15 synthetic pho bars;
  - `plate` gains a pho bar bowl ("Green Curry Pho Broth (Anchovies)" with Pho Noodles and Chicken for Pho) and
    Whitmore's pho builder (Chicken Pho w/Vegetable Broth with Hard Boiled Eggs);
  - `synthetic` now also lists the café pho builders.

### Shots (`build/r11/p4`, 390 left and 360 right at dpr 2; `sheet1.png` to `sheet3.png`)
- Re-shot or new: a-denied, a-revoked, a-bgoff-ios, a-bgoff-android, p-rows, p-offline-rows, b-pho, b-pho-none,
  b-pho-sheet, b-pho-plate, b-whitmore, b-starginger, o-pinned, p-pinned-offline and p-zoom, plus the header crops.
  All were viewed at both widths. The one flaw found (zoom scrolled the bar away) is fixed, and `p-zoom` was
  re-shot.
- **Open (unchanged otherwise).** The pho's broths have no heading of their own: the title says "Noodle Bowl" until
  one is picked, then the broth's name. If the owner wants the choice spelled out, the station's own heading
  pattern ("Broths") would be new copy, so it isn't added.

### Round 11b, zoom bar (orchestrator review of `p4/sheet3`)
- **What the review saw.** `p4/sheet3.png`'s p-zoom panel showed the "Lunch menu" bar cut down to a maroon block,
  with the PDF drawn where the bar should be. That contact sheet was built before the fix and wasn't regenerated;
  `p4/p-zoom.png` itself was re-shot after the fix.
- **The fix,** in commit 376417f5:
  - the pages scroll sideways inside the page body (`.pbody{overflow-x:auto}`);
  - the page scrolls only vertically, under its sticky bar;
  - the tab bar is the frame's and never moves.
- **New test**, red first: "a PDF page: the bar (back and title) and the tab bar stay whole and fixed at 1x, 2.5x and
  scrolled sideways".
  - It compares the rects of the bar, back button, title and tab bar at 1×, at 2.5× after a double-tap, and after
    scrolling the zoomed pages 300 px sideways and 400 px down.
  - It also checks that the back button is the topmost element at its centre.
  - **Red** on the intermediate 11b build that scrolled the whole page sideways (reconstructed as
    `build/r11/before-zoombar-index.html`; line also in `build/r11/red-r11b.txt`):
    ```
    RED    a PDF page: the bar (back and title) and the tab bar stay whole and fixed at 1x, 2.5x and scrolled sideways: 2.5x: the bar, back, title and tab bar are where they were, and back is on top
    ```
  - Green now. `RED=11 node test.js` gives 11 scenarios and 135 checks. `node test.js` gives 5,390 checks, all green.
- **Frames** (`build/r11/p5`, 390 and 360 at dpr 2; `sheet1.png`): `p-zoom.png` (2.5×) and `p-zoom-side.png` (2.5×,
  scrolled 300 px sideways and 400 px down). The bar is whole and fixed in both, at both widths.


## Round 12: variant pickers

Brief: `docs/briefs/m2-round-12.md`, Task 1. Critique: `CRITIQUE-r12.md`. Concept: `CONCEPT.md`, "Round 12", committed
before the build. Owner (2026-10-14): "drinks can be in two different sizes (16 and 20oz) and there should be a picker. Items
like the boba in the procrastination station can also be combined, where they only differ by milk type".

### The rule, derived from the feed (`menus-2026-10-08-to-22.json`)
- **How it was found.** Every pair of names at one place, day, meal and station was compared word by word. Two kinds of
  difference repeat across places and days and mean the same item:
  - **a size:** "12 oz Clam Chowder" / "8 oz …", "16 oz Cappuccino" / "20 oz …", "Coconut Mango Acai Bowl (8oz)" / "(16oz)",
    "Berry Acai Bowl (8 oz)" / "(16 oz)". Leading "N oz " or a trailing "(N oz)" / "(Noz)"; no other size words occur
    (no Small, Large or Regular as a size: Newman's "Regular Coffee" means not decaf);
  - **a milk:** "Boba Almond Milk" … "Boba Soy Milk", the one option family in the feed. The milk kinds are the ones the
    feed uses anywhere: Almond, Maple, Oat, Skim, Soy, Whole, 1%.
- **The rule** (`variantOf`, `famsAt` in `src.html`): within one place, day, meal and station, two or more items whose
  names are the same once that token is taken out, with different tokens, are one family named by what remains. Not at an
  Add-ons or Toppings station. A milk family needs a name left ("1% Milk" has none). Sizes order smallest first; milks keep
  the feed's order; the first is the default.
- **Counts.** 52 families (one place and station each) on 255 station-days, 322 counting each meal. 47 are sizes of soups,
  oatmeal and hot drinks, two are acai bowls, three are the same boba (Procrastination Station, Roots Café, Worcester
  Café). Every family is at a café; no hall has one in the fifteen days.
- **Near-misses: 222**, every one in `vectors.json` `variants.nearMiss`, listed below by why the rule leaves it alone. The
  closest to the owner's examples are called out first.
  - **Courtside Café's smoothies**, Coconut or Yogurt ("Banana Berry Coconut Smoothie" / "… Yogurt Smoothie", "Matcha
    Strawberry w/Coconut" / "w/Yogurt"): seven pairs, a base chosen for one drink, the same shape as the milk. Not grouped
    because the word isn't a milk (Open).
  - **Newman Café's Decaf / Regular Coffee**: each is a size family (12 oz / 20 oz); decaf or not is a second word.
  - **Hot / Iced at Worcester Café**: the iced drinks come only in 20 oz, so each is a lone size, and "20 oz Iced Latte"
    is a different drink from "20 oz Latte".
  - **Single / Double Espresso** and the **milkshake flavours**: different drinks.
  - **"Yellow Cheddar Macaroni & Cheese (8 oz)"** at Harvest Market's hot bar is alone, so it is no family; its record is a
    4 oz serving (185 cal) on most days and 8 oz (370 cal) on Oct 18 (critique #12).
  - **Star Ginger's and Whitmore's phos** differ by protein and broth. They are already round 11b's pho builder, whose
    choices are now the same chips.

**Every family** (cal per variant as the feed gives it; two values where a café's record differs by day):

| Place | Station | Family | Picker (default first), cal | Days | Meals |
|---|---|---|---|---|---|
| Courtside Café | Bowls | Berry Acai Bowl | 8 oz 242 / 16 oz 485 | 10 | all |
| Courtside Café | Bowls | Coconut Mango Acai Bowl | 8 oz 273 / 16 oz 547 | 10 | all |
| Harvest Market | Breakfast Miscellaneous | Hot Oatmeal | 8 oz 110 / 12 oz 169 | 14 | breakfast |
| Harvest Market | Soups | Aged Cheddar & Cauliflower Bisque | 8 oz 319 / 12 oz 478 | 3 | dinner, lunch |
| Harvest Market | Soups | Baked Potato Soup (Pork & Beef) | 8 oz 230 / 12 oz 345 | 2 | breakfast, dinner, lunch |
| Harvest Market | Soups | Broccoli Cheddar Soup w/Chicken Flavor | 8 oz 230 / 12 oz 345 | 2 | dinner, lunch |
| Harvest Market | Soups | Chana Masala Soup | 8 oz 148 / 12 oz 215 | 2 | dinner, lunch |
| Harvest Market | Soups | Chicken Noodle Soup | 8 oz 75 / 12 oz 112 | 2 | dinner, lunch |
| Harvest Market | Soups | Chicken Tortilla Soup | 8 oz 170 / 12 oz 255 | 2 | dinner, lunch |
| Harvest Market | Soups | Chicken Wild Rice Soup | 8 oz 100 / 12 oz 150 | 1 | dinner, lunch |
| Harvest Market | Soups | Clam Chowder | 8 oz 270 / 12 oz 405 | 3 | dinner, lunch |
| Harvest Market | Soups | Italian Wedding Soup | 8 oz 120 / 12 oz 180 | 2 | dinner, lunch |
| Harvest Market | Soups | Kale Portuguese Soup | 8 oz 140 / 12 oz 210 | 2 | dinner, lunch |
| Harvest Market | Soups | Mexican Style Meatball Soup (Pork) | 8 oz 180 / 12 oz 270 | 1 | dinner, lunch |
| Harvest Market | Soups | Minestrone Soup | 8 oz 80 / 12 oz 120 | 1 | dinner, lunch |
| Harvest Market | Soups | Native Three Sisters Soup | 8 oz 150 / 12 oz 225 | 1 | dinner, lunch |
| Harvest Market | Soups | Red Pepper & Gouda Bisque | 8 oz 281 / 12 oz 422 | 1 | dinner, lunch |
| Harvest Market | Soups | Santa Fe Tortilla Soup | 8 oz 90 / 12 oz 135 | 1 | dinner, lunch |
| Harvest Market | Soups | Spicy Lentil & Veggie Soup | 8 oz 146 / 12 oz 219 | 1 | dinner, lunch |
| Harvest Market | Soups | Tomato Bisque Soup | 8 oz 180 / 12 oz 270 | 1 | dinner, lunch |
| Newman Café | Beverages | Decaf Coffee | 12 oz 0 / 20 oz 0 | 7 | lunch |
| Newman Café | Beverages | Iced Coffee | 16 oz 0 / 24 oz 1 | 7 | lunch |
| Newman Café | Beverages | Regular Coffee | 12 oz 0 / 20 oz 0 | 7 | lunch |
| Procrastination Station | Beverages | Boba | Almond Milk 180 / Maple Milk 275 / Oat Milk 262 / Skim Milk 234 / Soy Milk 240 | 10 | all |
| Roots Café | Beverages | Boba | Almond Milk 180 / Maple Milk 275 / Oat Milk 262 / Skim Milk 234 / Soy Milk 240 | 14 | breakfast, dinner, lunch |
| Roots Café | Soups | Baked Potato Soup (Pork & Beef) | 8 oz 230 / 12 oz 345 | 2 | dinner, lunch |
| Roots Café | Soups | Beef Stew | 8 oz 230 / 12 oz 345 | 2 | dinner, lunch |
| Roots Café | Soups | Chicken Noodle Soup | 8 oz 100 / 12 oz 150 | 1 | dinner, lunch |
| Roots Café | Soups | Chicken Tortilla Soup | 8 oz 170 / 12 oz 255 | 2 | dinner, lunch |
| Roots Café | Soups | Clam Chowder | 8 oz 270 / 12 oz 405 | 2 | dinner, lunch |
| Roots Café | Soups | Italian Wedding Soup | 8 oz 120 / 12 oz 180 | 2 | dinner, lunch |
| Roots Café | Soups | Minestrone Soup | 8 oz 80 / 12 oz 120 | 3 | dinner, lunch |
| Whitmore Café | Soups | Broccoli Cheddar Soup w/Chicken Flavor | 8 oz 230 / 12 oz 345 | 1 | all |
| Whitmore Café | Soups | Chicken Noodle Soup | 8 oz 100 / 12 oz 150 | 2 | all |
| Whitmore Café | Soups | Chicken Tortilla Soup | 8 oz 170 / 12 oz 255 | 1 | all |
| Whitmore Café | Soups | Clam Chowder | 8 oz 270 / 12 oz 405 | 2 | all |
| Whitmore Café | Soups | Kale Portuguese Soup | 8 oz 140 / 12 oz 210 | 1 | all |
| Whitmore Café | Soups | Mexican Style Meatball Soup (Pork) | 8 oz 180 / 12 oz 270 | 1 | all |
| Whitmore Café | Soups | Minestrone Soup | 8 oz 80 / 12 oz 120 | 2 | all |
| Whitmore Café | Soups | Organic Black Bean Soup | 8 oz 190 / 12 oz 285 | 1 | all |
| Whitmore Café | Soups | Pumpkin Bisque Soup | 8 oz 190 / 12 oz 285 | 1 | all |
| Whitmore Café | Soups | Tomato Bisque Soup | 8 oz 180 / 12 oz 270 | 2 | all |
| Worcester Café | Beverages | Boba | Almond Milk 180 / Maple Milk 275 / Oat Milk 262 / Skim Milk 234 / Soy Milk 240 | 12 | all |
| Worcester Café | Beverages | Cappuccino | 16 oz 0 / 20 oz 0 | 12 | all |
| Worcester Café | Beverages | Caramel Macchiato | 16 oz 152 / 20 oz 27 | 12 | all |
| Worcester Café | Beverages | Chai | 16 oz 211 / 20 oz 0 | 12 | all |
| Worcester Café | Beverages | Chamomile Tea | 16 oz 0 / 20 oz 0 | 12 | all |
| Worcester Café | Beverages | Coffee | 16 oz 0 / 20 oz 0 | 12 | all |
| Worcester Café | Beverages | Earl Grey Tea | 16 oz 0 / 20 oz 0 | 12 | all |
| Worcester Café | Beverages | Hot Americano | 16 oz 0 / 20 oz 0 | 12 | all |
| Worcester Café | Beverages | Latte | 16 oz 0 / 20 oz 0 | 12 | all |
| Worcester Café | Beverages | Matcha Latte | 16 oz 0 / 20 oz 0 | 12 | all |

**Every near-miss**, by reason (`variants.nearMiss`; a set is names one word apart at one station):

**An Add-ons or Toppings station: a builder's part** (4):
- Worcester Café, Add-ons: MAPLELINE Skim Milk (12 days)
- Worcester Café, Add-ons: MAPLELINE Whole Milk (12 days)
- Worcester Café, Add-ons: PACIFIC Almond Milk (12 days)
- Worcester Café, Add-ons: PACIFIC Soy Milk (12 days)

**Nothing left once the milk is taken out** (2):
- Hampshire, Breakfast: 1% Milk (10 days)
- Worcester, Breakfast: 1% Milk (10 days)

**One word apart at an Add-ons or Toppings station** (17):
- Courtside Café, Add-ons: Chocolate Protein Powder, Hemp Protein Powder, Vanilla Protein Powder (10 days)
- Deli Delish, Add-ons: Bacon, Guacamole (7 days)
- Deli Delish, Add-ons: Extra Cheese, Extra Meat (7 days)
- Green Fields, Add-ons: Bacon, Blueberries, Cheese, Hummus (7 days)
- Green Fields, Add-ons: Fried Buffalo Chicken, Fried Chicken (7 days)
- Tamales, Add-ons: Guacamole, Rice (7 days)
- Tamales, Toppings: Brown Rice w/Lime & Cilantro, White Rice w/Lime & Cilantro (10 days)
- Tamales, Toppings: Guacamole, Salsa (10 days)
- Tamales, Toppings: Salsa, Tomatillo Salsa (10 days)
- Tavola, Add-ons: Falafel, Hummus, Olives (11 days)
- The Grill, Add-ons: Add On Beef Patty, Add On Impossible Patty (11 days)
- The Grill, Add-ons: Extra Cheddar, Extra Swiss (11 days)
- Wasabi, Add-ons: Add Ginger, Add Veggies, Add Wasabi (7 days)
- Whitmore Café, Add-ons: Add Crispy Chicken, Add Grilled Chicken (7 days)
- Worcester Café, Add-ons: MAPLELINE Skim Milk, MAPLELINE Whole Milk (12 days)
- Worcester Café, Add-ons: PACIFIC Almond Milk, PACIFIC Soy Milk (12 days)
- Worcester Café, Toppings: Butter, Peanut Butter (12 days)

**One word apart beside the size: a different drink or dish** (12):
- Newman Café, Beverages: 12 oz Decaf Coffee, 12 oz Regular Coffee (7 days)
- Newman Café, Beverages: 20 oz Decaf Coffee, 20 oz Regular Coffee (7 days)
- Worcester Café, Beverages: 16 oz Cappuccino, 16 oz Chai, 16 oz Coffee, 16 oz Latte (12 days)
- Worcester Café, Beverages: 16 oz Latte, 16 oz Matcha Latte (12 days)
- Worcester Café, Beverages: 20 oz Cappuccino, 20 oz Chai, 20 oz Coffee, 20 oz Latte (12 days)
- Worcester Café, Beverages: 20 oz Caramel Macchiato, 20 oz Iced Caramel Macchiato (12 days)
- Worcester Café, Beverages: 20 oz Chamomile Tea, 20 oz Iced Tea (12 days)
- Worcester Café, Beverages: 20 oz Hot Americano, 20 oz Iced Americano (12 days)
- Worcester Café, Beverages: 20 oz Iced Americano, 20 oz Iced Latte, 20 oz Iced Tea (12 days)
- Worcester Café, Beverages: 20 oz Iced Chai Latte, 20 oz Iced Latte, 20 oz Iced Matcha Latte (12 days)
- Worcester Café, Beverages: 20 oz Iced Latte, 20 oz Latte, 20 oz Matcha Latte (12 days)
- Worcester Café, Beverages: 20 oz Iced Matcha Latte, 20 oz Matcha Latte (12 days)

**One word apart: a different dish** (175):
- Berkshire: Breakfast: Breakfast Burrito, Sausage Breakfast Burrito; Breakfast: GF Bacon Breakfast Bagel Sandwich, GF Breakfast Bagel Sandwich; Cold: Fruit Salad, Tossed Salad; Deli Bar: American Cheese, Provolone Cheese; Deli Bar: Chicken Salad, Tuna Salad; Deli Bar: Chicken Salad, Egg Salad, Tuna Salad; Deli Bar: Deli Beef, Deli Pepperoni; Deli Bar: Egg Salad, Tuna Salad; Display Station: Hummus, Tabouleh; Display Station: Potato Chips, Tortilla Chips; Entrees: BBQ Chicken Wings, Buffalo Chicken Wings; Grill Station: Grilled Chicken Breast, Grilled Chicken Thighs; Noodle Bowl: Beef for Pho, Chicken for Pho; Noodle Bowl: Pho Noodles, Pho Toppings; Pasta Bar: Fettuccini Pasta, Penne Pasta; Pasta Bar: Linguini Pasta, Penne Pasta; Pasta Bar: Marinara Sauce, Meatball Sauce; Pizza: Cheese Pizza, Pepperoni Pizza; Pizza: Cheese Pizza, Pepperoni Pizza, Vegetable Pizza; Salad Bar/Dressings: Banana Peppers, Green Peppers; Salad Bar/Dressings: Carrots Sticks, Celery Sticks; Salad Bar/Dressings: Chickpeas, Craisins, Cucumbers, Onions, Radishes, Tuna; Salad Bar/Dressings: Chickpeas, Cucumbers, Onions, Pepperoncini; Salad Bar/Dressings: Cucumbers, Onions, Pepperoncini; Salad Bar/Dressings: Green Olives, Green Peppers; Salad Bar/Dressings: Pumpkin Seeds, Sunflower Seeds; Salad Bar/Dressings: Sliced Eggs, Sliced Mushrooms; Sushi: Shrimp Sushi Roll, Vegetable Sushi Roll
- Charles River Campus: Breakfast Entrees: Omelet Bar, Pancake Bar; Deli Bar: 12, Lettuce, Pickles, Tomatoes; Deli Bar: American Cheese, Provolone Cheese, Swiss Cheese; Deli Bar: Deli Beef, Deli Salami; Deli Bar: FANTINI Sourdough Bread, FANTINI White Bread; Noodle Bowl: Beef for Pho, Chicken for Pho; Noodle Bowl: Pho Noodles, Pho Toppings; Pizza: Cheese Pizza, Pepperoni Pizza; Salad Bar/Dressings: Broccoli, Carrots, Celery, Chickpeas, Cucumbers, Tuna; Salad Bar/Dressings: Fresh Green Peppers, Fresh Red Peppers, Fresh Yellow Peppers
- Courtside Café: Beverages: Banana Berry Coconut Smoothie, Banana Berry Yogurt Smoothie; Beverages: Mango Tango Coconut Smoothie, Mango Tango Yogurt Smoothie; Beverages: Matcha Strawberry w/Coconut, Matcha Strawberry w/Yogurt; Beverages: Passionate Pineapple Coconut Smoothie, Passionate Pineapple Yogurt Smoothie; Beverages: Summer Blush Coconut Smoothie, Summer Blush Yogurt Smoothie; Beverages: The Green Monster Coconut Smoothie, The Green Monster Yogurt Smoothie; Beverages: V-9 Smoothie w/Coconut, V-9 Smoothie w/Yogurt; Cold: Turkey Multigrain Croissant, Turkey Pesto Croissant
- Franklin: Deli Bar: American Cheese, Provolone Cheese; Deli Bar: Chicken Salad, Egg Salad, Tuna Salad; Deli Bar: Chicken Salad, Tuna Salad; Deli Bar: Deli Beef, Deli Ham; Deli Bar: Deli Beef, Deli Ham, Deli Salami; Deli Bar: Deli Ham, Deli Salami; Deli Bar: Egg Salad, Tuna Salad; Express: Brown Rice, Jasmine Rice; Express: Pho Noodles, Pho Toppings; Express: Teriyaki Salmon w/Sesame Seeds, Teriyaki Tofu w/Sesame Seeds; Express: Thai Red Curry Chicken, Thai Red Curry Tofu; Gluten Free: Alfredo Sauce, Bolognese Sauce; Gluten Free: Gluten Free Pepperoni Pizza, Gluten Free Primavera Pizza; Hot: General Tso's Chicken & Rice, General Tso's Tofu & Rice; Hot: Zesty Orange Chicken & Rice, Zesty Orange Tofu & Rice; Pasta Bar: Cavatappi Pasta, Fettuccini Pasta; Pasta Bar: Linguini Pasta, Penne Pasta; Pasta Bar: Marinara Sauce, Meatball Sauce; Pizza: Cheese Pizza, Pepperoni Pizza; Sushi: Shrimp Sushi Roll, Vegetable Sushi Roll; Vegetarian Line: Plant Based Cheese Pizza, Plant Based Greek Pizza
- Green Fields: Brkfst Salad: Buffalo Chicken Wrap, Mediterranean Chicken Wrap; Brkfst Salad: Caesar Salad Chicken Wrap, Southwestern Salad Chicken Wrap; Brkfst Salad: Cobb Salad Wrap, Garden Salad Wrap, Power Salad Wrap; Salad Bar/Dressings: Buffalo Chicken Salad, Mediterranean Chicken Salad; Salad Bar/Dressings: Caesar Salad w/Chicken, Southwestern Salad w/Chicken; Salad Bar/Dressings: Cobb Salad, Garden Salad, Power Salad
- Hampshire: Gluten Free: Bolognese Sauce, Marinara Sauce; Gluten Free: Gluten Free Pepperoni Pizza, Gluten Free Primavera Pizza; Grill Station: Grilled Chicken Breast, Grilled Chicken Thighs; Latino: Peruvian Rice, Peruvian Shrimp; Noodle Bowl: Beef for Pho, Chicken for Pho; Noodle Bowl: Pho Noodles, Pho Toppings; Pasta Bar: Cavatappi Pasta, Fettuccini Pasta; Pasta Bar: Gemelli Pasta, Linguini Pasta; Pasta Bar: Linguini Pasta, Penne Pasta; Pasta Bar: Marinara Sauce, Meatball Sauce; Pizza: Cheese Pizza, Pepperoni Pizza, Vegetable Pizza; Sushi: Shrimp Sushi Roll, Vegetable Sushi Roll; Vegetarian Line: Plant Based Cheese Pizza, Plant Based Greek Pizza
- Hampshire Café: Cold: Turkey Multigrain Croissant, Turkey Pesto Croissant
- Harvest Market: Cold: Chicken Caesar Salad, Chicken Caesar Wrap; Cold Bar Items $11.50/LB: Blue Cheese Crumbles, Blue Cheese Dressing; Cold Bar Items $11.50/LB: Carrots, Cucumbers, Edamame, Watercress; Cold Bar Items $11.50/LB: Chipotle Ranch Dressing, Ranch Dressing; Cold Bar Items $11.50/LB: Feta Cheese, Parmesan Cheese; Hot Bar Items $11.50/LB: Sausage Muffin, Sausage Patty; Hot Bar Items $11.50/LB: Vegetable Lasagna, Vegetable Medley; Pizza: Carciofi Pizza, Cheese Pizza, Pepperoni Pizza; Pizza: Cheese Pizza, Pepperoni Pizza, Primavera Pizza; Pizza: Cheese Pizza, Pepperoni Pizza, Zucchine Pizza; Salad Bar $11.50/LB: Potato Salad, Tortellini Salad, Tuna Salad; Salad Bar $11.50/LB: Tortellini Salad, Tuna Salad
- Newman Café: Breakfast Entrees: Bacon Egg Breakfast Bagel, Bacon Egg Breakfast Sandwich; Breakfast Entrees: Bacon Egg Breakfast Bagel, Egg Breakfast Bagel, Sausage Egg Breakfast Bagel; Breakfast Entrees: Bacon Egg Breakfast Sandwich, Egg Breakfast Sandwich, Sausage Egg Breakfast Sandwich; Breakfast Entrees: Classic Breakfast w/Bacon (Bagel), Classic Breakfast w/Sausage (Bagel); Breakfast Entrees: Egg Breakfast Bagel, Egg Breakfast Sandwich; Breakfast Entrees: Newman Bacon Breakfast Burrito, Newman Sausage Breakfast Burrito; Breakfast Entrees: Plant-Based Sausage Egg B-Fast Bagel, Plant-Based Sausage Egg B-Fast Sandwich; Breakfast Entrees: Sausage Egg Breakfast Bagel, Sausage Egg Breakfast Sandwich; Breakfast Miscellaneous: Everything Bagel, Plain Bagel; Breakfast Pastries: Mini Butter Croissant, Mini Chocolate Croissant
- People's Organic Coffee: Stir Fry Station: Southwest Bagel, Traditional Bagel
- Procrastination Station: Cold: Turkey Multigrain Croissant, Turkey Pesto Croissant; Hot: Gruyere & Leek Tart, Gruyere Spinach & Leek Tart
- Roots Café: Cold Bar Items $11.50/LB: Balsamic Dressing (Packet), Caesar Dressing (Packet), Italian Dressing (Packet), Ranch Dressing (Packet); Cold Bar Items $11.50/LB: Beets, Carrots, Chickpeas, Cucumbers, Salsa; Pizza: BBQ Chicken Flatbread, Buffalo Chicken Flatbread; Quesadillas: BBQ Chicken Quesadilla, Buffalo Chicken Quesadilla, Chicken Quesadilla; Quesadillas: Cheese Quesadilla, Chicken Quesadilla
- Star Ginger: Noodle Bowl: Beef Pho w/Chicken Broth, Beef Pho w/Vegetable Broth; Noodle Bowl: Beef Pho w/Chicken Broth, Chicken Pho w/Chicken Broth; Noodle Bowl: Beef Pho w/Spicy Green Curry Broth, Chicken Pho w/Spicy Green Curry Broth; Noodle Bowl: Beef Pho w/Vegetable Broth, Chicken Pho w/Vegetable Broth; Noodle Bowl: Chicken Pho w/Chicken Broth, Chicken Pho w/Vegetable Broth; Noodle Bowl: Pulmuone Tofu Pho w/Chicken Broth, Pulmuone Tofu Pho w/Vegetable Broth; Starches: Brown Rice, Jasmine Rice
- Tamales: Bowls: Marinated Beef Rice Bowl, Marinated Chicken Rice Bowl, Marinated Lentil Rice Bowl; Burritos: Beef Burrito, Chicken Burrito, Lentil Burrito; Quesadillas: Beef Quesadilla, Carnitas Quesadilla, Cheese Quesadilla, Chicken Quesadilla, Lentil Quesadilla; Salad Bar/Dressings: Beef Salad, Carnitas Salad, Chicken Salad, Lentil Salad; Stir Fry Station: Beef Nachos, Carnitas Nachos, Chicken Nachos, Lentil Nachos; Stir Fry Station: Loaded Nachos w/Beef, Loaded Nachos w/Chicken, Loaded Nachos w/Lentils, Loaded Nachos w/Pork
- Tavola: Bowls: Hummus Bowl w/Beef, Hummus Bowl w/Chicken, Hummus Bowl w/Falafel, Hummus Bowl w/Lamb; Brkfst Salad: Mediterranean Wrap w/Beef, Mediterranean Wrap w/Falafel, Mediterranean Wrap w/Lamb; Salad Bar/Dressings: Tavola Salad w/Beef, Tavola Salad w/Chicken, Tavola Salad w/Falafel, Tavola Salad w/Lamb
- The Grill: Beverages: Chocolate Shake, Strawberry Shake, Vanilla Shake; Entrees: Cheeseburger, Hamburger
- Wasabi: Bowls: Chicken Katsudon, Pork Katsudon; Bowls: Spicy Salmon Bowl, Spicy Tuna Bowl; Sushi: Alaskan Roll, California Roll, Paradise Roll, Rainbow Roll, Tiger Roll
- Whitmore Café: Entrees: Crispy Chicken Sandwich, Crispy Chicken Wrap; Entrees: Crispy Chicken Wrap, Grilled Chicken Wrap; Entrees: Hummus Wrap, Veggie Wrap; Noodle Bowl: Beef Pho w/Spicy Green Curry Broth, Chicken Pho w/Spicy Green Curry Broth; Noodle Bowl: Beef Pho w/Vegetable Broth, Chicken Pho w/Vegetable Broth
- Worcester: Desserts: Chocolate Soft Serve Ice Cream, Vanilla Soft Serve Ice Cream; Display Station: Carrots Sticks, Celery Sticks; Display Station: Chapati, Idli, Sambhar; Grill Station: Roasted Cauliflower, Roasted Zucchini; Hot: Chicken Tikki Masala w/Rice & Naan, Tofu Tikki Masala w/Rice & Naan; Latino 1: Bacon, Onions; Mediterranean: Arrabbiata Sauce, Marinara Sauce; Mediterranean: Fettuccini Pasta, Rigatoni Pasta; Mediterranean: Linguini Pasta, Orecchiette Pasta; Mediterranean: Marinara Sauce, Meatball Sauce; Mediterranean: Orecchiette Pasta, Rigatoni Pasta; Mediterranean: Penne Pasta, Rigatoni Pasta; Noodle Bowl: Butter, Corn, Scallions; Noodle Bowl: Corn, Cucumber, Scallions; Noodle Bowl: Onions, Scallions; Noodle Bowl: Peanuts, Scallions; Seasons: Avocado, Scallions; Seasons: Avocado, Carrots, Corn, Nori, Scallions, Sriracha; Seasons: Carrots, Corn, Nori, Scallions; Seasons: Chickpeas, Raisins; Seasons: Corn, Scallions; Seasons: Sesame Seeds, Sunflower Seeds; Sushi: Shrimp Sushi Roll, Vegetable Sushi Roll; Tandoor: Babaganoush, Tabouleh; Tandoor: Coriander Chutney, Tomato Chutney; Tandoor: Falafel, Hummus
- Worcester Café: Beverages: Caramel Flavored Syrup, Coconut Flavored Syrup, Hazelnut Flavored Syrup, Raspberry Flavored Syrup, Vanilla Flavored Syrup; Beverages: Chocolate Milkshake, Strawberry Milkshake, Vanilla Milkshake; Beverages: Double Espresso, Single Espresso; Breakfast Pastries: Everything Bagel, Plain Bagel; Breakfast Pastries: Mini Butter Croissant, Mini Chocolate Croissant; Premium Sandwiches CPK: Turkey Multigrain Croissant, Turkey Pesto Croissant

**The only size of it at this station** (12):
- Franklin, Soups: 8 oz Spicy Lentil & Veggie Soup (1 day)
- Harvest Market, Hot Bar Items $11.50/LB: Yellow Cheddar Macaroni & Cheese (8 oz) (7 days)
- Harvest Market, Soups: 12 oz Chana Masala Soup (2 days)
- Roots Café, Entrees: Yellow Cheddar Macaroni & Cheese (8 oz) (14 days)
- Worcester Café, Beverages: 20 oz Cold Brew (12 days)
- Worcester Café, Beverages: 20 oz Iced Americano (12 days)
- Worcester Café, Beverages: 20 oz Iced Caramel Macchiato (12 days)
- Worcester Café, Beverages: 20 oz Iced Chai Latte (12 days)
- Worcester Café, Beverages: 20 oz Iced Latte (12 days)
- Worcester Café, Beverages: 20 oz Iced Matcha Latte (12 days)
- Worcester Café, Beverages: 20 oz Iced Tea (12 days)
- Worcester Café, Breakfast Pastries: 3 oz Cinnamon Raisin Bagel (12 days)

### Design (as built; motion all existing)
- **Data (`src.html`, after the dish table).** `variantOf(name)` reads a token; `famsAt(dishes, station)` makes a station's
  families. They run once over all fifteen days into `FAM` (dish id → its family and its own entry). From that:
  - Search's groups (`BYK`, `CBYK`) hold a family once, under the key `f:<name>`, with each variant's own refs. A member's own
    group loses that place's ref, so a name that is a family at one café and a lone dish at another stays findable there;
  - `SERV[f:<name>]` holds the default's servings, so "Later today and tomorrow", favourites and alerts can ask where a
    family is served. Each variant keeps its own `SERV` entry, so a sheet's "where" is the picked variant's;
  - `shown(dish)` is how a member reads ("Cappuccino, 20 oz"); `shownName(name)` does the same from a logged name alone.
- **The row** (hall and café menus) is the family's first variant your preferences allow, at its first member's place. Its
  name is the family's; its meta line leads with the token as its own group (`.vt`). `+` adds that variant; the stepper
  counts it. A family row carries its members' ids (`data-vars`), so "where" and an alert's tap land on it whichever
  member they name.
- **Search.** A family matches on any member's name (`g.words`). `varFor` picks the variant the row stands for: the first
  whose own name has every word typed, else the first your preferences allow. The row's meta leads with that token, and
  its `+` adds that variant at every café serving it. "Later today and tomorrow" lists a family once, under its name.
- **The picker** (`vpickHTML`) is a `role=radiogroup` of `.chip` buttons with `role=radio`, under the name in both the plain
  sheet and the builder. The chosen chip uses the filter chip's selected look (tonal, with its check). Chips wrap, and a
  long label wraps inside its chip.
- **A pick** (`pickVar`) redraws the sheet in place. The chip's fill runs its own `settle` transition, everything after the
  chips crossfades from .4 (`settle`), and the scroll position and the sheet's height stay. In a builder the new variant's
  builder keeps the add-ins that it shares (all of them, since a family shares its station).
- **The pho.** Its choices (hall broths, a café's phos) are chips. They are no longer `.brow` rows, and `stepPart` no longer
  has a pick-one case. Round 11b's no-broth state is unchanged.
- **The plate.** `addDish` gets `shown(dish)` as the item's name; a built member's name is `nameOf(bowl)`. A family
  member opened from the plate has `DS.from`; its action is **Update** (`vupd`), which swaps the item's dish and refs,
  keeping its quantity, or merges into a twin.
- **The log** is unchanged: `snapItem` takes the dish's own feed name. History draws `shownName(it.n)`.
- **Favourites and alerts.** The sheet's star is `favKey(dish)`, the family's key. `dishName` names a family by
  `FAMNAME`. You → Favorites names it the same way. Its line uses `servedNow`, which for anything not on a hall's lunch now
  reads the places serving it now from `wherePlan` (before round 12, a café favourite's row showed its normalized key and
  "Not on lunch today").

### Review passes (`build/r12/p1`, `p2`, `p3`: 390 left and 360 right at dpr 2, from `shots12.js`; contact sheets `sheet1.png` to `sheet5.png` in each)
26 states: Worcester Café's list (top and scrolled), the Cappuccino sheet (16 oz, 20 oz with an add-in, scrolled to the
label), Courtside Café, Procrastination Station, the Boba sheet (Almond, Oat, scrolled, tracking off on Soy), Hampshire's pho
bar (none chosen, chosen with parts), Whitmore's and Star Ginger's pho builders, the plate, Update from the plate, a row after
`+`, a logged meal, Search ("boba", "oat", "20 oz latte", "oatmeal", "chowder"), and You → Favorites.

**Pass 1: 3 flaws.**
1. Choosing a chip changed its width. The filter chip's check and its bolder text made a chip wider when chosen,
   and the five milks wrap to two lines at both widths, so a choice could move a chip to the other line. The chosen chip
   is now the tonal fill and edge alone, at the same weight; a test checks every chip's rect before and after a pick.
2. The serving line sat 4 px under the chips (its own `margin-top` under the name). It is now 8 px, a part of the group.
3. The shots scrolled to Beverages by setting `scrollTop`, so the station button still read "Desserts". The shots now use
   the list's own `jump`. (A harness flaw, not the design's.)

**Pass 2** (`p2`) confirmed the three. One more flaw: You → Favorites joined a family's places with "or" (the plate's
`hallLabel`, which names where one plate can be logged). A favourite's places are all true at once, so they now join with
"and"; hall favourites read as before.

**Pass 3** (`p3`, the final build): clean at both widths.
- At 360 a family row in Search wraps its token group to its own line when the numbers don't fit beside the lane ("Almond
  Milk", then "180 cal 0.3g protein"). That is round 8's rule that meta groups wrap whole; the row is three lines, as a
  long-named dish's is.
- Star Ginger's nine phos are nine chips, one or two to a line, and the sheet opens tall (Open).

### Tests (`test.js`, `round12`; `RED=12` runs it alone)
- **Scenarios** (6):
  - a size family at Worcester Café: one row per family, none per member; the row leads with "16 oz"; the sheet's chips;
    20 oz changes the name and price without moving the sheet; a chosen add-in stays; on the plate as "Cappuccino, 20 oz"
    with its add-in; logged as "20 oz Cappuccino";
  - the boba family at Procrastination Station: one row, "Almond Milk" first; five chips; Oat changes the name, the label
    and Contains, never moving or resizing a chip; the plate names it; the row still counts its default; logged as "Boba Oat
    Milk" with its id and 262 cal; history reads "Boba, Oat Milk";
  - the pho's broth: chips, none chosen, no broth rows, no heading, Add waiting; a chip names the bowl; one at a time; 288
    with parts; reopened from the plate on its broth with Update; Whitmore's phos as chips, its add-ons under "Add-ons", a
    chosen pho names the bowl, every chip inside the line;
  - a family on the plate: `+` adds the default and the row counts it; reopened with Update; 20 oz and Update switch the
    item; the row returns to `+`; a twin merges to 2;
  - Search: "boba" is one row at three cafés; "oat" finds Boba standing for oat, and its `+` adds oat at the three cafés;
    "cappuccino" one row; "20 oz latte" Latte at 20 oz; "oatmeal" lists Harvest Market's once beside Worcester's own;
    the star is the family's across chips; the Favorites lens; `alertRun` posts "Boba" once; You → Favorites says "Boba";
    tracking off keeps five chips and drops Add, and Oat changes the label;
  - near-misses: Cold Brew, the iced drinks, the espressos and milkshakes keep rows; the add-on milks stay add-ins; the
    Coconut and Yogurt smoothies are two rows each; the acai bowls are families; "1% Milk" is a dish; 52 families, 255
    station-days, 322 station-meals.
- **Red:** `RED=12 SRC=build/r12/before-index.html` (round 11b's build) gives all six RED (`build/r12/red-r12.txt`):
  ```
  RED    a size family: …: Cappuccino: one row, named for the family
  RED    the boba family: …: one row, "Boba"
  RED    the pho's broth is the same picker: …: the broths are the chips, none chosen:
  RED    a family on the plate: …: locator.tap: Timeout 30000ms exceeded.
  RED    a family in Search: …: "boba": one row, at three cafés
  RED    near-misses stay rows: …: locator.tap: Timeout 30000ms exceeded.
  ```
- **Changed after the red run:** the row-meta helper joins the meta groups with spaces (the groups are adjacent spans);
  two expected keys were written with `norm()` on the test's side, where it doesn't exist; the family count is three
  numbers (families, station-days, station-meals) instead of one; the oatmeal check expects Worcester's own Hot Oatmeal
  beside Harvest Market's family. Added after: the chip rects check (pass 1). Each scenario's red was already recorded.
- **Older tests changed:** round 11b's pho scenario picks a broth, and a café's first pho, by its chip instead of its
  add-in row, and "one broth at a time" counts chosen chips.
- **Now:** `RED=12 node test.js` gives 6 green scenarios, 74 checks (after the frame-review fix below). `node test.js` gives 5,296 checks and `RM=1 node
  test.js` gives 3,631, all green.

### Vectors (`vectors.js` -> `vectors.json`; the shape is in its header)
- `variants.families`: all 322 station-meals, each with its tokens, feed names and calories, default first.
- `variants.nearMiss`: the 222 near-misses above, with reasons and day counts.
- `variants.shown`: how ten feed names read (members, and non-members that keep their names).
- `variants.search`: five queries' now rows: the family once, the variant the query picks, and the places.
- `variants.alerts`: a starred family at 7:15 AM and 12:41 PM: one post, titled "Boba".
- Everything from rounds 9 to 11b is unchanged.

### Files
- `CRITIQUE-r12.md`, `CONCEPT.md` (Round 12), `src.html`, `test.js`, `vectors.js`, `vectors.json`, `shots12.js`.
- Shots: `build/r12/p1`, `p2`, `p3`; the baseline is `build/r12/before-index.html`. `build/` is under
  `~/.cache/udine-scratch/flows/M2/` and isn't committed (every frame embeds a UMass photo).

### Open (for the owner)
- **Courtside Café's smoothies come with Coconut or Yogurt** (seven pairs). It is the boba's shape, a base picked for one
  drink, but the word isn't a milk, so the rule leaves them as rows. Group them with a Coconut / Yogurt picker?
- **"Maple Milk".** The chip reads "Maple", the feed's word. Worcester Café's add-ons say "MAPLELINE", so it is probably
  Mapleline Farm's milk, not a maple flavour. Keep the feed's word, or say "Mapleline"?
- **A row counts only its default.** Oat milk added from the sheet goes on the plate, and the Boba row's `+` stays a `+`
  (round 10's bowl rule). The alternative is a row that follows the plate: it would stand for the variant last added
  and count that.
- **Café phos are protein × broth** (Star Ginger: three proteins, three broths; Whitmore: three by two). As one pick-one
  they are a wall of nine chips. Two pickers (protein, broth) would be three and three, but that is a second axis the
  rule doesn't read.
- **Blank calories read as 0** ("Chai, 20 oz", next to 211 for the 16 oz). `build.py` turns a blank into 0, which round
  8's "missing data draws nothing" says it shouldn't. It predates round 12; the picker makes it visible.
- **A café's add-ons apply to every dish at that meal** (round 10's café rule), so Roots Café's lunch boba builds with "Add
  Bacon Quesadilla". Not round 12's, but the picker opens those builders more often.

### Round 12, orchestrator frame review of `p3`
- **The defect.** At 360, a boba row put "Almond Milk" on a line of its own, with the numbers under it (`m-proc`, `s-boba`,
  `s-oat`). It wasn't a stray break: the row's text column is 210 px at 360, because the control lane is kept as wide as
  the stepper so that `+` → stepper never rewraps the name (`.row>.add{margin-left:66px}`). The token group (76 px), the
  10 px group gap and the numbers group (132 px) came to 218 px, so round 8's whole-group wrap moved the numbers down. "16
  oz" is 36 px, so sizes never wrapped.
- **The fix.** The row's token is now the chip's own word ("Almond", "Oat", "16 oz"), the word the picker uses: 48 + 10 +
  132 = 190 px. The sheet's name and the plate keep the full form ("Boba, Almond Milk"). The concept's row frame read
  "Almond Milk"; this replaces it.
- **Test** (red first, against the build before the fix: `RED … it stands for the first milk in the feed's order, in its
  chip's word`): at 360, Procrastination Station's Boba row has its token and its calories on one line (their boxes overlap
  vertically, and the token sits to the left). Search's "oat" row expects "Oat 262 cal".
- **Shots:** `build/r12/p4` (`m-proc`, `s-boba`, `s-oat`, `s-oatmeal`, `z-wcafe`; `sheet.png`).
- **Check counts.** The full suite read 5,390 checks at round 11b and reads 5,296 on the final run, though round 12 adds about 74 and
  removes none. The difference is sampled frames, not coverage: round 7's motion checks assert per rendered frame, and the
  count moves by hundreds between runs (round 12's builds gave 5,461, then 5,116 an hour later with only a CSS change between, then
  5,296 after this fix). Reduced motion, which asserts no sampled frames, rose: 3,494 at round 11b, 3,631 now. No
  scenario or assert was removed. Worcester Café and the soup cafés show fewer rows, since a family is one row, so a check
  that walks every row there walks fewer duplicates.
