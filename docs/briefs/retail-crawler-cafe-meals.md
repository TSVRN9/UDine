# Retail crawler: café meal names

Goal: the drinks, smoothies and boba that 11 cafés sell (Whitmore, ISB, Morrill, People's Organic, Post & Bean,
Peet's, Carney, Snack Overflow, Courtside, Procrastination Station, Newman) land in `public.dishes`, so Search and
logging find them. Today 97 of those cafés' 122 Web INA dish names are missing.

Cause (research 2026-10-14, read-only, live Web INA): `populate-retail-dishes` requests `longmenu.aspx` with only
`mealName` ∈ {Breakfast, Lunch, Dinner, Late Night} (`MEAL_PERIODS`, `index.ts`). Café locations publish under
`Daily Offerings` (Post & Bean: `Daily Offering`, singular), so all four requests return 0 rows. Checked on
`shortmenu.aspx` for locations 08, 13, 21, 30, 40, 42, 44, 51, 70, 92, 97: the four standard names give 0 rows each,
`Daily Offerings` gives 5–68. `location.aspx` now lists 29 locations, not 28 (Snack Overflow, 70, is new).

## Spec

UI: none
Annotations: none
States: none
Routes: none

Backend: `supabase/functions/populate-retail-dishes/` only. Read each location's meal names from the `mealName=`
links on its `shortmenu.aspx` (the same session cookie as `longmenu.aspx`) and crawl those, instead of the
hardcoded four. A location whose shortmenu lists no meal names falls back to the four. Keep the existing politeness
gap and time budget; the crawl gains one shortmenu request per location. Update the header comment (location count,
the meal-name rule) and `docs/apk-reverse-engineering.md`'s Web INA section, which states the four-name rule.
Residency: "Dish nutrition catalog (`public.dishes`)": public dish names and nutrition, no per-user data.
Rationale: reading meal names per location tracks UMass's drift; adding "Daily Offerings" to the list would miss
"Daily Offering" and the next variant. Not done: matching cafés' get_infov2 names-only lists against
`public.dishes`. The same research found that gives about 0 trustworthy matches (drink bases are 0 kcal without the
separate milk add-on; names-only lists are free text), so names-only rows stay names-only in the Flutter app and
nothing calls `lookup-dish` from a café page.

## Acceptance

- [ ] The meal-name parser reads every `mealName=` link from a recorded `shortmenu.aspx` (one café with
      `Daily Offerings`, Post & Bean's `Daily Offering`, one hall-style location with the four) — evidence: deno test
- [ ] The crawl requests exactly the parsed names per location, falling back to the four when none are listed —
      evidence: deno test
- [ ] Docs no longer state the four-name rule or "28 locations" — evidence: diff

## Tasks

1. Per-location meal names in `populate-retail-dishes` — files: `supabase/functions/populate-retail-dishes/`,
   `docs/apk-reverse-engineering.md` — lanes: deno — blocked by: none — PR: (owner-merged: `supabase/`)
