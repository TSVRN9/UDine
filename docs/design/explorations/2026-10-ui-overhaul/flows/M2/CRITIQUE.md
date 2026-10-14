# M1 critique: motion and the round-4 additions

## How this was recorded

`rec.js` records every interaction with the app clock slowed 8×. That covers `performance.now`, `requestAnimationFrame`, `setTimeout`, and CSS and WAAPI through CDP `Animation.setPlaybackRate`. It screenshots continuously, about one frame every 4–6 ms of app time, and labels each frame with in-page time relative to the first `pointerdown` or `keydown`.

`sheet.py` and `strips.sh` turn the frames into contact sheets: every 33 ms for row-level changes and every 40–100 ms for whole screens. Raw M1 strips are in `build/rec/strip-M1-<interaction>.png`, and the before/after pairs are in `compare-<interaction>.png`. Frame times below are those labels.

**Blind spot.** Native scrolling is not slowed. That means `scrollTo({behavior:'smooth'})`, scroll-snap and fling momentum. In M1 the station jump, the carousel snap and flick scrolling run at real speed, so in the strips they look like cuts. They are not judged as cuts here.

## The verdict in one paragraph

M1 has one spatial idea, and it's a good one: the band you tap becomes the header. Nothing else in the app uses that idea. Everything added in round 4 animates by a different rule, and most of it uses no rule at all. The result is the stock web-UI motion kit:
- pages push in from the right;
- sheets slide up from the bottom edge;
- lists fade up 6 px;
- numbers roll like an odometer;
- the bar bumps;
- the You icon bounces;
- meters "fill in" every time they're drawn.

Each answers "something happened". None answers "what moved where". The new elements are styled the same way: generic web components in a maroon tint (a tinted pill, rounded filter chips, a popular-times chart, a callout box, a flyer carousel). The identity's actual materials (felt, stitching, Oswald scoreboard numerals, the Nutrition Facts rule system) appear only in the hall letters and the label panel. The owner's "afterthought" reading is accurate.

## Two bugs found while recording

1. **Tapping the plate bar does nothing.** `strip-M1-sheet`, −41 to +882 ms: no frame changes.
   - The bar's `pointerup` opens the sheet and turns on the scrim's pointer events. The same touch's `click` then lands on the scrim, which sits at z 50 above the bar at z 39, and closes the sheet.
   - A trace shows `to mid`, then `to closed` from `#scrim`'s click handler.
   - NOTES says "+1 tap on the bar" to review the plate. That path never worked. Only the drag-up works (`strip-M1-sheetdrag`).
2. **A meal-tab switch shows Halls through the menu.** `strip-M1-mealtab`, +50 and +100 ms: Berkshire's band and "Cafés & markets" are visible behind the list.
   - `#mlist` fades from opacity 0, and it is the only opaque layer over the Halls tab.

## Interaction by interaction

| Interaction | What the motion tells you | Source → destination? | Shared spatial model? | Identity or generic? |
|---|---|---|---|---|
| **Add a dish** (`strip-M1-add`) | `+` stretches into a stepper (+31 ms), the row flashes maroon tint for 650 ms, and the bar slides up from under the tab bar (+31 to +168). | **No.** The dish goes nowhere; a bar appears from offscreen. Nothing connects the row to the bar 300 px below it. | No. Its own rule. | Generic. The tint flash is a web "highlight changed row". |
| | **Layout jank:** the stepper is wider than `+`, so the name re-wraps. "Local Roasted Sweet Potatoes" drops its leaf to a second line, and the row grows 8 px, pushing every row below it (+31 ms). | | | |
| **Add again** (`strip-M1-add2`) | The bar's cal, protein and item count roll like an odometer (+31 to +100), and the bar bumps up 4 px. In the roll frames, "1 item"/"2 items" and "164"/"226" are double-exposed and unreadable. | No. The number changes in place; the row that caused it is elsewhere. | No. | Decoration. A roll that's illegible mid-flight says less than an instant swap. |
| **Change quantity** (`strip-M1-qty`) | The quantity digit rolls, and the bar's numbers roll and bump. | No. | No. | Decoration. Two rolls and a bump for one tap. |
| **Remove** (`strip-M1-remove`) | The stepper shrinks as a ghost, `+` pops back with an overshoot, and the bar numbers roll down (+32 to +132). | No. Calories leave the bar, but nothing shows them going back to the row. | Partly: the stepper collapses toward `+`, the mirror of the add. | The overshoot pop is generic springiness. |
| **Plate bar appearing** (`add`, +31 to +168) | The bar slides up from below the tab bar. | It comes from offscreen, not from the dish. | Not a pattern used anywhere else. | Neutral. |
| **Open the plate sheet** (`strip-M1-sheetdrag`) | A chalk sheet rises from the bottom edge and covers the maroon bar under your finger. The bar vanishes in one frame (+43 ms) and "Your plate" repeats what the bar said. | **Wrong.** The object you grabbed disappears and a different one arrives. | No. A stock bottom sheet. | Generic iOS sheet in a light skin; the plate bar's maroon is lost. |
| **Log** (`strip-M1-log`) | The bar's content is replaced; "Logged… Today 398" rises 14 px (+48 ms); the day total counts 398 → 483 → 802 over 650 ms; the You icon bounces. Meanwhile the steppers in the list shrink away. | **No.** The plate doesn't go anywhere; the You tab bounces by itself. The count-up rolls from the old day total, which the user never saw, to the new one. | No. | Count-up and icon bounce are dashboard clichés. |
| **Undo** (`strip-M1-undo`) | The day total counts back down, invisibly, because the receipt is replaced at 60% of the count. The bar empties for one frame (+398 ms), then the plate rises back. | No. | Mirrors Log in timing only. | Generic. |
| **Meal tab** (`strip-M1-mealtab`) | The underline travels (good). The list slides 28 px from the tab's side while fading from 0, showing Halls through it (bug 2). | Direction is right: left or right by tab order. | Weak horizontal-pager hint. | Underline in gold: identity. Slide-fade: generic. |
| **Station switcher** (`strip-M1-station`) | The tinted pill turns maroon; a white list drops 12 px and fades in over a scrim (+96 to +398). Picking jumps the list (native speed); the pill name rolls; the landed title flashes tint for 900 ms. | The dropdown comes from the pill, which is right in principle. But it is a floating chalk card with a drop shadow, not part of the header it sits under. | No. A different surface from the header it extends. | Generic: a tinted capsule and a web dropdown. The flash is a third "you are here" signal after the pill name and the scroll. |
| **Dish detail** (`strip-M1-detail`) | A full-width chalk sheet slides up from the bottom of the screen. The row you tapped (y ≈ 245) has no part in it. | **No.** The sheet comes from the screen edge, not the row. | No. The one place a container transform would be obvious (row → detail) uses a stock sheet. | Generic sheet. The label panel inside is on-identity. |
| **Ingredients expand** (`strip-M1-ingredients`) | `max-height` grows below the fold; nothing visible moves (+0 ms on). | Local and honest. | Fine. | Fine. |
| **Tab switch** (`strip-M1-tabs`) | The new tab fades up 6 px (+99 ms); the indicator slides. Returning to Halls replays every busy meter's fill-in (+601 ms: all meters empty again). | Tabs are peers, so nothing should travel. The fade-up implies "this rose from below", which is false. | No. | Generic. The meter replay is pure decoration. |
| **Typing in Search** (`strip-M1-typing`) | The events band fades and collapses on the first keystroke; surviving rows glide (FLIP, good); new rows fade up 6 px, leaving blank holes for 100–200 ms (+201 ms: empty list with the custom-food button floating at the bottom). | FLIP rows: yes. New rows: no. | Partly. | FLIP is honest. The fade-up holes read as lag. |
| **Lens chip** (`strip-M1-lens`) | The chip fills maroon. **Then the events band disappears and everything jumps up 190 px** (+202 ms), including the chip row you just tapped. | No. The control moves out from under your finger. | No. | Generic filter chips (8 px rounded outline buttons). |
| **Events carousel** (`strip-M1-events`) | Native snap (real speed). A card tap pushes an event page in from the right (+801 ms). | **No.** The banner you tapped doesn't become the page's banner, although it's the same image. | No. iOS push. | The flyers are UMass's own clip-art graphics (purple and orange Halloween, cartoon eggs). The white ring and gold stitch try to make them patches, but the content fights the palette. A horizontal flyer carousel is App Store furniture, and it stacks a second sideways scroller under the lens chips. |
| **Café detail** (`strip-M1-cafe`) | iOS push from the right (+42 to +200 ms). | No. The café row you tapped is irrelevant. | No. | Generic. |
| **Busy meter appearing** (`strip-M1-busy`) | Five segments grow from the bottom with a 40 ms stagger every time Halls renders, including on every tab return. | It shows nothing arriving; the data didn't change. | No. | Decoration. |
| **Hall open** (`strip-M1-open`) | The tapped band's window expands into the header; the letter, name, hours and busy row travel by FLIP; colour develops; Halls dims as one unit. | **Yes.** The only motion in M1 that shows where something came from. | It *is* the model. | Identity. |
| | **The one inconsistency:** the meal tabs and menu body rise from the bottom of the screen (+39 to +198), a second source competing with the band. The body should come out of the band. | | | |
| **Hall close** (`strip-M1-close`) | The exact mirror. | Yes. | Yes. | Identity. |
| **Collapse** (`strip-M1-collapse`) | Scroll-scrubbed: photo to solid maroon, the name shrinks into the bar. Real speed. | Yes. Continuous with open. | Yes. | Identity. |
| **Close from collapsed** (`strip-M1-closecollapsed`) | Scrubs to top, then reverses the open. | Yes. | Yes. | Identity. |

## Decoration: animations that say nothing

These should go:
- **Number rolls** on the plate bar's item count, calories and protein, on the stepper quantity, on the Nutrition Facts totals in the sheet, and on the station pill name. Mid-roll they're unreadable (`add2`, +31 ms).
- **Bar bump** (4 px up and down on every add).
- **You-tab icon bounce** on Log.
- **Day-total count-up and count-down** (650 ms of counting from a number the user didn't see).
- **Row tint flash** on add (650 ms).
- **Busy meter, typical-day curve and healthfulness bar fill-ins**, replayed on every render.
- **Landed-station title flash** (900 ms).
- **Tab content fade-up** (6 px).
- **The `release` overshoot** (`cubic-bezier(.34,1.56,…)`) on every button release, on `+` popping back, on checkbox pops and on the ranking card pulse. It makes the whole app springy in a way the felt-and-scoreboard identity is not.
- **Search's fade-up of new rows** (6 px translate). The fade alone would do.

## The newer elements: do they belong?

- **Busy meter (bands and header).** Five gold segments and a word: compact, and it reads. It is the closest of the additions to the identity, because it looks like a scoreboard lamp bank. What's wrong is only its motion (the fill-in replay) and that its sibling, the curve, speaks a different language.
- **Typical-day curve.** A Google-popular-times bar chart: 17 thin, translucent white bars, a gold "now" bar, gold-outlined forecast bars. It's the most generic object in the header, and it made the header 26 px taller, which pushes Golden BBQ below the fold.
  - It also repeats the "Calmer around 1:30 PM" line directly above it.
  - Its forecast bars (gold outlines) and the meter's lit segments (gold fills) are two different encodings of the same busy value, side by side.
- **Dietary badges.** Rows carry a green leaf glyph, a colour outside the palette. Detail uses maroon outlined pills, the stock web "tag" component.
  - The app already has a tag system: the 20 px hall-letter squares on search rows (W F H B), in Oswald. The leaf ignores it.
  - Nothing echoes the chenille-and-stitch material of the hall letters.
- **Grades.** Healthfulness uses 7 green bars; Carbon uses an A–E row in UMass's green-to-grey icon colours with a 1.12× scaled current tile. These are two more palettes and two more glyph systems inside one sheet. The label panel above them is the strongest on-identity component in the app, and the grades sit outside it as loose rows.
- **Allergen "Contains" block.** A tinted callout with a maroon left rule: a generic alert pattern from documentation sites. It should be part of the label's rule system.
- **Station switcher pill.** A tinted capsule floating on a chalk strip under the maroon meal tabs. The header system (photo → maroon bar → meal tabs) stops, then a chalk strip with a different control shape starts. The dropdown is a white card with a drop shadow. Nothing about it is varsity.
- **Events carousel.** See the table above. Third-party flyers in a sideways scroller, on a band that disappears and shoves the lens chips 190 px when you touch a chip.
- **Dish detail sheet.** Contents are good (FDA label, marks, grades, ingredients). The container is the generic part: it slides up from the screen edge, unrelated to the row.
- **Label panel and plate Full label.** On-identity: Oswald numerals, heavy rules, real FDA structure. Keep as is.

## Where the grid and type scale slip

- Station pill: Oswald 19 px. Header names: Oswald 32/40 px. Section titles: Oswald 22 px. The pill introduces a fourth size for the same "station name" role that the in-list titles show at 22 px.
- Grades sit in a 112 px label column that aligns with nothing else; every other row in the app is name left, value right.
- Event captions use 15 px semibold white, and their gold date is Oswald 15 px. Elsewhere, dates on maroon are Libre Franklin 15 px (Halls header "Thursday, October 8").
- Chips are 44 px with an 8 px radius, the station pill is 40 px with a 20 px radius, buttons are 52 px with an 8 px radius, and tags are 20 px with a 4 px radius. Four corner treatments for controls in one screen.

## Top findings

1. **Only the hall transition has a spatial model, and nothing else uses it.** Detail, pages, the plate sheet and events all enter from screen edges, unrelated to what was tapped.
2. **A dish never goes anywhere.** Add, quantity, remove, Log and Undo are all answered by rolls, bumps and a bouncing icon. Nothing shows the dish entering the plate or the plate entering the day.
3. **The plate sheet replaces the object you grabbed.** The maroon bar under your finger vanishes, a chalk sheet arrives from below, and the tap-to-open path is broken outright (bug 1).
4. **About ten animations are pure decoration,** listed above. The `release` overshoot alone touches every control.
5. **The round-4 elements are generic components in maroon:** pill, chips, popular-times chart, callout, flyer carousel. The identity has its own versions of each (stitched patch, header row, scoreboard lamps, label rules, a fixture list), and none of them were used.
6. **Two layout jumps under the finger:** the add re-wraps the row name, and a lens chip tap shoves the chip row 190 px.
