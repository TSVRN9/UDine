import { DEFAULT_ROLLOVER_HOUR, effectiveTodayIso } from "@udine/shared";

// Routed through @udine/shared's effectiveTodayIso (not a bare `new Date()`) so Late Night's
// day boundary is ~2 AM, not midnight -- a snack logged or a menu viewed at 12:30 AM still buckets
// under the day that's ending. Every caller (YouPane's today-filter, sqliteStorage's
// getEntriesForDate, halls/[slug].tsx, menuPrefetch.ts) inherits this for free.
export function todayIso(): string {
  return effectiveTodayIso(new Date(), DEFAULT_ROLLOVER_HOUR);
}

// Same effective day as todayIso(), as a Date instead of an ISO string -- for callers (halls/
// [slug].tsx's selectedDate default/isSelectedDateToday check) that need Date methods like
// toDateString() or hallMenuTabs.ts's stepDate() rather than a string.
export function effectiveToday(now: Date = new Date()): Date {
  const iso = effectiveTodayIso(now, DEFAULT_ROLLOVER_HOUR);
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

// Same technique as supabase/functions/check-favorited-foods/index.ts's easternDateParts()/
// todayIsoDate() -- Intl.DateTimeFormat with an explicit timeZone resolves independently of the
// device's own TZ, unlike todayIso()'s Date getters. Needed wherever a client reads a row the
// server stamped with its own Eastern `sighted_date` (hallSpottedCounts.ts's signed-in path): a
// device outside America/New_York would otherwise bucket "today" onto the wrong calendar day near
// midnight Eastern relative to what the server actually wrote.
export function easternTodayIso(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

// nowLocalIso lives in @udine/shared, next to isoDateOf, so both platforms consume the same
// implementation instead of maintaining a forked copy. Re-exported here so existing callers
// (halls/[slug].tsx, grab-n-go/[slug].tsx) and mobile/src/lib/date.test.ts don't need to change
// their import path.
export { nowLocalIso } from "@udine/shared";
