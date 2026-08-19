import { test, expect, type Page, type Route } from "@playwright/test";

// Coverage for #39: styling on the friends/pings and notifications screens (src/routes/friends,
// src/routes/notifications). Both are gated on a signed-in session (see CLAUDE.md — friends, pings
// and profile are the only legitimately server-backed features), so this spec has two halves per
// page: a real, unmocked signed-out check (no session cookie at all — proves the sign-in prompt
// renders instead of crashing), and a signed-in check that mocks the Supabase session and REST
// responses so nothing here ever touches the live project.
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
	return ["sb-your-project-ref-auth-token", "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url")];
}

type CapturedRequest = { table: string; method: string; url: URL };

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
		requests.push({ table, method: route.request().method(), url });
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
	// friends/+page.svelte opens a realtime channel for the pings inbox -- page.route doesn't cover
	// WebSockets, so this closes the connection immediately instead of letting it hit the live
	// project's realtime endpoint.
	await page.routeWebSocket(/realtime/, (ws) => ws.close());

	return requests;
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
	test("shows a styled sign-in prompt instead of the notifications UI", async ({ page }) => {
		await page.goto("/notifications");

		await expect(page.getByRole("heading", { name: "Notifications", level: 1 })).toHaveClass(/page-title/);
		const prompt = page.locator(".empty-state");
		await expect(prompt).toBeVisible();
		await expect(prompt).toContainText("Sign in to enable favorited-food alerts.");
		await expect(page.getByRole("heading", { name: "Sightings" })).toHaveCount(0);
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
			pings: (route) => route.fulfill({ json: [] }),
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
		const patch = requests.find((r) => r.table === "friendships" && r.method === "PATCH");
		expect(patch, "Accept should PATCH the friendships row").toBeTruthy();
		expect(patch!.url.searchParams.get("user_a")).toBe(`eq.${friendships[0].user_a}`);
		expect(patch!.url.searchParams.get("user_b")).toBe(`eq.${friendships[0].user_b}`);
	});

	test("accepted friends get ping controls in a card, badged distinctly from requests", async ({ page }) => {
		const friendship = { user_a: USER_ID < FRIEND_ID ? USER_ID : FRIEND_ID, user_b: USER_ID < FRIEND_ID ? FRIEND_ID : USER_ID, status: "accepted", requested_by: FRIEND_ID };
		await signInAndMockSupabase(page, {
			friendships: (route) => route.fulfill({ json: [friendship] }),
			profiles: (route) => route.fulfill({ json: [{ user_id: FRIEND_ID, display_name: "Casey Friend" }] }),
			pings: (route) => route.fulfill({ json: [{ id: "ping-1", sender_id: FRIEND_ID, receiver_id: USER_ID, hall_tid: 3, message: "meet up?", created_at: new Date().toISOString() }] }),
		});

		await page.goto("/friends");
		await expect(page.getByRole("heading", { name: "Find friends" })).toBeVisible({ timeout: 15_000 });

		const friendRow = page.locator("li.card", { hasText: "Casey Friend" });
		await expect(friendRow.locator(".badge", { hasText: "Friend" })).toBeVisible();
		const pingButton = friendRow.getByRole("button", { name: /Ping/ });
		await expect(pingButton).toHaveClass(/btn-secondary/);

		const inboxEntry = page.locator("li", { hasText: "meet up?" });
		await expect(inboxEntry).toBeVisible();
		await expect(inboxEntry.locator(".badge")).toHaveText("Hampshire");
	});
});

test.describe("Notifications — signed in", () => {
	test("the alert toggle is visually clear and flips state with the right PATCH", async ({ page }) => {
		const requests = await signInAndMockSupabase(page, {
			profiles: (route) => route.fulfill({ json: { notifications_enabled: false } }),
			food_sightings: (route) => route.fulfill({ json: [] }),
			favorited_foods: (route) => route.fulfill({ json: [] }),
		});

		await page.goto("/notifications");

		const badge = page.locator(".badge");
		await expect(badge).toHaveText("Alerts off", { timeout: 15_000 }); // hydration proof: reflects the mocked profile fetch

		const toggle = page.getByRole("checkbox");
		await toggle.click();
		await expect(badge).toHaveText("Alerts on");

		const patch = requests.find((r) => r.table === "profiles" && r.method === "PATCH");
		expect(patch, "toggling should PATCH the profile row").toBeTruthy();
		expect(patch!.url.searchParams.get("user_id")).toBe(`eq.${USER_ID}`);
	});

	test("unread sightings are badged New, hall names are badged, both use the design tokens", async ({ page }) => {
		await signInAndMockSupabase(page, {
			profiles: (route) => route.fulfill({ json: { notifications_enabled: true } }),
			food_sightings: (route) =>
				route.fulfill({
					json: [
						{ id: "s1", dish_name: "French Toast", hall_tid: 3, sighted_date: "2026-08-19", read_at: null, created_at: new Date().toISOString() },
						{ id: "s2", dish_name: "Fried Plantain", hall_tid: 1, sighted_date: "2026-08-18", read_at: new Date().toISOString(), created_at: new Date().toISOString() },
					],
				}),
		});

		await page.goto("/notifications");
		await expect(page.getByRole("heading", { name: "Sightings" })).toBeVisible({ timeout: 15_000 });

		const unreadRow = page.locator("li", { hasText: "French Toast" });
		await expect(unreadRow.locator(".badge", { hasText: "New" })).toBeVisible();
		await expect(unreadRow.locator(".badge", { hasText: "Hampshire" })).toBeVisible();

		const readRow = page.locator("li", { hasText: "Fried Plantain" });
		await expect(readRow.locator(".badge", { hasText: "New" })).toHaveCount(0);
		await expect(readRow.locator(".badge", { hasText: "Worcester" })).toBeVisible();
	});
});
