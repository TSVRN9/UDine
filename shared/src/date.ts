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
