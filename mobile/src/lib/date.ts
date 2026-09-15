export function todayIso(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
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
