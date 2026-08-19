import { test, expect, type Page } from "@playwright/test";
import type { DiningEvent, NewsletterIssue, PressRelease } from "@udine/shared";

// Coverage for #41: press/events/newsletter styled with #35/#43's shared component classes
// (.card, .page-title, .empty-state, .badge, .label-rule), sharing one list/card pattern across
// all three. FAQ and Staff Directory were cut from the product entirely (#50/#51, see #41's
// 2026-08-19 scope comment) — not covered here, don't add them back.
//
// These are public, anonymous-first content screens (CLAUDE.md) — no session/auth setup anywhere
// in this file, on purpose.

// Same hydration pitfall shell.spec.ts documents: a click before SvelteKit's client router has
// attached falls through to a native full-page nav, which runs the target load server-side
// (invisible to page.route()) instead of client-side, so a mocked /api/* response would never be
// consumed. Copied verbatim from shell.spec.ts rather than imported -- it's a small page-local
// proof, not shared app logic.
async function disablePreload(page: Page) {
	await page.evaluate(() => document.body.setAttribute("data-sveltekit-preload-data", "off"));
}

async function proveHydrated(page: Page) {
	const star = page.getByRole("button", { name: "favorite" }).first();
	await expect(async () => {
		await star.click();
		await expect(star).toHaveText("★");
	}).toPass({ timeout: 15_000 });
}

// Press/events/newsletter all live behind the "Dining Info" disclosure (see +layout.svelte) --
// this drives a real client-side nav into one of them from a hydrated home page, the same
// technique shell.spec.ts uses, so a mocked /api/* route is guaranteed to be the one consumed.
async function gotoContentPage(page: Page, linkName: string) {
	await page.goto("/");
	await disablePreload(page);
	await proveHydrated(page);
	await page.locator("details summary").click();
	await page.getByRole("link", { name: linkName }).click();
}

const RELEASES: PressRelease[] = [
	{
		title: "UMass Dining Wins Statewide Award",
		url: "https://umassdining.com/press/award",
		image: "https://umassdining.com/sites/default/files/press/award.jpg",
		date: "2026-08-01",
	},
	{
		// No image -- must degrade gracefully instead of a broken <img>.
		title: "New Executive Chef Announced",
		url: "https://umassdining.com/press/chef",
		image: "",
		date: "2026-07-15",
	},
];

const EVENTS: DiningEvent[] = [
	{
		title: "Fall Kickoff BBQ",
		featuredImage: "https://umassdining.com/sites/default/files/events/bbq.jpg",
		pdfLink: "https://umassdining.com/sites/default/files/events/bbq.pdf",
		externalLink: "",
		expirationDate: "2026-09-01T00:00:00.000Z",
		isFeatured: true,
	},
	{
		// No featured image, no pdf link -- must degrade gracefully, only the external link shows.
		title: "Late Night Study Break",
		featuredImage: "",
		pdfLink: "",
		externalLink: "https://umassdining.com/events/study-break",
		expirationDate: "2026-09-05T00:00:00.000Z",
		isFeatured: false,
	},
];

const ISSUES: NewsletterIssue[] = [
	{ period: "August 2026", link: "https://umassdining.us1.list-manage.com/track/click?u=abc&id=aug26", content: "" },
	{ period: "July 2026", link: "https://umassdining.us1.list-manage.com/track/click?u=abc&id=jul26", content: "" },
];

test.describe("press", () => {
	test("releases render as cards sharing the site's list/card pattern, with graceful no-image fallback", async ({ page }) => {
		await page.route("**/api/press**", (route) => route.fulfill({ json: RELEASES }));
		await gotoContentPage(page, "Press");
		await expect(page).toHaveURL(/\/press$/);

		const heading = page.getByRole("heading", { name: "Press" });
		await expect(heading).toHaveClass(/page-title/);

		const cards = page.locator("main li.card");
		await expect(cards).toHaveCount(2);

		const withImage = cards.filter({ hasText: RELEASES[0].title });
		await expect(withImage.locator("img")).toHaveAttribute("src", RELEASES[0].image);
		await expect(withImage.locator("img")).toHaveAttribute("alt", "");
		const link1 = withImage.getByRole("link", { name: RELEASES[0].title });
		await expect(link1).toHaveAttribute("href", RELEASES[0].url);
		await expect(link1).toHaveAttribute("target", "_blank");
		await expect(withImage).toContainText(RELEASES[0].date);

		const withoutImage = cards.filter({ hasText: RELEASES[1].title });
		await expect(withoutImage.locator("img")).toHaveCount(0);
		await expect(withoutImage.getByRole("link", { name: RELEASES[1].title })).toHaveAttribute("href", RELEASES[1].url);
	});

	// Real bug, reviewer-verified against live data: GET /uapp/get_press returns image URLs with a
	// literal host of "default" (e.g. https://default/sites/default/files/press/images.png) for
	// every release -- present, so `{#if release.image}` alone doesn't catch it, but unresolvable,
	// so the browser renders a visible broken-image glyph inside the fixed h-16 box. Primary fix is
	// shared/src/content.ts's sanitizeImageUrl (see content.test.ts); this asserts the web app never
	// shows the broken box even if a bad URL reaches this page's data by some other path.
	test("a present but unresolvable image host renders no visible broken-image box", async ({ page }) => {
		const releaseWithBadImage: PressRelease = {
			title: "Bad Image Host Release",
			url: "https://umassdining.com/press/bad-image",
			image: "https://default/sites/default/files/press/images.png",
			date: "2026-08-19",
		};
		await page.route("**/api/press**", (route) => route.fulfill({ json: [releaseWithBadImage] }));
		await gotoContentPage(page, "Press");
		await expect(page).toHaveURL(/\/press$/);

		const card = page.locator("main li.card").filter({ hasText: releaseWithBadImage.title });
		await expect(card).toBeVisible();
		await expect(card.locator("img")).toHaveCount(0);
	});

	test("no releases shows the shared empty-state panel, not a bare paragraph", async ({ page }) => {
		await page.route("**/api/press**", (route) => route.fulfill({ json: [] }));
		await gotoContentPage(page, "Press");
		await expect(page).toHaveURL(/\/press$/);

		await expect(page.locator(".empty-state")).toBeVisible();
	});

	test("an upstream failure renders the shared error page, not a styled-but-broken press screen", async ({ page }) => {
		await page.route("**/api/press**", (route) => route.fulfill({ status: 502, body: "bad gateway" }));
		await gotoContentPage(page, "Press");

		await page.waitForURL(/\/press$/, { timeout: 15_000 });
		await expect(page.getByRole("heading", { name: /Couldn.t reach UMass Dining/ })).toBeVisible({ timeout: 15_000 });
		await expect(page.getByRole("link", { name: "Back to dining halls" })).toBeVisible();
	});
});

test.describe("events", () => {
	test("events render as cards with a featured badge and only the links that exist", async ({ page }) => {
		await page.route("**/api/events**", (route) => route.fulfill({ json: EVENTS }));
		await gotoContentPage(page, "Events");
		await expect(page).toHaveURL(/\/events$/);

		const heading = page.getByRole("heading", { name: "Events" });
		await expect(heading).toHaveClass(/page-title/);

		const cards = page.locator("main li.card");
		await expect(cards).toHaveCount(2);

		const featured = cards.filter({ hasText: EVENTS[0].title });
		await expect(featured.locator(".badge")).toHaveText(/Featured/i);
		await expect(featured.locator("img")).toHaveAttribute("src", EVENTS[0].featuredImage);
		await expect(featured.getByRole("link", { name: "Details" })).toHaveAttribute("href", EVENTS[0].pdfLink);
		await expect(featured.getByRole("link", { name: "More info" })).toHaveCount(0);

		const plain = cards.filter({ hasText: EVENTS[1].title });
		await expect(plain.locator(".badge")).toHaveCount(0);
		await expect(plain.locator("img")).toHaveCount(0);
		await expect(plain.getByRole("link", { name: "Details" })).toHaveCount(0);
		await expect(plain.getByRole("link", { name: "More info" })).toHaveAttribute("href", EVENTS[1].externalLink);
	});

	// Same reviewer-verified bug as press's equivalent test above -- GET /uapp/get_beacons_events
	// returns featured_image with the same unresolvable "default" host.
	test("a present but unresolvable image host renders no visible broken-image box", async ({ page }) => {
		const eventWithBadImage: DiningEvent = {
			title: "Bad Image Host Event",
			featuredImage: "https://default/sites/default/files/events/banner.jpg",
			pdfLink: "",
			externalLink: "",
			expirationDate: "2026-09-01T00:00:00.000Z",
			isFeatured: false,
		};
		await page.route("**/api/events**", (route) => route.fulfill({ json: [eventWithBadImage] }));
		await gotoContentPage(page, "Events");
		await expect(page).toHaveURL(/\/events$/);

		const card = page.locator("main li.card").filter({ hasText: eventWithBadImage.title });
		await expect(card).toBeVisible();
		await expect(card.locator("img")).toHaveCount(0);
	});

	test("no events shows the shared empty-state panel", async ({ page }) => {
		await page.route("**/api/events**", (route) => route.fulfill({ json: [] }));
		await gotoContentPage(page, "Events");
		await expect(page).toHaveURL(/\/events$/);

		await expect(page.locator(".empty-state")).toBeVisible();
	});

	test("an upstream failure renders the shared error page", async ({ page }) => {
		await page.route("**/api/events**", (route) => route.fulfill({ status: 502, body: "bad gateway" }));
		await gotoContentPage(page, "Events");

		await page.waitForURL(/\/events$/, { timeout: 15_000 });
		await expect(page.getByRole("heading", { name: /Couldn.t reach UMass Dining/ })).toBeVisible({ timeout: 15_000 });
		await expect(page.getByRole("link", { name: "Back to dining halls" })).toBeVisible();
	});
});

test.describe("newsletter", () => {
	test("issues render as cards linking out to the external archive", async ({ page }) => {
		await page.route("**/api/newsletter**", (route) => route.fulfill({ json: ISSUES }));
		await gotoContentPage(page, "Newsletter");
		await expect(page).toHaveURL(/\/newsletter$/);

		const heading = page.getByRole("heading", { name: "Newsletter" });
		await expect(heading).toHaveClass(/page-title/);

		const cards = page.locator("main li.card");
		await expect(cards).toHaveCount(2);

		const link1 = cards.getByRole("link", { name: ISSUES[0].period });
		await expect(link1).toHaveAttribute("href", ISSUES[0].link);
		await expect(link1).toHaveAttribute("target", "_blank");
	});

	test("no issues shows the shared empty-state panel", async ({ page }) => {
		await page.route("**/api/newsletter**", (route) => route.fulfill({ json: [] }));
		await gotoContentPage(page, "Newsletter");
		await expect(page).toHaveURL(/\/newsletter$/);

		await expect(page.locator(".empty-state")).toBeVisible();
	});

	test("an upstream failure renders the shared error page", async ({ page }) => {
		await page.route("**/api/newsletter**", (route) => route.fulfill({ status: 502, body: "bad gateway" }));
		await gotoContentPage(page, "Newsletter");

		await page.waitForURL(/\/newsletter$/, { timeout: 15_000 });
		await expect(page.getByRole("heading", { name: /Couldn.t reach UMass Dining/ })).toBeVisible({ timeout: 15_000 });
		await expect(page.getByRole("link", { name: "Back to dining halls" })).toBeVisible();
	});
});
