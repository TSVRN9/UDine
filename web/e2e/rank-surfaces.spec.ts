import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { parseCategoryItems } from "@udine/shared";

// Coverage for #67 (last child of epic #63): rank-informed surfaces on top of the existing ranking
// machinery (shared/src/ranking.ts, web/src/routes/rank/+page.svelte) -- (1) a post-log one-tap
// comparison prompt on halls/[slug], (2) a "Your top dishes" module on the home dashboard (`/`).
// Pair-selection logic itself (pickPostLogComparisonPair) has its own red-first unit coverage in
// shared/src/ranking.test.ts; this file is only about whether the two pages actually wire that
// function up to real IndexedDB reads/writes and render its output -- vertical-slice.spec.ts /
// rank.spec.ts precedent for why a unit test alone can't see that class of bug.

// Same hydration pitfall documented throughout this suite: a click before SvelteKit's client router
// attaches falls through to a full navigation, invisible to page.route() mocks below.
async function proveHydrated(page: Page) {
	const star = page.getByRole("listitem").filter({ hasText: "Hampshire" }).getByRole("button", { name: "favorite" });
	await expect(async () => {
		await star.click();
		await expect(star).toHaveText("★");
	}).toPass({ timeout: 10_000 });
	await star.click();
	await expect(star).toHaveText("☆");
}

// Same two real-fragment dishes rank.spec.ts uses (French Toast, Fried Plantain -- both
// Hampshire/tid=3, breakfast, "Breakfast Entrees"), run through the real parseCategoryItems so the
// mocked /api/menu response has the exact shape/values the live API returns.
const REAL_FRAGMENT =
	`<a data-healthfulness="30" data-carbon-list="B" data-ingredient-list="FREIHOFFER&#039;S Country White Bread" ` +
	`data-allergens="Milk, Eggs, Gluten, Soy, Corn  , Wheat" data-recipe-webcode="LPR SUS VGT H3 CR2" ` +
	`data-clean-diet-str="Local, Sustainable, Vegetarian" data-serving-size="1 each" data-calories="127" ` +
	`data-calories-from-fat="26" data-total-fat="2.9g" data-total-fat-dv="4" data-sat-fat="0.5g" data-sat-fat-dv="" ` +
	`data-trans-fat="0g" data-cholesterol="50.9mg" data-cholesterol_dv="" data-sodium="237.2mg" data-sodium-dv="10" ` +
	`data-total-carb="20.4g" data-total-carb-dv="16" data-dietary-fiber="1g" data-dietary-fiber-dv="3" ` +
	`data-sugars="3.4g" data-sugars-dv="" data-protein="5.3g" data-protein-dv="9" data-dish-name="French Toast" ` +
	`href="#inline">French Toast</a>` +
	`<a data-healthfulness="30" data-carbon-list="A" data-ingredient-list="Sweet Plantains" ` +
	`data-allergens="Milk, Eggs, Gluten, Soy, Corn  , Sesame , Wheat" data-recipe-webcode="VGT H3 CR1" ` +
	`data-clean-diet-str="Vegetarian" data-serving-size="1 OZ" data-calories="69" data-calories-from-fat="33" ` +
	`data-total-fat="3.7g" data-total-fat-dv="5" data-sat-fat="0.7g" data-sat-fat-dv="" data-trans-fat="0g" ` +
	`data-cholesterol="0mg" data-cholesterol_dv="" data-sodium="123.2mg" data-sodium-dv="5" data-total-carb="8.9g" ` +
	`data-total-carb-dv="7" data-dietary-fiber="0.2g" data-dietary-fiber-dv="1" data-sugars="8.2g" data-sugars-dv="" ` +
	`data-protein="0.3g" data-protein-dv="0" data-dish-name="Fried Plantain" href="#inline">Fried Plantain</a>`;

const HAMPSHIRE_TID = 3;
const MENU_ITEMS = parseCategoryItems(REAL_FRAGMENT, "Breakfast Entrees", "breakfast", HAMPSHIRE_TID, "2026-08-18");

// A realistic-length menu (~40 dishes, one category) -- the 2-dish fixture above can't reach the
// prompt-placement ceiling this section covers: with only 2 dishes on the page, any placement is
// "in the viewport" by accident. Synthetic names/nutrition (real values aren't the point here, only
// list length is), still run through the real parseCategoryItems so the fixture has the same shape
// live data does.
function longMenuFragment(count: number): string {
	let html = "";
	for (let i = 1; i <= count; i++) {
		const name = `Dish ${String(i).padStart(2, "0")}`;
		html += `<a data-dish-name="${name}" data-calories="100" data-protein="5g" data-total-carb="10g" data-total-fat="2g" data-serving-size="1 each" href="#inline">${name}</a>`;
	}
	return html;
}
const LONG_MENU_ITEMS = parseCategoryItems(longMenuFragment(40), "Entrees", "breakfast", HAMPSHIRE_TID, "2026-08-18");

async function gotoHampshireMenu(page: Page) {
	await page.route("**/api/menu**", (route) => route.fulfill({ json: MENU_ITEMS }));
	await page.goto("/");
	await proveHydrated(page);
	await page
		.getByRole("listitem")
		.filter({ hasText: "Hampshire" })
		.getByRole("link", { name: "Hampshire" })
		.click();
}

function comparePrompt(page: Page) {
	return page.getByRole("region", { name: "Compare dishes" });
}

test("logging the first dish offers no comparison prompt (nothing to pair it with yet)", async ({ page }) => {
	await gotoHampshireMenu(page);

	await page.getByRole("listitem").filter({ hasText: "French Toast" }).getByRole("button", { name: "Log" }).click();
	await expect(page.getByRole("status")).toHaveText("Logged 1 × French Toast");

	await expect(comparePrompt(page)).toHaveCount(0);
});

test("logging a second distinct dish offers a one-tap comparison prompt naming both dishes", async ({ page }) => {
	await gotoHampshireMenu(page);

	await page.getByRole("listitem").filter({ hasText: "French Toast" }).getByRole("button", { name: "Log" }).click();
	await expect(page.getByRole("status")).toHaveText("Logged 1 × French Toast");
	await expect(comparePrompt(page)).toHaveCount(0);

	await page.getByRole("listitem").filter({ hasText: "Fried Plantain" }).getByRole("button", { name: "Log" }).click();
	await expect(page.getByRole("status")).toHaveText("Logged 1 × Fried Plantain");

	await expect(comparePrompt(page)).toBeVisible();
	await expect(comparePrompt(page)).toContainText("French Toast");
	await expect(comparePrompt(page)).toContainText("Fried Plantain");
});

test("the comparison prompt is dismissible and dismissing it records no comparison", async ({ page }) => {
	await gotoHampshireMenu(page);
	await page.getByRole("listitem").filter({ hasText: "French Toast" }).getByRole("button", { name: "Log" }).click();
	await page.getByRole("listitem").filter({ hasText: "Fried Plantain" }).getByRole("button", { name: "Log" }).click();
	await expect(comparePrompt(page)).toBeVisible();

	await comparePrompt(page).getByRole("button", { name: "Dismiss comparison prompt" }).click();
	await expect(comparePrompt(page)).toHaveCount(0);

	// No comparison was recorded -- /rank's "Your ranking" list stays empty. Scoped by "pick a
	// winner above" (unique to this section) rather than the bare "No comparisons yet" prefix,
	// which "Favorite Foods"'s own empty state also starts with.
	await page.goto("/rank");
	await expect(page.getByText("No comparisons yet — pick a winner above")).toBeVisible();
});

test("logging stays one tap: the open comparison prompt never blocks logging another dish, or intercepts the header nav", async ({
	page,
}) => {
	await gotoHampshireMenu(page);
	await page.getByRole("listitem").filter({ hasText: "French Toast" }).getByRole("button", { name: "Log" }).click();
	await page.getByRole("listitem").filter({ hasText: "Fried Plantain" }).getByRole("button", { name: "Log" }).click();
	await expect(comparePrompt(page)).toBeVisible();

	// A real click auto-scrolls its target into view first, so it can't tell "reachable after
	// scrolling" apart from "blocked by an overlay right where it already was" -- that gap is exactly
	// how a fixed-position version of this prompt got past every other assertion in this file while
	// actually intercepting pointer events on the header nav (caught only by rank.spec.ts, a
	// different file). `{ trial: true }` still scrolls the target into view, but runs Playwright's
	// actionability checks -- including "receives pointer events" -- without performing the click
	// itself, so it fails if something else in that scrolled-to position would swallow the click.
	const logButton = page
		.getByRole("listitem")
		.filter({ hasText: "French Toast" })
		.getByRole("button", { name: "Log" });
	await logButton.click({ trial: true });
	await page.getByRole("link", { name: "Dining Halls" }).click({ trial: true });

	// Log French Toast again without touching the prompt at all -- the toast still fires normally,
	// proving the prompt has no overlay/focus-trap standing between the user and the Log buttons.
	await logButton.click();
	await expect(page.getByRole("status")).toHaveText("Logged 1 × French Toast");
});

test("choosing a winner in the prompt records a real comparison, visible on /rank", async ({ page }) => {
	await gotoHampshireMenu(page);
	await page.getByRole("listitem").filter({ hasText: "French Toast" }).getByRole("button", { name: "Log" }).click();
	await page.getByRole("listitem").filter({ hasText: "Fried Plantain" }).getByRole("button", { name: "Log" }).click();
	await expect(comparePrompt(page)).toBeVisible();

	await comparePrompt(page).getByRole("button", { name: /French Toast/ }).click();
	await expect(comparePrompt(page)).toHaveCount(0);

	await page.goto("/rank");
	const rankingList = page.locator(`xpath=//ol[preceding-sibling::h2[1][contains(., "Your ranking")]]`);
	await expect(rankingList.locator("li")).toHaveCount(2);
	await expect(rankingList.locator("li").nth(0)).toContainText("French Toast");
});

test("home shows an empty state for Your Top Dishes before any comparison, without colliding with the existing Compare dishes quick link", async ({
	page,
}) => {
	await page.goto("/");
	await proveHydrated(page);

	await expect(page.getByRole("heading", { name: "Your Top Dishes" })).toBeVisible();
	await expect(page.getByText("No comparisons yet")).toBeVisible();

	// Both the empty-state CTA and the "More" section's quick link route to /rank, but must not
	// share an accessible name -- home-dashboard.spec.ts locates the quick link by
	// getByRole("link", { name: "Compare dishes" }), which would throw a strict-mode violation if a
	// second link picked up that same name.
	await expect(page.getByRole("link", { name: "Compare dishes" })).toHaveCount(1);
	await expect(page.getByRole("link", { name: "Start ranking" })).toBeVisible();
});

test("home's Your Top Dishes module shows a real comparison's winner, ranked, linking to /rank", async ({ page }) => {
	await gotoHampshireMenu(page);
	await page.getByRole("listitem").filter({ hasText: "French Toast" }).getByRole("button", { name: "Log" }).click();
	await page.getByRole("listitem").filter({ hasText: "Fried Plantain" }).getByRole("button", { name: "Log" }).click();
	await comparePrompt(page).getByRole("button", { name: /French Toast/ }).click();
	// Barrier, not decoration: chooseCompare (halls/[slug]/+page.svelte) only sets comparePrompt =
	// null as its LAST statement, after awaiting both rankingStorage.saveRankedDishes/saveRankedFoods.
	// click() itself only waits for the click to dispatch, not for that onclick handler's promise to
	// settle -- without this wait, page.goto("/") below can fire (and tear down this page's JS/
	// IndexedDB-transaction context) before the write actually commits. Invisible in a fast/serial
	// run; under 4-worker CPU contention this is issue #85's flake -- reproduced red-first (2/130 at
	// --repeat-each=10 --workers=4, "No comparisons yet" still showing at the toContainText timeout,
	// i.e. the write from the previous page really did lose the race). Same pattern the "choosing a
	// winner..." (line ~154) and "signed-in: ...syncs favorite dining halls" tests already rely on.
	await expect(comparePrompt(page)).toHaveCount(0);

	await page.goto("/");
	await expect(page.getByRole("heading", { name: "Your Top Dishes" })).toBeVisible();
	await expect(page.getByText("No comparisons yet")).toHaveCount(0);

	const topDishesSection = page.locator("section").filter({ has: page.getByRole("heading", { name: "Your Top Dishes" }) });
	await expect(topDishesSection.locator("li").first()).toContainText("French Toast");
	await expect(topDishesSection.getByRole("link", { name: "Full ranking" })).toBeVisible();
});

// #66/#69: home's own residency guard (home-dashboard.spec.ts's page.on("request") check) already
// covers "/" -- a page.route("**/api/**") guard here would be the same retired pattern that test's
// own comment documents as blind to a direct cross-origin fetch(..., { mode: "no-cors" }) call, not
// a second, independent proof.

test("post-log comparison prompt is visible in the viewport after logging a dish far down a long menu", async ({
	page,
}) => {
	await page.route("**/api/menu**", (route) => route.fulfill({ json: LONG_MENU_ITEMS }));
	await page.goto("/");
	await proveHydrated(page);
	await page
		.getByRole("listitem")
		.filter({ hasText: "Hampshire" })
		.getByRole("link", { name: "Hampshire" })
		.click();

	// Log the first dish so a second log later on has a valid opponent to pair against.
	await page.getByRole("listitem").filter({ hasText: "Dish 01" }).getByRole("button", { name: "Log" }).click();
	await expect(page.getByRole("status")).toHaveText("Logged 1 × Dish 01");

	// Log a dish far down a realistic-length menu -- this is the reviewer's probe for the header-flow
	// ceiling: a prompt rendered in document flow directly under the date nav sits far above the
	// viewport once the page has scrolled this deep, "offered" only in the DOM, not to the user.
	const farDish = page.getByRole("listitem").filter({ hasText: "Dish 35" }).getByRole("button", { name: "Log" });
	await farDish.scrollIntoViewIfNeeded();
	await farDish.click();
	await expect(page.getByRole("status")).toHaveText("Logged 1 × Dish 35");

	await expect(comparePrompt(page)).toBeInViewport();
});

test("scrolled deep in a long menu, the comparison prompt and the header nav/status toast all stay tappable and non-overlapping", async ({
	page,
}) => {
	await page.route("**/api/menu**", (route) => route.fulfill({ json: LONG_MENU_ITEMS }));
	await page.goto("/");
	await proveHydrated(page);
	await page
		.getByRole("listitem")
		.filter({ hasText: "Hampshire" })
		.getByRole("link", { name: "Hampshire" })
		.click();

	await page.getByRole("listitem").filter({ hasText: "Dish 01" }).getByRole("button", { name: "Log" }).click();
	const farDish = page.getByRole("listitem").filter({ hasText: "Dish 35" }).getByRole("button", { name: "Log" });
	await farDish.scrollIntoViewIfNeeded();
	await farDish.click();
	await expect(comparePrompt(page)).toBeInViewport();

	// Both the prompt and the status toast are anchored to the viewport bottom and can be visible at
	// the same time right after logging -- confirm they stack instead of overlapping. Captured
	// immediately after the log, before the trial clicks below, since loggedMessage self-clears after
	// 2s (logItem's own setTimeout) and the toast must still be up for this comparison to mean anything.
	await expect(page.getByRole("status")).toBeVisible();
	const toastBox = await page.getByRole("status").boundingBox();
	const promptBox = await comparePrompt(page).boundingBox();
	expect(toastBox).not.toBeNull();
	expect(promptBox).not.toBeNull();
	expect(promptBox!.y + promptBox!.height).toBeLessThanOrEqual(toastBox!.y + 1);

	// A real click auto-scrolls its target into view first, so it can't tell "reachable after
	// scrolling" apart from "blocked by an overlay right where it already was" -- the same gap
	// rank.spec.ts:80 exists to catch, but at scroll 0, which a long menu never leaves the prompt at.
	// Running the same trial-click actionability check at this actually-scrolled position is the
	// point: it proves the bottom-anchored fix doesn't just move the interception from the header to
	// the status toast (or vice versa).
	await comparePrompt(page).getByRole("button", { name: /Dish 01/ }).click({ trial: true });
	await page.getByRole("link", { name: "Dining Halls" }).click({ trial: true });
});

// #81: the { trial: true } actionability checks above scroll their target into view first, so they
// can't tell "reachable after scrolling" apart from "blocked by an overlay right where it already
// was" -- PR #78's review found exactly that gap. All 10 other specs in this file stay green even
// with the wrapper's pointer-events-none class removed (confirmed red-first below: 1 failed -- this
// spec -- 10 passed), because nothing else here asks "what's actually at this pixel" without a
// click/trial-click auto-scrolling first. elementFromPoint at a fixed, already-in-view point is the
// discriminating check.
test("desktop: the element at the last dish row's Log button center is the button itself, not the compare-prompt stack wrapper", async ({
	page,
}) => {
	await page.route("**/api/menu**", (route) => route.fulfill({ json: LONG_MENU_ITEMS }));
	await page.goto("/");
	await proveHydrated(page);
	await page
		.getByRole("listitem")
		.filter({ hasText: "Hampshire" })
		.getByRole("link", { name: "Hampshire" })
		.click();

	await page.getByRole("listitem").filter({ hasText: "Dish 01" }).getByRole("button", { name: "Log" }).click();
	const secondDish = page.getByRole("listitem").filter({ hasText: "Dish 39" }).getByRole("button", { name: "Log" });
	await secondDish.scrollIntoViewIfNeeded();
	await secondDish.click();
	await expect(comparePrompt(page)).toBeVisible();

	// Bottom of the page, not just "scrolled to the far dish" -- the last dish row (Dish 40) is what
	// #81/#82 are about, and elementFromPoint returns null for a point outside the viewport, so the
	// probe point has to actually be on-screen.
	await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

	const lastLogButton = page.getByRole("listitem").filter({ hasText: "Dish 40" }).getByRole("button", { name: "Log" });
	// Selector deliberately omits pointer-events-none: that's the class this test is mutation-testing
	// (removed to prove red-first), so keying the locator on it would make the wrapper unfindable
	// under the exact mutation this test exists to catch.
	const wrapperBox = await page.locator("div.fixed.inset-x-0.bottom-5.z-40").boundingBox();
	const buttonBox = await lastLogButton.boundingBox();
	expect(wrapperBox).not.toBeNull();
	expect(buttonBox).not.toBeNull();

	const cx = buttonBox!.x + buttonBox!.width / 2;
	const cy = buttonBox!.y + buttonBox!.height / 2;

	// Precondition: the probe point actually falls inside the stack wrapper's band. Without this,
	// a future layout change could silently turn this test into a no-op that never exercises the bug.
	expect(cy).toBeGreaterThanOrEqual(wrapperBox!.y);
	expect(cy).toBeLessThanOrEqual(wrapperBox!.y + wrapperBox!.height);

	const hit = await page.evaluate(
		({ x, y }) => {
			const el = document.elementFromPoint(x, y);
			return { tag: el?.tagName ?? null, text: el?.textContent?.trim() ?? null, inLastRow: !!el?.closest("li")?.textContent?.includes("Dish 40") };
		},
		{ x: cx, y: cy },
	);
	expect(hit).toEqual({ tag: "BUTTON", text: "Log", inLastRow: true });
});

// #80: chooseCompare() should sync favorite dining halls the same way /rank's choose() does, but only
// when a session exists -- CLAUDE.md's residency table allows coarse hall-level ranks to leave the
// device for a signed-in user, but never for a signed-out one. Session-mocking technique (cookie +
// rest/v1 route mock) copied from friends-notifications.spec.ts, the only other spec that needs it.
const WEB_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SYNC_USER_ID = "44444444-4444-4444-8444-444444444444";

function supabaseCookieName(): string {
	const envPath = existsSync(path.join(WEB_DIR, ".env")) ? path.join(WEB_DIR, ".env") : path.join(WEB_DIR, ".env.example");
	const match = readFileSync(envPath, "utf-8").match(/^PUBLIC_SUPABASE_URL=(.+)$/m);
	if (!match) throw new Error(`PUBLIC_SUPABASE_URL not found in ${envPath}`);
	const projectRef = new URL(match[1].trim()).hostname.split(".")[0];
	return `sb-${projectRef}-auth-token`;
}

async function signIn(page: Page) {
	const now = Math.floor(Date.now() / 1000);
	const exp = now + 3600; // well past auth-js's refresh margin -- no refresh-token network call
	const b64url = (obj: unknown) => Buffer.from(JSON.stringify(obj)).toString("base64url");
	const accessToken = [b64url({ alg: "HS256", typ: "JWT" }), b64url({ sub: SYNC_USER_ID, role: "authenticated", exp }), "fakesig"].join(".");
	const session = {
		access_token: accessToken,
		token_type: "bearer",
		expires_in: 3600,
		expires_at: exp,
		refresh_token: "fake-refresh-token",
		user: { id: SYNC_USER_ID, aud: "authenticated", role: "authenticated", email: "sync@umass.edu", app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() },
	};
	const value = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");
	await page.addInitScript(([n, v]) => {
		document.cookie = `${n}=${v}; path=/`;
	}, [supabaseCookieName(), value]);
	// Belt-and-braces, same as friends-notifications.spec.ts: getSession() is satisfied from the
	// cookie, but keep any stray auth call off the live project too.
	await page.route("**/auth/v1/**", (route) => route.fulfill({ json: {} }));
}

async function loggedTwoHampshireDishesAndChoseWinner(page: Page) {
	await page.route("**/api/menu**", (route) => route.fulfill({ json: MENU_ITEMS }));
	await page.goto("/");
	await proveHydrated(page);
	await page
		.getByRole("listitem")
		.filter({ hasText: "Hampshire" })
		.getByRole("link", { name: "Hampshire" })
		.click();

	await page.getByRole("listitem").filter({ hasText: "French Toast" }).getByRole("button", { name: "Log" }).click();
	await page.getByRole("listitem").filter({ hasText: "Fried Plantain" }).getByRole("button", { name: "Log" }).click();
	await expect(comparePrompt(page)).toBeVisible();
	await comparePrompt(page).getByRole("button", { name: /French Toast/ }).click();
	await expect(comparePrompt(page)).toHaveCount(0);
}

test("signed-in: choosing a winner in the post-log prompt syncs favorite dining halls to Supabase", async ({ page }) => {
	await signIn(page);
	const syncRequests: string[] = [];
	// halls/[slug] never queries any other rest/v1 table -- favorite_dining_halls is the only one
	// chooseCompare's sync touches -- so one route covers everything this test needs.
	await page.route("**/rest/v1/favorite_dining_halls**", async (route) => {
		syncRequests.push(route.request().method());
		if (route.request().method() === "DELETE") return route.fulfill({ json: [] });
		return route.fulfill({ json: [{ user_id: SYNC_USER_ID, hall_tid: HAMPSHIRE_TID, rank: 1 }] });
	});

	await loggedTwoHampshireDishesAndChoseWinner(page);

	// Both French Toast and Fried Plantain are Hampshire, so a single comparison rates 2 dishes at
	// that hall -- MIN_RATED_DISHES_PER_HALL (shared/src/ranking.ts) is met, so both the unconditional
	// delete and the insert fire; asserting both (not just the delete) proves a rank actually got
	// pushed, not just that syncDiningHallRanks was called and no-opped. Poll: chooseCompare's sync is
	// fire-and-forget, not awaited by the click.
	await expect.poll(() => syncRequests, { message: "expected chooseCompare to sync favorite_dining_halls when signed in" }).toContain("DELETE");
	await expect.poll(() => syncRequests, { message: "expected the Hampshire hall (2 rated dishes) to actually be inserted" }).toContain("POST");
});

test("signed-out: choosing a winner in the post-log prompt makes no Supabase/cross-origin request (residency guard)", async ({ page, baseURL }) => {
	// This IS the residency guard for #80 -- home-dashboard.spec.ts's own guard only ever watches "/".
	// page.on("request"), not page.route counting: a page.route("**/api/**")-shaped guard only sees
	// requests matching that glob and is blind to a direct cross-origin fetch(..., { mode: "no-cors" }),
	// per the same finding home-dashboard.spec.ts's guard comment documents.
	const ALLOWED_CROSS_ORIGIN_HOSTS = new Set(["fonts.googleapis.com", "fonts.gstatic.com"]);
	const offenders: string[] = [];
	const sameOrigin = new URL(baseURL!).origin;
	page.on("request", (req) => {
		const url = new URL(req.url());
		if (url.protocol !== "http:" && url.protocol !== "https:") return; // data:/blob: aren't egress
		if (url.origin === sameOrigin) {
			// /api/menu is this page's own, legitimate menu fetch, and /api/hours is home's own
			// "Cafés & Markets" fetch (#178, loggedTwoHampshireDishesAndChoseWinner starts from "/") --
			// neither is a residency leak, both are public/anonymous data. Any other same-origin /api/
			// path would be.
			if (url.pathname.includes("/api/") && !url.pathname.includes("/api/menu") && url.pathname !== "/api/hours") {
				offenders.push(req.url());
			}
			return;
		}
		if (!ALLOWED_CROSS_ORIGIN_HOSTS.has(url.hostname)) offenders.push(req.url());
	});

	// No signIn() call -- genuinely signed out, no session cookie at all.
	await loggedTwoHampshireDishesAndChoseWinner(page);

	await page.waitForTimeout(500);
	expect(offenders, `unexpected /api/ or cross-origin request(s): ${offenders.join(", ")}`).toEqual([]);
});

// #82: PR #78's review measured that at 375x667 the bottom-anchored stack's min(92vw, 28rem) width
// nearly fills the screen, so scrolled to the bottom of a long menu it sits directly on top of the
// last dish row's Log button until the prompt is dismissed -- a real mobile-web regression (pre-#78
// that spot was only occluded ~2s by the auto-clearing toast). Same elementFromPoint technique as
// #81's desktop probe, at a viewport this repo's one configured Playwright project never runs.
test("narrow viewport (375x667): the last dish row's Log button stays reachable while the compare prompt is up", async ({
	page,
}) => {
	await page.setViewportSize({ width: 375, height: 667 });
	await page.route("**/api/menu**", (route) => route.fulfill({ json: LONG_MENU_ITEMS }));
	await page.goto("/");
	await proveHydrated(page);
	await page
		.getByRole("listitem")
		.filter({ hasText: "Hampshire" })
		.getByRole("link", { name: "Hampshire" })
		.click();

	await page.getByRole("listitem").filter({ hasText: "Dish 01" }).getByRole("button", { name: "Log" }).click();
	const secondDish = page.getByRole("listitem").filter({ hasText: "Dish 39" }).getByRole("button", { name: "Log" });
	await secondDish.scrollIntoViewIfNeeded();
	await secondDish.click();
	await expect(comparePrompt(page)).toBeVisible();

	// Settle the toast BEFORE measuring: it auto-clears at 2s, which shrinks the spacer and
	// re-clamps scrollY mid-probe — a real race this spec lost ~10% of the time under 4 workers
	// (boundingBox taken pre-relayout, elementFromPoint after). Production self-corrects (the
	// browser re-clamps and the button stays reachable); only the measurement needs the quiet DOM.
	await expect(page.getByRole("status")).toHaveCount(0, { timeout: 5000 });

	// Worst case: scrolled all the way to the bottom, prompt still up.
	await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

	const lastLogButton = page.getByRole("listitem").filter({ hasText: "Dish 40" }).getByRole("button", { name: "Log" });
	const buttonBox = await lastLogButton.boundingBox();
	expect(buttonBox).not.toBeNull();
	const cx = buttonBox!.x + buttonBox!.width / 2;
	const cy = buttonBox!.y + buttonBox!.height / 2;

	const hit = await page.evaluate(
		({ x, y }) => {
			const el = document.elementFromPoint(x, y);
			return { tag: el?.tagName ?? null, text: el?.textContent?.trim() ?? null, inLastRow: !!el?.closest("li")?.textContent?.includes("Dish 40") };
		},
		{ x: cx, y: cy },
	);
	expect(hit).toEqual({ tag: "BUTTON", text: "Log", inLastRow: true });
});
