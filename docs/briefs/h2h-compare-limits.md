# Compare limits: a natural end to rating

Goal: rating dishes has a natural stopping point. Today "Another" (after a pick) and "RATE MORE" (You
pane) can loop forever. Afterwards a logged meal offers a round of 5 comparisons, the You pane offers 5
more per day, the sheet shows how far along the user is ("2 of 5"), and when a budget is used up the
"Another" / "RATE MORE" action simply stops appearing.

Follow-up to `head-to-head-compare.md` (shipped in #523, #524-#528, #530).

## Spec

UI (canvas page "Head-to-Head & Toasts", canvas v59):
- `CompareSheet.dc.html` — UPDATED: the title row gains a right-aligned "1 of 5" count (PlateExpanded's
  title-row idiom: baseline row, 12px, 55% ink)
- `CompareToastRoundDone.dc.html` — NEW: the toast after the LAST pick of a round: winner + score, no action
- `YouTopFoodsAllowanceUsed.dc.html` — NEW: You pane Top Foods with today's allowance used: no "RATE MORE"
Unchanged and still the spec: `CompareToastPicked.dc.html` (toast with "Another"), `YouTopFoodsRankMore.dc.html`,
`YouTopFoodsEmpty.dc.html`, `ToastLogged.dc.html`.
Annotations: `h2h-limits-note` (canvas page 12; owner: suffix it `brief: h2h-compare-limits`).

Rules (owner, 2026-09-20):
1. **Post-log round: 5 comparisons per logged meal** (per successful Log tap). The sheet count reads
   "n of 5". The 5th pick's toast shows the winner and score with no "Another".
2. **You pane allowance: 5 comparisons per local calendar day**, shared by "RATE MORE" and
   "Start comparing", stored on the device only. The sheet count reads today's picks made + 1 ("3 of 5" after two picks). When
   the 5th is recorded, its toast has no "Another" and both actions are hidden until the next day.
3. The two budgets are SEPARATE: post-log rounds never draw on the daily allowance.
4. Only RECORDED picks count. Skip records nothing and costs nothing; a failed save costs nothing.
5. A round or allowance can also end early when there is no other pair (two logged dishes): `dealPair`
   already returns null, so no "Another" (shipped behavior, unchanged).

States a screenshot must show:
- Sheet, post-log, "1 of 5" (first pair of a round); and a later count on the You pane path ("3 of 5" after two picks today).
- After-pick toast with "Another" mid-round (existing artboard); after the 5th pick, no action.
- You pane Top Foods populated with "RATE MORE" (existing); the same pane with today's allowance used
  (no "RATE MORE"); empty state with the allowance used is NOT possible (no picks yet means nothing spent).
- New-day reset: the count returns to "1 of 5" and "RATE MORE" returns (covered by tests with an
  injected clock; not a screenshot).
Routes: `halls/franklin --stress compare-pair` (sheet, count); `--stress compare-round-done` (toast after
the 5th pick, new dev fixture); `/ --stress compare-seed` and `compare-seed-used` (new) with the swipe
recipe from `screenshot.sh`'s header.

Backend: none. No table, RPC or Supabase call.
Residency: **device only, always.** The daily allowance is one small record, `{ date: "YYYY-MM-DD"
(local), count }`, in the existing `preferences_kv` (same store as `ranked_dishes`). It is throttle state,
not user data, so it is not added to the JSON/CSV export; it is derivable from nothing (comparison
timestamps are not stored) and is never sent to Supabase. The post-log round counter is in-memory only.
Rationale: a cap by rounds, not a global counter, because the two moments differ: right after a meal the
user has an opinion and a fresh pair is cheap, so a round of 5 is free and needs no persisted state;
the You pane is the deliberate "I want to rate more" path, so it gets a small daily allowance that has to
be remembered across app restarts. Rejected: one shared daily pool (a big lunch spends the day's budget
before dinner), a per-dish or per-pair cap (needs pair history the ranking store does not keep), and a
hard block with an explanatory message (the design shows no captions; the action just stops appearing).

## Decisions made by the implementer's brief author, to confirm

1. Skip does not count and there is no cap on skips (no comparison is recorded, so no ranking effect).
2. The day boundary is the device's local midnight, evaluated when a pick is recorded and when the You
   pane renders; a pick recorded after midnight starts a new day at "1 of 5".
3. The round size and the allowance are both 5 but are two constants (`ROUND_SIZE`, `DAILY_ALLOWANCE`)
   in `lib/compare.ts`, so they can move independently.

## Acceptance

- [ ] `remainingToday(store, now)` / `recordDailyPick(store, now)` (names indicative) read and write the
      `{date, count}` record in `preferences_kv`; a new local date resets the count; the count never
      exceeds `DAILY_ALLOWANCE` — evidence: test (injected clock, stub store; red first)
- [ ] A round tracker counts recorded picks toward `ROUND_SIZE`, resets on a new successful log, and is
      not affected by Skip or a failed save — evidence: test
- [ ] Post-log: the sheet shows "n of 5" (n = picks made this round + 1); the 5th pick's toast has no
      "Another"; after it "Rate them" on that log's toast is not offered again — evidence: test + screenshot
- [ ] You pane: the sheet shows today's picks made + 1 (1-based, "1 of 5" before any pick today); RATE MORE and Start comparing are hidden once today's
      allowance is used and reappear on a new day; the 5th pick's toast has no "Another" —
      evidence: test + screenshot
- [ ] Post-log picks never change the daily count, and You-pane picks never change a post-log round —
      evidence: test
- [ ] Sheet count, the round-done toast and the allowance-used pane match `CompareSheet.dc.html`,
      `CompareToastRoundDone.dc.html`, `YouTopFoodsAllowanceUsed.dc.html` (read via `artboardStyle()` and
      friends, not by eye); the existing sheet/toast/pane parity tests still pass against the updated
      artboards — evidence: test + screenshot
- [ ] No Supabase call, no `syncDiningHallRanks`, the daily record is not exported or synced — evidence: test
      (grep-style, as in `compare.test.ts`) + review
- [ ] No explanatory text was added anywhere: the only new UI copy is the "n of 5" count —
      evidence: review (`pr-reviewer.md` caption scan)

## Tasks

1. Round + allowance logic (no UI) — files: `mobile/src/lib/compare.ts` (`ROUND_SIZE`, `DAILY_ALLOWANCE`,
   pure helpers) + a small `mobile/src/lib/compareAllowance.ts` over the existing `preferences_kv` store
   (follow `rankingStorage.ts`) + tests; no `src/app` or component change; this PR also adds this brief —
   lanes: mobile `tsc`, jest, lint — blocked by: none — PR:
2. UI wiring + artboard update — files: `mobile/src/components/CompareSheet.tsx` (count),
   `mobile/src/app/halls/[slug].tsx` (per-log round), `mobile/src/panes/YouPane.tsx` (allowance),
   `mobile/src/lib/compare.ts` fixtures, `docs/design/*` re-extracted from canvas v59 (CompareSheet, the two
   new artboards, `canvas.json`) and their README rows, parity tests updated for the changed sheet artboard;
   dev-only `--stress compare-round-done` / `compare-seed-used` — lanes: mobile `tsc`, jest, lint,
   `expo export` — blocked by: 1 — PR:
