import { test, expect, type Page } from "@playwright/test";

// Coverage for #43: shared component layer, loading/error states, and nav hierarchy in the app
// shell. These assert on the app shell itself (+layout.svelte, +error.svelte), not on any one
// screen, so they live separately from the per-screen specs.

// SvelteKit preloads a link's data on hover by default (data-sveltekit-preload-data="hover" on
// <body>). A real Playwright click hovers the target first, so the preload fires and races the
// route mocks below, non-deterministically consuming the mocked response (or a delay) before the
// real click-driven navigation does. Turning preload off removes that race without touching any
// app code or the assertions themselves.
async function disablePreload(page: Page) {
	await page.evaluate(() => document.body.setAttribute("data-sveltekit-preload-data", "off"));
}

// Same hydration pitfall vertical-slice.spec.ts documents and works around: a click that lands
// before SvelteKit's client router has attached falls through to a native full-page navigation
// instead of a client-side one. For the Press link (a real <a href>) that's not an outright
// failure -- the browser still ends up on /press -- but it skips the `navigating` store entirely,
// so a test asserting on the loading indicator would never see it, and it's slower besides (a full
// SSR round-trip instead of a client-side fetch). CI's runner hydrates measurably slower than a
// local dev machine, so this needs a real hydration proof, not just a generous timeout.
//
// Reuses vertical-slice.spec.ts's own technique: retry a cheap, client-only, side-effect-isolated
// interaction (the favorite star's onclick has no native fallback at all, so it only succeeds once
// hydration has actually attached) until it visibly took effect. Once that's passed, hydration is
// guaranteed complete and the real interaction below it is a single, un-retried click.
async function proveHydrated(page: Page) {
	const star = page.getByRole("button", { name: "favorite" }).first();
	// Every hall starts un-favorited ("☆") in a fresh browser context (Playwright gives each test
	// its own context, so IndexedDB is always empty here) -- a click that actually landed
	// post-hydration flips it to "★"; a pre-hydration click is silently lost (no native fallback),
	// so the glyph never changes and toPass retries with a fresh click.
	await expect(async () => {
		await star.click();
		await expect(star).toHaveText("★");
	}).toPass({ timeout: 15_000 });
}

test("exactly one nav element renders on every route", async ({ page }) => {
	for (const path of ["/", "/today", "/rank"]) {
		await page.goto(path);
		await expect(page.locator("nav")).toHaveCount(1);
	}
});

test("a loading indicator appears while a route's load is in flight, then clears", async ({ page }) => {
	// A fixed delay, not a manually-resolved gate: vite dev serves route modules on demand, so the
	// time between the click and the browser actually issuing the /api/press request varies run to
	// run. A fixed delay on the response is deterministic regardless of that; a shared promise we
	// resolve from the test ended up racing against dev-server compile time instead.
	await page.route("**/api/press**", async (route) => {
		await new Promise((resolve) => setTimeout(resolve, 500));
		return route.fulfill({ json: [] });
	});

	await page.goto("/");
	await disablePreload(page);
	await proveHydrated(page);

	// Press lives behind the Dining Info disclosure — open it first, same as the
	// disclosure-closes-on-navigation test below. Hydration is proven above, so this is a single,
	// un-retried click that's guaranteed to be intercepted client-side.
	await page.locator("details summary").click();
	await page.getByRole("link", { name: "Press" }).click();

	// The indicator itself should flip immediately -- `navigating.to` is set synchronously when a
	// client-side nav starts, before the (mocked, artificially delayed) load resolves -- but the URL
	// and hidden checks wait out the delay plus /press's first, possibly-cold module compile.
	const indicator = page.locator('[aria-hidden="true"].animate-pulse');
	await expect(indicator).toBeVisible();

	await expect(page).toHaveURL(/\/press$/, { timeout: 15_000 });
	await expect(indicator).toBeHidden({ timeout: 15_000 });
});

test("hitting an unknown route renders the on-brand error page with a route back", async ({ page }) => {
	await page.goto("/definitely-not-a-route");

	await expect(page.getByRole("heading", { name: "Not on the menu" })).toBeVisible();
	await expect(page.getByRole("link", { name: "Back to dining halls" })).toBeVisible();
});

test("an upstream fetch failure renders the on-brand error page, not SvelteKit's default", async ({ page }) => {
	// Route mocking only intercepts the browser's own fetches, not a full-page load's SSR fetch
	// (that runs in the SvelteKit server process — see the comment in vertical-slice.spec.ts on the
	// same pitfall). Land on a page whose load doesn't call /api/press first, mock it, then trigger
	// a client-side navigation into /press so the mocked route is the one that actually gets hit.
	await page.goto("/");
	await disablePreload(page);
	await proveHydrated(page);
	await page.route("**/api/press**", (route) => route.fulfill({ status: 502, body: "bad gateway" }));
	await page.locator("details summary").click();
	await page.getByRole("link", { name: "Press" }).click();

	// Generous timeout: vite dev compiles the /press route's modules on first request, which on a
	// cold cache can take a few seconds and has nothing to do with whether the error page is correct.
	await page.waitForURL(/\/press$/, { timeout: 15_000 });
	// Regex, not a literal string: the rendered heading uses a typographic right single quote
	// (&rsquo;, U+2019) — "Couldn't" with a straight ASCII apostrophe never matches it. Generous
	// timeout for the same cold-compile reason as the waitForURL above -- the URL can update before
	// the client has finished rendering the new page's content, especially with hydration proven but
	// still-cold vite module compiles.
	await expect(page.getByRole("heading", { name: /Couldn.t reach UMass Dining/ })).toBeVisible({ timeout: 15_000 });
	await expect(page.getByRole("link", { name: "Back to dining halls" })).toBeVisible();
});

test("the Dining Info disclosure closes after a client-side navigation through it", async ({ page }) => {
	await page.route("**/api/newsletter**", (route) => route.fulfill({ json: [] }));

	await page.goto("/");
	await proveHydrated(page);
	const details = page.locator("details");
	await details.locator("summary").click();
	await expect(details).toHaveJSProperty("open", true);

	await details.getByRole("link", { name: "Newsletter" }).click();
	await expect(page).toHaveURL(/\/newsletter$/);
	await expect(page.locator("details")).toHaveJSProperty("open", false);
});

test("Friends and Notifications are in primary nav, not behind the disclosure", async ({ page }) => {
	await page.goto("/");
	const nav = page.locator("nav");
	await expect(nav.getByRole("link", { name: "Friends" })).toBeVisible();
	await expect(nav.getByRole("link", { name: "Notifications" })).toBeVisible();
});

test("a skip-to-content link and a device-only-data footer are present", async ({ page }) => {
	await page.goto("/");
	await expect(page.getByRole("link", { name: "Skip to content" })).toBeAttached();
	await expect(page.getByRole("main")).toHaveAttribute("id", "main");
	await expect(page.locator("footer")).toContainText(/stays on this device/i);
});
