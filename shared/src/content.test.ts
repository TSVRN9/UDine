import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchNewsletter, fetchPressReleases, mapEvent } from "./content.ts";

// See openFoodFacts.test.ts for the same withFetch pattern — swaps globalThis.fetch for a stub.
function withFetch<T>(impl: typeof fetch, fn: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  return fn().finally(() => {
    globalThis.fetch = original;
  });
}

// fetchEvents/fetchPressReleases are thin fetch+shape-mapping wrappers around endpoints
// confirmed live in docs/apk-reverse-engineering.md; the only non-trivial logic is mapEvent's
// unix-seconds -> ISO conversion and "0"/"1" -> boolean coercion, tested here against the real
// response shape captured during that verification pass rather than re-fetching over the network.

test("event mapping converts unix-seconds expiration and featured flag correctly", () => {
  // Real sample captured from GET /uapp/get_beacons_events, see docs/apk-reverse-engineering.md.
  const mapped = mapEvent({
    title: "Summer Hours",
    featured_image: "https://umassdining.com/sites/default/files/events/Summer%20Hours%20Banner_0.jpg",
    pdf_link: "https://umassdining.com/sites/default/files/events/Summer%202026%20Hours%20-%20Harvest%20Update.jpg",
    external_link: "",
    expiration_date: 1788148800,
    is_featured: "0",
  });
  assert.equal(mapped.expirationDate, new Date(1788148800 * 1000).toISOString());
  assert.equal(mapped.isFeatured, false);
});

test("event mapping treats is_featured '1' as true", () => {
  const mapped = mapEvent({ title: "x", featured_image: "", pdf_link: "", external_link: "", expiration_date: 0, is_featured: "1" });
  assert.equal(mapped.isFeatured, true);
});

// Real bug, real shape: GET /uapp/get_beacons_events and GET /uapp/get_press both return image
// URLs with a literal host of "default" (e.g. https://default/sites/default/files/press/images.png)
// -- present but unresolvable. Truthy, so `{#if image}` guards in web pass and render a visible
// broken-image glyph. Blank these at the source so every caller (web + mobile) gets a clean "no
// image" signal instead of a dead URL.
test("event mapping blanks a featured_image with an unresolvable 'default' host", () => {
  const mapped = mapEvent({
    title: "x",
    featured_image: "https://default/sites/default/files/events/banner.jpg",
    pdf_link: "",
    external_link: "",
    expiration_date: 0,
    is_featured: "0",
  });
  assert.equal(mapped.featuredImage, "");
});

test("fetchPressReleases blanks an image with an unresolvable 'default' host", async () => {
  const result = await withFetch(
    async () =>
      ({
        ok: true,
        status: 200,
        json: async () => [
          {
            title: "Real press release",
            url: "https://umassdining.com/press/real",
            image: "https://default/sites/default/files/press/images.png",
            date: "2026-08-19",
          },
        ],
      }) as Response,
    fetchPressReleases,
  );
  assert.equal(result[0]?.image, "");
});

// fetchNewsletter is a thin passthrough (field names already match NewsletterIssue), same as
// fetchPressReleases above — this just confirms the shape flows through untouched.
test("fetchNewsletter returns issues as-is, including entries with empty content", async () => {
  const result = await withFetch(
    async () =>
      ({
        ok: true,
        status: 200,
        json: async () => [{ content: "", period: "February 2020", link: "https://umassdining.us1.list-manage.com/track/click?u=abc&id=def" }],
      }) as Response,
    fetchNewsletter,
  );
  assert.deepEqual(result, [{ content: "", period: "February 2020", link: "https://umassdining.us1.list-manage.com/track/click?u=abc&id=def" }]);
});

test("fetchNewsletter throws when the HTTP response is not ok", async () => {
  await assert.rejects(
    () => withFetch(async () => ({ ok: false, status: 500, json: async () => [] }) as Response, fetchNewsletter),
    /get_newsletter 500/,
  );
});
