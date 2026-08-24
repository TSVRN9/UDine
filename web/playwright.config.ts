import { defineConfig, devices } from "@playwright/test";

// Anonymous-first vertical slice (browse -> log -> today), see e2e/vertical-slice.spec.ts.
// Local run: `npx playwright test` from web/ (add `--headed` or `--debug` to watch/step through it).
// `webServer` boots the SvelteKit dev server itself, so `pnpm dev` doesn't need to be running first.
// Port comes from PORT (default 4173) so concurrent suite runs in separate worktrees/checkouts can
// each claim their own port instead of colliding on the default — run with `PORT=<n> npx playwright test`.
const port = process.env.PORT || "4173";

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
		baseURL: `http://localhost:${port}`,
		// Pinned to a real non-UTC zone (issue #124 -- was "UTC" here, which *dodged* the bug this
		// suite should catch: todayIso() was already local, but LogEntry.loggedAt was stamped with
		// `.toISOString()`/UTC, so pinning UTC made the two agree by coincidence, not because the
		// wiring was correct. That's exactly how issue #124 shipped invisibly — a contributor running
		// the suite locally after ~8pm US-Eastern would have seen a spurious "Calories: 0", but CI's
		// UTC-default runners never would have). America/New_York mirrors mobile's TZ=America/New_York
		// jest pin (mobile/package.json, from PR #122) — a timezone where the boundary this bug lives
		// on (evening local time, already-tomorrow UTC) actually occurs, so the suite exercises the
		// real fix (both loggedAt and todayIso() derived from LOCAL date components) instead of
		// hiding behind a timezone where writer and reader can't diverge.
		timezoneId: "America/New_York",
		// retries is 0 (see above), so "on-first-retry" would never fire — capture on failure instead,
		// so a red run in CI (where we can't just re-run headed) still ships a usable trace.
		trace: "retain-on-failure",
	},
	projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
	webServer: {
		command: `npx vite dev --port ${port}`,
		url: `http://localhost:${port}`,
		reuseExistingServer: !process.env.CI,
		timeout: 60_000,
	},
});
