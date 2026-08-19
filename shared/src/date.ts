const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

// Clamps a `?date=` query param to a safe menu date: absent/empty/garbage/impossible/past all fall
// back to `todayIso`; a valid future ISO date passes through unchanged.
//
// Two things the naive `dateParam ?? todayIso` replacement (see PR #76 review) misses:
//   1. It doesn't validate shape/range at all -- any truthy string passes through.
//   2. Even a shape-validated version doing a plain `dateParam > todayIso` lexicographic compare is
//      unsound for out-of-range components: "2026-13-99" and "9999-99-99" both match a bare
//      `^\d{4}-\d{2}-\d{2}$` and sort after any real today, so they'd pass through and render as
//      "Invalid Date" downstream.
//
// Rejecting impossible dates is a build-and-read-back round trip: construct a Date from the local
// components (not `new Date(string)`, which parses "YYYY-MM-DD" as UTC and can land on the wrong
// calendar day under a negative-UTC-offset timezone -- see the same trap called out in
// web/src/routes/api/menu/+server.ts) and check it reproduces the same year/month/day. An
// out-of-range component (month 13, day 99, ...) rolls the Date forward instead of erroring, so it
// won't read back the same components -- that mismatch is the rejection signal.
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
