import { test, expect, type Page } from "@playwright/test";
import { parseCategoryItems } from "@udine/shared";

// Issue #193: a stale pre-deploy tab holding an older IndexedDB version blocks a newer version's
// open. Before the fix, that blocked open's promise never settled -- / and /today just sat on
// their empty state forever with no indication anything was wrong. Stubs indexedDB.open() to fire
// onblocked and never onsuccess, simulating that block without depending on the timing of a real
// second tab, and asserts both pages now surface a real error instead of hanging silently.
async function stubBlockedIndexedDbOpen(page: Page) {
	await page.addInitScript(() => {
		// @ts-expect-error -- test-only monkeypatch of a DOM global
		indexedDB.open = () => {
			const req: { onblocked?: (ev: Event) => void } = {};
			queueMicrotask(() => req.onblocked?.(new Event("blocked")));
			return req;
		};
	});
}

// Issue #322: the remaining openDb() call sites (write paths -- favorite-star toggles, log-a-dish,
// remove/undo, exports, ranking comparisons) only run AFTER a page's own onMount reads have
// already succeeded. Stubbing indexedDB.open() from page load (stubBlockedIndexedDbOpen above)
// would make those onMount reads fail first, so every page's own read-failure banner would already
// be showing before the write under test even runs -- a red that passes with or without a fix on
// the write path itself (see this PR's own review notes). Patching indexedDB.open() via
// page.evaluate() mid-session, AFTER the page has already loaded real data, isolates the write:
// only opens issued from this point on are blocked.
async function blockIndexedDbOpenFromNowOn(page: Page) {
	await page.evaluate(() => {
		// @ts-expect-error -- test-only monkeypatch of a DOM global
		indexedDB.open = () => {
			const req: { onblocked?: (ev: Event) => void } = {};
			queueMicrotask(() => req.onblocked?.(new Event("blocked")));
			return req;
		};
	});
}

test("home surfaces an error instead of hanging forever when IndexedDB open is blocked", async ({ page }) => {
	await stubBlockedIndexedDbOpen(page);
	await page.goto("/");
	await expect(page.getByRole("alert")).toContainText("Couldn't load your data");
});

test("today surfaces an error instead of hanging forever when IndexedDB open is blocked", async ({ page }) => {
	await stubBlockedIndexedDbOpen(page);
	await page.goto("/today");
	await expect(page.getByRole("alert")).toContainText("Couldn't load your data");
});

const REAL_FRAGMENT =
	`<a data-healthfulness="30" data-carbon-list="B" data-ingredient-list="FREIHOFFER&#039;S Country White Bread" ` +
	`data-allergens="Milk, Eggs, Gluten, Soy, Corn  , Wheat" data-recipe-webcode="LPR SUS VGT H3 CR2" ` +
	`data-clean-diet-str="Local, Sustainable, Vegetarian" data-serving-size="1 each" data-calories="127" ` +
	`data-calories-from-fat="26" data-total-fat="2.9g" data-total-fat-dv="4" data-sat-fat="0.5g" data-sat-fat-dv="" ` +
	`data-trans-fat="0g" data-cholesterol="50.9mg" data-cholesterol_dv="" data-sodium="237.2mg" data-sodium-dv="10" ` +
	`data-total-carb="20.4g" data-total-carb-dv="16" data-dietary-fiber="1g" data-dietary-fiber-dv="3" ` +
	`data-sugars="3.4g" data-sugars-dv="" data-protein="5.3g" data-protein-dv="9" data-dish-name="French Toast" ` +
	`href="#inline">French Toast</a>`;

const PLANTAIN_FRAGMENT =
	`<a data-healthfulness="30" data-carbon-list="A" data-ingredient-list="Sweet Plantains" ` +
	`data-allergens="Milk, Eggs, Gluten, Soy, Corn  , Sesame , Wheat" data-recipe-webcode="VGT H3 CR1" ` +
	`data-clean-diet-str="Vegetarian" data-serving-size="1 OZ" data-calories="69" data-calories-from-fat="33" ` +
	`data-total-fat="3.7g" data-total-fat-dv="5" data-sat-fat="0.7g" data-sat-fat-dv="" data-trans-fat="0g" ` +
	`data-cholesterol="0mg" data-cholesterol_dv="" data-sodium="123.2mg" data-sodium-dv="5" data-total-carb="8.9g" ` +
	`data-total-carb-dv="7" data-dietary-fiber="0.2g" data-dietary-fiber-dv="1" data-sugars="8.2g" data-sugars-dv="" ` +
	`data-protein="0.3g" data-protein-dv="0" data-dish-name="Fried Plantain" href="#inline">Fried Plantain</a>`;

const HAMPSHIRE_TID = 3;
const MENU_ITEMS = parseCategoryItems(REAL_FRAGMENT, "Breakfast Entrees", "breakfast", HAMPSHIRE_TID, "2026-08-18");
const MENU_ITEMS_2 = [
	...MENU_ITEMS,
	...parseCategoryItems(PLANTAIN_FRAGMENT, "Breakfast Entrees", "breakfast", HAMPSHIRE_TID, "2026-08-18"),
];

// Same hydration pitfall as vertical-slice.spec.ts/today.spec.ts: a click before SvelteKit's
// client router attaches falls through to a full navigation.
async function proveHydrated(page: Page) {
	const star = page.getByRole("button", { name: "favorite" }).first();
	await expect(async () => {
		await star.click();
		await expect(star).toHaveText("★");
	}).toPass({ timeout: 15_000 });
	// Undo the click above -- it's only here to prove hydration, not to leave a real favorite behind.
	await star.click();
	await expect(star).toHaveText("☆");
}

test("toggling a favorite hall on / surfaces an error, not a silent no-op, when IndexedDB is blocked mid-session", async ({
	page,
}) => {
	await page.goto("/");
	await proveHydrated(page);
	await expect(page.getByRole("alert")).toHaveCount(0);

	await blockIndexedDbOpenFromNowOn(page);
	const star = page.getByRole("button", { name: "favorite" }).first();
	await star.click();

	await expect(page.getByRole("alert")).toContainText("Couldn't load your data");
	// The write never went through -- the star must not flip to "favorited".
	await expect(star).toHaveText("☆");
});

test("removing a logged entry on /today surfaces an error, not a silent no-op, when IndexedDB is blocked mid-session", async ({
	page,
}) => {
	await page.route("**/api/menu**", (route) => route.fulfill({ json: MENU_ITEMS }));

	await page.goto("/");
	await proveHydrated(page);
	await page.getByRole("listitem").filter({ hasText: "Hampshire" }).getByRole("link", { name: "Hampshire" }).click();
	await page.getByRole("listitem").filter({ hasText: "French Toast" }).getByRole("button", { name: "Log" }).click();
	await expect(page.getByRole("status")).toHaveText("Logged 1 × French Toast");

	await page.getByRole("link", { name: "Dining Halls" }).click();
	await page.getByRole("link", { name: "Today's macros" }).click();

	const entryRow = page.getByRole("listitem").filter({ hasText: "French Toast" });
	await expect(entryRow).toBeVisible();
	await expect(page.getByRole("alert")).toHaveCount(0);

	await blockIndexedDbOpenFromNowOn(page);
	await entryRow.getByRole("button", { name: "Remove" }).click();

	await expect(page.getByRole("alert")).toContainText("Couldn't load your data");
	// The removal never went through -- the entry must still be there, and no undo toast.
	await expect(entryRow).toBeVisible();
	await expect(page.getByRole("status").filter({ hasText: "Removed" })).toHaveCount(0);
});

test("Export JSON on /today surfaces an error, not a silent no-op, when IndexedDB is blocked mid-session", async ({
	page,
}) => {
	await page.goto("/today");
	await expect(page.getByText("Nothing logged yet.")).toBeVisible();
	await expect(page.getByRole("alert")).toHaveCount(0);

	await blockIndexedDbOpenFromNowOn(page);
	await page.getByRole("button", { name: "Export JSON (all history)" }).click();

	await expect(page.getByRole("alert")).toContainText("Couldn't load your data");
});

test("comparing dishes on /rank surfaces an error, not a false 'Recorded', when IndexedDB is blocked mid-session", async ({
	page,
}) => {
	await page.route("**/api/menu**", (route) => route.fulfill({ json: MENU_ITEMS_2 }));

	await page.goto("/");
	await proveHydrated(page);
	await page.getByRole("listitem").filter({ hasText: "Hampshire" }).getByRole("link", { name: "Hampshire" }).click();
	await page.getByRole("listitem").filter({ hasText: "French Toast" }).getByRole("button", { name: "Log" }).click();
	await expect(page.getByRole("status")).toHaveText("Logged 1 × French Toast");
	await page.getByRole("listitem").filter({ hasText: "Fried Plantain" }).getByRole("button", { name: "Log" }).click();
	await expect(page.getByRole("status")).toHaveText("Logged 1 × Fried Plantain");

	await page.getByRole("link", { name: "Dining Halls" }).click();
	await page.getByRole("link", { name: "Rank dishes" }).click();
	await expect(page.getByRole("heading", { name: "Which did you like more?" })).toBeVisible();
	await expect(page.getByRole("alert")).toHaveCount(0);

	await blockIndexedDbOpenFromNowOn(page);
	await page.getByRole("button", { name: /French Toast/ }).click();

	await expect(page.getByRole("alert")).toContainText("Couldn't save your comparison");
	// The comparison never persisted -- must not claim it was recorded.
	await expect(page.getByText(/^Recorded:/)).toHaveCount(0);
});

test("removing a favorite dish on /favorites surfaces an error, not a silent no-op, when IndexedDB is blocked mid-session", async ({
	page,
}) => {
	await page.route("**/api/menu**", (route) => route.fulfill({ json: MENU_ITEMS }));

	await page.goto("/");
	await proveHydrated(page);
	await page.getByRole("listitem").filter({ hasText: "Hampshire" }).getByRole("link", { name: "Hampshire" }).click();
	const dishRow = page.getByRole("listitem").filter({ hasText: "French Toast" });
	await dishRow.getByRole("button", { name: "favorite" }).click();
	await expect(dishRow.getByRole("button", { name: "favorite" })).toHaveText("★");

	await page.getByRole("link", { name: "Favorites" }).click();
	const favoriteRow = page.getByRole("listitem").filter({ hasText: "French Toast" });
	await expect(favoriteRow).toBeVisible();
	await expect(page.getByRole("alert")).toHaveCount(0);

	await blockIndexedDbOpenFromNowOn(page);
	await favoriteRow.getByRole("button", { name: "Remove" }).click();

	await expect(page.getByRole("alert")).toContainText("Couldn't load your favorites");
	await expect(favoriteRow).toBeVisible();
});

test("logging a dish on /halls/[slug] surfaces an error, not a silent no-op, when IndexedDB is blocked mid-session", async ({
	page,
}) => {
	await page.route("**/api/menu**", (route) => route.fulfill({ json: MENU_ITEMS }));

	await page.goto("/");
	await proveHydrated(page);
	await page.getByRole("listitem").filter({ hasText: "Hampshire" }).getByRole("link", { name: "Hampshire" }).click();
	const dishRow = page.getByRole("listitem").filter({ hasText: "French Toast" });
	await expect(dishRow).toBeVisible();
	await expect(page.getByRole("alert")).toHaveCount(0);

	await blockIndexedDbOpenFromNowOn(page);
	await dishRow.getByRole("button", { name: "Log" }).click();

	await expect(page.getByRole("alert")).toContainText("Couldn't save");
	await expect(page.getByRole("status")).toHaveCount(0);
});
