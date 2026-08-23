import { test, expect, type Page } from "@playwright/test";
import { parseCategoryItems } from "@udine/shared";

// Coverage for #37 (styled Today/macros view, PR #49) that vertical-slice.spec.ts and
// rank.spec.ts don't already exercise: the four-up stat panel's per-macro "% of calories" share,
// chronological ordering of logged entries (getEntriesForDate returns IndexedDB's own key order,
// not insertion/time order -- see the PR body), Remove + Undo, and that the Export JSON/CSV
// buttons actually produce a download of the real log, not just render.

// Same hydration pitfall as vertical-slice.spec.ts/rank.spec.ts: a click before SvelteKit's
// client router attaches falls through to a full navigation, which resolves /api/menu
// server-side (invisible to page.route()) instead of via the mocked browser fetch. Copied here
// rather than imported so this file has no dependency on shell.spec.ts's internals.
async function proveHydrated(page: Page) {
	const star = page.getByRole("button", { name: "favorite" }).first();
	await expect(async () => {
		await star.click();
		await expect(star).toHaveText("★");
	}).toPass({ timeout: 15_000 });
}

// Same two real captured foodpro-menu-ajax fragments used in shared/src/umassDining.test.ts,
// rank.spec.ts, and vertical-slice.spec.ts (French Toast, Fried Plantain -- Hampshire/tid=3,
// breakfast) run through the real parseCategoryItems.
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

test("stat panel shows per-macro % of calories, and Remove + Undo restore the exact entry", async ({ page }) => {
	await page.route("**/api/menu**", (route) => route.fulfill({ json: MENU_ITEMS }));

	await page.goto("/");
	await proveHydrated(page);

	const hampshireRow = page.getByRole("listitem").filter({ hasText: "Hampshire" });
	await hampshireRow.getByRole("link", { name: "Hampshire" }).click();
	await page.getByRole("listitem").filter({ hasText: "French Toast" }).getByRole("button", { name: "Log" }).click();
	await expect(page.getByRole("status")).toHaveText("Logged 1 × French Toast");

	await page.getByRole("link", { name: "Dining Halls" }).click();
	await page.getByRole("link", { name: "Today's macros" }).click();

	// French Toast's real macros (4/4/9 kcal per gram): protein 5.3g -> 21.2kcal, carbs 20.4g ->
	// 81.6kcal, fat 2.9g -> 26.1kcal, of a 129.9kcal macro-derived total -- 16% / 63% / 20% rounded.
	// These are UMass's own published numbers, not invented by the test.
	await expect(page.getByText("from 1 entry")).toBeVisible();
	await expect(page.getByText("16% of calories")).toBeVisible();
	await expect(page.getByText("63% of calories")).toBeVisible();
	await expect(page.getByText("20% of calories")).toBeVisible();

	const entryRow = page.getByRole("listitem").filter({ hasText: "French Toast" });
	await expect(entryRow).toContainText("127 cal");
	await expect(entryRow).toContainText("5.3g protein");
	await expect(entryRow).toContainText(/logged \d{1,2}:\d{2}/);

	await entryRow.getByRole("button", { name: "Remove" }).click();

	// Removed: back to the empty state, not just a shorter list.
	await expect(page.getByText("Nothing logged yet.")).toBeVisible();
	await expect(page.getByText("from 0 entries")).toBeVisible();

	const undoToast = page.getByRole("status").filter({ hasText: "Removed French Toast" });
	await expect(undoToast).toBeVisible();
	await undoToast.getByRole("button", { name: "Undo" }).click();

	// Undo restores the exact entry (same id/macros), not a reconstruction -- totals and the row
	// are back exactly as before, and the empty state is gone.
	await expect(page.getByText("Nothing logged yet.")).not.toBeVisible();
	await expect(page.getByText("from 1 entry")).toBeVisible();
	await expect(page.getByRole("listitem").filter({ hasText: "French Toast" })).toContainText("127 cal");
});

test("logged entries render chronologically, not in IndexedDB's own key order", async ({ page }) => {
	// getEntriesForDate (web/src/lib/indexedDbStorage.ts) returns entries via IndexedDB's
	// getAll(), which enumerates by primary key (the entry's `id`, a UUID string) -- unrelated to
	// loggedAt. Seeding directly with an id ordering that's the *reverse* of the loggedAt ordering
	// means an unsorted read is guaranteed to come back in the wrong order, so this fails
	// reliably if the .sort() in +page.svelte's refresh() is ever removed -- logging two dishes
	// through the UI wouldn't reliably catch that, since real UUIDs sort essentially at random
	// relative to insertion order.
	await page.goto("/today");
	await expect(page.getByText("Nothing logged yet.")).toBeVisible();

	await page.evaluate(async () => {
		// Local date components (not .toISOString(), which is UTC) -- matches todayIso() (the
		// reader, web/src/lib/date.ts) and nowLocalIso() (the real writer, @udine/shared), both of
		// which derive from the browser's local calendar day. playwright.config.ts pins that day to
		// America/New_York (issue #124); a UTC-derived "today" here would disagree with it for 4
		// hours a day (20:00-23:59 Eastern) and file these seeded entries under the wrong day.
		const now = new Date();
		const pad = (n: number) => String(n).padStart(2, "0");
		const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
		const db = await new Promise<IDBDatabase>((resolve, reject) => {
			const req = indexedDB.open("udine", 4);
			req.onsuccess = () => resolve(req.result);
			req.onerror = () => reject(req.error);
		});
		const nutrition = {
			servingSize: "1 each",
			calories: 100,
			caloriesFromFat: 0,
			totalFatG: 0,
			satFatG: 0,
			transFatG: 0,
			cholesterolMg: 0,
			sodiumMg: 0,
			totalCarbG: 0,
			dietaryFiberG: 0,
			sugarsG: 0,
			proteinG: 0,
		};
		const entries = [
			// Logged first (earlier loggedAt), but an id that sorts AFTER the later entry's id --
			// an unsorted getAll() would put this one second.
			{
				id: "zzz-logged-first",
				// No trailing "Z" -- matches nowLocalIso()'s bare local-time shape (the real writer),
				// so `new Date(loggedAt)` parses this as local time, same as a real logged entry would.
				loggedAt: `${today}T08:00:00.000`,
				source: { type: "umass-menu", dishName: "Early Dish", hallTid: 3 },
				servings: 1,
				nutrition,
			},
			// Logged second (later loggedAt), id sorts first.
			{
				id: "aaa-logged-second",
				loggedAt: `${today}T09:00:00.000`,
				source: { type: "umass-menu", dishName: "Late Dish", hallTid: 3 },
				servings: 1,
				nutrition,
			},
		];
		const tx = db.transaction("logEntries", "readwrite");
		for (const entry of entries) tx.objectStore("logEntries").put(entry);
		await new Promise<void>((resolve, reject) => {
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
		});
	});

	await page.reload();

	const rows = page.locator("li").filter({ hasText: /Dish × 1/ });
	await expect(rows).toHaveCount(2);
	await expect(rows.nth(0)).toContainText("Early Dish");
	await expect(rows.nth(1)).toContainText("Late Dish");
	await expect(page.getByText("Calories: 200")).toBeVisible();
	await expect(page.getByText("from 2 entries")).toBeVisible();
});

test("Export JSON and Export CSV download the full log, not just today's entries", async ({ page }) => {
	await page.route("**/api/menu**", (route) => route.fulfill({ json: MENU_ITEMS }));

	await page.goto("/");
	await proveHydrated(page);
	await page.getByRole("listitem").filter({ hasText: "Hampshire" }).getByRole("link", { name: "Hampshire" }).click();
	await page.getByRole("listitem").filter({ hasText: "French Toast" }).getByRole("button", { name: "Log" }).click();
	await expect(page.getByRole("status")).toHaveText("Logged 1 × French Toast");

	await page.getByRole("link", { name: "Dining Halls" }).click();
	await page.getByRole("link", { name: "Today's macros" }).click();

	// Buttons are clearly visible/accessible, not just present in the DOM (#37's export criterion).
	const exportJson = page.getByRole("button", { name: "Export JSON (all history)" });
	const exportCsv = page.getByRole("button", { name: "Export CSV (all history)" });
	await expect(exportJson).toBeVisible();
	await expect(exportCsv).toBeVisible();

	const [jsonDownload] = await Promise.all([page.waitForEvent("download"), exportJson.click()]);
	expect(jsonDownload.suggestedFilename()).toBe("udine-log.json");
	const jsonStream = await jsonDownload.createReadStream();
	const jsonChunks: Buffer[] = [];
	for await (const chunk of jsonStream) jsonChunks.push(chunk as Buffer);
	const jsonBody = JSON.parse(Buffer.concat(jsonChunks).toString("utf-8"));
	expect(jsonBody).toHaveLength(1);
	expect(jsonBody[0].source.dishName).toBe("French Toast");

	const [csvDownload] = await Promise.all([page.waitForEvent("download"), exportCsv.click()]);
	expect(csvDownload.suggestedFilename()).toBe("udine-log.csv");
	const csvStream = await csvDownload.createReadStream();
	const csvChunks: Buffer[] = [];
	for await (const chunk of csvStream) csvChunks.push(chunk as Buffer);
	const csvBody = Buffer.concat(csvChunks).toString("utf-8");
	expect(csvBody).toContain("French Toast");
});
