# Design source of truth

The UDine Mobile v2 design canvas, extracted from its published artifact:

<https://claude.ai/code/artifact/111ed10a-9849-4976-bea2-314d9b6cef5d>

`*.dc.html` are the artboards, `canvas.json` their layout, titles, and the
annotation layer. **The canvas is upstream** — edit the design there, then
re-extract; never hand-edit an artboard here, it will be overwritten.

```
# read the URL above with the Artifact tool (action: "read") to get a local copy
python3 docs/design/extract.py <that-file.html>
```

The canvas uses the editor's own **pages** feature (`content.pages: [{id, name}]`, plus a `page`
field on each artboard/annotation naming which page it's on — omitted entirely for the first page).
Open the canvas URL above and use the page switcher (top left, "N pages") to jump between them:
Prototype, Home & Pane Shell, Hall Menu & Ordering, Plate & Search, Half Servings, Cafe, You /
Profile & Data, Events & Press, Badge Concepts, Badge Glyph Workshop, Head-to-Head & Toasts, Archived / Cut Features. Each
page is its own tidy grid (artboards in reading order, that page's own annotations in a column to
the right — annotations are free-height text with no predictable render size, so give them their
own lane rather than squeezing them above the grid). `extract.py` flattens every page's artboards
into one `docs/design/` directory — the `page` field survives the round-trip in `canvas.json`, but
individual `.dc.html` files don't carry it, so this file's own artboard table is the only local
record of which page something lives on.

Draft variations that lost (the `Half servings v1/v2` A–E options, `Your data v3 — B`) were deleted
outright, not archived — cut *features* (Social, friends, login, push, the full Privacy screen, …)
are kept on the Archived page for reference, not deleted. `extract.py` never deletes a local file
that's no longer in the canvas — after a re-extract that removes an artboard, `git rm` its stale
local copy by hand.

## Using an artboard as a spec

The artboards are plain HTML with inline styles: hex values, px spacing, and
copy strings are greppable straight out of the file, with no canvas runtime
needed. That is the default parity check for a UI diff.

For layout and motion, render it: `mobile/scripts/screenshot.sh <route>` gives a
PNG from the emulator pool in one command (`--record N` plus `--tap`/`--swipe`/
`--longpress` gives an MP4 and 10fps frames); put it beside the artboard, or
beside the canvas URL above in a browser for the 28 artboards whose `DCLogic`
scripts (non-default states, motion) only run there. `Agent_Emulator_Narrow`
(360dp) is the default device and the closest to the 390dp artboard; the pool's
swangle / `--device` / stale-Metro rules are in `docs/agents/emulator-pool.md`
and the script already follows them.

The mobile **web** target is not an option: `expo start --web` and
`expo export --platform web` both fail in this repo (`expo-sqlite`'s web worker
imports a `wa-sqlite.wasm` absent from the pnpm layout; static export
additionally dies on `window is not defined` during prerender). Verified
2026-09-09 — don't spend time on it. For `web/`, `pnpm --filter web dev` works
normally.

Interaction notes, state legends, and rationale live in `canvas.json`'s
`annotations` array, not inside the artboards. They are notes for whoever
reads the design — never copy them into the UI.

## Reading an artboard from a test

`mobile/src/lib/artboard.ts` reads values straight out of these files:
`artboardStyle("CafeSheet.dc.html", "OPEN · TIL 6 PM")` returns the inline style of the element
carrying that copy as React Native props; `artboardTransitions("Prototype.dc.html")` returns the
`transition`/`animation` rules from its `<style>` block (the motion spec — `mobile/src/lib/motion.ts`
is checked against it). Parity tests assert against those instead of a number copied by eye, so
a re-extract that changes the canvas turns up as red tests.

## Artboards

Source comments cite artboards by canvas title (`canvas: "Plate expanded"`).
Resolve them here; cite the filename in new comments. **Component** is the mobile file(s) that
implement the artboard — the lookup the gate and the design audit (`docs/agents/design-audit.md`)
start from; keep it current when a new screen lands. Blank = not built yet or design-only.

| Canvas title | File | Size | Component (`mobile/src/`) |
|---|---|---|---|
| Add friends (from Social) | `AddFriends.dc.html` | 390×844 | archived (`archive/full-features`) |
| Add in person - QR | `AddFriendQR.dc.html` | 390×844 | archived (`archive/full-features`) |
| Badge glyph workshop -- protein + sodium, 3 options each | `BadgeGlyphWorkshop.dc.html` | 390×844 | design-only |
| Macro badge concepts (color exploration) | `BadgeConcepts.dc.html` | 390×844 | design-only |
| Cafe fallback (menu not posted) | `CafeSheet.dc.html` | 390×844 | `components/CafeSheet.tsx` |
| Cafe menu - PDF in-app | `CafePdf.dc.html` | 390×844 | `components/CafePdfViewer.tsx` |
| Cafe menu - prices | `CafeMenu.dc.html` | 390×844 | `app/cafe/[name].tsx` |
| Data model — sync / share / delete | `DataModel.dc.html` | 900×844 | design-only |
| Export data (final - batch select) | `ExportChecklist.dc.html` | 390×844 | `app/export.tsx` |
| F1 -- Cafe menu, POS-integrated (Peet's) | `CafeMenuIntegrated.dc.html` | 390×844 | `app/halls/[slug].tsx` |
| F1 -- Cafe menu, info-only (food truck) | `CafeMenuInfoOnly.dc.html` | 390×844 | `components/CafeSheet.tsx` |
| F1 -- Cafe menu, standing + catalog match | `CafeMenuMixed.dc.html` | 390×844 | `app/halls/[slug].tsx` |
| F2 -- Create a custom food | `CustomFoodForm.dc.html` | 390×844 | `components/CustomFoodForm.tsx` |
| F2 -- Result confirm step (NutritionLabel reuse) | `SearchResultDetail.dc.html` | 390×844 | `components/NutritionLabel.tsx`, `lib/plate.ts` |
| F2 -- Search header (back chevron + title row) | `SearchExpandedHeader.dc.html` | 390×844 | `components/PlateSheet.tsx` |
| F2 -- Search results: paginated + custom badge + direct-lookup action | `PlateSheetResults.dc.html` | 390×844 | `components/PlateSheet.tsx` |
| F2 -- Search in flight: spinner row, Search disabled, rows stream in (new) | `SearchStateInFlight.dc.html` | 390×844 | `components/PlateSheet.tsx` |
| F2 -- Search finished, no results (new) | `SearchStateEmpty.dc.html` | 390×844 | `components/PlateSheet.tsx` |
| F2 -- Search failed (new) | `SearchStateError.dc.html` | 390×844 | `components/PlateSheet.tsx` |
| F3 -- Events pane + Press/Newsletter (new) | `EventsPanePress.dc.html` | 390×844 | `panes/EventsPane.tsx`, `app/press.tsx`, `app/newsletter.tsx`, `app/event-detail.tsx` |
| F3 -- Filter FAB, active (final) | `MenuFAB_Active.dc.html` | 390×844 | `app/halls/[slug].tsx` |
| F3 -- Filter FAB, no filters (permanent, bare icon) | `MenuFAB_Inactive.dc.html` | 390×844 | `app/halls/[slug].tsx` |
| F3 -- Filter sheet, in place (new) | `FilterSheet.dc.html` | 390×844 | `components/FilterSheet.tsx`, `app/filters.tsx` |
| F3 -- Macro badges on menu items (new) | `MenuWithBadges.dc.html` | 390×844 | `app/halls/[slug].tsx` |
| F3 -- You pane, Your Food group (new) | `YouPaneGrouped.dc.html` | 390×844 | `panes/YouPane.tsx`, `components/ui/SectionHeader.tsx` |
| F4 -- Composite dish row states (new) | `CompositeDishRowStates.dc.html` | 390×844 | design-only |
| F4 -- Bowl composer sheet (new) | `CompositeDishComposer.dc.html` | 390×844 | design-only |
| F4 -- Always-available station (new) | `UnlistedStationPersistent.dc.html` | 390×844 | design-only |
| F4 -- lookup-dish states: fetching / miss / rate-limited (new) | `SearchLookupStates.dc.html` | 390×844 | design-only |
| Friend profile (tap avatar) | `FriendProfile.dc.html` | 390×844 | archived (`archive/full-features`) |
| H2H -- After a pick: toast with Another | `CompareToastPicked.dc.html` | 390×844 | design-only |
| H2H -- Compare sheet | `CompareSheet.dc.html` | 390×844 | design-only |
| H2H -- Post-log toast: logged (success) | `ToastLogged.dc.html` | 390×844 | `components/Toast.tsx`, `app/halls/[slug].tsx` (replaces the inline banner) |
| H2H -- You pane: Top Foods empty state | `YouTopFoodsEmpty.dc.html` | 390×844 | design-only |
| H2H -- You pane: Your Top Foods with Rank more | `YouTopFoodsRankMore.dc.html` | 390×844 | design-only |
| Half servings v2 — F: inline vertical slide (grows from the + button) | `ServingsF.dc.html` | 390×844 | `components/HoldSlideOverlay.tsx`, `components/HoldSlideAddButton.tsx`, `lib/servingsStepper.ts`, `app/halls/[slug].tsx` |
| Half servings v2 — G: type an exact amount, editing from the plate sheet | `ServingsG.dc.html` | 390×844 | `components/PlateSheet.tsx` |
| Hall info sheet (i) | `HallInfo.dc.html` | 390×844 | `components/HallInfoSheet.tsx`, `lib/hallMenuTabs.ts` |
| Hall menu + plate bar | `HallMenu.dc.html` | 390×844 | `app/halls/[slug].tsx`, `components/PlateBar.tsx` |
| Hall menu - fetch failed | `MenuError.dc.html` | 390×844 | `components/MenuErrorCard.tsx` |
| Hall menu - loading | `MenuLoading.dc.html` | 390×844 | `app/halls/[slug].tsx`, `components/Skeleton.tsx` |
| Home | `Main.dc.html` | 390×844 | `app/index.tsx` |
| Home - loading | `HomeLoading.dc.html` | 390×844 | `app/index.tsx` |
| Home - offline (cached) | `HomeOffline.dc.html` | 390×844 | `app/index.tsx` |
| Toast -- log failed (plate kept) | `ToastLogFailed.dc.html` | 390×844 | `components/Toast.tsx`, `app/halls/[slug].tsx` |
| ▶ Interactive prototype | `Prototype.dc.html` | 390×844 | motion spec → `lib/motion.ts`; pane shell → `components/PaneStack.tsx`, `components/PaneHeader.tsx` |
| Login / first launch | `Login.dc.html` | 390×844 | archived (`archive/full-features`) |
| Logs & stats (from You) | `Logs.dc.html` | 390×844 | `app/logs.tsx` |
| Notifications - push + in-app | `PushAlerts.dc.html` | 390×844 | archived (`archive/full-features`) |
| Nutrition label | `NutritionLabel.dc.html` | 390×844 | `components/NutritionLabel.tsx`, `lib/nutritionLabel.ts` |
| Ping - hold + release | `PingBubble.dc.html` | 390×844 | archived (`archive/full-features`), design-only |
| Plate expanded | `PlateExpanded.dc.html` | 390×844 | `components/PlateSheet.tsx` |
| QR scan - confirm friend | `QRConfirm.dc.html` | 390×844 | archived (`archive/full-features`) |
| Social (swipe right) | `Social.dc.html` | 390×844 | archived (`archive/full-features`) |
| Social - offline | `SocialOffline.dc.html` | 390×844 | archived (`archive/full-features`) |
| You (swipe left) | `You.dc.html` | 390×844 | `panes/YouPane.tsx` |
| Your data (final) | `Privacy.dc.html` | 390×844 | archived (`archive/full-features`) |
| Your data v3 — A: three sections (lead) | `PrivacyV3A.dc.html` | 390×844 | archived (`archive/full-features`) |
| Your data v3 — C: server-data detail | `ServerData.dc.html` | 390×844 | archived (`archive/full-features`) |
