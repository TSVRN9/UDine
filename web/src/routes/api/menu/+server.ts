import { DINING_HALLS, GRAB_N_GO_TIDS, fetchMenu } from "@udine/shared";
import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

// #171: umassdining.com's foodpro-menu-ajax returns HTTP 200 with `[]` for an unknown tid rather
// than an error, so a bare truthiness check let any tid through this public proxy — each one a
// pointless upstream Drupal hit, and (once #170's fetchMenu cache lands) an unbounded junk cache
// key. Restrict to the known-good tids shared/src/umassDining.ts already exports for exactly this
// purpose, rather than trusting the query param.
const VALID_TIDS = new Set<number>([...DINING_HALLS.map((h) => h.tid), ...Object.values(GRAB_N_GO_TIDS)]);

// umassdining.com sends no Access-Control-Allow-Origin header, so the browser can't call
// foodpro-menu-ajax directly (confirmed via curl). This route just re-serves the same public,
// non-personal menu data server-side — no Supabase, no storage, per CLAUDE.md data residency.
export const GET: RequestHandler = async ({ url }) => {
	const tid = Number(url.searchParams.get("tid"));
	const dateParam = url.searchParams.get("date");
	if (!tid || !dateParam) throw error(400, "tid and date query params are required");
	if (!VALID_TIDS.has(tid)) throw error(400, "unknown tid");

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

	const items = await fetchMenu(tid, date);
	return json(items);
};
