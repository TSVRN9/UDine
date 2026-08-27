import { test, expect, type Page } from "@playwright/test";

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
