import { fetchDiningHours, type DiningHoursFeed } from "@udine/shared";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

// #178 pr-review: this proxies a ~141KB upstream get_infov2 fetch, and (post-#178) gets hit on
// every home-dashboard load (café listing) plus every /cafes/[tid] visit (café detail) -- unlike
// api/events/api/press/api/newsletter, which only load on their own low-traffic content pages. Same
// bare-timestamp in-memory cache shape as /api/menu's own retailTidCache (#178) -- single key, this
// module only, doesn't need #170's fetchMenu cache's full per-key/in-flight-dedup generality.
let hoursCache: { feed: DiningHoursFeed; expiresAt: number } | null = null;
const HOURS_CACHE_TTL_MS = 10 * 60 * 1000;

// #178: same proxy shape as api/events, api/press, api/newsletter -- get_infov2, like every other
// umassdining.com endpoint this repo calls, sends no Access-Control-Allow-Origin header, so the
// browser can't call it directly. This is the first web caller of fetchDiningHours (#176's café
// listing/detail data): the four commons' hours aren't rendered anywhere in web yet, only the
// cafés/retail half of the feed is consumed client-side today, but this route returns the whole
// feed (same shape fetchDiningHours already produces) rather than a retail-only slice, so a future
// hall-hours feature doesn't need a second endpoint for the same upstream call.
export const GET: RequestHandler = async () => {
	const now = Date.now();
	if (!hoursCache || hoursCache.expiresAt <= now) {
		hoursCache = { feed: await fetchDiningHours(), expiresAt: now + HOURS_CACHE_TTL_MS };
	}
	return json(hoursCache.feed);
};
