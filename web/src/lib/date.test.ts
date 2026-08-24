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

// Same boundary, but in January (EST, UTC-5, no DST) rather than August (EDT, UTC-4) -- proves the
// fix reads the IANA zone's *current* offset via Intl rather than a hardcoded one, so it doesn't
// quietly break every fall/spring DST transition.
test("todayIso: returns the Eastern calendar day in EST (January, no DST) too, not just EDT", () => {
	mock.timers.enable({ apis: ["Date"], now: new Date("2027-01-16T04:30:00.000Z").getTime() });
	try {
		// 11:30 PM Eastern (EST) on Jan 15, 2027 == 4:30 AM UTC on Jan 16.
		assert.equal(todayIso(), "2027-01-15");
	} finally {
		mock.timers.reset();
	}
});

// The composed seam halls/[slug]/+page.ts actually exercises: a correct `?date=<today ET>` deep
// link must NOT get 307-redirected. Pinned to a literal date param (not todayIso() on both sides of
// the assertion, which would pass under any implementation -- both sides came from the function
// under test, see #208 review finding 2) so this only stays green if todayIso() actually returns
// "2026-08-20" at this instant. Under the pre-fix bug, todayIso() returns "2026-08-21" here,
// resolveMenuDate's `dateParam <= todayIso` clamp fires on the still-valid "2026-08-20" request, and
// the load rewrites a correct URL to the wrong day -- the exact failure issue #188 describes.
test("resolveMenuDate doesn't clamp a correct ?date=<today ET> request away, at the evening-ET/already-tomorrow-UTC boundary", () => {
	mock.timers.enable({ apis: ["Date"], now: new Date("2026-08-21T03:30:00.000Z").getTime() });
	try {
		assert.equal(resolveMenuDate("2026-08-20", todayIso()), "2026-08-20");
	} finally {
		mock.timers.reset();
	}
});
