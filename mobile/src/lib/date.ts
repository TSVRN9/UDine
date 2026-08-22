export function todayIso(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

// nowLocalIso used to be defined here (issue #111/PR #122). Issue #124 (web had the identical UTC
// `loggedAt` bug) moved it into @udine/shared, next to isoDateOf, so both platforms consume the
// same implementation instead of maintaining a forked copy -- see shared/src/date.ts for the full
// doc comment and shared/src/date.test.ts for its boundary/seam coverage. Re-exported here so
// existing callers (halls/[slug].tsx) and mobile/src/lib/date.test.ts don't need to change their
// import path.
export { nowLocalIso } from "@udine/shared";
