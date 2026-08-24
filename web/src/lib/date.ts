// UMass Dining's calendar day runs on US/Eastern, not this process's TZ. SSR runs on the deployed
// adapter-auto default (UTC), so deriving "today" from local Date getters rendered *tomorrow's*
// menu every night from ~8pm-midnight ET, and 307-redirected a correct `?date=<today ET>` deep link
// to the wrong day via resolveMenuDate's past-date clamp (issue #188). Same Intl-based fix already
// used in supabase/functions/check-favorited-foods/index.ts's easternDateParts() -- copied here
// rather than shared, since that one lives in a Deno edge function this package can't import.
export function todayIso(): string {
	const parts = new Intl.DateTimeFormat("en-US", {
		timeZone: "America/New_York",
		year: "numeric",
		month: "2-digit",
		day: "2-digit"
	}).formatToParts(new Date());
	const get = (type: string) => parts.find((p) => p.type === type)!.value;
	return `${get("year")}-${get("month")}-${get("day")}`;
}

// Adds (or, with a negative `days`, subtracts) whole days to an ISO date string. Built from local
// date components rather than `new Date(iso)` for the same reason the /api/menu proxy avoids
// it — parsing "YYYY-MM-DD" via the Date constructor treats it as UTC midnight, which lands on
// the wrong calendar day once read back out under a negative-UTC-offset timezone. Month/year
// rollover (e.g. Aug 31 + 1) is handled for free by the Date constructor's own normalization.
export function addDaysIso(iso: string, days: number): string {
	const [y, m, d] = iso.split("-").map(Number);
	const next = new Date(y, m - 1, d + days);
	const mm = String(next.getMonth() + 1).padStart(2, "0");
	const dd = String(next.getDate()).padStart(2, "0");
	return `${next.getFullYear()}-${mm}-${dd}`;
}
