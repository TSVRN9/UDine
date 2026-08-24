import { test, expect, type Page } from "@playwright/test";
import { parseCategoryItems } from "@udine/shared";

// Issue #124 (web's copy of mobile's #111/PR #122): entries were stamped with
// `new Date().toISOString()` (UTC) but read back bucketed by the LOCAL calendar day, so anything
// logged between local evening and midnight filed under tomorrow and vanished from Today's list
// and macro totals until the UTC day caught up. Fixed by stamping with `nowLocalIso()` (writer) and
// reading the day prefix via `isoDateOf` (reader) -- both now @udine/shared, shared/src/date.ts /
// shared/src/macros.ts, consolidated with mobile's fix rather than a forked web-only copy.
//
// This is the web-side "writer/reader seam" coverage PR #122's review demanded for mobile
// (`nowLocalIso().slice(0, 10) === todayIso()`, mobile/src/lib/date.test.ts): web has no unit-test
// runner (only svelte-check, which is type-only, and this e2e suite -- see CLAUDE.md's CI comment),
// so the seam is asserted here at the integration level instead, driving the real writer call site
// (+page.svelte's logItem, stamps via nowLocalIso) and the real reader call site (+page.svelte /
// indexedDbStorage.ts read "today" via web/src/lib/date.ts's todayIso() + getEntriesForDate) through
// the actual UI.
//
// Verified red-first, both sides, not assumed:
//   - Writer: reverting `nowLocalIso()` (the +page.svelte stamping call) back to
//     `new Date().toISOString()` makes this test fail exactly as below (the logged entry never
//     appears, "Calories: 127" never renders) -- that's the actual bug #124 reports.
//   - Reader: reverting web/src/lib/date.ts's `todayIso()` to a UTC-derived
//     `new Date().toISOString().slice(0, 10)` -- the web-side equivalent of the "reader
//     independently drifts to UTC" risk PR #122's review flagged for mobile's todayIso() -- ALSO
//     fails this test the same way. (indexedDbStorage.ts's own `isoDateOf(e.loggedAt) === isoDate`
//     vs. its prior `e.loggedAt.startsWith(isoDate)` is logically equivalent for a valid 10-char
//     isoDate either way -- checked, doesn't independently flip this test -- that swap is a
//     consolidation/parity move onto the shared `isoDateOf` helper, mirroring mobile's identical
//     YouPane change, not a second bug fix. The actual writer/reader risk is nowLocalIso vs.
//     todayIso, exactly as it was for mobile.)
//
// The browser's clock is pinned to the exact UTC-rollover boundary via page.clock.setFixedTime
// (not page.clock.install -- that also fakes timers, which would freeze +page.svelte's own
// `setTimeout` banner-dismiss logic; setFixedTime only fakes Date/Date.now, timers keep running
// normally). playwright.config.ts's global `timezoneId: "America/New_York"` (also changed by this
// issue -- was "UTC", which dodged this exact bug, see that file's comment) makes the browser
// interpret that fixed instant as Eastern local time.
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
const MENU_ITEMS = parseCategoryItems(REAL_FRAGMENT, "Breakfast Entrees", "breakfast", HAMPSHIRE_TID, "2026-08-20");

// Same hydration pitfall as vertical-slice.spec.ts/today.spec.ts -- a click before SvelteKit's
// client router attaches falls through to a full navigation, invisible to page.route().
async function proveHydrated(page: Page) {
	const star = page.getByRole("button", { name: "favorite" }).first();
	await expect(async () => {
		await star.click();
		await expect(star).toHaveText("★");
	}).toPass({ timeout: 15_000 });
}

test("logs an evening entry under today's LOCAL calendar day, not the UTC-rolled-over day (issue #124)", async ({
	page,
}) => {
	await page.route("**/api/menu**", (route) => route.fulfill({ json: MENU_ITEMS }));

	// 11:30 PM Eastern on Aug 20 == 3:30 AM UTC on Aug 21 -- the exact boundary #111/#124 broke on.
	await page.clock.setFixedTime(new Date("2026-08-21T03:30:00.000Z"));

	await page.goto("/");
	await proveHydrated(page);

	const hampshireRow = page.getByRole("listitem").filter({ hasText: "Hampshire" });
	await hampshireRow.getByRole("link", { name: "Hampshire" }).click();

	const dishRow = page.getByRole("listitem").filter({ hasText: "French Toast" });
	await expect(dishRow).toBeVisible();
	await dishRow.getByRole("button", { name: "Log" }).click();
	await expect(page.getByRole("status")).toHaveText("Logged 1 × French Toast");

	// The home dashboard reads today's totals from the same IndexedDB log the entry was just
	// written to (#64) -- this is the writer (logItem) and reader (getEntriesForDate) meeting at
	// the same instant. Under the pre-fix UTC stamping, "today" (Eastern) is still Aug 20, but the
	// entry's UTC-derived prefix would read Aug 21 -- filtered out, "Calories: 0".
	await page.getByRole("link", { name: "Dining Halls" }).click();
	await expect(page.getByText("Calories: 127")).toBeVisible();

	await page.getByRole("link", { name: "Today's macros" }).click();
	await expect(page.getByRole("heading", { name: /^Today/ })).toBeVisible();
	await expect(page.getByText("Calories: 127")).toBeVisible();
	await expect(page.getByText("French Toast × 1")).toBeVisible();
});
