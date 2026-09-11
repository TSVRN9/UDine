import { DINING_HALLS, GRAB_N_GO_TIDS, fetchDiningHours, fetchMenu } from "@udine/shared";
import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

// umassdining.com's foodpro-menu-ajax returns HTTP 200 with `[]` for an unknown tid rather than an
// error, so a bare truthiness check would let any tid through this public proxy -- each one a
// pointless upstream hit and an unbounded junk cache key. Restrict to the known-good tids
// shared/src/umassDining.ts exports, rather than trusting the query param.
const VALID_TIDS = new Set<number>([...DINING_HALLS.map((h) => h.tid), ...Object.values(GRAB_N_GO_TIDS)]);

// Cafés/retail locations have no static tid list like DINING_HALLS/GRAB_N_GO_TIDS -- which ones
// exist is whatever get_infov2 (fetchDiningHours) reports today, so a hardcoded list would drift
// out of sync. Fetch and cache the id set instead of re-hitting get_infov2 on every /api/menu call.
// A bare timestamp check is enough here (one key, this module only) -- no need for fetchMenu's
// cache's fuller TTL/in-flight-dedup machinery.
let retailTidCache: { ids: Set<number>; expiresAt: number } | null = null;
const RETAIL_TID_CACHE_TTL_MS = 10 * 60 * 1000;

async function isValidRetailTid(tid: number): Promise<boolean> {
	const now = Date.now();
	if (!retailTidCache || retailTidCache.expiresAt <= now) {
		// A get_infov2 outage must degrade to "no retail tids known right now" (same as a genuinely
		// empty retail list), not an unguarded throw turning into a proxy-wide 500 instead of a 400.
		try {
			const { retail } = await fetchDiningHours();
			const ids = new Set(retail.map((r) => r.locationId).filter((id): id is number => typeof id === "number"));
			retailTidCache = { ids, expiresAt: now + RETAIL_TID_CACHE_TTL_MS };
		} catch {
			return false;
		}
	}
	return retailTidCache.ids.has(tid);
}

// umassdining.com sends no Access-Control-Allow-Origin header, so the browser can't call
// foodpro-menu-ajax directly (confirmed via curl). This route just re-serves the same public,
// non-personal menu data server-side — no Supabase, no storage, per CLAUDE.md data residency.
export const GET: RequestHandler = async ({ url }) => {
	const tid = Number(url.searchParams.get("tid"));
	const dateParam = url.searchParams.get("date");
	if (!tid || !dateParam) throw error(400, "tid and date query params are required");
	if (!VALID_TIDS.has(tid) && !(await isValidRetailTid(tid))) throw error(400, "unknown tid");

	// Parse as local date components, not via `new Date(string)` — that parses YYYY-MM-DD as UTC
	// midnight, which lands on the wrong calendar day once formatted back out in a negative-UTC-offset
	// timezone (confirmed: resolves to the previous day under America/New_York).
	const parts = dateParam.match(/^(\d{4})-(\d{2})-(\d{2})$/);
	if (!parts) throw error(400, "invalid date");
	const year = Number(parts[1]);
	const month = Number(parts[2]);
	const day = Number(parts[3]);
	const date = new Date(year, month - 1, day);
	// The regex above only checks shape -- "2026-99-99" matches it too, and rolls forward into a
	// valid-looking but wrong Date instead of erroring, which is the same junk-cache-key class #171
	// is about. Round-trip the components back out (same technique as shared/src/date.ts's
	// resolveMenuDate) and reject if they don't match, instead of that helper's clamp-to-today —
	// this proxy should reject an invalid date outright, not silently rewrite it.
	if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
		throw error(400, "invalid date");
	}

	// #173: a shape- and calendar-valid date was still unbounded -- ?date=9999-12-31 or 1900-01-01
	// both proxied through and minted a never-evicted #170 cache key. Menus aren't posted more than
	// ~2 weeks out; clamp to a generous window around server-local "today" and reject outside it,
	// same as the other checks above. Plain server-time Date arithmetic -- the window is wide enough
	// that timezone drift can't reject a real caller, so no timezone plumbing needed.
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const minDate = new Date(today);
	minDate.setDate(minDate.getDate() - 7);
	const maxDate = new Date(today);
	maxDate.setDate(maxDate.getDate() + 14);
	if (date < minDate || date > maxDate) throw error(400, "date out of range");

	const items = await fetchMenu(tid, date);
	return json(items);
};
