import { test, expect, type Page } from "@playwright/test";
import { parseCategoryItems } from "@udine/shared";

// Coverage for #64 (part of epic #63): `/` becomes a Today-first dashboard -- today's device-local
// macro stats up top (empty state when nothing's logged), the four halls as compact cards
// (favorite-star contract intact, see CLAUDE.md/other specs), and quick links to Rank/Favorites.
// `/today` remains the full detail view (log list, split bar, exports) -- see today.spec.ts, which
// this file does not duplicate.

// Same hydration pitfall documented in vertical-slice.spec.ts: a click before SvelteKit's client
// router attaches falls through to a full navigation, invisible to page.route() mocks below.
async function proveHydrated(page: Page) {
	const star = page.getByRole("listitem").filter({ hasText: "Hampshire" }).getByRole("button", { name: "favorite" });
	await expect(async () => {
		await star.click();
		await expect(star).toHaveText("★");
	}).toPass({ timeout: 10_000 });
	// Un-favorite again so this proof doesn't leak state into the assertions below.
	await star.click();
	await expect(star).toHaveText("☆");
}

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

test("home shows an empty state when nothing is logged today, with halls still reachable in one tap", async ({
	page,
}) => {
	await page.goto("/");
	await proveHydrated(page);

	await expect(page.getByText("Nothing logged yet today.")).toBeVisible();
	// #40/#37's empty-state treatment (dashed outline), not a bare paragraph.
	const emptyState = page.getByText("Nothing logged yet today.").locator("xpath=..");
	await expect(emptyState).toHaveCSS("border-style", "dashed");

	// Halls are still one tap away -- not demoted below a fold the empty state hides.
	const hampshireRow = page.getByRole("listitem").filter({ hasText: "Hampshire" });
	await expect(hampshireRow.getByRole("link", { name: "Hampshire" })).toBeVisible();
});

test("logging a dish updates today's macro stats on the home dashboard itself", async ({ page }) => {
	let menuRequests = 0;
	await page.route("**/api/menu**", (route) => {
		menuRequests++;
		return route.fulfill({ json: MENU_ITEMS });
	});

	await page.goto("/");
	await proveHydrated(page);

	await page
		.getByRole("listitem")
		.filter({ hasText: "Hampshire" })
		.getByRole("link", { name: "Hampshire" })
		.click();

	await expect
		.poll(() => menuRequests, { message: "menu mock never fired — this would have hit real umassdining.com" })
		.toBeGreaterThan(0);

	await page.getByRole("listitem").filter({ hasText: "French Toast" }).getByRole("button", { name: "Log" }).click();
	await expect(page.getByRole("status")).toHaveText("Logged 1 × French Toast");

	// Back to the dashboard via nav (not a deep link into /today) -- the point of #64 is that the
	// stats are visible right here, not one more click away.
	await page.getByRole("link", { name: "Dining Halls" }).click();

	await expect(page.getByText("Nothing logged yet today.")).toHaveCount(0);
	await expect(page.getByText("Calories: 127")).toBeVisible();
	await expect(page.getByText("Protein: 5.3g")).toBeVisible();
	await expect(page.getByText("from 1 entry")).toBeVisible();

	// A deep link into the full detail view is offered, but the numbers themselves are already here.
	await expect(page.getByRole("link", { name: "Full day" })).toBeVisible();
});

test("quick links reach Rank and Favorites without ambiguity against the primary nav", async ({ page }) => {
	await page.goto("/");
	await proveHydrated(page);

	// getByRole's default name match is a case-insensitive substring -- if these labels ever
	// collided with the primary nav's "Rank dishes" / "Favorites" links, this click would throw a
	// strict-mode violation (multiple matches) instead of silently picking one. That failure mode is
	// exactly what this test exists to catch.
	await page.getByRole("link", { name: "Compare dishes" }).click();
	await expect(page.getByRole("heading", { name: "Rank Dishes", level: 1 })).toBeVisible();

	await page.getByRole("link", { name: "Dining Halls" }).click();
	await page.getByRole("link", { name: "Favorite dishes" }).click();
	await expect(page.getByRole("heading", { name: "Favorites", level: 1 })).toBeVisible();
});

// app.css (#42) @imports Google Fonts, so every page -- including this one -- legitimately makes a
// cross-origin request for it. Not a residency leak: it's a stylesheet fetch, not data leaving the
// device. Anything else cross-origin, or any same-origin /api/ path (other than the one exception
// below), is what this guard exists to catch.
const ALLOWED_CROSS_ORIGIN_HOSTS = new Set(["fonts.googleapis.com", "fonts.gstatic.com"]);

// #178: café-tap parity added a "Cafés & Markets" section to this same page, fetched client-side
// from /api/hours (see +page.svelte's onMount) -- unlike the macro stats/top-dishes/favorites this
// test's title describes, café names/hours aren't device-local data; they don't exist until fetched
// from the public get_infov2 feed, same anonymous, no-account, non-personal category as /api/menu on
// every hall page (see CLAUDE.md's data-residency table: "Menu cache ... fetched directly from UMass
// Dining APIs ... public data"). This guard's real job (per #69's review, below) is catching a
// leaked *identity/health-data* call -- e.g. a stray Supabase request -- not banning every anonymous
// public-data fetch from this specific route, so this one path is a deliberate, disclosed exception,
// not a hole in the guard.
const ALLOWED_SAME_ORIGIN_API_PATHS = new Set(["/api/hours"]);

test("home issues zero API/cross-origin requests -- macro stats are device-local, not a server call", async ({ page, baseURL }) => {
	// Carry-over from PR #69's review (see issue #66's tracker comment): a page.route("**/api/**")
	// guard only ever sees requests matching that glob, so a direct cross-origin fetch to
	// *.supabase.co silently passes it -- proven by mutating this page with a
	// fetch(..., { mode: "no-cors" }) call and watching the old guard stay green. page.on("request")
	// fires for every request the page issues, no-cors included, so nothing routes around it.
	const offenders: string[] = [];
	const sameOrigin = new URL(baseURL!).origin;
	page.on("request", (req) => {
		const url = new URL(req.url());
		if (url.protocol !== "http:" && url.protocol !== "https:") return; // data:/blob: aren't egress
		if (url.origin === sameOrigin) {
			if (url.pathname.includes("/api/") && !ALLOWED_SAME_ORIGIN_API_PATHS.has(url.pathname)) offenders.push(req.url());
			return;
		}
		if (!ALLOWED_CROSS_ORIGIN_HOSTS.has(url.hostname)) offenders.push(req.url());
	});

	await page.goto("/");
	await proveHydrated(page);

	// Give any accidental fetch a beat to land before asserting its absence.
	await page.waitForTimeout(500);
	expect(offenders, `unexpected /api/ or cross-origin request(s): ${offenders.join(", ")}`).toEqual([]);
});
