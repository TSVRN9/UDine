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
	// The servings-seed effect (needed for Finding 2, #76 review) must not fight a user actively
	// clearing the field back to "1" out from under them.
	await expect(servingsInput).toHaveValue("");
	await dishRow.getByRole("button", { name: "Log" }).click();

	await expect(page.getByRole("status")).toHaveText("Logged 1 × Milk Pancakes");
});

// --- #72: browse upcoming days' menus ---------------------------------------------------------
//
// Real wall-clock "today" — but computed inside the *browser* (page.evaluate), not the Node host
// process. The app derives its own "today" from the browser's local calendar day (todayIso(),
// web/src/lib/date.ts), which playwright.config.ts pins to America/New_York via `timezoneId`
// (issue #124). Nothing pins the host process's timezone, so a host-side `new Date()` can
// silently disagree with the browser's for part of every day (20:00-23:59 Eastern, while the host
// machine/CI runner is on its own default TZ) — computing it in-browser instead means there's
// only one clock in play, and it's the same one the app itself reads. Deliberately not
// page.clock-frozen: the rest of this file, and every other e2e spec in this app, already relies
// on a real-time clock, so introducing a fake one here would just make this file behave
// differently from its neighbors for no real gain.
async function browserLocalDates(page: Page): Promise<{ today: string; tomorrow: string; dayAfter: string }> {
	return page.evaluate(() => {
		const pad = (n: number) => String(n).padStart(2, "0");
		const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
		const now = new Date();
		const plusDays = (days: number) => {
			const d = new Date(now);
			d.setDate(d.getDate() + days);
			return iso(d);
		};
		return { today: iso(now), tomorrow: plusDays(1), dayAfter: plusDays(2) };
	});
}

function upcomingDishes(dates: { today: string; tomorrow: string; dayAfter: string }) {
	return {
		today: { ...MILK_DISH, dishName: "Today Pancakes", date: dates.today } satisfies MenuItem,
		tomorrow: { ...MILK_DISH, dishName: "Tomorrow Waffles", date: dates.tomorrow } satisfies MenuItem,
		dayAfter: { ...MILK_DISH, dishName: "Day-After Bagels", date: dates.dayAfter } satisfies MenuItem,
	};
}

// Mocks /api/menu per requested `date`, so today vs. tomorrow are provably different payloads
// rather than the same fixture replayed regardless of what the UI asked for.
async function mockMenuByDate(page: Page, byDate: Record<string, MenuItem[]>) {
	await page.route("**/api/menu**", (route) => {
		const date = new URL(route.request().url()).searchParams.get("date");
		route.fulfill({ json: (date && byDate[date]) ?? [] });
	});
}

test("prev is disabled at today; next advances to a real, distinct day", async ({ page }) => {
	const dates = await browserLocalDates(page);
	const dishes = upcomingDishes(dates);
	await mockMenuByDate(page, { [dates.today]: [dishes.today], [dates.tomorrow]: [dishes.tomorrow] });
	await gotoHampshireMenu(page);

	await expect(page.getByRole("listitem").filter({ hasText: "Today Pancakes" })).toBeVisible();
	await expect(page.getByRole("button", { name: "‹ Prev day" })).toBeDisabled();

	await page.getByRole("button", { name: "Next day ›" }).click();

	await expect(page.getByRole("listitem").filter({ hasText: "Tomorrow Waffles" })).toBeVisible();
	await expect(page.getByRole("listitem").filter({ hasText: "Today Pancakes" })).toHaveCount(0);
	await expect(page.getByRole("button", { name: "‹ Prev day" })).toBeEnabled();
	// The servings input for the new day's dish must be seeded (not blank) -- onMount only runs
	// once per component instance, and a same-route ?date= change doesn't remount it.
	await expect(
		page.getByRole("listitem").filter({ hasText: "Tomorrow Waffles" }).getByRole("spinbutton"),
	).toHaveValue("1");

	await page.getByRole("button", { name: "‹ Prev day" }).click();

	await expect(page.getByRole("listitem").filter({ hasText: "Today Pancakes" })).toBeVisible();
	await expect(page.getByRole("button", { name: "‹ Prev day" })).toBeDisabled();
});

// A day the mock says has nothing (`[]`) stands in for "past the publish window" -- the client
// deliberately never hardcodes the ~13-day horizon (see docs/apk-reverse-engineering.md's "Future
// dates" bullet: the window "rolls" and should be discovered per-request, not assumed), so from
// the UI's perspective an unpublished tomorrow and an out-of-window +30 days look identical: not
// today, and `[]` back. Exercising it via a single Next click (rather than clicking 30 times to a
// literal +30 day target) tests the actual condition the component branches on.
test("a future day with no menu shows the publish-window empty state, not the no-menu-today copy", async ({
	page,
}) => {
	const dates = await browserLocalDates(page);
	const dishes = upcomingDishes(dates);
	await mockMenuByDate(page, { [dates.today]: [dishes.today] }); // no entry for tomorrow -> mockMenuByDate falls back to []
	await gotoHampshireMenu(page);
	await expect(page.getByRole("listitem").filter({ hasText: "Today Pancakes" })).toBeVisible();

	await page.getByRole("button", { name: "Next day ›" }).click();

	await expect(page.getByText("Menu not posted yet — UMass publishes about two weeks ahead.")).toBeVisible();
	await expect(page.getByText("No menu posted for today.")).toHaveCount(0);
	// Not today, so prev must be reachable, not stuck disabled the way it is on today's own
	// empty state.
	await expect(page.getByRole("button", { name: "‹ Prev day" })).toBeEnabled();

	// The empty state's own way back also works, and returns to real content.
	await page.getByRole("button", { name: "Back to today" }).click();
	await expect(page.getByRole("listitem").filter({ hasText: "Today Pancakes" })).toBeVisible();
});

// SvelteKit's SSR "inlines" a `load` function's same-origin fetch server-side, invisible to
// page.route() (see vertical-slice.spec.ts's comment on this) -- so a literal page.goto() straight
// to a ?date=... URL can't be mocked here, only client-side navigation can. Browser back/forward
// on an app-pushed history entry stays client-side (no full reload), which is exactly the
// "shareable, back-button friendly" URL-state contract the issue asks for -- proven here via
// goBack()/goForward() rather than a second goto(). Bookmarking/typing a real deep-link URL is
// covered separately by the mandatory live-API verification step (see the issue's AC and the PR
// description), since that's real navigation and can only be checked against the real API.
test("?date= URL state round-trips through browser back/forward, across multiple hops", async ({ page }) => {
	const dates = await browserLocalDates(page);
	const dishes = upcomingDishes(dates);
	await mockMenuByDate(page, {
		[dates.today]: [dishes.today],
		[dates.tomorrow]: [dishes.tomorrow],
		[dates.dayAfter]: [dishes.dayAfter],
	});
	await gotoHampshireMenu(page);

	await page.getByRole("button", { name: "Next day ›" }).click();
	await expect(page.getByRole("listitem").filter({ hasText: "Tomorrow Waffles" })).toBeVisible();
	expect(new URL(page.url()).searchParams.get("date")).toBe(dates.tomorrow);

	// A second consecutive hop, from an already-?date=-parameterized URL -- proves the Next button
	// advances relative to the *browsed* day (data.date), not always relative to today.
	await page.getByRole("button", { name: "Next day ›" }).click();
	await expect(page.getByRole("listitem").filter({ hasText: "Day-After Bagels" })).toBeVisible();
	expect(new URL(page.url()).searchParams.get("date")).toBe(dates.dayAfter);

	await page.goBack();
	await expect(page.getByRole("listitem").filter({ hasText: "Tomorrow Waffles" })).toBeVisible();

	await page.goBack();
	await expect(page.getByRole("listitem").filter({ hasText: "Today Pancakes" })).toBeVisible();

	await page.goForward();
	await expect(page.getByRole("listitem").filter({ hasText: "Tomorrow Waffles" })).toBeVisible();

	await page.goForward();
	await expect(page.getByRole("listitem").filter({ hasText: "Day-After Bagels" })).toBeVisible();
	expect(new URL(page.url()).searchParams.get("date")).toBe(dates.dayAfter);
});

test("logging from a future day's menu records at now, not the browsed future date", async ({ page }) => {
	const dates = await browserLocalDates(page);
	const dishes = upcomingDishes(dates);
	await mockMenuByDate(page, { [dates.today]: [dishes.today], [dates.tomorrow]: [dishes.tomorrow] });
	await gotoHampshireMenu(page);

	await page.getByRole("button", { name: "Next day ›" }).click();
	const dishRow = page.getByRole("listitem").filter({ hasText: "Tomorrow Waffles" });
	await expect(dishRow).toBeVisible();
	await dishRow.getByRole("button", { name: "Log" }).click();
	await expect(page.getByRole("status")).toHaveText("Logged 1 × Tomorrow Waffles");

	// /today filters IndexedDB entries by `loggedAt.startsWith(<today's iso date>)` (see
	// web/src/lib/indexedDbStorage.ts's getEntriesForDate). If logging from tomorrow's menu had
	// future-dated the entry instead of stamping it `now`, it would NOT show up here.
	await page.goto("/today");
	await expect(page.getByText("Tomorrow Waffles × 1")).toBeVisible();
});
