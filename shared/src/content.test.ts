import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchNewsletter, fetchPressReleases, htmlToText, mapEvent, parseRetailMenuHtml } from "./content.ts";

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

// --- #178: htmlToText / parseRetailMenuHtml (café-tap parity, *_menu trust boundary) -----------

test("htmlToText strips tags and decodes entities without collapsing block breaks", () => {
  assert.equal(htmlToText("<p>1 Campus Center Way<br/>Amherst, MA 01003</p>"), "1 Campus Center Way\nAmherst, MA 01003");
  assert.equal(htmlToText("<p>Turkey &amp; Bacon</p>"), "Turkey & Bacon");
});

test("htmlToText returns empty string for null/undefined/empty input", () => {
  assert.equal(htmlToText(null), "");
  assert.equal(htmlToText(undefined), "");
  assert.equal(htmlToText(""), "");
});

// Real capture, People's Organic Coffee breakfast_menu (hours.test.ts's REAL_PEOPLES_ORGANIC) --
// bare <p>Dish Name</p> runs, no embedded price. This is the actual live shape, not a synthetic one.
const REAL_PEOPLES_ORGANIC_BREAKFAST_MENU =
  "<p>Bacon Croissant</p><p>Veggie Croissant</p><p>Turkey &amp; Bacon</p><p>Breakfast Brioche</p><p>Quiche, Broccoli</p><p>Quiche, Ham</p><p>Antioxidant</p><p>Salad Strawberry Pecan</p>";

test("parseRetailMenuHtml parses a real name-only item list, decoding entities, with no price", () => {
  const parsed = parseRetailMenuHtml(REAL_PEOPLES_ORGANIC_BREAKFAST_MENU);
  assert.equal(parsed.kind, "items");
  if (parsed.kind !== "items") throw new Error("unreachable");
  assert.equal(parsed.items.length, 8);
  assert.deepEqual(parsed.items[0], { name: "Bacon Croissant", price: null });
  assert.deepEqual(parsed.items[2], { name: "Turkey & Bacon", price: null }); // entity-decoded
});

test("parseRetailMenuHtml splits a trailing '$X.XX' into name + price", () => {
  const parsed = parseRetailMenuHtml("<p>Espresso $3.00</p><p>Bagel</p>");
  assert.equal(parsed.kind, "items");
  if (parsed.kind !== "items") throw new Error("unreachable");
  assert.deepEqual(parsed.items[0], { name: "Espresso", price: "$3.00" });
  assert.deepEqual(parsed.items[1], { name: "Bagel", price: null });
});

// Real capture, babyBerk breakfast_menu (hours.test.ts's REAL_BABYBERK) -- a PDF link, not an item
// list.
const REAL_BABYBERK_BREAKFAST_MENU =
  '<p><a href="https://umassdining.com/sites/default/files/2025-08/Baby%20Berk%201%20FA25_compressed.pdf" target="_blank">Baby Berk Menu</a></p>';

test("parseRetailMenuHtml recognizes a real PDF-link menu and sanitizes its URL", () => {
  const parsed = parseRetailMenuHtml(REAL_BABYBERK_BREAKFAST_MENU);
  assert.deepEqual(parsed, {
    kind: "pdf",
    url: "https://umassdining.com/sites/default/files/2025-08/Baby%20Berk%201%20FA25_compressed.pdf",
    label: "Baby Berk Menu",
  });
});

// Same trust boundary sanitizeLinkUrl already covers (#150) -- a hostile href in a PDF-shaped link
// must never come back as a usable "pdf" url just because it ends in ".pdf". Falls through to the
// item-list path instead (the link's own tags and href are stripped along with everything else),
// same as any other unrecognized markup -- the malicious href is discarded, not surfaced.
test("parseRetailMenuHtml drops a javascript: PDF link instead of returning it as a pdf url", () => {
  const parsed = parseRetailMenuHtml('<p><a href="javascript:alert(1)//x.pdf">Menu</a></p>');
  assert.notEqual(parsed.kind, "pdf");
});

test("parseRetailMenuHtml returns empty for null, undefined, and empty-string input", () => {
  assert.deepEqual(parseRetailMenuHtml(null), { kind: "empty" });
  assert.deepEqual(parseRetailMenuHtml(undefined), { kind: "empty" });
  assert.deepEqual(parseRetailMenuHtml(""), { kind: "empty" });
});

test("parseRetailMenuHtml returns empty for HTML that strips down to nothing", () => {
  assert.deepEqual(parseRetailMenuHtml("<p></p><p>   </p>"), { kind: "empty" });
});
