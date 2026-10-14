# Retail crawler: café meal names

Goal: the drinks, smoothies and boba that 11 cafés sell (Whitmore 08, Worcester Café 13, Courtside 21, ISB 30,
People's Organic 40, Procrastination Station 42, Morrill 44, Peet's 51, Snack Overflow 70, Post & Bean 92, Carney 97) land in `public.dishes`, so Search and
logging find them. Today 97 of those cafés' 122 Web INA dish names are missing.

Cause (research 2026-10-14, read-only, live Web INA): `populate-retail-dishes` requests `longmenu.aspx` with only
`mealName` ∈ {Breakfast, Lunch, Dinner, Late Night} (`MEAL_PERIODS`, `index.ts`). Café locations publish under
`Daily Offerings` (Post & Bean: `Daily Offering`, singular), so all four requests return 0 rows. Checked on
`shortmenu.aspx` for locations 08, 13, 21, 30, 40, 42, 44, 51, 70, 92, 97: the four standard names give 0 rows each,
`Daily Offerings` gives 5–68. Newman (72) uses `Lunch` and Bluewall's stations (14, 25, 28, 41, 53) use Lunch and Dinner, so those are already
crawled. `location.aspx` now lists 29 locations, not 28 (Snack Overflow, 70, is new).

## Spec

UI: none
Annotations: none
States: none
Routes: none

Backend: `supabase/functions/populate-retail-dishes/` only. Read each location's meal names from the `mealName=`
links on its `shortmenu.aspx` (the same session cookie as `longmenu.aspx`) and crawl those, instead of the
hardcoded four. A location whose shortmenu lists no meal names falls back to the four. Keep the existing politeness
gap and time budget; the crawl gains one shortmenu request per location. Update the header comment (location count,
the meal-name rule, the request count) and `docs/apk-reverse-engineering.md`. Fixtures: trimmed excerpts of the
research session's saved `shortmenu.aspx` responses (`~/.cache/udine-scratch/research/names-only/webina/sm-13.html`,
`sm-92.html`, `sm-72.html`), inlined in the test the way `parser.test.ts` inlines its `longmenu.aspx` row; no new live
capture.
Residency: "Dish nutrition catalog (`public.dishes`)": public dish names and nutrition, no per-user data.
Rationale: reading meal names per location tracks UMass's drift; adding "Daily Offerings" to the list would miss
"Daily Offering" and the next variant. Not done: matching cafés' get_infov2 names-only lists against
`public.dishes`. The same research found that gives about 0 trustworthy matches (drink bases are 0 kcal without the
separate milk add-on; names-only lists are free text), so names-only rows stay names-only in the Flutter app and
nothing calls `lookup-dish` from a café page.

## Acceptance

- [ ] The meal-name parser reads every `mealName=` link from the three fixtures (Worcester Café 13: `Daily
      Offerings`; Post & Bean 92: `Daily Offering`; Newman 72: `Lunch`) — evidence: deno test
- [ ] The crawl requests exactly the parsed names per location, falling back to the four when none are listed —
      evidence: deno test
- [ ] Current-state claims are corrected; dated history stays and gets a dated correction note: `index.ts`'s header
      ("28 total", "24 retail", `mealName=<Breakfast|Lunch|Dinner|Late Night>`, "96 longmenu.aspx requests") and
      `docs/apk-reverse-engineering.md`'s `location.aspx` count (~line 139) and `mealName` rule (~lines 214–220,
      and the "zero rows for all four" finding ~line 394, which was the wrong meal name) — evidence: diff
- [ ] The run still fits the Edge Function time budget with one extra shortmenu request per location (update the
      header's timing argument next to `MAX_LABEL_FETCHES_PER_RUN`) — evidence: diff

## Tasks

1. Per-location meal names in `populate-retail-dishes` — files: `supabase/functions/populate-retail-dishes/`,
   `docs/apk-reverse-engineering.md` — lanes: deno — blocked by: none — PR: (owner-merged: `supabase/`)
