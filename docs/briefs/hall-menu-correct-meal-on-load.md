# Hall menu opens on the correct meal tab immediately

Goal: opening a real dining hall's menu never flashes the wrong meal tab (currently a hardcoded
"Lunch" default) before snapping to the actual current meal period. Once the loading shimmer
clears, the tab that's active — and the station list under it — is already correct.

## Spec

UI: `docs/design/HallMenu.dc.html` (hall menu + plate bar), `docs/design/MenuLoading.dc.html`
(the loading-shimmer state this fix extends). No new artboard — this corrects the timing of an
existing designed state, it doesn't add one.
Annotations: none.
States:
- Cold app launch, no in-memory hours yet — shimmer, then correct tab/content, no flash.
- Warm app (screen revisited this session) — same.
- Real hall outside lunch hours (Late Night, Dinner, Breakfast) — the case that currently shows
  the flash; during actual lunch hours the wrong default happens to be right, so the bug is
  invisible then. Test/screenshot evidence must use a non-lunch current time.
- Café screens (`isRealHall` false) — already resolve `selectedMeal` from `null` once items load,
  via `deriveCafeMealTabs`; unaffected by this fix, must stay unaffected.
Routes: `halls/hampshire --record 3` (or any real hall) run at a non-lunch time of day (or with
the device clock / a stress fixture forcing `currentMealPeriod` to something other than lunch) —
the evidence for a timing bug is the shimmer→content transition across the recording, not one
static frame.

Backend: none.
Residency: none — pure client-side render-timing fix, no new client→Supabase call, no new stored
data.
Rationale: Root cause (confirmed by reading `mobile/src/app/halls/[slug].tsx`): `selectedMeal`
starts at a hardcoded `"lunch"` (`[slug].tsx:717`, comment above it already flags this as
deliberate — a synchronous default is unavoidable since something must render before any data
exists). A `useLayoutEffect` (`[slug].tsx:1248-1264`) corrects it to the real current meal once
`hallHours` arrives via its own independent async fetch, and `mealTabInstantRef` prevents that
correction from visibly *swiping* through the tabs. But `hallHours` and the menu `items` fetch are
two unrelated, differently-timed network calls, and the meal-tab row's shimmer today is gated on
`items === null` alone (`[slug].tsx:1680`) — so the moment `items` resolves, the tab row renders
real (non-skeleton) text and content using whatever `selectedMeal` is at that instant, which is
still `"lunch"` if `hoursFeed` hasn't resolved yet. That's the flash: shimmer → real "Lunch"
content → snap to the real period once hours catches up.

Two fixes were considered:
1. **Chosen**: extend the shimmer gate so a real hall's tab row (and whatever content its active
   tab drives) stays in the loading state until *both* `items` and `hallHours` have arrived, not
   just `items`. This means the wrong `"lunch"` default is never painted as trustworthy content —
   matches how `app/index.tsx`'s Home screen already handles the same kind of "don't show a value
   before its backing data exists" problem (`hero = hoursFeed ? deriveHomeHero(...) : null`,
   `index.tsx:267`, shimmering instead of guessing). Smallest diff: one gating condition changes.
2. **Rejected (deferred, not required)**: add a synchronous in-memory `hoursFeed` cache mirror,
   mirroring `mobile/src/lib/preferences.ts`'s `cache`/`getCachedPreferences()` pattern (warmed by
   a fire-and-forget call at app launch in `_layout.tsx`), so `hallHours` can be seeded
   synchronously on first render most of the time. This is the upgrade path the code's own
   `ponytail:` comment already points at (`[slug].tsx:1258-1261`), and it would improve perceived
   speed on a warm app (no shimmer wait at all most opens) — but it doesn't by itself guarantee
   correctness on a true first-ever cold start (empty cache), so it would still need fix 1 layered
   on top to fully satisfy "correct immediately after loading." Since the acceptance bar here is
   correctness, not perceived latency, fix 1 alone is sufficient and is the smaller change. Fix 2
   is a legitimate future perf follow-up, not part of this brief.

## Acceptance

- [ ] Opening a real hall while the actual current meal period is NOT lunch (e.g. Late Night or
      Dinner) shows that correct period as the active tab, with its real station content, the
      moment the shimmer clears — no intermediate frame of Lunch's real content — evidence:
      screenshot.sh `--record` capture, frame-by-frame review
- [ ] `mobile/src/lib/hallMenu.test.tsx`'s existing "defaults to the Lunch tab" interim-state test
      is replaced with (or supplemented by) an assertion that the screen renders the loading/
      shimmer state, not Lunch's real content, for as long as `hallHours` is unresolved — evidence:
      test
- [ ] The existing "lands on the Dinner tab (not the static Lunch default) once hours resolve"
      test in the same file continues to pass, now with no interim wrong-content frame to reconcile
      — evidence: test
- [ ] Café screens (no fixed meal default) are unaffected — evidence: existing café tests in
      `mobile/src/lib/hallMenu.test.tsx` continue passing unmodified
- [ ] `mobile/src/lib/hallMenuTabs.test.ts`'s `shouldAutoCorrectMealTab` coverage and
      `mobile/src/components/MealTabPager.test.tsx`'s `instantRef` snap-vs-tween coverage are
      unaffected (this fix changes *when* content is trustworthy to show, not the correction logic
      itself) — evidence: test

## Tasks

1. Extend the real-hall meal-tab shimmer gate in `mobile/src/app/halls/[slug].tsx` (currently
   `isRealHall && items === null` at line 1680, and whatever station-list skeleton condition
   mirrors it) to also require `hallHours` to be defined before rendering real tab labels/content
   — i.e. a real hall stays in its loading state until both the menu items and the dining hours
   have arrived. Update the interim-state test in `mobile/src/lib/hallMenu.test.tsx` accordingly
   (red first: show the current test asserts real Lunch content appears before hours resolve, then
   flip the assertion to expect the loading state instead). — files: `mobile/src/app/halls/[slug].tsx`,
   `mobile/src/lib/hallMenu.test.tsx` — lanes: `cd mobile && npx tsc --noEmit && TZ=America/New_York npx jest && pnpm lint`
   — blocked by: none — PR:
