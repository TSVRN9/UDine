# F3: Goal-driven plate builder

Open `index.html`. Boot states for screenshots are `?state=target|plate|swap|menu|manual|logged|you|filters`. `tools/` holds the build, the data extractor and the self-test (`node tools/bench.cjs`).

## (a) The flow

Home answers two questions on one screen, both above the fold:
- **Where are you eating?** Four hall tiles, one tap to a menu.
- **What should you eat?** The lunch target and 2–3 real plates that hit it.

The target defaults to what's left today divided across the meals still to come. A tick ruler changes it with momentum and snap. A three-way mix (Balanced, More protein, Low carb) changes the macro split.

Tap a plate and it opens as a sheet:
- A live gauge shows calories against the target and P/C/F bars against the mix.
- Swipe a dish row sideways to cycle through nearby alternatives. The quantities refit and the totals roll.
- Tap the row to see every alternative as chips.
- Log.

Manual building is the normal hall menu, with one change: the plate bar knows the target ("446 cal to go for lunch"). The plate sheet offers **Fill to 850 cal**, which completes a hand-built plate around the dishes you picked.

```
            ┌───────────── Home ──────────────┐
            │ W  F  H  B   (hall tiles)        │──tap──▶ Hall menu ──+/−──▶ plate bar ──Log──▶ ✓ Logged ─▶ Home (day total rolls)
            │ 850 cal ruler · mix              │                              │
            │ [plate][plate][plate]  ◀ swipe ▶ │                              └─tap─▶ Plate sheet (Fill to 850 · Add from hall)
            └──────────────┬───────────────────┘                                          │
                           tap plate                                                       │
                           ▼                                                               ▼
              Plate sheet: gauge, rows ◀swipe▶ cycle alternatives, ± ½ steps ──────────▶ Log ──▶ ✓ Logged
```

**Day simulation:**
- **Goal:** 2,200 cal and 150 g protein, with 250 g carbs and 73 g fat.
- **Breakfast already logged:** real Worcester breakfast dishes from Oct 8. Scrambled Eggs, Make Your Own Waffles, Pork Sausage Links and Masala Chai, for 461 cal and 19.8 g protein.
- **Suggested lunch:** `round50((2200 − 461) / 2 meals left)` = **850 cal**.
- **Protein target:** 25%, 35% or 30% of calories, by mix.

## (b) Benchmark: Worcester lunch, Beef Brisket Noodle Bowl ×1 + Golden BBQ Chicken Thigh ×2

| Step | Today (baseline, D3) | F3 |
|---|---|---|
| 1 | Tap Worcester | Tap the **W** tile (top of Home, no scroll) |
| 2 | + on Golden BBQ Chicken Thigh | + (already on screen: Grill Station is the third station, below one Misc dish and two soups) |
| 3 | + again | + again |
| 4 | Scroll past about 20 dishes to Noodle Bowl | **One** fling (about 760 px), or tap the *Noodle Bowl* chip |
| 5 | + on Brisket | + |
| 6 | Log on the plate bar | **Log** on the plate bar, then the "Lunch logged, 404 cal" HUD, then back to Home showing "865 of 2,200 cal today" |

**Totals:** about 5 taps each, plus scrolling, so this is **parity**, not a win. F3 is 5 taps plus 1 fling. The planner never appears on this path. The only addition is a second line on the bar ("446 cal to go for lunch"), which costs nothing.

The plate in the real JSON is 404 cal, 38.9 g protein, 44.7 g carbs and 7.4 g fat. D3's NOTES list 30 g carbs and 14.2 g fat, which is stale.

`tools/bench.cjs` drives this path with real clicks and wheel input. First it opens the Worcester *proposal* and dismisses it, to prove a peeked plan never leaks into the hand-built plate. Then it asserts:
- the thigh is visible without scrolling;
- the brisket is visible after one scroll;
- the log entry is Worcester (not Berkshire's 220-cal brisket), ×2/×1;
- the day total is exactly 461 + 404 = 865.

It then runs the planner path: ruler drag, pager swipe, open plate, swipe-swap a dish, check that the refit stays near target, Log. Both pass.

**Planner path, for someone who doesn't know what they want:**
- Accept the suggestion: **2 taps** (plate card, then Log).
- Each tweak adds one swipe.
- Changing the target adds one ruler drag.

## (c) Where every "must have a home" feature lives

| Feature | Home in F3 |
|---|---|
| Dietary filters | Filter glass button on Home, which opens a sheet with Vegetarian, Plant based and Halal. Filters constrain the planner (no proposed plate breaks them) and the hall menus and search. The button fills maroon when a filter is on. |
| Favorites | Not drawn. They belong as a heart on menu rows, and as a planner bias: a small score bonus for favorited dishes, so proposals lean toward food you like. |
| Half servings | The plate sheet's steppers move in ½ steps and the planner proposes ½ portions. The menu's + stays at whole servings, to keep the benchmark at one tap per serving. |
| Bowl composer | Unchanged. It's a row on build-your-own stations in the hall menu (Noodle Bowl, Pasta Bar, Deli Bar). The planner never assembles bowls. Deli Bar, sauces and toppings are excluded from proposals (see below). |
| Search and custom foods | The search glass button searches lunch at every hall, token-AND, with the hall shown on each row and the same steppers and plate bar. A no-match state offers inline calories and protein to log a custom food. |
| Head-to-head ranking | Today pane, then Rank dishes (shallow). Rankings would feed the planner's hall order the way they derive favorite halls today. |
| Cafés | "Cafés and markets" row under the plates (shallow list). |
| Events and newsletter | Today pane row (shallow). |
| You pane | Person button. Day total against the goal (the same bar component as the plate gauge), meals logged with items, and Export my data, which downloads the device log as JSON. |

Everything, the planner included, runs on the device from the menu fetch. No account is involved, and nothing about the log, the target or the proposals leaves the phone.

## (d) What's genuinely different, and why it should feel better

1. **The app does the arithmetic.** Today you add dishes and check the total afterwards. Here the target is visible from the first screen, and every surface measures against it: plate cards, the sheet gauge, even the manual plate bar's "446 cal to go".
2. **Something useful on screen before you tap anything.** Home leads with three concrete plates of real dishes near your number, not four hall names. That answers "feels empty and generic".
3. **Swap instead of scroll.** Tweaking a plate is a sideways swipe on one row, ordered by macro closeness. The ordering is same station first, then the same role elsewhere in the hall. The quantities refit to the target after every swap, and the numbers roll. You never browse a 60-dish list to replace one item.
4. **Planner and manual share one plate (a better mechanism than "two modes").** Manual adds are pinned and the planner only moves unpinned rows. So "I know I want the brisket, fill the rest to 850" is one tap (*Fill to 850 cal*), and a user who wants nothing from the planner never sees it.
5. **Proposals are drafts.** Opening a plate never touches what you've hand-built at that hall. Only *Log* commits it, or *Add from {hall}*, which merges it into your manual plate.

**Algorithm (honest by construction).** I used a bounded exhaustive search, a tiny knapsack, instead of greedy. Greedy adding one dish at a time is myopic with quantities: it grabs the densest protein and then can't fit a side.
- **Plate shape:** one protein anchor plus an optional starch plus an optional side, all from the hall's lunch menu.
- **Quantities:** the anchor takes 1–3 servings and the others ½–2, in ½ steps.
- **Search size:** about 100–200k combinations per hall, about 10 ms in total for all four halls.
- **Score:** `4·(cal error/T)² + 3·(protein shortfall/PT)² + 0.6·(carb error/CT)²`, plus tiny penalties for halves, more than two servings, piling up sides, and a missing side.
- **Selection:** the best plate per hall, then the top 3 halls.
- **Roles come from the dish's own macros:**
  - protein: at least 8 g and at least 22% of calories;
  - starch: at least 80 cal and at least 45% of calories from carbs;
  - side: everything else.
- **Exclusions:** dishes under 40 cal, and the stations Desserts, Soups and Deli Bar. Also any name matching `sauce, chutney, parmesan, american cheese, provolone, sour cream, pico, guacamole, salsa, queso, topping, raita, cilantro, scallions, bean sprouts, red onions, broth, for pho, pho noodles, pho base, \bbar\b, hummus, tear drop, kachumbari, marinara`. These stay in the menu and in search; they just never anchor a proposal.
- **Swap and refit:** each row's cycle is computed when the plate opens and holds up to 6 dishes. After a swap, the unpinned rows' quantities are re-searched over their grids.

## (e) Risks and open questions

- **Plate plausibility.** The search is arithmetically right but has no taste. Hampshire's best Balanced plate is 2 Grilled Chicken Breast + 2 Teriyaki Tofu Rolls + 1 Tamale Corn Cake. Real, on target, a bit odd. Ranking and favorites as a score term are the obvious fix. Station "cuisine coherence" (prefer a starch from the anchor's station) is another.
- **Role heuristic.** Brisket Noodle Bowl (22.6% protein) counts as a protein anchor, and fries count as a "side". Real dishes need curated roles, or the FoodPro category.
- **Serving units.** "½ × Hard Boiled Egg (2 EACH)" is fine, but ½ of "1 roll" sushi is not something a server hands you. The planner should only propose halves where the serving divides.
- **Hall choice ignores where you are.** A Berkshire plate at the top is useless if you're standing in Worcester. Use the last-visited hall or the hall-rank order to break ties.
- **Swipe discoverability.** The swipe is signalled by the page dots, a soft fade at the right edge, and a one-time 44 px nudge of the first row when the sheet first opens (skipped under reduced motion). I'm unsure that's enough without a caption. Tapping the row reveals all alternatives as chips, so the feature is reachable with no gesture at all.
- **The target is only calories plus a mix preset.** Lifters will want a hard protein number. A second ruler, or long-pressing the protein bar to set it, is the next step.
- **After logging lunch,** Home still says "Plan lunch". It should roll over to dinner with the new remaining.
- **D3 deviations, all new components D3 doesn't have:**
  - the tick ruler;
  - the paged plate cards;
  - the fit bars (fill = value ÷ 1.25·target, with the target tick at 80% and a darker fill past +10%);
  - the swipe rows;
  - the content-fit medium detent, where D3 uses a fixed 440.

## (f) React Native implementation

- **Target ruler.** RNGH `Gesture.Pan()` plus Reanimated `withDecay({ velocity, clamp })`, then `withSpring` to the nearest 10-cal tick. Fire `Haptics.selectionAsync()` from `runOnJS` each time the value crosses a 50-cal mark. Draw the ticks with one `react-native-svg` path (or Skia) inside an `Animated.View` translated on the UI thread. Don't use a ScrollView: decay plus snap is easier to tune.
- **Plate pager.** A horizontal `FlatList` with `snapToInterval={cardW + gap}`, `decelerationRate="fast"` and `disableIntervalMomentum`, which gives native momentum and one-page-per-fling. `react-native-pager-view` is the alternative.
- **Plate sheet.** `@gorhom/bottom-sheet` with `enableDynamicSizing` (content-fit medium) plus a `[‘100%’]` large detent, a `BottomSheetFooter` for the pinned Log button, and `BottomSheetScrollView` for the body. A native `formSheet` (expo-router `presentation: 'formSheet'`, `sheetAllowedDetents: 'fitToContents'`) is more native, but nesting horizontal swipe rows inside it is harder to control.
- **Swipe-to-cycle rows.** `Gesture.Pan().activeOffsetX([-12, 12]).failOffsetY([-8, 8])`, so vertical drags fall through to the sheet and scroll view. Pass `simultaneousHandlers` to gorhom so they don't fight. The translateX shared value carries prev/current/next slots. On commit, call `withSpring` to ±cardW, then `runOnJS(swap)` and reset. This is the hardest part to make feel native: sheet pan versus row pan versus iOS edge-back all compete at the start of the gesture.
- **Live totals.**
  - Numbers: Reanimated `entering={SlideInDown}` / `exiting={SlideOutUp}` on a `Text` keyed by value, or a per-digit odometer.
  - Bars: `useAnimatedStyle` with `transform: [{ scaleX }]` and `withSpring`.
- **Menu steppers and plate bar.** These are D3's existing components. The bar adds one derived line.
- **Planner compute.** About 0.5–1M score evaluations per recompute. That's fine on Hermes (tens of ms) if it runs only when the ruler settles and is memoized on (target, mix, filters, menu date). It's a candidate for a shared `@udine/shared` function with a unit test, because web would want the same plates.
- **Haptics.** `selectionAsync` for ruler, pager and segmented steps; `impactAsync(Light)` for steppers and swaps; `notificationAsync(Success)` for Log.
