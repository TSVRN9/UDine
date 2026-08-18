import { test, expect } from "@playwright/test";
import { parseCategoryItems } from "@udine/shared";

// Anonymous-first binary favorites (device-only IndexedDB, see CLAUDE.md) — distinct from the
// ranked pairwise-comparison system (#25). Favorite a dish from the hall menu, confirm it shows
// up on /favorites, un-favorite, confirm it's gone.
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

test("favoriting a dish from the menu shows it on /favorites, un-favoriting removes it", async ({ page }) => {
	let menuRequests = 0;
	await page.route("**/api/menu**", (route) => {
		menuRequests++;
		return route.fulfill({ json: MENU_ITEMS });
	});

	await page.goto("/");

	// Hydration proof, same as vertical-slice.spec.ts — see filters.spec.ts for why this has to be
	// the first interaction after goto().
	const hampshireRow = page.getByRole("listitem").filter({ hasText: "Hampshire" });
	const hallStar = hampshireRow.getByRole("button", { name: "favorite" });
	await expect(async () => {
		await hallStar.click();
		await expect(hallStar).toHaveText("★");
	}).toPass({ timeout: 10_000 });

	await hampshireRow.getByRole("link", { name: "Hampshire" }).click();

	// If the mock never fired (e.g. a pre-hydration click fell through to a full navigation), the
	// page would instead hit real umassdining.com — fail loudly with that cause rather than letting
	// "French Toast" (a real Hampshire dish) resolve against live data and pass by accident.
	await expect
		.poll(() => menuRequests, { message: "menu mock never fired — this would have hit real umassdining.com" })
		.toBeGreaterThan(0);

	const dishRow = page.getByRole("listitem").filter({ hasText: "French Toast" });
	const dishStar = dishRow.getByRole("button", { name: "favorite" });
	await expect(dishRow).toBeVisible();
	await dishStar.click();
	await expect(dishStar).toHaveText("★");

	await page.getByRole("link", { name: "Favorites" }).click();
	const favoriteRow = page.getByRole("listitem").filter({ hasText: "French Toast" });
	await expect(favoriteRow).toBeVisible();

	await favoriteRow.getByRole("button", { name: "Remove" }).click();
	await expect(page.getByText("No favorite dishes yet.")).toBeVisible();
	await expect(favoriteRow).toHaveCount(0);
});
