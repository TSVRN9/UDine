# F1: Dish-first, right now

## (a) The flow

The app opens on **Lunch**: every dish being served now at all four halls, one row per dish. Halls appear on each row only as small letter tags. Toppings (anything under 40 cal) are folded away, which leaves 125 rows out of 216. Rows are grouped by kind of food (Chicken & turkey, Bowls & noodles, …), ranked by protein per calorie, and capped at 5 per group.

- **Hall filter.** A segmented control (All / Worcester / Franklin / Hampshire / Berkshire) filters the feed. You can tap it or drag across it.
- **Lenses.** Chips re-rank the whole campus in place: High protein, Light, Vegetarian, Halal, Favorites. Rows FLIP to their new positions.
- **Adding a dish doesn't pick a hall.** The plate's hall is the **intersection** of the halls serving everything on it. When that set first forms, the feed regathers: a "Worcester" section rises to the top, everything else sinks under "Other halls", and the hall gets a dot in the segmented control.
- **Dishes that can't join your plate** keep their + button, drawn as an outline. Tapping one starts a **second plate**. The plate bar becomes a swipeable pager of alternative plates, and the feed re-centers on whichever plate is in front.
- **Logging.** Log sits on the plate bar, so logging takes one tap. Logging one plate discards the other alternatives, and Undo restores everything. The plate sheet (with detents) is optional.

```
           ┌──────────── Now (default) ─────────────┐
 launch ──▶│ All halls · grouped by food · lenses   │──tap row──▶ Dish sheet (halls, goes-with, ★, compare)
           │        + any dish                      │
           └──────────┬─────────────────────────────┘
                      ▼ plate halls = ∩ halls serving each item
           ┌─ feed regathers: [Worcester] ▸ [Other halls] ─┐
           │  + compatible dish  → same plate (∩ narrows)  │
           │  + outlined dish    → 2nd plate (pager)       │
           └──────────┬────────────────────────────────────┘
                      ▼ Log (bar)  — or tap bar → plate sheet → Log
              Logged Worcester lunch · Today 798 cal · Undo
 Halls tab ─▶ hall list ─▶ classic station menu (same rows, same plate)
 You tab   ─▶ today totals, logs, compare dishes, export
 Search    ─▶ any dish incl. toppings ─▶ "Add … as a custom food"
```

## (b) Benchmark: Worcester lunch, Golden BBQ Chicken Thigh ×2 + Beef Brisket Noodle Bowl ×1

`test.js` drives this with touch taps in Chromium (`node test.js`). It asserts that the logged entry's hall is Worcester and that the Brisket was logged at Worcester's 218 cal, not Berkshire's 220. It also asserts that the day total goes from 394 to 798 in both the header chip and the confirmation.

| # | Path A, order as written, nothing preselected | Taps | Scroll |
|---|---|---|---|
| 1 | Golden BBQ is the 5th row in Chicken & turkey, visible on launch. Tap **+**. The plate becomes Worcester and the Worcester section rises with Golden BBQ at its top. | 1 | 0 |
| 2 | Tap **+** on its stepper to make it ×2 | 2 | 0 |
| 3 | Beef Brisket is now two rows below, under Bowls & noodles. Tap **+**. It's also served at Berkshire, but the plate is already Worcester-only, so nothing asks which hall. | 3 | 0 |
| 4 | Tap **Log** on the plate bar. The bar shows "Logged Worcester lunch, Today 798 cal" with Undo, and the header chip counts 394 → 798. | **4** | **0** |

- **Path B, Brisket first:** 4 taps and 1 scroll, because Brisket starts below the fold. After + the plate is "Worcester or Berkshire". Golden BBQ is in reach in the regathered section, and tapping it narrows the plate to Worcester with no prompt.
- **Path C, user starts by tapping the Worcester segment:** 5 taps, 0 scroll.
- **Today's app:** about 5 taps (Worcester, then the three adds, then Log) plus scrolling past about 20 dishes. F1 saves the hall tap and the whole scroll; Log-on-the-bar is the same as the D3 baseline.
- If the plate is still ambiguous at Log (Brisket only), the Log button turns into "Worcester | Berkshire" inline. That's one extra tap, and it only happens when the hall genuinely isn't known yet.

## (c) Where everything else lives

| Feature | Home in F1 |
|---|---|
| Dietary filters | Vegetarian and Halal lenses in the feed (they combine with each other, with the hall filter and with sorting) |
| Favorites | ★ in the dish sheet; a Favorites lens; a small star on the row. The lens has a real empty state. |
| Half servings | Steppers step down 2 → 1 → ½ → remove, in both the feed and the plate sheet |
| Bowl composer | Dish sheet → "Goes with": the sub-40-cal components from the same station at the same hall (bean sprouts, cilantro and scallions for the noodle bowl; the pho components at Hampshire). Each one adds to the same plate. |
| Search + custom foods | Search button in the tab bar → matches every dish, including toppings → "Add "…" as a custom food" → form → plate. Custom items don't constrain the plate's hall. |
| Head-to-head ranking | Dish sheet → "Compare with another dish", and You → "Compare dishes". Ends with derived favorite halls. All on-device. |
| Cafés | Halls tab → Cafés & markets (shallow screen) |
| Events, newsletter | Halls tab rows (empty-state screens) |
| You pane | You tab: today's totals, each logged meal with hall and items, compare, "Export my data" (real JSON download) |
| Classic hall browsing | Halls tab → hall → station-grouped menu with all dishes, using the same rows and the same plate. Also reachable by tapping a hall in any dish sheet. |

Residency: everything is in memory. The ranking, favorites, plate and log never leave the page.

## (d) What's genuinely different, and why it should feel better

1. **The plate picks the hall, not the user up front.** Hall-first navigation is replaced by the set intersection of halls serving the plate's items. That turns "which hall?" from a gate into something inferred. The data rewards this: 40 of 161 lunch dishes are served at two or more halls (Brisket at W and B, Grilled Chicken Breast at F, H and B, Posole everywhere). Each of those adds with no hall decision at all.
2. **The commit is spatial, not a caption.** After the first add, the hall's other dishes move up around the plate, and the hall gets a dot in the filter. Dishes that can't join get an outlined +. Nothing says "you're locked to Worcester". The layout does.
3. **Conflict becomes "alternative plates".** A student deciding between halls by food is exactly the dish-first user. Building a Worcester plate and a Franklin plate side by side, swiping between them, and comparing totals answers "where should I eat" with numbers. Logging one discards the others, with Undo.
   - *This replaced the sketch's "adding locks you to the hall".* A hard lock forces a modal ("switch halls?"). Intersection plus alternative plates never interrupts.
4. **The noise is gone.** Merging the same dish across halls (216 rows to 161) and folding sub-40-cal toppings into "Goes with" (to 125) means the first screen is food you'd actually choose. The bowl composer falls out of the same move.
5. **No gate, no hunt.** D3's baseline already has Log on the bar, so that isn't new. What's new is the two steps that disappear: there's no hall tap before you see food, and no scroll to find it, because the first screen is mains from every hall and the second screen is your hall's food gathered around the plate.
6. **One scroll surface.** There's no horizontal meal pager under the list, which was the owner's "awkward swipe". The only horizontal gestures are the hall scrub (on a control) and the plate pager (on the bar).

## (e) Risks and open questions

- **The benchmark leans on ranking.** Golden BBQ is 5th by protein per calorie in a group capped at 5. Had it ranked 6th, path A would need a "Show 7 more" tap. The real fix is a personal ranking: on-device logs and Beli ranks float your usual dishes. I didn't seed one, to keep the benchmark honest.
- **The regather moves the scroll position.** On first commit the list scrolls to put the hall's header as high as possible while keeping the tapped row above the plate bar. FLIP makes the move legible, but it needs testing on a phone; some users may find any reflow under their thumb disorienting. A fallback is to regather only the content below the tapped row.
- **Accidental second plates.** Tapping an outlined + by mistake makes a second plate. Undoing it means stepping the dish down twice (×1 → ½ → gone) or swiping the plate empty, and people may not notice the pager dots. Does the second plate need a stronger entrance than dots?
- **Discard-on-log.** Discarding alternative plates on log assumes people eat at one hall. If you genuinely ate at two halls, you'd log one, Undo, then log the other separately; that path is clunky.
- **½ before remove.** Removing a dish takes two taps from ×1. It's discoverable, but slower for removal. An alternative is long-press for ½.
- **The toppings rule.** Anything under 40 cal leaves the feed. That also hides Steamed Broccoli (29) and Corn on the Cob (31); they're still in search, "Goes with" and the classic menu. A station-type rule (build-your-own stations only) would be more precise.
- **Lunch only.** "Right now" needs a way to look ahead, such as "Dinner from 4:30" at the end of the feed, or a meal control in the large-title area. It's not prototyped. Only lunch data is embedded.
- **Three-hall plate labels** ("Franklin, Hampshire or Berkshire") truncate in the bar.
- **Location.** On-device location could pick the hall you're standing in, without the data leaving the device. I didn't assume it.
- **Classic menu has no station scrubber.** The secondary path is a plain station list.
- **Edge-swipe back** on pushed screens is custom (24px left edge). On a real phone it competes with iOS Safari's own back swipe and Android's system back gesture; in the native app the stack's gesture replaces it.
- **Custom-only plates** have no hall and log as "Logged lunch". A plate holding a dish served at all four halls asks which hall at Log (four inline buttons).

**Departures from the D3 tokens** (new components):
- A floating iOS-26-style tab bar with a separate search button. D3 had no tab bar.
- The plate bar as the tab bar's accessory, with a pager and dots.
- Hall letter tags on rows: grey, or tint-on-tint for the hall the row's numbers come from.
- Lens chips.
- An outlined + for dishes that would start a new plate.
- A hall section header with a maroon disc.

Everything else uses D3's tokens: #f2f2f7, #fff, #000, #6c6c70, #881c1c, #f1e4e4, the system font with Inter, and the 44pt steppers.

## (f) React Native

- **Plate sheet:** a native sheet. Use expo-router `presentation: 'formSheet'` with `sheetAllowedDetents: [0.55, 1]` and a grabber, or a native `UISheetPresentationController` via react-native-screens. This gets real detents, rubber-banding and scroll handoff for free. The prototype's custom sheet only hands off at the large detent; the native sheet does it properly. `@gorhom/bottom-sheet` is the fallback if the sheet must sit above the tab bar.
- **Dish sheet:** the same native form sheet.
- **Feed:** LegendList or FlashList v2 with stable keys (`d<id>`, section headers as items) and `maintainVisibleContentPosition` for the anchor-on-add. The FLIP regather maps to Reanimated layout animations (`itemLayoutAnimation={LinearTransition.springify()}` on `Animated.FlatList`). **This is the hard part.** Layout animations over a virtualized, recycled list are fragile: off-screen rows aren't mounted, and recycling fights the item-keyed transitions. Budget time here, or regather with a cross-fade of the reordered region.
- **Hall control:** `@react-native-segmented-control/segmented-control` on iOS is a real `UISegmentedControl`, which already supports drag-scrub and selection haptics. Android needs a custom version with a Gesture Handler `Pan` and a Reanimated thumb.
- **Lens chips:** a horizontal ScrollView of Pressables.
- **Plate bar pager:** `react-native-pager-view` (native paging), or a Gesture Handler `Pan` with `withSpring` snap. It sits in the tab bar's bottom accessory on iOS 26 (`UITabBarController` bottom accessory). Check whether expo-router's native tabs expose it; otherwise position it absolutely above the tab bar.
- **Edge-swipe back** on the classic menu: a native stack, free.
- **Haptics:** expo-haptics.
  - `selectionAsync` for the hall scrub and pager snap
  - `impactAsync(Light)` for add and the stepper
  - `impactAsync(Rigid)` for remove
  - `notificationAsync(Success)` for Log
- **Counting total:** a Reanimated shared value driving `TextInput` text, or a plain state tick (cheap).
- **Reduced motion:** Reanimated's `useReducedMotion()` gates the springs and FLIP, falling back to opacity.

## Files

- `index.html`: the prototype (72 KB, self-contained; generated)
- `src.html` + `build.js`: the source; `node build.js` embeds the lunch data from `../menu-2026-10-08.json` and asserts the plate math (404 cal, 38.9 g protein)
- `test.js`: the benchmark driver plus conflict, plate-pager swipe, sheet drags (from header and from body, both sheets), hall scrub, edge-swipe/back-tap and custom-plate checks. Drags go through CDP `Input.dispatchTouchEvent`, i.e. Chromium's real touch pipeline with touch-action arbitration, not synthetic PointerEvents. Still not a phone.
- `shot.sh <state>`: headless screenshot
- States (`?state=`): `feed`, `plate`, `sheet`, `conflict`, `logged`, `dish`, `lens`, `ambiguous`, `choose`, `halls`, `menu`, `you`, `search`, `rank`
- `shot-*.png`: feed, plate (after commit), sheet, conflict (two plates), logged, dish
