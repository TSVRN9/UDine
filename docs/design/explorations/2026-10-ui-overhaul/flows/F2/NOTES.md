# F2: Habits and after-the-meal logging

Files: `index.html` (built, 68 KB, self-contained), `src.html` + `build.py` (embeds the real lunch menus for all four halls and the seeded history from `../menu-2026-10-08.json`), `drive.js` (screenshots plus the end-to-end benchmark), and `shot-*.png`.
Boot states: `?state=` `home` (seeded, default), `empty` (first run), `checklist`, `checklist-picked`, `checklist-search`, `checklist-nomatch`, `empty-search`, `again`, `logged`, `qty`, `you`, `halls`, `rank`, `empty-logged`.

## (a) The flow

Home is **Today**. It shows today's totals so far, then the current meal (Lunch, Thursday 12:40). Under that is everything the device already knows about you, matched against what is actually being served right now:

- **"Same as Tuesday"**: past lunch plates whose every dish is on that hall's menu today. They sit in a snap carousel, with the hall you eat at most first.
- **What did you have at Worcester lunch?**: the after-the-meal checklist. Worcester is your most frequent lunch hall, derived on the device.
- **Your usuals**: dishes you've logged 2+ times that are being served now. Each shows your usual quantity and a + that logs it in one tap.

Every log is a single action followed by an Undo toast. There are no confirmation dialogs. Browsing halls moved to the secondary **Halls** tab, which opens the same checklist sheet. **You** holds history ("Log again"), ranking, filters and export.

```
                  ┌─────────────── Today ───────────────┐
 first run:       │ "What did you have for lunch?"      │
   hall tiles ────┤  [W][F][H][B]  + Search every hall  │
                  │                                     │
 with history:    │ totals  ·  Lunch                    │
                  │  ├ Same as Tuesday  [Log] ──────────┼──► logged + Undo toast
                  │  ├ What did you have at Worcester? ─┼─┐
                  │  └ Your usuals  (+) ────────────────┼─┼► logged + Undo toast
                  └─────────────────────────────────────┘ │
   Halls tab ── hall tile ───────────────────────────────►│
   You tab ── Log again (any past plate) ──────────────►  ▼
                         ┌── checklist sheet (large ⇄ medium detent) ──┐
                         │ hall segment · search (+ other halls)       │
                         │ Your usuals / past plate · stations…        │
                         │ tap row = +1, (−) = −1 → ½ → 0              │
                         │ [ Log lunch, 404 cal ] ─────────────────────┼─► Today, Undo toast
                         └─────────────────────────────────────────────┘
```

## (b) Benchmark: Worcester lunch, Brisket Noodle Bowl ×1 + Golden BBQ Chicken Thigh ×2

`drive.js` runs every path below end to end. For each one it asserts the toast, the lunch total (404 cal; 38.9 g P, 30 g C, 14.2 g F, the same figures D3 checked), the day total (337 → 741), and that Undo restores everything.

| Path | Taps | Typing | Scrolls | Notes |
|---|---|---|---|---|
| Today (baseline) | ~5 | 0 | 1–2, past ~20 dishes | hall → find both → steppers → plate sheet → Log |
| **A. Seeded: "Same as Tuesday" card → Log** | **1** | 0 | 0 | Only works because the seed holds a Tuesday Worcester lunch with exactly this plate |
| **B. Seeded: two usuals** | **2** | 0 | 0 | The Thigh usual defaults to ×2, the mode of your history |
| C. Seeded: after-the-meal checklist | 5 | 0 | 0 | Row → Thigh row ×2 → Brisket row → Log. Both dishes are pinned at the top under "Your usuals" |
| **D. First run, search** | 6 | "bris", "bbq" | 0 | Worcester tile → search → Brisket → type → Thigh ×2 → Log. The keyboard stays up and the query is pre-selected after each pick, so the second query replaces the first without a clear tap |
| D′. First run, no typing | 5 | 0 | 1 short flick, past ~14 rows | Worcester tile → Thigh ×2 (visible without scrolling) → flick → Brisket → Log |

The honest comparison with today is D/D′: on the first day this flow costs about the same as the current one. The payoff starts after the first log. From then on, the same plate is 1 tap and the same dishes are 2 taps, at any hall that is serving them.

## (c) Where every "must have a home" feature lives

- **Dietary filters.** You → Dietary filters (Vegetarian, Plant Based, Halal). The checklist hides non-matching dishes, but never ones you've already picked. Long term these should also get a filter control in the sheet header.
- **Favorites** (spotted-elsewhere alerts). Not built. They would go in the quantity popover and as a long-press on checklist rows, as a star. Usuals are derived and favorites are explicit, and the two can coexist. A favorited dish served at another hall today would be the natural extra row in "Your usuals" ("at Berkshire").
- **Half servings.**
  - In the checklist, − steps 1 → ½ → 0, so halves need no extra control.
  - On Home, tapping a usual or logged row opens a ½ / 1 / 2 / 3 popover.
- **Bowl composer.** Not built. Build-your-own rows (Noodle Bowl, Hampshire's pho parts) would push a composer page inside the same sheet. The composed bowl is then logged as one item, and so becomes a usual or a "Same as" plate like any dish.
- **Search and custom foods.**
  - Sheet search ranks the current hall's matches, keeps your picks visible ("Picked"), and lists matches "At other halls" with a one-tap hall switch.
  - No match offers "Add “…” as a custom food". This is shallow: zero macros, and the real entry form is not built.
  - First-run Home has "Search every hall".
- **Head-to-head ranking.** You → Rank → "Which was better?" pairs dishes from your own history. It derives a favorite hall, all in memory and on the device. A good later placement: one comparison card on Today right after you log, built from today's dish and a usual.
- **Cafés.** Halls → Cafés and markets → a detail page with hours and "Add a custom food".
- **Events and newsletter.** Halls → Around campus. Shallow empty-state pages.
- **You pane.**
  - Today's entries.
  - Earlier days, each with "Log again". It opens the checklist prefilled with that plate; a dish not on today's menu stays selectable from its stored macros.
  - Rank, filters, and Export as JSON / CSV (real Blob downloads).

**Residency.** Usuals, "Same as" plates, the default hall and ranking are all computed from the on-device log. Nothing is uploaded. The first-run screen uses only the public menu, with no "popular at…" list (that would need other people's logs).

## (d) What's genuinely different, and why it should feel better

- **It starts from you, not from the hall.** The current flow makes you re-find the same two dishes in a 61-row list every day. Here the things you actually eat come to you, filtered by what's served right now.
- **Logging is decoupled from the moment of eating.** The question is in the past tense, so it works on the walk out. Picking is ×1 per tap and needs no + button to aim for, and the list leads with your usuals at that hall.
- **No plate sheet in the middle.** The checklist is the plate. Its footer always reads "Log lunch, 404 cal", and one tap ends the flow, which removes the sheet-on-sheet step the owner called janky.
- **Undo, not dialogs.** Every destructive or committal action is instant and reversible: log, remove, swipe-delete, and changing a quantity.
- **One sheet for everything.** After-the-meal, Log again and browsing a hall all open the same component. It is a real detent sheet: large ⇄ medium, rubber-banded, velocity-snapped, and the list hands off to the sheet drag at scroll-top. The footer stays pinned to the visible bottom at either detent.

Mechanisms I found while building, beyond the brief:

1. "Same as …" is a **carousel ranked by hall habit, then recency, deduped by plate**. Most-recent-only would have shown yesterday's Hampshire sushi, which isn't the habit.
2. **Type, tap, type.** In search the keyboard stays up through picks and the query auto-selects, so the next word replaces it.
3. **"At other halls" in search.** Berkshire also serves a Beef Brisket Noodle Bowl at 220 cal, not 218. Search shows that, and a usual resolves to the hall you usually eat it at, so the logged macros are the right ones.
4. **Row tap = +1, − goes down to ½.** That means one control instead of add-button, stepper and half toggle.

## (e) Risks and open questions

- **Wrong hall or meal guess.** "What did you have at Worcester lunch?" assumes your most frequent hall; the segmented control fixes it in one tap. The prototype hardcodes lunch. Real after-the-meal logging also means logging *breakfast* at 12:40, so the sheet needs a meal switch. Only lunch menus are embedded here, which is why it isn't built.
- **Accidental one-tap logs.** The undo window is 6 s. After that, swipe-delete or the popover's Remove fixes it. A 6 s toast floating above the tab bar hides the last usual row and may annoy people who log several things in a row.
- **Usual heuristics.** The threshold of 2 logs and count-only ranking ignore recency. A semester-old habit will crowd out this week's. Should usuals decay?
- **Dish-name matching.** Renamed dishes ("Grilled Chicken Thighs" at Berkshire vs. "Golden BBQ Chicken Thigh") won't match. A RecNum-keyed match via the FoodPro Web INA would be sturdier.
- **First-run parity only.** Day one costs about what today's flow costs. If most users churn before their second log, the concept's advantage never shows.
- **Keyboard covers the footer** on iOS Safari while searching. RN has a fix (see f); the web prototype doesn't.
- **Tab bar is a D3 deviation.** D3 had no tab bar. I added a three-tab floating capsule because Halls and You needed homes once Home stopped being the hall list.
- **Mouse limits.** On desktop the sheet drags from its header only. The list → sheet handoff is touch-only, because it needs `touchmove` with `preventDefault`.
- **Not verified on a phone.** Every gesture was verified only in headless Chromium: header drag and swipe-delete with the mouse, and the list → sheet handoff with CDP touch events, both from the top of the list and from a scrolled list. iOS Safari can make a touchmove non-cancelable once native scrolling has started. The handoff therefore commits on the first 2px of a downward drag at scroll-top, and falls back to scrolling when `e.cancelable` is false. It still needs a real-device check.

## (f) React Native implementation

- **Checklist sheet.** Use the native sheet: expo-router / react-native-screens `presentation: 'formSheet'` with `sheetAllowedDetents: [0.58, 1]`, `sheetGrabberVisible`, and `sheetLargestUndimmedDetent` unset. On iOS this gives the real scroll-to-sheet handoff, rubber band and presenting-view scale for free. That is exactly the part that feels fake in any JS sheet, including `@gorhom/bottom-sheet`, which is likely the source of today's jank. The hard part is the **pinned footer at the medium detent**. Either keep the Log button inside a `KeyboardStickyView` (react-native-keyboard-controller) anchored to the sheet's visible bottom, or use screens' sheet-footer support where available. Prototype this first.
- **List.** `SectionList`, or FlashList v2 with sticky headers, as the menu: sticky station headers plus a pinned "Your usuals" section. Rows are `Pressable` (+1). The − control is a separate `Pressable` with `hitSlop`. The count badge pops with a Reanimated `withSpring`.
- **Search.** `keyboardShouldPersistTaps="handled"` on the list keeps the keyboard up across picks (this is the web prototype's mousedown trick). After each pick, `setSelection(0, len)` gives type-tap-type.
- **Home.**
  - `ScrollView` with a horizontal `FlatList` for the "Same as" carousel (`snapToInterval`, `decelerationRate="fast"`).
  - Usual rows: `Pressable` + `expo-haptics` (`impactAsync(Light)` per add, `notificationAsync(Success)` per log).
  - The quantity popover maps to a native menu: zeego `DropdownMenu`, a UIMenu on iOS.
- **Swipe-to-delete.** `ReanimatedSwipeable` from react-native-gesture-handler.
- **Undo toast.** A custom Reanimated view with a `Gesture.Pan()` dismiss. The 6 s timer pauses while it's being touched.
- **Data.** Usuals, plates and the default hall are SQL views over the expo-sqlite log, joined against the cached menu, all on the device. Undo is a transaction rollback, or a soft delete with a timestamp.
- **Hard to make native.** Android has no equivalent of the iOS sheet's presenting-view scale (screens uses BottomSheetBehavior). Android haptics vary by device. A tab bar plus a formSheet plus the keyboard is the combination most likely to need on-device tuning.
