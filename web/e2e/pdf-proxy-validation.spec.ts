import { test, expect } from "@playwright/test";

// #224: /api/pdf re-serves an upstream umassdining.com PDF with Content-Disposition: attachment so
// the café SAVE button's `download` genuinely saves, same-origin, no navigation. Like
// menu-proxy-tid-validation.spec.ts, this uses Playwright's `request` fixture to hit the real dev
// server directly (see playwright.config.ts's webServer) -- cafe-tap-parity.spec.ts's own PDF test
// mocks this route wholesale with page.route(), which proves the SAVE button is *wired* to it but
// never actually exercises the route handler's own validation/filename logic. This file is that
// exercise.
const LIVE_PDF = "https://umassdining.com/sites/default/files/2025-08/Baby%20Berk%201%20FA25_compressed.pdf";

test("GET /api/pdf rejects a missing url param", async ({ request }) => {
	const res = await request.get("/api/pdf");
	expect(res.status()).toBe(400);
});

test("GET /api/pdf rejects a url on a host that isn't umassdining.com", async ({ request }) => {
	const res = await request.get(`/api/pdf?url=${encodeURIComponent("https://evil.example/x.pdf")}`);
	expect(res.status()).toBe(400);
});

// #178 pr-review's exact bypass, re-checked against this route specifically: isUmassDiningHost is
// shared with parseRetailMenuHtml, but importing a function correctly doesn't prove this route
// actually calls it before fetching -- this is the highest-value case in this file.
test("GET /api/pdf rejects a host that merely starts with umassdining.com (authority-faking bypass)", async ({
	request,
}) => {
	const res = await request.get(`/api/pdf?url=${encodeURIComponent("https://umassdining.com.evil.example/x.pdf")}`);
	expect(res.status()).toBe(400);
});

// A malformed %-escape in the path (not the host) passes the host check but used to throw
// uncaught from decodeURIComponent while deriving the Content-Disposition filename, turning a
// caller-supplied 400-shaped problem into SvelteKit's default 500 page. Filename derivation runs
// before the upstream fetch (see +server.ts's own comment), so this needs no network at all --
// deterministic either way.
test("GET /api/pdf doesn't 500 on a malformed %-escape in the url's path", async ({ request }) => {
	const res = await request.get(`/api/pdf?url=${encodeURIComponent("https://umassdining.com/x%ZZ.pdf")}`);
	expect(res.status()).not.toBe(500);
});

// No mock -- hits the real umassdining.com upstream (see file header). If umassdining.com is
// unreachable or this specific file has since been taken down, this fails on a network/status
// error rather than silently passing; retries are 0 repo-wide (playwright.config.ts) so that shows
// up as a red run, not a flake laundered by a retry.
test("GET /api/pdf serves a real upstream PDF as a same-origin attachment", async ({ request }) => {
	const res = await request.get(`/api/pdf?url=${encodeURIComponent(LIVE_PDF)}`);
	expect(res.status()).toBe(200);
	expect(res.headers()["content-type"]).toBe("application/pdf");
	expect(res.headers()["content-disposition"]).toBe('attachment; filename="Baby_Berk_1_FA25_compressed.pdf"');
	const body = await res.body();
	expect(body.length).toBeGreaterThan(0);
});
