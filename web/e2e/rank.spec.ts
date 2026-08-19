import { test, expect, type Page, type Locator } from "@playwright/test";
import { parseCategoryItems } from "@udine/shared";

// Extends the vertical-slice pattern (see e2e/vertical-slice.spec.ts) to the ranking feature —
// the most complex client logic in the app: two independent Elo tracks (per-hall RankedDish,
// cross-hall RankedFood) plus the always-show-4-halls "Dining hall ranking" split. That math has
// real unit coverage in shared/src/ranking.test.ts; this test is only about whether
// web/src/routes/rank/+page.svelte actually wires those functions to what's logged and renders
// their output — the class of bug a unit test of ranking.ts alone can't see (see #9/#19's
// service-worker.ts precedent).
//
// Same two real-fragment dishes used in shared/src/umassDining.test.ts (French Toast, Fried
// Plantain — both Hampshire/tid=3, breakfast, "Breakfast Entrees"), run through the real
// parseCategoryItems so the mocked /api/menu response has the exact shape/values the live API
// returns, same as vertical-slice.spec.ts does for its single-dish fixture.
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

// "Your ranking" and "Favorite Foods" each render a <p>No comparisons yet.</p> instead of an <ol>
// while empty — so a naive following-sibling::ol[1] from the heading skips right over the missing
// <ol> and matches the *next* section's list instead (caught by running this: before any
// comparison it resolved "Your ranking"'s query to the always-present "Dining hall ranking" <ol>).
// Scoping by each list's own nearest preceding <h2> avoids that: it only matches a list that
// actually exists directly under the intended heading, with no other heading in between, so an
// absent list correctly resolves to zero elements rather than borrowing a later section's list.
function listUnderHeading(page: Page, headingText: string, tag: "ol" | "ul"): Locator {
	return page.locator(`xpath=//${tag}[preceding-sibling::h2[1][contains(., "${headingText}")]]`);
}

test("log 2 dishes, make a ranking comparison, and see Your ranking / Favorite Foods / Dining hall ranking update", async ({
	page,
}) => {
	let menuRequests = 0;
	await page.route("**/api/menu**", (route) => {
		menuRequests++;
		return route.fulfill({ json: MENU_ITEMS });
	});

	await page.goto("/");

	// Prove hydration completed before navigating client-side (see vertical-slice.spec.ts for why:
	// a pre-hydration click falls through to a full navigation that resolves /api/menu server-side,
	// invisible to page.route()).
	const hampshireRow = page.getByRole("listitem").filter({ hasText: "Hampshire" });
	const star = hampshireRow.getByRole("button", { name: "favorite" });
	await expect(async () => {
		await star.click();
		await expect(star).toHaveText("★");
	}).toPass({ timeout: 10_000 });

	await hampshireRow.getByRole("link", { name: "Hampshire" }).click();

	await expect
		.poll(() => menuRequests, { message: "menu mock never fired — this would have hit real umassdining.com" })
		.toBeGreaterThan(0);

	// Log both dishes so /rank has a pair to compare.
	await page.getByRole("listitem").filter({ hasText: "French Toast" }).getByRole("button", { name: "Log" }).click();
	await expect(page.getByRole("status")).toHaveText("Logged 1 × French Toast");
	await page.getByRole("listitem").filter({ hasText: "Fried Plantain" }).getByRole("button", { name: "Log" }).click();
	await expect(page.getByRole("status")).toHaveText("Logged 1 × Fried Plantain");

	await page.getByRole("link", { name: "Dining Halls" }).click();
	await page.getByRole("link", { name: "Rank dishes" }).click();

	await expect(page.getByRole("heading", { name: "Which did you like more?" })).toBeVisible();

	// Before any comparison, both Elo-backed sections report empty — proves the post-comparison
	// assertions below are seeing a real update, not content that was already there.
	const yourRankingList = listUnderHeading(page, "Your ranking", "ol");
	const favoriteFoodsList = listUnderHeading(page, "Favorite Foods", "ol");
	await expect(yourRankingList).toHaveCount(0);
	await expect(favoriteFoodsList).toHaveCount(0);

	// Click by dish name rather than pair position: pickPair()'s order between the two logged
	// dishes is randomized, so pinning "French Toast" as the intended winner keeps the test
	// deterministic regardless of which slot it lands in.
	await page.getByRole("button", { name: /French Toast/ }).click();

	// "Your ranking" (per-hall RankedDish track): winner (higher post-comparison Elo rating) sorts
	// first via rankDishes().
	await expect(yourRankingList.locator("li")).toHaveCount(2);
	await expect(yourRankingList.locator("li").nth(0)).toContainText("French Toast");
	await expect(yourRankingList.locator("li").nth(1)).toContainText("Fried Plantain");

	// "Favorite Foods" (cross-hall RankedFood track, keyed on dishName only, no hall) — same
	// winner-first ordering, proving applyFoodComparison/rankFoods are wired up independently of
	// the per-hall track above.
	await expect(favoriteFoodsList.locator("li")).toHaveCount(2);
	await expect(favoriteFoodsList.locator("li").nth(0)).toContainText("French Toast");
	await expect(favoriteFoodsList.locator("li").nth(1)).toContainText("Fried Plantain");

	// Dining hall ranking: both logged/rated dishes are at Hampshire, so it clears
	// MIN_RATED_DISHES_PER_HALL (2) and comes back ranked; the other 3 halls have zero rated
	// dishes and must still be listed, just marked as not-enough-data rather than omitted.
	const rankedHalls = listUnderHeading(page, "Dining hall ranking", "ol");
	const unrankedHalls = listUnderHeading(page, "Dining hall ranking", "ul");
	await expect(rankedHalls.locator("li")).toHaveCount(1);
	await expect(rankedHalls.locator("li").first()).toContainText("Hampshire");
	await expect(unrankedHalls.locator("li")).toHaveCount(3);
	for (const hall of ["Worcester", "Franklin", "Berkshire"]) {
		await expect(unrankedHalls).toContainText(hall);
	}
	await expect(unrankedHalls.locator("li")).toContainText(["not enough data yet", "not enough data yet", "not enough data yet"]);

	// #38 AC2: ranked vs. unranked halls must be visually distinguishable, "not just text saying
	// 'not enough data yet'". Pin that to the actual visual treatment (the shared .card surface),
	// not just the wording already asserted above, so a regression that quietly drops the card
	// styling back to plain rows can't hide behind a still-passing "contains the right words" check.
	await expect(rankedHalls.locator("li").first()).toHaveClass(/card/);
	await expect(unrankedHalls.locator("li").first()).not.toHaveClass(/card/);
});
