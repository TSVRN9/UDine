# F4: One surface, a physical tray

## (a) The flow

The app is one surface with no push navigation. Pages sit side by side: **Today | Worcester | Franklin | Hampshire | Berkshire | Cafés**. It boots on your top-ranked hall at the current meal, so the menu is the first thing you see.

- **Halls:** swipe the surface sideways, or tap a neighbouring title in the strip that tracks your finger.
- **Meals:** a draggable *day ruler* under the title. The meal bands are laid out on a time axis with their hours.
- **Stations:** a geared *station rail* docked just above the tray, in thumb reach. Dragging the rail drives the menu.
- **The tray** is a maroon slab that is always docked.
  - Tap a dish, or lift it with a long press and throw it, and it lands on the tray as a token.
  - The tray grows a row as it fills.
  - Pull it up and it unfolds in place into rows with steppers, totals and Log.
  - Logging tips the plates off. The slab then reads "Logged 3 items, Today 825 cal" (the number rolls up) with Undo.
  - Empty, the tray shows today's running total.

```
   swipe ◀───────────────── one horizontal surface ─────────────────▶
 ┌────────┬───────────┬──────────┬───────────┬───────────┬────────┐
 │ Today  │ Worcester │ Franklin │ Hampshire │ Berkshire │ Cafés  │
 │ totals │ ruler ═══ meal (time) scrub, hours per hall  │ GrabnGo│
 │ logs   │ menu  ↕ native scroll, stations snap         │ events │
 │ rank   │ rail  ◀═ geared to the menu scroll ═▶        │ news   │
 │ export │                                              │        │
 └────────┴───────────── TRAY (always docked) ───────────┴────────┘
   tap / long-press-lift-throw ──▶ token ──pull up──▶ rows+totals ──Log──▶ Today total rolls
```

## (b) Benchmark: Worcester lunch, Beef Brisket Noodle Bowl ×1 + Golden BBQ Chicken Thigh ×2

| # | F4 | Today's app |
|---|---|---|
| 1 | *(nothing: boots on Worcester at lunch)* | tap Worcester on Home |
| 2 | tap Golden BBQ Chicken Thigh (visible on the first screen) | scroll to the Grill station, tap + |
| 3 | tap it again (row taps add; the stepper also works) | tap stepper + |
| 4 | flick the station rail toward Noodle Bowl, and tap the chip if the throw lands a station short | scroll past ~20 dishes, or try the iOS-broken scrubber |
| 5 | tap Beef Brisket Noodle Bowl | tap + |
| 6 | tap Log on the collapsed tray, or pull the tray up and tap "Log 3 items" | open plate sheet, tap Log |

- **F4 fastest:** 4 taps and 1 flick, with 0 navigation pushes, 0 sheets and 0 menu scrolls. Allow one more tap when the flick lands a station off.
- **F4 with review:** add 1 drag (pull the tray up).
- **Today:** about 5–6 taps plus a long scroll.

`bench.cjs` drives this with real CDP touch input:
- It ran the review path. The output was `benchmark: 5 taps, 2 drag, 0 scrolls`; the flick landed on Desserts, so the script tapped the Noodle Bowl chip.
- It asserts "Logged 3 items / Today 825 cal".
- It also exercises long-press-lift-throw, a rail flick that lands exactly on a station start, a swipe to Franklin and a ruler drag to dinner.

`shots.cjs` and `?state=filled|open|lift|logged|today|dinner|late-franklin|search|filter` boot straight into each state.

## (c) Where everything else lives

- **Dietary filters:** filter button at the end of the ruler row, a pull-down menu (Plant based, Vegetarian, Halal, No gluten, Favorites). Filtered-out stations disappear from the rail too.
- **Favorites:** long-press a dish and a heart drop target springs in at the top right. Drop the dish there; the row then shows a heart, and "Favorites" becomes a filter. *Gap:* accessibility needs a non-gesture path, such as a VoiceOver custom action, or a heart in the lifted card's static fallback.
- **Half servings:** the tray stepper goes 2 → 1 → ½ → remove, and + from ½ goes to 1. There's no extra control.
- **Bowl composer (not built):** drop a topping token onto a base token in the expanded tray to nest it. The lift/drop machinery is already there.
- **Search and custom foods:** the empty tray has a search button. The expanded tray has an "Add something else" field that searches all four halls at the current meal. With no match, it offers "Add as custom food" with calories.
- **Head-to-head ranking:** "Which was better?" pairs on the Today page. The derived hall order ("Your halls") also orders the pages and picks the boot hall.
- **Cafés, Grab 'N Go, events and newsletter:** the Cafés page, last page on the right.
- **You pane:** the Today page, first page on the left. It has totals, the log by meal, ranking and Export as CSV/JSON (working downloads). Friends and account would be rows here, outside the core loop.
- **Other dates (not built):** proposal is to drag the ruler past late night to roll into tomorrow.

## (d) What's different, and why it should feel better

1. **No stack and no sheet.** The janky moments today are push transitions and a sheet popping over the list. Here, nothing ever covers the menu without your finger putting it there. Every movement is either 1:1 with a finger or a spring that inherits the release velocity, so there's no discontinuity between drag and animation.
2. **The station rail replaces the right-edge scrubber.** Why the rail is better:
   - It sits in the thumb zone instead of the top-right corner, and works for either hand.
   - It's a visible, labelled object, so it doubles as "you are here". The scrubber was 3px of grey you had to know about.
   - It's geared. The rail's chip centres are piecewise-linearly mapped to the station offsets, so the rail moves continuously as you read the menu. Dragging it turns about 100px of finger into one whole station, with momentum, a snap that lands *exactly* on a station header, and a tick per station.
   - It lives outside the scroll view, so it can't fight iOS's scroll or edge gestures, which is why the scrubber broke.
   - Tapping a chip works too.
3. **The meal decision is a time ruler, not tabs.** Tabs would be equally fast to tap, so the ruler earns its place in three ways:
   - It shows each hall's hours for free ("Lunch 11–4"), which used to need a separate info screen.
   - Time is global across halls. Pick dinner, swipe to Franklin, and you're on Franklin's dinner. Pick late night and swipe to Franklin, and you get "Franklin is closed for late night" with buttons to the halls that are open.
   - It's the same throwable-ruler idiom as the rail, so the app has one gesture vocabulary.

   Tapping a band behaves exactly like a tab.
4. **Adding is direct, and the tap stays.**
   - A row tap adds one, and a dot tosses from the row onto its token in an arc made of two springs with different response.
   - A long press (340ms) lifts the dish as a card. The card peeks at full macros and serving, tilts with velocity, and shrinks toward token size as it nears the tray. Drop it, or just throw it downward: the projected landing point decides. Releasing anywhere else springs the card home.
5. **The tray is an object, not a sheet.** It never pops.
   - Its rest height follows its contents, growing a row of tokens as it fills.
   - Its open height fits what it holds, up to near full screen.
   - Pulling it is 1:1, with iOS rubber-banding past both ends. Tokens fade as the rows unfold with a progress-driven stagger (screenshot `shot-tray-midpull.png`), and the menu behind dims and drifts up 18px.
   - Release projects the velocity and picks the nearer state.
   - When the tray is empty, its face is today's total, so logging visibly *adds to your day* in the same place.

Physics, all in plain JS:
- A semi-implicit-Euler damped spring with 4ms substeps, parameterised SwiftUI-style (response, damping fraction), inheriting gesture velocity.
- iOS momentum projection: `v/1000 · r/(1−r)` with r = .998, tuned per control (.996 rail, .99 pager).
- iOS rubber band: `(1 − 1/(x·.55/d + 1))·d`.
- A 90ms-window velocity tracker that zeroes on a pause.

Haptics, using `navigator.vibrate` (armed after the first touch, so it's a no-op on iOS Safari):
- page change, band crossing and each station crossed
- add and lift
- drop target entered
- a success pattern on Log

Reduced motion turns springs into jumps and drops the flights.

**New components versus D3:**
- the maroon tray slab (D3's tint promoted to a surface; white tokens, AA white-on-#881c1c at 8.9:1)
- the ruler
- the rail

Everything else is D3: grouped cells, system type, the #6c6c70 secondary colour and 44pt controls.

## (e) Risks and open questions

- **Horizontal gesture budget.** There's the pager, the title strip, the ruler and the rail. They're separated by zone (ruler at top, rail at bottom, pager in between), but owners should feel whether flicking the rail ever reads as "change hall".
- **Rail gearing.** A 1:1 rail can't cover 4 stations in one slow stroke, so long jumps need a flick. Flicks land ±1 station, and the chip tap corrects it. A mild fisheye (compressing distant chips) is the next thing to try if that annoys.
- **Row tap = add.** There's no dish detail on tap any more; detail is the long-press peek. Accidental adds while scrolling are cancelled by the scroll, and minus, the stepper and Undo cover the rest. Is that acceptable?
- **Discoverability of lift-and-throw.** There's no caption by design. Tap covers everything, and lift is an accelerator plus the only path to the heart, which is a gap (see Favorites in (c)).
- **Ruler semantics.** People may think the needle's time is the log time; it isn't, because logs are stamped now. It could also host other days.
- **Keyboard over the tray (iOS)** is untested in this prototype. In React Native, use the keyboard-aware inset.
- **Snap is `proximity`.** Free scrolling stays free and only settles onto a header when near one. React Native has no proximity mode (see (f)).
- **Residency.** Tray, log, favorites and rankings stay on the device. Nothing in this flow uploads them.

## (f) React Native implementation

- **Pager:** `react-native-pager-view` (native UIPageViewController / ViewPager2) wrapped with Reanimated's `usePagerScrollHandler`, so the title strip and the ruler/rail fade are driven on the UI thread. Disable the stack's edge-swipe on this screen (there's no stack to pop anyway).
- **Menu list:** `FlashList` (or `Animated.FlatList`) per page, with `useAnimatedScrollHandler` → `scrollY` shared value.
  - Station offsets come from fixed-height rows plus measured wrapped rows (`overrideItemLayout`). This is the hard part: the rail mapping needs every header's offset, including unrendered ones.
  - RN's `snapToOffsets` is mandatory-snap only, so either accept that or snap only when the rail drives the list.
- **Station rail:**
  - Rail position: `translateX = interpolate(scrollY, stationOffsets, chipCenters)`.
  - Driving the menu: `Gesture.Pan()` → `scrollTo(listRef, 0, interpolate(r, chipCenters, stationOffsets), false)` on the UI thread.
  - Release: project the velocity, then `withSpring(nearestChip, {velocity})`. Reanimated's `withDecay` has no snap, so the projection is computed by hand as here.
  - Haptics: `runOnJS(Haptics.selectionAsync)` on station change.
- **Ruler:** the same pattern as the rail. A native `ScrollView` with `snapToOffsets` is the cheap fallback, but per-hall band morphing wants the custom version.
- **Tray:** custom, **not** a native `UISheetPresentationController` / formSheet. Native sheets are modal presentations: they can't stay docked, change rest height with content, or morph tokens into rows.
  - Use either `@gorhom/bottom-sheet` v5 *non-modal*, with `enableDynamicSizing`, custom handle and backdrop, and `animatedPosition` driving the morph and the menu dim. It solves the scroll-inside-sheet handoff for long trays.
  - Or plain `Gesture.Pan` + `withSpring({velocity})` if the handoff can be avoided.
- **Lift and throw:**
  - Gesture: `Gesture.Pan().activateAfterLongPress(340)` on each row, composed so the list's native scroll wins before activation.
  - Card: rendered in a portal (`@gorhom/portal`) at the row's `measure()` frame.
  - Hit-test: against the tray's frame on the UI thread.
  - Throw: separate `withSpring` on x and y with the gesture's `velocityX/Y`.
  - The tap-add arc is the same two springs from the "+" frame to the token's frame.
- **Haptics (expo-haptics):**
  - `selectionAsync`: rail, ruler and page changes
  - `impactAsync(Light)`: add
  - `impactAsync(Medium)`: lift
  - `notificationAsync(Success)`: Log
- **Hard to make feel native:**
  - offset bookkeeping for the rail under virtualization
  - gesture arbitration between the long-press pan and list scroll on Android, where the ScrollView steals the touch after the slop
  - keeping the token→row morph at 120Hz, so animate opacity/transform only and pre-mount the rows
