import { DINING_HALLS, type MenuItem } from "@udine/shared";
import { error } from "@sveltejs/kit";
import { todayIso } from "$lib/date";
import type { PageLoad } from "./$types";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const load: PageLoad = async ({ params, url, fetch }) => {
	const hall = DINING_HALLS.find((h) => h.slug === params.slug);
	if (!hall) throw error(404, "unknown dining hall");

	// #72: browse upcoming days via ?date=YYYY-MM-DD. Clamped to today rather than rejected — the
	// API has no history (past dates return `[]`) and the UI's own prev-day control already
	// refuses to go earlier than today, so this just applies the same rule to a hand-typed or
	// stale deep link instead of trusting the query param outright.
	const today = todayIso();
	const dateParam = url.searchParams.get("date");
	const date = dateParam && ISO_DATE.test(dateParam) && dateParam > today ? dateParam : today;

	const res = await fetch(`/api/menu?tid=${hall.tid}&date=${date}`);
	if (!res.ok) throw error(res.status, "failed to load menu");
	const items: MenuItem[] = await res.json();

	return { hall, date, items };
};
