import { test, expect } from "@playwright/test";
import { dismissFirstRun, isFirstRunDismissed } from "../src/lib/firstRun";

// Coverage for #68 (part of epic #63): the anonymous-first value prop, surfaced once on first
// visit to the home dashboard (`/`, see #64) as a dismissible card -- not an interstitial, never a
// server call. Two layers:
//
//   1. Pure flag logic (isFirstRunDismissed/dismissFirstRun) -- web has no vitest/unit runner
//      (svelte-check only, see package.json), so per the issue's red-green-TDD policy this pure
//      logic is tested here instead, as plain Node-context tests that never touch the `page`
//      fixture -- no browser needed for a localStorage-shaped get/set.
//   2. Render + dismiss + stays-dismissed-across-reload, as real browser/e2e tests below.

test.describe("firstRun flag logic (no browser -- plain localStorage shim)", () => {
	// Playwright test files run under Node; localStorage isn't a global there. A two-method shim is
	// all the module needs (see src/lib/firstRun.ts's own use of just get/setItem) -- not worth a dep.
	function installLocalStorageShim() {
		const store = new Map<string, string>();
		(globalThis as { localStorage?: Storage }).localStorage = {
			getItem: (key: string) => store.get(key) ?? null,
			setItem: (key: string, value: string) => void store.set(key, value),
			removeItem: (key: string) => void store.delete(key),
			clear: () => store.clear(),
			key: () => null,
			get length() {
				return store.size;
			},
		} as Storage;
	}

	test.beforeEach(() => {
		installLocalStorageShim();
	});

	test("is not dismissed before anything writes the flag", () => {
		expect(isFirstRunDismissed()).toBe(false);
	});

	test("dismissFirstRun persists the flag so isFirstRunDismissed reflects it", () => {
		expect(isFirstRunDismissed()).toBe(false);
		dismissFirstRun();
		expect(isFirstRunDismissed()).toBe(true);
	});
});

test.describe("first-run card on the home dashboard", () => {
	test("shows once on a fresh visit, states device-only data + export path + what sign-in adds, and makes zero server calls", async ({
		page,
	}) => {
		let apiRequests = 0;
		await page.route("**/api/**", (route) => {
			apiRequests++;
			return route.continue();
		});

		await page.goto("/");

		const card = page.getByTestId("first-run-card");
		await expect(card).toBeVisible();
		await expect(card).toContainText("never leaves this device");
		await expect(card).toContainText("Export");
		await expect(card).toContainText("friends");
		await expect(card).toContainText("pings");
		await expect(card).toContainText("cross-device favorites");
		await expect(card).toContainText("push");

		await page.waitForTimeout(500);
		expect(apiRequests).toBe(0);
	});

	test("dismissing the card hides it and it stays dismissed across a reload", async ({ page }) => {
		await page.goto("/");

		const card = page.getByTestId("first-run-card");
		await expect(card).toBeVisible();

		// Hydration guard: a click before Svelte's client router/handlers attach is silently lost (no
		// native fallback on a plain <button>), same reasoning as the favorite-star retries elsewhere
		// in this suite (e.g. e2e/home-dashboard.spec.ts's proveHydrated).
		await expect(async () => {
			await page.getByRole("button", { name: "Dismiss welcome message" }).click();
			await expect(card).toHaveCount(0);
		}).toPass({ timeout: 10_000 });

		await page.reload();
		await expect(page.getByTestId("first-run-card")).toHaveCount(0);
	});

	test("a second-ever visit (fresh page, same storage) never shows the card again", async ({ page }) => {
		await page.goto("/");
		await expect(async () => {
			await page.getByRole("button", { name: "Dismiss welcome message" }).click();
			await expect(page.getByTestId("first-run-card")).toHaveCount(0);
		}).toPass({ timeout: 10_000 });

		await page.goto("/today");
		await page.goto("/");
		await expect(page.getByTestId("first-run-card")).toHaveCount(0);
	});
});
