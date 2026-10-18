# M2 concept (round 2): established conventions, nothing invented

Round 1 grew things out of literal edges; the meal tabs, for example, unfolded from the bottom of a hall band. Real
apps don't do that. M2 now uses only the motion of the owner's references, **Apple's App Store and Music cards
(the iOS 18 zoom transition) and Google's Material 3**. Each motion has one job.

## The vocabulary

| What happens | Convention | What moves |
|---|---|---|
| A card opens a screen: hall band → hall, Search row → hall, dish row → detail, café / area / event / You row → page, pin → café | **Container transform** (M3) / **zoom** (iOS) | The tapped card's rect grows to the destination's. The hall photo is the shared element and stays continuous. The card's own content fades out over the first 30%. The destination's content (header, meal tabs, station row, list) fades in over the last 70%, **already in its final layout**, riding the container's top edge (event cards, round 5b: the page lies still, its maroon bar and band are the card's ground grown, the framed banner is the one thing that travels, and content fades in where it ends up; NOTES "Round 5b"). Nothing slides out of an edge. The screen behind stays put under a 32% scrim. |
| Back / close | **The same frames reversed**, and **interactive** | Drag down from the top, or swipe in from the left edge: the screen shrinks toward its card under the finger. Release past the commit point (or flick) to finish; otherwise it springs back. A dragged-away dish detail returns to its row. |
| Halls ⇄ Search ⇄ You | **Fade through, overlapped** (round 3) | The old tab stays drawn; the new one fades in over it in 250 ms, settling from 97% scale. Nothing dips to the white ground. No slide. A hall screen fades with the tab that owns it. |
| Breakfast ⇄ Lunch ⇄ Dinner | **Shared axis X** | Both lists slide 30 px in the direction of the tab, with the same fade through, and the gold underline moves. |
| Plate, station list | **Bottom sheet** | It rises from the bottom, drags between detents, and rubber-bands. The plate bar is the plate sheet's handle, like Music's mini-player. |
| `+`, quantity, Log, Undo | **In place** | `+` widens into the stepper. The bar's numbers just change. The Log receipt is a snackbar with Undo in the bar's place. The "+62 travels" toss is cut: neither reference has it, and it read as decoration. |
| Everything else | In place | Chips fill, the underline moves, ingredients open. Reduced motion turns every movement into a crossfade. |

## Tokens (values are Material Components' own; sources in NOTES)

| Token | Value |
|---|---|
| `cont` | 500 ms (`motionDurationLong2`), M3 **emphasized** easing (the two-segment path, not a cubic-bezier) |
| `contBack` | 400 ms (`motionDurationMedium4`), same easing, the same frames reversed |
| `fadeThrough` | round 3: 250 ms (`motionDurationMedium1`), standard decelerate, overlapped (no 0.35 dip), start scale 0.97 |
| `sharedX` | 450 ms, emphasized, 30 dp, fade through at 0.35 |
| `settle` | 200 ms, M3 standard `cubic-bezier(.2,0,0,1)` |
| `exit` | 150 ms, emphasized accelerate `cubic-bezier(.3,0,.8,.2)` |
| scrim | black at 32% (`MaterialContainerTransform`'s default) |
| drag back | the full gesture is 480 px; it commits below p = 0.82 or on a flick over 0.5 px/ms |
| sheets | spring k 300, ζ 0.84, carrying the release velocity |

The **30% / 70% fade split** is the coordinator's specification. MDC's own default fades the incoming view over the first 25% (`FADE_MODE_IN`).

## What else changed

- **Hall-header search button removed.** Search lives in the Search tab only.
- **Places are first-class in Search.** Every hall, Grab 'N Go and café that matches by name, building, area or menu item is shown, with live status. A row grows into its hall or café.
- **Where and when** (round 4).
  - A dish row carries W F H B with the halls serving it now filled.
  - Its detail has a Today / Tomorrow grid of halls against meals: maroon is served, gold is now. A filled cell returns the detail to its row, and the row grows into that hall at that meal and day, scrolled to the dish.
  - Dishes not served now appear under "Later today and tomorrow".
- **Pinned cafés** (round 4).
  - The café page has a pin in its top bar.
  - Pinned cafés stack under the hall bands as full-bleed strips half a band tall. Each uses UMass Dining's own location photo with a neutral grade, live status, and no varsity letter.
  - They open by container transform with the photo continuous into the café page header.
- **Events** (round 4). A row of banner cards in the felt-and-stitch frame sits in Search's idle state. A card opens by container transform with the banner continuous. With no pins, Halls is unchanged. Pins live on the device. The full café browser stays under Cafés & markets.

## Round 5: one rack, one voice

**Halls is a rack of photo bands that answers "where can I eat, now".**
- **One band, two sizes.**
  - A hall band is full scale: 112 px, maroon duotone, chenille letter, Oswald 32 name, 15 px status.
  - A pinned café is the same band at three-quarter scale: 84 px, Oswald 24, 14 px status.
  - The café has its own photo in full colour under the halls' deep-maroon left gradient, and no letter, because it isn't a varsity hall.
- **One seam.** Every band, header included, is separated by 1 px of deep maroon, never chalk. The rack reads as one object from "Lunch" down.
- **Below the rack**, the chalk list browses everything else.

**Where you can get a dish is said the way the header says the meal.**
- The header leads with "Lunch", so time is the app's first axis. Every *where* answer is a meal, a clock time and the hall's own name.
- It is the band's sentence turned around. The band says "Worcester, open until midnight"; a dish says "Lunch now, until 4 PM" over the halls serving it.
- Halls appear by their chenille letter in felt, on a deep-maroon tag with the name. That is the same pairing as the band, at button size. Tapping one is the existing move: the detail returns to its row, and the row grows into that hall at that meal, scrolled to the dish.
- **The order of answers:**
  1. now;
  2. otherwise the next serving today ("Dinner from 4:30 PM");
  3. otherwise tomorrow ("Tomorrow, lunch from 11 AM");
  4. otherwise a plain "Not on the menu again today or tomorrow".
- At most two lines of answer: the first one, plus a later serving only when it's at a hall the first line doesn't already name.
- **Search rows say the same thing in short.**
  - Under "Lunch now", only the halls serving it, as filled letters.
  - Under "Later today and tomorrow", the meal in words ("Dinner", "Tomorrow lunch") before the letters.
  - Empty outlined letters are gone: a row says where, never where not.

**Cut by this idea:**
- the halls × meals grid and its Today / Tomorrow switch;
- gold-as-"now" cells;
- the outlined empty letters;
- the café strips' neutral grade and half height;
- the chalk seams;
- the carousel's double end gutter.

Motion is unchanged: chips and lines arrive with the detail (container transform), and nothing new moves.

## Motion vocabulary (round 7, the owner's decision; supersedes round 6 and the tables above where they differ)

Which convention applies depends on what the student touched and where they're going.

| Touched | Convention | Where |
|---|---|---|
| A photo band on Halls | **Expanding card** (container transform): the band grows into its location page. Back, drag down and edge swipe play it in reverse. | The four hall bands, and pinned café bands. Nothing else. |
| Anything else that goes somewhere | **Push** (iOS navigation). The new screen slides in from the right edge. The old one shifts left by 30% and dims to 10%. Back, or an edge swipe that tracks the finger 1:1, reverses it. There is no drag-down. | Event cards (Search), the event note in a hall, Search results (halls, Grab 'N Go, cafés), café rows in Cafés & markets, the area rows under it, You rows, a dish's "where it's served" |
| A dish | **Sheet**. It rises from the bottom edge over the list, which stays where it was. It has a grabber, a drag that follows the finger, and a tap on the dimmed backdrop to dismiss. | Search rows (now and later), hall menu rows, plate rows |
| A control that asks for something | **Sheet** (unchanged) | Plate bar, station switcher, Full label, Add custom food |
| Peers | **Fade through** (tabs), **shared axis X** (meals) | Halls / Search / You, the meal tabs |
| A value | **In place** | `+`/stepper, Log/Undo, chips, ingredients, collapse |

**Expanding card.** The band is a window into its page's header photo, offset so the pixels line up.
- The window grows to the screen and the page hangs from the photo.
- The duotone develops into colour.
- The band's text rides on the photo and fades over 0–.3. The page's content fades in over .3–1, where it ends up.
- A pinned café now works exactly like a hall, because it is the same object at ¾ scale: same grade, same header, same collapse.

**Push.**
- Timed by `cont` (in, 500 ms) and `contBack` (out, 400 ms). The easing is the one new token (`MO.push.e`, below). Shift, dim and commit are its geometry.
- The tab bar and the plate bar never move.
- The incoming screen casts a soft left-edge shadow only while it moves.
- An edge swipe released past half the width, or flicked, pops. Otherwise the screen springs back.
- Each pushed screen covers exactly one layer: the tab, the hall screen, a page, or a frozen copy of the hall screen when one hall is pushed over another.

**The dish sheet.**
- **It rests at a height chosen per dish.** The rest shows the name, the favourite star, the serving and marks, Contains, Add to plate, where it's served, and the label through its Calories rule. Scrolling or dragging up takes it to full height, and the name stays pinned at the top.
- **Where it's served is a navigation.**
  - The sheet goes down. Once it's half-way out, the hall is pushed in, already scrolled to the dish (one motion, not a slide and then a scroll).
  - From the plate, both sheets go.
  - Inside the same hall and day, nothing is pushed: the sheet goes away and the list brings the dish up, switching the meal tab first if it needs to.
- **Add to plate.** The sheet goes down. The row's `+` becomes the stepper and the bar updates, in view.

**Spacing scale in the sheet:**
- 4 inside a line group (name → serving);
- 8 between the parts of a group (serving → marks → Contains, a "where" heading → its halls);
- 16 before the action;
- 24 between groups (Add → where → label → ingredients);
- 12 between the label and its ratings panel.

**Tokens.**
- `cont`/`contBack`, the 32% scrim, sheets' spring k 300 ζ .84 and `dragBack` are unchanged.
- New: `push: {e: cubic-bezier(.32,.72,0,1), shift:.3, dim:.1, commit:.5}`.
  - The easing is new because no existing one fits a full-width slide. Measured on a 390 px push, emphasized crawls for 50 ms and then whips 250 px in 67 ms (3.7 px/ms), which reads as a jump.
  - The replacement is Ionic's published iOS page-transition curve. It moves from the first frame, with no crawl.
- **Reduced motion:** a push and a sheet each crossfade in place (120 ms). Sheet → hall is one crossfade, not two in sequence.

## Marks and scores (round 8)

- **Four badge families on a dish row.** Each is told apart by material and silhouette:
  - Diet: a gold felt patch with a pictogram. Plant based is a sprout, vegetarian a single leaf.
  - Halls: chenille letters, a maroon square with a gold letter, always last.
  - Healthfulness and carbon (round 8b): tiles in the official app's family, a portrait rounded tile with a white pictogram
    and the value in ink. Carbon uses UMass's A–E colours and footprint; healthfulness a heart on a blue 0–7 ramp. Scored
    means the feed's H0–H7 / CR code.
- **Scores are opt-in** (You, "Show on dishes"), device-local, and off by default. They appear on hall and Search rows and in
  the sheet's patch row. The ratings panel always shows.
- **Missing data draws nothing.**
- **The meta line is groups** (numbers | scores) that wrap whole, with a 12 px rhythm.
- **Search's hall letters sit under the +**, so a row has the same shape with the toggles on or off.
- **The ratings panel is its own box.** One 1 px rule between its ratings, and no thick bar.

Details and reasoning: NOTES "Round 8".

## Round 9: the place and its day (concept, before build)

Critique: `CRITIQUE-r9.md`. Motion: nothing new. Each interaction below names the existing pattern it uses.

**The idea.** A hall page answers in reading order.
- **Where** is the place on top: the photo, the name and the status line.
- **When** and **what** are the maroon rows pinned under it, read left to right and top down: day, meal, station, then the
  list. The day is a new cell at the start of the row that already holds the meals, so no row is added.
- **The hall's schedule.** The two "when and where" statements in the header, the status line and the day, open one object:
  the hall's schedule, a sheet that is the station switcher's twin. It holds where the hall is (address, Directions) and when
  it serves (the chosen day's hours meal by meal, and the fifteen days to choose from).
- **Freshness is part of *when*,** so it is said only where *when* is said: Halls' date line, and the schedule's day rows.
  Anything live that can't be had simply isn't drawn. That's M2's existing "missing data draws nothing".

```
 Hall, expanded (390)                       Hall, collapsed
┌────────────────────────────────────────┐ ┌────────────────────────────────────────┐
│ ‹                              ┌─────┐ │ │ ‹  Worcester                           │ bar
│        photo, full colour      │  W  │ │ ├─────────┬──────────────────────────────┤
│                                │     │ │ │ Fri 9 ⌄ │ Breakfast  Lunch  Dinner  La…│ day | meals (scroll)
│ Worcester                      └─────┘ │ │         │            ‾‾‾‾‾             │
│ Open until midnight ⌄                  │ ├─────────┴──────────────────────────────┤
│ ▮▮▮▮▮ Busy                             │ │ Grill Station ⌄                        │ station
│ Calmer around 1:30 PM                  │ └────────────────────────────────────────┘
│ ▁▂▃▅█▅▃▂▁▂▃▅▆▅▃▂▁   (live only)        │   148 px + status bar, as in round 8b
├─────────┬──────────────────────────────┤
│ Today ⌄ │ Breakfast  Lunch  Dinner  La…│  the day cell is pinned; only the meals scroll
│         │            ‾‾‾‾‾             │
├─────────┴──────────────────────────────┤
│ Soups ⌄                                │
└────────────────────────────────────────┘

 The schedule (sheet; opened from "Open until midnight ⌄" or "Today ⌄")
┌────────────────────────────────────────┐
│                 ────                   │
│ Worcester                              │
│ 667 N Pleasant St         [Directions] │
│────────────────────────────────────────│
│ Today                 7 AM to midnight │  the chosen day: its span, then each meal posted that day
│   Breakfast                 7 to 11 AM │
│   Lunch               11 AM to 4:30 PM │
│   Dinner                  4:30 to 9 PM │
│   Late night          9 PM to midnight │
│   Grab 'N Go              7 AM to 8 PM │
│────────────────────────────────────────│
│ Friday, October 9                      │  a row picks that day
│ Saturday, October 10       No menu yet │
│ Sunday, October 11                     │
│ …                                      │
│ Thursday, October 22                   │
└────────────────────────────────────────┘

 Café with dishes (Green Fields)            Single-meal café (Worcester Café), collapsed
┌────────────────────────────────────────┐ ┌────────────────────────────────────────┐
│ ‹                                [pin] │ │ ‹  Worcester Café                [pin] │
│    photo, own colour, maroon gradient  │ ├─────────┬──────────────────────────────┤
│ Green Fields                           │ │ Today ⌄ │ Breakfast Entrees ⌄          │ day leads the station row
│ Open until 9 PM ⌄                      │ └─────────┴──────────────────────────────┘
├─────────┬──────────────────────────────┤
│ Today ⌄ │ Lunch   Dinner               │
│         │ ‾‾‾‾‾                        │
├─────────┴──────────────────────────────┤
│ Salad Bar/Dressings ⌄                  │
├────────────────────────────────────────┤
│ Hiding 9 that list peanuts    Show all │  only with preferences on
│ Salad Bar/Dressings                    │
│ Buffalo Chicken Salad                  │
│ 576 cal  22.7g protein  [2][B]       + │
└────────────────────────────────────────┘
```

### 1. The day control
- **The day cell.**
  - It is gold Oswald with a chevron (the station switcher's material: gold plus chevron opens a sheet). It reads "Today",
    then "Fri 9", "Sat 10" and so on.
  - It leads the meal-tab row in both header states. Only the meals to its right scroll horizontally (Material's scrollable
    tabs), which fixes the 360 px overflow. The selected meal is scrolled into view with the `scroll` token.
  - The cell also keeps the tab scroller about 90 px from the 24 px back-swipe edge.
- **Picking a day.**
  - The cell opens the schedule. Tapping a day row uses the station-sheet pattern: the sheet goes away (`Sheet.away`), and
    once it's half-way out, the list and the tab labels **fade through** (`fadeThrough`, overlapped). The gold underline
    settles in place (`settle`).
  - It is deliberately *not* shared axis X, which belongs to the meals. A day change and a meal change never look alike.
  - The scroll clamps to the collapsed header, as a meal switch does.
  - The meal is kept if that day has it, otherwise the meal at the clock, otherwise the day's first.
- **The day is said once.** `.tday` ("Worcester tomorrow") and the "Tomorrow, Friday" status line are deleted.
  - On another day the status line gives that day's span ("7 AM to midnight ⌄"), and the header takes its still layout.
  - Rows have no + on other days, as tomorrow's do now.
  - The sheet's "where it's served" lands on its day with the cell set.
- **A day with no menu.** The tab row holds the day cell alone, the station row is empty ground, and the list reads "No menu
  posted for Saturday, October 10 yet." The schedule row says the same in short: "No menu yet". That is true at the fixed clock for Oct 10, for weekend cafés and for Oct 19 on.
- **Events move to their day.** The "Indigenous Peoples Day" note shows on Monday Oct 12's list, not on today's. In the
  schedule, Oct 12's row shows that event in place of the snapshot windows, which are knowingly wrong for a holiday.

### 2. Today's hours and directions: the schedule
- **Two ways in, one sheet.**
  - The status line gains the switcher's chevron ("Open until midnight ⌄") and becomes a button. It's tappable in the
    expanded header.
  - The day cell is tappable in both states.
  - Both use the bottom sheet in `#isheet`, the same sheet as the station switcher and the Full label.
- **The top of the sheet is where.**
  - The name, the street address (`parseStreetAddress`) and a **Directions** button.
  - Directions hands `map_address` to the phone's maps app (`geo:` on Android, Apple Maps on iOS) with the place's name as
    the label. The app plays no motion of its own.
  - Cafés add their description, building and Payment here. Those leave the café's page body.
- **Then when.**
  - The chosen day is expanded: its span, then each meal *posted that day* with its window. Grab 'N Go has its own hours.
  - The other days are one row each, in date order. A day with no menu says "No menu yet".
  - The live "Open until…" stays in the header, not in the sheet.

### 3. Allergens in Dietary preferences
- **The page.** Dietary preferences (pushed from You, as now) has two groups of the existing check rows:
  - "Only show": Vegetarian, Plant based, Halal;
  - "Avoid": the feed's 11 allergens, normalized. The order is milk, eggs, fish, shellfish, tree nuts, peanuts, wheat, soy,
    sesame, then gluten and corn.
  - The You row summarizes both ("Vegetarian, no peanuts"). Toggles use the existing settle fill.
- **The line.** There is one line for both groups, at the top of the list after an event note. It says what was hidden, never
  that what's left is safe, because 787 dishes list no allergens at all. For example: "Vegetarian dishes, hiding 9 that list
  peanuts" + **Show all**. A vegetarian mark is positive data, so diet keeps its clause.
- **Show all no longer edits the preference.**
  - It reveals what this list hid, across meal and day changes, until the hall or café closes (or Search is cleared). The line
    then reads "Showing all dishes" + **Hide them**.
  - Arriving at a hidden dish (from the sheet's "where", or a plate row's sheet) opens that list already revealed, with the row
    marked. `toDish` never lands on a missing row.
  - A revealed row that contains an avoided allergen leads its meta line with "Contains peanuts" in maroon. A non-vegetarian
    row needs no mark: it simply lacks the leaf.
  - In place, using the existing list re-draw with the `settle` fade.
- **On the sheet.** The Contains line sets the avoided allergens in bold.
- **"Everywhere"** means every dish list: hall and café menus, and Search's now and later rows (the same line at the top of
  the results). It does not cover the plate (you chose those dishes), the sheet's "where", or the ratings.

### 4. Loading, offline with cache, failed (`?net=slow|offline|fail`)
- **What can be missing:**
  - photos, names and letters are bundled and never fail;
  - hours are cached for the day;
  - busy is live and is never shown stale;
  - menus are cached per hall per day.
- **Halls.**
  - *Loading:* the rack is whole. The status and busy lines arrive in place (`settle`). There are no skeletons and no spinner.
  - *Offline:* bands keep their cached status but draw no busy meter. The header's date line ("Thursday, October 8") reads
    "Offline". No photo is dimmed.
  - *Failed, nothing cached:* bands show name and letter only. The date line reads "Couldn't reach UMass Dining", with a gold
    **Try again** button under it, in place.
- **A hall or café.**
  - *Loading:* the header and the status line are drawn (from hours). The tab row holds the day cell alone. When the menu
    arrives, the tab and station labels fade in where they end up (round 6's rule: those rows are ground, and only their
    labels fade), and the list fades with them.
  - *Offline:* today's saved menu is identical to online, in the header's still layout (no busy, no board). In the schedule,
    unsaved days say "Not saved". Picking one shows "You're offline, and Friday's menu isn't saved on this phone." It loads
    by itself when the connection returns.
  - *Failed:* "Worcester's lunch menu didn't load." with a **Try again** button.

### 5. Cafés with dishes
- **The same screen as a hall.** `#menu.cafe` only drops the letter, the busy row and the board.
  - It gets the day cell, meal tabs from the feed, the station row, rows with scores and +, and the dish sheet.
  - A single-meal café ("daily offerings", shown as "All day") has no tab row. The day cell leads the station row instead.
  - Opening is unchanged: a container transform from a pinned band, a push from a row.
- **Which meal is now.** The standard windows are clamped to the café's own hours. "All day" is the café's hours.
- **Plates.**
  - A café is its own place key. A café plate never joins a hall plate, not even for a dish with the same name. The second
    plate uses the existing split and dots.
  - The label is "Green Fields lunch". An All day plate takes the meal at the clock ("Worcester Café lunch").
- **Cafés with no dish menu** keep today's body (a names list, or "doesn't list its menu" + Add a custom food) and no pinned
  rows. The status line still opens the schedule, without day rows.

### 6. Price
- **Sheet only**, leading the serving line under the name (4 px): "$7.50" in Oswald (the figure family), then "1 each" in
  slate.
- **Keyed to the serving's place, not the surface.** A café serving shows its price wherever the sheet is opened from: the café
  list, the plate, or Search. A hall serving never does, which settles the one priced hall dish.
- Rows never show a price.

### Motion, round 9 (all existing)
| Interaction | Pattern |
|---|---|
| Status line or day cell → the schedule | Bottom sheet (`#isheet`, station switcher's) |
| Pick a day | Station-sheet pattern: `Sheet.away`; at half-way out, the list and tab labels **fade through** |
| Directions | Hand-off to the OS; no motion of ours |
| Tabs row overflow | Native horizontal scroll; selected tab brought in with `scroll` |
| Show all / Hide them, allergen toggles | In place (`settle`) |
| Status, busy or menu arriving; Try again | In place: labels fade in where they end up (`settle`) |
| Café open, dish sheet, add, second plate | Unchanged |

### Open (for the owner; recommendations in the round-9 hand-off)
Cafés in Search and in "where"; blank allergens; what "everywhere" covers; how long Show all lasts; the allergen order;
prices in station names; weekend fallback to the names list; Terrace and Charles River; café hours on other days; Berkshire's
Oct 9 breakfast; Oct 12 holiday hours; the loading indicator; "All day"; the 12:40 vs 12:41 clock.

### Round 9, as built (where the build departed from the concept above; NOTES "Round 9")
- **Day change.** It is a sequential fade through (out in place over the first 35%, then in), not the overlapped tabs
  variant. The overlapped version double-exposed two lists for about 100 ms. Grounds stay, the header never moves, and
  the whole day cell and station button fade.
- **The line** reads "Hiding 20 dishes that list milk" (or "Showing vegetarian dishes, hiding 9 that list peanuts"). Show
  all becomes "Showing all dishes" + Hide them.
- **Failed on Halls** reads "Couldn't connect" + Try again. At 360 px "Couldn't reach UMass Dining" touched the title.
- **The status line and the busy row keep their room** when empty, so the name never moves between days or states.
- **Search's café dishes** are their own group, "At cafés", shown once something is typed or a lens is on. Places no
  longer matches a café with dishes by its old names list.
- **A menu-less café** keeps its description in the body (its schedule has no day rows).
- **Directions** opens a maps https link (Apple Maps on iOS, Google Maps elsewhere) carrying `map_address`, not a `geo:` URI.
  A web prototype can't open `geo:`.
- **The schedule** scrolls itself on a late chosen day, so that day is on screen at rest. NOTES "Open" has the trade-off.
- **Pass 4.**
  - The scrolling tabs fade 24 px into the row's maroon on a side with more to scroll.
  - Empty days say "No menu posted" (no "yet").
  - Oct 12's schedule row is a row titled "Indigenous Peoples Day Hours" that pushes the event.
  - Halls' Try again is an outlined 44 px button.
  - A day change never repaints the photo, letter or name.
- **Round 9b (owner).**
  - Terrace is a Southwest café (Fieldstone Apartments) with its UMass photo and a dish menu.
  - The Charles River Campus (Newton) appears only while You's "Campus: Charles River Campus" toggle is on. When on, it adds
    an area group last in Cafés & markets, its page, Search and "where", its own plates, the schedule and pinning. When
    off, it appears nowhere; its pins and plates are kept and come back with it.
  - UMass publishes no photo of it, so its band and page header are the band's own maroon ground, and its list rows have no
    thumbnail, as the halls' Search rows have none.

## Round 10: a menu that can keep a ledger (concept, before build)

Critique: `CRITIQUE-r10.md`. Motion: nothing new (table at the end).

**The idea.** UDine is always a menu, and it can also keep a ledger.
- **The menu** never waits and never changes shape: halls, cafés, Search, and dish sheets with nutrition and scores.
- **The ledger** is everything that records what you ate: the +, the plate, Log, your days, the bowl builder, and
  writing to Health. It is one switch, **Track what I eat**.
- **You** is that switch, the ledger it opens, and the few choices that shape the menu: diet, allergens, scores, campus.
- **First run is You's choices, shown once, over the open menu.**

Everything else follows from treating a meal as a plate:
- a logged meal is a plate that was logged, so a past meal opens as plate rows with the same steppers;
- a bowl is one plate item made of plate items.

```
 First run (390): a non-modal sheet         Scrolled up
┌────────────────────────────────────────┐ ┌────────────────────────────────────────┐
│ UDine            Thursday, October 8   │ │ ──── You                       Done    │
│ Lunch                                  │ │ Only show                              │
├────────────────────────────────────────┤ │ Vegetarian                         [ ] │
│ Worcester               ▐ W ▌ (live)   │ │ Plant based                        [ ] │
├────────────────────────────────────────┤ │ Halal                              [ ] │
│ Franklin                ▐ F ▌ (live)   │ │ Avoid                                  │
├────────────────────────────────────────┤ │ Milk                               [ ] │
│ Hampshire               ▐ H ▌ (live)   │ │ Eggs                               [ ] │
├────────────────────────────────────────┤ │ …  (the 11 allergens)                  │
│ Berkshire               ▐ B ▌ (live)   │ │ Show on dishes                         │
╞═══════════════ ──── ═══════════════════╡ │ [5] Healthfulness                  [ ] │
│ You                              Done  │ │ [B] Carbon rating                  [ ] │
│ Track what I eat                   [x] │ │                                        │
│ Calories, protein, carbs and fat       │ │                                        │
└────────────────────────────────────────┘ └────────────────────────────────────────┘
  the four bands stay tappable: a tap puts the sheet away (choices kept) and opens the hall
```

### 1. First run
- **Where.** On first launch, Halls opens as always. You's choices rise as a **non-modal bottom sheet**: no backdrop, and
  its resting top sits just under the four hall bands, so all four stay visible and live.
  - Tapping a band puts the sheet away (`Sheet.away`) and opens that hall by the container transform. That's one tap to
    a menu, as on any later launch.
  - A pinned café band or the café list is reached by dragging the sheet down.
- **What.** It holds You's own controls, in You's order and with You's check rows. There is one control per setting
  everywhere; nothing is a duplicate built for onboarding.
  1. **Track what I eat**, with the line "Calories, protein, carbs and fat". It's the one choice that changes the app's
     shape, so it's first, and it's at rest.
  2. **Only show:** Vegetarian, Plant based, Halal.
  3. **Avoid:** the 11 allergens, in round 9's order.
  4. **Show on dishes:** Healthfulness and Carbon rating. Each row leads with its own tile (a "5" heart, a "B"
     footprint), the badge it turns on, so the choice shows itself without a caption.
- **Done** is a text button in the sheet's title row.
- **It's shown once.** Done, dragging it away, or opening a hall all count as done, with the current choices kept. It never comes back. Everything stays on You.
- **Why not a carousel.** A 3-page carousel costs three taps before the menu, at a hall door. This sheet costs zero:
  the menu is already there and usable. And it teaches where the settings live, because it *is* You's settings.

### 2. Tracking off: a pure menu app
- **Gone:**
  - the + and steppers on every row, and the ghost + that marks a second plate;
  - the plate bar, the plate sheet and the Log receipt;
  - "Add to plate" in the sheet;
  - "Add “x” as a custom food" in Search and on a menu-less café;
  - the bowl builder (a build station's dishes are just dishes);
  - the Health row;
  - You's day block and your days.
- **Kept:** halls, cafés, Search, events, the schedule, and dish sheets with marks, scores, Contains, price, where it's
  served, the label and the ratings.
- **Shape.**
  - A hall row's lane is empty and the row keeps its height, so a list never reflows when the switch changes.
  - In Search the lane loses its + and the hall letters rise into the + slot (top right).
  - In the sheet, "where it's served" takes the action's place, 16 px after the identity group, so it is the sheet's
    primary action: it opens a hall at a meal.
- **Off sets aside; on restores.** A plate in progress and every logged day are kept, the way the Charles River toggle
  keeps its plates. Turning tracking back on brings back the plate, the days and the Health row exactly as they were.
- The switch fades its consequences in place (`settle`): lanes empty, the bar leaves by its own `exit`.

```
 You, tracking on                           You, tracking off
┌────────────────────────────────────────┐ ┌────────────────────────────────────────┐
│ Thursday, October 8                    │ │ UDine                                  │
│ Today                                  │ │ You                                    │
├────────────────────────────────────────┤ ├────────────────────────────────────────┤
│ Calories                         1,201 │ │ Track what I eat                   [ ] │
│ Protein 70.4g  Carbs 120g  Fat 41g     │ │ Calories, protein, carbs and fat       │
│ Meals                                  │ │ Favorites                      2 dishes│
│ Breakfast at Worcester  8:42 AM   398 ›│ │ Dietary preferences    Vegetarian     ›│
│ Lunch at Worcester     12:41 PM   404 ›│ │ Export my data          8 days        ›│
│ Earlier                                │ │ Campus                                 │
│ Wednesday, October 7        2,105 cal ›│ │ Charles River Campus               [ ] │
│ Tuesday, October 6          1,688 cal ›│ │ Newton                                 │
│ Monday, October 5           2,312 cal ›│ │ Show on dishes                         │
│ …                                      │ │ [5] Healthfulness                  [ ] │
│ Track what I eat                   [x] │ │ [B] Carbon rating                  [ ] │
│ Write to Health Connect            [ ] │ └────────────────────────────────────────┘
│ Favorites ›  Dietary preferences ›     │
│ Which was better? ›  Export my data ›  │
│ Campus …   Show on dishes …            │
└────────────────────────────────────────┘
```

### 3. Past logs
- **The way in is You itself.** With tracking on, You opens on **Today**: the day's totals in the label's box, then
  **Meals**, then **Earlier**, which lists one row per logged day ("Wednesday, October 7", "2,105 cal"), newest first.
  - Days with nothing logged don't appear. The day turns over at 2 AM (`DEFAULT_ROLLOVER_HOUR`), so a 12:30 AM late night
    belongs to the day before.
- **A day** is **pushed**, as every row on You is. Its page is You's Today block for that day: its date as the title, its
  totals, its meals.
- **A meal opens in the item sheet** (`#isheet`, the station switcher's and dish's sheet), laid out as plate rows:
  - the title "Lunch at Worcester", with the time beside it;
  - each item with the plate's stepper (1 → ½ → remove);
  - the totals box, Full label, and "Delete meal" where the plate has "Clear plate".
  - Edits apply as you make them; the stepper is its own undo.
  - Removing the last half of an item, or **Delete meal**, puts the sheet away (for a delete) and shows the receipt
    snackbar in the plate bar's slot ("Deleted Worcester lunch", **Undo**). That's round 2's Log receipt, which already
    appears with no plate in progress.
- **Today's meals** open the same way. "Logged" is one state, whichever day it is.
- **Log item shape (new).**
  - A meal: `{id, day (ISO, after rollover), time, meal, place, items:[…], health?:{recordId}}`.
  - An item: `{dish id, n, qty, parts?:[{dish id, qty}], snap:{cal,p,c,f,nut,price}}`.
  - The snapshot keeps a past meal true even when the dish's feed record changes or disappears. The dish id lets the
    label and "where" still open.

```
 A day (pushed)                             A meal (item sheet over the day)
┌────────────────────────────────────────┐ ┌────────────────────────────────────────┐
│ ‹  Tuesday, October 6                  │ │                 ────                   │
├────────────────────────────────────────┤ │ Lunch at Worcester          12:18 PM   │
│ Calories                         1,688 │ │ Beef Brisket Noodle Bowl     [− 1 +]   │
│ Protein 81g  Carbs 190g  Fat 52g       │ │ with Hard Boiled Egg, Bok Choy         │
│ Breakfast at Franklin   8:05 AM   311 ›│ │ 340 cal each                           │
│ Lunch at Worcester     12:18 PM   614 ›│ │ Golden BBQ Chicken Thigh     [− 2 +]   │
│ Dinner at Green Fields  6:40 PM   763 ›│ │ 93 cal each                            │
│                                        │ │ Calories                          526  │
│                                        │ │ Protein 46g  Carbs 31g  Fat 22g        │
│                                        │ │ Full label                 Delete meal │
└────────────────────────────────────────┘ └────────────────────────────────────────┘
                                             ┌──────────────────────────────────────┐
                                             │ Deleted Worcester lunch       Undo   │  receipt, in the bar's slot
                                             └──────────────────────────────────────┘
```

### 4. Bowl builder: a bowl is a plate item made of plate items
- **Which dishes build.** The feed has no base → add-in link (critique #2), so the rule follows the stations:
  - **Halls:** only stations with a natural base.
    - Noodle Bowl: the base is its "… Noodle Bowl"/"… Bowl" dish.
    - Omelet: the base is "Omelet Bar".
    - Pasta Bar: a pasta is the base, and the rest of the station are its add-ins.
    - Deli Bar and Salad Bar have no base, so they stay single dishes (open question).
  - **Cafés:** a dish in any station of a place and meal that also has an **Add-ons** or **Toppings** station. Its
    add-ins are that station's dishes that have nutrition (Fountain Drink has none; open question on sides).
- **The row doesn't change.** Its + still adds one plain dish in one tap (the benchmark's brisket bowl, 404 cal, A–C,
  vectors). The builder lives in the sheet only. A row's stepper counts the plain dish only; a built bowl shows on the
  plate.
- **The sheet.**
  - The identity group is unchanged.
  - Where "Add to plate" was, the station's own name is the heading ("Noodle Bowl", "Toppings", "Add-ons"). Under it are
    compact add-in rows, each with the row's + → stepper (1 → ½ → remove) and its calories.
  - **Pinned to the sheet's foot** is the plate bar's material: the bowl's running calories and protein in Oswald, and a
    gold **Add** (round 2's Log button), so the action never scrolls away from a long list.
  - Everything below sums live, in place: "where", the label (grams summed, %DV from FDA values, as M2 already does when
    the feed has none) and, at a café, the price ("$11.00" becomes "$15.25" with grilled chicken).
  - With nothing chosen, Add adds the plain dish.
- **On the plate** a bowl is one item, named after its base, with "with Hard Boiled Egg, Steamed Bok Choy" as its second
  line.
  - Its stepper scales the whole bowl.
  - Two different bowls of one base are two items, keyed by base and parts.
  - Tapping it reopens the sheet with its parts chosen, and the foot reads **Update**.
  - Its places are where the base and every part are served, so a bowl stays at its station's place and joins plates
    as any dish does.
- **Logged**, it keeps its parts (`parts`), so a past meal still says what was in it.

```
 Dish sheet, a build dish (at rest)          The same, at a café, scrolled
┌────────────────────────────────────────┐ ┌────────────────────────────────────────┐
│                 ────                   │ │ Create Your Own Salad              ☆   │
│ Beef Brisket Noodle Bowl           ☆   │ │ $16.50  1 each                         │
│ 1 bowl                                 │ │ Add-ons                                │
│ [patches] [tiles]                      │ │ Add Fresh Avocado  55 cal    [− 1 +]   │
│ Contains Wheat, Soy, Eggs …            │ │ Grilled Diced Chicken 86 cal [− 1 +]   │
│ Noodle Bowl                            │ │ Hummus             126 cal        +    │
│ Hard Boiled Egg     111 cal   [− 1 +]  │ │ Kettle Chips       101 cal        +    │
│ Steamed Bok Choy     11 cal   [− 1 +]  │ │ …                                      │
│ Bean Sprouts          2 cal        +   │ │ Lunch now, until 4:30 PM               │
│ Scallions             5 cal        +   │ │ [Green Fields]                         │
├────────────────────────────────────────┤ ├────────────────────────────────────────┤
│ 340 cal  24.3g protein       [  Add  ] │ │ 628 cal  30.5g protein       [  Add  ] │
└────────────────────────────────────────┘ └────────────────────────────────────────┘
```

### 5. Health Connect / Apple Health
- **Where.** On You, directly under **Track what I eat**, and only while it's on. It's a check row named for the
  platform: "Write to Health Connect" (Android) or "Write to Apple Health" (iOS).
- **The lead-in is the row.** Its second line says what will be written: "Each meal you log". Tapping it raises the OS
  permission sheet straight away. There is no interstitial: the row already says what you're agreeing to, and the OS
  sheet lists the fields.
  - **Allowed:** the check fills (`settle`). Each meal logged from then on is written, an edit rewrites its record, and a
    delete deletes it. Nothing is read back.
  - **Denied:** the check stays empty. The second line reads "Health Connect didn't allow it", with an outlined **Open
    Health Connect** (or **Open Settings**) button, the round-9 Try again control.
  - **Revoked in system settings:** checked when You is shown or the app resumes. It's the denied state, with "Not
    allowed in Health Connect any more". Nothing is lost on our side.
- **What's written:** the meal's time and its nutrients, mapped to whatever the platform's nutrition record supports.
  The label has calories, fat, saturated and trans fat, cholesterol, sodium, carbohydrate, fibre, sugars and protein;
  which of these each platform accepts is to be verified at build time.
- **The prototype simulates the OS.**
  - `?os=ios|android` picks the platform's name.
  - `?health=allow|deny|revoked` picks the outcome. The permission sheet is drawn as a neutral system sheet, clearly not
    UDine's.

```
 Off                                         Allowed
│ Track what I eat                    [x] │ │ Track what I eat                    [x] │
│ Write to Health Connect             [ ] │ │ Write to Health Connect             [x] │
│ Each meal you log                       │ │ Each meal you log                       │
 Denied                                      Revoked (found on resume)
│ Write to Health Connect             [ ] │ │ Write to Health Connect             [ ] │
│ Health Connect didn't allow it          │ │ Not allowed in Health Connect any more  │
│ [ Open Health Connect ]                 │ │ [ Open Health Connect ]                 │
```

### Motion, round 10 (all existing)
| Interaction | Pattern |
|---|---|
| First run | Bottom sheet, non-modal, resting under the bands; a band tap is `Sheet.away` plus the container transform |
| Tracking on or off | In place (`settle`); the plate bar leaves with `exit` |
| A day on You | Push (edge swipe back) |
| A meal | Bottom sheet (`#isheet`) |
| Steppers, Delete, Undo | In place; the receipt snackbar in the bar's slot |
| Bowl add-ins, running total, price | In place (`settle`, + → stepper) |
| Health toggle | In place; the permission sheet is the OS's own |

### Seeded history (NOTES, not the UI)
Oct 1–7 is built from dishes that exist in the Oct 8–22 fixture, with their real nutrition, at plausible times:
- 2–3 meals a day;
- Saturday Oct 3 not logged (a gap);
- one late night at 12:30 AM that counts for the day before;
- a Noodle Bowl bowl with parts;
- a priced Green Fields lunch.

The days and meals are seeded. Today's 8:42 AM breakfast stays as seeded in round 1.

## Round 11: what isn't on a menu, and what you can't reach (concept, before build)

Critique: `CRITIQUE-r11.md`. Brief: `docs/briefs/m2-round-11.md`. Motion: nothing new (table at the end).

**The idea.** Round 10 split UDine into a menu and a ledger. Round 11 is about the edges of both:
- foods that aren't on any menu;
- menus that aren't in the feed as dishes;
- times when the app isn't open;
- times when UMass can't be reached.

Each gets the treatment the app already uses: **a row says where, never where not; missing data draws nothing; a
state says what happened and what to do, in the place where it happened.**

### 1. Packaged foods and saved custom foods: Search's list ends where the menus end

```
 Search, "clif" (390), online, tracking on
┌────────────────────────────────────────┐
│ [⌕ clif                             ×] │
│ [High protein] [Light] [Vegetarian] …  │
│ Nothing called “clif” is on a menu     │  the menus' answer, as today
│ today or tomorrow.                     │
│ Your foods                             │  group: foods you've added that aren't on a menu
│ Clif Bar Chocolate Chip                │
│ 250 cal  6g protein                  + │  the lane has no letters: it's not served anywhere
│ Packaged                               │  group: packaged foods (OpenFoodFacts, USDA)
│ Clif bar                               │
│ 368 cal per 100 g                    + │  per 100 g says so, in the meta line
│ Clif Bar Duos                          │
│ 404 cal per 100 g                    + │
│ …                                      │
│ Search UMass Dining for “clif”         │  text button: the rate-limited lookup, by hand
│ Add “clif” as a custom food            │  as today
└────────────────────────────────────────┘
```

- **One list, ordered by where.**
  - The served groups stay first, as in round 9: Places, then "Lunch now", "At cafés", and "Later today and tomorrow".
  - The list then continues past the menus into two groups:
    - **"Your foods"**: every food you've added that isn't on a menu. That means custom foods you made, and packaged
      or UMass Dining foods you added from the groups below. All of it lives on the phone.
    - **"Packaged"**: what OpenFoodFacts and USDA return for the query, the same sources RN searches.
  - Both groups follow the menus, so a dish being served always comes first. They use Search's existing group
    headings and rows. No pill or badge.
- **How they differ visibly from served dishes.** The served groups are named by time; these two by what they are.
  - A served row's lane holds the hall letters, or the café's name.
  - A row in these groups has a lane with only the `+`, because it isn't served anywhere. A row says where, never
    where not.
  - A packaged hit that has only per-100 g values says so in its meta line ("394 cal per 100 g"). Its `+` adds one
    100 g serving, and the plate row reads "100 g". Nothing pretends 100 g is a bar.
- **What isn't shown.** RN's five-row cap and "Load More" are cut: Search already scrolls. The Packaged group shows
  the first page (20 hits, OFF's page size).
  - A name is shown once, and a food already in Your foods isn't repeated.
  - A hit with no calories is left out: there's nothing to record.
  - A name that doesn't include its brand leads with it ("Clif Bar" + "Chocolate Chip").
- **Search UMass Dining** (RN's "Search UMass Dining directly", `lookup-dish`, #538).
  - It is a text button after the groups. It never runs by itself, because its budget is global.
  - Its answer replaces it, in place (`settle`):
    - **in flight:** the round-9 activity indicator, after 400 ms, in the button's slot;
    - **found:** a group headed "UMass Dining", with dishes that aren't on a menu today or tomorrow. A lookup carries
      nutrition, allergens and diet tags, but no serving time, so the lane has only the `+`;
    - **none:** "UMass Dining has nothing else called “clif”.";
    - **failed** (online, but the call didn't come back): "Couldn't reach UMass Dining." with the round-9 outlined
      **Try again**;
    - **rate-limited:** "Searching UMass Dining is paused until 1 PM." The budget is global and resets on the hour, so
      the time is true. No apology.
- **A packaged food's sheet.** It has no grades, stations, hours or "where", so those draw nothing (round 8's rule).
  - The sheet is the dish sheet's identity group: the name, the serving ("1 bar (68 g)", or "100 g"), Contains (OFF's
    allergens, mapped to M2's eleven), Add to plate, the label (%DV from FDA values, as M2 already does when the feed
    has none), and the ingredients.
  - It has no star (favourites alert on menus, and a bar is never on one), and no ratings panel.
- **Saved foods: reused from Search and from You, edited in their own sheet.**
  - "Add “x” as a custom food" opens the same form as today. Its Add to plate saves the food on the phone as well
    (as RN does), so tomorrow "Your foods" finds it. Residency: device only.
  - A packaged or UMass Dining food is saved the same way the first time it's added: its row's `+`, or its sheet's
    Add to plate. It's your copy, so it can be edited like a custom food.
  - **Reuse:**
    - type its name in Search;
    - or open You → **Your foods** ("3 foods"), a pushed page listing them, newest first.
  - **Its sheet:** the name, the serving, Add to plate and the label. Where a dish has its star, a custom food has
    **Edit**, a text button in the same slot.
  - **Edit:** the sheet's content becomes the form, filled in (in place, `settle`). The form has **Save** and
    **Delete**.
    - Save returns to the food's sheet.
    - Delete puts the sheet away and shows the receipt in the plate bar's slot ("Deleted Chobani", **Undo**). That
      is round 10's Delete meal.
    - A logged meal keeps its own snapshot, so editing or deleting a food never changes a past day.
  - Export includes saved custom foods (CLAUDE.md: every device-local table exports).
- **Tracking off** (round 10). Your foods, Packaged, Search UMass Dining and "Add … as a custom food" exist to record
  what you ate, so all of them leave Search, and the Your foods row leaves You. Nothing is deleted. Back on, they
  return.

```
 A packaged food's sheet (at rest)           A saved custom food's sheet          Edit (in place)
┌──────────────────────────────────┐ ┌──────────────────────────────────┐ ┌──────────────────────────────────┐
│               ────               │ │               ────               │ │               ────               │
│ Clif bar                         │ │ Chobani                     Edit │ │ Edit food                        │
│ 100 g                            │ │ 1 serving                        │ │ Name  [Chobani                ]  │
│ [          Add to plate        ] │ │ [          Add to plate        ] │ │ Calories [140 ]  Protein [12 ]   │
│ Calories                    368  │ │ Calories                    140  │ │ Carbs    [ 15 ]  Fat     [ 0 ]   │
│ ...                              │ │ ...                              │ │ [             Save             ] │
│ (no where, no ratings, no star)  │ └──────────────────────────────────┘ │ Delete                           │
└──────────────────────────────────┘                                      └──────────────────────────────────┘
```

### 2. Favourite alerts: the switch lives with the favourites

```
 You → Favorites (pushed), off              Allowed                                 Notification (the OS's)
┌────────────────────────────────────────┐ ┌──────────────────────────────────┐ ┌──────────────────────────────────┐
│ ‹  Favorites                           │ │ Notify me                    [x] │ │ UDine                        now │
│ Notify me                          [ ] │ │ When a favorite is on today's    │ │ Beef Brisket Noodle Bowl         │
│ When a favorite is on today's menu     │ │ menu                             │ │ Lunch from 11 AM at Worcester    │
│ Beef Brisket Noodle Bowl               │ └──────────────────────────────────┘ └──────────────────────────────────┘
│ At lunch now at Worcester              │  Denied (or blocked)                    Background work off
│ Golden BBQ Chicken Thigh               │ ┌──────────────────────────────────┐ ┌──────────────────────────────────┐
│ At lunch now at Worcester              │ │ Notify me                    [ ] │ │ Notify me                    [x] │
└────────────────────────────────────────┘ │ Notifications are off for UDine  │ │ Background App Refresh is off,   │
                                           │ [ Open Settings ]                │ │ so UDine can't check menus       │
                                           └──────────────────────────────────┘ │ [ Open Settings ]                │
                                                                                └──────────────────────────────────┘
```

- **Where alerts are turned on.** A check row at the top of the Favorites page: "Notify me", with the line "When a
  favorite is on today's menu". Favourites are what it watches, so it lives with them. It's a menu feature, not the
  ledger's, so tracking off keeps it. The You row says "2 dishes, notifying" when it's on.
- **The OS ask, round 10 §5's pattern.** There is no interstitial: the row says what you're agreeing to, and a tap
  raises the OS's own permission sheet at once.
  - **Allowed:** the check fills (`settle`).
  - **Denied:** the check stays empty. The line reads "Notifications are off for UDine", with the round-9 outlined
    **Open Settings** button.
  - **Blocked:** the OS won't ask again (Android after two denials; iOS after one). The tap goes straight to the denied
    state, with no sheet.
  - **Revoked in system settings:** checked when You is shown or the app resumes. It's the denied state.
  - **Background work off:** notifications are allowed, but the OS won't run UDine in the background. On iOS that's
    Background App Refresh; on Android, a "Restricted" battery setting. The check stays on, because the wish is
    kept. The line reads "Background App Refresh is off, so UDine can't check menus" (Android: "Battery use is
    restricted, so UDine can't check menus"), with **Open Settings**.
- **What the notification says.** The title is the dish's name. The body is M2's "where" sentence, as the dish sheet
  says it, from the moment it's posted:
  - "Lunch from 11 AM at Worcester";
  - "Lunch now, until 4:30 PM, at Worcester and Berkshire";
  - "Dinner from 4:30 PM at Franklin".
  - It doesn't repeat itself, and it doesn't say "a favorite of yours": the student starred it.
- **Tapping it** opens the app on Halls and pushes the hall at that meal, scrolled to the dish and marked. That's the
  sheet's "where it's served" target, the first place in the answer. Several places are named in the body, and the
  hall's own row then shows the rest.
- **One notification per dish per day.** This differs from RN, which posts once per dish, hall and date. Two halls are
  one notification that names both.
  - The key is (dish name, the logical day after the 2 AM rollover), kept on the phone. Residency: device only, as RN's
    `food_sighting_dedup`.
  - A later run the same day posts nothing more, even if a third hall adds it.
- **When it posts:**
  - from 7 AM;
  - the first time a background run finds the dish on that day's saved menus;
  - never once the dish's last serving that day has ended. A lunch-only dish first seen at 5 PM is not posted.
- **Limits, written as limits.** They aren't shown in the UI; the concept states them.
  - On Android, background work runs at most every 15 minutes (WorkManager's floor), and Doze can delay it further.
  - On iOS, background fetch is best-effort: the OS chooses when, and a force-quit app may not run at all until it is
    opened.
  - So an alert can arrive late, or not at all. The dish sheet, the Favorites page and the Favorites lens stay the
    reliable answer.
- The prototype simulates the OS as round 10 does:
  - `?alerts=allow|deny|blocked|bgoff`;
  - `?os=ios|android`;
  - `?notify=1` posts the 7:15 AM run's notification for the seeded favourite, drawn as a neutral system banner.

### 3. Café PDF menus: a café's menus are rows, and a menu is a page

```
 The Commonwealth Restaurant (390)          Lunch menu (pushed)                  Offline, never opened
┌────────────────────────────────────────┐ ┌──────────────────────────────────┐ ┌──────────────────────────────────┐
│ ‹                                [pin] │ │ ‹  Lunch menu                    │ │ ‹  Lunch menu                    │
│   photo, own colour, maroon gradient   │ │ ┌──────────────────────────────┐ │ │                                  │
│ The Commonwealth Restaurant            │ │ │ THE COMMONWEALTH             │ │ │ You're offline, and this menu    │
│ Open until 9 PM ⌄                      │ │ │ LUNCH MENU                   │ │ │ isn't saved on this phone.       │
├────────────────────────────────────────┤ │ │ Starters & share plates …    │ │ │                                  │
│ We proudly welcome you to The          │ │ └──────────────────────────────┘ │ └──────────────────────────────────┘
│ Commonwealth Restaurant. …             │ │ ┌──────────────────────────────┐ │  Café rows offline:
│ Menus                                  │ │ │ page 2                       │ │ │ Lunch              Not saved › │
│ Lunch                                › │ │ └──────────────────────────────┘ │
│ Lite fare                            › │ └──────────────────────────────────┘
│ Dinner                               › │
│ Dessert                              › │
│ [ Add a custom food ]                  │
└────────────────────────────────────────┘
```

- **Which café.** In the live feed on 2026-10-13, three places publish PDFs (NOTES "Round 11" has the list): The
  Commonwealth Restaurant (four PDFs) and the two babyBerk trucks. The trucks are closed all week and have no address.
  M2 adds The Commonwealth Restaurant ("North, by Worcester", Worcester Commons top floor) with its UMass photo, and
  appends it last so no place key moves.
- **The café page offers each PDF as a row.** The page body keeps round 9's menu-less shape, with the description and
  then the heading "Menus". Under it is one row per PDF, in the feed's order, named by the link's own words cut to
  the menu's name: "Lunch", "Lite fare", "Dinner", "Dessert". RN shows only the first. Add a custom food stays under
  the rows (tracking on).
- **A menu opens in place, by push.** A row is "anything else that goes somewhere" (round 7), so it pushes a page
  titled "Lunch menu". The page is the PDF's pages, drawn at the screen's width on chalk, one under another, with the
  page's own white. Pinch zooms, as any document view does.
  - Back and the edge swipe pop it. There's no modal, and no hand-off to another app.
  - The system viewer would cost a context switch and lose the back gesture, and M2 already has a page for documents.
- **Loading, failed, offline.** These are round 9's states, in the page's body:
  - **loading:** the indicator after 400 ms, then the pages fade in where they end up (`settle`);
  - **failed:** "The lunch menu didn't load." with Try again;
  - **offline:**
    - a PDF opened before is kept on the phone, as a file per URL, replaced when the feed's URL changes. So it opens
      offline exactly as online. RN downloads a fresh copy every time;
    - a PDF never opened shows "You're offline, and this menu isn't saved on this phone." Its row on the café page
      says "Not saved" in the schedule's slate, as round 9's schedule rows do.
  - Prefetching every café PDF would be new traffic RN doesn't make, so it's an owner question, not the default.

### 4. Offline search: Search says what it's searching

```
 Search, offline, "bbq" (390)                Search, failed (online, UMass unreachable)
┌────────────────────────────────────────┐ ┌────────────────────────────────────────┐
│ [⌕ bbq                              ×] │ │ [⌕ bbq                              ×] │
│ [High protein] [Light] [Vegetarian] …  │ │ [High protein] [Light] [Vegetarian] …  │
│ You're offline. Searching the menus    │ │ Couldn't connect          [Try again]  │  Halls' pair, on chalk
│ saved on this phone: the halls, today  │ │ Your foods                             │
│ and tomorrow.                          │ │ …                                      │
│ Lunch now                              │ │ Packaged                               │  the network is up: OFF still answers
│ Golden BBQ Chicken Thigh               │ │ …                                      │
│ 93 cal  9.7g protein           [W]   + │ │ Search UMass Dining for “bbq”          │
│ Later today and tomorrow               │ └────────────────────────────────────────┘
│ …                                      │
│ Your foods                             │
│ …                                      │
└────────────────────────────────────────┘
```

- **What is saved** (flutter-port-menu-data, as RN):
  - the four halls and their Grab 'N Go, today and tomorrow, prefetched at launch;
  - a café's day once you've opened it;
  - hours for the day;
  - your foods, always.
  - Search covers only today and tomorrow anyway, so being offline changes which places are searched, not which
    days.
- **What Search says.** One line at the top of the results, in the diet line's slot and type, written for what's true
  right now:
  - "You're offline. Searching the menus saved on this phone: the halls, today and tomorrow."
  - With cafés opened today: "…: the halls, today and tomorrow, and Green Fields, today."
  - It shows in the idle state too, above Events. Events are cached for the day like hours.
- **A place or day with nothing saved is absent from the dish groups.** A dish that can't be found can't be named.
  - Places still match by name, because names, photos and hours are bundled or cached.
  - Opening an unsaved café gives round 9's "You're offline, and the menu for Thursday, October 8 isn't saved on this
    phone."
  - The top line names what is searched, so nothing absent is a surprise.
- **Failed** (online, but UMass Dining is unreachable). It uses Halls' own pair at the top of the results:
  "Couldn't connect" and the outlined **Try again**.
  - In round 9's model, failed means nothing was saved this launch, so the menu groups are empty. Places still
    match.
  - Packaged foods and Search UMass Dining don't depend on UMass Dining's own site, so they're offered as usual.
  - Try again re-runs the search in place (`settle`).
- **Packaged-food lookup offline.** Packaged needs the network, so offline the Packaged group and Search UMass Dining
  are absent; the top line has already said what is searched.
  - Your foods still answers. It holds every packaged food you've added, so the protein bar you eat every day is found
    offline.
  - "Add “x” as a custom food" stays: it needs nothing from the network.
- `?net=offline|fail` now reaches Search. `?saved=Green Fields` marks cafés as opened today, for shots. Without it,
  a café counts as saved once its page was opened online in the session.

### 5. Bowls (owner, 2026-10-13), applied as built
- **Synthetic bases read "Salad Bar" and "Deli Bar".** The station's name is the bowl's name, so the sheet drops the
  add-ins heading that would repeat it.
- **No by-the-pound bar gets a base.** A station whose raw name carries a per-pound price ("Salad Bar $11.50/LB",
  "Cold Bar Items $11.50/LB") is a list of single dishes. That covers Harvest Market and Roots. The "Cold Bar" base
  is gone.
- **Noodle Bowl: exactly one base per station-day, its soup or dish** (rule in NOTES "Round 11", table there).
  1. A station with one dish: that dish, whatever its calories (Chicken Congee, 49 cal).
  2. A station of parts: two or more broths ("… Broth", "… Base") with noodles, proteins and toppings is a pho bar
     with no single dish. Like the Salad Bar, it gets a synthetic base named after its station, "Noodle Bowl". The
     broth is the first thing you choose.
  3. Otherwise, a part is a name that, outside its parentheses, says sauce, topping, broth, base or dressing. So
     "Shrimp Tom Yum Soup (Chicken Broth)" is a soup. The base is the highest-calorie dish among the remaining dishes
     whose full name says ramen, noodle, soup, stew, congee, bowl, curry or katsu; a word in the parentheses counts,
     as in "Bun Heo Quay (Crispy Pork Belly Bowl)". If no dish says one of those words, the base is the
     highest-calorie dish that isn't a part (Masala Dosa, Khoa Soi).
  - Only that dish builds. Pork belly, Mayu oil and Chicken Katsu beside curry noodles are add-ins, with their own `+`
    on the row.

### Motion, round 11 (all existing)
| Interaction | Pattern |
|---|---|
| Your foods, Packaged, UMass Dining groups arriving | In place: rows fade up, survivors glide (Search's existing FLIP, `settle`) |
| Search UMass Dining: in flight → answer | In place (`settle`); indicator after 400 ms |
| A packaged or saved food | Sheet (`#isheet`), as a dish |
| Edit / Save in the food's sheet | In place (`settle`) |
| Delete a saved food | `Sheet.away`, then the receipt in the bar's slot |
| You → Your foods, You → Favorites | Push |
| Notify me | In place; the permission sheet is the OS's own |
| Notification tap | Push of the hall, scrolled to the dish (the "where" target's existing motion) |
| A café's menu row → its PDF | Push |
| PDF pages arriving | In place (`settle`) |
| Search offline line, failed pair, Try again | In place (`settle`) |

### Round 11, as built (where the build departed from the concept above; NOTES "Round 11")
- **The You row for Favorites is unchanged** ("2 dishes"). It doesn't add "notifying". The switch's state is on the
  Favorites page, where it's changed, and a second status line on You would describe rather than act.
- **The café page puts the menus first.** The order is: "Menus", the four rows, Add a custom food, then the
  description. With the description first (the frame above), every row was below the fold at 360.
- **Packaged search can fail on its own** (`?pack=fail`): "Packaged foods didn't load." with Try again, under the
  Packaged heading. OpenFoodFacts' own outage during this round (critique #7) showed it's a normal state.
- **A per-100 g item on the plate** reads "368 cal per 100 g", not "100 g". It is the plate row's own "cal each" line
  with the unit in place of "each".
- **Revoked** is simulated with `?alerts=revoked`: stored on, no longer allowed. It shows the denied state.
- **A synthetic sheet** has no add-ins heading, because its title is the station's name. Its parts start 16 px under
  the title.
- **Pinch zoom on a PDF.** The prototype's viewport is fixed (`maximum-scale=1`), as an app's is. The PDF page
  therefore has its own two-finger zoom (1× to 4×, CSS `zoom` on the pages), standing in for the platform's.
- **Round 11b (owner's answers, 2026-10-14).**
  - **A pho is named after its broth.** It replaces item 5's synthetic "Noodle Bowl" bowl name; the row in the list
    still reads "Noodle Bowl", because it is the thing you add.
    - In the sheet, the broths come first. A broth's `+` picks it, and picking another puts the first back: one broth
      at a time, at 1, with no ½.
    - The title changes in place to the broth's name, and the bowl goes on the plate under that name, "with" its
      parts.
    - With no broth picked, the title is the station's ("Noodle Bowl"), the foot reads 0, and Add is disabled, as on
      the Salad Bar with nothing chosen. A pho has no base until a broth is picked.
  - **Whitmore Café and Star Ginger follow the halls' rule.** Each has one pho builder. Its choices are the station's
    phos (or Star Ginger's three ramens on Oct 14), the choice names the bowl, and the café's Add-ons are the toppings,
    under their own heading. A café pho bar (Charles River, Oct 9 and 16) picks its broth. No single pho builds on
    its own any more.
  - **Pinned cafés are prefetched** at app open: today's menu and its PDFs. Unpinned cafés are saved once opened. So:
    - offline Search names a pinned café among the saved menus;
    - a pinned café's PDFs never say "Not saved".
  - **PDF zoom** is pinch (1× to 4×) and double-tap (2.5× at the point tapped, and back). The pages scroll sideways
    under a bar that stays.
  - **A row with a button under it** (Notify me, Write to Health) hangs the button 12 px under the line's last line,
    whether the line is one line or two.

## Round 12: one item, its sizes or milks picked in its sheet (concept, before build)

Critique: `CRITIQUE-r12.md`. Brief: `docs/briefs/m2-round-12.md`. The rule and every family and near-miss it finds:
NOTES "Round 12". Motion: nothing new (table at the end).

**The idea.** A pick-one is a row of chips under the item's name in its sheet, and it is the same control wherever M2
asks you to pick exactly one: a size, a milk, a pho's broth. The list shows the item once. The sheet is where you
choose. Everything under the chips (the name, price, serving, marks, Contains, the action, "where", the label, the
ratings, the ingredients) is the picked variant's own, so what you read is what you log.

```
 Worcester Café, all day (390)              Its sheet: a size (the builder)        After 20 oz (in place)
┌────────────────────────────────────────┐ ┌──────────────────────────────────┐ ┌──────────────────────────────────┐
│ Beverages                              │ │               ────               │ │               ────               │
│ Cappuccino                             │ │ Cappuccino, 16 oz            ☆   │ │ Cappuccino, 20 oz            ☆   │ the name follows
│ 16 oz   0 cal  0g protein            + │ │ (✓16 oz)(20 oz)                  │ │ (16 oz)(✓20 oz)                  │ the pick-one
│ Caramel Macchiato                      │ │                                  │ │                                  │
│ 16 oz   152 cal  0.8g protein        + │ │ $5.00  16 ozl                    │ │ $5.50  20 ozl                    │ price, serving
│ Chai                                   │ │ Toppings and Add-ons             │ │ Toppings and Add-ons             │ the builder,
│ 16 oz   211 cal  0g protein          + │ │ Butter                        +  │ │ Butter                        +  │ unchanged
│ …  (nine size families)                │ │ …                                │ │ …                                │
│ 20 oz Cold Brew                        │ │ …                                │ │ …                                │
│ 1 cal  0g protein                    + │ ├──────────────────────────────────┤ ├──────────────────────────────────┤
│ Boba                                   │ │ 0 cal  0g protein        [ Add ] │ │ 0 cal  0g protein        [ Add ] │
│ Almond   180 cal  0.3g protein       + │ └──────────────────────────────────┘ └──────────────────────────────────┘
└────────────────────────────────────────┘
  a lone size (Cold Brew, the iced drinks) is a dish: it keeps the feed's name
```

### 1. Which items group (NOTES "Round 12" has the rule's whole output)
- **Within one place, day, meal and station.** Never across stations, places or days: Boba at Procrastination
  Station, Roots and Worcester Café is three families, one per café (Search shows them as one row; §5).
- **Only by a variant token, and only when it is all that differs.** Two kinds are in the feed:
  - **a size:** a leading "16 oz " ("16 oz Cappuccino"), or a trailing "(8 oz)" or "(8oz)" ("Coconut Mango Acai Bowl
    (8oz)");
  - **a milk:** "<name> <kind> Milk", where the kind is one the feed uses: Almond, Maple, Oat, Skim, Soy, Whole, 1%
    ("Boba Oat Milk"). "Maple" is a maple flavour (owner, 2026-10-16), so the chip keeps the feed's word;
  - **a base** (round 12b, owner, 2026-10-16): Coconut or Yogurt, only as the last word before "Smoothie" ("Banana Berry
    Coconut Smoothie", family "Banana Berry Smoothie") or after "w/" at the end of a name ("Matcha Strawberry w/Yogurt", family
    "Matcha Strawberry"). The word anywhere else is no token ("Coconut Mango Acai Bowl", "Coconut Flavored Syrup"), and a
    "Green Beans w/Coconut" with no "w/Yogurt" beside it is a dish.
- **A family is two or more items at the station with the same remaining name and different tokens.** What remains
  is the family's name ("Cappuccino", "Boba"). An item whose token has no sibling ("20 oz Cold Brew", "8 oz Spicy
  Lentil & Veggie Soup" at Franklin) is a dish as it always was, under the feed's own name.
- **Not grouped, by rule:**
  - an Add-ons or Toppings station: its items are a builder's parts ("MAPLELINE Skim Milk", "MAPLELINE Whole Milk");
  - a milk with nothing left once the milk is taken out ("1% Milk");
  - names that differ by any other word, even with a size in front ("20 oz Iced Latte" and "20 oz Latte"; "12 oz
    Decaf Coffee" and "12 oz Regular Coffee"; "Single" and "Double Espresso"; the milkshake flavours). Those are different drinks, so they
    stay rows. NOTES lists every one.
- **The order and the default.** Sizes run smallest first, and the default is the smallest. Milks keep the feed's
  order, and the default is the first (Almond). The default is what a row stands for while none of the family is on the
  plate (round 12b below: after that, the row follows the plate).

### 2. The row: one row, standing for its default
- **One row per family**, where its first member was in the feed's order. The other members' rows are gone.
- **The name is the family's** ("Cappuccino", "Boba"). The meta line leads with the default's token as its own group,
  in its chip's word ("16 oz", "Almond"; round 12 frame review), then that variant's numbers and scores. A row says what its `+` adds; a range ("180 to
  275 cal") couldn't, and the data has ranges that run backwards (Caramel Macchiato: 152 cal at 16 oz, 27 at 20 oz).
- **`+` adds the variant the row stands for in one tap**, as a row always does, and its stepper counts it. (As first
  built, a row counted only its default and an oat added from the sheet lived on the plate alone, round 10's bowl rule.
  The owner replaced that on 2026-10-16: "Round 12b, 3" below.)
- **Dietary preferences:** a family is hidden only when every member is. Otherwise the row stands for the first member
  your preferences allow.
- A diet mark or star on the row is the default's mark and the family's star (§6).

### 3. The picker: chips under the name
- **The control is M2's own chip** (Cafés & markets' "Open now", Search's lenses): 44 px, an 8 px corner, tonal with a
  check when chosen. In a single-select chip group, as MDC's `ChipGroup`, which wraps by default, so every option is
  on screen. They sit 8 px under the name (a part of the identity group, round 7's spacing scale).
- **Exactly one is chosen.** A chip tap chooses it; there is no "none" for a size or a milk.
- **The labels are the tokens**: "16 oz", "20 oz"; "Almond", "Maple", "Oat", "Skim", "Soy". The name above says what
  they are ("Boba, Oat Milk"), so the group has **no heading**.
- **The name follows the pick**, in place: "Cappuccino, 16 oz" becomes "Cappuccino, 20 oz". It is the plate's name
  for it, and it stays pinned at the top when the sheet is scrolled, so the label far below always says whose it is.
- **Everything below follows the pick**, in place, without moving the sheet: price and serving, marks and scores,
  Contains, Add (to plate), "where" (the variant's own servings), the label, the ratings panel and the ingredients.
  The chip fills (`settle`) and the content under it crossfades from .4 (`settle`), as a plate tab does.
- **In a builder** (most families, critique #10) the picker chooses the base. Chosen add-ins stay chosen across a
  size change, so a 16 oz with oat milk becomes a 20 oz with oat milk. The foot sums the new base.
- **Tracking off** keeps the picker. It chooses which label you read; only Add is gone (round 10).

### 4. Pick-one everywhere: the pho's broth
- **The pho bar's broths move out of the add-in rows into the same chips**, under the name. Their labels are the feed's
  full names, because the parentheses carry allergens: "Chicken Pho Broth (Fish)", "Green Curry Pho Broth
  (Anchovies)", "Tantanmen Ramen Broth", "Vegetarian Pho Base".
- **Round 11b holds otherwise.** With no broth chosen, the name is the station's ("Noodle Bowl"), no chip is chosen, the
  foot reads 0 and Add waits. A chip names the bowl. The toppings stay add-in rows with `+` and ½.
- **Café pho builders** (Whitmore, Star Ginger) choose their pho the same way: the station's phos are the chips, and the
  café's add-ons stay rows under "Add-ons". A chip's text wraps inside it when a name is longer than the line
  ("Pulmuone Tofu Pho w/Spicy Green Curry Broth").
- **This answers round 11's "Broth heading".** No heading, for the same reason a size has none: the chips' own words
  say what is being chosen, and a heading would describe the control.

```
 Hampshire, lunch: the pho bar              A broth chosen
┌──────────────────────────────────┐ ┌──────────────────────────────────┐
│               ────               │ │               ────               │
│ Noodle Bowl                      │ │ Green Curry Pho Broth (Anchovies)│
│ (Chicken Pho Broth (Fish))       │ │ (Chicken Pho Broth (Fish))       │
│ (Green Curry Pho Broth           │ │ (✓Green Curry Pho Broth          │
│   (Anchovies))                   │ │   (Anchovies))                   │
│ (Tantanmen Ramen Broth)          │ │ (Tantanmen Ramen Broth)          │
│ (Vegetarian Pho Base)            │ │ (Vegetarian Pho Base)            │
│ Pho Noodles        11 cal     +  │ │ Pho Noodles        11 cal   [−1+]│
│ Chicken for Pho    28 cal     +  │ │ Chicken for Pho    28 cal   [−1+]│
├──────────────────────────────────┤ ├──────────────────────────────────┤
│ 0 cal  0g protein        [ Add ] │ │ 288 cal  …               [ Add ] │
└──────────────────────────────────┘ └──────────────────────────────────┘
   Add disabled until a broth is chosen
```

### 5. On the plate, in history, and what is logged
- **The plate names the variant**: "Cappuccino, 20 oz", "Boba, Oat Milk", "Clam Chowder, 12 oz". A built one keeps its
  second line ("with PACIFIC Almond Milk").
- **Its stepper is its own.** Two variants of a family are two plate items, as two bowls are.
- **Tapping it reopens the sheet on that variant**, with its chip chosen, and the action reads **Update**, as a bowl's
  does. Choosing another size and Update changes the item in place, keeping its quantity; if that variant is already on
  the plate, the two merge (the bowl's twin rule).
- **The log records the feed's item**: the variant's own dish name ("20 oz Cappuccino"), its id and its own nutrition,
  so it is exact and RN-shaped (an `umass-menu` item named as the feed names it). The display name is computed
  when drawn, so a past meal reads "Cappuccino, 20 oz" with nothing new stored, and an export carries the feed's
  name.

```
 The plate                                   A logged meal
┌────────────────────────────────────────┐ ┌────────────────────────────────────────┐
│ Worcester Café lunch, 2 items          │ │ Lunch at Worcester Café   12:41 PM     │
│ Cappuccino, 20 oz             [− 1 +]  │ │ Cappuccino, 20 oz             [− 1 +]  │
│ 0 cal each                             │ │ 0 cal each                             │
│ Boba, Oat Milk                [− 1 +]  │ │ Boba, Oat Milk                [− 1 +]  │
│ 262 cal each                           │ │ 262 cal each                           │
└────────────────────────────────────────┘ └────────────────────────────────────────┘
```

### 6. Search, favourites and alerts
- **A family matches once.** "boba" gives one row, "Boba", in "At cafés", with the three cafés in its lane. It matches
  on any member's name, so "oat" finds Boba too. "Later today and tomorrow" lists a family once as well.
- **What you typed picks the row's variant.** "oat" or "boba oat" makes the row stand for Boba, Oat Milk (its meta
  says "Oat", its `+` adds it); "20 oz latte" makes Latte stand for its 20 oz. Otherwise the row is the default.
- **Favouriting stars the family.** The star in the sheet is the same whichever chip is chosen: you like boba, and
  every milk is served wherever one is. The Favorites lens, the Favorites page and the row's star all read the family.
- **Alerts match the family.** A run posts once per family per day when any member is on a menu, titled with the
  family's name ("Boba") and the sheet's "where" sentence for it ("Now, until 4 PM, at Worcester Café").

### Motion, round 12 (all existing)
| Interaction | Pattern |
|---|---|
| A chip chosen | In place: the chip fills (`settle`) |
| The sheet after a pick | In place: the name changes; the content under the chips crossfades from .4 (`settle`); the sheet doesn't move |
| A builder's foot after a pick | In place, as an add-in step (`settle`) |
| Update from the plate | `Sheet.away`, then the plate row changes in place (the bowl's Update) |
| Search rows when a family collapses | Search's existing FLIP (`settle`) |

### Round 12, as built (where the build departed from the concept above; NOTES "Round 12")
- **A chosen chip has no check, and its text doesn't get bolder.** It is the tonal fill and the maroon edge alone. With
  the filter chip's check, choosing "Almond" widened that chip by the check's width, and at 360 and 390 the five milks
  already wrap to two lines, so a choice could move a chip to the other line under the finger (pass 1).
- **"Later today and tomorrow" rows lead with their token too** ("8 oz", then the numbers), as the menu's and "At
  cafés" rows do.
- **You → Favorites names a family by its name and says where it is now**, places joined with "and" ("At lunch now at
  Worcester Café, Roots Café and Procrastination Station"). Hall favourites read as before.
- **Café phos** (Star Ginger's nine, Whitmore's six) are chips like the hall broths, one or two to a line; a name longer
  than the line wraps inside its chip (NOTES "Open").

### Round 12b: the owner's answers (2026-10-16)
Six answers to round 12's open questions. Four change the design (1, 3, 4, 5), one removes a note (2) and one leaves a
rule alone (6). NOTES "Round 12b" has the numbers, the tests and the shots.

**1. Courtside Café's smoothies are families.** The rule gains a third token, a *base* (§1 above): Coconut or Yogurt, read only
at the end of a name before "Smoothie" or after "w/". Seven families at Courtside Café (Banana Berry, Mango Tango, Passionate
Pineapple, Summer Blush, The Green Monster, V-9, and Matcha Strawberry), two chips each, Coconut first (the feed's order).
The sheet reads "Banana Berry Smoothie, Coconut"; the log keeps "Banana Berry Coconut Smoothie". Everything else §1 lists
stays a set of rows: decaf and regular, hot and iced, single and double espresso, the milkshake flavours, and a flavour that
merely starts with the word ("Coconut Flavored Syrup").

**2. "Maple" stays.** The chip is the feed's word; the note that it might be Mapleline's is gone.

**3. The row follows the plate.** A family row stands for the variant last added to the plate and counts that variant. It
replaces "a row counts only its default".
```
 Procrastination Station, lunch                 After Oat from the sheet           After Soy too                        Soy removed
┌──────────────────────────────────┐ ┌──────────────────────────────────┐ ┌──────────────────────────────────┐ ┌──────────────────────────────────┐
│ Boba                             │ │ Boba                             │ │ Boba                             │ │ Boba                             │
│ Almond  180 cal  0.3g protein  + │ │ Oat  262 cal  0.4g protein [−1+] │ │ Soy  240 cal  …            [−1+] │ │ Oat  262 cal  0.4g protein [−1+] │
└──────────────────────────────────┘ └──────────────────────────────────┘ └──────────────────────────────────┘ └──────────────────────────────────┘
  nothing of it on the plate: the default   the row stands for oat, counts it    the later add; oat is on the plate     the next most recent still on it
```
- **"Added" means touched upward:** a first add (`+`, Add, Add another), a stepper `+` (the row's or the plate's), or an Update
  (an Update counts as adding the variant it makes). A stepper `−` never makes a variant the one the row stands for.
- **The row counts the variant it stands for, not the family.** Its stepper is that variant's own item: `+` and `−` change that
  item, so what the tap does is what the number says.
- **Two variants on the plate:** the row stands for the one touched last, and counts it. The other is on the plate (it shows there
  with its own stepper) and the row doesn't mention it. Stepping the other up on the plate makes it the one touched last, so the
  row switches to it.
- **When that variant leaves the plate** (its `−` takes the last half, or it is removed on the plate, or Clear plate), the row
  falls back to the family variant touched last among those still on the plate; with none, to the default (the first your
  preferences allow). Logging empties the plate, so the row goes back to the default.
- **A built variant is its own item** (round 10's bowl rule stays here): a 20 oz Cappuccino made with add-ins is a bowl on the
  plate, and the row neither follows it nor counts it. Only plain dishes (an Add with no add-ins chosen) are the row's.
- **The row changes in place:** its token, numbers, scores and diet mark swap and the content crossfades from .4 (`settle`);
  the row doesn't move or change height, and a `+` that becomes a stepper widens as it always does. Tapping the row opens the
  sheet on the variant it stands for (the action reads "Add another" when that variant is on the plate).
- **In Search, what you typed narrows first.** Among the variants whose names fit the typed words, the row stands for the one
  last added, else the first; "soy" gives Soy even with oat on the plate. With nothing typed or the typed words fitting all
  (a lens, "boba"), the plate decides.
- **A variant your preferences hide** is never the one a row stands for, even on the plate.

**4. Café phos are picked by protein, then broth.** Star Ginger's nine ("Beef Pho w/Chicken Broth" … "Pulmuone Tofu Pho w/Vegetable
Broth") and Whitmore's six are a complete grid of three proteins by three (or two) broths, so the sheet shows two chip groups,
protein first, under the name. The rule reads the shape `<protein> Pho w/<broth> Broth`, and only a full grid of at least two by two;
otherwise the station keeps one picker of whole dishes (Star Ginger's ramen days).
```
 Star Ginger: the pho builder                    Protein and broth chosen
┌──────────────────────────────────┐ ┌──────────────────────────────────┐
│               ────               │ │               ────               │
│ Noodle Bowl                      │ │ Chicken Pho w/Vegetable Broth    │
│ (Beef Pho)(Chicken Pho)          │ │ (Beef Pho)(✓Chicken Pho)         │
│ (Pulmuone Tofu Pho)              │ │ (Pulmuone Tofu Pho)              │
│ (Chicken Broth)                  │ │ (Chicken Broth)                  │
│ (Spicy Green Curry Broth)        │ │ (Spicy Green Curry Broth)        │
│ (Vegetable Broth)                │ │ (✓Vegetable Broth)               │
│ Add-ons                          │ │ Add-ons                          │
│ Add Grilled Chicken           +  │ │ Add Grilled Chicken           +  │
├──────────────────────────────────┤ ├──────────────────────────────────┤
│ 0 cal  0g protein        [ Add ] │ │ 145 cal  …               [ Add ] │
└──────────────────────────────────┘ └──────────────────────────────────┘
   Add waits for both                    (the chosen chips are filled, not checked)
```
- **Labels** are the feed's words with the noun kept ("Beef Pho", "Spicy Green Curry Broth"), so the two groups never read alike
  ("Chicken Pho", "Chicken Broth") and, as everywhere in round 12, there is no heading.
- **Add waits until both are chosen**, not a default: round 11b's rule for a broth, now for two. Neither chosen, or one,
  the name is the station's ("Noodle Bowl"), the foot sums only the add-ons chosen so far and Add is disabled.
- **The bowl is named for the feed's pho** once both are chosen, and that is the plate's, the log's and history's name too
  ("Beef Pho w/Vegetable Broth"). Nothing is composed ("Pho, Beef, Vegetable"): the feed's name already says both, and it is what
  RN logs. Changing either chip re-resolves to the matching pho; the add-ons stay chosen; the foot, label, Contains and ratings
  follow, in place as round 12's pick does.
- **On the plate, Update** reopens the builder with both chips chosen from the pho. Changing either chip and Update replaces the
  item with the new pho, keeping its quantity and its add-ons; a twin (the same pho with the same add-ons) merges, as a bowl's does.
- **Hall pho bars** (broth only) keep their one picker.

**5. Blank calories draw "–".** A feed record with no calories (20 oz Chai, 20 oz Iced Chai Latte, 20 oz Iced Tea, Add Crispy
Chicken, Fountain Drink; nine records) is unknown, not zero, so wherever calories are drawn they read "–": a row's "20 oz –
cal", the sheet's Calories line on the label, a plate row ("– cal each"), a logged item. A recorded 0 stays 0
(the 31 records the feed gives as 0). Totals are the sum of what is known: a plate, meal or foot of only unknowns reads "–", and a
plate with a known item beside one reads that item's number. The log stores the unknown as null, and an export writes null.
Round 12c (below) extends this to protein, carbs and fat.

**6. A café's add-ons apply to every dish at that meal: unchanged** (round 10's rule). Roots Café's lunch boba still builds
with "Add Bacon Quesadilla".

### Motion, round 12b (all existing)
| Interaction | Pattern |
|---|---|
| A row stands for another variant | In place: the content crossfades from .4 (`settle`); the row doesn't move |
| A protein or broth chip chosen | The same as any chip: the fill (`settle`), the content under the chips crossfades from .4 |

### Round 12c: the coordinator's review of 12b (2026-10-17)
```
 Star Ginger, none chosen (390)               Chai, 20 oz on the plate
┌──────────────────────────────────┐ ┌──────────────────────────────────┐
│ Noodle Bowl                      │ │ Chai, 20 oz         [− 1 +]      │
│ (Beef Pho)(Chicken Pho)          │ │ – cal each                       │
│ (Pulmuone Tofu Pho)              │ │ ┌──────────────────────────────┐ │
│                                  │ │ │ Calories                   – │ │
│ (Chicken Broth)                  │ │ │ Protein                    – │ │
│ (Spicy Green Curry Broth)        │ │ │ Carbs                      – │ │
│ (Vegetable Broth)                │ │ │ Fat                        – │ │
│ Add-ons                          │ │ └──────────────────────────────┘ │
│ Add Crispy Chicken  – cal     +  │ └──────────────────────────────────┘
```
1. **A missing nutrient is "–", not only calories.** Protein, carbs and fat that the feed leaves blank are unknown too (owner's
   rule for missing data, packaged foods, 2026-10-16). "20 oz Chai" reads "– cal – protein" on its row; the plate's Protein, Carbs
   and Fat, the bar and the foot read "–". A recorded 0 is 0g. Totals sum what is known and are "–" only when every item is
   unknown. The log stores null; an export writes null.
2. **A blank-calorie add-on is offered, with "–".** The builders' filter keeps parts with calories above 0 (water, mustard) and
   now also those with none recorded: "Add Crispy Chicken" at Whitmore.
3. **Health writes omit an unknown field, never 0.** If every value of a field is unknown the field is not written (for the
   Flutter build; M2 only simulates the store).
4. **The pho's two groups are two blocks.** The broth chips used to wrap straight on after the proteins and the six read as one list. The
   second group now starts a section gap below the first, 24 px, the add-ons heading's own top margin; chips inside a group stay 8 px
   apart. No heading or caption.
5. **Decided, unchanged:** the row does not follow built variants (a variant with add-ins is its own item); and a protein x broth grid
   that is incomplete falls back to one picker of whole dishes (none occurs in the fifteen days).

### Round 12d: a Fountain Drink at every dining commons (owner, 2026-10-17)
The owner: every hall has fountain drinks. The feed lists none for a hall, so M2 adds one synthetic record, the café add-on's own
"Fountain Drink" (1 each, every nutrient blank, so "– cal", "–" everywhere, logged as a count only; round 12b/12c rules).
- **Where.** A last station, "Beverages", in every dining commons menu at every meal the hall posts except Grab 'N Go (packaged
  items, no stations): Worcester breakfast, lunch, dinner and late night; Franklin and Hampshire breakfast, lunch and dinner;
  Berkshire lunch, dinner, late night (and its one breakfast). It is last because it is a constant, not part of the cooked line:
  it never moves a station the menu names, and the station switcher ends with it.
- **The row** is any dish's row: the name, "– cal – protein", and `+` (a count on the plate: "– cal each"; the log keeps null).
  Its sheet is the plain sheet with Calories "–" over a label of dashes and no star.
- **No star, no alert.** Something served everywhere at every meal can't be spotted, so there is nothing to favourite: the sheet
  has no star, so Favorites and alerts never hold it.
- **Search.** Typed "fountain" finds it, once among the halls ("W F H B") and once among the cafés that list it ("8 cafés"); a
  hall and a café group never share a row. Idle Search doesn't list it (its calories are under the idle list's floor, like water).
- **The café add-on** (Star Ginger's, Green Fields', and the others) is unchanged.
- **Dietary preferences never hide it, and it carries no diet marks** (owner, 2026-10-17): it is a drink, not food. The rule is in `dietOK`
  (`ALWAYS`): Vegetarian, Plant based, Halal, all of them skip it.

