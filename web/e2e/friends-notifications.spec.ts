import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { test, expect, type Page, type Route } from "@playwright/test";

// Coverage for #39 (styling) and #66 (social activity feed: pings + favorited-food sightings
// merged into one feed on src/routes/notifications, "ping a friend" moved off src/routes/friends).
// Both pages are gated on a signed-in session (see CLAUDE.md — friends, pings and profile are the
// only legitimately server-backed features), so this spec has two halves per page: a real,
// unmocked signed-out check (no session cookie at all — proves the sign-in prompt renders instead
// of crashing), and a signed-in check that mocks the Supabase session and REST responses so nothing
// here ever touches the live project.
//
// Session mocking: @supabase/ssr's browser client stores its session as a cookie
// (`sb-<project-ref>-auth-token`, base64url-JSON, see node_modules/@supabase/ssr/dist/main/cookies.js),
// not localStorage. Seeding that cookie via page.addInitScript() (so it exists for the client's own
// document.cookie read, but *not* for the initial SSR request, which fires before addInitScript's
// script runs) means:
//   - SSR (+layout.server.ts's safeGetSession) sees no cookie -> session stays null -> zero network.
//   - Hydration re-runs +layout.ts in the browser, which reads the cookie via getSession(). A future
//     expires_at means this is satisfied from the cookie alone, no refresh-token network call.
// page.data.session flips non-null once that client-side load resolves -- waiting for session-only
// content to become visible IS the hydration proof here (it cannot render before the client load
// that produces it has run), same idea as shell.spec.ts's proveHydrated but tied to this page's own
// state transition instead of a synthetic click.
const USER_ID = "11111111-1111-4111-8111-111111111111";
const FRIEND_ID = "22222222-2222-4222-8222-222222222222";
const REQUESTER_ID = "33333333-3333-4333-8333-333333333333";
const HAMPSHIRE_TID = 3;
const WORCESTER_TID = 1;

const WEB_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Reads PUBLIC_SUPABASE_URL from web/.env (falling back to .env.example, since local runs may
 * not have copied it yet — CI's e2e job does `cp web/.env.example web/.env` first) and derives the
 * project ref the same way @supabase/supabase-js itself does for its default cookie/storage key
 * (see node_modules/@supabase/supabase-js/dist/index.mjs: `sb-${new URL(supabaseUrl).hostname.split(".")[0]}-auth-token`).
 * Was previously hardcoded as "your-project-ref" (only correct because that happens to be the
 * .env.example placeholder) — deriving it means this spec doesn't silently drift from the client. */
function supabaseCookieName(): string {
	const envPath = existsSync(path.join(WEB_DIR, ".env")) ? path.join(WEB_DIR, ".env") : path.join(WEB_DIR, ".env.example");
	const match = readFileSync(envPath, "utf-8").match(/^PUBLIC_SUPABASE_URL=(.+)$/m);
	if (!match) throw new Error(`PUBLIC_SUPABASE_URL not found in ${envPath}`);
	const projectRef = new URL(match[1].trim()).hostname.split(".")[0];
	return `sb-${projectRef}-auth-token`;
}

function fakeSessionCookie(): [string, string] {
	const now = Math.floor(Date.now() / 1000);
	const exp = now + 3600; // well past auth-js's refresh margin -- no refresh-token network call
	const b64url = (obj: unknown) => Buffer.from(JSON.stringify(obj)).toString("base64url");
	const accessToken = [b64url({ alg: "HS256", typ: "JWT" }), b64url({ sub: USER_ID, role: "authenticated", exp }), "fakesig"].join(".");
	const session = {
		access_token: accessToken,
		token_type: "bearer",
		expires_in: 3600,
		expires_at: exp,
		refresh_token: "fake-refresh-token",
		user: {
			id: USER_ID,
			aud: "authenticated",
			role: "authenticated",
			email: "friend@umass.edu",
			app_metadata: {},
			user_metadata: {},
			created_at: new Date().toISOString(),
		},
	};
	return [supabaseCookieName(), "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url")];
}

type CapturedRequest = { table: string; method: string; url: URL; body: unknown };

/** Seeds the fake session cookie and wires up a REST mock router + a realtime no-op, so a
 * signed-in test never reaches the live project. `handlers` maps a `rest/v1/<table>` path segment
 * to a fulfiller; anything not listed gets an empty-array 200, which is enough for tables a given
 * test doesn't care about (e.g. the profiles search-by-name query on the notifications page). */
async function signInAndMockSupabase(page: Page, handlers: Record<string, (route: Route, url: URL) => Promise<void> | void>): Promise<CapturedRequest[]> {
	const [name, value] = fakeSessionCookie();
	await page.addInitScript(([n, v]) => {
		document.cookie = `${n}=${v}; path=/`;
	}, [name, value]);

	const requests: CapturedRequest[] = [];
	await page.route("**/rest/v1/**", async (route) => {
		const url = new URL(route.request().url());
		const table = url.pathname.replace("/rest/v1/", "");
		const method = route.request().method();
		// postDataJSON() throws on bodyless requests (GET/DELETE-without-body) -- only POST/PATCH here
		// ever carry one.
		const body = method === "POST" || method === "PATCH" ? route.request().postDataJSON() : null;
		requests.push({ table, method, url, body });
		const handler = handlers[table];
		if (handler) {
			await handler(route, url);
		} else {
			await route.fulfill({ json: [] });
		}
	});
	// Belt-and-braces: nothing should hit real auth (getSession() is satisfied from the cookie), but
	// if something did call it, this keeps it from reaching the live project.
	await page.route("**/auth/v1/**", (route) => route.fulfill({ json: {} }));
	// notifications/+page.svelte opens a realtime channel for the pings inbox -- page.route doesn't
	// cover WebSockets, so this closes the connection immediately instead of letting it hit the live
	// project's realtime endpoint.
	await page.routeWebSocket(/realtime/, (ws) => ws.close());

	return requests;
}

/** profiles is queried two different shapes on notifications/+page.svelte: `.eq("user_id",
 * me).single()` for the notifications toggle, and `.in("user_id", otherIds)` for friend names. Both
 * hit the same `rest/v1/profiles` path, so the mock has to branch on the query string instead of
 * the table name. */
function profilesHandler(single: Record<string, unknown>, friendRows: { user_id: string; display_name: string }[] = []) {
	return (route: Route, url: URL) => {
		const userIdParam = url.searchParams.get("user_id") ?? "";
		if (userIdParam.startsWith("in.")) return route.fulfill({ json: friendRows });
		return route.fulfill({ json: single });
	};
}

async function waitForRequest(requests: CapturedRequest[], table: string, method: string): Promise<CapturedRequest> {
	await expect
		.poll(() => requests.some((r) => r.table === table && r.method === method), {
			message: `expected a ${method} to ${table} — click handlers are async and Playwright's .click() doesn't wait for them`,
		})
		.toBe(true);
	return requests.find((r) => r.table === table && r.method === method)!;
}

test.describe("Friends — signed out", () => {
	test("shows a styled sign-in prompt instead of the friends UI", async ({ page }) => {
		await page.goto("/friends");

		await expect(page.getByRole("heading", { name: "Friends", level: 1 })).toHaveClass(/page-title/);
		const prompt = page.locator(".empty-state");
		await expect(prompt).toBeVisible();
		await expect(prompt).toContainText("Sign in to add friends and send pings.");
		// No crash: none of the signed-in-only sections render.
		await expect(page.getByRole("heading", { name: "Find friends" })).toHaveCount(0);
	});
});

test.describe("Notifications — signed out", () => {
	test("shows the feed shell with a sign-in value prop, not a dead end", async ({ page }) => {
		await page.goto("/notifications");

		await expect(page.getByRole("heading", { name: "Notifications", level: 1 })).toHaveClass(/page-title/);
		const prompt = page.locator(".empty-state");
		await expect(prompt).toBeVisible();
		await expect(prompt).toContainText("Sign in to see this feed");
		await expect(prompt).toContainText("pings from friends and favorited-dish alerts");
		// No crash: none of the signed-in-only sections render.
		await expect(page.getByRole("heading", { name: "Activity" })).toHaveCount(0);
		await expect(page.getByRole("heading", { name: "Ping a friend" })).toHaveCount(0);
		// The value prop points at the header's own control -- it must not add a second one (that
		// would make every getByRole("button", { name: /Sign in/ }) locator ambiguous).
		await expect(page.getByRole("button", { name: /Sign in/ })).toHaveCount(1);
	});
});

test.describe("Friends — signed in", () => {
	test("pending (incoming/outgoing) and accepted friend states are visually distinct, and Accept sends the right update", async ({ page }) => {
		const friendships = [
			// Incoming: FRIEND_ID requested me.
			{ user_a: USER_ID < FRIEND_ID ? USER_ID : FRIEND_ID, user_b: USER_ID < FRIEND_ID ? FRIEND_ID : USER_ID, status: "pending", requested_by: FRIEND_ID },
			// Outgoing: I requested REQUESTER_ID.
			{ user_a: USER_ID < REQUESTER_ID ? USER_ID : REQUESTER_ID, user_b: USER_ID < REQUESTER_ID ? REQUESTER_ID : USER_ID, status: "pending", requested_by: USER_ID },
		];
		const requests = await signInAndMockSupabase(page, {
			friendships: async (route) => {
				if (route.request().method() === "PATCH") {
					return route.fulfill({ json: [] });
				}
				return route.fulfill({ json: friendships });
			},
			profiles: (route) =>
				route.fulfill({
					json: [
						{ user_id: FRIEND_ID, display_name: "Casey Friend" },
						{ user_id: REQUESTER_ID, display_name: "Riley Requested" },
					],
				}),
		});

		await page.goto("/friends");

		// Hydration proof: this section only exists once page.data.session has flipped non-null.
		await expect(page.getByRole("heading", { name: "Find friends" })).toBeVisible({ timeout: 15_000 });

		const incomingRow = page.locator("li", { hasText: "Casey Friend" });
		await expect(incomingRow.locator(".badge")).toHaveText("Wants to be friends");
		const acceptButton = incomingRow.getByRole("button", { name: "Accept" });
		await expect(acceptButton).toHaveClass(/btn-primary/);

		const outgoingRow = page.locator("li", { hasText: "Riley Requested" });
		await expect(outgoingRow.locator(".badge")).toHaveText("Pending");
		await expect(outgoingRow.getByRole("button", { name: "Accept" })).toHaveCount(0);

		await acceptButton.click();
		// Playwright's click() resolves once the click is dispatched, not once acceptFriend()'s async
		// PATCH has round-tripped through the mock router -- polling instead of reading requests
		// synchronously closes that race (previously ~L149).
		const patch = await waitForRequest(requests, "friendships", "PATCH");
		expect(patch.url.searchParams.get("user_a")).toBe(`eq.${friendships[0].user_a}`);
		expect(patch.url.searchParams.get("user_b")).toBe(`eq.${friendships[0].user_b}`);
	});

	test("accepted friends are shown without ping controls -- pinging moved to the activity feed (#66)", async ({ page }) => {
		const friendship = { user_a: USER_ID < FRIEND_ID ? USER_ID : FRIEND_ID, user_b: USER_ID < FRIEND_ID ? FRIEND_ID : USER_ID, status: "accepted", requested_by: FRIEND_ID };
		await signInAndMockSupabase(page, {
			friendships: (route) => route.fulfill({ json: [friendship] }),
			profiles: (route) => route.fulfill({ json: [{ user_id: FRIEND_ID, display_name: "Casey Friend" }] }),
		});

		await page.goto("/friends");
		await expect(page.getByRole("heading", { name: "Find friends" })).toBeVisible({ timeout: 15_000 });

		const friendRow = page.locator("li.card", { hasText: "Casey Friend" });
		await expect(friendRow.locator(".badge", { hasText: "Friend" })).toBeVisible();
		await expect(friendRow.getByRole("button", { name: /Ping/ })).toHaveCount(0);
		await expect(page.getByRole("heading", { name: "Pings you've received" })).toHaveCount(0);
		await expect(page.getByRole("link", { name: "Notifications feed" })).toBeVisible();
	});
});

test.describe("Notifications — signed in", () => {
	test("the alert toggle is visually clear and flips state with the right PATCH", async ({ page }) => {
		const requests = await signInAndMockSupabase(page, {
			profiles: profilesHandler({ notifications_enabled: false }),
			food_sightings: (route) => route.fulfill({ json: [] }),
			pings: (route) => route.fulfill({ json: [] }),
			friendships: (route) => route.fulfill({ json: [] }),
			favorited_foods: (route) => route.fulfill({ json: [] }),
		});

		await page.goto("/notifications");

		// Scoped to the toggle's own section rather than ".badge".first() -- the feed below can also
		// render "New" badges, and .first() would silently start matching the wrong one if their DOM
		// order ever changed instead of failing loudly.
		const badge = page.locator("section", { hasText: "Favorited-dish alerts" }).locator(".badge");
		await expect(badge).toHaveText("Alerts off", { timeout: 15_000 }); // hydration proof: reflects the mocked profile fetch

		const toggle = page.getByRole("checkbox");
		await toggle.click();
		await expect(badge).toHaveText("Alerts on");

		// Same race as the friendships Accept PATCH above (previously ~L195, unfixed twin of ~L149).
		const patch = await waitForRequest(requests, "profiles", "PATCH");
		expect(patch.url.searchParams.get("user_id")).toBe(`eq.${USER_ID}`);
	});

	test("feed mixes pings and sightings newest-first, both badged New when unread", async ({ page }) => {
		const older = new Date(Date.now() - 60_000).toISOString();
		const newer = new Date().toISOString();
		await signInAndMockSupabase(page, {
			profiles: profilesHandler({ notifications_enabled: true }, [{ user_id: FRIEND_ID, display_name: "Casey Friend" }]),
			friendships: (route) => route.fulfill({ json: [{ user_a: USER_ID < FRIEND_ID ? USER_ID : FRIEND_ID, user_b: USER_ID < FRIEND_ID ? FRIEND_ID : USER_ID, status: "accepted" }] }),
			food_sightings: (route) =>
				route.fulfill({ json: [{ id: "s1", dish_name: "French Toast", hall_tid: HAMPSHIRE_TID, sighted_date: "2026-08-19", read_at: null, created_at: older }] }),
			pings: (route) => route.fulfill({ json: [{ id: "p1", sender_id: FRIEND_ID, hall_tid: WORCESTER_TID, message: "come eat?", created_at: newer }] }),
		});

		await page.goto("/notifications");
		const feed = page.getByRole("list", { name: "Activity feed" });
		const items = feed.getByRole("listitem");
		await expect(items).toHaveCount(2, { timeout: 15_000 }); // hydration proof

		// Newest (the ping) first.
		await expect(items.nth(0)).toContainText("Casey Friend");
		await expect(items.nth(0)).toContainText("come eat?");
		await expect(items.nth(1)).toContainText("French Toast");

		// Both unread: the ping (no last-seen marker yet on a fresh browser context) and the sighting
		// (read_at is null).
		await expect(items.nth(0).locator(".badge", { hasText: "New" })).toBeVisible();
		await expect(items.nth(1).locator(".badge", { hasText: "New" })).toBeVisible();
	});

	test("ping a friend from the feed sends the right insert", async ({ page }) => {
		const requests = await signInAndMockSupabase(page, {
			profiles: profilesHandler({ notifications_enabled: false }, [{ user_id: FRIEND_ID, display_name: "Casey Friend" }]),
			friendships: (route) => route.fulfill({ json: [{ user_a: USER_ID < FRIEND_ID ? USER_ID : FRIEND_ID, user_b: USER_ID < FRIEND_ID ? FRIEND_ID : USER_ID, status: "accepted" }] }),
			food_sightings: (route) => route.fulfill({ json: [] }),
			pings: async (route) => {
				if (route.request().method() === "POST") {
					return route.fulfill({ json: [{ id: "ping-new", sender_id: USER_ID, receiver_id: FRIEND_ID, hall_tid: HAMPSHIRE_TID, message: "omw", created_at: new Date().toISOString() }] });
				}
				return route.fulfill({ json: [] });
			},
		});

		await page.goto("/notifications");
		await expect(page.getByRole("heading", { name: "Ping a friend" })).toBeVisible({ timeout: 15_000 });

		await page.getByLabel("Friend").selectOption(FRIEND_ID);
		await page.getByLabel("Hall").selectOption(String(HAMPSHIRE_TID));
		await page.getByLabel("Message (optional)").fill("omw");
		await page.getByRole("button", { name: "Send ping" }).click();

		const post = await waitForRequest(requests, "pings", "POST");
		expect(post.body).toMatchObject({ sender_id: USER_ID, receiver_id: FRIEND_ID, hall_tid: HAMPSHIRE_TID, message: "omw" });
		await expect(page.getByRole("status")).toHaveText("Ping sent");
	});

	test("unread sighting mark-as-read is reachable by keyboard, not just onmouseenter (closes #62)", async ({ page }) => {
		const requests = await signInAndMockSupabase(page, {
			profiles: profilesHandler({ notifications_enabled: true }),
			friendships: (route) => route.fulfill({ json: [] }),
			pings: (route) => route.fulfill({ json: [] }),
			food_sightings: async (route) => {
				if (route.request().method() === "PATCH") return route.fulfill({ json: [] });
				return route.fulfill({ json: [{ id: "s1", dish_name: "French Toast", hall_tid: HAMPSHIRE_TID, sighted_date: "2026-08-19", read_at: null, created_at: new Date().toISOString() }] });
			},
		});

		await page.goto("/notifications");
		const row = page.locator("li", { hasText: "French Toast" });
		await expect(row.locator(".badge", { hasText: "New" })).toBeVisible({ timeout: 15_000 });

		// Keyboard only: focus the button (proving it's actually in the tab order, not just
		// clickable) and press Enter, never a mouse event -- #62 asks for a keyboard-only walkthrough.
		const markReadButton = row.getByRole("button", { name: "Mark as read" });
		await markReadButton.focus();
		await expect(markReadButton).toBeFocused();
		await markReadButton.press("Enter");

		const patch = await waitForRequest(requests, "food_sightings", "PATCH");
		expect(patch.url.searchParams.get("id")).toBe("eq.s1");
		await expect(row.locator(".badge", { hasText: "New" })).toHaveCount(0);
	});

	test("read sightings stay visually de-emphasized and don't offer mark-as-read again", async ({ page }) => {
		await signInAndMockSupabase(page, {
			profiles: profilesHandler({ notifications_enabled: true }),
			friendships: (route) => route.fulfill({ json: [] }),
			pings: (route) => route.fulfill({ json: [] }),
			food_sightings: (route) =>
				route.fulfill({
					json: [{ id: "s2", dish_name: "Fried Plantain", hall_tid: WORCESTER_TID, sighted_date: "2026-08-18", read_at: new Date().toISOString(), created_at: new Date().toISOString() }],
				}),
		});

		await page.goto("/notifications");
		const readRow = page.locator("li", { hasText: "Fried Plantain" });
		await expect(readRow).toBeVisible({ timeout: 15_000 });
		await expect(readRow.locator(".badge", { hasText: "New" })).toHaveCount(0);
		await expect(readRow.locator(".badge", { hasText: "Worcester" })).toBeVisible();
		await expect(readRow.getByRole("button", { name: "Mark as read" })).toHaveCount(0);
	});
});
