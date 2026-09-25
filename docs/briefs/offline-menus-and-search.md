# Offline-first menus + search matching

Goal: a user in a dining hall with no signal sees that hall's menu (today, or up to 2 days ahead) right
away from the on-device copy, instead of a skeleton that never resolves. In the Plate search, the text
box never changes on its own. "Search UMass Dining directly" says how many new foods it found, or that
the device is offline. Multi-word queries match across word order and inserted words. "White Pizza"
finds UMass's "White Cheese Pizza".

Source: owner beta feedback on the Play build, 2026-09-25. Plan: `~/.claude/plans/i-ve-been-trying-the-jolly-reef.md`.

## Spec

UI:
- `MenuErrorCard` (unchanged component). The hall screen stops passing it a saved copy, because the copy is now shown automatically.
- Search lookup rows reuse the existing `lookupStateRowFetching` and `lookupStateRowRateLimited` styles
  (`SearchLookupStates.dc.html`, `SearchStateError.dc.html`). **No artboard exists** for the new
  found / none / offline rows. The owner accepted this: flag them in the PR body for adding to the canvas later.
Annotations: none.
States:
- A:
  - Airplane mode with a cached copy: the hall renders from the cache, with no skeleton and no error card.
  - Airplane mode, stepped to tomorrow: tomorrow's cached menu renders.
  - Airplane mode with no cache: the error card appears after about 8s.
- B:
  - Lookup in flight: "Looking up <submitted query>…". The label does not change while the user types.
  - Lookup found N new: "Found N new food(s)".
  - Lookup found nothing new, or a miss: "No new foods found".
  - Lookup offline: "Couldn't search right now. Check your connection and try again."
  - Lookup rate-limited: the existing "Live lookups are maxed out for the hour…" copy and clock glyph,
    unchanged and still distinct from offline.
Routes:
- A: `halls/worcester` after one online launch, then `adb shell cmd connectivity airplane-mode enable`
  and a cold start. Also step the date forward.
- B: the existing `--stress lookup-hit` / `lookup-miss` / `lookup-fetching` / `lookup-rate-limited` fixtures, listed in
  `mobile/scripts/screenshot.sh`'s header. Add a `lookup-offline` fixture the same way.

Backend: `supabase/functions/lookup-dish` (task 3 only; owner-merged, then
`supabase functions deploy lookup-dish`). No tables or SQL.
Residency: unchanged.
- The menu cache stays device-only (`preferences_kv`, `menu_cache:<tid>|<date>`).
- Search over cached menus is a local read.
- lookup-dish already upserts public nutrition into `public.dishes`, which holds no per-user data.

Rationale:
- The owner's model is that a day's menu doesn't change once that day has started.
  - So a cached copy fetched on or after the start of its own date is **final** and is never re-fetched.
  - A copy fetched earlier, as a prefetch, is shown right away and refreshed in the background.
  - Rejected: showing the saved copy only after the network fails (today's behaviour), because a stalled connection never fails.
  - Rejected: a per-fetch timeout via `withTimeout`, because it abandons a slow fetch that would have succeeded.
  - Instead, the no-cache wait only brings the error card up early, and a late success still replaces it.
- Matching is token-AND: every query word must appear in the name as a substring, after lowercasing and
  collapsing punctuation. Rejected: fuzzy or edit-distance matching, which is more code and gives surprising hits.
- FoodPro's `search.aspx` is a phrase-substring search. Verified live 2026-09-25: "White Pizza" returns
  0 hits, "White" returns "White Cheese Pizza". So lookup-dish sends it the longest query token and filters
  locally with the same token rule.
- "White Cheese Pizza" is absent from the ajax feed for 09/18-10/01 at all 4 halls. That is why
  `public.dishes` doesn't have it: `populate-dishes` fills it from the ajax feed, and `lookup-dish` upserts
  only exact-name hits today. Task 3 is what
  fixes the owner's example; task 2's cached-menu source does not.

Current code (main at `a001ea1`):
- **Hall menu effect** (`mobile/src/app/halls/[slug].tsx` ~1020-1059): network first. `getCachedMenu`
  is read only in `.catch`, and `showSavedCopy` (~1090) runs only on a user tap.
- **Grab tab** (~1061-1076): has no cache fallback at all.
- **Hours** (~1120-1134): the effect uses `fetchHoursAndCache` with no timeout and never reads
  `getCachedHours`. Because `stillLoading = !items || !hoursSettled` (~1633), a hung hours fetch holds
  the skeleton up even when items exist. The hours feed holds today only, while meal tabs derive from
  `items`, not hours.
- **Fetch** (`shared/src/umassDining.ts` `fetchMenu`): a 30-min in-memory cache, in-flight dedupe, no timeout.
- **Prefetch** (`mobile/src/lib/menuPrefetch.ts` `warmMenuCache`): warms today only. It runs at launch
  (`_layout.tsx:68`) and in the 15-min background task (`backgroundTask.ts`), and that task's reader uses
  `new Date()` (:61) instead of `effectiveToday()`.
- **PlateSheet** (`mobile/src/components/PlateSheet.tsx`):
  - The loading label at :1007 renders the live `query`.
  - `runDirectLookup` (:815) and `loadMore` (:752) read the live `query`, not `committedQueryRef`.
  - The `initialQuery` effect (:572-579) re-seeds the box whenever `visible` flips back on. `visible` is
    false while the custom-food form is open (`lib/plate.ts:348`).
  - `matchQualityTier` is at :191.
  - The local search group is at :660-696. It covers history, catalog and custom foods; it does not
    search cached menus.
- **Matchers**: `searchCachedDishes` (`mobile/src/lib/dishCatalog.ts:65`), `getLoggedUmassDishHistory`
  (`dishHistory.ts`) and `searchCustomFoods` (`customFoodsStorage.ts`) are all whole-phrase `includes`.
- **Lookup client** (`mobile/src/lib/lookupDish.ts`): `lookupDishLive` maps every error to `rate_limited`.
  The function returns its real rate-limited result as **HTTP 200** with `status: "rate_limited"` in the
  body (`lookup-dish/index.ts:381,421`). 400/405/502 are genuine errors.
- **Lookup server** (`lookup-dish/index.ts`): `selectCandidateHits` (:148) keeps exact-name hits only,
  and `fetchFoodProCandidates` (:253) sends the whole phrase.

## Decisions (owner, 2026-09-25)

1. The count goes on the direct-lookup row only, shown when the lookup settles. There is no live count while it runs; that would need a streaming function.
2. Prefetch today + 2 days.
3. A miss now renders a row ("No new foods found"). This replaces the earlier "a miss renders no row" rule.

## Acceptance

Task 1 (A):
- [ ] `isMenuCacheFinal`: true iff `fetchedAt` is on or after the local start of `date` **and** there are items. `[]` is never final. — evidence: test
- [ ] `saveCachedMenu` never overwrites a non-empty row with `[]`. — evidence: test
- [ ] `loadMenuCacheFirst(tid, date, onItems)` in `menuFetchWithSeenTracking.ts`. — evidence: test
  - It delivers the cached copy before the fetch resolves, and records seen for it.
  - It skips the network when the copy is final.
  - It delivers a late fresh result.
  - It rejects only when there is no cache and the fetch failed.
- [ ] The hall main and Grab effects use it. — evidence: test (hallMenu.test.tsx) + screenshot
  - With no cache, the error card appears after `MENU_NO_CACHE_WAIT_MS` (~8s).
  - A late success clears the error.
  - The `cachedMenu` state and `showSavedCopy` are deleted.
- [ ] Hours: a cached copy is used immediately only if its `fetchedAt` is today (`effectiveToday()`).
  `hoursSettled` flips after `HOURS_WAIT_MS` (~3s) even if the fetch is still pending. — evidence: test
- [ ] `warmMenuCache`: — evidence: test
  - It covers today + 2 days × `menuCacheTids()`.
  - It skips a copy that is final, or not final but under about 6h old.
  - It also warms the hours.
- [ ] `backgroundTask.ts` reads with `effectiveToday()`. — evidence: test
- [ ] On-device: after airplane mode and a cold start, `halls/worcester` renders today's and tomorrow's menu from the cache. — evidence: screenshot
Task 2 (B):
- [ ] `matchesQuery(name, query)` in `@udine/shared`, exported. It lowercases, turns non-alphanumerics
  into spaces, and requires every token to be a substring. — evidence: test
  - "white pizza" matches "White Cheese Pizza" and does not match "White Kidney Beans".
  - "pizza, white" and double spaces match.
- [ ] Catalog, history and custom-food search all use it. — evidence: test
- [ ] Today's cached menus for `menuCacheTids()` are a local search source. — evidence: test
  - They merge by name with the catalog.
  - They are staged with the browsing `hallTid`.
- [ ] `matchQualityTier` adds a tier 3 for "all tokens, not a substring". — evidence: test
- [ ] Direct lookup and `loadMore` use the committed query. — evidence: test
  - The loading label shows the query captured when the lookup started.
  - Typing during a lookup leaves the label unchanged.
- [ ] `initialQuery` seeds once per open, so the box is not re-seeded after the custom-food form closes. — evidence: test
- [ ] Lookup rows: — evidence: test + screenshots
  - "Found N new food(s)", where N = candidates not already in `results` (case-insensitive).
  - "No new foods found".
  - Offline.
  - Rate-limited keeps its existing copy and glyph, distinct from offline.
- [ ] `lookupDishLive` returns `rate_limited` only for a body with `status: "rate_limited"`. Everything
  else that isn't a hit or a miss becomes `offline`. — evidence: test
Task 3 (C):
- [ ] `selectCandidateHits` uses the token rule. — evidence: deno test
  - Exact matches sort first.
  - The RecNum dedupe and the cap are kept.
  - "White Pizza" selects "White Cheese Pizza".
- [ ] `search.aspx` receives the longest query token. — evidence: deno test

## Tasks

1. Offline-first menus — files: `mobile/src/lib/menuHoursCache.ts`, `menuFetchWithSeenTracking.ts`,
   `menuPrefetch.ts`, `backgroundTask.ts`, `mobile/src/app/halls/[slug].tsx` + tests — lanes: mobile tsc/jest/lint,
   expo export — blocked by: none — PR:
2. Search fixes — files: `shared/src/` (new matcher + index export), `mobile/src/lib/dishCatalog.ts`,
   `dishHistory.ts`, `customFoodsStorage.ts`, `lookupDish.ts`, `mobile/src/components/PlateSheet.tsx`,
   `mobile/scripts/screenshot.sh` (fixture list) + tests — lanes: shared test/typecheck/lint, mobile tsc/jest/lint,
   expo export — blocked by: none (serialize `screenshot.sh` runs with task 1, because Metro is a host singleton) — PR:
3. lookup-dish token matching — files: `supabase/functions/lookup-dish/index.ts`, `index.test.ts` — lanes:
   deno test for lookup-dish — blocked by: none — owner-merged + deploy — PR:
