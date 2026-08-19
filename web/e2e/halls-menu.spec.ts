import { test, expect, type Page } from "@playwright/test";
import type { MenuItem, NutritionFacts } from "@udine/shared";

// Coverage for #36 that vertical-slice.spec.ts / filters.spec.ts / favorites.spec.ts don't already
// assert on: the specific UX defects PR #48's description calls out by name — silent filtering when
// *every* dish is hidden (filters.spec.ts only covers a partial hide), the favorite star's
// aria-pressed state (existing specs only read the glyph text), the NaN-serving guard on the log
// flow, and the no-menu-posted empty state. Deliberately a new file, not an addition to the specs
// above — those are scoped to one behavior each and this would blur that.

// Same hydration pitfall documented in vertical-slice.spec.ts / shell.spec.ts: a click that lands
// before SvelteKit's client router attaches falls through to a native full-page navigation, which
// runs the target route's load server-side (invisible to page.route()) instead of client-side. The
// favorite star's onclick has no native fallback, so a pre-hydration click is silently lost rather
// than queued — retrying via toPass() until the glyph actually flips is a real hydration proof, not
// a guess dressed up as a wait.
async function proveHydrated(page: Page) {
	const star = page.getByRole("listitem").filter({ hasText: "Hampshire" }).getByRole("button", { name: "favorite" });
	await expect(async () => {
		await star.click();
		await expect(star).toHaveText("★");
	}).toPass({ timeout: 10_000 });
}

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

const MILK_DISH: MenuItem = {
	dishName: "Milk Pancakes",
	category: "Breakfast Entrees",
	mealPeriod: "breakfast",
	hallTid: HAMPSHIRE_TID,
	date: DATE,
	nutrition: NUTRITION,
	allergens: ["Milk"],
	dietTags: ["Vegetarian"],
};

async function gotoHampshireMenu(page: Page) {
	await page.goto("/");
	await proveHydrated(page);
	await page
		.getByRole("listitem")
		.filter({ hasText: "Hampshire" })
		.getByRole("link", { name: "Hampshire" })
		.click();
}

test("home favorite star exposes aria-pressed, not just its glyph", async ({ page }) => {
	await page.goto("/");
	const star = page.getByRole("listitem").filter({ hasText: "Hampshire" }).getByRole("button", { name: "favorite" });

	await expect(star).toHaveAttribute("aria-pressed", "false");
	await expect(async () => {
		await star.click();
		await expect(star).toHaveAttribute("aria-pressed", "true");
	}).toPass({ timeout: 10_000 });
	await expect(star).toHaveText("★");

	await star.click();
	await expect(star).toHaveAttribute("aria-pressed", "false");
	await expect(star).toHaveText("☆");
});

test("dish favorite star exposes aria-pressed", async ({ page }) => {
	await page.route("**/api/menu**", (route) => route.fulfill({ json: [MILK_DISH] }));
	await gotoHampshireMenu(page);

	const dishRow = page.getByRole("listitem").filter({ hasText: "Milk Pancakes" });
	const dishStar = dishRow.getByRole("button", { name: "favorite" });
	await expect(dishStar).toHaveAttribute("aria-pressed", "false");

	await dishStar.click();
	await expect(dishStar).toHaveAttribute("aria-pressed", "true");
	await expect(dishStar).toHaveText("★");
});

test("filters hiding every dish say so, instead of rendering a title over nothing", async ({ page }) => {
	await page.addInitScript(() => {
		localStorage.setItem(
			"udine-food-preferences",
			JSON.stringify({ allergensToAvoid: ["Milk"], requiredDietTags: [] }),
		);
	});
	let menuRequests = 0;
	await page.route("**/api/menu**", (route) => {
		menuRequests++;
		return route.fulfill({ json: [MILK_DISH] });
	});

	await gotoHampshireMenu(page);
	await expect
		.poll(() => menuRequests, { message: "menu mock never fired — this would have hit real umassdining.com" })
		.toBeGreaterThan(0);

	await expect(page.getByText("Everything is filtered out")).toBeVisible();
	await expect(page.getByText(/All 1 dish(es)? on today.s menu conflict with your dietary filters\./)).toBeVisible();
	await expect(page.getByRole("link", { name: "Edit dietary preferences" })).toBeVisible();
	// Not silently empty: the dish itself must not render.
	await expect(page.getByRole("listitem").filter({ hasText: "Milk Pancakes" })).toHaveCount(0);
});

test("no menu posted for the day renders a real empty state with a way out", async ({ page }) => {
	let menuRequests = 0;
	await page.route("**/api/menu**", (route) => {
		menuRequests++;
		return route.fulfill({ json: [] });
	});

	await gotoHampshireMenu(page);
	await expect
		.poll(() => menuRequests, { message: "menu mock never fired — this would have hit real umassdining.com" })
		.toBeGreaterThan(0);

	await expect(page.getByText("No menu posted for today.")).toBeVisible();
	await expect(page.getByRole("link", { name: "Try another hall" })).toBeVisible();
});

test("a dish shows its full macro line, diet tags, and allergen badges", async ({ page }) => {
	await page.route("**/api/menu**", (route) => route.fulfill({ json: [MILK_DISH] }));
	await gotoHampshireMenu(page);

	const dishRow = page.getByRole("listitem").filter({ hasText: "Milk Pancakes" });
	await expect(dishRow).toContainText("200 cal");
	await expect(dishRow).toContainText("8g protein");
	await expect(dishRow).toContainText("30g carbs");
	await expect(dishRow).toContainText("2g fat");
	await expect(dishRow).toContainText("per 1 each");
	await expect(dishRow.getByText("Vegetarian")).toBeVisible();
	await expect(dishRow).toContainText("Contains");
	await expect(dishRow.getByText("Milk", { exact: true })).toBeVisible();
});

test("clearing the servings input and logging falls back to 1 serving instead of NaN", async ({ page }) => {
	await page.route("**/api/menu**", (route) => route.fulfill({ json: [MILK_DISH] }));
	await gotoHampshireMenu(page);

	const dishRow = page.getByRole("listitem").filter({ hasText: "Milk Pancakes" });
	await expect(dishRow.getByText("Servings")).toBeVisible();

	const servingsInput = dishRow.getByLabel("Servings");
	await expect(servingsInput).toHaveValue("1");
	await servingsInput.fill("");
	await dishRow.getByRole("button", { name: "Log" }).click();

	await expect(page.getByRole("status")).toHaveText("Logged 1 × Milk Pancakes");
});
