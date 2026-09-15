# Hall favorited-food indicator (status badge)

Goal: a user can tell, from the Home hall list alone, that a favorited dish was spotted at a hall
today — without opening each hall's menu — the same signal the push/local notification already
gave them, now visible at a glance next to the hall's OPEN/CLOSED status.

## Spec

UI: `docs/design/Main.dc.html` (Home pane hall cards) — the owner-picked "status badge" direction,
already folded into the artboard (PR #489): a small pill (bell glyph + count) stacked directly
under each hall card's OPEN/CLOSED status pill, top-right of the card.
Annotations: none (the three sketches and their directions note lived only on the live design
canvas, never extracted into this repo — the owner picked a direction there, and only the chosen
one was ever folded into `docs/design/Main.dc.html`, PR #489).
States:
  - 0 matches today at a hall → no badge at all (no "0" pill) — matches the daily feed's own
    "blank = doesn't exist" convention already used elsewhere on this screen.
  - 1+ matches → pill renders with the exact count (Worcester "2", Hampshire "1" in the artboard).
  - Signed-in and signed-out both render the badge (see Backend below for the two data sources);
    there is no separate "no badge because signed out" state — a signed-out user still gets local
    notifications (docs/briefs/eager-caching-and-notifications.md) and should still see the badge.
  - Independent of `HomePane`'s existing hours-`pending` shimmer state — the badge has its own data
    source (favorites + sightings), not `hoursFeed`, so it does not need to wait on or shimmer with
    the OPEN/CLOSED chip.
Routes: `"" --wait-for "GRAB"` (Home pane, default landing route) for the no-badge baseline, plus a
seeded-data capture showing at least one non-zero badge (see task 2 for how to seed one deterministically for the screenshot).

Backend: `public.food_sightings` (existing table, read-only from mobile — currently only `web`
reads it, at `web/src/routes/notifications/+page.svelte:158`; no schema change) for a signed-in
user; the existing local `food_sighting_dedup` SQLite table (`mobile/src/lib/sightingDedup.ts`,
written today by `notifySignedOutFavoriteMatches`) for a signed-out user. No new table, no new
column, no migration.
Residency: lands in CLAUDE.md's existing "Favorited foods (spotted-elsewhere alerts)" row —
"Server only if signed in + notifications on" for the signed-in read; the signed-out path is
already covered by the eager-caching brief's own residency note (device-local dedup store, no
server call). This brief only adds a *read* of data both paths already write; it introduces no new
write and no new residency case.
Rationale: **count all of today's matches, not just unread ones — no new "seen/dismiss" state.**
`food_sightings` already has a `read_at` column, used by `web`'s separate notifications-feed page;
this badge intentionally does NOT filter on it or add an equivalent for the local dedup path.
Rejected alternative: gate the badge on `read_at IS NULL` (signed-in) and add a matching "seen"
flag to `food_sighting_dedup` (signed-out) so the badge clears once acknowledged. Rejected because
it's a second, uncoordinated read/dismiss model layered on top of the notification that already
fired for the same event — scoping to "sighted today" already makes the badge self-clearing (it
naturally disappears the next day with no matches), and the local dedup table has no `read_at`
equivalent today, so matching that shape would mean adding a column and a dismiss interaction this
brief's design (a plain count pill, no tap-through spec'd) doesn't call for. **Grab N Go sightings
roll up into their parent hall's card, not a separate row.** `GRAB_N_GO_TIDS` tids
(`shared/src/umassDining.ts`) are distinct from `DINING_HALLS` tids but render as one card (hall
zone + Grab N Go strip); a favorite spotted under a hall's Grab N Go tid must count toward that
same card's badge. `hallNameFor`'s existing tid→slug fallback
(`shared/src/umassDining.ts`, `Object.entries(GRAB_N_GO_TIDS).find(([, tid]) => tid === hallTid)`)
already resolves a Grab N Go tid back to its parent hall slug — reuse that lookup for the rollup
rather than adding a second one.

## Acceptance

- [ ] Signed-in: badge count for a hall equals the number of `food_sightings` rows for that hall's
      tid + its Grab N Go tid, `sighted_date` = today (Eastern), regardless of `read_at` — evidence: test
- [ ] Signed-out: badge count for a hall equals the number of `food_sighting_dedup` rows for that
      hall's tid + its Grab N Go tid, `sighted_date` = today — evidence: test
- [ ] A hall with zero matches today renders no badge element at all (not a hidden/zero pill) —
      evidence: test
- [ ] Retail/café rows (the "Cafés & Markets" section) never render a badge — scope stays exactly
      halls + Grab N Go, matching `eager-caching-and-notifications.md`'s own scope decision —
      evidence: test
- [ ] Badge visually matches `docs/design/Main.dc.html`'s pill (position, bell glyph, count) —
      evidence: screenshot
- [ ] A signed-in user with `notifications_enabled` off (so `food_sightings` never gets written for
      them server-side, per CLAUDE.md's residency row) simply sees no badges — not an error state —
      evidence: test

## Tasks

1. Per-hall spotted-count data source — files: `mobile/src/lib/sightingDedup.ts` (extend: a
   `countsByHallToday(date: string): Promise<Map<number, number>>` grouping the existing
   `food_sighting_dedup` table by `hall_tid` for a given `sighted_date`), new
   `mobile/src/lib/hallSpottedCounts.ts` (checks signed-in state the same way
   `backgroundTask.ts`'s `notifySignedOutFavoriteMatches` already does via
   `supabase.auth.getSession()`; signed-in queries `food_sightings` grouped by `hall_tid` for
   today, signed-out calls task 1's `countsByHallToday`; both roll a Grab N Go tid's count into its
   parent hall's tid via the existing `GRAB_N_GO_TIDS`/`hallNameFor` lookup in
   `shared/src/umassDining.ts`, returning `Map<hallTid, count>` keyed by `DINING_HALLS` tids only)
   — lanes: `cd mobile && npx tsc --noEmit && TZ=America/New_York npx jest && pnpm --filter mobile
   lint` — blocked by: none — PR:
2. Wire the badge into the Home pane — files: `mobile/src/app/index.tsx` (`HomePane`: load task
   1's counts alongside the existing `favoritesStorage.getFavorites()` call in `load()`; `HallCard`:
   new `spottedCount` prop, rendered as the pill per `docs/design/Main.dc.html`'s positioning/
   styling, omitted entirely when `spottedCount` is 0) — lanes: same mobile lane as task 1, plus a
   screenshot per `mobile/scripts/screenshot.sh`'s usual `--record`/route convention — blocked by:
   1 — PR:
