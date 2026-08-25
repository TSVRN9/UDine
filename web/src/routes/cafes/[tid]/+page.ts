import type { DiningHoursFeed, MenuItem, RetailLocationHours } from "@udine/shared";
import { error } from "@sveltejs/kit";
import { todayIso } from "$lib/date";
import type { PageLoad } from "./$types";

// #178: runtime model per #177's owner correction (binding on this ticket too) -- two states only,
// decided by probing fetchMenu(locationId, today) fresh on every tap, never precomputed:
//   1. Non-empty -> the normal menu screen (nutrition + price, loggable) -- the ONLY state that ever
//      presents a daily menu.
//   2. Empty -> the fallback sheet, with the café's *_menu HTML (if any) labeled as the STANDING
//      menu, never presented as today's. There is no third "menu but no nutrition" tier.
// Always "today" -- no ?date= browsing for cafés, unlike halls/[slug] (not part of the decided
// model; #177/#178 both specify fetchMenu(locationId, today) only).
export const load: PageLoad = async ({ params, fetch }) => {
	const tid = Number(params.tid);
	if (!Number.isInteger(tid) || tid <= 0) throw error(404, "unknown café");

	const hoursRes = await fetch("/api/hours");
	if (!hoursRes.ok) throw error(hoursRes.status, "failed to load café info");
	const feed: DiningHoursFeed = await hoursRes.json();
	const cafe: RetailLocationHours | undefined = feed.retail.find((r) => r.locationId === tid);
	if (!cafe) throw error(404, "unknown café");

	const date = todayIso();
	const menuRes = await fetch(`/api/menu?tid=${tid}&date=${date}`);
	// Same 400-tolerant handling as halls/[slug]/+page.ts -- tid is a real, feed-confirmed
	// locationId and date is today (always inside /api/menu's -7/+14 window), so a 400 here can only
	// mean "nothing posted", not a real error. Treated as empty, same as upstream's own `[]` -- both
	// route to the fallback sheet.
	let items: MenuItem[] = [];
	if (menuRes.status !== 400) {
		if (!menuRes.ok) throw error(menuRes.status, "failed to load menu");
		items = await menuRes.json();
	}

	return { cafe, date, items };
};
