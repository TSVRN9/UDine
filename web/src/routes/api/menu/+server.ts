import { fetchMenu } from "@udine/shared";
import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

// umassdining.com sends no Access-Control-Allow-Origin header, so the browser can't call
// foodpro-menu-ajax directly (confirmed via curl). This route just re-serves the same public,
// non-personal menu data server-side — no Supabase, no storage, per CLAUDE.md data residency.
export const GET: RequestHandler = async ({ url }) => {
	const tid = Number(url.searchParams.get("tid"));
	const dateParam = url.searchParams.get("date");
	if (!tid || !dateParam) throw error(400, "tid and date query params are required");

	// Parse as local date components, not via `new Date(string)` — that parses YYYY-MM-DD as UTC
	// midnight, which lands on the wrong calendar day once formatted back out in a negative-UTC-offset
	// timezone (confirmed: resolves to the previous day under America/New_York).
	const parts = dateParam.match(/^(\d{4})-(\d{2})-(\d{2})$/);
	if (!parts) throw error(400, "invalid date");
	const date = new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]));

	const items = await fetchMenu(tid, date);
	return json(items);
};
