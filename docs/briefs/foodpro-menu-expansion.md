# FoodPro menu expansion: composite dishes, always-available stations, lookup-dish states

Goal: a user browsing a hall menu can (1) build a real bowl/plate out of a base dish plus its
FoodPro-catalog add-ins instead of logging toppings as unrelated flat menu rows, (2) log from
stations (salad bar, yogurt bar, pizza) that UMass never itemizes on its own daily feed, and (3)
search for an off-menu dish without the UI going quiet or looking broken while `lookup-dish` does
its on-demand FoodPro fetch.

## Spec

UI: `CompositeDishRowStates.dc.html`, `CompositeDishComposer.dc.html`,
`UnlistedStationPersistent.dc.html`, `SearchLookupStates.dc.html` (all "F4 --" rows in
`docs/design/README.md`'s table; component column is blank there — none of this is built yet).
Annotations: `composite-dish-logic`, `unlisted-station-logic`, `lookup-dish-states-logic`
(`docs/design/canvas.json`, pages "Hall Menu & Ordering" / "Plate & Search") — full interaction
logic, gesture tracing against `HoldSlideAddButton.tsx`/`servingsStepper.ts`/`PlateAddControl`,
and the rejected alternatives (inline add-ins, a persistent tab) live there; this brief summarizes,
the annotations are the record.

States:
- Composite dish row: not-yet-composed (shows a computed min–max range: base alone → base + one of
  every add-in), composed & in-plate (identical to a simple dish's ±1 stepper), composed & expanded
  (adds an "Edit add-ins" link where "Full Nutrition Label" sits on a normal row), re-add after
  decrementing to 0 (reuses the last-saved recipe, doesn't reopen the composer).
- Composer sheet: each add-in is a real catalog dish with its own cal/protein line and its own
  pre-add/in-plate control (hold-drag-capable, same as any dish row — unlike the parent dish, an
  add-in has a well-defined "1 unit" from the start); at least one row must support the expand-to-
  detail treatment (per-serving macros, diet tags, "Full Nutrition Label" link); live totals sum
  base + every selected add-in's quantity, never a static number.
- Always-available station: renders identically in every meal-period tab (not date/meal-gated),
  fixed at the tail of the station list; absent entirely for a hall that doesn't have it; a
  bulk/scoop item adds 1 unit sized to its own stated serving on first tap, then scales via the
  ordinary hold-drag ladder.
- Search: fetching (inline spinner row at the position a UMass match would occupy, other sources
  keep showing), miss (spinner row removed, no new message — the sheet's existing dashed "Create a
  custom food" row is the resolution), rate_limited (same slot as fetching, manual retry only, no
  timed auto-retry).

Routes: none exist yet (nothing is built) — the implementing task should extend
`mobile/scripts/screenshot.sh halls/<slug>` coverage: composite dish states need a route that lands
on a hall with a composite dish + a `--tap` on its row/expand target; the composer needs a
`--record` through open → step an add-in → Add to Plate; always-available stations need the same
route across at least two meal-period tabs (`--tap` the tab, screenshot each); search states need
a route into the plate sheet's search field with a query that misses the local catalog.

Backend: none for tasks 2–4 below (they render against `public.dishes` and the already-shipped
`lookup-dish` edge function, commit `4a0c345`, unchanged). Task 1 populates
`public.dishes` with the always-available catalog (Salad Bar / Yogurt Bar / Pizza per hall) —
same table `populate-retail-dishes` (commit `97b0bbb`) already writes non-`tid`-fed rows into, no
new table or column.
Residency: `public.dishes` rows stay in the existing "Dish nutrition catalog" row of CLAUDE.md's
residency table (server, public/read-only, no per-user data). A composed dish's chosen add-ins
live only as an in-memory "recipe" keyed by dishKey until "Add to Plate" folds it into a normal
`PlateEntry` — at that point it's already covered by the existing "Consumption log" residency row
(device only); no new residency category, no new server write.
Rationale: bowl composer sheet over inline add-ins — traced against the real gesture code and
found the hold-drag-release ladder only ever renders pre-add (once in the plate, ±1 taps are
already plain), so composing (N independent toppings, not a scalar) is answered as a prior step
with its own sheet rather than overloading that 1-D ladder; inline add-ins were dropped because
they'd force that overload. Always-available section over a persistent tab — a fixed tail section
keeps the feed-driven (meal-varying) stations stable at the top across tab switches, where a
separate tab would either duplicate stations across tabs or need its own reflow logic; the tab
variant was dropped as extra navigation for no behavioral gain. lookup-dish states render inline
in the merged results list, not as blocking full-screen states, because the edge function already
coalesces concurrent identical searches and polls up to 5s — a modal spinner would hide the
OFF/USDA/Custom matches that are often already available while a UMass-specific fetch is still in
flight.

## Acceptance

- [ ] Not-yet-composed row shows the computed min–max (base alone → base + 1 of every add-in), not
      a static number — evidence: test
- [ ] Tapping the not-yet-composed control opens the composer sheet; no hold-drag fires on it —
      evidence: test
- [ ] Composer add-in rows show real per-add-in cal/protein and reuse the ordinary pre-add/in-plate
      control (hold-drag lands on a half-serving count) — evidence: test
- [ ] At least one add-in row expands to per-serving macros + diet tags + "Full Nutrition Label" —
      evidence: screenshot
- [ ] Composer live totals equal base + sum of every currently-selected add-in's quantity ×
      nutrition, recomputed on every step — evidence: test
- [ ] "Add to Plate" commits exactly one `PlateEntry` for the whole composed dish at the chosen
      quantity and closes the sheet on `durations.sheet` (300ms) — evidence: test
- [ ] A composed dish's in-plate row is pixel-identical to a simple dish's stepper (no hold-drag
      control rendered) — evidence: screenshot
- [ ] Expanding a composed, in-plate row shows "Edit add-ins", reopening the composer pre-filled
      with the saved selection — evidence: screenshot
- [ ] Tapping + after stepping a composed dish back to 0 re-adds the last-saved recipe directly,
      without reopening the composer — evidence: test
- [ ] An always-available station renders at the tail of the station list identically in every
      meal-period tab present for that hall — evidence: screenshot (≥2 tabs)
- [ ] A hall without a given always-available station renders no block for it — evidence: test
- [ ] A bulk/scoop always-available item adds 1 serving-sized unit on first tap, then scales via
      the existing hold-drag ladder — evidence: test
- [ ] lookup-dish `fetching` renders as one inline row at the UMass-match position; already-found
      OFF/USDA/Custom rows are unaffected — evidence: screenshot --record
- [ ] lookup-dish `miss` removes the spinner row and adds no new message — evidence: screenshot
- [ ] lookup-dish `rate_limited` occupies the same slot `fetching` did (no layout shift) and its
      retry is a manual tap, never a timer — evidence: test

## Tasks

1. Backend: seed the always-available station catalog (Salad Bar / Yogurt Bar / Pizza per hall)
   into `public.dishes` — files: `supabase/functions/populate-retail-dishes/` (extend, or a
   sibling seed script if the always-available set needs its own cadence/source instead of a
   FoodPro crawl) — lanes: `supabase test db` — blocked by: none — PR: (owner-gated: touches
   `supabase/`)
2. Mobile: composite dish composer (row states + composer sheet) — files:
   `mobile/src/components/CompositeDishComposer.tsx` (new), `mobile/src/lib/plate.ts` (session
   recipe keyed by dishKey, folds into `PlateEntry` on commit), `mobile/src/app/halls/[slug].tsx`
   (route the pre-add slot to the composer for composite dishKeys) — lanes: mobile unit tests,
   screenshot gate — blocked by: none — PR:
3. Mobile: always-available stations in the hall menu — files: `mobile/src/app/halls/[slug].tsx`
   (append the fixed tail section per tab), a small lookup helper alongside the existing
   `hallMenuTabs.ts`/station-grouping code — lanes: mobile unit tests, screenshot gate — blocked
   by: 1 — PR:
4. Mobile: lookup-dish states in plate-sheet search — files: `mobile/src/components/PlateSheet.tsx`
   (or wherever the merged UMass/OFF/USDA/Custom result list renders today) — lanes: mobile unit
   tests, screenshot gate — blocked by: none — PR:
