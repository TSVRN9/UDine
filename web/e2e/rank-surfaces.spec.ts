import { test, expect, type Page } from "@playwright/test";
import { parseCategoryItems } from "@udine/shared";

// Coverage for #67 (last child of epic #63): rank-informed surfaces on top of the existing ranking
// machinery (shared/src/ranking.ts, web/src/routes/rank/+page.svelte) -- (1) a post-log one-tap
// comparison prompt on halls/[slug], (2) a "Your top dishes" module on the home dashboard (`/`).
// Pair-selection logic itself (pickPostLogComparisonPair) has its own red-first unit coverage in
// shared/src/ranking.test.ts; this file is only about whether the two pages actually wire that
// function up to real IndexedDB reads/writes and render its output -- vertical-slice.spec.ts /
// rank.spec.ts precedent for why a unit test alone can't see that class of bug.

// Same hydration pitfall documented throughout this suite: a click before SvelteKit's client router
// attaches falls through to a full navigation, invisible to page.route() mocks below.
async function proveHydrated(page: Page) {
	const star = page.getByRole("listitem").filter({ hasText: "Hampshire" }).getByRole("button", { name: "favorite" });
	await expect(async () => {
		await star.click();
		await expect(star).toHaveText("★");
	}).toPass({ timeout: 10_000 });
	await star.click();
	await expect(star).toHaveText("☆");
}

// Same two real-fragment dishes rank.spec.ts uses (French Toast, Fried Plantain -- both
// Hampshire/tid=3, breakfast, "Breakfast Entrees"), run through the real parseCategoryItems so the
// mocked /api/menu response has the exact shape/values the live API returns.
const REAL_FRAGMENT =
	`<a data-healthfulness="30" data-carbon-list="B" data-ingredient-list="FREIHOFFER&#039;S Country White Bread" ` +
	`data-allergens="Milk, Eggs, Gluten, Soy, Corn  , Wheat" data-recipe-webcode="LPR SUS VGT H3 CR2" ` +
	`data-clean-diet-str="Local, Sustainable, Vegetarian" data-serving-size="1 each" data-calories="127" ` +
	`data-calories-from-fat="26" data-total-fat="2.9g" data-total-fat-dv="4" data-sat-fat="0.5g" data-sat-fat-dv="" ` +
	`data-trans-fat="0g" data-cholesterol="50.9mg" data-cholesterol_dv="" data-sodium="237.2mg" data-sodium-dv="10" ` +
	`data-total-carb="20.4g" data-total-carb-dv="16" data-dietary-fiber="1g" data-dietary-fiber-dv="3" ` +
	`data-sugars="3.4g" data-sugars-dv="" data-protein="5.3g" data-protein-dv="9" data-dish-name="French Toast" ` +
	`href="#inline">French Toast</a>` +
	`<a data-healthfulness="30" data-carbon-list="A" data-ingredient-list="Sweet Plantains" ` +
	`data-allergens="Milk, Eggs, Gluten, Soy, Corn  , Sesame , Wheat" data-recipe-webcode="VGT H3 CR1" ` +
	`data-clean-diet-str="Vegetarian" data-serving-size="1 OZ" data-calories="69" data-calories-from-fat="33" ` +
	`data-total-fat="3.7g" data-total-fat-dv="5" data-sat-fat="0.7g" data-sat-fat-dv="" data-trans-fat="0g" ` +
	`data-cholesterol="0mg" data-cholesterol_dv="" data-sodium="123.2mg" data-sodium-dv="5" data-total-carb="8.9g" ` +
	`data-total-carb-dv="7" data-dietary-fiber="0.2g" data-dietary-fiber-dv="1" data-sugars="8.2g" data-sugars-dv="" ` +
	`data-protein="0.3g" data-protein-dv="0" data-dish-name="Fried Plantain" href="#inline">Fried Plantain</a>`;

const HAMPSHIRE_TID = 3;
const MENU_ITEMS = parseCategoryItems(REAL_FRAGMENT, "Breakfast Entrees", "breakfast", HAMPSHIRE_TID, "2026-08-18");

// A realistic-length menu (~40 dishes, one category) -- the 2-dish fixture above can't reach the
// prompt-placement ceiling this section covers: with only 2 dishes on the page, any placement is
// "in the viewport" by accident. Synthetic names/nutrition (real values aren't the point here, only
// list length is), still run through the real parseCategoryItems so the fixture has the same shape
// live data does.
function longMenuFragment(count: number): string {
	let html = "";
	for (let i = 1; i <= count; i++) {
		const name = `Dish ${String(i).padStart(2, "0")}`;
		html += `<a data-dish-name="${name}" data-calories="100" data-protein="5g" data-total-carb="10g" data-total-fat="2g" data-serving-size="1 each" href="#inline">${name}</a>`;
	}
	return html;
}
const LONG_MENU_ITEMS = parseCategoryItems(longMenuFragment(40), "Entrees", "breakfast", HAMPSHIRE_TID, "2026-08-18");

async function gotoHampshireMenu(page: Page) {
	await page.route("**/api/menu**", (route) => route.fulfill({ json: MENU_ITEMS }));
	await page.goto("/");
	await proveHydrated(page);
	await page
		.getByRole("listitem")
		.filter({ hasText: "Hampshire" })
		.getByRole("link", { name: "Hampshire" })
		.click();
}

function comparePrompt(page: Page) {
	return page.getByRole("region", { name: "Compare dishes" });
}

test("logging the first dish offers no comparison prompt (nothing to pair it with yet)", async ({ page }) => {
	await gotoHampshireMenu(page);

	await page.getByRole("listitem").filter({ hasText: "French Toast" }).getByRole("button", { name: "Log" }).click();
	await expect(page.getByRole("status")).toHaveText("Logged 1 × French Toast");

	await expect(comparePrompt(page)).toHaveCount(0);
});

test("logging a second distinct dish offers a one-tap comparison prompt naming both dishes", async ({ page }) => {
	await gotoHampshireMenu(page);

	await page.getByRole("listitem").filter({ hasText: "French Toast" }).getByRole("button", { name: "Log" }).click();
	await expect(page.getByRole("status")).toHaveText("Logged 1 × French Toast");
	await expect(comparePrompt(page)).toHaveCount(0);

	await page.getByRole("listitem").filter({ hasText: "Fried Plantain" }).getByRole("button", { name: "Log" }).click();
	await expect(page.getByRole("status")).toHaveText("Logged 1 × Fried Plantain");

	await expect(comparePrompt(page)).toBeVisible();
	await expect(comparePrompt(page)).toContainText("French Toast");
	await expect(comparePrompt(page)).toContainText("Fried Plantain");
});

test("the comparison prompt is dismissible and dismissing it records no comparison", async ({ page }) => {
	await gotoHampshireMenu(page);
	await page.getByRole("listitem").filter({ hasText: "French Toast" }).getByRole("button", { name: "Log" }).click();
	await page.getByRole("listitem").filter({ hasText: "Fried Plantain" }).getByRole("button", { name: "Log" }).click();
	await expect(comparePrompt(page)).toBeVisible();

	await comparePrompt(page).getByRole("button", { name: "Dismiss comparison prompt" }).click();
	await expect(comparePrompt(page)).toHaveCount(0);

	// No comparison was recorded -- /rank's "Your ranking" list stays empty. Scoped by "pick a
	// winner above" (unique to this section) rather than the bare "No comparisons yet" prefix,
	// which "Favorite Foods"'s own empty state also starts with.
	await page.goto("/rank");
	await expect(page.getByText("No comparisons yet — pick a winner above")).toBeVisible();
});

test("logging stays one tap: the open comparison prompt never blocks logging another dish, or intercepts the header nav", async ({
	page,
}) => {
	await gotoHampshireMenu(page);
	await page.getByRole("listitem").filter({ hasText: "French Toast" }).getByRole("button", { name: "Log" }).click();
	await page.getByRole("listitem").filter({ hasText: "Fried Plantain" }).getByRole("button", { name: "Log" }).click();
	await expect(comparePrompt(page)).toBeVisible();

	// A real click auto-scrolls its target into view first, so it can't tell "reachable after
	// scrolling" apart from "blocked by an overlay right where it already was" -- that gap is exactly
	// how a fixed-position version of this prompt got past every other assertion in this file while
	// actually intercepting pointer events on the header nav (caught only by rank.spec.ts, a
	// different file). `{ trial: true }` still scrolls the target into view, but runs Playwright's
	// actionability checks -- including "receives pointer events" -- without performing the click
	// itself, so it fails if something else in that scrolled-to position would swallow the click.
	const logButton = page
		.getByRole("listitem")
		.filter({ hasText: "French Toast" })
		.getByRole("button", { name: "Log" });
	await logButton.click({ trial: true });
	await page.getByRole("link", { name: "Dining Halls" }).click({ trial: true });

	// Log French Toast again without touching the prompt at all -- the toast still fires normally,
	// proving the prompt has no overlay/focus-trap standing between the user and the Log buttons.
	await logButton.click();
	await expect(page.getByRole("status")).toHaveText("Logged 1 × French Toast");
});

test("choosing a winner in the prompt records a real comparison, visible on /rank", async ({ page }) => {
	await gotoHampshireMenu(page);
	await page.getByRole("listitem").filter({ hasText: "French Toast" }).getByRole("button", { name: "Log" }).click();
	await page.getByRole("listitem").filter({ hasText: "Fried Plantain" }).getByRole("button", { name: "Log" }).click();
	await expect(comparePrompt(page)).toBeVisible();

	await comparePrompt(page).getByRole("button", { name: /French Toast/ }).click();
	await expect(comparePrompt(page)).toHaveCount(0);

	await page.goto("/rank");
	const rankingList = page.locator(`xpath=//ol[preceding-sibling::h2[1][contains(., "Your ranking")]]`);
	await expect(rankingList.locator("li")).toHaveCount(2);
	await expect(rankingList.locator("li").nth(0)).toContainText("French Toast");
});

test("home shows an empty state for Your Top Dishes before any comparison, without colliding with the existing Compare dishes quick link", async ({
	page,
}) => {
	await page.goto("/");
	await proveHydrated(page);

	await expect(page.getByRole("heading", { name: "Your Top Dishes" })).toBeVisible();
	await expect(page.getByText("No comparisons yet")).toBeVisible();

	// Both the empty-state CTA and the "More" section's quick link route to /rank, but must not
	// share an accessible name -- home-dashboard.spec.ts locates the quick link by
	// getByRole("link", { name: "Compare dishes" }), which would throw a strict-mode violation if a
	// second link picked up that same name.
	await expect(page.getByRole("link", { name: "Compare dishes" })).toHaveCount(1);
	await expect(page.getByRole("link", { name: "Start ranking" })).toBeVisible();
});

test("home's Your Top Dishes module shows a real comparison's winner, ranked, linking to /rank", async ({ page }) => {
	await gotoHampshireMenu(page);
	await page.getByRole("listitem").filter({ hasText: "French Toast" }).getByRole("button", { name: "Log" }).click();
	await page.getByRole("listitem").filter({ hasText: "Fried Plantain" }).getByRole("button", { name: "Log" }).click();
	await comparePrompt(page).getByRole("button", { name: /French Toast/ }).click();

	await page.goto("/");
	await expect(page.getByRole("heading", { name: "Your Top Dishes" })).toBeVisible();
	await expect(page.getByText("No comparisons yet")).toHaveCount(0);

	const topDishesSection = page.locator("section").filter({ has: page.getByRole("heading", { name: "Your Top Dishes" }) });
	await expect(topDishesSection.locator("li").first()).toContainText("French Toast");
	await expect(topDishesSection.getByRole("link", { name: "Full ranking" })).toBeVisible();
});

// #66/#69: home's own residency guard (home-dashboard.spec.ts's page.on("request") check) already
// covers "/" -- a page.route("**/api/**") guard here would be the same retired pattern that test's
// own comment documents as blind to a direct cross-origin fetch(..., { mode: "no-cors" }) call, not
// a second, independent proof.

test("post-log comparison prompt is visible in the viewport after logging a dish far down a long menu", async ({
	page,
}) => {
	await page.route("**/api/menu**", (route) => route.fulfill({ json: LONG_MENU_ITEMS }));
	await page.goto("/");
	await proveHydrated(page);
	await page
		.getByRole("listitem")
		.filter({ hasText: "Hampshire" })
		.getByRole("link", { name: "Hampshire" })
		.click();

	// Log the first dish so a second log later on has a valid opponent to pair against.
	await page.getByRole("listitem").filter({ hasText: "Dish 01" }).getByRole("button", { name: "Log" }).click();
	await expect(page.getByRole("status")).toHaveText("Logged 1 × Dish 01");

	// Log a dish far down a realistic-length menu -- this is the reviewer's probe for the header-flow
	// ceiling: a prompt rendered in document flow directly under the date nav sits far above the
	// viewport once the page has scrolled this deep, "offered" only in the DOM, not to the user.
	const farDish = page.getByRole("listitem").filter({ hasText: "Dish 35" }).getByRole("button", { name: "Log" });
	await farDish.scrollIntoViewIfNeeded();
	await farDish.click();
	await expect(page.getByRole("status")).toHaveText("Logged 1 × Dish 35");

	await expect(comparePrompt(page)).toBeInViewport();
});

test("scrolled deep in a long menu, the comparison prompt and the header nav/status toast all stay tappable and non-overlapping", async ({
	page,
}) => {
	await page.route("**/api/menu**", (route) => route.fulfill({ json: LONG_MENU_ITEMS }));
	await page.goto("/");
	await proveHydrated(page);
	await page
		.getByRole("listitem")
		.filter({ hasText: "Hampshire" })
		.getByRole("link", { name: "Hampshire" })
		.click();

	await page.getByRole("listitem").filter({ hasText: "Dish 01" }).getByRole("button", { name: "Log" }).click();
	const farDish = page.getByRole("listitem").filter({ hasText: "Dish 35" }).getByRole("button", { name: "Log" });
	await farDish.scrollIntoViewIfNeeded();
	await farDish.click();
	await expect(comparePrompt(page)).toBeInViewport();

	// Both the prompt and the status toast are anchored to the viewport bottom and can be visible at
	// the same time right after logging -- confirm they stack instead of overlapping. Captured
	// immediately after the log, before the trial clicks below, since loggedMessage self-clears after
	// 2s (logItem's own setTimeout) and the toast must still be up for this comparison to mean anything.
	await expect(page.getByRole("status")).toBeVisible();
	const toastBox = await page.getByRole("status").boundingBox();
	const promptBox = await comparePrompt(page).boundingBox();
	expect(toastBox).not.toBeNull();
	expect(promptBox).not.toBeNull();
	expect(promptBox!.y + promptBox!.height).toBeLessThanOrEqual(toastBox!.y + 1);

	// A real click auto-scrolls its target into view first, so it can't tell "reachable after
	// scrolling" apart from "blocked by an overlay right where it already was" -- the same gap
	// rank.spec.ts:80 exists to catch, but at scroll 0, which a long menu never leaves the prompt at.
	// Running the same trial-click actionability check at this actually-scrolled position is the
	// point: it proves the bottom-anchored fix doesn't just move the interception from the header to
	// the status toast (or vice versa).
	await comparePrompt(page).getByRole("button", { name: /Dish 01/ }).click({ trial: true });
	await page.getByRole("link", { name: "Dining Halls" }).click({ trial: true });
});
