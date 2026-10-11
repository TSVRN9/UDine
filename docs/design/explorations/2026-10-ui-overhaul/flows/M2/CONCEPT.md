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
  - Healthfulness: an Oswald figure plus the ratings panel's seven bars.
  - Carbon grade: a footprint plus an Oswald letter. It is never in a square.
- **Scores are opt-in** (You, "Show on dishes"), device-local, and off by default. They appear on hall and Search rows and in
  the sheet's patch row. The ratings panel always shows.
- **Missing data draws nothing.**
- **The meta line is groups** (numbers | scores) that wrap whole, with a 12 px rhythm.
- **Search's hall letters sit under the +**, so a row has the same shape with the toggles on or off.
- **The ratings panel is its own box.** One 1 px rule between its ratings, and no thick bar.

Details and reasoning: NOTES "Round 8".
