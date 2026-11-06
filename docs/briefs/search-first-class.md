# Search first class: Search keeps the open hall, and every dish row it finds can be logged

Goal: anything you can find in Search you can put on the plate, and while you have a hall open, Search
treats that hall as where you are. Today, tapping the Search tab closes the open hall. Only dishes served
right now have a +, and a + on a dish served at several halls leaves which hall it logs at to the plate.

Owner decisions (2026-11-05, in chat):
- "promote search to first class: I should always be able to log a food item when I search it up, and it
  should correspond to the place I already am at if I have a dining hall open"
- With a hall open, **the Search tab keeps the hall**. The hall stays open under the Halls tab. Search ranks
  that hall's dishes first, and + logs them there.
- Dishes served later today or tomorrow get a + too. It logs to **the meal happening now**, at the hall you're
  in if it serves the dish, otherwise at the hall the row lists.

## Spec

UI: M2 `#tab-search` (`flows/M2/src.html` `renderSearch`, the `.row.later` template at about line 1952,
`restand`/`setCtl` at about line 2554). This brief **departs from M2 on purpose** in two places. Later rows get the
same control lane as now rows, and Search has a "here". M2 is not updated first. The owner's answers above are
the decision of record, and the Flutter oracles that assert the old behaviour change and cite this brief.
`app/test/core/m2/search_test.dart:94` ("none with a control group") is the known one. Grep for others.
Everything M2 measures stays as it is: a Later row with a + uses the now row's lane and measurements, and keeps its
own meta line ("Dinner", "Tomorrow lunch", then the letters). With no place open, Search's order, groups and rows
are exactly M2's, so the existing M2 tests still hold.
Annotations: none.

**"here"** is derived from the live navigation, not from `prefs.lastHall`. `lastHall` is in-memory but means "opened
last", and it outlives a closed hall. here = the place page (a hall's `HallMenuPage`/`HallPage`, a café's, or a
Grab 'N Go's) on top of the **Halls tab's** stack when Search is shown. A place page that Search itself opens (a hall
card or café row in the results) doesn't set it, because that page's own + already logs at that place. Closing the
hall clears here.

States (each a real branch; tests for all, a screenshot for each one marked †):
- no place open: Search as today, hint "Search lunch at every hall" †
- here = Worcester, and the dish is served now at Worcester and elsewhere: it ranks first. + adds it with refs
  narrowed to `{W: d}`. The tags still show every hall serving it †
- here = Worcester, and the dish is served now only elsewhere: + adds with the row's own refs, as today
- a Later or tomorrow dish: + adds to the current meal (`index.meal`, i.e. `clockMeal(now)`, the meal the plate
  bar already uses). Refs: `{here: d}` when here serves it in that serving, otherwise the row's listed halls †
- a variant-family Later row: `LaterEntry` has no `_stand`/refs path today. The + adds the variant the row
  shows (its chip), keyed as `_stand` keys a now row
- no meal running (`at=…T23:30`): + adds to whatever `clockMeal` names. Same rule, no special case
- here is a café (`c<n>`): the same rules, with `ctx` = the café for `findItem`
- after a +, the same row's stepper shows 1, and a second + steps it to 2 (no duplicate item). This holds for a
  narrowed ref and for a Later row
- the plate's "Add something else" (`ShellApi.openSearch({meal})`, which drops `meal` today): Search adds to that
  plate's meal for that visit (until the tab is left or the query is cleared)
- tracking off: no + anywhere. Unchanged
Hint: "Search lunch at Worcester" when here is set. That is end-user copy, so it is allowed. Nothing else says where
a + logs: no "Logging at …" line, no caption (CLAUDE.md, "No explanatory captions in UI").
Routes: `/?data=recorded&at=2026-10-08T12:41`, then tap Worcester's card, then the Search tab, type "chicken"; the
same at `at=2026-10-08T23:30`; `/search?q=oatmeal` for Later rows.

Backend: none.
Residency: none new. The plate and the log are device-only, as today. here is in-memory UI state.
Rationale: the owner chose to keep the hall open under Search over a search field inside the hall page. Search
is already the place for typing, and a second field would duplicate it. A Later + logs to the current meal, not
to the dish's own meal: you log what you ate now, and a future-dated plate is not a thing the app has. Rejected:
reading here from `prefs.lastHall` (it means "last opened", so it is stale once the hall is closed).

## Acceptance

- [ ] Halls → Worcester → (scroll, pick Dinner) → Search tab → Halls tab shows Worcester open on the same meal tab
  and scroll offset. Android back, and the predictive-back swipe, then close it. A page Search pushed survives a
  trip to Halls and back the same way — evidence: widget test + screenshot
- [ ] Tapping the tab that is already showing still pops it to its root (today's behaviour for a re-tap) — evidence: test
- [ ] With Worcester open, the hint reads "Search <meal> at Worcester", and a dish served now at Worcester ranks
  above the same group's dishes not served there — evidence: test + screenshot
- [ ] + on that row, then Log: the logged rows' place is `W`, even though the dish is also served at Franklin —
  evidence: test (on `logEntries`'s output, not on the plate)
- [ ] Every Later row has a +. After +, the row's stepper shows 1 and the item is on the current meal's plate. A
  second + makes 2 of the same item. A Later dish served at here logs at here — evidence: test + screenshot
- [ ] Variant-family Later row: + adds the variant the row shows — evidence: test
- [ ] Keyboard search key: presses the first loggable row's + (now or Later) — evidence: test
- [ ] "Add something else" from a Dinner plate at 12:41: Search's + adds to the Dinner plate — evidence: test
- [ ] No place open: every existing `test/core/m2` search test and `m2_dom_search*.json` measurement still passes
  unchanged, except the Later-control assertion, which is rewritten and cites this brief — evidence: test
- [ ] Tracking off: no + on any Search row — evidence: existing track test still green

## Tasks

Common lanes: `cd app && flutter analyze && tool/test.sh <touched test dirs> test/core/m2`, plus `app/tool/screenshot.sh`
for each † state (recorded mode, photos off; one emulator via `emu.lock`, Gradle via `heavy.lock`).

1. **Per-tab page stacks and here.** Each tab keeps its own stack. Leaving a tab no longer runs
   `popUntil(isFirst)`, and re-tapping the shown tab still does. `ShellApi` exposes here (a `ValueListenable<String?>`),
   derived from the Halls stack's top place page. Touchpoints: `_select`, `_backPage`, `handleStartBackGesture`
   (back acts on the shown tab's stack), `openPlace`, `Nav.openCard` with `scope.hider`, `FadeThroughTabs`' `pinned`
   heights, and the plate bar's slot (still above every tab). Acceptance lines 1–2 — files: `app/lib/shell/shell.dart`,
   `shell_scope.dart`, `app/lib/motion/routes.dart`, `fade_through.dart`, `app/test/shell/` — lanes: common —
   blocked by: none — PR:
2. **Search reads here.** Hint, here-first order (in `runSearch`, next to the front plate's `ph` bias at
   `core/m2/search.dart:187`), and a + narrowed to `{here: d}`. Acceptance lines 3–4 — files:
   `app/lib/core/m2/search.dart`, `app/lib/screens/search/search_controller.dart`, `search_screen.dart`,
   `app/test/core/m2/search_test.dart`, `app/test/screens/` — lanes: common — blocked by: 1 — PR:
3. **+ on every row, and the plate's meal.** Later rows get the control: a `_stand` path for `LaterEntry`, `_code`
   and the steppers for it, and `_submit` for the first loggable row. `openSearch({meal})` carries the meal to
   Search. Acceptance lines 5–10 — files: `app/lib/screens/search/search_screen.dart`, `search_entries.dart`,
   `app/lib/shell/shell.dart` (`openSearch`), `app/lib/screens/hall/dish_row.dart` (only if the lane needs it),
   `app/test/core/m2/search_test.dart` — lanes: common, plus goldens at 360/390 for Search — blocked by: 2 — PR:
