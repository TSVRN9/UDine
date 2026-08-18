import { defineConfig, devices } from "@playwright/test";

// Anonymous-first vertical slice (browse -> log -> today), see e2e/vertical-slice.spec.ts.
// Local run: `npx playwright test` from web/ (add `--headed` or `--debug` to watch/step through it).
// `webServer` boots the SvelteKit dev server itself, so `pnpm dev` doesn't need to be running first.
export default defineConfig({
	testDir: "./e2e",
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	// Deliberately 0, even in CI: this suite's entire point is to prove the menu-API mock actually
	// fired instead of silently falling through to the real umassdining.com — retries would let a
	// flaky race (see the hydration comment in e2e/vertical-slice.spec.ts) launder itself into a
	// green check instead of surfacing.
	retries: 0,
	reporter: [["line"], ["html", { open: "never" }]],
	use: {
		baseURL: "http://localhost:4173",
		// Pins the *browser's* clock so todayIso() (browser-local date) and LogEntry.loggedAt
		// (toISOString(), UTC) always agree, regardless of the machine/CI runner's own timezone —
		// otherwise this test only passes by accident of GitHub Actions runners defaulting to UTC,
		// and a contributor running it locally after ~8pm US-Eastern gets a spurious "Calories: 0".
		timezoneId: "UTC",
		// retries is 0 (see above), so "on-first-retry" would never fire — capture on failure instead,
		// so a red run in CI (where we can't just re-run headed) still ships a usable trace.
		trace: "retain-on-failure",
	},
	projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
	webServer: {
		command: "npx vite dev --port 4173",
		url: "http://localhost:4173",
		reuseExistingServer: !process.env.CI,
		timeout: 60_000,
	},
});
