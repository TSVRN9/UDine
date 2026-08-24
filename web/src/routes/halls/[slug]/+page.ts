import { DINING_HALLS, resolveMenuDate, type MenuItem } from "@udine/shared";
import { error, redirect } from "@sveltejs/kit";
import { todayIso } from "$lib/date";
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ params, url, fetch }) => {
	const hall = DINING_HALLS.find((h) => h.slug === params.slug);
	if (!hall) throw error(404, "unknown dining hall");

	// #72: browse upcoming days via ?date=YYYY-MM-DD. Clamped to today rather than rejected — the
	// API has no history (past dates return `[]`) and the UI's own prev-day control already
	// refuses to go earlier than today, so this just applies the same rule to a hand-typed or
	// stale deep link instead of trusting the query param outright. Validation (shape, range,
	// past-date clamp) lives in @udine/shared's resolveMenuDate so it's actually unit-tested — see
	// shared/src/date.test.ts.
	const today = todayIso();
	const dateParam = url.searchParams.get("date");
	const date = resolveMenuDate(dateParam, today);

	// A clamped date means the URL explicitly asked for something we didn't honor (garbage, an
	// impossible date, or a past date) — rewrite the URL so it doesn't keep lying about what's
	// being shown. Only when a `?date=` was actually given: a bare `/halls/hampshire` with no
	// param at all isn't lying about anything, so it's left alone rather than growing a
	// `?date=<today>` on every plain visit. 3xx here is a redirect during `load`, not a client
	// nav, so no history entry is added for the bad URL.
	if (dateParam && dateParam !== date) {
		const target = new URL(url);
		target.searchParams.set("date", date);
		throw redirect(307, `${target.pathname}${target.search}`);
	}

	const res = await fetch(`/api/menu?tid=${hall.tid}&date=${date}`);
	// #173/#174: /api/menu now 400s a date outside its -7/+14 day window. tid always comes from
	// DINING_HALLS above and date is already shape/calendar-validated by resolveMenuDate, so an
	// out-of-window date is the only reachable 400 here -- treat it the same as the upstream's own
	// "nothing posted" `[]`, not as a real error. Otherwise a hand-typed/bookmarked/shared
	// far-future URL (which bypasses the Next-day stepper entirely) would error-page instead of
	// showing the existing "Menu not posted yet" empty state.
	if (res.status === 400) return { hall, date, items: [] as MenuItem[] };
	if (!res.ok) throw error(res.status, "failed to load menu");
	const items: MenuItem[] = await res.json();

	return { hall, date, items };
};
