import assert from "node:assert/strict";
import { test, mock } from "node:test";
import { resolveMenuDate } from "@udine/shared";
import { todayIso } from "./date.ts";

// Run this file under TZ=UTC (see web/package.json's `test` script) to prove todayIso() computes
// UMass Dining's calendar day (America/New_York), not the SSR process's local TZ -- issue #188.
// The bug: a naive `new Date().getDate()`-style implementation returns the *process* TZ's calendar
// day, which on a UTC host (the deployed adapter-auto default) is already tomorrow for
// ~8pm-midnight ET every night -- both rendering tomorrow's menu and 307-redirecting a correct
// `?date=<today ET>` deep link to the wrong day (resolveMenuDate's past-date clamp).
test("todayIso: returns the Eastern calendar day, not the process-local day, in the evening-ET/already-tomorrow-UTC window", () => {
	mock.timers.enable({ apis: ["Date"], now: new Date("2026-08-21T03:30:00.000Z").getTime() });
	try {
		// 11:30 PM Eastern on Aug 20, 2026 == 3:30 AM UTC on Aug 21.
		assert.equal(todayIso(), "2026-08-20");
	} finally {
		mock.timers.reset();
	}
});

test("todayIso: still returns the Eastern calendar day well inside the UTC day (no false pass from the boundary case above)", () => {
	mock.timers.enable({ apis: ["Date"], now: new Date("2026-08-20T15:00:00.000Z").getTime() });
	try {
		// 11:00 AM Eastern on Aug 20 == 3:00 PM UTC on Aug 20 -- ET and UTC agree on the day here.
		assert.equal(todayIso(), "2026-08-20");
	} finally {
		mock.timers.reset();
	}
});

// The composed seam halls/[slug]/+page.ts actually exercises: a correct `?date=<today ET>` deep
// link must NOT get 307-redirected. Under the pre-fix bug, todayIso() returns "2026-08-21" at this
// same instant, resolveMenuDate's `dateParam <= todayIso` clamp fires on the still-valid "2026-08-20"
// request, and the load rewrites a correct URL to the wrong day -- the exact failure issue #188
// describes, not just todayIso() in isolation.
test("resolveMenuDate(todayIso(), todayIso()) doesn't clamp a same-day request away, at the evening-ET/already-tomorrow-UTC boundary", () => {
	mock.timers.enable({ apis: ["Date"], now: new Date("2026-08-21T03:30:00.000Z").getTime() });
	try {
		const today = todayIso();
		assert.equal(resolveMenuDate(today, today), today);
	} finally {
		mock.timers.reset();
	}
});
