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
