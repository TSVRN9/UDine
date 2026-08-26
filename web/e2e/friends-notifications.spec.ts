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

/** Stubs the browser push APIs notifications/+page.svelte reads: `Notification.permission`
 * (normally a read-only static getter), `Notification.requestPermission()` (enablePush's gate),
 * and `navigator.serviceWorker.getRegistration()`/`.register()` (real registration requires an
 * actual service worker install, which this suite never does). Must run via addInitScript, before
 * any app script runs. `subscriptionEndpoint` omitted means "no live local subscription"
 * (getSubscription() resolves null, subscribe() is never reached since requestPermission()
 * resolving anything but "granted" makes enablePush bail first) -- matching a browser that's denied
 * permission and had its subscription torn down too. */
async function mockPushEnvironment(page: Page, permission: NotificationPermission, subscriptionEndpoint?: string) {
	await page.addInitScript(
		([perm, endpoint]) => {
			if ("Notification" in window) {
				Object.defineProperty(window.Notification, "permission", { value: perm, configurable: true });
				window.Notification.requestPermission = async () => perm as NotificationPermission;
			}
			if ("serviceWorker" in navigator) {
				const subscription = endpoint ? { endpoint, toJSON: () => ({ endpoint, keys: { p256dh: "test-p256dh", auth: "test-auth" } }) } : null;
				// @ts-expect-error test-only stub, real type is far more involved than this suite needs
				navigator.serviceWorker.getRegistration = async () => ({
					pushManager: { getSubscription: async () => subscription },
				});
				// @ts-expect-error same as above -- enablePush's own registration path (register + subscribe),
				// distinct from getRegistration above which only the refresh()/disablePush cleanup paths use.
				navigator.serviceWorker.register = async () => ({
					pushManager: { subscribe: async () => subscription },
				});
			}
		},
		[permission, subscriptionEndpoint ?? null],
	);
}

async function waitForRequest(requests: CapturedRequest[], table: string, method: string): Promise<CapturedRequest> {
	await expect
		.poll(() => requests.some((r) => r.table === table && r.method === method), {
			message: `expected a ${method} to ${table} — click handlers are async and Playwright's .click() doesn't wait for them`,
		})
		.toBe(true);
	return requests.find((r) => r.table === table && r.method === method)!;
}

/** #264 review round 4: signInAndMockSupabase's generic handler fulfills every rest/v1 request
 * regardless of its Authorization header, which let an earlier "fix" here pass its own test while
 * 403ing in production (push_tokens is granted to authenticated/service_role only, no anon grant --
 * `supabase/migrations/20260818130000_grant_authenticated_table_access.sql:39-40` -- so once
 * auth.signOut() clears the session, any further supabase-js call falls back to the anon/publishable
 * key and Postgres denies it at the table-privilege level before RLS even runs). Checks that a
 * request actually carries the signed-in user's JWT (not the publishable key, not garbage) the same
 * way fakeSessionCookie() builds one -- decode the middle segment, compare `sub`. Race tests that
 * care whether a request would really have succeeded should gate their push_tokens handler on this
 * instead of fulfilling unconditionally. */
async function isAuthorizedAsUser(route: Route): Promise<boolean> {
	const header = await route.request().headerValue("authorization");
	if (!header?.startsWith("Bearer ")) return false;
	const parts = header.slice("Bearer ".length).split(".");
	if (parts.length !== 3) return false; // not JWT-shaped -- e.g. the raw publishable key fallback
	try {
		const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf-8"));
		return payload.sub === USER_ID;
	} catch {
		return false;
	}
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

	// Review nit on #75: sendPing() previously set pingSent = true unconditionally, without
	// checking the insert's result -- an RLS rejection (not actually friends any more, blocked,
	// etc.) still showed "Ping sent".
	test("a failed ping insert (RLS rejection) shows a failure state, not a false 'Ping sent'", async ({ page }) => {
		await signInAndMockSupabase(page, {
			profiles: profilesHandler({ notifications_enabled: false }, [{ user_id: FRIEND_ID, display_name: "Casey Friend" }]),
			friendships: (route) => route.fulfill({ json: [{ user_a: USER_ID < FRIEND_ID ? USER_ID : FRIEND_ID, user_b: USER_ID < FRIEND_ID ? FRIEND_ID : USER_ID, status: "accepted" }] }),
			food_sightings: (route) => route.fulfill({ json: [] }),
			pings: async (route) => {
				if (route.request().method() === "POST") {
					// Shape of a real PostgREST/RLS rejection: non-2xx status, PostgrestError-shaped body.
					return route.fulfill({
						status: 403,
						json: { code: "42501", message: 'new row violates row-level security policy for table "pings"', details: null, hint: null },
					});
				}
				return route.fulfill({ json: [] });
			},
		});

		await page.goto("/notifications");
		await expect(page.getByRole("heading", { name: "Ping a friend" })).toBeVisible({ timeout: 15_000 });

		await page.getByLabel("Friend").selectOption(FRIEND_ID);
		await page.getByRole("button", { name: "Send ping" }).click();

		await expect(page.getByRole("alert")).toBeVisible();
		await expect(page.getByText("Ping sent")).toHaveCount(0);
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

	// Review findings on #66's PR (#75), F1 + F2: the previous `refresh().then(() =>
	// saveFeedLastSeen(new Date().toISOString()))` stamped the device-local unread watermark
	// unconditionally -- including when refresh() early-returned with no session -- and
	// feedLastSeen.ts itself had no test that would fail if isUnread()'s ping branch were hardcoded
	// to `return true` or if the saveFeedLastSeen() call were deleted outright. These two tests
	// close both gaps.
	test("a seeded watermark suppresses the New badge on an older ping while a newer ping stays badged", async ({ page }) => {
		const older = new Date(Date.now() - 60_000).toISOString();
		const watermark = new Date(Date.now() - 30_000).toISOString();
		const newer = new Date().toISOString();

		// Seed the watermark before any app script runs, same technique as the session cookie below.
		// Key format (`${prefix}:${userId}`) must match feedLastSeen.ts.
		await page.addInitScript(
			([key, value]) => localStorage.setItem(key, value),
			[`udine-feed-last-seen:${USER_ID}`, watermark],
		);

		await signInAndMockSupabase(page, {
			profiles: profilesHandler({ notifications_enabled: true }, [{ user_id: FRIEND_ID, display_name: "Casey Friend" }]),
			friendships: (route) => route.fulfill({ json: [{ user_a: USER_ID < FRIEND_ID ? USER_ID : FRIEND_ID, user_b: USER_ID < FRIEND_ID ? FRIEND_ID : USER_ID, status: "accepted" }] }),
			food_sightings: (route) => route.fulfill({ json: [] }),
			pings: (route) =>
				route.fulfill({
					json: [
						{ id: "p-old", sender_id: FRIEND_ID, hall_tid: null, message: "old ping", created_at: older },
						{ id: "p-new", sender_id: FRIEND_ID, hall_tid: null, message: "new ping", created_at: newer },
					],
				}),
		});

		await page.goto("/notifications");
		const feed = page.getByRole("list", { name: "Activity feed" });
		const items = feed.getByRole("listitem");
		await expect(items).toHaveCount(2, { timeout: 15_000 }); // hydration proof

		// Newest first (sort order, unrelated to this test's point, but asserted so nth(0)/nth(1) below
		// are unambiguous).
		const newItem = items.nth(0);
		const oldItem = items.nth(1);
		await expect(newItem).toContainText("new ping");
		await expect(oldItem).toContainText("old ping");

		// The point: older-than-watermark ping is read, newer-than-watermark ping is unread.
		await expect(newItem.locator(".badge", { hasText: "New" })).toBeVisible();
		await expect(oldItem.locator(".badge", { hasText: "New" })).toHaveCount(0);

		// Also catches the other mutation the review proved green under the old suite: deleting the
		// saveFeedLastSeen() call outright. If that call were gone, the seeded watermark above would
		// still sit untouched at 30s-ago instead of advancing to the newest item's own created_at.
		await expect
			.poll(() => page.evaluate((k) => localStorage.getItem(k), `udine-feed-last-seen:${USER_ID}`))
			.toBe(newer);
	});

	// #185: refresh()'s permission-revoked cleanup fired on ANY non-"granted" permission, including
	// "default" -- the state of a browser that simply never asked for permission (e.g. a second
	// device/browser visiting this page for the first time). clearStoredPushTokens() had no way to
	// scope the delete to just the calling browser's own row, so this wiped out every OTHER browser's
	// still-live token too. This is the failure scenario from the issue: visit /notifications from a
	// never-asked browser, and a laptop's working push subscription silently dies.
	test("visiting from a second browser with permission \"default\" does not wipe other browsers' push tokens (#185)", async ({ page }) => {
		await mockPushEnvironment(page, "default");
		const requests = await signInAndMockSupabase(page, {
			profiles: profilesHandler({ notifications_enabled: true }),
			food_sightings: (route) => route.fulfill({ json: [] }),
			pings: (route) => route.fulfill({ json: [] }),
			friendships: (route) => route.fulfill({ json: [] }),
		});

		await page.goto("/notifications");
		await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible({ timeout: 15_000 }); // hydration proof

		// No visible signal distinguishes "the permission-check branch ran and decided not to delete"
		// from "it hasn't run yet" -- same situation as the signed-out watermark test below, so give
		// refresh()'s async branch a real beat to land before asserting its absence.
		await page.waitForTimeout(1000);

		expect(requests.some((r) => r.table === "push_tokens" && r.method === "DELETE")).toBe(false);
	});

	test("permission revoked to \"denied\" clears only this browser's own push_tokens row, not a blanket delete (#185)", async ({ page }) => {
		const ownEndpoint = "https://fcm.googleapis.com/fcm/send/OWN-DEVICE-ENDPOINT";
		await mockPushEnvironment(page, "denied", ownEndpoint);
		const requests = await signInAndMockSupabase(page, {
			profiles: profilesHandler({ notifications_enabled: true }),
			food_sightings: (route) => route.fulfill({ json: [] }),
			pings: (route) => route.fulfill({ json: [] }),
			friendships: (route) => route.fulfill({ json: [] }),
			push_tokens: (route) => route.fulfill({ json: [] }),
		});

		await page.goto("/notifications");
		await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible({ timeout: 15_000 }); // hydration proof

		const del = await waitForRequest(requests, "push_tokens", "DELETE");
		expect(del.url.searchParams.get("user_id")).toBe(`eq.${USER_ID}`);
		expect(del.url.searchParams.get("platform")).toBe("eq.web");
		// Scoped to exactly this browser's own token (the same JSON.stringify(subscription.toJSON())
		// shape enablePush() stores), not a blanket "every web token for this user" delete.
		const ownToken = JSON.stringify({ endpoint: ownEndpoint, keys: { p256dh: "test-p256dh", auth: "test-auth" } });
		expect(del.url.searchParams.get("token")).toBe(`eq.${ownToken}`);
	});

	// #263: enablePush used to `.upsert()` push_tokens directly -- now a shared device token can
	// already be owned by another user (push_tokens has a unique(platform, token) backstop), so a
	// raw upsert would 23505. It must go through register_push_token (a security definer RPC that
	// evicts any other owner's row first), the same coordination #264's reregisterPushToken self-heal
	// relies on. Mocked the same way #185's tests above mock push_tokens, keyed on the RPC's own
	// `rpc/<function>` REST path instead of a table name.
	test("turning notifications on registers the push token via register_push_token, not a raw push_tokens upsert (#263)", async ({ page }) => {
		const endpoint = "https://fcm.googleapis.com/fcm/send/NEW-DEVICE-ENDPOINT";
		await mockPushEnvironment(page, "granted", endpoint);
		const requests = await signInAndMockSupabase(page, {
			profiles: profilesHandler({ notifications_enabled: false }),
			food_sightings: (route) => route.fulfill({ json: [] }),
			pings: (route) => route.fulfill({ json: [] }),
			friendships: (route) => route.fulfill({ json: [] }),
			favorited_foods: (route) => route.fulfill({ json: [] }),
			"rpc/register_push_token": (route) => route.fulfill({ json: {} }),
		});

		await page.goto("/notifications");
		await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible({ timeout: 15_000 }); // hydration proof

		await page.locator("#notif-toggle").click();

		const rpcCall = await waitForRequest(requests, "rpc/register_push_token", "POST");
		expect(rpcCall.body).toEqual({ p_platform: "web", p_token: JSON.stringify({ endpoint, keys: { p256dh: "test-p256dh", auth: "test-auth" } }) });
		expect(requests.some((r) => r.table === "push_tokens")).toBe(false);
	});

	// #272 item B (mobile hunt round 4's cross-fix interaction, mirrored here): refresh()'s own
	// self-heal (re-upserting this browser's push_tokens row via register_push_token, above) can
	// still be in flight -- a real network round trip -- when the user flips the toggle off. Without
	// waiting for it first, disablePush()'s own push_tokens delete could land BEFORE the self-heal's
	// registration, so the self-heal's write lands afterward and resurrects the row this toggle-off
	// just turned off -- same shape as the "Sign out" race below (#264 review round 4), just for the
	// toggle instead of sign-out. Holds the self-heal's own register_push_token POST upstream, clicks
	// the toggle off while it's still pending, and asserts the delete doesn't fire until the self-heal
	// settles -- so the only possible final order is register, then delete.
	test("toggling notifications off while this self-heal's registration is in flight waits for it, then deletes -- not resurrected (#272)", async ({ page }) => {
		const ownEndpoint = "https://fcm.googleapis.com/fcm/send/OWN-DEVICE-ENDPOINT";
		await mockPushEnvironment(page, "granted", ownEndpoint);
		const order: string[] = [];
		const requests = await signInAndMockSupabase(page, {
			profiles: profilesHandler({ notifications_enabled: true }),
			food_sightings: (route) => route.fulfill({ json: [] }),
			pings: (route) => route.fulfill({ json: [] }),
			friendships: (route) => route.fulfill({ json: [] }),
			favorited_foods: (route) => route.fulfill({ json: [] }),
			"rpc/register_push_token": async (route) => {
				// Self-heal's own registration on mount -- held so the toggle-off click below lands
				// while it's still in flight, forcing the race instead of hoping to catch it by timing.
				order.push("register_push_token.start");
				await new Promise((resolve) => setTimeout(resolve, 1500));
				order.push("register_push_token.settle");
				await route.fulfill({ json: {} });
			},
			push_tokens: async (route) => {
				order.push(`push_tokens.${route.request().method()}`);
				await route.fulfill({ json: [] });
			},
		});

		await page.goto("/notifications");
		await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible({ timeout: 15_000 }); // hydration proof

		await expect.poll(() => order.includes("register_push_token.start")).toBe(true);
		await page.locator("#notif-toggle").click();

		// Give the click a beat -- if toggleNotifications() incorrectly raced ahead instead of
		// waiting for the self-heal, its own DELETE would already be recorded here, before the held
		// POST even settles.
		await page.waitForTimeout(300);
		expect(order.includes("push_tokens.DELETE")).toBe(false);

		await expect.poll(() => order.includes("push_tokens.DELETE"), { timeout: 15_000 }).toBe(true);

		const postStart = order.indexOf("register_push_token.start");
		const postSettle = order.indexOf("register_push_token.settle");
		const del = order.indexOf("push_tokens.DELETE");
		expect(postStart).toBeGreaterThanOrEqual(0);
		expect(postSettle).toBeGreaterThan(postStart);
		expect(del).toBeGreaterThan(postSettle);

		const deleteRequest = requests.find((r) => r.table === "push_tokens" && r.method === "DELETE")!;
		expect(deleteRequest.url.searchParams.get("user_id")).toBe(`eq.${USER_ID}`);
		expect(deleteRequest.url.searchParams.get("platform")).toBe("eq.web");
	});

	test("a signed-out visit does not stamp the feed-last-seen watermark", async ({ page }) => {
		await page.goto("/notifications");
		await expect(page.locator(".empty-state")).toBeVisible();

		// This branch renders identically whether or not onMount/hydration has run yet (nothing here
		// is session-gated content that would prove hydration, unlike other specs' star-click proof),
		// so give onMount's async refresh().then() a real beat to land before asserting its absence --
		// same idea as home-dashboard.spec.ts's post-hydration `waitForTimeout(500)`, just longer since
		// there's no separate hydration-proof step here to already have consumed that time.
		await page.waitForTimeout(1500);

		// Regression check for the finding above: refresh() early-returns with no session (nothing
		// rendered), so nothing should be written to localStorage at all.
		const keys = await page.evaluate(() => Object.keys(localStorage));
		expect(keys.some((k) => k.startsWith("udine-feed-last-seen"))).toBe(false);
	});
});

// #257: +layout.svelte's signOut() used to only call auth.signOut(), leaving this browser's
// push_tokens row registered under the signing-out user -- a shared device kept getting the
// previous user's favorited-food alerts. These cover the header's "Sign out" control (visible on
// any signed-in page, not just /notifications) rather than the toggle covered above.
test.describe("Sign out (#257)", () => {
	// Review finding 1 on the first version of this PR: signOut() deletes this browser's
	// push_tokens row but deliberately leaves notifications_enabled=true and the live
	// PushSubscription alone (see +layout.svelte's doc comment) -- pre-fix, that left the toggle
	// showing ON forever with no row behind it, dead until the user manually re-toggled. This
	// reproduces exactly that starting state (granted permission, live subscription, no DB row --
	// what a fresh push_tokens mock plus a post-sign-out revisit looks like) and proves refresh()
	// self-heals it on its own, without a toggle click.
	test("a granted browser with a live subscription but no push_tokens row self-heals it via register_push_token on load", async ({ page }) => {
		const ownEndpoint = "https://fcm.googleapis.com/fcm/send/OWN-DEVICE-ENDPOINT";
		await mockPushEnvironment(page, "granted", ownEndpoint);
		const requests = await signInAndMockSupabase(page, {
			profiles: profilesHandler({ notifications_enabled: true }),
			food_sightings: (route) => route.fulfill({ json: [] }),
			pings: (route) => route.fulfill({ json: [] }),
			friendships: (route) => route.fulfill({ json: [] }),
			"rpc/register_push_token": (route) => route.fulfill({ json: {} }),
		});

		await page.goto("/notifications");
		await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible({ timeout: 15_000 }); // hydration proof

		// #263: the self-heal goes through register_push_token now, not a raw push_tokens upsert --
		// same eviction reasoning as enablePush()'s own registration.
		const post = await waitForRequest(requests, "rpc/register_push_token", "POST");
		const ownToken = JSON.stringify({ endpoint: ownEndpoint, keys: { p256dh: "test-p256dh", auth: "test-auth" } });
		expect(post.body).toEqual({ p_platform: "web", p_token: ownToken });
		expect(requests.some((r) => r.table === "push_tokens")).toBe(false);
	});

	// #264 review round 4: the self-heal test above proved the row gets re-created, but its own
	// registration is a real network round trip -- if the user clicks "Sign out" while that call is
	// still in flight, signOut() must WAIT for it to finish before its own delete (not race it, and
	// not "fix" it afterward -- an earlier "compensating delete" attempt at this ran post-
	// auth.signOut() with no session and 403'd against the real push_tokens grant, reproduced by
	// keying this mock off the Authorization header instead of fulfilling every request
	// unconditionally). Holds the self-heal's own register_push_token POST upstream, clicks Sign out
	// while it's still pending, and asserts signOut() doesn't touch push_tokens at all until the
	// self-heal settles -- so the only possible final order is register, then delete, then
	// auth.signOut().
	//
	// #263: the self-heal's own write moved from a push_tokens upsert to the register_push_token RPC
	// (a raw upsert would 23505 against the new unique(platform, token) constraint once a token is
	// shared) -- the held/racing request below is keyed on the RPC's own `rpc/<function>` path;
	// push_tokens itself now only ever sees the sign-out DELETE in this flow.
	test("a sign-out that starts while this self-heal's registration is in flight waits for it, then deletes with a still-live session", async ({ page }) => {
		const ownEndpoint = "https://fcm.googleapis.com/fcm/send/OWN-DEVICE-ENDPOINT";
		await mockPushEnvironment(page, "granted", ownEndpoint);
		const order: string[] = [];
		const requests = await signInAndMockSupabase(page, {
			profiles: profilesHandler({ notifications_enabled: true }),
			food_sightings: (route) => route.fulfill({ json: [] }),
			pings: (route) => route.fulfill({ json: [] }),
			friendships: (route) => route.fulfill({ json: [] }),
			"rpc/register_push_token": async (route) => {
				// Matches production's actual grant instead of fulfilling regardless of credentials --
				// a request using the anon/publishable key (what supabase-js sends once auth.signOut()
				// has cleared the session) must 403 here too, or this mock can't catch a "fix" that
				// only works because the mock is more permissive than Postgres.
				if (!(await isAuthorizedAsUser(route))) {
					return route.fulfill({ status: 403, json: { code: "42501", message: "permission denied for function register_push_token" } });
				}
				// Self-heal's own registration -- held so a real Sign-out click lands while it's still in
				// flight, forcing the race instead of hoping to catch it by timing luck.
				order.push("register_push_token.start");
				await new Promise((resolve) => setTimeout(resolve, 1500));
				order.push("register_push_token.settle");
				await route.fulfill({ json: {} });
			},
			push_tokens: async (route) => {
				order.push(`push_tokens.${route.request().method()}`);
				await route.fulfill({ json: [] });
			},
		});
		await page.route("**/auth/v1/logout**", async (route) => {
			order.push("auth.logout");
			await route.fulfill({ json: {} });
		});

		await page.goto("/notifications");
		const signOutButton = page.getByRole("button", { name: "Sign out" });
		await expect(signOutButton).toBeVisible({ timeout: 15_000 }); // hydration proof

		await expect.poll(() => order.includes("register_push_token.start")).toBe(true);
		await signOutButton.click();

		// Give the click a beat -- if signOut() incorrectly raced ahead instead of waiting for the
		// self-heal, its own DELETE would already be recorded here, before the held POST even settles.
		await page.waitForTimeout(300);
		expect(order.includes("push_tokens.DELETE")).toBe(false);
		expect(order.includes("auth.logout")).toBe(false);

		await expect.poll(() => order.includes("auth.logout"), { timeout: 15_000 }).toBe(true);

		// Relative order, not an exact listing: signOut()'s own location.reload() (unstubbed here,
		// exercised for real) can mount a fresh page afterward that runs its own unrelated self-heal
		// -- irrelevant to what's under test, which is that this specific registration settles (still
		// on the live session, since signOut() waited for it) strictly before this specific delete,
		// which in turn runs strictly before the session is actually torn down.
		const postStart = order.indexOf("register_push_token.start");
		const postSettle = order.indexOf("register_push_token.settle");
		const del = order.indexOf("push_tokens.DELETE");
		const logout = order.indexOf("auth.logout");
		expect(postStart).toBeGreaterThanOrEqual(0);
		expect(postSettle).toBeGreaterThan(postStart);
		expect(del).toBeGreaterThan(postSettle);
		expect(logout).toBeGreaterThan(del);

		const deleteRequest = requests.find((r) => r.table === "push_tokens" && r.method === "DELETE")!;
		expect(deleteRequest.url.searchParams.get("user_id")).toBe(`eq.${USER_ID}`);
		expect(deleteRequest.url.searchParams.get("platform")).toBe("eq.web");
		const ownToken = JSON.stringify({ endpoint: ownEndpoint, keys: { p256dh: "test-p256dh", auth: "test-auth" } });
		expect(deleteRequest.url.searchParams.get("token")).toBe(`eq.${ownToken}`);
	});

	// #264 review round 3, finding 2: the granted-only guard on the self-heal above was untested --
	// dropping it left the whole suite green. The existing #185 "default" test has no live
	// subscription, so ownPushToken() returns undefined and no POST fires regardless of the guard;
	// a meaningful test needs a live subscription with permission NOT granted.
	test("a live subscription with permission not granted does not self-heal a push_tokens row", async ({ page }) => {
		const ownEndpoint = "https://fcm.googleapis.com/fcm/send/OWN-DEVICE-ENDPOINT";
		await mockPushEnvironment(page, "default", ownEndpoint);
		const requests = await signInAndMockSupabase(page, {
			profiles: profilesHandler({ notifications_enabled: true }),
			food_sightings: (route) => route.fulfill({ json: [] }),
			pings: (route) => route.fulfill({ json: [] }),
			friendships: (route) => route.fulfill({ json: [] }),
		});

		await page.goto("/notifications");
		await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible({ timeout: 15_000 }); // hydration proof
		await page.waitForTimeout(1000); // same beat given to the sibling #185 "default" test above

		expect(requests.some((r) => r.table === "push_tokens" || r.table === "rpc/register_push_token")).toBe(false);
	});

	test("clears this browser's own push_tokens row before ending the session", async ({ page }) => {
		const ownEndpoint = "https://fcm.googleapis.com/fcm/send/OWN-DEVICE-ENDPOINT";
		await mockPushEnvironment(page, "granted", ownEndpoint);
		// Order proof: signOut() awaits the push_tokens delete before calling auth.signOut(), and the
		// mocked network is fully sequential (no concurrency here), so recording each request's
		// arrival order is a reliable proxy for the awaited call order in the component.
		const order: string[] = [];
		const requests = await signInAndMockSupabase(page, {
			profiles: profilesHandler({ notifications_enabled: true }),
			food_sightings: (route) => route.fulfill({ json: [] }),
			pings: (route) => route.fulfill({ json: [] }),
			friendships: (route) => route.fulfill({ json: [] }),
			// #264 finding 1's refresh()-driven self-heal (test above) also runs on mount, before any
			// sign-out click, but its registration goes through rpc/register_push_token now (#263), not
			// this table -- only the sign-out DELETE is the call this test's ordering claim is about.
			push_tokens: async (route) => {
				if (route.request().method() === "DELETE") order.push("push_tokens.delete");
				await route.fulfill({ json: [] });
			},
		});
		// Registered after signInAndMockSupabase's generic **/auth/v1/** handler, so this one wins
		// for the logout call specifically (Playwright routes are last-registered-first).
		await page.route("**/auth/v1/logout**", async (route) => {
			order.push("auth.logout");
			await route.fulfill({ json: {} });
		});

		await page.goto("/notifications");
		const signOutButton = page.getByRole("button", { name: "Sign out" });
		await expect(signOutButton).toBeVisible({ timeout: 15_000 }); // hydration proof

		await signOutButton.click();

		const del = await waitForRequest(requests, "push_tokens", "DELETE");
		expect(del.url.searchParams.get("user_id")).toBe(`eq.${USER_ID}`);
		expect(del.url.searchParams.get("platform")).toBe("eq.web");
		// Scoped to this browser's own token, same shape as the #185 test above -- never a blanket
		// "every device" delete.
		const ownToken = JSON.stringify({ endpoint: ownEndpoint, keys: { p256dh: "test-p256dh", auth: "test-auth" } });
		expect(del.url.searchParams.get("token")).toBe(`eq.${ownToken}`);

		await expect.poll(() => order.includes("auth.logout")).toBe(true);
		expect(order).toEqual(["push_tokens.delete", "auth.logout"]);
	});

	// Review finding 4 on the first version of this PR: a mocked 500 on push_tokens never actually
	// exercises +layout.svelte's try/catch, because supabase-js doesn't throw on a non-2xx response
	// by default (same as clearStoredPushTokens's other caller, disablePush(), which never checks
	// `.error` either) -- that test stayed green even with the try/catch stripped out entirely, a
	// decoy. The real failure mode the try/catch guards is ownPushToken() itself throwing (e.g.
	// navigator.serviceWorker.getRegistration() rejecting) -- this reproduces that instead.
	test("a rejected push-subscription lookup still completes sign-out", async ({ page }) => {
		await page.addInitScript(() => {
			if ("serviceWorker" in navigator) {
				// @ts-expect-error test-only stub, real type is far more involved than this suite needs
				navigator.serviceWorker.getRegistration = async () => {
					throw new Error("getRegistration boom");
				};
			}
		});
		await signInAndMockSupabase(page, {
			profiles: profilesHandler({ notifications_enabled: true }),
			food_sightings: (route) => route.fulfill({ json: [] }),
			pings: (route) => route.fulfill({ json: [] }),
			friendships: (route) => route.fulfill({ json: [] }),
		});

		await page.goto("/notifications");
		const signOutButton = page.getByRole("button", { name: "Sign out" });
		await expect(signOutButton).toBeVisible({ timeout: 15_000 }); // hydration proof

		await signOutButton.click();

		// Sign-out still lands: the header flips back to the signed-out control (auth.signOut() +
		// location.reload() still ran) even though ownPushToken() threw.
		await expect(page.getByRole("button", { name: /Sign in/ })).toBeVisible({ timeout: 15_000 });
	});

	test("a browser never subscribed to push skips the delete entirely (no blanket delete)", async ({ page }) => {
		// No live subscription -- ownPushToken() resolves undefined, same as a browser that never
		// enabled alerts. signOut() must not fall back to a token-less delete (#185's blanket-delete
		// footgun), so no push_tokens request should fire at all.
		await mockPushEnvironment(page, "default");
		const requests = await signInAndMockSupabase(page, {
			profiles: profilesHandler({ notifications_enabled: false }),
			food_sightings: (route) => route.fulfill({ json: [] }),
			pings: (route) => route.fulfill({ json: [] }),
			friendships: (route) => route.fulfill({ json: [] }),
		});

		await page.goto("/notifications");
		const signOutButton = page.getByRole("button", { name: "Sign out" });
		await expect(signOutButton).toBeVisible({ timeout: 15_000 }); // hydration proof

		await signOutButton.click();

		await expect(page.getByRole("button", { name: /Sign in/ })).toBeVisible({ timeout: 15_000 });
		expect(requests.some((r) => r.table === "push_tokens" && r.method === "DELETE")).toBe(false);
	});
});
