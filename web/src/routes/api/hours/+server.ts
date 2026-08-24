import { fetchDiningHours } from "@udine/shared";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

// #178: same proxy shape as api/events, api/press, api/newsletter -- get_infov2, like every other
// umassdining.com endpoint this repo calls, sends no Access-Control-Allow-Origin header, so the
// browser can't call it directly. This is the first web caller of fetchDiningHours (#176's café
// listing/detail data): the four commons' hours aren't rendered anywhere in web yet, only the
// cafés/retail half of the feed is consumed client-side today, but this route returns the whole
// feed (same shape fetchDiningHours already produces) rather than a retail-only slice, so a future
// hall-hours feature doesn't need a second endpoint for the same upstream call.
export const GET: RequestHandler = async () => {
	return json(await fetchDiningHours());
};
