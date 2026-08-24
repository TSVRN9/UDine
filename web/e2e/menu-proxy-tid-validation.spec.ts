import { test, expect } from "@playwright/test";

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
	const res = await request.get("/api/menu?tid=99999&date=2026-08-18");
	expect(res.status()).toBe(400);
});

test("GET /api/menu accepts a known dining-hall tid", async ({ request }) => {
	const res = await request.get("/api/menu?tid=1&date=2026-08-18"); // Worcester, DINING_HALLS
	expect(res.status()).toBe(200);
});

test("GET /api/menu accepts a known grab-n-go tid", async ({ request }) => {
	const res = await request.get("/api/menu?tid=10715&date=2026-08-18"); // Hampshire Grab 'N Go, GRAB_N_GO_TIDS
	expect(res.status()).toBe(200);
});

test("GET /api/menu rejects a malformed date even with a valid tid", async ({ request }) => {
	const res = await request.get("/api/menu?tid=1&date=2026-99-99"); // shape matches, calendar doesn't
	expect(res.status()).toBe(400);
});
