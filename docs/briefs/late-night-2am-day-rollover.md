# Move the day-rollover boundary from midnight to ~2 AM

Goal: the app currently treats the stroke of midnight as a hard boundary between "today" and
"tomorrow" everywhere — the dining-hall menu shown, which meal tab is live, and which day a logged
snack's macros count toward. In reality, Late Night service keeps running past midnight, so a menu
check or a snack logged at 1 AM should still land on the day that's ending, not a new day that's
barely begun. Move that boundary to a configurable, single "rollover hour" defaulting to 2:00 AM.

## Spec

UI: no new artboard. This changes which calendar date's data existing screens show/log against —
`docs/design/HallMenu.dc.html`, `docs/design/Logs.dc.html`, and Home's hall cards
(`docs/design/Main.dc.html`) are all affected in *content* (what day is "today") but not in layout.
Annotations: none.
States:
- Before the rollover hour (e.g. 12:30 AM), on a real hall's menu — should show the day that's
  ending (yesterday's date, Late Night station), not a brand-new day's Breakfast.
- Before the rollover hour, logging a snack — should file under the day that's ending's totals/log
  card, not create a new "today" with one entry.
- Before the rollover hour, Home's "is X hall open right now" / hero computation — Late Night's
  fallback clock window (used only when a hall doesn't publish real per-meal hours) must actually
  extend to the new close time, or the live "currently serving" check will itself say closed at
  12:30 AM even though the displayed day/menu now correctly still says Late Night.
- After the rollover hour but before Breakfast opens (e.g. 3 AM) — this is a pre-existing, already-
  correct "nothing is open right now" state; moving the day boundary doesn't change whether
  anything is open, only which calendar date is considered "today" for display/logging purposes.
- Exactly at the rollover hour — the boundary itself; needs a test pinning the transition instant.
Routes: `halls/hampshire` viewed with the device clock (or an injected `now`) at 12:30 AM and at
2:30 AM — screenshot evidence for "still shows the closing day" and "now shows the new day" is more
convincing than a single static state, since this is fundamentally a clock-dependent behavior.

Backend: none — this only changes client-side date derivation. The UMass menu endpoint itself
(`umassdining.com/foodpro-menu-ajax?...&date=MM%2FDD%2FYYYY`) already accepts any date; nothing
server-side needs to change, this is entirely about which date the client asks for and logs
against.
Residency: none — the consumption log stays device-only (SQLite mobile), this only changes which
day's row a locally-stored entry is filed under; no new client→Supabase call, no new table.
Rationale: Confirmed by reading the code that no "effective day" concept exists anywhere today —
three independent call sites each derive "today" from a bare `new Date()` at local midnight, and
none of them shares a helper:
1. **Menu fetch/display** — `mobile/src/app/halls/[slug].tsx`'s `selectedDate` default (line 707)
   and its `isSelectedDateToday` check (line 1236, `selectedDate.toDateString() === now.toDateString()`),
   plus `mobile/src/lib/menuPrefetch.ts`'s prefetch default. These decide which date's menu gets
   requested/cached/shown.
2. **Log/macro day-bucketing** — `mobile/src/lib/date.ts`'s `todayIso()` (lines 1-6), consumed by
   `mobile/src/panes/YouPane.tsx:152-153`'s today-filter, `mobile/src/lib/sqliteStorage.ts:41-45`'s
   `getEntriesForDate` LIKE-prefix query, and `mobile/src/lib/logsFormat.ts`'s week-strip/streak/
   chart builders (all of which take a `todayIso` string from their caller and would inherit
   whatever it becomes). Entries are timestamped via `@udine/shared`'s `nowLocalIso()` at the exact
   moment they're logged, using local wall-clock time — a 12:30 AM snack is already stamped
   "tomorrow" under today's rules and needs the same rollover applied when it's later bucketed by
   day, not at log time.
3. **Live meal-period fallback clock** — `shared/src/hours.ts`'s `STANDARD_MEAL_WINDOWS.latenight`
   (line 227) is hardcoded `{ openTime: "9:00 PM", closeTime: "12:00 AM" }`. This is only the
   *fallback* schedule used when a hall's real published hours don't cover Late Night at all (which
   is always, per the research — `get_infov2` never populates a `latenight` window); in practice
   it's the only clock Late Night's live "is it open right now" check has. `resolveWindow()`
   (`hours.ts:183-210`) already has general cross-midnight window math (it already handles e.g.
   11 PM–1 AM windows) — extending `closeTime` to `"2:00 AM"` needs no new structural logic there.

Since none of the three shares a primitive today, the natural fix is one new shared helper —
`effectiveTodayIso(now, rolloverHour)` in `shared/src/date.ts`, next to the existing `nowLocalIso`
— that returns yesterday's date if `now`'s local hour is before `rolloverHour`, else today's. Route
`mobile/src/lib/date.ts`'s `todayIso()`, `[slug].tsx`'s `selectedDate` default and
`isSelectedDateToday` check, and `menuPrefetch.ts`'s default through it, all reading the same
single named constant for the rollover hour (defaulting to 2, per the owner's "somewhere around
2 AM" — a single easily-tunable constant rather than a hardcoded literal in three places, in case
2 AM turns out to need adjusting once this ships). `easternTodayIso()` (used only by the signed-in
favorited-food-spotted path, which buckets by a *server*-stamped Eastern date) is deliberately
**out of scope** — that path's "today" must keep matching whatever the server wrote, and the
server side of that feature is untouched by this brief; rolling it over too is a separate decision
with its own residency/backend implications, not assumed here.

## Acceptance

- [ ] A menu check at 12:30 AM (device local time) still shows the day that's ending — same date
      as 11:30 PM the night before, Late Night station still listed — evidence: test
      (`mobile/src/lib/date.test.ts` or a new `effectiveTodayIso` test) + screenshot at an injected
      clock time
- [ ] A menu check at 2:30 AM shows the new day (Breakfast, once it opens) — evidence: test
- [ ] A snack logged at 12:30 AM files under the day that's ending's log card and daily totals, not
      a new day — evidence: test
- [ ] Home's "is Late Night currently being served" check (the `STANDARD_MEAL_WINDOWS` fallback
      path) says open at 12:30 AM and closed at 2:30 AM (absent real published hours) — evidence:
      test (`shared/src/hours.test.ts` or equivalent)
- [ ] The rollover hour is a single named constant, not a literal repeated in multiple files —
      evidence: code review (grep for the constant's usages)
- [ ] The signed-in "favorited food spotted" Eastern-date path (`easternTodayIso()`,
      `hallSpottedCounts.ts`) is unchanged and its existing tests still pass — evidence: test

## Tasks

1. Add `effectiveTodayIso(now: Date, rolloverHour: number): string` to `shared/src/date.ts` next
   to `nowLocalIso`, with a named default-rollover-hour constant (2). Full red-green coverage of
   the boundary itself (23:59 vs 00:01 vs 01:59 vs 02:01 local time, plus a DST-transition day
   since `nowLocalIso`'s neighboring tests already cover that class of edge case). — files:
   `shared/src/date.ts`, `shared/src/date.test.ts` — lanes: `pnpm --filter @udine/shared test && pnpm --filter @udine/shared typecheck`
   — blocked by: none — PR:
2. Route `mobile/src/lib/date.ts`'s `todayIso()` through `effectiveTodayIso`, and update
   `mobile/src/app/halls/[slug].tsx`'s `selectedDate` default and `isSelectedDateToday` check
   (line 1236) plus `mobile/src/lib/menuPrefetch.ts`'s default to use it instead of a bare
   `new Date()`. Update/add tests proving a 12:30 AM menu view still resolves to the prior day, and
   that stepping the date picker still behaves correctly relative to the new "today". — files:
   `mobile/src/lib/date.ts`, `mobile/src/lib/date.test.ts`, `mobile/src/app/halls/[slug].tsx`,
   `mobile/src/lib/hallMenu.test.tsx`, `mobile/src/lib/menuPrefetch.ts`, `mobile/src/lib/menuPrefetch.test.ts`
   — lanes: `cd mobile && npx tsc --noEmit && TZ=America/New_York npx jest && pnpm lint` — blocked
   by: 1 — PR:
3. Update `shared/src/hours.ts`'s `STANDARD_MEAL_WINDOWS.latenight.closeTime` from `"12:00 AM"` to
   `"2:00 AM"` (or read the same named rollover-hour constant from task 1, if it's convenient to
   share), with a test proving `resolveWindow`'s existing cross-midnight logic now correctly
   reports Late Night open at 12:30 AM local and closed at 2:30 AM, for a hall with no real
   published Late Night hours. — files: `shared/src/hours.ts`, `shared/src/hours.test.ts` — lanes:
   `pnpm --filter @udine/shared test && pnpm --filter @udine/shared typecheck` — blocked by: 1 —
   PR:
4. **Scope correction from task 2's findings (not just a verify pass — a real fix is needed here):**
   `mobile/src/lib/sqliteStorage.ts`'s `getEntriesForDate` (`LIKE '<isoDate>%'`) and
   `mobile/src/panes/YouPane.tsx`'s today-filter (`isoDateOf(e.loggedAt) === todayIso()`) both
   bucket a logged entry by the *raw* calendar-day prefix of its `nowLocalIso()` timestamp,
   compared against the now-rollover-aware `todayIso()`. Entries must keep stamping raw wall-clock
   time (`nowLocalIso()` itself is correct and out of scope) — but a snack logged at 12:30 AM is
   stamped on the new raw calendar day while `todayIso()` at that instant still returns the prior
   day, so a straight string-prefix/equality match against `todayIso()` makes that entry invisible
   from "today" until the clock actually crosses the rollover hour. Fix the bucketing (likely:
   filter/query by `effectiveTodayIso` in a way that maps a raw timestamp to its own effective day,
   not by comparing the *timestamp's* raw prefix against `todayIso()`'s *current* value — those are
   two different notions of "day" for the same instant), then verify end-to-end that
   `YouPane.tsx`'s today-filter and `logsFormat.ts`'s streak/week/chart builders all agree with the
   corrected bucketing at 12:30 AM. — files: `mobile/src/lib/sqliteStorage.ts`,
   `mobile/src/lib/sqliteStorage.test.ts`, `mobile/src/panes/YouPane.tsx`,
   `mobile/src/panes/YouPane.test.tsx`, `mobile/src/lib/logsFormat.ts` (if it independently
   re-derives "today" anywhere rather than taking it as a parameter — check),
   `mobile/src/lib/logsFormat.test.ts` — lanes: `cd mobile && npx tsc --noEmit && TZ=America/New_York npx jest && pnpm lint`
   — blocked by: 2 — PR:
