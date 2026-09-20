# Head-to-head compare

Goal: a user can rate the dishes they've eaten by picking which of two they liked more, straight
from the moment they log a meal ("Rate them" on the logged toast) or from the You pane's Your Top
Foods section ("Rate more" / "Start comparing"). Every pick moves both Elo tracks, so Your Top
Foods and Favorite Halls fill in from real comparisons. Today nothing in the app can write a
comparison: the compare screen (`rank.tsx`) was shelved in #338 and the You pane only reads.
Ships with a shared toast component that replaces the inline "logged" banner.

## Spec

UI (canvas page "Head-to-Head & Toasts"):
- `ToastLogged.dc.html` — success toast after a log, with the "Rate them" action
- `ToastLogFailed.dc.html` — failure toast (plate kept, plate bar visible)
- `CompareSheet.dc.html` — the compare sheet over the hall menu
- `CompareToastPicked.dc.html` — toast after a pick, with "Another"
- `YouTopFoodsRankMore.dc.html` — You pane, Top Foods with the "Rate more" header action
- `YouTopFoodsEmpty.dc.html` — You pane, Top Foods and Favorite Halls empty states

Host surfaces they modify: `HallMenu.dc.html` (`app/halls/[slug].tsx`), `PlateExpanded.dc.html`
(the sheet idiom the compare sheet copies), `YouPaneGrouped.dc.html` (`panes/YouPane.tsx`). The
sheet slides via `useDraggableSheet` (`lib/sheetAnimation.ts`); toast motion is `durations.toast`
(260ms, `.toastbox` in `Prototype.dc.html`) — the token exists with no call site today.
Annotations: `h2h-note` (canvas, page 12). Owner: suffix it `brief: head-to-head-compare`.
States a screenshot must show:
- Toast, success: "Logged 3 items" + "640 cal · 65g protein" + "Rate them"; gold check, gold 1px border.
- Toast, success with no eligible opponent (first ever logged dish): same toast, no action.
- Toast, failure: "Couldn't log 2 of 3 items", maroon600 fill, "!" badge, no action, plate bar still
  shown and the toast clear above it; stays until dismissed.
- Compare sheet: title "Which did you like more?", two dish cards ("Hampshire · 320 cal"), "or", Skip.
- After a pick: toast with the winner, "9.1 · 15 comparisons", "Another". Winner below the score gate
  (fewer than 3 comparisons): the sub-line is just "2 comparisons" (no score).
- You pane Top Foods, populated: "Rate more ›" in the header; #1 row gold score pill, the rest outlined.
- You pane Top Foods, empty (`rankedFoods.length === 0`): dashed "Start comparing" row + "No comparisons
  yet"; Favorite Halls shows "No ranking yet". With fewer than two distinct logged dishes the
  "Start comparing" row and the "Rate more" action are not rendered (nothing to pair).
Routes:
- Toasts / sheet / after-pick: `halls/franklin --stress compare-pair --wait-for "Which did you like more?"`
  (dev-only fixture, task 3: seeds two logged dishes and opens the sheet, same pattern as the
  `search-*` fixtures). Toast success/failure frames: `halls/franklin --stress compare-toast-ok`
  / `compare-toast-fail`.
- You pane: the `index` route with the swipe to the You pane (see `screenshot.sh`'s `--swipe`
  examples), before and after seeding via `--stress compare-seed`.

Backend: none. No table, RPC, or edge function is touched, and no Supabase call is added.
Residency: **Dish ranking: raw pairwise comparisons AND per-dish order — device only, always.**
Comparisons are written through the existing `SqliteRankingStorage` (`preferences_kv` keys
`ranked_dishes` / `ranked_foods`). The archived `rank.tsx` also called `syncDiningHallRanks` after
each pick; **this brief does not.** Favorite-halls server sync is owner-gated and has no device
toggle on `main` (`isHallSyncEnabled` exists only on the archive branch), so a pick writes nothing
off-device. See Out of scope.
Rationale: one compare sheet fed by two entry points, not a standalone Rank screen. The old screen
needed a home the pane shell doesn't have (no tab bar), and the two moments users naturally have an
opinion are right after logging and while looking at their own top foods. The toast becomes a real
shared component (rather than adding a button to the existing inline banner) because the banner
already carries both success and failure with no visual difference, and an action that must be
tappable needs to outlast the banner's 4s. Rejected alternatives: a permanent Home duel card (adds
standing clutter, mocked and dropped by the owner), a per-row "compare" action on the menu or Logs
(hidden until someone looks for it), and a pill toast (no success/failure differentiation).

## Defaults chosen (confirm or change)

1. Verb: one verb, "Rate" (owner, 2026-09-20): the toast says "Rate them" and the You pane header says
   "RATE MORE". (First drawn as "Rank more"; unified after review.)
2. Toast dwell: success with an action stays 6s, without an action 4s (today's value). Failure stays
   until the next log attempt, a plate edit, or a tap on it. New constants go in `lib/motion.ts`.
3. Post-log opponent: `pickPostLogComparisonPair` is given only the entries logged *before* this
   plate, so the opponent is always a past dish, never another item from the same plate. The
   just-logged dish used is the one on the plate with the lowest `comparisonCount`.
4. Score shown after a pick uses `scoreOutOfTen` (needs 3 comparisons); below that, only the count.
5. "Another" and "Rate more" pick pairs with the archived `pickPair` (`git show
   archive/full-features:mobile/src/lib/pairSelection.ts`), skipping the pair just shown. With exactly
   two distinct logged dishes there is no other pair: `dealPair` returns null, the after-pick toast
   has no "Another" action, and Skip closes the sheet (found in review of #527; `pickPair` alone
   re-deals the same pair forever at two dishes).

## Out of scope

- Server sync of the derived favorite halls (`syncDiningHallRanks`) and its device toggle.
  Owner-gated (auth/sync/residency), its own brief.
- Web (`/web` is not in active development); shared-package promotion of `pairSelection` waits for it.
- Shared stats opt-in (`privacySettings.ts` is archive-only).

## Acceptance

- [x] Logging shows the shared toast: "Logged N items" text unchanged (existing `hallMenu.test.tsx`
      assertions stay green), gold-bordered card, action on the right when an opponent exists — evidence: test + screenshot
- [x] Toast styles match `ToastLogged.dc.html` / `ToastLogFailed.dc.html` (fill, border, radius, badge,
      shadow, type) read via `artboardStyle()` — evidence: test
- [x] A failed log shows the failure toast, keeps the plate, and the toast clears the plate bar —
      evidence: test + screenshot
- [x] Toast enter/exit uses `durations.toast`, all new dwell times live in `lib/motion.ts`, and
      `scripts/pr-gate.sh` finds no duration/easing literal outside it — evidence: test (`motion.test.ts`) + gate
- [x] The inline logged banner and its `bannerHeight` list-padding path are gone or reused by the
      toast, with the list still never hidden behind it — evidence: test + screenshot
- [x] "Rate them" opens the compare sheet on (just-logged dish, least-compared past dish); with no
      past dish the toast has no action — evidence: test
- [x] Picking a card calls `applyComparison` and `applyFoodComparison`, persists both through
      `SqliteRankingStorage`, and a second tap before the first finishes is dropped (no double count) —
      evidence: test (red first: a stub storage asserting one write per pick)
- [x] Skip records nothing and deals the next pair (or closes the sheet when there is none); a pick closes the sheet cleanly and shows the
      after-pick toast with "Another" — evidence: test + screenshot
- [x] Sheet matches `CompareSheet.dc.html` (scrim, handle, radius, card border, "or" divider, Skip);
      drag-to-dismiss and backdrop tap close it like `PlateSheet` — evidence: test + screenshot
- [x] You pane "Rate more" and the empty-state "Start comparing" open the same sheet; both are absent
      with fewer than two distinct logged dishes; after a pick the Top Foods list and Favorite Halls
      refresh without leaving the pane — evidence: test + screenshot
- [x] Nothing in this change imports `syncDiningHallRanks` or touches `supabase/`; `CompareSheet.tsx` imports no `supabase` at all (`halls/[slug].tsx` already imported the client for the dish catalog) —
      evidence: test (grep-style assertion in the compare module's test) + review
- [x] New comparisons appear in the existing JSON/CSV export with no export change — evidence: test
      (extend `exportShare.test.ts`)
- [x] No explanatory captions were added to any screen; the only added copy is the strings in the
      artboards — evidence: review (`pr-reviewer.md` caption scan)

## Tasks

Each task that lands a component updates the Component column of its artboards' rows in
`docs/design/README.md` (currently "design-only"); never the artboards themselves.

1. Shared toast component, replacing the inline logged banner — files: `mobile/src/components/Toast.tsx`
   (+ test), `mobile/src/lib/motion.ts` (+ `motion.test.ts`: `toast` gains its call site, add dwell
   constants), `mobile/src/app/halls/[slug].tsx` (`logged` string state → toast state with kind,
   message, sub-line, optional action), `mobile/src/lib/hallMenu.test.tsx`. No action yet.
   Screenshots: `ToastLogged`, `ToastLogFailed` — lanes: mobile test, `tsc`, lint, `expo export` (touches
   `src/app/`) — blocked by: none — PR: #525
2. Compare core (no UI) — files: `mobile/src/lib/pairSelection.ts` + test (restored from
   `archive/full-features`), new `mobile/src/lib/compare.ts` + test: `recordComparison(storage, winner,
   loser)` (both Elo tracks, both saves, single-flight guard), post-log pair helper over
   `pickPostLogComparisonPair`, score/count label helper over `scoreOutOfTen`. Red test first — lanes:
   mobile test, `tsc`, lint — blocked by: none — PR: #524 (task 5 folded in: one test in `exportShare.test.ts`)
3. Compare sheet + post-log wiring — files: `mobile/src/components/CompareSheet.tsx` (+ test, built on
   `useDraggableSheet`), `mobile/src/app/halls/[slug].tsx` ("Rate them" action, entries-before-this-plate,
   sheet open/close, after-pick toast with "Another"), dev-only `--stress compare-pair` /
   `compare-toast-ok` / `compare-toast-fail` fixtures (+ `screenshot.sh` header note). Screenshots:
   `CompareSheet`, `CompareToastPicked`, the no-action toast — lanes: mobile test, `tsc`, lint,
   `expo export` — blocked by: 1, 2 — PR: #527
4. You pane entry points — files: `mobile/src/panes/YouPane.tsx` (+ `YouPane.test.tsx`),
   `mobile/src/components/ui/SectionHeader.tsx` only if the right-side action needs it, dev-only
   `--stress compare-seed`. Reuses `CompareSheet` and `pickPair`. Screenshots: `YouTopFoodsRankMore`,
   `YouTopFoodsEmpty` — lanes: mobile test, `tsc`, lint, `expo export` — blocked by: 2, 3 — PR: #528
5. Export coverage check — files: `mobile/src/lib/exportShare.test.ts` (the existing ranking-export test) only — lanes:
   mobile test — blocked by: 2 — PR: folded into #524

## Shipped notes

Landed as #523 (aggregate) on 2026-09-20; the four task PRs are #524, #525, #527, #528, and the gate
change that made stacked PRs possible is #526. Decisions that emerged in review and are not above:
- The toast's easing is per property (`curves.ease` on opacity, the pane bezier on transform) with a
  12px `toastRise`, matching `.toastbox` in `Prototype.dc.html`; `toastDwell` 4s, `toastActionDwell` 6s.
- `resolvePick` / `resolveSkip` (lib/compare.ts) and `useToastDwell` (Toast.tsx) are shared by the hall
  menu and the You pane; the single-flight guard in `recordComparison` is one module-level flag.
- `SectionHeader` gained `growRule` for the Top Foods header; `TopFoodDisplay` carries `comparisonCount`
  for the "Hall · N comparisons" sub-line; the sheet's handle row keeps PlateSheet's 20px touch padding.
- Dev-only `--stress` fixtures: `compare-pair` (three logged dishes so "Another" appears),
  `compare-toast-rate` / `-ok` / `-fail`, `compare-seed` / `compare-seed-empty`.
- The toast says "Rate them" and the You pane header says "RATE MORE" (one verb, owner decision after the first merge; was "RANK MORE").
- Not built: server sync of the derived favorite halls (see Out of scope). Until that brief lands,
  comparisons never reach the server from mobile.
- Per-task screenshots and motion clips live on the remote branches `feat/h2h-toast`,
  `feat/h2h-compare-sheet`, `feat/h2h-you-pane` (main carries only the integration set in
  `docs/pr-review-media/docs-head-to-head-brief/`).
