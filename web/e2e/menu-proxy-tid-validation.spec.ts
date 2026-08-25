import { test, expect } from "@playwright/test";

// #173: a literal past date (the original #171 tests used 2026-08-18) ages out of the new -7/+14
// day window and starts 400ing on its own, with no code change -- see the module-level date
// arithmetic below. Every date used in this file is derived from "now" instead.
function isoDate(d: Date): string {
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
const TODAY = isoDate(new Date());

// #171: /api/menu only truthiness-checked `tid` before proxying to umassdining.com's
// foodpro-menu-ajax, which returns HTTP 200 with `[]` for a garbage tid instead of an error. An
// unauthenticated caller could sweep arbitrary tids through our public proxy, each one a pointless
// upstream Drupal hit (and, once #170's fetchMenu cache lands, an unbounded junk cache key).
//
// Uses Playwright's `request` fixture, not `page.route()` — halls-menu.spec.ts and friends mock
// /api/menu at the browser layer, which never exercises the +server.ts handler itself. This hits
// the real dev server (see playwright.config.ts's webServer) directly, so it's the actual route
// under test, not a page that happens to call it.
//
// The valid-tid and grab-n-go assertions below make one real request each to umassdining.com (no
// mock, by design — the whole point is to check what the real proxy does with a real upstream).
// If umassdining.com is unreachable, those two fail on a network/timeout error, not a wrong status;
// retries are 0 repo-wide (see playwright.config.ts) so a real outage will show up as a red run
// rather than silently passing on retry.

test("GET /api/menu rejects an unknown tid with 400 instead of proxying it upstream", async ({ request }) => {
	const res = await request.get(`/api/menu?tid=99999&date=${TODAY}`);
	expect(res.status()).toBe(400);
});

test("GET /api/menu accepts a known dining-hall tid", async ({ request }) => {
	const res = await request.get(`/api/menu?tid=1&date=${TODAY}`); // Worcester, DINING_HALLS
	// #173: not .toBe(200) -- this hits the real umassdining.com upstream (see file header), so
	// hardcoding a 200 makes the assertion depend on that endpoint being up. The only thing this
	// test needs to prove is that a known tid isn't rejected by our own validation.
	expect(res.status()).not.toBe(400);
});

test("GET /api/menu accepts a known grab-n-go tid", async ({ request }) => {
	const res = await request.get(`/api/menu?tid=10715&date=${TODAY}`); // Hampshire Grab 'N Go, GRAB_N_GO_TIDS
	expect(res.status()).not.toBe(400);
});

// #178: café-tap parity taught /api/menu to also accept a live retail location's tid, learned from
// get_infov2 (fetchDiningHours, #176's shared export) rather than a second hardcoded list. No mock
// here either, by the same file-header rationale — this proves the real proxy accepts a real,
// currently-live café tid, not a stubbed one. People's Organic Coffee, location_id=32, confirmed
// live 2026-08-24 (see shared/src/hours.test.ts's REAL_PEOPLES_ORGANIC capture).
test("GET /api/menu accepts a real, live retail (café) tid learned from get_infov2, not just DINING_HALLS/GRAB_N_GO_TIDS", async ({
	request,
}) => {
	const res = await request.get(`/api/menu?tid=32&date=${TODAY}`);
	expect(res.status()).not.toBe(400);
});

test("GET /api/menu rejects a malformed date even with a valid tid", async ({ request }) => {
	const res = await request.get("/api/menu?tid=1&date=2026-99-99"); // shape matches, calendar doesn't
	expect(res.status()).toBe(400);
});

// #173: dates were shape- and calendar-validated (above) but otherwise unbounded --
// ?date=9999-12-31 or 1900-01-01 both proxied straight through, each minting a never-evicted
// #170 cache key. Menus aren't posted more than ~2 weeks out, so the handler now clamps to a
// window around server-local "today" (-7 to +14 days) and 400s outside it. "Today accepted" is
// already covered above (both accept-path tests use TODAY), so it isn't repeated as its own case.

test("GET /api/menu rejects a far-future date", async ({ request }) => {
	const res = await request.get("/api/menu?tid=1&date=9999-12-31");
	expect(res.status()).toBe(400);
});

test("GET /api/menu rejects a far-past date", async ({ request }) => {
	const res = await request.get("/api/menu?tid=1&date=1900-01-01");
	expect(res.status()).toBe(400);
});
