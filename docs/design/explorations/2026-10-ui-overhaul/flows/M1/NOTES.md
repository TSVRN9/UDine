# M1: Hall-first plus search, varsity identity with real photos

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
- **Opening a hall** is the one choreographed motion.
  - The band's photo window expands into the menu header, and the colour photo develops under the duotone.
  - The letter, the hall name, the hours and the busy row each travel from their band position to their header position.
  - Halls itself never moves: it dims as one unit under the expanding header.
  - The meal tabs and menu rise from the bottom of the screen.
  - Scrolling collapses the header into a compact varsity-maroon bar.
  - Closing plays the same frames in reverse.
- **Hall menu.**
  - Meal tabs only list meals the hall actually serves: Franklin and Hampshire have no Late night, and Berkshire has no Breakfast.
  - Station names in the list are plain titles. A pinned switcher pill under the meal tabs shows the current station and opens the jump list.
  - Rows have a `+` that becomes a stepper, which steps `+`/`−` through 1 → ½ → remove.
- **Search** covers every hall's current meal, or one hall and meal when opened from inside a hall.
  - Lens chips filter the results.
  - Results add straight to the plate, and the keyboard stays up between picks.
  - When nothing matches, the next step is a custom food.
- **The plate** belongs to the set of halls that serve everything on it (F1's mechanism). An add that can't join that set starts a second plate instead of asking a question. **Log** is on the bar. The plate sheet drags between two detents and rubber-bands past the top.

```
 Halls tab ──tap band══(photo expands, colour develops)══▶ Hall menu ──scroll──▶ compact maroon bar
   │                                                   │ meal tabs (served meals only)
   │                          │                       │ station switcher pill ─tap─▶ jump list ─tap─▶ jump + highlight
   │                          ▼                       │ + / stepper (1 → ½ → remove)
 Search tab ◀── search button in hall header (scoped "At Worcester")
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
  - The carousel shows 4 cards: Indigenous Peoples Day merged with its Hours entry, soonest first.
  - The first card's date reads "Mon, Oct 12".
  - The Worcester band starts above y = 320.
  - A touch flick snaps to the next card at 292 px.
  - A card opens its event page with "See the menu" and "Holiday hours".
  - `?events=0` shows no carousel; `?events=1` shows one card.
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
| Search and custom foods | The Search tab, and the search button in every hall header (scoped "At Worcester", removable). No match leads to "Add “…” as a custom food", which opens a form sheet (name, cal, P/C/F). The same button sits quietly under partial matches. Custom items don't constrain the plate's hall. Cafés have the same custom-food button. |
| Head-to-head ranking | You → Which was better? This pairs dishes from your on-device log and ends in your order. It's shallow and doesn't yet derive favorite halls. |
| Cafés (27, real data) | **Halls → Cafés & markets.** This is four area rows, each with "N of M open now", in place of a list that couldn't scale:<ul><li>Campus Center (12)</li><li>North, by Worcester (7)</li><li>Library and academic core (4)</li><li>Southwest, by Hampshire and Berkshire (4)</li></ul>An area row opens the **Cafés page**:<ul><li>an Open now chip, on by default;</li><li>areas as sticky headers;</li><li>each row shows the name, the building, and status from real hours ("Open until 2:30 PM" or "Opens 11 AM").</li></ul>**Near me now** works without location. Areas are named after the hall they're near, and on the Cafés page the area nearest the hall you last opened sorts first (on-device). The area rows on Halls keep a fixed order, so Halls never changes behind the hall transition. Real geolocation could later sort by distance, also on-device.<br>**Café detail:**<ul><li>status and hours, building, payment, and UMass's own description;</li><li>**Menu:** the real item list where `get_infov2` has one (Wasabi, Tavola, Tamales and others). Each item's `+` opens a custom food with its name filled in, since there are no macros yet; FoodPro Web INA is the future source.</li><li>Cafés without a list get "doesn't list its menu in the app" and "Add a custom food".</li></ul>**Search** finds cafés by name, building, area or menu item ("burrito" finds Tamales).<br>Left out: the Newton campus, the babyBerk trucks, Terrace and The Commonwealth Restaurant. |
| Grab 'N Go | A meal tab in each hall's menu, which leads with its own real hours ("Closed for today, 7 AM to 11 AM" at Hampshire). Search finds "Worcester Grab 'N Go" and similar, and opens that tab. |
| Events | **Primary home: the Search tab's idle state, before you type.**<ul><li>It's a deep-maroon band, continuous with the Search header, holding the same chenille-patch carousel: native snap, a peek of the next card, no autoplay, dates in gold.</li><li>Below it sit the lens chips and "Lunch now", the dishes being served.</li><li>Typing, a lens or a hall scope fades the band out; clearing brings it back.</li><li>0 events: the band is absent. 1 event: one full-width card. See `shot-events.png`.</li></ul>**Why Search:** Halls is for "where am I eating", and should be four bands and nothing above them. Search is already where you go when you don't know what you want, so "what's on" belongs to its empty state. That's the pattern App Store and Airbnb use for their idle search screens. It costs no space anywhere else.<br>**Contextual surfacing:** an event tagged for all DCs that falls within a week shows as one quiet row at the top of every hall's menu: a gold patch mark, the title, "Mon, Oct 12". It links to the event. The feed has no scope field; the all-DCs tag comes from the flyer text and is hard-coded for Indigenous Peoples Day in `build.py`.<br>**Data rules are unchanged:** expired events are dropped, "X Hours" is merged into "X", and the date wording is the same as round 3. |
| Station navigation | **Round 4: a pinned switcher pill,** replacing the chevron that read as collapse.<ul><li>In-list station names are plain titles with no icon.</li><li>One control sits pinned under the meal tabs: a tinted capsule with a list glyph and the current station's name. The name rolls up or down as you scroll past stations.</li><li>Tapping it opens the jump list, which drops down using the enter token and closes using the exit token. The pill fills maroon while the list is open.</li><li>Choosing a station scrolls there, and the landed title flashes a tint once (900 ms).</li></ul>Path B keeps the same 7 taps. The pill is always in the same place, so you never hunt for a header. |
| Dish detail and labels | **Opens from the row's name or body,** in hall menus and Search results; `+` stays add. Contents:<ul><li>name and serving;</li><li>dietary marks;</li><li>a **Contains** allergen block (maroon rule, tinted);</li><li>Add to plate;</li><li>an FDA-style **Nutrition Facts** panel in the plate-totals treatment: serving size, calories, fat calories, %DV header, total, saturated and *trans* fat, cholesterol, sodium, total carbohydrate, fiber, total sugars, protein and the 2,000-calorie footnote;</li><li>grades;</li><li>ingredients clamped to 3 lines with a fade, "Show all" expanding with the enter token.</li></ul>**%DV:** the menu's own value when published. Otherwise it's computed from FDA daily values (saturated fat 20 g, cholesterol 300 mg), because the feed leaves those blank. Sugars has no %DV, as on FDA labels.<br>**Plate sheet → Full label:** the same panel summed over the plate, quantities included. The benchmark plate is 404 cal and 1,913.7 mg sodium (83%). |
| Badges and grades | **One mark set, drawn as SVG glyphs** (no emoji): filled leaf for plant based, outline leaf for vegetarian, a ringed H for halal, a pin for local, a loop for sustainable.<ul><li>**Inline on rows: only the leaf.** Plant based or vegetarian is the one mark people scan a menu for; halal (492 of 661 dishes) and local would be noise on every row.</li><li>**Detail view:** all marks as maroon outlined pills.</li><li>**Lens chips** carry the same glyphs: Vegetarian, Plant based, Halal, plus a new "Low carbon" lens (A or B).</li></ul>**Healthfulness:** 7 bars, n filled in green, with "3 of 7". **Carbon rating:** an A–E row with the dish's letter filled in UMass's own icon colours. The scale is visible, so neither needs a legend.<br>**Directions verified on umassdining.com (Oct 9):**<ul><li>/nutrition/health-wellness: a healthy factor *adds* a green bar and an unhealthy one *deducts* one, and the label template says "Healthfulness Indicator n/7". **Higher is healthier.**</li><li>/sustainability describes an "A-E Carbon Rating System" measured in kgCO2e "to choose lower-carbon options". The legend icons run from dark green (A) to grey (E). So **A is lowest carbon**. That's inferred from the icon colours plus the A–E framing; no page states "A = lowest" in words. **The Low carbon lens (A or B) depends on this inference.** My Emissions' own label page renders client-side, so I couldn't confirm it there either. Confirm with UMass Dining before shipping the lens.</li></ul>`H3` = healthfulness 30 = 3/7, and `CR3` = C, both as the docs say. No dish today carries `SUS`; one has an unknown `LPS` code, which is ignored. |
| Newsletter | **Cut.** It hasn't been updated in years. |
| Press | **Cut** for now: off Halls, out of the carousel, and with no row in You. There's no press data in the prototype, and a row that only leads to an empty page would be a dead end. If wanted later, it's one row in You. |
| Busy (hall bands + header) | **Band:** a five-segment meter and a word ("Busy", "Not busy").<br>**Header:**<ul><li>the same meter row, plus one state line: "Calmer around 1:30 PM" from `calmer_at`, falling back to "Busier/Quieter than usual" from `vs_usual`, or nothing;</li><li>a **typical-day curve**: hourly bars from opening time, with now in gold at the live percentage and the next hours as gold outlines from `outlook` when present.</li></ul>**Low confidence** (`confidence` not "good") changes only the word: "Probably busy". The meter always fills to the level, and gold outlines mean only one thing: forecast bars on the curve. |
| You pane | Today's totals as a Nutrition Facts panel, meals logged with items, Favorites, Dietary preferences, ranking, and Export (real JSON and CSV Blob downloads). |
| **Planner (future)** | Not built and not drawn: no tab or button does nothing. It slots in as a **fourth tab, "Plan", between Search and You.** The tab bar is `flex:1`, so a fourth tab takes no layout change. Its first screen would be F3's target-and-proposals view. Its plates hand off to the same plate bar, so a planned plate becomes an ordinary plate you Log. A lighter entry point is a "Plan dinner" row on You after lunch is logged, if a fourth tab feels heavy. |

**Residency.** The plate, log, favorites, dietary preferences and rankings stay in memory or localStorage (favorites and diet only, inside try/catch). Nothing is uploaded. Every screen works without an account.

## Feedback and motion inventory (round 4; the spec for `mobile/src/lib/motion.ts`)

**Tokens.** Durations and easings are in `MO` (JS) and mirrored as CSS variables:

| Token | Duration | Easing | Role |
|---|---|---|---|
| press | 90 ms | (.2,0,0,1) | finger down: scale 0.96 or row tint |
| release | 180 ms | (.34,1.56,.64,1) | finger up, pop-ins; slight overshoot |
| quick | 160 ms | (.2,0,0,1) | number rolls, toggles, small swaps, tab content |
| enter | 240 ms | (.22,1,.36,1) | arrivals, reflow (FLIP), underline/indicator travel, expand |
| exit | 160 ms | (.4,0,1,1) | departures |
| push / pop | 340 / 280 ms | (.22,1,.36,1) / (.4,0,.2,1) | page push and pop, plate bar slide-in |
| count | 650 ms | (.33,1,.68,1) | count-ups, acknowledgement fades |
| hero | 500 ms | (.22,1,.36,1) | the hall transition only |
| flash | 900 ms | (.2,0,0,1) | landed-station highlight (held statically under reduced motion) |
| scrub | 200 ms + 0.05 ms/px, max 420 ms | ease-out cubic | close from a collapsed header: scroll back to top first |
| scrollFallback | 520 ms | – | jump confirmation when `scrollend` isn't supported |
| rmFade | 120 ms | linear | reduced motion: replaces every movement |
| stagger | 40 ms step + 60 ms lead; dense 18 + 120 | – | meter segments and healthfulness bars; curve bars (dense) |
| SPRING.sheet | k 300, ζ 0.84 | velocity-carrying | sheets |

Everything animates through `A(el, keyframes, token)`. Under reduced motion it keeps only opacity, as a 120 ms crossfade, or updates instantly. CSS transitions and keyframe animations collapse to 0 ms. There are no duration or easing literals outside the token blocks (`MO` in JS, the `--d-*`/`--e-*`/`--stagger*` variables in CSS).

| Interaction / state change | Feedback | Token | Haptic |
|---|---|---|---|
| Any button, chip, card, tab, `+`/stepper | scale 0.96 within 90 ms, spring back | press / release | – |
| Rows, bands, list rows, jump-list items, checkboxes | background tint within 90 ms | press | – |
| Tab switch | indicator slides; new tab fades up 6 px | enter / quick | light (4) |
| Open hall | band lifts and expands into header; Halls dims; tabs and body rise | hero | light (6) |
| Close hall | exact mirror (scroll scrubs to top first if collapsed) | hero | – |
| Header collapse | scrubbed by scroll position, no time-based animation | – | – |
| Meal tab | underline travels; list slides in from the tab's side | enter | light (4) |
| Station switcher open / close | list drops 12 px and fades; scrim fades; pill fills maroon | enter / exit | light (5) |
| Station jump | smooth scroll; landed title flashes a tint once | (native scroll) + flash (static tint under reduced motion) | light (5) |
| Current station changes while scrolling | pill name rolls up or down | quick | – |
| `+` (first add) | `+` morphs into the stepper (scaleX from the right edge); row flashes maroon tint | enter / count | light (8) |
| Stepper + / − | quantity rolls in the direction of change | quick | light (8) / – |
| 1 → ½ | quantity rolls down | quick | – |
| ½ → remove | stepper shrinks away (ghost) while `+` pops back | exit / release | rigid (14) |
| Remove in plate sheet | row slides out left before the sheet re-renders | exit | rigid (14) |
| Plate bar, first add | bar slides up from below the tab bar | push | – |
| Plate bar, later adds | item count, calories and protein roll; bar bumps 4 px | quick / enter | – |
| Plate bar swipe | content follows finger, then slides in from the swipe side | enter | light (5) |
| Plate sheet | spring between detents, rubber band past top | SPRING.sheet | tick on detent |
| Plate tabs in sheet | content crossfades | quick | light (4) |
| Sheet totals while open | Nutrition Facts numbers roll; Log label updates | quick | – |
| Log | plate content drops away; "Logged… / Today" rises; day total counts up; You tab icon bumps | enter / count / push | success pattern |
| Undo | day total counts back down; plate rises back into the bar | count / enter | light (6) |
| Search typing | surviving rows glide to new places (FLIP), new rows and groups fade up | enter | – |
| Search idle hub in / out | events band fades in or out | enter / exit | – |
| Lens chip | fill and colour transition | quick | light (4) |
| Hall-scope chip removal | chip shrinks out, then results reflow | exit / enter | – |
| Empty and no-match states | fade up 6 px; not replayed while the text is unchanged | enter | – |
| Café / event / You pages | push from the right, pop back | push / pop | light (3) |
| Open now chip, dietary checkboxes, ranking pick | content crossfade; checkbox pops; picked card pulses | quick / release | light (4–6) |
| Dish detail open / close | sheet spring | SPRING.sheet | tick |
| Ingredients Show all / less | height expands or collapses | enter | light (3) |
| Favorite toggle | button pulses; star appears on row | release | light (6) |
| Busy meter and typical-day curve | segments and bars fill up, staggered, on appear | enter + stagger | – |
| Healthfulness bars in detail | fill up, staggered | enter | – |
| Events carousel | native momentum and one-card snap | (native) | tick on settle |
| Toast (export) | fades and rises | quick / enter | – |

## (d) What's genuinely different from today, and why it should feel better

1. **Search is a peer of the hall list, not a buried feature.** Search has its own tab and a scoped entry inside every hall. Round 3 removed the duplicate field on Halls; the tab is one tap from anywhere. Its ergonomics are built for a run of picks:
   - the keyboard stays up;
   - the previous query is pre-selected, so you just type the next dish;
   - Enter adds the top result;
   - results that can join your plate sort first, and ones that can't get an outlined `+`;
   - each row shows which halls serve it (W F H B), with your plate's halls filled.
2. **The hall decision is inferred, not asked.** Search adds carry every hall that serves the dish, and the plate narrows as you add. Adds from inside a hall menu are scoped to that hall, because being in Worcester's menu is evidence. Conflicts make a second plate instead of a modal, and Log only asks when the hall is genuinely ambiguous.
3. **Station navigation is one pinned switcher.** It replaces both the right-edge scrubber and F4's rail.
   - **Discoverable.** A filled capsule with a list glyph reads as a control. Round 3's chevron on each heading read as collapse/expand. The scrubber was 3 px of grey you had to know about.
   - **Always "you are here".** The pill always names the current station, and the jump list marks it.
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

   - **One progress value drives the whole header.** `paint(p, y)` sets every element's transform or opacity from the open progress `p` and the scroll `y`. Nothing else animates the header.
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
5. **Feedback everywhere, one quiet vocabulary.** Every press answers within 90 ms, every number rolls, and everything that arrives or leaves animates on a named token. The only bold motion is the hall transition. See the inventory below.
6. **Places scale by area, not by list length.** Halls stays a four-band screen plus four area rows, whether UMass runs 12 cafés or 40.
   - The open-now counts answer "is anything open over there" without a tap.
   - Search covers the long tail: a café name, a building, or what it sells.
   - Every hall, Grab 'N Go and café shows its status in the same words, computed from real hours: "Open until 9 PM", "Opens 11 AM", "Closed for today".
7. **Busy reads at a glance.** The meter is five segments and a word, with no legend. The header adds when it clears and a typical day.
   - The curve reads like the popular-times bars students already know: tall bars are busy hours, and gold is now.
   - It is built to take the planned occupancy-history data unchanged: one array of hourly percentages per hall and weekday.
8. **Sheets are physical.** The plate sheet follows the finger 1:1. On release it projects velocity onto the nearest detent with a damped spring that inherits the release velocity. Past the top it rubber-bands with iOS's `(1−1/(x·.55/d+1))·d` curve. Dragging the bar opens it directly. The plate sheet has no pop-in moment.

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

- **Signature photo transition (band → header → compact bar): one shared value carries over exactly.** The prototype's `paint(p, y)` *is* the RN design.
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
  - **Busy curve.** One `react-native-svg` `<Rect>` per hour, or a Skia path, fed by the history table's hourly array. Its opacity comes from the same `progress` and `c`.
- **Menu list.**
  - `FlashList` v2 (or `SectionList`) with no sticky headers; the switcher is the only pinned element.
  - Station titles are plain list items. The switcher pill is an absolutely positioned `Pressable` that rides the header's `translateY`; its name rolls with an `entering`/`exiting` pair keyed on the station. The jump list is a `Modal`-less list using `entering={FadeInUp.duration(MO.enter)}`, and `scrollToIndex` does the jump. The landed title gets a `withSequence` background flash.
  - Meal tabs are a plain row of `Pressable`s; they all fit, so they don't scroll.
- **Search.**
  - `keyboardShouldPersistTaps="handled"` on the results list keeps the keyboard up across picks.
  - `TextInput.setSelection(0, len)` after each pick gives the replace-on-type behaviour.
  - `onSubmitEditing` adds the top result.
  - Lens chips are a horizontal `ScrollView` of `Pressable`s.
- **Plate bar and sheet.**
  - The plate bar sits absolutely above expo-router's tab bar. With native tabs on iOS 26, it's the `UITabBarController` bottom accessory.
  - The sheet should be `@gorhom/bottom-sheet` v5 (`snapPoints` mid/large, `enableDynamicSizing` for mid, `overDragResistanceFactor` for the rubber band, `BottomSheetScrollView` for the handoff), not a native formSheet, because it must open from a drag on the bar.
  - If the bar-drag can go, a native `formSheet` with `sheetAllowedDetents` is the more native choice.
  - Horizontal plate switching on the bar: `Gesture.Pan().activeOffsetX([-12,12]).failOffsetY([-8,8])`, composed with the vertical pan.
- **Numbers.** The bar's calories roll with Reanimated `entering`/`exiting` on a keyed `Text`. The day total counts up through a shared value into an animated `TextInput`.
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
- `strip-open.png`: progress 0 → 1 in steps of 0.1, Hampshire on top and Worcester below.
- `strip-collapse.png`: the header collapse scrubbed across 11 scroll positions.
- `shot.sh <state> [out]`: a headless screenshot.
- Screenshots:
  - `shot-halls.png`, `shot-menu.png`, `shot-transition.png` (Hampshire at p = 0.5), `shot-stations.png` (switcher open);
  - `shot-search.png` (idle hub), `shot-typed.png`, `shot-cafes.png`;
  - `shot-plate.png`, `shot-label.png` (Golden BBQ detail), `shot-platelabel.png`.
- `build.py` also embeds `locations-2026-10-08.json` (27 cafés, hall and Grab 'N Go hours) and `events-2026-10-08.json`, merged and sorted as described in (c).
