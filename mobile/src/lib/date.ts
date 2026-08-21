export function todayIso(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

// Stamps a moment as a local-date-prefixed ISO-ish string (no trailing "Z"/offset), e.g.
// "2026-08-20T23:15:42.123" -- built from local Date components (getFullYear/getMonth/getDate/
// getHours/...), not `.toISOString()`, which is UTC. Every reader that buckets LogEntry.loggedAt by
// calendar day (SqliteLogStorage's `WHERE logged_at LIKE '<date>%'`, YouPane's `isoDateOf(loggedAt)
// === todayIso()`) assumes the stored string's date prefix already IS the local day -- issue #111:
// stamping with `.toISOString()` instead made evening entries (local time still today, UTC already
// tomorrow) file under tomorrow and vanish from Today. This is the single place that stamps a log
// entry's `loggedAt`; local-day bucketing (#118/#119 included) should read the prefix via
// `isoDateOf` (`@udine/shared`, shared/src/macros.ts) rather than re-deriving it.
//
// A bare (no "Z"/offset) ISO-shaped string is parsed back as local time by `new Date(str)` per the
// ECMA-262 Date Time String spec, so downstream `new Date(loggedAt).getHours()` (youPaneFormat.ts's
// mealPeriodForTime) and lexicographic sort/SQL ORDER BY both keep working unchanged.
export function nowLocalIso(d: Date = new Date()): string {
  const pad = (n: number, width = 2) => String(n).padStart(width, "0");
  const datePart = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const timePart = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
  return `${datePart}T${timePart}`;
}
