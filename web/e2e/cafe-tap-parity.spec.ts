import { test, expect, type Page } from "@playwright/test";
import type { DiningHoursFeed, MenuItem, NutritionFacts, RetailLocationHours } from "@udine/shared";

// #178: café-tap parity -- probe-at-tap menus (existing hall-menu route parameterized by tid, with
// price), café detail/fallback view (sanitized standing menu, never presented as today's), and
// inline PDF rendering. Runtime model per #177's owner correction (binding here too): TWO states
// only, decided by fetchMenu(locationId, today) coming back non-empty or empty -- no third "menu
// but no nutrition" tier.
//
// /api/hours and /api/menu are both same-origin server routes (see web/src/routes/api/*), mockable
// via page.route() -- but ONLY once the fetch is a real browser request. Home's own café listing is
// deliberately fetched client-side in onMount (see +page.svelte's comment) rather than a `load`, and
// /cafes/[tid] is deliberately reached via a client-side link click below rather than page.goto()
// straight to the URL -- a literal goto() would run that route's `load` server-side, where
// SvelteKit inlines same-origin fetches in-process, invisible to page.route() (same caveat
// halls-menu.spec.ts documents for /halls/[slug]'s own `load`).
async function gotoCafe(page: Page, tid: number, cafeName: string) {
	await page.goto("/");
	const link = page.getByRole("link", { name: cafeName });
	await expect(link).toBeVisible();
	await link.click();
	await expect(page).toHaveURL(`/cafes/${tid}`);
}

const NUTRITION: NutritionFacts = {
	servingSize: "1 each",
	calories: 180,
	caloriesFromFat: 30,
	totalFatG: 3,
	satFatG: 1,
	transFatG: 0,
	cholesterolMg: 0,
	sodiumMg: 90,
	totalCarbG: 22,
	dietaryFiberG: 1,
	sugarsG: 4,
	proteinG: 6,
};

const CAFE_TID = 501;

const MENU_CAFE: RetailLocationHours = {
	name: "Test Café",
	hours: { openTime: "07:00 AM", closeTime: "06:00 PM" },
	locationId: CAFE_TID,
	breakfastMenu: null,
	lunchMenu: null,
	dinnerMenu: null,
};

const PRICED_DISH: MenuItem = {
	dishName: "Iced Latte",
	category: "Drinks",
	mealPeriod: "allday",
	hallTid: CAFE_TID,
	date: "2026-08-24",
	nutrition: NUTRITION,
	allergens: ["Milk"],
	dietTags: [],
	price: "$4.50",
};

const EMPTY_CAFE_TID = 502;

const FALLBACK_CAFE: RetailLocationHours = {
	name: "Empty Café",
	hours: { openTime: "07:00 AM", closeTime: "02:00 PM" },
	locationId: EMPTY_CAFE_TID,
	breakfastMenu: "<p>Bacon Croissant $3.50</p><p>Plain Bagel</p>",
	lunchMenu: null,
	dinnerMenu: null,
	description: "<p>A cozy campus café.</p>",
	address: "<p>1 Campus Center Way</p>",
	mapAddress: "42.3915402,-72.5292962",
	acceptedPayment: "Cash, Credit Cards, UCard",
};

const PDF_CAFE_TID = 503;

const PDF_CAFE: RetailLocationHours = {
	name: "PDF Café",
	hours: null,
	locationId: PDF_CAFE_TID,
	breakfastMenu:
		'<p><a href="https://umassdining.com/sites/default/files/2025-08/Test%20Menu.pdf" target="_blank">Test Café Menu</a></p>',
	lunchMenu: null,
	dinnerMenu: null,
};

const NOTHING_CAFE_TID = 504;

const NOTHING_CAFE: RetailLocationHours = {
	name: "Nothing Café",
	hours: null,
	locationId: NOTHING_CAFE_TID,
	breakfastMenu: null,
	lunchMenu: null,
	dinnerMenu: null,
};

async function mockHours(page: Page, retail: RetailLocationHours[]) {
	const feed: DiningHoursFeed = { halls: [], retail };
	await page.route("**/api/hours**", (route) => route.fulfill({ json: feed }));
}

async function mockMenu(page: Page, byTid: Record<number, MenuItem[]>) {
	await page.route("**/api/menu**", (route) => {
		const tid = Number(new URL(route.request().url()).searchParams.get("tid"));
		route.fulfill({ json: byTid[tid] ?? [] });
	});
}

test("home lists cafés/markets and links each one through to its own café page", async ({ page }) => {
	await mockHours(page, [MENU_CAFE]);
	await page.goto("/");

	const link = page.getByRole("link", { name: "Test Café" });
	await expect(link).toBeVisible();
	await expect(link).toHaveAttribute("href", `/cafes/${CAFE_TID}`);
});

test("a café with a non-empty probe renders the ordinary menu screen with a price chip", async ({ page }) => {
	await mockHours(page, [MENU_CAFE]);
	await mockMenu(page, { [CAFE_TID]: [PRICED_DISH] });

	await gotoCafe(page, CAFE_TID, "Test Café");

	await expect(page.getByRole("heading", { name: "Test Café" })).toBeVisible();
	const dishRow = page.getByRole("listitem").filter({ hasText: "Iced Latte" });
	await expect(dishRow).toContainText("$4.50");
	await expect(dishRow).toContainText("180 cal");
	// Fallback sheet must NOT render alongside a real menu.
	await expect(page.getByTestId("cafe-fallback-sheet")).toHaveCount(0);

	// Logging a priced café dish still works, same as a hall dish.
	await dishRow.getByRole("button", { name: "Log" }).click();
	await expect(page.getByRole("status")).toHaveText("Logged 1 × Iced Latte");
});

// #223: café menus were rendering with a hardcoded, empty FoodPreferences instead of the user's
// real saved filters (halls-menu.spec.ts's "everything is filtered out" case, mirrored here) --
// an allergen dish showed up completely unfiltered on a café menu with no indication anything was
// different from a hall.
test("dietary filters hiding every café dish say so, instead of rendering the dish unfiltered", async ({ page }) => {
	await page.addInitScript(() => {
		localStorage.setItem(
			"udine-food-preferences",
			JSON.stringify({ allergensToAvoid: ["Milk"], requiredDietTags: [] }),
		);
	});
	await mockHours(page, [MENU_CAFE]);
	await mockMenu(page, { [CAFE_TID]: [PRICED_DISH] });

	await gotoCafe(page, CAFE_TID, "Test Café");

	await expect(page.getByText("Everything is filtered out")).toBeVisible();
	await expect(page.getByText(/All 1 dish(es)? on today.s menu conflict with your dietary filters\./)).toBeVisible();
	await expect(page.getByRole("link", { name: "Edit dietary preferences" })).toBeVisible();
	// Not silently unfiltered: the allergen dish itself must not render.
	await expect(page.getByRole("listitem").filter({ hasText: "Iced Latte" })).toHaveCount(0);
});

test("a café with an empty probe renders the fallback sheet with the standing menu, labeled and never as today's", async ({
	page,
}) => {
	await mockHours(page, [FALLBACK_CAFE]);
	await mockMenu(page, { [EMPTY_CAFE_TID]: [] });

	await gotoCafe(page, EMPTY_CAFE_TID, "Empty Café");

	const sheet = page.getByTestId("cafe-fallback-sheet");
	await expect(sheet).toBeVisible();
	// Exact caveat copy per #177/#178's styling spec -- must never read as today's menu.
	await expect(sheet).toContainText("today's menu isn't posted yet — standing menu from umassdining.com");
	await expect(sheet).toContainText("Bacon Croissant");
	await expect(sheet).toContainText("$3.50");
	await expect(sheet).toContainText("Plain Bagel");
	await expect(sheet).toContainText("A cozy campus café.");
	await expect(sheet).toContainText("Cash, Credit Cards, UCard");
	await expect(page.getByRole("link", { name: /DIRECTIONS/ })).toHaveAttribute(
		"href",
		/maps\.google\.com|google\.com\/maps/,
	);
});

test("a café with nothing at all renders the fallback sheet minus the menu section", async ({ page }) => {
	await mockHours(page, [NOTHING_CAFE]);
	await mockMenu(page, { [NOTHING_CAFE_TID]: [] });

	await gotoCafe(page, NOTHING_CAFE_TID, "Nothing Café");

	const sheet = page.getByTestId("cafe-fallback-sheet");
	await expect(sheet).toBeVisible();
	await expect(sheet).not.toContainText("standing menu from umassdining.com");
});

test("a PDF-only standing menu opens inline, in-app -- no new tab, no navigation away", async ({ page, context }) => {
	await mockHours(page, [PDF_CAFE]);
	await mockMenu(page, { [PDF_CAFE_TID]: [] });

	await gotoCafe(page, PDF_CAFE_TID, "PDF Café");
	await expect(page.getByTestId("cafe-fallback-sheet")).toContainText("today's menu isn't posted yet");

	const pagesBefore = context.pages().length;
	await page.getByRole("button", { name: /View Test Café Menu/ }).click();

	// The PRIMARY viewing path is inline, same tab -- never a new tab/window just to look at the PDF.
	expect(context.pages().length).toBe(pagesBefore);
	await expect(page.getByText("Rendered in-app")).toBeVisible();
	const viewer = page.locator('object[type="application/pdf"]');
	await expect(viewer).toHaveAttribute(
		"data",
		"https://umassdining.com/sites/default/files/2025-08/Test%20Menu.pdf",
	);

	// #178 pr-review: SAVE's `download` attribute is only honored same-origin, and this PDF is
	// cross-origin (umassdining.com) -- a bare same-tab `<a download>` there silently falls back to
	// a normal navigation, which would replace this whole app in the current tab (exactly the
	// "bounce to an external viewer" #177 forbids, just same-tab instead of new-tab). SAVE opens in
	// a NEW tab instead: the app in THIS tab must never be unloaded/navigated away by it.
	const appUrlBeforeSave = page.url();
	const [newPage] = await Promise.all([context.waitForEvent("page"), page.getByRole("link", { name: "SAVE" }).click()]);
	expect(page.url()).toBe(appUrlBeforeSave); // this tab never navigated away
	expect(newPage.url()).toContain("Test%20Menu.pdf");
	await newPage.close();
});
