import { test, expect } from "@playwright/test";
import type { MenuItem, NutritionFacts } from "@udine/shared";

// Anonymous-first dietary/allergen filters: CLAUDE.md keeps FoodPreferences device-only
// (localStorage), and menuItemMatchesPreferences (shared/src/types.ts) is what the hall page
// runs against each item. This proves the filter set on /filters actually changes what's shown
// on a hall's menu, not just that the filters page itself renders.

const NUTRITION: NutritionFacts = {
	servingSize: "1 each",
	calories: 200,
	caloriesFromFat: 20,
	totalFatG: 2,
	satFatG: 0.5,
	transFatG: 0,
	cholesterolMg: 0,
	sodiumMg: 100,
	totalCarbG: 30,
	dietaryFiberG: 2,
	sugarsG: 5,
	proteinG: 8,
};

const HAMPSHIRE_TID = 3;
const DATE = "2026-08-18";

// Conflicts with an "avoid Milk" filter (menuItemMatchesPreferences excludes any item whose
// allergens include an avoided one).
const MILK_DISH: MenuItem = {
	dishName: "Milk Pancakes",
	category: "Breakfast Entrees",
	mealPeriod: "breakfast",
	hallTid: HAMPSHIRE_TID,
	date: DATE,
	nutrition: NUTRITION,
	allergens: ["Milk"],
	dietTags: [],
};

// No allergens, so it passes the same filter unaffected.
const FRUIT_DISH: MenuItem = {
	dishName: "Fruit Salad",
	category: "Breakfast Entrees",
	mealPeriod: "breakfast",
	hallTid: HAMPSHIRE_TID,
	date: DATE,
	nutrition: NUTRITION,
	allergens: [],
	dietTags: ["Vegan"],
};

const MENU_ITEMS = [MILK_DISH, FRUIT_DISH];

test("setting an allergen filter hides a conflicting dish and keeps a non-conflicting one visible", async ({ page }) => {
	let menuRequests = 0;
	await page.route("**/api/menu**", (route) => {
		menuRequests++;
		return route.fulfill({ json: MENU_ITEMS });
	});

	await page.goto("/");

	// Same hydration proof as vertical-slice.spec.ts: a click before the client router attaches
	// falls through to a full navigation, which runs /filters' and /halls/[slug]'s load functions
	// server-side (in-process fetch to /api/menu, invisible to page.route()) instead of as a
	// browser-visible request the mock above can intercept.
	const hampshireRow = page.getByRole("listitem").filter({ hasText: "Hampshire" });
	const star = hampshireRow.getByRole("button", { name: "favorite" });
	await expect(async () => {
		await star.click();
		await expect(star).toHaveText("★");
	}).toPass({ timeout: 10_000 });

	await page.getByRole("link", { name: "Filters" }).click();

	// #40: filters are toggle/checkbox-heavy and need a clear on/off state — a checked filter must
	// be visually distinct from an unchecked one, not just carry a different checkbox attribute.
	// Scoped through the checkbox's own accessible name (not a listitem text filter) so this stays
	// unambiguous even if another allergen option's name contains "Milk" as a substring.
	const milkLabel = page.getByRole("checkbox", { name: "Milk" }).locator("xpath=..");
	const milkBgBeforeCheck = await milkLabel.evaluate((el) => getComputedStyle(el).backgroundColor);

	await page.getByRole("checkbox", { name: "Milk" }).check();
	await expect(milkLabel).not.toHaveCSS("background-color", milkBgBeforeCheck);

	await page.getByRole("button", { name: "Save" }).click();
	await expect(page.getByRole("status")).toHaveText("Saved");

	await page.getByRole("link", { name: "Dining Halls" }).click();
	await hampshireRow.getByRole("link", { name: "Hampshire" }).click();

	// If the mock never fired (e.g. a pre-hydration click fell through to a full navigation), the
	// page would instead hit real umassdining.com — fail loudly with that cause rather than letting
	// the assertions below pass or fail against live data.
	await expect
		.poll(() => menuRequests, { message: "menu mock never fired — this would have hit real umassdining.com" })
		.toBeGreaterThan(0);

	await expect(page.getByRole("listitem").filter({ hasText: "Fruit Salad" })).toBeVisible();
	await expect(page.getByRole("listitem").filter({ hasText: "Milk Pancakes" })).toHaveCount(0);
});
