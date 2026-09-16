# Richer daily macro/calorie statistics in Logs

Goal: the Logs & stats screen shows more than a calorie-only total — a selected day's actual
protein/carb/fat totals alongside calories, and averages generalized beyond the current fixed
7-day, calories-and-protein-only window, so a user can see their real macro picture over time, not
just calories.

## Spec

UI: `docs/design/Logs.dc.html` → `mobile/src/app/logs.tsx`. The new per-day macro totals and
generalized averages extend this screen's existing stat rows; they reuse the app's existing
macro-stat visual language (`components/ui/Stat`, the same protein/carb/fat cell pattern already
used in `PlateSheet.tsx`'s totals row and `YouPane.tsx`'s stat cards) rather than inventing new
chrome. If the owner wants a bespoke Logs-specific layout for these instead of the existing Stat
cell pattern, that's a canvas design pass first (`docs/design/Logs.dc.html` is upstream-owned,
per CLAUDE.md — never hand-edit it); absent that, implementation should default to the existing
Stat pattern and flag any layout judgment calls to the reviewer.
Annotations: none (no canvas iteration behind this brief — feature request from conversation).
States:
- Selected day has entries — show calories (existing) plus protein/carb/fat totals for that day.
- Selected day has zero entries — existing `EmptyState` ("Nothing logged") already covers this;
  no macro row to show, don't render an empty/zero stat row alongside it.
- 7-day averages caption — generalize from calories+protein to all four (calories, protein, carb,
  fat), still over the existing trailing-7-day window (see Rationale for why the window itself is
  out of scope).
- Fun stats grid — unchanged; these are counts/streaks/shares, not macro totals, and are a
  different kind of stat that this brief doesn't touch.
Routes: `logs` (route already exists, no new screenshot state beyond the existing Logs capture —
extend whatever route/seed-data screenshot.sh already uses for this screen, if any, or add one
seeding a day with varied macros so the new protein/carb/fat row has real numbers to show).

Backend: none.
Residency: none — `Consumption log, macro history, daily totals` are already device-only (SQLite
mobile) per CLAUDE.md's residency table; this feature only *displays* more of what's already
computed from data that's already there, no new client→Supabase call, no new persisted table.
Confirmed export is unaffected: `shared/src/storage.ts`'s `exportEntriesAsJson`/`exportEntriesAsCsv`
already export raw per-entry rows (calories/protein/carb/fat per entry) that these new day-totals
and averages are derived from on the fly — since this brief adds no new *persisted* table (no
cached/precomputed daily-totals table), it creates no new export obligation under "every
device-local table needs export." If a later perf need introduces a cached daily-totals table,
that table would need its own export coverage at that point.
Rationale: Confirmed by reading the code that a per-day **calorie** total already exists and
renders today (`mobile/src/app/logs.tsx`'s `dayTotalCalories`, line 185, rendered at line 214) —
but it's computed by summing meal-group calorie subtotals, not via `@udine/shared`'s
`computeDailyTotals(date, entries)` (`shared/src/macros.ts:4-15`), which already returns the full
`DailyMacroTotals` shape (calories, proteinG, totalCarbG, totalFatG) from a day's entries and is
already used elsewhere (`YouPane.tsx`, `PlateSheet.tsx`'s in-progress-plate totals) — just never
for a *past logged* day today. Switching the selected-day total to `computeDailyTotals` gets the
full macro breakdown for free, with no new aggregation logic. The 7-day chart's average
(`mobile/src/lib/logsFormat.ts`'s `buildWeekChart`, lines 101-118) is currently a bespoke inline
sum of just calories and protein across `lastSevenDates` — no general "average a set of
`DailyMacroTotals` over N days" helper exists in `@udine/shared` today (the closest thing,
`ranking.ts`'s mean, is dish-rating-specific and unrelated). Adding one
(`averageDailyTotals(totals: DailyMacroTotals[]): DailyMacroTotals`) next to `computeDailyTotals`
lets `buildWeekChart` compute all four macros' averages the same way instead of hand-rolling two of
them and leaving the other two out — smaller and more consistent than extending the existing inline
sum with two more ad hoc accumulator variables. The averaging *window* itself (currently a fixed
trailing 7 days, `lastSevenDates`) is left unchanged — the user's ask was for richer *content*
("actual amounts... and averages, for example"), not a different time range, and widening the
window (30-day, all-time, user-selectable) is a bigger, separable follow-up if wanted later.

## Acceptance

- [ ] The selected day's log section shows protein/carb/fat totals alongside the existing calorie
      total, using `computeDailyTotals` — evidence: test + screenshot
- [ ] The 7-day averages caption shows averaged carb and fat alongside the existing calories/
      protein averages — evidence: test
- [ ] A new `averageDailyTotals` (or equivalently named) helper exists in `@udine/shared`, unit
      tested independently of any UI — evidence: test (`node --test`)
- [ ] `buildWeekChart` consumes the new shared helper instead of its own inline calorie/protein-only
      sum — evidence: test (existing `logsFormat.test.ts` coverage continues passing, extended for
      the new fields)
- [ ] A day with zero entries shows no macro row (existing `EmptyState` path unchanged) — evidence:
      test
- [ ] No new residency/export surface introduced (confirmed by code review: no new persisted table)
      — evidence: code review

## Tasks

1. Add `averageDailyTotals(totals: DailyMacroTotals[]): DailyMacroTotals` to
   `shared/src/macros.ts`, next to `computeDailyTotals` (average each of calories/proteinG/
   totalCarbG/totalFatG across the given array; caller decides what "day" label, if any, the
   result carries — mirror `computeDailyTotals`'s own return shape). Full red-green unit coverage,
   including an empty-array edge case. — files: `shared/src/macros.ts`, `shared/src/macros.test.ts`
   — lanes: `pnpm --filter @udine/shared test && pnpm --filter @udine/shared typecheck` — blocked
   by: none — PR:
2. Switch `mobile/src/app/logs.tsx`'s selected-day total from its bespoke `dayTotalCalories` sum to
   `computeDailyTotals(selectedDate, selectedEntries)`, and render protein/carb/fat alongside
   calories in that section (reusing the existing `Stat`/macro-cell pattern from `PlateSheet.tsx`/
   `YouPane.tsx`). — files: `mobile/src/app/logs.tsx`, `mobile/src/lib/logsScreen.test.tsx` —
   lanes: `cd mobile && npx tsc --noEmit && TZ=America/New_York npx jest && pnpm lint` — blocked
   by: 1 — PR: (screenshot required — rendered output changes)
3. Update `mobile/src/lib/logsFormat.ts`'s `buildWeekChart` to compute all four macros' 7-day
   averages via the new `averageDailyTotals` helper (grouping `lastSevenDates`' entries into
   per-day `DailyMacroTotals` first, via `computeDailyTotals`, then averaging), and update
   `app/logs.tsx`'s chart caption to show the additional carb/fat averages. — files:
   `mobile/src/lib/logsFormat.ts`, `mobile/src/lib/logsFormat.test.ts`, `mobile/src/app/logs.tsx`
   — lanes: `cd mobile && npx tsc --noEmit && TZ=America/New_York npx jest && pnpm lint` — blocked
   by: 1 — PR: (screenshot required — rendered output changes)
