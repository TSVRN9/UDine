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

// #150: pdf_link/external_link were passed straight through with no scheme check, unlike
// featured_image (sanitizeImageUrl). A javascript:/data: value in the feed would execute in the
// app origin on click (web renders both directly into <a href=…>).
test("event mapping strips a javascript: pdf_link and external_link", () => {
  const mapped = mapEvent({
    title: "x",
    featured_image: "",
    pdf_link: "javascript:alert(1)",
    external_link: "javascript:alert(document.cookie)",
    expiration_date: 0,
    is_featured: "0",
  });
  assert.equal(mapped.pdfLink, "");
  assert.equal(mapped.externalLink, "");
});

test("event mapping strips a data: pdf_link and external_link", () => {
  const mapped = mapEvent({
    title: "x",
    featured_image: "",
    pdf_link: "data:text/html,<script>alert(1)</script>",
    external_link: "data:text/html,<script>alert(1)</script>",
    expiration_date: 0,
    is_featured: "0",
  });
  assert.equal(mapped.pdfLink, "");
  assert.equal(mapped.externalLink, "");
});

// Guards against a hostname-only check (e.g. reusing sanitizeImageUrl as-is) being fooled by a
// javascript: URL that fakes an authority component, which gives it a parseable "hostname".
test("event mapping strips a javascript: URL disguised with a host", () => {
  const mapped = mapEvent({
    title: "x",
    featured_image: "",
    pdf_link: "javascript://umassdining.com/%0aalert(1)",
    external_link: "javascript://umassdining.com/%0aalert(1)",
    expiration_date: 0,
    is_featured: "0",
  });
  assert.equal(mapped.pdfLink, "");
  assert.equal(mapped.externalLink, "");
});

test("event mapping keeps valid http/https pdf_link and external_link", () => {
  const mapped = mapEvent({
    title: "x",
    featured_image: "",
    pdf_link: "http://umassdining.com/sites/default/files/events/poster.jpg",
    external_link: "https://umassdining.com/events/fall-fest",
    expiration_date: 0,
    is_featured: "0",
  });
  assert.equal(mapped.pdfLink, "http://umassdining.com/sites/default/files/events/poster.jpg");
  assert.equal(mapped.externalLink, "https://umassdining.com/events/fall-fest");
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

// #150 sibling sink, same file, same trust boundary: fetchPressReleases already sanitizes
// item.image (sanitizeImageUrl above) but passed item.url straight through -- and web renders it
// directly into <a href=…> (web/src/routes/press/+page.svelte).
test("fetchPressReleases strips a javascript: url", async () => {
  const result = await withFetch(
    async () =>
      ({
        ok: true,
        status: 200,
        json: async () => [
          {
            title: "Malicious release",
            url: "javascript:alert(document.cookie)",
            image: "",
            date: "2026-08-19",
          },
        ],
      }) as Response,
    fetchPressReleases,
  );
  assert.equal(result[0]?.url, "");
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

// #150 sibling sink: same trust boundary, and web renders `issue.link` directly into <a href=…>
// (web/src/routes/newsletter/+page.svelte). The "as-is" passthrough above still holds for a valid
// https link -- this only needs the scheme allowlist to kick in for a hostile one.
test("fetchNewsletter strips a javascript: link", async () => {
  const result = await withFetch(
    async () =>
      ({
        ok: true,
        status: 200,
        json: async () => [{ content: "", period: "February 2020", link: "javascript:alert(1)" }],
      }) as Response,
    fetchNewsletter,
  );
  assert.equal(result[0]?.link, "");
});

test("fetchNewsletter throws when the HTTP response is not ok", async () => {
  await assert.rejects(
    () => withFetch(async () => ({ ok: false, status: 500, json: async () => [] }) as Response, fetchNewsletter),
    /get_newsletter 500/,
  );
});
