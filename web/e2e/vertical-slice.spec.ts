import { test, expect } from "@playwright/test";
import { parseCategoryItems } from "@udine/shared";

// The one flow CLAUDE.md calls the foundation everything else builds on: browse menu -> log a
// dish -> see it reflected in today's macro totals. Anonymous, no sign-in — matches the app's
// anonymous-first data-residency rules (see CLAUDE.md).
//
// The app's /halls/[slug] page fetches menu data from its own same-origin `/api/menu` route (a
// thin server-side proxy in front of umassdining.com/foodpro-menu-ajax — see
// web/src/routes/api/menu/+server.ts). That's the boundary Playwright's page.route() can actually
// intercept (page.route only sees requests the browser makes; the real outbound call to
// umassdining.com happens inside the SvelteKit server process, not the browser). Stubbing here
// means the test never depends on umassdining.com being live or unchanged.
//
// The fixture HTML below is the same real captured foodpro-menu-ajax fragment (Hampshire,
// tid=3, breakfast, "Breakfast Entrees") used in shared/src/umassDining.test.ts, run through the
// real parseCategoryItems so the mocked response has the exact shape/values the live API returns.
const REAL_FRAGMENT =
	`<a data-healthfulness="30" data-carbon-list="B" data-ingredient-list="FREIHOFFER&#039;S Country White Bread" ` +
	`data-allergens="Milk, Eggs, Gluten, Soy, Corn  , Wheat" data-recipe-webcode="LPR SUS VGT H3 CR2" ` +
	`data-clean-diet-str="Local, Sustainable, Vegetarian" data-serving-size="1 each" data-calories="127" ` +
	`data-calories-from-fat="26" data-total-fat="2.9g" data-total-fat-dv="4" data-sat-fat="0.5g" data-sat-fat-dv="" ` +
	`data-trans-fat="0g" data-cholesterol="50.9mg" data-cholesterol_dv="" data-sodium="237.2mg" data-sodium-dv="10" ` +
	`data-total-carb="20.4g" data-total-carb-dv="16" data-dietary-fiber="1g" data-dietary-fiber-dv="3" ` +
	`data-sugars="3.4g" data-sugars-dv="" data-protein="5.3g" data-protein-dv="9" data-dish-name="French Toast" ` +
	`href="#inline">French Toast</a>`;

const HAMPSHIRE_TID = 3;
const MENU_ITEMS = parseCategoryItems(REAL_FRAGMENT, "Breakfast Entrees", "breakfast", HAMPSHIRE_TID, "2026-08-18");

test("browse a hall's menu, log a dish, and see it reflected in today's macro totals", async ({ page }) => {
	let menuRequests = 0;
	await page.route("**/api/menu**", (route) => {
		menuRequests++;
		return route.fulfill({ json: MENU_ITEMS });
	});

	await page.goto("/");

	// Prove hydration completed before navigating, rather than guessing with waitForLoadState
	// ("networkidle" is a heuristic Playwright itself warns against, and vite dev keeps an HMR
	// websocket open which makes it even less meaningful here). A click that lands before
	// SvelteKit's client router has attached falls through to a native full-page navigation
	// instead of a client-side one, which runs the /api/menu load server-side (in-process, via
	// SvelteKit's SSR fetch-inlining) rather than as a browser-visible request — invisible to
	// page.route() above, so the mock would silently never fire and the test would quietly hit
	// real umassdining.com.
	//
	// The favorite star's onclick has no native fallback, so a click that lands pre-hydration is
	// just lost (not queued) — toHaveText alone can't detect that, since the click already
	// happened and won't retroactively fire once JS attaches. toPass() re-clicks on every retry
	// until one lands after hydration and the glyph flips, which is the actual condition we need.
	const hampshireRow = page.getByRole("listitem").filter({ hasText: "Hampshire" });
	const star = hampshireRow.getByRole("button", { name: "favorite" });
	await expect(async () => {
		await star.click();
		await expect(star).toHaveText("★");
	}).toPass({ timeout: 10_000 });

	await hampshireRow.getByRole("link", { name: "Hampshire" }).click();

	// Check this before the visibility assertion below: if the mock never fired, the page instead
	// renders the real live Hampshire menu, and `dishRow` just times out with a generic "element(s)
	// not found" — this gets the actual cause ("would have hit real umassdining.com") reported first.
	await expect
		.poll(() => menuRequests, { message: "menu mock never fired — this would have hit real umassdining.com" })
		.toBeGreaterThan(0);

	const dishRow = page.getByRole("listitem").filter({ hasText: "French Toast" });
	await expect(dishRow).toBeVisible();
	await dishRow.getByRole("button", { name: "Log" }).click();

	await expect(page.getByRole("status")).toHaveText("Logged 1 × French Toast");

	await page.getByRole("link", { name: "Dining Halls" }).click();

	// #64: the home dashboard itself shows today's macro stats -- the whole point of the Today-first
	// IA change is that this doesn't require a further click into /today to see.
	await expect(page.getByText("Calories: 127")).toBeVisible();

	await page.getByRole("link", { name: "Today's macros" }).click();

	await expect(page.getByRole("heading", { name: /^Today/ })).toBeVisible();
	await expect(page.getByText("Calories: 127")).toBeVisible();
	await expect(page.getByText("Protein: 5.3g")).toBeVisible();
	await expect(page.getByText("Carbs: 20.4g")).toBeVisible();
	await expect(page.getByText("Fat: 2.9g")).toBeVisible();
	await expect(page.getByText("French Toast × 1")).toBeVisible();
});
