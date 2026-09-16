const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

// Clamps a `?date=` query param to a safe menu date: absent/empty/garbage/impossible/past all fall
// back to `todayIso`; a valid future ISO date passes through unchanged.
//
// A naive `dateParam ?? todayIso` replacement misses two things:
//   1. It doesn't validate shape/range at all -- any truthy string passes through.
//   2. Even a shape-validated version doing a plain `dateParam > todayIso` lexicographic compare is
//      unsound for out-of-range components: "2026-13-99" and "9999-99-99" both match a bare
//      `^\d{4}-\d{2}-\d{2}$` and sort after any real today, so they'd pass through and render as
//      "Invalid Date" downstream.
//
// Rejecting impossible dates is a build-and-read-back round trip: construct a Date from the local
// components (not `new Date(string)`, which parses "YYYY-MM-DD" as UTC and can land on the wrong
// calendar day under a negative-UTC-offset timezone) and check it reproduces the same year/month/
// day. An out-of-range component (month 13, day 99, ...) rolls the Date forward instead of
// erroring, so it won't read back the same components -- that mismatch is the rejection signal.
export function resolveMenuDate(dateParam: string | null | undefined, todayIso: string): string {
  if (!dateParam) return todayIso;

  const match = ISO_DATE.exec(dateParam);
  if (!match) return todayIso;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const built = new Date(year, month - 1, day);
  const roundTrips = built.getFullYear() === year && built.getMonth() === month - 1 && built.getDate() === day;
  if (!roundTrips) return todayIso;

  // Both sides are now confirmed valid, zero-padded YYYY-MM-DD strings, so a lexicographic compare
  // is chronologically sound here (it wasn't above, before validation).
  if (dateParam <= todayIso) return todayIso;

  return dateParam;
}

// Stamps a moment as a local-date-prefixed ISO-ish string (no trailing "Z"/offset), e.g.
// "2026-08-20T23:15:42.123" -- built from local Date components (getFullYear/getMonth/getDate/
// getHours/...), not `.toISOString()`, which is UTC. Every reader that buckets a LogEntry's
// `loggedAt` by calendar day (via `isoDateOf`, shared/src/macros.ts) assumes the stored string's
// date prefix already IS the local day -- stamping with `.toISOString()` instead makes evening
// entries (local time still today, UTC already tomorrow) file under tomorrow and silently vanish
// from Today. One helper, shared by both platforms instead of forked per-platform copies, so they
// can't drift apart on this again.
//
// A bare (no "Z"/offset) ISO-shaped string is parsed back as local time by `new Date(str)` per the
// ECMA-262 Date Time String spec, so downstream `new Date(loggedAt).getHours()` (mobile's
// youPaneFormat.ts's mealPeriodForTime, logsFormat.ts's formatLogTime) and lexicographic sort/SQL
// ORDER BY all keep working unchanged.
export function nowLocalIso(d: Date = new Date()): string {
  const pad = (n: number, width = 2) => String(n).padStart(width, "0");
  const datePart = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const timePart = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
  return `${datePart}T${timePart}`;
}

// Late Night service runs past midnight, so "today" for menu display/log-bucketing purposes
// shouldn't flip at the stroke of midnight -- it should keep meaning the day that's ending until
// service has actually wound down. One named constant instead of a literal `2` repeated at each
// call site (mobile/src/lib/date.ts's todayIso(), halls/[slug].tsx's selectedDate default,
// menuPrefetch.ts's default, shared/src/hours.ts's latenight fallback window) so moving the
// boundary later is a one-line change, not a grep-and-replace.
export const DEFAULT_ROLLOVER_HOUR = 2;

// Returns the ISO date (YYYY-MM-DD, local calendar) that `now` counts as "today" once the day
// boundary is pushed from midnight to `rolloverHour`: before `rolloverHour` local time, `now`
// still belongs to the day that's ending (yesterday), matching how Late Night service, and any
// snack logged during it, actually behaves.
//
// `Date.setDate(d - 1)` (not manual month/year-rollover math) is what makes this correct across a
// month/year boundary AND across a DST transition for free -- the Date object normalizes via the
// host's timezone database, it isn't naive 24-hour-offset arithmetic.
export function effectiveTodayIso(now: Date, rolloverHour: number): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const effective = new Date(now);
  if (now.getHours() < rolloverHour) {
    effective.setDate(effective.getDate() - 1);
  }
  return `${effective.getFullYear()}-${pad(effective.getMonth() + 1)}-${pad(effective.getDate())}`;
}

// The read-side counterpart to effectiveTodayIso: which effective day a RAW-stamped timestamp
// (nowLocalIso's output) belongs to. A logged entry's raw calendar-day prefix and todayIso()'s
// *current* value are two different notions of "day" for the same instant -- a snack stamped
// 00:30 already has a raw prefix of the new calendar day, while todayIso() at that same moment
// still returns the day that's ending. Comparing those two directly (the bug this fixes) makes
// the entry invisible from "today" until the clock crosses rolloverHour. The fix is to apply the
// same rollover rule to the timestamp itself, not to compare it against "now"'s rollover result --
// `new Date(isoTimestamp)` parses a bare (no "Z"/offset) string as local time per ECMA-262 (same
// convention nowLocalIso's own doc comment relies on), so this is just effectiveTodayIso fed the
// entry's own moment instead of the current instant.
export function effectiveDayOf(isoTimestamp: string, rolloverHour: number): string {
  return effectiveTodayIso(new Date(isoTimestamp), rolloverHour);
}
