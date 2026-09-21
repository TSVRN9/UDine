# Daily allowance hardening: foreground refresh + no interleaved sixth pick

Goal: two small, independent hardenings of the You pane's daily comparison allowance
(`h2h-compare-limits.md`, shipped in #532/#533). Neither is user-visible. (A) The pane stops reading the
allowance on every render and instead refreshes when the app comes to the foreground and at local
midnight, so a new day shows without relying on incidental re-renders. (B) The check, the ranking save
and the count become one serialized step, so two interleaved pick flows can never save a sixth comparison.

Both came out of the final review of #533 and were accepted as "optional". Either can be dropped.

## Spec

UI: none. No artboard changes; the You pane must look exactly as before.
Annotations: none.
States (behavior only, no new screenshot state):
- A. New day while the app stays in the foreground across local midnight: RATE MORE / Start comparing
  reappear without any user action. New day while the app was backgrounded: they reappear when it returns
  to the foreground. An unrelated re-render (favorites toggled, a toast) does NOT read the allowance.
- B. Two pick flows started 0..20 microtask ticks apart at 4 of 5 used: exactly one ranking is saved and
  the count ends at 5 (today, a second flow starting 4..10 ticks after the first also passes the check and
  saves, leaving 6 rankings with the count at 5 -- reproduced by the reviewer with a scratch test).
Routes: the gate treats any non-comment diff in `mobile/src/panes/YouPane.tsx` as a rendered-output change,
so each PR ships the existing populated-pane still as proof of no visual change:
`/ --stress compare-seed --swipe 900 400 150 400` (recipe in `mobile/scripts/screenshot.sh`'s header), compared
to `YouTopFoodsRankMore.dc.html`.

Backend: none. Residency: unchanged, device only (`compare_daily_allowance` in `preferences_kv`; nothing
sent anywhere, nothing exported).

Current code (main at `ac5863f`), for the implementer:
- `mobile/src/panes/YouPane.tsx` ~179-185: `useEffect(() => { picksToday(allowance, new Date()).then(...) })`
  with no dependency array, i.e. a store read after every render. Measured by the reviewer: about 2 reads
  on cold mount, 1 on opening the sheet, 2 per pick. `useFocusEffect` does not help (this pane is a
  pane on the index route, so swiping to it is not a focus event; see the comment at ~138).
- `pickComparison` (~211-233): re-reads `picksToday`, calls `resolvePick` (which saves the rankings via
  `recordComparison`'s single-flight guard), then `recordDailyPick`. Those three awaits are not one critical
  section; `recordDailyPick`'s promise queue (`compareAllowance.ts`, module-level `queue`) only serializes the
  count write.
- `AppState` is not used anywhere in `mobile/src` today.

Rationale: (A) the render-driven read was chosen in #533 because a focus hook cannot see pane swipes; it is
correct but wasteful and only refreshes when something happens to re-render. The explicit triggers are
foreground (`AppState` "change" to "active", covers overnight backgrounding) plus one timeout to the next
local midnight (covers a device left on in the foreground); mount and after-pick reads stay. Rejected: a
focus-only read (misses pane swipes), a polling interval (battery, needless). (B) the fix that needs the least
new state is to make check + save + count one serialized section; rejected: reserve-before-save with a
rollback on failure (two writes and a failure path for the same guarantee).

## Decisions to confirm (defaults chosen)

1. (A) includes the midnight timeout, not just `AppState`. Without it a screen left on across midnight
   keeps RATE MORE hidden until the next mount, foreground or pick. Drop the timeout if that edge is
   not worth a timer.
2. (B) severity is low: the cap is soft, at most one extra pick, and it needs two flows interleaving at the
   microtask level (a real second tap arrives after the sheet has closed and is dropped). Do it only if the
   guarantee "never more than 5" is wanted as a hard invariant.
3. (B) keeps today's fail-open rule: if only the count write fails, the pick stays saved and uncounted.

## Acceptance

- [ ] (A) The allowance is read on mount, when `AppState` changes to "active", when the local-midnight timeout
      fires, and after a pick; an unrelated re-render performs no read (assert store read counts across
      re-renders) — evidence: test
- [ ] (A) Foreground across midnight (fake timers + injected clock) and background-then-foreground across
      midnight both show RATE MORE again with no user action — evidence: test
- [ ] (A) The `AppState` subscription is removed and the timeout cleared on unmount; the timeout is re-armed
      after it fires (a second midnight) — evidence: test
- [ ] (A) Everything shipped in #533 still holds (pick-time re-check, count snapshot, hide/show at 0/4/5, new-day
      reset); the existing YouPane tests pass unchanged apart from the removed per-render read — evidence: test
- [ ] (B) Check + ranking save + count run as one serialized step (name indicative:
      `withDailyPick(store, now, save)` in `compareAllowance.ts`): two flows started 0..20 microtask ticks apart
      at 4 of 5 save exactly one ranking and end at 5; at 5 of 5 neither saves — evidence: test (scripted
      offsets; red first)
- [ ] (B) `save` returning null or throwing costs nothing and does not wedge later flows; a failed count write
      still leaves the pick saved (fail-open, as today); a `save` that never settles blocks later flows (same
      documented ceiling as the existing queue) — evidence: test
- [ ] Each PR's rendered-output check is satisfied by an unchanged populated-pane still, sidecar at the last
      non-media commit — evidence: screenshot
- [ ] No supabase / `syncDiningHallRanks`, no new UI copy — evidence: test (existing grep tests) + review

## Tasks

1. (A) Foreground + midnight refresh — files: `mobile/src/panes/YouPane.tsx` (replace the per-render effect),
   a small `mobile/src/lib/useAllowanceRefresh.ts` if it reads cleaner, `YouPane.test.tsx` — lanes: mobile `tsc`,
   jest, lint, `expo export` — blocked by: none — PR:
2. (B) One serialized pick step — files: `mobile/src/lib/compareAllowance.ts` (+ test), `mobile/src/panes/YouPane.tsx`
   (`pickComparison` calls it), `YouPane.test.tsx` — lanes: mobile `tsc`, jest, lint, `expo export` — blocked by: none
   (both touch `YouPane.tsx` in different regions; whichever merges second rebases) — PR:
