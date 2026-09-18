# Plate search: ordering, direct-lookup availability, and catalog-refresh visibility

Goal: the 4-source add-a-food search (`PlateSheet.tsx`) has deterministic, specified behavior for
result ordering, when the UMass-direct-lookup escape hatch is available, what "Load More" does, and
what a background catalog refresh actually does for an open search — instead of accreted,
undocumented behavior that's ambiguous enough that agents touching it keep producing inconsistent
results. This brief is the spec those agents should have had; owner-reviewed 2026-09-18, decisions
below are final, not open questions.

## Spec

UI: `PlateSheetResults.dc.html` (no new artboard needed — this is ordering/logic, not visual).
Annotations: none.
States: a search with a mix of umass-catalog, custom-food, OFF, and USDA hits, in enough volume to
require Load More; a search where the catalog is stale and refreshes mid-session.
Routes: `halls/franklin --stress lookup-hit --record-nav` for the direct-lookup-availability
screenshot; ordering/label changes are covered by unit tests, not new screenshots (no visual change
to any individual row, only their order and the load-more button's label).

Backend: none — no schema/RPC change. `refreshDishCatalogIfStale` already reads `public.dishes` via
the existing `fetchDishCatalog` client call.
Residency: none — no new client→Supabase call, no new stored data.

## Decisions (owner-reviewed 2026-09-18)

1. **Cross-source ordering: UMass first, always.** Today `results` is in whatever order the 4
   parallel groups (local umass catalog+history, OFF, USDA Foundation/SR, USDA Branded) happen to
   resolve — a real UMass catalog match can render below a lower-trust source purely by network
   timing. Per CLAUDE.md's own "UMass numbers are source of truth on campus": umass/history results
   always sort first, regardless of arrival order or which group's promise settled first.

2. **Custom foods: interleaved by relevance, not appended after umass.** Currently custom foods are
   spliced into the same "local" group right after umass catalog/history, unconditionally after
   them. Owner wants relevance-based interleaving instead. "Relevance" needs an operational
   definition since there's no unified cross-source score today (OFF/USDA rank server-side; umass
   catalog/history/custom are unscored substring matches) — use match quality as the tiebreaker
   within the umass-first group from decision 1: an exact or prefix match on `dishName`/food name
   outranks a plain substring match, and custom foods interleave with umass/history by that same
   match-quality rule (not simply appended after all of them). OFF/USDA groups keep their own
   already-ranked internal order and continue to sort after the umass+custom group per decision 1.

3. **"Search UMass Dining directly" is unconditionally available once a search finishes, not
   gated on result content.** Reported symptom: "I really don't see it at the bottom at times" —
   the owner is fine with its current position (bottom of the results list, after Load More), but
   it should never simply be absent. Root cause: the current gate
   (`!results.some((r) => r.kind === "umass")`) hides it entirely the moment *any* umass-kind
   result exists anywhere in the accumulated results — even an unrelated catalog hit that happens
   to share a keyword with the query, which has nothing to do with whether the food the user
   actually wants is present. Fix: drop that condition. The affordance shows whenever
   `results !== null && !searching && directLookup !== "loading"` — i.e., after every completed
   search, full stop. (The already-correct behavior — it hides while `directLookup === "loading"`
   and while a search is in flight — is unchanged.)

4. **"Load N More" → always "Load More".** The current label
   (`` `Load ${Math.min(VISIBLE_RESULTS, hiddenFetched)} More` `` vs. `` `Load ${SEARCH_PAGE_SIZE} More` ``)
   leaks the reveal-buffered-vs-fetch-next-page implementation distinction into user-facing copy —
   confusing when it silently changes from "Load 5 More" to "Load 20 More" mid-session for no
   apparent reason. Replace with a single fixed "Load More" label regardless of which is happening
   underneath (the underlying reveal-then-fetch mechanism itself is fine and unchanged, only the
   copy simplifies).

5. **Catalog cold-fetch (`refreshDishCatalogIfStale`) must actually feed an open search, and this
   needs to be a real fix, not just documentation.** Current behavior: fires once per `PlateSheet`
   mount (fire-and-forget, no UI at all), refreshes the local dish-catalog cache from Supabase if
   it's >24h stale, and swallows errors. If it resolves *after* the user has already run a search,
   nothing re-checks the newly-synced catalog against the current query — the user would have to
   close and reopen search (or retype/resubmit) to ever see a dish that just became available
   locally. Owner: "does it actually update the search in the app when you press the button? It
   should, and it should be clear to the user." There is no button today — this fires silently on
   mount, which is itself part of the confusion (nothing user-facing currently claims to do this,
   so there's nothing to "press"). Fix, two parts:
   - **Functional:** if `refreshDishCatalogIfStale` resolves while a search is active (`results !==
     null`) and the current query now matches something new in the refreshed cache, re-run
     `searchCachedDishes` against the current query and splice any new umass hits into `results`
     (same `splice`/`searchSeq` guard the 4 search groups already use, so a stale resolution after
     the sheet closes or a new search starts is correctly dropped).
   - **Visible, without an explanatory caption (per this repo's no-UI-captions rule):** the newly
     -added row(s) should be visually distinguishable as just-arrived — e.g. reuse whatever this
     codebase's standard "row just appeared" treatment is (check `motion.ts`/existing list-insert
     animations first; introduce nothing new if one already exists) — rather than a silent
     re-sort/appear with no signal, and rather than a text label describing the mechanism.

6. **Starting a new search must actually be possible while one is in flight, and must supersede
   it — today neither half is true for the main search.** The owner's answer ("stop fetching if
   you search for something new") requires two things: (a) you can actually start a new search
   while an old one is still running, and (b) doing so discards the old one's late results. Only
   (b) exists today. `runSearch`'s own guard (`if (!raw.trim() || searching) return;`,
   `PlateSheet.tsx:320`, comment: "mashing Enter while typing would otherwise fire overlapping
   requests") and the Search button's `disabled={searching || !query.trim()}` both block *any* new
   search — not just a resubmission of the same still-in-flight query — from starting at all while
   `searching` is true. So the `searchSeq`-based staleness discard (which does correctly no-op a
   superseded search's late results) is currently unreachable for this exact case: you cannot
   trigger a second search until the first one finishes, at which point there's nothing left for it
   to supersede. Fix: change the guard to only block resubmitting the *same* query that's currently
   in flight (e.g. compare the trimmed new query against the in-flight one, or simply drop the
   `searching` block and rely on `searchSeq` to correctly discard the old search's results the way
   it already does for `runDirectLookup`) — a genuinely different query should be allowed to start
   immediately and supersede the running one.

   `runDirectLookup` itself has no equivalent problem: it captures `searchSeq.current` at call time
   and checks it after `lookupDishLive` resolves, exactly like the 4 search groups, so a fresh
   `runSearch()` call (once reachable per the fix above) correctly makes a still-in-flight
   direct-lookup's eventual result a no-op. The underlying HTTP request itself isn't aborted (no
   `AbortController`), only its result is ignored; that's a possible follow-up (saves a wasted
   round-trip / FoodPro Web INA rate-limit budget) but not required by this brief.

   `SearchCancelOptionA/B/C` (the three unpicked design explorations for a manual cancel affordance
   on the fetching row) are **not** being adopted — the owner's answer is the automatic-supersede
   behavior above, not a manual cancel button. Those three artboards can stay unpicked/unused; no
   task here implements any of them.

Rejected alternative (decision 3): keep the gate but only suppress the affordance on an *exact*
name match — rejected as unnecessary complexity: the owner's own framing was "always," and an exact
match on an unrelated dish (e.g., a catalog hit for "Chicken Congee" while searching for a custom
off-menu item that happens to contain "chicken") is exactly the failure case reported.

## Acceptance

- [ ] `results` sorts umass/history matches first, independent of which of the 4 groups' promises
      settled first — evidence: test (seed groups resolving out of order, assert final order)
- [ ] Custom foods interleave with umass/history by match quality (exact/prefix beats substring),
      not appended unconditionally after them — evidence: test
- [ ] "Search UMass Dining directly" renders whenever `results !== null && !searching &&
      directLookup !== "loading"`, with no dependency on result content — evidence: test (assert it
      renders even when a umass result is present) + screenshot
- [ ] Load More's button always reads "Load More" — evidence: test + screenshot
- [ ] A catalog refresh that resolves during an active search with a still-matching query splices
      new umass hits into the visible results, visually distinguished as newly-arrived, without any
      new explanatory text — evidence: test (mock a resolving `refreshDishCatalogIfStale` after
      `results` is already set, assert the new row appears) + screenshot/recording
- [ ] Submitting a genuinely different query while a search is still in flight is no longer
      blocked, and correctly abandons/discards the in-flight search's results in favor of the new
      one's — evidence: test (start search A, before it resolves start search B with a different
      query, assert only B's results end up applied); resubmitting the *same* still-in-flight query
      remains a no-op — evidence: test
- [ ] No regression to `runDirectLookup`'s existing `searchSeq`-gated staleness protection, and a
      fresh search started while a direct lookup is in flight correctly supersedes it — evidence:
      existing tests still pass + new test

## Tasks

1. Implement decisions 1-5 (ordering, custom-food interleaving, unconditional direct-lookup
   availability, fixed "Load More" label, live-splicing a resolved catalog refresh into an open
   search). — files: `mobile/src/components/PlateSheet.tsx`, `mobile/src/components/PlateSheet.test.tsx`,
   `mobile/src/lib/dishCatalog.ts` (if the re-match-on-refresh helper belongs there rather than
   inline) — lanes: `cd mobile && npx tsc --noEmit`, `pnpm --filter mobile test`,
   `pnpm --filter mobile lint` — blocked by: none, but see note below — PR:

Note on sequencing: this brief and `docs/briefs/platesheet-search-results-parity-gap.md` /
`docs/briefs/platesheet-search-expanded-header-parity.md` all touch `PlateSheet.tsx`. Dispatch this
one after those two have merged, not concurrently — three agents editing the same file at once is a
guaranteed merge fight, not a parallelism win.
