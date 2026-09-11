export function todayIso(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

// nowLocalIso lives in @udine/shared, next to isoDateOf, so both platforms consume the same
// implementation instead of maintaining a forked copy. Re-exported here so existing callers
// (halls/[slug].tsx, grab-n-go/[slug].tsx) and mobile/src/lib/date.test.ts don't need to change
// their import path.
export { nowLocalIso } from "@udine/shared";
